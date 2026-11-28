// TownTales "donors" edge function (deploy with JWT checks off).
//   /donors/stripe-webhook  public, verified with STRIPE_DONOR_WEBHOOK_SECRET
//   /donors/list /donors/save /donors/add   admin (x-admin-key)
// Separate from the "api" function so deploying it can't disturb anything else.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { donationFrom, stripeVerified } from "./parse.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-admin-key, authorization, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const opt = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max) || null;

async function webhook(req: Request) {
  const secret = Deno.env.get("STRIPE_DONOR_WEBHOOK_SECRET");
  if (!secret) return json({ error: "Webhook not configured" }, 503);
  const raw = await req.text();
  if (!(await stripeVerified(raw, req.headers.get("stripe-signature"), secret))) return json({ error: "Bad signature" }, 400);
  let ev: any; try { ev = JSON.parse(raw); } catch { return json({ error: "Bad JSON" }, 400); }
  const s = ev.data?.object ?? {};
  if (ev.type === "customer.subscription.deleted") {
    const { data, error } = await db.from("donor_payments").select("donor_id").eq("stripe_subscription_id", String(s.id));
    if (error) return json({ error: error.message }, 500);
    const ids = (data ?? []).map((r: any) => r.donor_id);
    if (ids.length) {
      const u = await db.from("donors").update({ monthly_active: false }).in("id", ids);
      if (u.error) return json({ error: u.error.message }, 500);
    }
    return json({ ok: true, ended: ids.length });
  }
  if (ev.type !== "checkout.session.completed" && ev.type !== "checkout.session.async_payment_succeeded") return json({ ok: true, ignored: ev.type });
  const d = donationFrom(s);
  if (!d) return json({ ok: true, ignored: "not a donation" });
  if (s.payment_status !== "paid") return json({ ok: true, waiting: s.payment_status });
  const { error } = await db.rpc("record_donation", d);
  return error ? json({ error: error.message }, 500) : json({ ok: true });
}

async function townSlug(v: unknown) {
  const slug = opt(v, 140);
  if (!slug) return { slug: null };
  const { data } = await db.from("towns").select("slug").eq("slug", slug).maybeSingle();
  return data ? { slug: data.slug } : { error: `No town with the address "${slug}". It looks like wapella-sk.` };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const action = new URL(req.url).pathname.split("/").filter(Boolean).pop();
  if (action === "stripe-webhook") return webhook(req);
  const ak = Deno.env.get("TOWNTALES_ADMIN_KEY");
  if (!ak || req.headers.get("x-admin-key") !== ak) return json({ error: "Bad admin key" }, 401);
  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: "Body must be JSON" }, 400); }

  if (action === "list") {
    const { data, error } = await db.from("donors").select("*, payment:donor_payments(donor_email,payer_name,amount_cents,currency)")
      .order("created_at", { ascending: false }).limit(500);
    if (error) return json({ error: error.message }, 500);
    return json({ donors: (data ?? []).map((r: any) => ({ ...r, payment: Array.isArray(r.payment) ? r.payment[0] : r.payment })) });
  }
  if (action === "save" || action === "add") {
    const status = ["pending", "published", "hidden"].includes(body.status) ? body.status : "pending";
    const t = await townSlug(body.town);
    if (t.error) return json({ error: t.error }, 400);
    const row = { town: t.slug, display_name: opt(body.display_name, 80), dedication: opt(body.dedication, 140), status };
    if (status === "published" && !row.display_name && !row.dedication) return json({ error: "Add a name or a dedication before approving." }, 400);
    const r = action === "add" ? await db.from("donors").insert(row) : await db.from("donors").update(row).eq("id", String(body.id));
    return r.error ? json({ error: r.error.message }, 500) : json({ ok: true, status });
  }
  return json({ error: "Unknown action" }, 404);
});
