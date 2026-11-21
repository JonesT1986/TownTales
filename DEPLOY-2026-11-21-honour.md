# Nov 21, 2026 — Honour Pages (paid upgrade on a remembrance record)

Free stays free: every name, dates and cemetery. An Honour Page adds up to 6 photos, a life story, "Placed by …" and a printable certificate to the person's permanent page. One-time payment through a Stripe Payment Link.

## Flow
1. Offer box on every memorial page ("Tell Mary's story" → /<town>/remembrance/<id>/honour), plus an offer right after a family adds someone with the family form.
2. Order form: story, photos (uploaded to the `honour` bucket), placed by, buyer name/email, permission tick → `submit_honour` saves a draft (`awaiting_payment`) → browser goes to the Stripe Payment Link with `client_reference_id=<honour id>`.
3. Stripe webhook → `api/stripe-webhook` marks it `paid`.
4. #admin → "Load Honour Pages": edit story/captions, drop photos, then Publish (paid), Publish free (comp), Mark paid (paid by e-transfer/cash), or Decline (refund in Stripe).
5. Published → shows on the person's page (within ~10 min, page cache), "Honour Page" badge in the names list, certificate at `?certificate=1`.

Nothing shows to the public until `HONOUR_PAYMENT_LINK` is set in Vercel.

## Homepage "Recently remembered" carousel
- `towntales-extra.js` section 7 + CSS: swipeable row above "This site grows…". Honour Pages first (with their photo), then the newest names, max 3 per town so one cemetery upload doesn't fill it. Last card invites people to add someone (free).
- Stays hidden until there are at least 3 published names, so it's safe to deploy before any data is loaded.

## Files
| What | Where |
|---|---|
| Database (additive) | `db/2026-11-21-honour-pages.sql` — honour_pages (public read when published), honour_orders (private), honour_target / submit_honour, `honour` bucket |
| Edge function | `supabase/functions/api/honour.ts` + 4 lines in `index.ts` |
| Pages | `api/remembrance.js` (offer, honoured view, form page, certificate, /honour/thanks), `vercel.json` (2 routes) |
| Browser | `towntales-extra.js` (form, post-submit offer, admin queue), `towntales-extra.css` |
| Cache bump | asset version 6 → 7 (`api/_shell.js`, `api/page.js`, `grow-patches.json`) |

## Deploy (in this order)
1. Database: apply `db/2026-11-21-honour-pages.sql`.
2. Edge function `api`: deploy `supabase/functions/api/` (index.ts, remembrance.ts, links.ts, admin.ts, honour.ts), no JWT check.
3. Website: push this branch, deploy to production.

## Stripe setup (Travis)
1. Stripe → Payment Links → New. Product "TownTales Honour Page", one-time, CAD. After payment: "Don't show confirmation page" → redirect to `https://www.towntales.ca/honour/thanks`.
2. Vercel → Environment Variables: `HONOUR_PAYMENT_LINK` = the link (https://buy.stripe.com/…), `HONOUR_PRICE` = `$39` (or your price; shown on the site). Redeploy.
3. Stripe → Developers → Webhooks → Add endpoint `https://zpqwrzsgpwwjrlbnfynn.supabase.co/functions/v1/api/stripe-webhook`, events `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Copy the signing secret → Supabase → Edge Functions → Secrets: `STRIPE_WEBHOOK_SECRET`.
Until step 3 is done, use "Mark paid" in admin after checking Stripe.

## Tests
`node test/run-pages.js` (8 new hn-* cases). The webhook signature check was tested with good, tampered, wrong-secret, stale and missing signatures.
