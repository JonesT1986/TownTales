// Admin actions added Nov 19 2026 (all need x-admin-key, checked in index.ts, except rebuild-due):
//   reports          → problem reports (open, or all with resolved dates)
//   report-resolve   → mark a report resolved (or reopen it)
//   report-delete    → delete a report (test entries, spam)
//   moderate-bulk    → publish or decline many review-queue items at once
//   settings         → read or change admin settings (auto-approve link-reader facts)
//   contacts         → (Nov 26) everyone who left an email with something they sent, grouped by town
//   rebuild-due      → PUBLIC but harmless: rebuilds a town only if the database flagged it (auto-approved facts)
// deno-lint-ignore-file no-explicit-any

type Ctx = { db: any; json: (b: unknown, s?: number) => Response; queueRebuild: (town: string) => void };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SETTINGS: Record<string, "bool" | "days" | "date"> = { auto_approve_link_reader: "bool", new_tag_days: "days", new_tag_since: "date" };
const okSetting = (t: string, v: unknown) =>
  t === "bool" ? typeof v === "boolean" : t === "days" ? Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 365 : t === "date" ? typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) : false;

export async function reports({ db, json }: Ctx, body: any) {
  let q = db.from("reports").select("id,what,text,name,email,town,done,resolved_at,created_at").order("created_at", { ascending: false }).limit(300);
  if (body.show !== "all") q = q.eq("done", false);
  const { data, error } = await q;
  return error ? json({ error: error.message }, 500) : json({ reports: data });
}

export async function reportResolve({ db, json }: Ctx, body: any) {
  const id = String(body.id ?? "");
  if (!UUID.test(id)) return json({ error: "id required" }, 400);
  const resolved = body.resolved !== false;
  const { data, error } = await db.from("reports").update({ done: resolved, resolved_at: resolved ? new Date().toISOString() : null })
    .eq("id", id).select("id,done,resolved_at").maybeSingle();
  if (error) return json({ error: error.message }, 500);
  return data ? json({ ok: true, report: data }) : json({ error: "Not found" }, 404);
}

export async function reportDelete({ db, json }: Ctx, body: any) {
  const id = String(body.id ?? "");
  if (!UUID.test(id)) return json({ error: "id required" }, 400);
  const { error } = await db.from("reports").delete().eq("id", id);
  return error ? json({ error: error.message }, 500) : json({ ok: true });
}

export async function moderateBulk({ db, json, queueRebuild }: Ctx, body: any) {
  const status = body.status;
  if (!["published", "declined"].includes(status)) return json({ error: "status must be published or declined" }, 400);
  const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).filter((s: string) => UUID.test(s)).slice(0, 500);
  if (!ids.length) return json({ error: "Nothing selected." }, 400);
  // Only items still waiting are changed, so a stale page can't undo an earlier decision.
  const { data, error } = await db.from("items").update({ status }).in("id", ids).eq("status", "pending").select("id,town");
  if (error) return json({ error: error.message }, 500);
  const towns = [...new Set((data ?? []).map((r: any) => r.town))] as string[];
  if (status === "published") towns.forEach((t) => queueRebuild(t));
  return json({ ok: true, changed: (data ?? []).length, towns });
}

export async function settings({ db, json }: Ctx, body: any) {
  const patch = body.set && typeof body.set === "object" ? body.set : null;
  if (patch) {
    for (const [k, v] of Object.entries(patch)) {
      if (!SETTINGS[k] || !okSetting(SETTINGS[k], v)) return json({ error: "Unknown or bad setting: " + k }, 400);
      const { error } = await db.from("admin_settings").upsert({ k, v, updated_at: new Date().toISOString() });
      if (error) return json({ error: error.message }, 500);
    }
  }
  const { data, error } = await db.from("admin_settings").select("k,v,updated_at");
  if (error) return json({ error: error.message }, 500);
  const out: Record<string, unknown> = {};
  for (const r of data ?? []) if (SETTINGS[r.k]) out[r.k] = r.v;
  return json({ settings: out });
}

export async function rebuildDue({ db, json, queueRebuild }: Ctx, body: any) {
  const slug = String(body.slug ?? "").slice(0, 140);
  if (!slug) return json({ error: "slug required" }, 400);
  const quiet = new Date(Date.now() - 2 * 60_000).toISOString();
  // Claim the flag once; does nothing for towns the database didn't flag.
  const { data } = await db.from("towns").update({ rebuild_due_at: null }).eq("slug", slug)
    .not("rebuild_due_at", "is", null).lt("rebuild_due_at", quiet).select("slug").maybeSingle();
  if (!data) return json({ ok: true, skipped: "not due" });
  queueRebuild(slug);
  return json({ ok: true, status: "queued", slug });
}

