// ai-reader (Nov 27 2026): TownTales' cheap AI helper, through OpenRouter.
//
// What it does
//   1. Reads pictures queued in public.ai_reads (shared photos, newspaper clippings, gravestone photos, pages of
//      whole-book uploads): copies the writing exactly, describes photos, and gives an English translation of
//      writing that isn't English (French writing is kept as written; nothing is translated into French).
//      Results are written back where a reviewer will see them before anything goes public:
//        photo           → added to the bottom of the pending upload's text (visitor uploads only)
//        clipping        → fills an empty transcription (status "transcribed" = shown with the AI label) + translation
//        memorial_photo  → fills an empty caption with the inscription, while the photo waits for review
//        book_page       → kept privately, page by page, for building books (books are usually under copyright)
//   2. Once a day drafts new paragraphs for each finished town book from history added since its last revision.
//      Nothing changes in the book until Travis presses Approve in #admin (then the revision number goes up).
//
// Calls (POST JSON):
//   {action:"run"}      no key needed (the 2-minute cron): works through waiting pictures. Does nothing when the queue is empty.
//   {action:"drafts"}   no key needed (the daily cron): drafts book updates for towns with new history (never the same item twice).
//   Admin (header x-admin-key = TOWNTALES_ADMIN_KEY):
//     status | list {kind?,status?,town?} | retry {id? | all:true} | read-now {id} | book-text {upload}
//     draft-list | draft-now {slug} | draft-approve {id, draft?, note?} | draft-reject {id, note?}
//
// Secrets: OPENROUTER_API_KEY (new). Optional: AI_READ_MODEL, AI_TEXT_MODEL, AI_MONTHLY_CAP_USD (default 15).
// Deploy with JWT verification off (the cron calls it without a token): supabase functions deploy ai-reader --no-verify-jwt
const SB = Deno.env.get("SUPABASE_URL")!;
const SK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OR_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
// OpenRouter's own Nov 2026 OCR test: Claude Haiku 5.5 read 253 of 264 values right for about $0.46 per 1,000 pages.
const READ_MODEL = Deno.env.get("AI_READ_MODEL") ?? "anthropic/claude-haiku-5.5";
const TEXT_MODEL = Deno.env.get("AI_TEXT_MODEL") ?? "anthropic/claude-haiku-5.5";
const CAP = Number(Deno.env.get("AI_MONTHLY_CAP_USD") ?? "15");
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, x-admin-key, authorization, apikey", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const H = { apikey: SK, Authorization: "Bearer " + SK, "Content-Type": "application/json" };
const rest = async (path: string, init: RequestInit = {}) => {
  const r = await fetch(SB + "/rest/v1/" + path, { ...init, headers: { ...H, ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`DB ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
};
const enc = encodeURIComponent;
const str = (v: unknown, n: number) => String(v ?? "").slice(0, n);
const nowIso = () => new Date().toISOString();

// ---------------------------------------------------------------- OpenRouter
type Ask = { text: string; cost: number; model: string };
async function ask(model: string, messages: unknown[], maxTokens: number): Promise<Ask> {
  if (!OR_KEY) throw new Error("OPENROUTER_API_KEY is not set yet");
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer " + OR_KEY, "Content-Type": "application/json", "HTTP-Referer": "https://www.towntales.ca", "X-Title": "TownTales" },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0, usage: { include: true } }),
  });
  if (!r.ok) throw new Error(`OpenRouter ${r.status}: ${(await r.text()).slice(0, 240)}`);
  const j = await r.json();
  const c = j.choices?.[0];
  if (!c) throw new Error("OpenRouter sent no answer" + (j.error ? ": " + str(j.error.message, 200) : ""));
  if (c.finish_reason === "length") throw new Error("The answer was cut off (too long)");
  const content = c.message?.content;
  const text = Array.isArray(content) ? content.map((x: any) => x.text ?? "").join("") : String(content ?? "");
  return { text, cost: Number(j.usage?.cost ?? 0) || 0, model: j.model ?? model };
}
function parseJson(t: string): any {
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("The AI didn't answer in the expected format");
  return JSON.parse(t.slice(a, b + 1));
}
async function spentThisMonth(): Promise<number> {
  const start = new Date(); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
  const s = enc(start.toISOString());
  const [a, b] = await Promise.all([
    rest(`ai_reads?select=cost_usd&done_at=gte.${s}&cost_usd=gt.0&limit=100000`),
    rest(`book_drafts?select=cost_usd&created_at=gte.${s}&limit=10000`),
  ]);
  return [...(a ?? []), ...(b ?? [])].reduce((n: number, x: any) => n + Number(x.cost_usd || 0), 0);
}

// ---------------------------------------------------------------- reading pictures
const RULES = `Rules for the writing:
- Copy every printed or handwritten word exactly as it appears (verbatim): keep the original spelling, punctuation, capitals and line breaks.
- Where a word can't be read, write [illegible]. Never guess, never fill gaps, never fix spelling.
- If there is no writing at all, "writing" is "".
- "lang" is the language of the writing as a two-letter code (en, fr, de, uk, pl, …); "" if there is no writing.
- "writing_en": the writing translated into English, faithfully, keeping [illegible] marks and names as written. If the writing is already in English, leave "writing_en" as "".
Reply with JSON only, no other text.`;
const PROMPTS: Record<string, string> = {
  photo: `You read old photographs for a small-town history archive in Canada.
Describe what the photo shows in one or two plain sentences (people, buildings, vehicles, signs, season), without guessing names, dates or places that aren't written on it. Write the description in English.
Then copy any writing on it: signs, captions, notes written on the photo or on its back, stamps.
${RULES}
JSON: {"description_en":"","writing":"","lang":"","writing_en":""}`,
  clipping: `You transcribe old newspaper clippings for a small-town history archive in Canada.
"headline" is the main headline if readable, else "". "paper" and "date" only if they are printed on the clipping itself, else "".
${RULES}
JSON: {"headline":"","paper":"","date":"","writing":"","lang":"","writing_en":""}`,
  memorial_photo: `You read gravestone and memorial photos for a small-town history archive in Canada.
Copy the whole inscription as "writing". Also list each person named on the stone in "names" with birth and death exactly as carved (or "" when not carved).
Describe the stone in one short English sentence (e.g. "Grey granite headstone with a carved cross").
${RULES}
JSON: {"names":[{"name":"","born":"","died":""}],"description_en":"","writing":"","lang":"","writing_en":""}`,
  book_page: `You transcribe one page of a local history book (photographed with a phone) so it can be digitized.
Copy all the text on the page in reading order. Keep headings on their own line. For a photo on the page, write [Photo: <its caption, copied exactly, or a few words if it has none>].
"page_number" is the printed page number if there is one, else "".
${RULES}
JSON: {"page_number":"","writing":"","lang":"","writing_en":""}`,
};

async function imageDataUrl(job: any): Promise<string> {
  let url = job.image_url as string | null;
  if (job.storage_path) {
    const path = String(job.storage_path).split("/").map(enc).join("/");
    const r = await fetch(`${SB}/storage/v1/object/sign/book-pages/${path}`, { method: "POST", headers: H, body: JSON.stringify({ expiresIn: 900 }) });
    if (!r.ok) throw new Error("Couldn't open the page file");
    url = SB + "/storage/v1" + (await r.json()).signedURL;
  }
  if (!url) throw new Error("No picture");
  const img = await fetch(url);
  if (!img.ok) throw new Error(`The picture wouldn't download (${img.status})`);
  const type = (img.headers.get("content-type") || "").split(";")[0].toLowerCase();
  const buf = new Uint8Array(await img.arrayBuffer());
  const mime = /^image\/(jpeg|png|webp|gif)$/.test(type) ? type : sniff(buf);
  if (!mime) throw new Error(type ? `SKIP: can't read ${type} files yet (JPG, PNG, WebP only)` : "SKIP: not a picture");
  if (buf.length > 15_000_000) throw new Error("SKIP: picture is too large (over 15 MB)");
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(s)}`;
}
function sniff(b: Uint8Array): string {
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50) return "image/png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45) return "image/webp";
  return "";
}

const clean = (v: unknown, n: number) => str(v, n).trim();
async function readOne(job: any) {
  const dataUrl = await imageDataUrl(job);
  const maxTokens = job.kind === "book_page" ? 9000 : 3000;
  const a = await ask(READ_MODEL, [
    { role: "system", content: PROMPTS[job.kind] },
    { role: "user", content: [{ type: "image_url", image_url: { url: dataUrl } }, { type: "text", text: "Read this picture." }] },
  ], maxTokens);
  const p = parseJson(a.text);
  const writing = clean(p.writing, 60000);
  const lang = writing ? clean(p.lang, 8).toLowerCase() || "en" : null;
  const res = {
    lang,
    text_original: writing || null,
    // The language the writing is already in gets the original words, not a re-translation.
    text_en: writing ? (lang === "en" ? writing : clean(p.writing_en, 60000) || null) : null,
    text_fr: writing && lang === "fr" ? writing : null, // French only when the writing itself is French; never translated into French
    description_en: clean(p.description_en, 1000) || null,
    description_fr: null,
    fields: {} as Record<string, unknown>,
    model: a.model,
    cost_usd: a.cost,
  };
  if (job.kind === "clipping") res.fields = { headline: clean(p.headline, 300), paper: clean(p.paper, 200), date: clean(p.date, 60) };
  if (job.kind === "memorial_photo") res.fields = { names: (Array.isArray(p.names) ? p.names : []).slice(0, 12).map((x: any) => ({ name: clean(x?.name, 200), born: clean(x?.born, 80), died: clean(x?.died, 80) })).filter((x: any) => x.name) };
  if (job.kind === "book_page") res.fields = { page_number: clean(p.page_number, 20) };
  return res;
}

// The other-language version, for showing under the original.
function translationLine(r: any): string {
  if (!r.text_original) return "";
  const parts: string[] = [];
  if (r.lang !== "en" && r.text_en) parts.push("English: " + r.text_en);
  return parts.join("\n");
}

async function applyResult(job: any, r: any): Promise<boolean> {
  if (job.kind === "photo") {
    const [it] = await rest(`items?id=eq.${enc(job.ref_id)}&select=id,status,origin,body`);
    if (!it || it.status !== "pending" || it.origin !== "community") return false; // only visitor uploads still in review
    const body = String(it.body || "");
    if (body.includes("[Read by AI")) return false;
    const lines = ["[Read by AI from the photo. Please check before approving.]"];
    if (r.description_en) lines.push("What it shows: " + r.description_en);
    if (r.text_original) lines.push("Writing on the photo: " + r.text_original);
    const tl = translationLine(r); if (tl) lines.push(tl);
    if (lines.length === 1) return false;
    const note = lines.join("\n");
    await rest(`items?id=eq.${enc(job.ref_id)}`, { method: "PATCH", body: JSON.stringify({ body: (body ? body + "\n\n" : "") + note.slice(0, Math.max(0, 9000 - body.length)) }) });
    return true;
  }
  if (job.kind === "clipping") {
    const [c] = await rest(`clippings?id=eq.${enc(job.ref_id)}&select=id,transcription,transcription_status,headline,paper_name,date_label,description,extracted_facts`);
    if (!c) return false;
    const patch: Record<string, unknown> = { extracted_facts: { ...(c.extracted_facts || {}), ai: { lang: r.lang, en: r.text_en, fr: r.text_fr, model: r.model } } };
    if (!c.transcription && r.text_original) {
      patch.transcription = r.text_original;
      if (c.transcription_status === "uploaded") patch.transcription_status = "transcribed";
    }
    if (!c.headline && r.fields.headline) patch.headline = r.fields.headline;
    if (!c.paper_name && r.fields.paper) patch.paper_name = r.fields.paper;
    if (!c.date_label && r.fields.date) patch.date_label = r.fields.date;
    const tl = translationLine(r);
    if (tl && !String(c.description || "").includes("Translation (AI)")) patch.description = ((c.description ? c.description + "\n\n" : "") + "Translation (AI):\n" + tl).slice(0, 2000);
    await rest(`clippings?id=eq.${enc(job.ref_id)}`, { method: "PATCH", body: JSON.stringify(patch) });
    return true;
  }
  if (job.kind === "memorial_photo") {
    const [m] = await rest(`memorial_photos?id=eq.${enc(job.ref_id)}&select=id,caption,status`);
    if (!m || m.status !== "pending" || m.caption || !r.text_original) return false;
    await rest(`memorial_photos?id=eq.${enc(job.ref_id)}`, { method: "PATCH", body: JSON.stringify({ caption: ("Inscription (read by AI, please check): " + r.text_original.replace(/\s*\n\s*/g, " / ")).slice(0, 500) }) });
    return true;
  }
  return false; // book pages stay private
}

async function claim(id?: string): Promise<any | null> {
  // A picture that just failed waits 10 minutes before its next try (started_at is stamped on every try).
  const ready = enc(new Date(Date.now() - 10 * 60_000).toISOString());
  const pick = id ? [{ id }] : await rest(`ai_reads?status=eq.queued&or=(started_at.is.null,started_at.lt.${ready})&select=id&order=created_at.asc&limit=1`);
  if (!pick?.length) return null;
  const rows = await rest(`ai_reads?id=eq.${pick[0].id}${id ? "" : "&status=eq.queued"}`, {
    method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ status: "running", started_at: nowIso() }),
  });
  if (!rows?.length) return id ? null : claim();
  const job = rows[0];
  await rest(`ai_reads?id=eq.${job.id}`, { method: "PATCH", body: JSON.stringify({ tries: (job.tries || 0) + 1 }) });
  return job;
}
async function processJob(job: any) {
  try {
    const r = await readOne(job);
    await rest(`ai_reads?id=eq.${job.id}`, { method: "PATCH", body: JSON.stringify({ ...r, status: "done", error: null, done_at: nowIso() }) });
    let applied = false;
    try { applied = await applyResult(job, r); } catch (e) { await rest(`ai_reads?id=eq.${job.id}`, { method: "PATCH", body: JSON.stringify({ error: "Read OK, but couldn't save it back: " + str((e as Error).message, 200) }) }); }
    if (applied) await rest(`ai_reads?id=eq.${job.id}`, { method: "PATCH", body: JSON.stringify({ applied: true }) });
    return { id: job.id, ok: true, applied };
  } catch (e) {
    const m = String((e as Error).message || e);
    const skip = m.startsWith("SKIP: ");
    const giveUp = skip || (job.tries || 0) + 1 >= 3 || /OPENROUTER_API_KEY/.test(m);
    await rest(`ai_reads?id=eq.${job.id}`, { method: "PATCH", body: JSON.stringify({ status: skip ? "skipped" : giveUp ? "failed" : "queued", error: str(m.replace(/^SKIP: /, ""), 300), done_at: giveUp ? nowIso() : null }) });
    return { id: job.id, ok: false, error: m };
  }
}
async function run(budgetMs = 110_000) {
  if (!OR_KEY) return { ok: false, paused: "OPENROUTER_API_KEY is not set yet" };
  const spent = await spentThisMonth();
  if (spent >= CAP) return { ok: false, paused: `Monthly limit reached ($${spent.toFixed(2)} of $${CAP})` };
  const t0 = Date.now(); const done: unknown[] = [];
  while (Date.now() - t0 < budgetMs) {
    const job = await claim(); if (!job) break;
    done.push(await processJob(job));
  }
  return { ok: true, processed: done.length, results: done };
}

// ---------------------------------------------------------------- book update drafts
async function snapshotOf(slug: string) {
  const s = enc(slug);
  const count = async (p: string) => {
    const r = await fetch(SB + "/rest/v1/" + p, { method: "HEAD", headers: { ...H, Prefer: "count=exact" } });
    const m = /\/(\d+)$/.exec(r.headers.get("content-range") || ""); return m ? Number(m[1]) : 0;
  };
  const [timeline, items, people] = await Promise.all([count(`timeline?town=eq.${s}&select=id`), count(`items?town=eq.${s}&status=eq.published&select=id`), count(`memorials?town=eq.${s}&status=eq.published&select=id`)]);
  return { timeline, items, people, at: nowIso() };
}
// The TownTales book rules (book-source/BOOK-RULES.md), the parts that apply to writing a revision.
const DRAFT_SYSTEM = `You help keep a printed small-town history book up to date. You are given the town, and new archive entries added to its TownTales page since the book was last revised.
Write the additions for the book's next revision, following the TownTales book rules:
TRUTH
- Use ONLY the facts given. Never invent names, dates, numbers, quotes, feelings or causes. If we don't know, say less.
- End every paragraph with its source in brackets, e.g. (Source: Wapella Post, 1924).
- Entries of kind "story" or marked community memory are memories: say so ("as remembered by …", "according to family memory"). Records can be stated as fact.
- When entries disagree, give both versions with their sources. Hedge shaky dates ("about 1910", "by 1910", "reportedly").
- Some entries include text read from a photo by AI; it may be imperfect, so use only clear facts from it.
PEOPLE
- Living people: history only. Nothing private (addresses, health, money, divorces, crimes). No gossip.
- Full name on first mention; women by their full names, with maiden names when given. Spell names exactly as in the entry.
- Today's respectful terms in our own words; old terms only inside a quotation.
WRITING
- Plain, warm prose for readers who are often 70+: short sentences, everyday words, about grade 8. Canadian spelling.
- Concrete details (names, prices, dates, streets) instead of general praise.
- Never use: nestled, rich tapestry, stood the test of time, hustle and bustle, a testament to, bustling, vibrant.
- Past tense for history. One topic per paragraph.
- Put each addition under the book chapter it belongs in, as a "## " heading using one of these names:
  "The land and its first peoples", "Arrival", "Building the town", "Faith and learning", "Hard years", "Town life", "Changing times", "The town today".
  Inside a chapter, keep entries in date order.
- Never copy a long passage word for word from an entry that quotes a book or newspaper; retell it in your own words (a short quote of a sentence or two is fine, credited).
- Skip entries that only repeat another, or have nothing a reader would want in a book, and list them in "skipped".
- If new names were added to the Roll of Remembrance, finish with "## Roll of Remembrance" and one short paragraph saying how many (no list).
- "summary" becomes the "About this edition" line: one plain sentence saying what's new.
Reply with JSON only: {"summary":"","draft":"Markdown","skipped":["entry title — why"]}`;

async function draftFor(book: any, town: any) {
  const since = book.revised_at || book.ready_at;
  const s = enc(book.slug);
  const prior = await rest(`book_drafts?town=eq.${s}&status=neq.rejected&select=item_ids`) as any[];
  const rejected = await rest(`book_drafts?town=eq.${s}&status=eq.rejected&select=item_ids`) as any[];
  const seen = new Set<string>([...prior, ...rejected].flatMap((d) => d.item_ids || []));
  const fresh = ((await rest(`items?town=eq.${s}&status=eq.published&created_at=gt.${enc(since)}&select=id,kind,title,body,date_label,year,source,source_url,contributor&order=year.asc.nullslast&limit=200`)) as any[])
    .filter((i) => !seen.has(i.id)).slice(0, 40);
  const people = await (async () => {
    const r = await fetch(`${SB}/rest/v1/memorials?town=eq.${s}&status=eq.published&created_at=gt.${enc(since)}&select=id`, { method: "HEAD", headers: { ...H, Prefer: "count=exact" } });
    const m = /\/(\d+)$/.exec(r.headers.get("content-range") || ""); return m ? Number(m[1]) : 0;
  })().catch(() => 0);
  const lastDraft = (await rest(`book_drafts?town=eq.${s}&select=memorial_count,created_at&order=created_at.desc&limit=1`) as any[])[0];
  const newPeople = lastDraft && lastDraft.created_at > since ? Math.max(0, people - (lastDraft.memorial_count || 0)) : people;
  if (!fresh.length && !newPeople) return { slug: book.slug, skipped: "nothing new" };
  // AI-read writing for photos among the new items
  const ids = fresh.filter((i) => i.kind === "photo").map((i) => i.id);
  const reads = ids.length ? await rest(`ai_reads?kind=eq.photo&status=eq.done&ref_id=in.(${ids.join(",")})&select=ref_id,description_en,text_en,text_original`) as any[] : [];
  const readBy = Object.fromEntries(reads.map((r) => [r.ref_id, r]));
  const entries = fresh.map((i) => ({
    title: i.title, kind: i.kind, date: i.date_label || i.year || "", source: i.source || i.contributor || "",
    text: str(String(i.body || "").replace(/\[Read by AI[\s\S]*$/, "").trim(), 1500),
    photo_read_by_ai: readBy[i.id] ? { shows: readBy[i.id].description_en, writing: readBy[i.id].text_en || readBy[i.id].text_original } : undefined,
  }));
  const a = await ask(TEXT_MODEL, [
    { role: "system", content: DRAFT_SYSTEM },
    { role: "user", content: JSON.stringify({ town: `${town.name}, ${town.prov}`, book: book.title || `${town.name} history`, current_revision: book.revision || 1, new_roll_names: newPeople, new_entries: entries }) },
  ], 8000);
  const p = parseJson(a.text);
  const draft = str(p.draft, 60000).trim();
  if (!draft) throw new Error("The AI returned an empty draft");
  const skipped = (Array.isArray(p.skipped) ? p.skipped : []).map((x: unknown) => "- " + str(x, 300)).join("\n");
  const [row] = await rest("book_drafts", {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ town: book.slug, base_revision: book.revision || 1, item_ids: fresh.map((i) => i.id), memorial_count: people,
      draft: draft + (skipped ? "\n\n---\nLeft out by the AI (check if any should go in):\n" + skipped : ""),
      summary: str(p.summary, 300) || `${fresh.length} new entries`, model: a.model, cost_usd: a.cost }),
  });
  return { slug: book.slug, id: row?.id, entries: fresh.length, people: newPeople };
}
async function drafts(only?: string) {
  if (!OR_KEY) return { ok: false, paused: "OPENROUTER_API_KEY is not set yet" };
  const spent = await spentThisMonth();
  if (spent >= CAP) return { ok: false, paused: `Monthly limit reached ($${spent.toFixed(2)} of $${CAP})` };
  const books = await rest(`town_books?select=slug,title,revision,revised_at,ready_at${only ? "&slug=eq." + enc(only) : ""}`) as any[];
  const out: unknown[] = [];
  for (const b of books) {
    const [t] = await rest(`towns?slug=eq.${enc(b.slug)}&select=name,prov`);
    if (!t) continue;
    try { out.push(await draftFor(b, t)); } catch (e) { out.push({ slug: b.slug, error: str((e as Error).message, 300) }); }
  }
  return { ok: true, books: out };
}

// ---------------------------------------------------------------- admin
async function admin(action: string, b: any) {
  if (action === "status") {
    const rows = await rest("ai_reads?select=kind,status&limit=100000") as any[];
    const counts: Record<string, Record<string, number>> = {};
    for (const r of rows) { counts[r.kind] ??= {}; counts[r.kind][r.status] = (counts[r.kind][r.status] || 0) + 1; }
    const pendingDrafts = (await rest("book_drafts?status=eq.pending&select=id") as any[]).length;
    return { counts, spent: await spentThisMonth(), cap: CAP, key: !!OR_KEY, read_model: READ_MODEL, text_model: TEXT_MODEL, pending_drafts: pendingDrafts };
  }
  if (action === "list") {
    let q = "ai_reads?select=id,kind,ref_id,town,status,error,lang,text_original,text_en,text_fr,description_en,description_fr,fields,applied,cost_usd,created_at,done_at&order=created_at.desc&limit=60";
    if (b.kind) q += "&kind=eq." + enc(str(b.kind, 20));
    if (b.status) q += "&status=eq." + enc(str(b.status, 20));
    if (b.town) q += "&town=eq." + enc(str(b.town, 80));
    return { rows: await rest(q) };
  }
  if (action === "retry") {
    const filter = b.all ? "status=in.(failed,skipped)" : "id=eq." + enc(str(b.id, 60));
    const rows = await rest(`ai_reads?${filter}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ status: "queued", tries: 0, error: null, started_at: null }) });
    return { ok: true, queued: rows?.length || 0 };
  }
  if (action === "read-now") {
    const job = await claim(str(b.id, 60));
    if (!job) return { error: "Not found" };
    return await processJob(job);
  }
  if (action === "book-text") {
    const up = str(b.upload, 60);
    if (!/^[0-9a-f-]{36}$/.test(up)) return { error: "Bad upload id" };
    const rows = await rest(`ai_reads?kind=eq.book_page&ref_id=like.${enc(up + "/*")}&select=ref_id,status,text_original,fields,error&order=ref_id.asc&limit=3000`) as any[];
    const text = rows.map((r) => `===== ${r.ref_id.split("/").pop()}${r.fields?.page_number ? " (page " + r.fields.page_number + ")" : ""} =====\n` +
      (r.status === "done" ? (r.text_original || "[no text on this page]") : `[${r.status}${r.error ? ": " + r.error : ""}]`)).join("\n\n");
    return { pages: rows.length, done: rows.filter((r) => r.status === "done").length, text };
  }
  if (action === "draft-list") {
    return { drafts: await rest("book_drafts?select=id,town,base_revision,summary,draft,status,admin_note,item_ids,cost_usd,created_at,decided_at&order=created_at.desc&limit=40") };
  }
  if (action === "draft-now") return await drafts(str(b.slug, 80).toLowerCase() || undefined);
  if (action === "draft-approve" || action === "draft-reject") {
    const id = str(b.id, 60);
    const [d] = await rest(`book_drafts?id=eq.${enc(id)}&select=*`);
    if (!d) return { error: "Draft not found" };
    if (d.status !== "pending") return { error: "This draft was already " + d.status };
    if (action === "draft-reject") {
      await rest(`book_drafts?id=eq.${enc(id)}`, { method: "PATCH", body: JSON.stringify({ status: "rejected", decided_at: nowIso(), admin_note: b.note ? str(b.note, 500) : null }) });
      return { ok: true, status: "rejected" };
    }
    const [book] = await rest(`town_books?slug=eq.${enc(d.town)}&select=revision`);
    if (!book) return { error: "This town's book isn't marked ready" };
    const rev = (book.revision || 1) + 1;
    await rest(`book_drafts?id=eq.${enc(id)}`, { method: "PATCH", body: JSON.stringify({ status: "approved", decided_at: nowIso(), admin_note: b.note ? str(b.note, 500) : null, ...(typeof b.draft === "string" && b.draft.trim() ? { draft: str(b.draft, 60000) } : {}) }) });
    await rest(`town_books?slug=eq.${enc(d.town)}`, { method: "PATCH", body: JSON.stringify({ revision: rev, revised_at: nowIso(), snapshot: await snapshotOf(d.town), revision_note: str(d.summary || "Updated with new history", 300) }) });
    return { ok: true, status: "approved", revision: rev };
  }
  return { error: "Unknown action" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  let b: any = {};
  try { b = await req.json(); } catch { /* empty */ }
  const action = String(b.action || "");
  try {
    if (action === "run") return json(await run());
    if (action === "drafts") return json(await drafts());
    const ak = Deno.env.get("TOWNTALES_ADMIN_KEY");
    if (!ak || req.headers.get("x-admin-key") !== ak) return json({ error: "Bad admin key" }, 401);
    const out: any = await admin(action, b);
    return json(out, out && out.error ? 400 : 200);
  } catch (e) {
    return json({ error: str((e as Error).message || e, 300) }, 500);
  }
});
