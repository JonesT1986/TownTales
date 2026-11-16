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

export async function clipQueue({ db, json }: Ctx) {
  const { data, error } = await db.from("clippings")
    .select("*, contact:clipping_contacts(submitter_email)")
    .neq("moderation", "declined")
    .or("moderation.eq.pending,transcription_status.neq.published,proposed_item_status.eq.pending")
    .order("created_at").limit(200);
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
