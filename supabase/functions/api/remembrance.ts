// Admin actions for Cemetery & Remembrance and newspaper clippings (all require x-admin-key; checked in index.ts).
//   rem-queue      → pending family submissions, with the submitter's private details
//   rem-moderate   → publish (optionally edited, as Community Memory or Verified) or decline one
//   clip-queue     → clippings still moving through uploaded → transcribed → checked → published
//   clip-moderate  → edit a clipping, approve/decline it, move its transcription stage
//   clip-item      → approve or decline a clipping's suggested timeline entry (approve = new published archive item + rebuild)
// deno-lint-ignore-file no-explicit-any

type Ctx = { db: any; json: (b: unknown, s?: number) => Response; queueRebuild: (town: string) => void };

const str = (v: unknown, max = 20000) => (v == null ? "" : String(v)).slice(0, max);
const httpUrl = (u: unknown) => (/^https?:\/\//i.test(String(u ?? "")) ? str(u, 2000) : "");
const yearOf = (s: unknown) => { const m = String(s ?? "").match(/\b(1[6-9]\d\d|20\d\d)\b/); return m ? +m[1] : null; };
const opt = (v: unknown, max: number) => { const s = str(v, max).trim(); return s ? s : null; };

const MEM_FIELDS: Record<string, number> = {
  name: 200, maiden_name: 200, birth_date_label: 60, birth_place: 200, death_date_label: 60, death_place: 200,
  note: 1500, source: 600, source_url: 2000,
};
const CLIP_STAGES = ["uploaded", "transcribed", "checked", "published"];
const CLIP_MOD = ["pending", "approved", "declined"];

export async function remQueue({ db, json }: Ctx) {
  const { data, error } = await db.from("memorials")
    .select("*, submission:memorial_submissions(submitter_name,submitter_email,relationship,attestation)")
    .eq("status", "pending").order("created_at").limit(200);
  return error ? json({ error: error.message }, 500) : json({ memorials: data });
}

export async function remModerate({ db, json }: Ctx, body: any) {
  const id = str(body.id, 200);
  if (!id) return json({ error: "id required" }, 400);
  if (body.status === "declined") {
    const { error } = await db.from("memorials").update({ status: "declined" }).eq("id", id);
    return error ? json({ error: error.message }, 500) : json({ ok: true });
  }
  if (body.status !== "published") return json({ error: "status must be published or declined" }, 400);
  const patch: any = { status: "published", tier: body.tier === "documented" ? "documented" : "community" };
  for (const [k, max] of Object.entries(MEM_FIELDS)) {
    if (body.patch && k in body.patch) patch[k] = k === "source_url" ? (httpUrl(body.patch[k]) || null) : opt(body.patch[k], max);
  }
  if ("name" in patch && !patch.name) return json({ error: "Name can't be empty." }, 400);
  if ("source" in patch && !patch.source) return json({ error: "No source, no publish: fill in the source." }, 400);
  const { error } = await db.from("memorials").update(patch).eq("id", id);
  return error ? json({ error: error.message }, 500) : json({ ok: true });
}

export async function clipQueue({ db, json }: Ctx, body: any = {}) {
  let q = db.from("clippings")
    .select("*, contact:clipping_contacts(submitter_email)")
    .neq("moderation", "declined");
  // all = also the clippings already approved (so one can still be put on the timeline)
  if (!body?.all) q = q.or("moderation.eq.pending,transcription_status.neq.published,proposed_item_status.eq.pending");
  const { data, error } = await q.order("created_at").limit(200);
  if (error) return json({ error: error.message }, 500);
  const rows = (data ?? []).map((c: any) => {
    const contact = Array.isArray(c.contact) ? c.contact[0] : c.contact;
    const { contact: _x, ...rest } = c;
    return { ...rest, submitter_email: contact?.submitter_email ?? "" };
  });
  return json({ clippings: rows });
}

export async function clipModerate({ db, json }: Ctx, body: any) {
  const id = str(body.id, 60);
  if (!id) return json({ error: "id required" }, 400);
  const p = body.patch ?? {};
  const { data: cur, error: e1 } = await db.from("clippings").select("*").eq("id", id).single();
  if (e1 || !cur) return json({ error: e1?.message ?? "Not found" }, 404);
  const patch: any = {};
  if ("paper_name" in p) patch.paper_name = opt(p.paper_name, 200);
  if ("date_label" in p) patch.date_label = opt(p.date_label, 60);
  if ("headline" in p) patch.headline = opt(p.headline, 300);
  if ("description" in p) patch.description = opt(p.description, 2000);
  if ("transcription" in p) patch.transcription = opt(p.transcription, 60000);
  if ("moderation" in p) { if (!CLIP_MOD.includes(p.moderation)) return json({ error: "bad moderation" }, 400); patch.moderation = p.moderation; }
  if ("transcription_status" in p) { if (!CLIP_STAGES.includes(p.transcription_status)) return json({ error: "bad transcription_status" }, 400); patch.transcription_status = p.transcription_status; }
  const next = { ...cur, ...patch };
  if (next.transcription_status !== "uploaded" && !next.transcription) return json({ error: "Add the transcription before moving past 'uploaded'." }, 400);
  if (next.transcription_status === "published" && next.moderation !== "approved") return json({ error: "Approve the clipping before publishing it." }, 400);
  if (cur.proposed_item && cur.proposed_item_status === "none") patch.proposed_item_status = "pending";
  const { data, error } = await db.from("clippings").update(patch).eq("id", id).select("id,moderation,transcription_status").single();
  return error ? json({ error: error.message }, 500) : json({ ok: true, clipping: data });
}

export async function clipItem({ db, json, queueRebuild }: Ctx, body: any) {
  const id = str(body.id, 60);
  const { data: c, error: e1 } = await db.from("clippings").select("*").eq("id", id).single();
  if (e1 || !c) return json({ error: e1?.message ?? "Not found" }, 404);
  if (!c.proposed_item) return json({ error: "This clipping has no suggested entry." }, 400);
  if (body.decision === "decline") {
    await db.from("clippings").update({ proposed_item_status: "declined" }).eq("id", id);
    return json({ ok: true });
  }
  if (body.decision !== "approve") return json({ error: "decision must be approve or decline" }, 400);
  if (c.moderation !== "approved") return json({ error: "Approve the clipping itself first." }, 400);
  const pi = c.proposed_item ?? {};
  const source = str(pi.source, 500).trim() ||
    [c.paper_name, c.date_label].filter(Boolean).join(", ") || "";
  if (!source) return json({ error: "No source, no publish: the suggested entry needs a source (newspaper name or date)." }, 400);
  const title = str(pi.title, 300).trim();
  if (!title) return json({ error: "The suggested entry has no title." }, 400);
  const row = {
    town: c.town, kind: "document", title,
    body: str(pi.body || c.transcription, 20000),
    year: Number.isInteger(pi.year) ? pi.year : yearOf(pi.date_label || c.date_label),
    date_label: str(pi.date_label || c.date_label, 60), image_url: c.image_url,
    source: "Newspaper clipping: " + source, source_url: httpUrl(pi.source_url),
    contributor: str(c.submitter_name || "Anonymous", 120), origin: "community",
    external_id: "clip:" + c.id, status: "published",
  };
  const { data, error } = await db.from("items").upsert(row, { onConflict: "town,external_id" }).select("id").single();
  if (error) return json({ error: error.message }, 500);
  await db.from("clippings").update({ proposed_item_status: "approved" }).eq("id", id);
  queueRebuild(c.town);
  return json({ ok: true, item_id: data.id });
}

// ---------------------------------------------------------------------------------------------
// Added Nov 26 2026 (all admin):
//   clip-transcribe → read the clipping image with Claude and RETURN a draft (verbatim, [illegible] marks).
//                     Nothing is saved: the reviewer checks the fields, then presses Save.
//   clip-decide     → approve (archive only) | approve + add to timeline (reviewer-edited entry, linked
//                     back to the clipping, pinned so a rebuild keeps it) | reject
//   rem-move        → a non-person submission filed under Remembrance moves to the Archive review queue
// ---------------------------------------------------------------------------------------------
const MODEL = Deno.env.get("TRANSCRIBE_MODEL") ?? Deno.env.get("TIMELINE_MODEL") ?? "claude-sonnet-5-5";

const TRANSCRIBE_SYSTEM = `You transcribe old newspaper clippings for a local-history archive.
Rules:
- Copy the printed words exactly as they appear (verbatim). Keep the original spelling, punctuation and paragraph breaks.
- Where a word cannot be read, write [illegible]. Never guess or fill gaps.
- Do not summarise, correct or add anything.
- "headline" is the clipping's main headline if one is readable, else "".
- "paper" and "date" only if they are printed on the clipping itself, else "".
- If there is no readable text at all, return an empty transcription.
Reply with JSON only: {"headline":"","paper":"","date":"","transcription":""}`;

export async function clipTranscribe({ db, json }: Ctx, body: any) {
  const id = str(body.id, 60);
  const { data: c, error } = await db.from("clippings").select("id,image_url").eq("id", id).single();
  if (error || !c) return json({ error: error?.message ?? "Not found" }, 404);
  if (!httpUrl(c.image_url)) return json({ ok: false, note: "Couldn't read this image (no image on this clipping)." });
  let img: Response;
  try { img = await fetch(c.image_url); } catch { return json({ ok: false, note: "Couldn't read this image (it wouldn't download)." }); }
  if (!img.ok) return json({ ok: false, note: "Couldn't read this image (it wouldn't download)." });
  const type = (img.headers.get("content-type") || "image/jpeg").split(";")[0];
  if (!/^image\/(jpeg|png|webp|gif)$/.test(type)) return json({ ok: false, note: "Couldn't read this image (not a JPG or PNG)." });
  const buf = new Uint8Array(await img.arrayBuffer());
  // Small enough: send the bytes. Too big to send inline: let the API fetch it by URL instead.
  let b64 = "";
  if (buf.length <= 4_500_000) { let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000)); b64 = btoa(s); }
  const source = b64 ? { type: "base64", media_type: type, data: b64 } : { type: "url", url: c.image_url };
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL, max_tokens: 8000, system: TRANSCRIBE_SYSTEM,
      messages: [{ role: "user", content: [{ type: "image", source }, { type: "text", text: "Transcribe this clipping." }] }],
    }),
  });
  if (!r.ok) return json({ ok: false, note: "Couldn't read this image (the reader is busy, try again in a minute)." , detail: (await r.text()).slice(0, 300) });
  const out = await r.json();
  const text = (out.content ?? []).map((x: any) => x.text ?? "").join("");
  let p: any = {};
  try { p = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); } catch { p = { transcription: text.trim() }; }
  const transcription = str(p.transcription, 60000).trim();
  if (!transcription || /^\[illegible\]$/i.test(transcription)) return json({ ok: false, note: "Couldn't read this image (no readable text found)." });
  return json({ ok: true, transcription, headline: str(p.headline, 300).trim(), paper: str(p.paper, 200).trim(), date: str(p.date, 60).trim() });
}

