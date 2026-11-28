# Donate page: Stripe buttons (Nov 26, 2026)

Switches on when Payment Links are set in Vercel. Until then the Donate page is exactly as before.

## Stripe (two Payment Links)
1. "Support TownTales (one-time)": turn on "Customers choose what to pay", suggested $10 / $25 / $50. Redirect after payment: https://www.towntales.ca/donate/thanks
2. "Support TownTales (monthly)": recurring monthly, customer chooses amount. Same redirect.
3. Leave tax collection off on both unless the accountant says otherwise.

## Vercel -> Environment Variables
- `DONATE_LINK_ONCE` = the pay-what-you-want link (buy.stripe.com or donate.stripe.com)
- `DONATE_LINK_MONTHLY_5`, `DONATE_LINK_MONTHLY_10`, `DONATE_LINK_MONTHLY_25`, `DONATE_LINK_MONTHLY_50` = one fixed monthly link per amount. Set only the ones you have; each becomes a "$N a month" button.
- (Older single `DONATE_LINK_MONTHLY` still works if no amount-specific ones are set.)
- Redeploy after adding.

## What changed
- api/page.js: Donate notice becomes "Give once / Give monthly" buttons when a link is set; the "tell us how you'd like to help" form stays underneath for e-transfers and town sponsorships.
- api/remembrance.js + vercel.json: `/donate/thanks` page (noindex). Kept in remembrance.js so no new Vercel function is added.
- Wording says TownTales is not a registered charity and gifts are not tax-deductible.
