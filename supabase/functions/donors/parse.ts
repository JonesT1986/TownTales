// Pure helpers for the donors function (tested by test/donors.mjs).
// deno-lint-ignore-file no-explicit-any
const str = (v: unknown, max: number) => (v == null ? "" : String(v)).slice(0, max);

// client_reference_id: donate_<slug>, donate_general, or donateb_<base64url slug> for slugs with accents.
export function townFromRef(ref: string): string | null {
  if (ref.startsWith("donateb_")) {
    try {
      const b = atob(ref.slice(8).replace(/-/g, "+").replace(/_/g, "/"));
      return new TextDecoder().decode(Uint8Array.from(b, (c) => c.charCodeAt(0))) || null;
    } catch { return null; }
  }
  if (!ref.startsWith("donate_")) return null;
  const slug = ref.slice(7);
  return slug && slug !== "general" ? slug : null;
}

// The two optional boxes on the donation Payment Links, matched by their label.
export function donorFields(session: any) {
  let name = "", dedication = "", found = false;
  for (const f of session?.custom_fields ?? []) {
    const label = `${f?.label?.custom ?? ""} ${f?.key ?? ""}`.toLowerCase();
    const value = str(f?.text?.value, 200).trim();
    if (/memory|hono/.test(label)) { dedication = value; found = true; }
    else if (/name/.test(label) && /show|towntales|list/.test(label)) { name = value; found = true; }
  }
  return { name, dedication, found };
}

// A donation = our donate_ reference, or (no reference at all) a checkout that has the donor boxes.
// Honour Pages (hp_) and books (book_) are never donations.
export function donationFrom(session: any) {
  const ref = str(session?.client_reference_id, 200);
  const f = donorFields(session);
  if (!(ref.startsWith("donate_") || ref.startsWith("donateb_") || (!ref && f.found))) return null;
  return {
    p_session: str(session.id, 200),
    p_subscription: session.subscription ? str(session.subscription, 200) : null,
    p_town: townFromRef(ref),
    p_name: f.name,
    p_dedication: f.dedication,
    p_email: str(session.customer_details?.email, 200) || null,
    p_payer: str(session.customer_details?.name, 200) || null,
    p_amount: Number.isFinite(session.amount_total) ? session.amount_total : null,
    p_currency: str(session.currency, 10) || null,
  };
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");
function safeEq(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
export async function stripeVerified(raw: string, header: string | null, secret: string) {
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
