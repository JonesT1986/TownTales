'use strict';
// Printed-book pricing (Nov 2026). The price of a book follows what Lulu charges to print it (which depends on the
// page count) plus what Lulu charges to ship it to the most expensive place in Canada, plus Stripe's fee, plus the
// margin we want to keep. Shipping is free to the customer, so it is priced in.
//
//   price = (lulu cost, worst Canadian destination + Stripe fixed fee) / (1 - margin - Stripe percentage)
//
// Lulu is asked for the real cost (Print Job Cost Calculation API), so the price stays right when Lulu changes
// its rates or when a book has more pages. Results are remembered for a day per (edition, page count).
//
// Vercel env (all optional except the Lulu pair and the Stripe key):
//   LULU_CLIENT_KEY, LULU_CLIENT_SECRET   Lulu developer portal > API keys
//   STRIPE_SECRET_KEY                     restricted key, "Checkout Sessions: write" only
//   BOOK_MARGIN            0.30           share of the selling price we keep after Lulu + Stripe
//   BOOK_STRIPE_PCT        0.035          Stripe percentage (2.9% + a cushion for foreign/Amex cards)
//   BOOK_STRIPE_FIXED      0.30           Stripe fixed fee, CAD
//   BOOK_MIN_PROFIT        0              never keep less than this many dollars per book
//   LULU_SHIPPING_LEVEL    GROUND         MAIL | GROUND | PRIORITY_MAIL | EXPEDITED | EXPRESS
//   LULU_API_BASE          https://api.lulu.com   (sandbox: https://api.sandbox.lulu.com)
//   LULU_POD_PAPERBACK / LULU_POD_HARDCOVER   Lulu product ids (default: 8.5x11 black & white, 60# white)
//   LULU_USD_TO_CAD        1.40           only used if Lulu answers in USD

const num = (k, d) => { const v = Number(process.env[k]); return Number.isFinite(v) && process.env[k] !== '' && process.env[k] != null ? v : d; };

const EDITIONS = {
  paperback: { name: 'Paperback', pod: () => process.env.LULU_POD_PAPERBACK || '0850X1100BWSTDPB060UW444MXX', minPages: 32 },
  hardcover: { name: 'Hardcover', pod: () => process.env.LULU_POD_HARDCOVER || '0850X1100BWSTDCW060UW444MXX', minPages: 24 },
};

// Spread of Canadian addresses: big cities plus the expensive corners. The price covers the dearest one.
const DESTINATIONS = [
  { city: 'Toronto', state: 'ON', postcode: 'M5V 3L9', street: '290 Bremner Blvd' },
  { city: 'Montreal', state: 'QC', postcode: 'H3B 4W8', street: '1000 Rue de la Gauchetiere O' },
  { city: 'Halifax', state: 'NS', postcode: 'B3J 3J5', street: '1741 Brunswick St' },
  { city: "St. John's", state: 'NL', postcode: 'A1C 5M5', street: '10 Water St' },
  { city: 'Winnipeg', state: 'MB', postcode: 'R3C 4T3', street: '300 Main St' },
  { city: 'Calgary', state: 'AB', postcode: 'T2P 2M5', street: '100 4 Ave SW' },
  { city: 'Vancouver', state: 'BC', postcode: 'V6B 5K3', street: '800 Griffiths Way' },
  { city: 'Whitehorse', state: 'YT', postcode: 'Y1A 1C6', street: '2134 2nd Ave' },
  { city: 'Yellowknife', state: 'NT', postcode: 'X1A 2P4', street: '4920 52 St' },
  { city: 'Iqaluit', state: 'NU', postcode: 'X0A 0H0', street: '1085 Federal Rd' },
];

// ---- the money rule (pure, tested) -----------------------------------------------------------------------------
function settings() {
  return { margin: num('BOOK_MARGIN', 0.30), stripePct: num('BOOK_STRIPE_PCT', 0.035), stripeFixed: num('BOOK_STRIPE_FIXED', 0.30), minProfit: num('BOOK_MIN_PROFIT', 0) };
}
/** Selling price in cents for a total cost in cents; always ends in .99 and never falls short of the margin. */
function priceCentsFor(costCents, s = settings()) {
  const cost = costCents / 100;
  const byMargin = (cost + s.stripeFixed) / (1 - s.margin - s.stripePct);
  const byProfit = (cost + s.stripeFixed + s.minProfit) / (1 - s.stripePct);
  const raw = Math.max(byMargin, byProfit);
  return Math.round((Math.ceil(raw + 0.01) - 0.01) * 100);
}
/** What is left after Lulu and Stripe, as a share of the price (0.31 = 31%). */
function marginOf(priceCents, costCents, s = settings()) {
  const price = priceCents / 100;
  return (price - price * s.stripePct - s.stripeFixed - costCents / 100) / price;
}