// Everyone who sent something in with an email, grouped by town (admin only). Drawn from every submission table.
export async function contacts({ db, json }: Ctx, _body: any) {
  const rows: any[] = [];
  const add = (town: unknown, name: unknown, email: unknown, what: string, at: unknown) => {
    const e = String(email ?? "").trim().toLowerCase();
    if (!e || !e.includes("@")) return;
    rows.push({ town: String(town ?? "") || "(no town)", name: String(name ?? "").trim(), email: e, what, at: at ?? null });
  };
  const safe = async (p: Promise<any>) => { try { const r = await p; return r.data ?? []; } catch { return []; } };
  const [clips, items, mems, books, interest, reps, towns, honour] = await Promise.all([
    safe(db.from("clipping_contacts").select("submitter_email, clipping:clippings(town,submitter_name,paper_name,date_label,created_at)").limit(5000)),
    safe(db.from("items").select("town,contributor,contact_email,kind,title,created_at").eq("origin", "community").not("contact_email", "is", null).limit(5000)),
    safe(db.from("memorial_submissions").select("submitter_name,submitter_email,created_at, memorial:memorials(town,name)").limit(5000)),
    safe(db.from("book_uploads").select("town,uploader_name,uploader_email,title,created_at").limit(5000)),
    safe(db.from("book_interest").select("town,name,email,created_at").limit(5000)),
    safe(db.from("reports").select("town,name,email,what,created_at").limit(5000)),
    safe(db.from("towns").select("slug,added_by,added_email,created_at").not("added_email", "is", null).limit(5000)),
    safe(db.from("honour_orders").select("purchaser_name,purchaser_email,created_at, page:honour_pages(town)").limit(5000)),
  ]);
  for (const r of clips) { const c = Array.isArray(r.clipping) ? r.clipping[0] : r.clipping; add(c?.town, c?.submitter_name, r.submitter_email, "Clipping: " + ([c?.paper_name, c?.date_label].filter(Boolean).join(", ") || "newspaper clipping"), c?.created_at); }
  for (const r of items) add(r.town, r.contributor, r.contact_email, "Archive " + r.kind + ": " + String(r.title ?? "").slice(0, 80), r.created_at);
  for (const r of mems) { const m = Array.isArray(r.memorial) ? r.memorial[0] : r.memorial; add(m?.town, r.submitter_name, r.submitter_email, "Remembrance: " + (m?.name ?? ""), r.created_at); }
  for (const r of books) add(r.town, r.uploader_name, r.uploader_email, "Book upload: " + (r.title ?? ""), r.created_at);
  for (const r of interest) add(r.town, r.name, r.email, "Book interest", r.created_at);
  for (const r of reps) add(r.town, r.name, r.email, "Report: " + String(r.what ?? "").slice(0, 80), r.created_at);
  for (const r of towns) add(r.slug, r.added_by, r.added_email, "Added the town", r.created_at);
  for (const r of honour) { const h = Array.isArray(r.page) ? r.page[0] : r.page; add(h?.town, r.purchaser_name, r.purchaser_email, "Honour Page order", r.created_at); }
  rows.sort((a, b) => a.town.localeCompare(b.town) || String(b.at ?? "").localeCompare(String(a.at ?? "")));
  return json({ contacts: rows });
}

// Added Nov 26 2026. The book waitlist: everyone who asked for a town's book, grouped by town (admin only).
export async function waitlist({ db, json }: Ctx, _body: any) {
  const { data, error } = await db.from("book_interest").select("id,town,name,email,copies,format,updates_ok,created_at").order("created_at", { ascending: false }).limit(5000);
  if (error) return json({ error: error.message }, 500);
  // Nov 27 2026: RM book requests, listed as "rm/<slug>" so they group on their own. Table missing: none.
  const rm = await db.from("rm_book_interest").select("id,rm,name,email,copies,format,updates_ok,created_at").order("created_at", { ascending: false }).limit(5000);
  const rmRows = (rm.error ? [] : rm.data ?? []).map((r: any) => ({ ...r, town: "rm/" + r.rm, rm: undefined }));
  return json({ waitlist: [...(data ?? []), ...rmRows] });
}
export async function waitlistRemove({ db, json }: Ctx, body: any) {
  const id = String(body?.id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Bad id" }, 400);
  const { error, count } = await db.from("book_interest").delete({ count: "exact" }).eq("id", id);
  if (error) return json({ error: error.message }, 500);
  if (!count) { const r = await db.from("rm_book_interest").delete().eq("id", id); if (r.error && !/does not exist/i.test(r.error.message)) return json({ error: r.error.message }, 500); }
  return json({ ok: true });
}
