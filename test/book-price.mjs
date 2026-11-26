// node test/book-price.mjs  — checks the price rule and the Lulu/Stripe plumbing with a pretend Lulu.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
process.env.LULU_CLIENT_KEY = 'k'; process.env.LULU_CLIENT_SECRET = 's';
const bp = require('../api/_bookprice.js');

// 1. The rule: at least 30% of the price is left after Lulu + Stripe, for any cost.
for (let cost = 300; cost <= 9000; cost += 37) {
  const p = bp.priceCentsFor(cost);
  assert(bp.marginOf(p, cost) >= 0.30 - 1e-9, `margin too low at cost ${cost}: price ${p}`);
  assert(p % 100 === 99, 'price should end in .99');
  assert(bp.marginOf(p - 100, cost) < 0.30 + 0.0001 || p - 100 < cost, 'price should not be a dollar higher than needed');
}

// 2. Pretend Lulu: print cost grows with pages, shipping dearest for the north.
const ship = { Toronto: 1100, Montreal: 1100, Halifax: 1300, "St. John's": 1500, Winnipeg: 1200, Calgary: 1250, Vancouver: 1300, Whitehorse: 2100, Yellowknife: 2400, Iqaluit: 3600 };
let calls = 0;
const fakeFetch = async (url, opt) => {
  if (url.includes('openid-connect/token')) return { ok: true, status: 200, json: async () => ({ access_token: 't', expires_in: 300 }), text: async () => '' };
  calls++;
  const b = JSON.parse(opt.body);
  const pages = b.line_items[0].page_count, city = b.shipping_address.city;
  const hard = b.line_items[0].pod_package_id.includes('CW');
  const print = 250 + pages * 2.1 + (hard ? 600 : 0) + 105;
  const total = ((print + ship[city]) / 100).toFixed(2);
  return { ok: true, status: 200, text: async () => JSON.stringify({ currency: 'CAD', total_cost_excl_tax: total, total_cost_incl_tax: total }), json: async () => ({}) };
};
const rows = [];
for (const pages of [78, 100, 150, 200, 300]) {
  for (const ed of ['paperback', 'hardcover']) {
    const q = await bp.quote(ed, pages, fakeFetch);
    assert.equal(q.worst, 'Iqaluit');
    assert(q.margin >= 0.30);
    rows.push(`${String(pages).padStart(4)} pages  ${ed.padEnd(9)} cost ${bp.fmt(q.costCents).padStart(7)}  price ${bp.fmt(q.priceCents).padStart(7)}  you keep ${(q.margin * 100).toFixed(1)}%`);
  }
}
console.log(rows.join('\n'));
const before = calls; await bp.quote('paperback', 200, fakeFetch); assert.equal(calls, before, 'second ask should come from the cache');
assert(bp.quote('paperback', 10, fakeFetch)); // below the minimum is lifted to 32 pages

// 3. A destination Lulu can not price must stop the quote (never a low price by accident).
const badFetch = async (url, opt) => url.includes('token') ? fakeFetch(url, opt) : (JSON.parse(opt.body).shipping_address.city === 'Iqaluit' ? { ok: false, status: 422, text: async () => 'bad postcode' } : fakeFetch(url, opt));
await assert.rejects(() => bp.quote('paperback', 321, badFetch), /Iqaluit/);

// 4. Stripe form encoding.
let sent;
const stripeFetch = async (url, opt) => { sent = new URLSearchParams(opt.body); return { ok: true, status: 200, json: async () => ({ url: 'https://checkout.stripe.com/c/pay/x' }) }; };
process.env.STRIPE_SECRET_KEY = 'rk_test_abc123';
const q = await bp.quote('paperback', 78, fakeFetch);
const url = await bp.checkoutUrl({ town: 'wapella-sk', townName: 'Wapella', edition: 'paperback', qte: q, site: 'https://www.towntales.ca' }, stripeFetch);
assert.equal(url, 'https://checkout.stripe.com/c/pay/x');
assert.equal(sent.get('line_items[0][price_data][unit_amount]'), String(q.priceCents));
assert.equal(sent.get('line_items[0][price_data][currency]'), 'cad');
assert.equal(sent.get('shipping_address_collection[allowed_countries][0]'), 'CA');
assert.equal(sent.get('phone_number_collection[enabled]'), 'true');
assert.equal(sent.get('metadata[pages]'), '78');
assert.equal(sent.get('client_reference_id'), 'book_wapella-sk');
console.log('\nall book-price tests passed');