// ---- Lulu ------------------------------------------------------------------------------------------------------
const base = () => String(process.env.LULU_API_BASE || 'https://api.lulu.com').replace(/\/$/, '');
const luluReady = () => !!(process.env.LULU_CLIENT_KEY && process.env.LULU_CLIENT_SECRET);
let tok = { v: '', exp: 0 };
async function luluToken(fetchFn) {
  if (tok.v && Date.now() < tok.exp - 60000) return tok.v;
  const basic = Buffer.from(process.env.LULU_CLIENT_KEY + ':' + process.env.LULU_CLIENT_SECRET).toString('base64');
  const r = await fetchFn(base() + '/auth/realms/glasstree/protocol/openid-connect/token', {
    method: 'POST', headers: { Authorization: 'Basic ' + basic, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials',
  });
  if (!r.ok) throw new Error('Lulu sign-in failed (' + r.status + '): check LULU_CLIENT_KEY / LULU_CLIENT_SECRET');
  const j = await r.json();
  tok = { v: j.access_token, exp: Date.now() + (Number(j.expires_in) || 300) * 1000 };
  return tok.v;
}
const money = (x) => { const n = Number(x); return Number.isFinite(n) ? n : NaN; };
/** Total Lulu charge in cents (print + shipping + their per-order fee + tax) for ONE copy shipped to one destination. */
async function luluCostCents(fetchFn, pod, pages, d) {
  const token = await luluToken(fetchFn);
  const r = await fetchFn(base() + '/print-job-cost-calculations/', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
    body: JSON.stringify({
      currency: 'CAD',
      line_items: [{ page_count: pages, pod_package_id: pod, quantity: 1 }],
      shipping_address: { name: 'TownTales Price Check', street1: d.street, city: d.city, state_code: d.state, postcode: d.postcode, country_code: 'CA', phone_number: '4165550100' },
      shipping_option: process.env.LULU_SHIPPING_LEVEL || 'GROUND',
    }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(d.city + ': Lulu ' + r.status + ' ' + text.slice(0, 200));
  const j = JSON.parse(text);
  // Tax counts as cost on purpose: it only comes back if we are not registered to reclaim it.
  let total = money(j.total_cost_incl_tax);
  if (!Number.isFinite(total)) total = money(j.total_cost_excl_tax);
  if (!Number.isFinite(total) || total <= 0) throw new Error(d.city + ': Lulu answered without a total');
  const cur = String(j.currency || 'CAD').toUpperCase();
  if (cur !== 'CAD') total *= cur === 'USD' ? num('LULU_USD_TO_CAD', 1.40) : NaN;
  if (!Number.isFinite(total)) throw new Error('Lulu answered in ' + cur + ', which we can not convert');
  return Math.round(total * 100);
}

// ---- quote (cached a day per edition + page count) ----------------------------------------------------------
const cache = new Map();
const TTL = () => num('BOOK_PRICE_CACHE_HOURS', 24) * 3600000;
/**
 * { edition, pages, costCents, priceCents, margin, worst, perCity } for one copy, shipped free anywhere in Canada.
 * Throws if Lulu is not set up or any destination can not be priced (never guesses a low number).
 */
async function quote(edition, pages, fetchFn = fetch) {
  const ed = EDITIONS[edition];
  if (!ed) throw new Error('unknown edition ' + edition);
  const n = Math.max(ed.minPages, Math.round(Number(pages) || 0));
  if (!luluReady()) throw new Error('Lulu keys are not set');
  const pod = ed.pod();
  const key = pod + '|' + n;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL()) return hit.q;
  const results = await Promise.allSettled(DESTINATIONS.map((d) => luluCostCents(fetchFn, pod, n, d)));
  const failed = results.map((r, i) => (r.status === 'rejected' ? r.reason.message : '')).filter(Boolean);
  if (failed.length) {
    if (hit) return hit.q; // Lulu hiccup: keep the last good price
    throw new Error('could not price ' + failed.length + ' destination(s): ' + failed.slice(0, 3).join(' | '));
  }
  const perCity = {};
  results.forEach((r, i) => { perCity[DESTINATIONS[i].city] = r.value; });
  const worst = DESTINATIONS.reduce((a, d) => (perCity[d.city] > perCity[a.city] ? d : a), DESTINATIONS[0]);
  const costCents = perCity[worst.city];
  const priceCents = priceCentsFor(costCents);
  const q = { edition, pages: n, pod, costCents, priceCents, margin: marginOf(priceCents, costCents), worst: worst.city, perCity };
  cache.set(key, { at: Date.now(), q });
  return q;
}

const fmt = (cents) => '$' + (cents / 100).toFixed(2).replace(/\.00$/, '');

// ---- Stripe Checkout (price differs per book, so Payment Links can not be used) --------------------------------
const stripeReady = () => /^(sk|rk)_(live|test)_[A-Za-z0-9]+$/.test(String(process.env.STRIPE_SECRET_KEY || '').trim());
function form(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v == null) continue;
    if (Array.isArray(v)) v.forEach((x, i) => (x && typeof x === 'object' ? form(x, `${key}[${i}]`, out) : out.push([`${key}[${i}]`, String(x)])));
    else if (typeof v === 'object') form(v, key, out);
    else out.push([key, String(v)]);
  }
  return out;
}
async function checkoutUrl({ town, townName, edition, qte, site }, fetchFn = fetch) {
  const ed = EDITIONS[edition];
  const ref = ('book_' + town).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 200);
  const body = new URLSearchParams(form({
    mode: 'payment', client_reference_id: ref,
    success_url: site + '/books/thanks', cancel_url: site + '/' + town + '/book',
    line_items: [{ quantity: 1, adjustable_quantity: { enabled: 'true', minimum: 1, maximum: 10 },
      price_data: { currency: 'cad', unit_amount: qte.priceCents, product_data: { name: `${townName}: a TownTales history (${ed.name.toLowerCase()})`, description: `${qte.pages} pages, printed to order. Free shipping in Canada.` } } }],
    shipping_address_collection: { allowed_countries: ['CA'] },
    phone_number_collection: { enabled: 'true' },
    metadata: { town, edition, pages: qte.pages, pod_package_id: qte.pod, lulu_cost_cents: qte.costCents, price_cents: qte.priceCents, worst_destination: qte.worst },
  }));
  const r = await fetchFn('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST', headers: { Authorization: 'Bearer ' + String(process.env.STRIPE_SECRET_KEY).trim(), 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.url) throw new Error('Stripe: ' + ((j.error && j.error.message) || r.status));
  return j.url;
}

module.exports = { EDITIONS, DESTINATIONS, settings, priceCentsFor, marginOf, quote, fmt, stripeReady, luluReady, checkoutUrl, form };
