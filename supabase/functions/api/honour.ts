// Honour Pages (Nov 21 2026)
//   stripe-webhook   → public, verified with STRIPE_WEBHOOK_SECRET. checkout.session.completed with an 'hp_' client_reference_id marks it paid.
//   honour-queue     → admin: drafts waiting for payment + paid ones waiting for review, with purchaser details
//   honour-moderate  → admin: publish | comp (publish free) | mark-paid | decline, optional edits to story / placed_by / photos
// deno-lint-ignore-file no-explicit-any

type Ctx = { db: any; json: (b: unknown, s?: number) => Response };

const str = (v: unknown, max = 20000) => (v == null ? "" : String(v)).slice(0, max);
const opt = (v: unknown, max: number) => { const s = str(v, max).trim(); return s ? s : null; };
const PHOTO_RE = /^https:\/\/zpqwrzsgpwwjrlbnfynn\.supabase\.co\/storage\/v1\/object\/public\/honour\//;

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");
function safeEq(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// Stripe signs "<timestamp>.<raw body>" with HMAC-SHA256. Header: "t=…,v1=…[,v1=…]".
async function stripeVerified(raw: string, header: string | null, secret: string) {
  if (!header) return false;
  const parts = header.split(",").map((p) => p.trim().split("="));
  const t = parts.find((p) => p[0] === "t")?.[1];
  const sigs = parts.filter((p) => p[0] === "v1").map((p) => p[1]);
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 600) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const want = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${raw}`)));
  return sigs.some((s) => safeEq(s, want));
}

export async function stripeWebhook({ db, json }: Ctx, req: Request) {
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secret) return json({ error: "Webhook not configured" }, 503);
  const raw = await req.text();
  if (!(await stripeVerified(raw, req.headers.get("stripe-signature"), secret))) return json({ error: "Bad signature" }, 400);
  let ev: any; try { ev = JSON.parse(raw); } catch { return json({ error: "Bad JSON" }, 400); }
  if (ev.type !== "checkout.session.completed" && ev.type !== "checkout.session.async_payment_succeeded") return json({ ok: true, ignored: ev.type });
  const s = ev.data?.object ?? {};
  const ref = str(s.client_reference_id, 60);
  if (!/^hp_[a-f0-9]{24}$/.test(ref)) return json({ ok: true, ignored: "not an honour page" });
  if (s.payment_status !== "paid") return json({ ok: true, waiting: s.payment_status });
  await db.from("honour_orders").update({
    stripe_session_id: str(s.id, 200), amount_cents: Number.isFinite(s.amount_total) ? s.amount_total : null, currency: str(s.currency, 10) || null,
  }).eq("honour_id", ref);
  // Only move drafts forward: never undo a publish or a decline.
  const { error } = await db.from("honour_pages").update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", ref).eq("status", "awaiting_payment");
  return error ? json({ error: error.message }, 500) : json({ ok: true, paid: ref });
}

export async function honourQueue({ db, json }: Ctx, body: any) {
  const statuses = body?.all ? ["awaiting_payment", "paid"] : ["paid"];
  const { data, error } = await db.from("honour_pages")
    .select("*, order:honour_orders(*), memorial:memorials(id,name,maiden_name,birth_date_label,death_date_label,status,town)")
    .in("status", statuses).order("created_at").limit(200);
  if (error) return json({ error: error.message }, 500);
  const rows = (data ?? []).map((h: any) => ({ ...h, order: Array.isArray(h.order) ? h.order[0] : h.order }));
  return json({ honour: rows });
}

export async function honourModerate({ db, json }: Ctx, body: any) {
  const id = str(body.id, 60);
  const act = str(body.action, 20);
  const { data: cur, error: e1 } = await db.from("honour_pages").select("*, memorial:memorials(status)").eq("id", id).single();
  if (e1 || !cur) return json({ error: e1?.message ?? "Not found" }, 404);
  const patch: any = {};
  const p = body.patch ?? {};
  if ("story" in p) patch.story = opt(p.story, 6000);
  if ("placed_by" in p) patch.placed_by = opt(p.placed_by, 200);
  if (Array.isArray(p.photos)) {
    patch.photos = p.photos.filter((x: any) => PHOTO_RE.test(str(x?.url, 500))).slice(0, 6)
      .map((x: any) => ({ url: str(x.url, 500), caption: opt(x.caption, 200) }));
  }
  const now = new Date().toISOString();
  if (act === "decline") patch.status = "declined";
  else if (act === "mark-paid") { if (cur.status !== "awaiting_payment") return json({ error: "Only drafts waiting for payment can be marked paid." }, 400); patch.status = "paid"; patch.paid_at = now; }
  else if (act === "publish" || act === "comp") {
    if (act === "publish" && cur.status !== "paid") return json({ error: "Not paid yet. Use 'Mark paid' if they paid another way, or 'Publish free'." }, 400);
    const mstatus = Array.isArray(cur.memorial) ? cur.memorial[0]?.status : cur.memorial?.status;
    if (mstatus !== "published") return json({ error: "Publish the person's remembrance record first (Remembrance queue above)." }, 400);
    const story = "story" in patch ? patch.story : cur.story, photos = patch.photos ?? cur.photos ?? [];
    if (!story && !photos.length) return json({ error: "Nothing to show: add a story or keep at least one photo." }, 400);
    patch.status = "published"; patch.published_at = now;
    if (act === "comp") patch.comped = true;
  } else if (act !== "save") return json({ error: "action must be publish, comp, mark-paid, decline or save" }, 400);
  const { error } = await db.from("honour_pages").update(patch).eq("id", id);
  if (error) return json({ error: /honour_pages_one_published/.test(error.message) ? "This person already has a published Honour Page." : error.message }, 500);
  return json({ ok: true, status: patch.status ?? cur.status });
}
