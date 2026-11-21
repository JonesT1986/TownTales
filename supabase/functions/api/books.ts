// Whole-book uploads (Nov 21 2026) — admin only
//   book-queue    → uploads (newest first) with uploader details; pass {id} to also get signed links to every page (1 h)
//   book-moderate → set status: processing | done | declined | received, optional admin_note
// deno-lint-ignore-file no-explicit-any

type Ctx = { db: any; json: (b: unknown, s?: number) => Response };
const STATUSES = ["received", "processing", "done", "declined"];

export async function bookQueue({ db, json }: Ctx, body: any) {
  const id = body?.id ? String(body.id).slice(0, 60) : "";
  let q = db.from("book_uploads").select("*, town_row:towns(name,prov)").order("created_at", { ascending: false }).limit(100);
  q = id ? q.eq("id", id) : body?.all ? q : q.in("status", ["uploading", "received", "processing"]);
  const { data, error } = await q;
  if (error) return json({ error: error.message }, 500);
  const rows = data ?? [];
  if (!id || !rows[0]) return json({ books: rows });
  // Pages for one upload, in order (files are named 0001.jpg, 0002.jpg …).
  const files: string[] = [];
  for (let offset = 0; offset < 4000; offset += 1000) {
    const { data: list, error: e2 } = await db.storage.from("book-pages").list(id, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
    if (e2) return json({ error: e2.message }, 500);
    (list ?? []).forEach((f: any) => f.name && !f.name.startsWith(".") && files.push(`${id}/${f.name}`));
    if (!list || list.length < 1000) break;
  }
  const pages: { name: string; url: string }[] = [];
  for (let i = 0; i < files.length; i += 500) {
    const { data: signed, error: e3 } = await db.storage.from("book-pages").createSignedUrls(files.slice(i, i + 500), 3600);
    if (e3) return json({ error: e3.message }, 500);
    (signed ?? []).forEach((s: any, k: number) => s.signedUrl && pages.push({ name: files[i + k].split("/")[1], url: s.signedUrl }));
  }
  return json({ books: rows, pages });
}

export async function bookModerate({ db, json }: Ctx, body: any) {
  const id = String(body?.id ?? "").slice(0, 60);
  const status = String(body?.status ?? "");
  if (!STATUSES.includes(status)) return json({ error: "status must be " + STATUSES.join(", ") }, 400);
  const patch: any = { status };
  if ("admin_note" in (body ?? {})) patch.admin_note = String(body.admin_note ?? "").slice(0, 2000) || null;
  const { error } = await db.from("book_uploads").update(patch).eq("id", id);
  return error ? json({ error: error.message }, 500) : json({ ok: true, status });
}
