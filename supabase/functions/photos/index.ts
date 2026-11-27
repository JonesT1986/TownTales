// photos (Nov 26 2026): admin-only review of free Remembrance photos (table memorial_photos).
// POST JSON, header x-admin-key:  {action:"queue"} | {action:"decide", id, ok:true|false}
const SB = Deno.env.get("SUPABASE_URL")!;
const SK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, x-admin-key, authorization, apikey", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const rest = (path: string, init: RequestInit = {}) => fetch(SB + "/rest/v1/" + path, { ...init, headers: { apikey: SK, Authorization: "Bearer " + SK, "Content-Type": "application/json", ...(init.headers || {}) } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const ak = Deno.env.get("TOWNTALES_ADMIN_KEY");
  if (!ak || req.headers.get("x-admin-key") !== ak) return json({ error: "Bad admin key" }, 401);
  let b: any = {};
  try { b = await req.json(); } catch { /* empty */ }
  try {
    if (b.action === "queue") {
      const rows = await rest("memorial_photos?status=eq.pending&select=id,memorial_id,town,url,caption,kind,shared_by,relation,email,created_at,memorial:memorials(name,birth_date_label,death_date_label)&order=created_at.asc&limit=200").then((r) => r.json());
      return json({ photos: Array.isArray(rows) ? rows : [] });
    }
    if (b.action === "decide") {
      const id = String(b.id || "");
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Bad id" }, 400);
      const [row] = await rest("memorial_photos?id=eq." + id + "&select=memorial_id,status").then((r) => r.json());
      if (!row) return json({ error: "Not found" }, 404);
      if (b.ok) {
        const [has] = await rest("memorial_photos?memorial_id=eq." + encodeURIComponent(row.memorial_id) + "&status=eq.published&select=id").then((r) => r.json());
        if (has) return json({ error: "This person already has a published photo. Reject this one, or remove the other first." }, 409);
      }
      const r = await rest("memorial_photos?id=eq." + id, { method: "PATCH", body: JSON.stringify({ status: b.ok ? "published" : "rejected", reviewed_at: new Date().toISOString() }) });
      return r.ok ? json({ ok: true }) : json({ error: "Couldn't save: " + (await r.text()).slice(0, 200) }, 500);
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) { return json({ error: String((e as Error).message || e).slice(0, 300) }, 500); }
});