export async function clipDecide({ db, json, queueRebuild }: Ctx, body: any) {
  const id = str(body.id, 60);
  const { data: c, error: e1 } = await db.from("clippings").select("*").eq("id", id).single();
  if (e1 || !c) return json({ error: e1?.message ?? "Not found" }, 404);
  const now = new Date().toISOString();
  if (body.decision === "reject") {
    const { error } = await db.from("clippings").update({ moderation: "declined", reviewed_at: now }).eq("id", id);
    return error ? json({ error: error.message }, 500) : json({ ok: true, status: "declined" });
  }
  if (body.decision !== "approve" && body.decision !== "timeline") return json({ error: "decision must be approve, timeline or reject" }, 400);
  // Save whatever the reviewer has in the fields first (same rules as Save).
  const p = body.patch ?? {};
  const patch: any = { moderation: "approved", reviewed_at: now };
  if ("paper_name" in p) patch.paper_name = opt(p.paper_name, 200);
  if ("date_label" in p) patch.date_label = opt(p.date_label, 60);
  if ("headline" in p) patch.headline = opt(p.headline, 300);
  if ("description" in p) patch.description = opt(p.description, 2000);
  if ("transcription" in p) patch.transcription = opt(p.transcription, 60000);
  const next = { ...c, ...patch };
  if (!next.transcription) return json({ error: "Add the transcription first (press Transcribe image, then check it)." }, 400);
  // Approving = the reviewer has checked the words, so it shows as checked, not "AI, not verified".
  patch.transcription_status = "published";
  if (body.decision === "approve") {
    const { error } = await db.from("clippings").update(patch).eq("id", id);
    return error ? json({ error: error.message }, 500) : json({ ok: true, status: "approved" });
  }
  // Approve + add to timeline
  if (c.item_id) return json({ error: "This clipping is already on the timeline.", on_timeline: true }, 409);
  const t = body.timeline ?? {};
  const year = Number.isInteger(+t.year) && +t.year >= 1600 && +t.year <= 2100 ? +t.year : yearOf(t.date_label || next.date_label);
  if (!year) return json({ error: "A year is needed to put this on the timeline." }, 400);
  const title = str(t.title, 300).trim();
  if (!title) return json({ error: "Add a title for the timeline entry." }, 400);
  const tbody = str(t.body, 2000).trim();
  if (!tbody) return json({ error: "Add a short summary for the timeline entry." }, 400);
  const source = str(t.source, 500).trim() || [next.paper_name, next.date_label].filter(Boolean).join(", ");
  if (!source) return json({ error: "No source, no publish: add the newspaper name or date." }, 400);
  const label = str(t.date_label || next.date_label || year, 60).trim() || String(year);
  const { error: e2 } = await db.from("clippings").update(patch).eq("id", id);
  if (e2) return json({ error: e2.message }, 500);
  const row = {
    town: c.town, kind: "document", title, body: tbody, year, date_label: label, image_url: c.image_url,
    source: "Newspaper clipping: " + source, source_url: "", contributor: str(c.submitter_name || "A community member", 120),
    origin: "community", external_id: "clip:" + c.id, status: "published", pin_timeline: true,
  };
  const { data: it, error: e3 } = await db.from("items").upsert(row, { onConflict: "town,external_id" }).select("id").single();
  if (e3) return json({ error: e3.message }, 500);
  await db.from("clippings").update({ item_id: it.id, proposed_item_status: c.proposed_item ? "approved" : c.proposed_item_status }).eq("id", id);
  // Show it right away; the rebuild keeps it because the item is pinned.
  const { data: dup } = await db.from("timeline").select("id").eq("town", c.town).contains("item_ids", [it.id]).limit(1);
  if (!dup?.length) {
    await db.from("timeline").insert({ town: c.town, year, label, title: str(title, 200), body: tbody, cat: "Events", tier: "documented", item_ids: [it.id], cite: "", sort: 9999 });
  }
  queueRebuild(c.town);
  return json({ ok: true, status: "approved", item_id: it.id });
}

