// TownTales "admin-towns" edge function (Nov 22 2026).
// Admin towns list for #admin → Towns: search, A–Z letter, "Needs rebuild" filter, counts and paging.
// POST { q, letter, needs, limit, offset } with header x-admin-key → result of public.admin_towns():
//   { rows, total, needs, needs_all, letters, stats_at, limit, offset }
// All filtering happens in the database, one page at a time, so the 1,000-row API cap never applies.
// Stats come from public.town_rebuild_stats (pg_cron every 5 min + trigger right after each build).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-admin-key, authorization, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const ak = Deno.env.get("TOWNTALES_ADMIN_KEY");
  if (!ak || req.headers.get("x-admin-key") !== ak) return json({ error: "Bad admin key" }, 401);
  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: "Body must be JSON" }, 400); }
  const { data, error } = await db.rpc("admin_towns", {
    p_q: String(body.q ?? "").slice(0, 80),
    p_letter: String(body.letter ?? "").slice(0, 1),
    p_needs: !!body.needs,
    p_limit: Math.min(Math.max(parseInt(body.limit) || 100, 1), 500),
    p_offset: Math.max(parseInt(body.offset) || 0, 0),
  });
  return error ? json({ error: error.message }, 500) : json(data);
});
