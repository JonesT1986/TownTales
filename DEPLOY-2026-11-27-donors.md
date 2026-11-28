# Donors: town "Friends of" blocks + /donors page (Nov 27, 2026), branch `feat/donors`

Built on production (`release/book-orders` @ 87da333). Nothing here is live yet.

## Go live, in this order
1. **Database:** Supabase -> SQL editor -> run `db/2026-11-27-donors.sql` (new tables only; safe to run twice).
2. **Edge function:** `supabase functions deploy donors --no-verify-jwt` (new function; `api` is not touched).
3. **Website:** merge `feat/donors` into `release/book-orders` and promote to production.
4. **Stripe webhook:** Developers -> Webhooks -> Add endpoint
   `https://zpqwrzsgpwwjrlbnfynn.supabase.co/functions/v1/donors/stripe-webhook`
   Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.deleted`.
   Copy the signing secret -> Supabase -> Edge Functions -> Secrets: `STRIPE_DONOR_WEBHOOK_SECRET`.
5. **Stripe Payment Links** (the one-time link and the $5 / $10 / $25 / $50 monthly links): add two custom text fields, both optional, labelled exactly
   - `Name to show on TownTales`
   - `In memory or honour of`

## How it works
- Donate links carry the town (`client_reference_id=donate_<slug>`, or `donate_general`).
- A paid gift with a name or dedication waits in #admin -> Donors -> Load donors. Approve or Hide.
- No name and no dedication = anonymous, never listed. Amounts and emails are never public.
- Monthly tag drops off when the subscription is cancelled.
- Gifts made before the webhook exists are not picked up: add them by hand in #admin after the donor agrees.

## Tests
`node test/donors.mjs` and `node test/run-pages.js`.