// Something that isn't a person was sent through the Remembrance form: move it to the Archive review queue.
export async function remMove({ db, json }: Ctx, body: any) {
  const id = str(body.id, 200);
  const { data: m, error } = await db.from("memorials")
    .select("*, submission:memorial_submissions(submitter_name,submitter_email)").eq("id", id).single();
  if (error || !m) return json({ error: error?.message ?? "Not found" }, 404);
  if (m.status !== "pending") return json({ error: "Only waiting entries can be moved." }, 400);
  const s = (Array.isArray(m.submission) ? m.submission[0] : m.submission) ?? {};
  const text = [m.note, m.birth_date_label && "Date: " + m.birth_date_label, m.death_date_label && "Date: " + m.death_date_label, m.birth_place, m.death_place]
    .filter(Boolean).join("\n");
  const row = {
    town: m.town, kind: "story", title: str(m.name, 300) || "Shared through the Remembrance form", body: str(text, 20000),
    year: yearOf(m.death_date_label || m.birth_date_label), date_label: str(m.death_date_label || m.birth_date_label || "", 60),
    source: str(m.source || "Shared by " + (s.submitter_name || "a community member"), 500),
    contributor: str(s.submitter_name || "A community member", 120), contact_email: s.submitter_email || null,
    origin: "community", status: "pending", external_id: "rem-moved:" + m.id,
  };
  const { data: it, error: e2 } = await db.from("items").upsert(row, { onConflict: "town,external_id" }).select("id").single();
  if (e2) return json({ error: e2.message }, 500);
  await db.from("memorials").update({ status: "declined", note: str(("[Moved to the Archive review queue] " + (m.note || "")).trim(), 1500) }).eq("id", id);
  return json({ ok: true, item_id: it.id });
}
