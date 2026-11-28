# Donate page: Stripe buttons (Nov 26, 2026)

Switches on when Payment Links are set in Vercel. Until then the Donate page is exactly as before.

## Stripe (two Payment Links)
1. "Support TownTales (one-time)": turn on "Customers choose what to pay", suggested $10 / $25 / $50. Redirect after payment: https://www.towntales.ca/donate/thanks
2. "Support TownTales (monthly)": recurring monthly, customer chooses amount. Same redirect.
3. Leave tax collection off on both unless the accountant says otherwise.

## Vercel -> Environment Variables
- `DONATE_LINK_ONCE` = the one-time link (https://buy.stripe.com/... or https://donate.stripe.com/...)
- `DONATE_LINK_MONTHLY` = the monthly link
- Either one alone works (that single button shows). Redeploy after adding.

## What changed
- api/page.js: Donate notice becomes "Give once / Give monthly" buttons when a link is set; the "tell us how you'd like to help" form stays underneath for e-transfers and town sponsorships.
- api/remembrance.js + vercel.json: `/donate/thanks` page (noindex). Kept in remembrance.js so no new Vercel function is added.
- Wording says TownTales is not a registered charity and gifts are not tax-deductible.
