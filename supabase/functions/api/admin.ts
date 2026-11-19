// Admin actions added Nov 19 2026 (all need x-admin-key, checked in index.ts, except rebuild-due):
//   reports          → problem reports (open, or all with resolved dates)
//   report-resolve   → mark a report resolved (or reopen it)
//   report-delete    → delete a report (test entries, spam)
//   moderate-bulk    → publish or decline many review-queue items at once
//   settings         → read or change admin settings (auto-approve link-reader facts)
//   rebuild-due      → PUBLIC but harmless: rebuilds a town only if the database flagged it (auto-approved facts)
// deno-lint-ignore-file no-explicit-any

type Ctx = { db: any; json: (b: unknown, s?: number) => Response; queueRebuild: (town: string) => void };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SETTINGS: Record<string, "bool"> = { auto_approve_link_reader: "bool" };

export async function reports({ db, json }: Ctx, body: any) {
  let q = db.from("reports").select("id,what,text,name,email,done,resolved_at,created_at").order("created_at", { ascending: false }).limit(300);
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
      if (SETTINGS[k] !== "bool" || typeof v !== "boolean") return json({ error: "Unknown setting: " + k }, 400);
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
