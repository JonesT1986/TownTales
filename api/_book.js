// "Get the Wapella Book" page — /<town>/book, Wapella only for now.
// Free sample + request form (saves to the existing book_interest table). No payments.
// Everything shown comes from the live collection; nothing is hand-written about the town.
const { SITE, SB, KEY, PROV, PROV_SLUG, esc, q, page, send, notFound } = require('./_shell');
const bp = require('./_bookprice');

// Towns with a book file ready. sample = public URL of the free sample PDF (null until supplied).
// mainStreet = the town's main street photo used as the cover: { image, credit } (credit = who took it / where it's from).
// Rule: the cover is always the main street. No photo yet → illustrated cover + a request for one, and the town is
// listed in NEEDS_MAIN_STREET so it can be reported.
const BOOKS = {
  'wapella-sk': {
    pages: 78, sample: null, mainStreet: null,
    // "Look inside" images: /book-preview/<slug>/<file>.jpg, rendered from the print PDF (KDP edition, Nov 23 2026).
    look: {
      title: 'Wapella: Railway Town, Prairie Crossroads', format: '8.5 × 11 in · 78 pages · black & white inside',
      pages: [
        ['p3', 'Title page'], ['p7', 'Contents'], ['p9', 'Before You Begin'], ['p13', 'Chapter 1: Before the Townsite'],
        ['p14', 'Treaty 4 and the meaning of “Wapella”'], ['p19', 'Chapter 3: Crofters and Pioneers'], ['p23', 'Chapter 4: The Colony'],
        ['p24', 'Abraham Klenman and the families'], ['p25', 'The farmer-rabbi; life on a colony farm'], ['p49', 'The Roll of Remembrance'],
        ['p67', 'Wapella at a Glance'],
      ],
    },
  },
};
// Until each town has its own, every cover shows Wapella's main street, with a note under it.
// Put the photo at /img/wapella-main-street.jpg (in the site folder: img/wapella-main-street.jpg).
// Linked from prairie-towns.com; shown on previews only until permission / a print-quality scan is sorted out.
const SAMPLE_COVER = { town: 'Wapella', image: 'https://prairie-towns.com/wapella-7.jpg', credit: 'historic postcard, via prairie-towns.com' };
// Live site: the postcard only shows once permission is in hand. Set COVER_PHOTO_OK=1 in Vercel to switch it on.
const PHOTO_OK = process.env.VERCEL_ENV !== 'production' || process.env.COVER_PHOTO_OK === '1';
if (!PHOTO_OK) SAMPLE_COVER.image = '';
BOOKS['wapella-sk'].mainStreet = PHOTO_OK ? SAMPLE_COVER : null; // Wapella's own cover
// Printed-book ordering via Stripe Payment Links, set in Vercel: BOOK_PAPERBACK_LINK, BOOK_HARDCOVER_LINK
// (optional BOOK_PAPERBACK_PRICE / BOOK_HARDCOVER_PRICE, e.g. "$45", shown on the buttons). A link that isn't
// a https://buy.stripe.com/... address is ignored. Each order carries client_reference_id = "book_<town slug>",
// so the Stripe dashboard shows which town's book was bought. Only towns in BOOKS (book ready) get buttons.
function printCfg() {
  const link = (k) => { const v = String(process.env[k] || '').trim(); return /^https:\/\/buy\.stripe\.com\/[A-Za-z0-9_-]+$/.test(v) ? v : ''; };
  const price = (k) => String(process.env[k] || '').trim().slice(0, 20);
  return [
    { key: 'paperback', name: 'Paperback', blurb: 'Soft cover. Lighter, and easy to pass around the family.', link: link('BOOK_PAPERBACK_LINK'), price: price('BOOK_PAPERBACK_PRICE') },
    { key: 'hardcover', name: 'Hardcover', blurb: 'Hard cover. Made to last, for the shelf or as a gift.', link: link('BOOK_HARDCOVER_LINK'), price: price('BOOK_HARDCOVER_PRICE') },
  ].filter((e) => e.link);
}
const BLURB = { paperback: 'Soft cover. Lighter, and easy to pass around the family.', hardcover: 'Hard cover. Made to last, for the shelf or as a gift.' };
// Editions to offer for one town. When Lulu + Stripe keys are set, the price follows the book's page count
// (see _bookprice.js) and the button goes to our own checkout. Otherwise the old fixed Stripe Payment Links are used.
// Digital edition (PDF): a Stripe Payment Link set in Vercel as BOOK_DIGITAL_LINK, price text BOOK_DIGITAL_PRICE ($19.99 if empty).
// Nothing is printed or shipped, so it has no Lulu cost. The buyer is emailed the PDF by hand after paying.
function digitalCfg(slug, book) {
  const v = String(process.env.BOOK_DIGITAL_LINK || '').trim();
  if (!/^https:\/\/buy\.stripe\.com\/[A-Za-z0-9_-]+$/.test(v) || !(book && book.digital !== false)) return [];
  return [{ key: 'digital', name: 'Digital edition', blurb: 'The full book as a PDF, to read on any phone, tablet or computer. Emailed to you after you pay, usually within a day.', link: v, price: String(process.env.BOOK_DIGITAL_PRICE || '$19.99').trim().slice(0, 20), digital: true }];
}
async function editionsFor(slug, book) {
  return (await printEditions(slug, book)).concat(digitalCfg(slug, book));
}
async function printEditions(slug, book) {
  const fixed = printCfg();
  if (!(bp.luluReady() && bp.stripeReady() && book && book.pages)) return fixed;
  const out = [];
  for (const key of ['paperback', 'hardcover']) {
    try {
      const qte = await bp.quote(key, book.pages);
      out.push({ key, name: bp.EDITIONS[key].name, blurb: BLURB[key], link: `/books/checkout?town=${encodeURIComponent(slug)}&edition=${key}`, price: bp.fmt(qte.priceCents), internal: true });
    } catch (e) {
      console.error('book price', slug, key, String(e.message || e).slice(0, 300));
      const f = fixed.find((x) => x.key === key);
      if (f) out.push(f);
    }
  }
  return out;
}
const orderUrl = (link, slug, key) => link.startsWith('/') ? link : `${link}?client_reference_id=${encodeURIComponent(('book_' + slug + (key === 'digital' ? '_digital' : '')).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 200))}`;
const hasPrint = (eds) => eds.some((e) => !e.digital);
function orderSection(town, eds) {
  if (!eds.length) return '';
  const lulu = `<p class="small muted">Printed copies are made to order by <a href="https://www.lulu.com" rel="noopener">Lulu</a>, a print-on-demand publisher founded by Canadian Bob Young, and Canadian orders are normally printed at Lulu's print facility in Canada.</p>`;
  return `<section class="wrap stack" id="order"><h2>Buy the book</h2>
<p>Pick an edition. You'll pay on Stripe's secure page and Stripe emails you a receipt.${hasPrint(eds) ? ' For a printed copy you add your shipping address there.' : ''}${town.slug && BOOKS[town.slug] && BOOKS[town.slug].look ? ` Not sure yet? <a href="/${esc(town.slug)}/book/preview">Look inside the book first</a>.` : ''}</p>
<div class="bk-eds">${eds.map((e) => `<div class="rm-cem"><h3>${esc(e.name)}${e.price ? ` <span class="muted">${esc(e.price)}</span>` : ''}</h3><p>${esc(e.blurb)}</p>
<p style="margin-top:10px"><a class="btn" href="${esc(orderUrl(e.link, town.slug, e.key))}" rel="noopener">Buy the ${esc(e.name.toLowerCase())}${e.price ? ' · ' + esc(e.price) : ''}</a></p></div>`).join('')}</div>
${hasPrint(eds) ? `<p><b>Allow 4 to 6 weeks for your printed copy to arrive.</b> Each copy is printed after you order, with ${esc(town.name)}'s history as it stands that day, and shipping anywhere in Canada is included in the price.</p>${lulu}` : ''}
<p class="small muted">Questions? Email <a href="mailto:towntalesinfo@gmail.com">towntalesinfo@gmail.com</a>.</p>
</section>`;
}
function lookPage(res, town, book, eds) {
  const L = book.look, prov = PROV[town.prov] || town.prov, base = `/book-preview/${town.slug}/`;
  const buy = eds.length ? `<div class="btns">${eds.map((e) => `<a class="btn" href="${esc(orderUrl(e.link, town.slug, e.key))}" rel="noopener">Buy the ${esc(e.name.toLowerCase())}${e.price ? ' · ' + esc(e.price) : ''}</a>`).join('')}</div>`
    : `<div class="btns"><a class="btn" href="/${esc(town.slug)}/book#request">Request the book</a></div>`;
  const main = `<section class="wrap stack" style="padding-top:22px">
<p class="crumbs"><a href="/">TownTales</a> › <a href="/${esc(town.slug)}">${esc(town.name)}</a> › <a href="/${esc(town.slug)}/book">The ${esc(town.name)} Book</a> › Look inside</p>
<div class="bk-hero"><figure class="bk-fig"><img class="lk-cover" src="${base}cover.jpg" alt="Front cover of ${esc(L.title)}" width="936" height="1212"></figure>
<div class="stack"><p class="eyebrow">Look inside</p><h1>${esc(L.title)}</h1>
<p class="lede">Turn through real pages from the printed book: ${esc(L.format)}. Every fact is sourced, and the Roll of Remembrance names ${esc(town.name)}’s people one by one.</p>
${buy}<p class="small muted">Printed when you order. Allow 4 to 6 weeks for delivery. Shipping anywhere in Canada is included.</p></div></div></section>
<section class="wrap stack"><h2>Sample pages</h2><p class="small muted">Tap a page to see it full size.</p>
<div class="lk-grid">${L.pages.map(([f, cap], i) => `<figure class="lk-pg"><a href="${base}${f}.jpg" target="_blank" rel="noopener"><img src="${base}${f}.jpg" alt="Page: ${esc(cap)}" loading="${i < 3 ? 'eager' : 'lazy'}" width="935" height="1210"></a><figcaption>${esc(cap)}</figcaption></figure>`).join('')}</div></section>
<section class="wrap stack" id="order"><h2>Get your copy</h2>${buy}<p><a href="/${esc(town.slug)}/book">More about the book</a></p></section>
<style>.lk-cover{width:100%;max-width:360px;display:block;box-shadow:0 10px 24px rgba(30,41,48,.35)}.lk-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,230px),1fr));gap:22px}.lk-pg{margin:0}.lk-pg img{width:100%;height:auto;display:block;border:1px solid #cfc6b0;box-shadow:0 4px 12px rgba(30,41,48,.18);background:#fff}.lk-pg figcaption{font-size:.95rem;margin-top:6px;color:var(--ink-2)}</style>`;
  send(res, 200, page({
    title: `Look inside: ${L.title} | TownTales`,
    desc: `Sample pages from the printed history of ${town.name}, ${prov}: ${L.format}.`,
    canonical: `${SITE}/${town.slug}/book/preview`, main,
  }), 'public, s-maxage=600, stale-while-revalidate=86400');
}
function thanksPage(res, digital) {
  const main = `<section class="wrap stack" style="padding-top:28px">
<p class="eyebrow">Your book order</p>
<h1>Thank you</h1>
<div class="rm-ok"><p>Your order went through, and Stripe has emailed you a receipt.</p>
${digital ? '<p>We will email your PDF to the address you paid with, usually within a day. If it has not arrived in 48 hours, check your spam folder, then write to us.</p>'
  : '<p>We print each copy after it is ordered, then mail it to the address you gave. Please allow 4 to 6 weeks for it to arrive. We will email you when it ships.</p>'}</div>
<p>Questions or a change to your order? Email <a href="mailto:towntalesinfo@gmail.com">towntalesinfo@gmail.com</a>.</p>
<p><a class="btn alt" href="/#towns">Back to TownTales</a></p>
</section>`;
  send(res, 200, page({ title: 'Thank you for your order | TownTales', desc: 'Thank you for ordering a TownTales book.', main, noindex: true }), 'private, no-store');
}
const NEEDS_MAIN_STREET = Object.keys(BOOKS).filter((k) => !(BOOKS[k].mainStreet && BOOKS[k].mainStreet.image));

// Finished books that aren't hard-coded above: rows in town_books, added from the admin ("Mark book ready").
async function dbBook(slug) {
  if (!/^[a-z0-9-]{2,80}$/.test(slug || '')) return null;
  try {
    const [r] = await q(`town_books?slug=eq.${encodeURIComponent(slug)}&select=pages,title`);
    return r ? { pages: r.pages, title: r.title || '', sample: null, mainStreet: null, look: null } : null;
  } catch (e) { return null; }
}
// How many people asked for each town's book (counts only; the database function never returns names or emails).
async function requestCounts() {
  try {
    const r = await fetch(`${SB}/rest/v1/rpc/book_request_counts`, { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(4000) });
    if (!r.ok) return {};
    return Object.fromEntries((await r.json()).map((x) => [x.town, x.n]));
  } catch (e) { return {}; }
}
// Towns with a finished book: [{ slug, name, prov, pages, title, revision, revised_at }]
async function finishedBooks() {
  const out = [];
  try {
    const rows = await q('town_books?select=slug,pages,title,revision,revised_at&order=ready_at.desc');
    const slugs = new Set(Object.keys(BOOKS).concat(rows.map((r) => r.slug)));
    const towns = await q('towns?select=slug,name,prov&hidden=eq.false&slug=in.(' + [...slugs].map(encodeURIComponent).join(',') + ')');
    for (const t of towns) {
      const row = rows.find((r) => r.slug === t.slug), b = BOOKS[t.slug] || row;
      if (b) out.push({ slug: t.slug, name: t.name, prov: t.prov, pages: (row && row.pages) || b.pages, title: (b.look && b.look.title) || (row && row.title) || '', revision: (row && row.revision) || 1, revised_at: (row && row.revised_at) || null });
    }
  } catch (e) { /* none yet */ }
  return out;
}
const fmtDay = (iso) => { try { return new Date(iso).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'America/Regina' }); } catch (e) { return ''; } };
const revText = (b) => `Revision ${b.revision || 1}${b.revised_at ? ' · updated ' + fmtDay(b.revised_at) : ''}`;
const shelfCard = (b) => `<a class="bk-shelf-card" href="/${esc(b.slug)}/book"><div class="bk-cover"><div class="bk-cover-in"><p class="bk-kicker">A TownTales history</p><p class="bk-title">${esc(b.name)}</p><p class="bk-prov">${esc(PROV[b.prov] || b.prov)}</p></div></div><span class="bk-shelf-meta"><b>${esc(b.name)}</b><br><span class="small muted">${b.pages} pages · paperback, hardcover or digital</span><br><span class="small muted bk-rev">${esc(revText(b))}</span></span><span class="btn sm">See the book</span></a>`;
const SHELF_CSS = '<style>.bk-shelf{display:flex;flex-wrap:wrap;gap:34px;align-items:flex-start}.bk-shelf-card{display:flex;flex-direction:column;gap:10px;align-items:flex-start;text-decoration:none;color:inherit;max-width:240px;padding:4px 14px 8px 4px}.bk-shelf-card .bk-cover{margin:0;width:170px}.bk-next{display:flex;flex-wrap:wrap;gap:8px 22px;list-style:none;padding:0;margin:0}</style>';

// /books — every town that has a finished book, with its revision number, plus the towns people are asking for.
async function booksIndex(res) {
  const [done, counts] = await Promise.all([finishedBooks(), requestCounts()]);
  const have = new Set(done.map((b) => b.slug));
  const want = Object.entries(counts).filter(([slug]) => !have.has(slug)).sort((a, b) => b[1] - a[1]).slice(0, 24);
  let wantTowns = [];
  if (want.length) { try { wantTowns = (await q('towns?select=slug,name,prov&hidden=eq.false&slug=in.(' + want.map(([slug]) => encodeURIComponent(slug)).join(',') + ')')).filter((t) => counts[t.slug] > 0); } catch (e) { wantTowns = []; } }
  const next = wantTowns.map((t) => `<li><a href="/${esc(t.slug)}/book#request">${esc(t.name)}</a>${counts[t.slug] >= 5 ? ` <span class="small muted">· ${counts[t.slug]} requests</span>` : ''}</li>`).join('');
  const main = `<section class="wrap stack" style="padding-top:22px"><p class="crumbs"><a href="/">TownTales</a> › Books</p>
<p class="eyebrow">TownTales books</p><h1>Town history books</h1>
<p class="lede">Each book is built from a town's TownTales page: the timeline, the people, the cemeteries and the teams, with every source. Printed to order by <a href="https://www.lulu.com" rel="noopener">Lulu</a>, a print-on-demand publisher founded by Canadian Bob Young, with free shipping anywhere in Canada. Allow 4 to 6 weeks for a printed copy.</p>
<p><b>The more history is added to a town's page, the better its book will be.</b> Every photo, story, clipping and name shared on TownTales goes into that town's next revision. <a href="/#upload">Share something about your town</a>.</p>
<p class="small muted">A book's revision number goes up each time it is updated with new history from its town's page. The number under each book tells you which version you'd get.</p>
<h2>${done.length ? 'Books you can buy now' : 'No books are finished yet'}</h2>
${done.length ? `<div class="bk-shelf">${done.map(shelfCard).join('')}</div>` : '<p>The first books are being finished. Request your town\'s below and we\'ll email you the day it is ready.</p>'}
<h2>Don't see your town's book yet?</h2>
<p>Find your town and request its book. When it's finished we'll email you a link to look through it first.</p>
<p><a class="btn" href="/">Find my town</a></p>
${next ? `<h3>Towns people are asking for</h3><ul class="bk-next">${next}</ul>` : ''}
${SHELF_CSS}</section>`;
  send(res, 200, page({ title: 'Town history books | TownTales', desc: 'Printed and digital history books for small prairie towns, built from each town\'s TownTales page. Free shipping in Canada.', canonical: `${SITE}/books`, main }), 'public, s-maxage=600, stale-while-revalidate=86400');
}

// /<town>/book/sample — sample pages built from the town's live TownTales data, for any town (no finished book needed).
const surnameOf = (name) => { const n = String(name || '').trim(); if (n.includes(',')) return n.split(',')[0].toLowerCase(); const w = n.split(/\s+/).filter(Boolean); while (w.length > 1 && /^(jr|sr|ii|iii|iv|mrs|mr|dr)\.?$/i.test(w[w.length - 1])) w.pop(); return (w[w.length - 1] || '').toLowerCase(); };
const SAMPLE_CSS = `<style>
.sp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,330px),1fr));gap:30px;align-items:start}
.sp-fig{margin:0}.sp-fig figcaption{font-size:.92rem;color:var(--ink-2);margin-top:8px;line-height:1.4}
.sp-page{aspect-ratio:8.5/11;background:#fffdf7;border:1px solid #d8cfb8;box-shadow:0 1px 0 #efe7d4,0 10px 24px rgba(30,41,48,.22);padding:10% 9.5% 9%;overflow:hidden;font-family:"Crimson Text",Georgia,"Times New Roman",serif;color:#1E2930;font-size:clamp(.64rem,1.45vw,.8rem);line-height:1.5;position:relative;text-align:justify;hyphens:auto}
.sp-page::after{content:"SAMPLE";position:absolute;top:3%;right:4%;font:700 .62em/1 var(--hand);letter-spacing:.16em;color:#B4512C;border:1px solid #B4512C;padding:.25em .5em;opacity:.75}
.sp-n{position:absolute;left:0;right:0;bottom:3.5%;text-align:center;font-size:.8em;color:#7a6f5a}
.sp-kick{font:700 .78em/1 var(--display);letter-spacing:.32em;text-transform:uppercase;color:#5b6770;margin:12% 0 .4em}
.sp-ch{font-family:var(--display);font-weight:900;text-transform:uppercase;font-size:2.5em;line-height:.95;margin:0 0 .7em;text-align:left}
.sp-lede{font-size:1.16em;line-height:1.45;margin:0 0 1em}
.sp-lede::first-letter{float:left;font-family:var(--display);font-weight:900;font-size:3.3em;line-height:.82;margin:.06em .1em 0 0;color:#B4512C}
.sp-h{font-family:var(--display);font-weight:900;text-transform:uppercase;font-size:1.05em;letter-spacing:.02em;margin:1em 0 .3em;text-align:left}
.sp-page p{margin:0 0 .7em}
.sp-page sup{font-size:.65em;color:#B4512C;font-weight:700}
.sp-fn{position:absolute;left:9.5%;right:9.5%;bottom:7%;border-top:1px solid #cfc6b0;padding-top:.4em;font-size:.72em;line-height:1.35;color:#5b6770;text-align:left}
.sp-plate{display:block;width:100%;height:auto;border:1px solid #1E2930;margin:.3em 0 .6em;background:#f3ead6}
.sp-cap{font-style:italic;font-size:.9em;text-align:center;color:#4a5560;margin:0 0 .9em}
.sp-pull{font-family:var(--display);font-weight:900;font-size:1.35em;line-height:1.15;text-transform:uppercase;color:#B4512C;border-top:2px solid #B4512C;border-bottom:2px solid #B4512C;padding:.5em 0;margin:.8em 0;text-align:left}
.sp-cols{columns:2;column-gap:1.6em;text-align:left}
.sp-roll li{break-inside:avoid;margin:0 0 .5em;list-style:none}
.sp-roll{padding:0;margin:0}
.sp-roll .d{display:block;color:#7a6f5a;font-size:.88em}
.sp-cover{background:#2B5C80;color:#FFF8EC;text-align:center;display:flex;flex-direction:column;justify-content:space-between;padding:8% 8% 7%}
.sp-cover::after{color:#E3B34A;border-color:#E3B34A}
.sp-cover .k{font:700 .75em/1 var(--hand);letter-spacing:.14em;text-transform:uppercase;color:#E3B34A;margin-top:6%}
.sp-cover .t{font-family:var(--display);font-weight:900;font-size:3.4em;line-height:.9;text-transform:uppercase;margin:.15em 0}
.sp-cover .pv{font-size:1.1em}
.sp-cover .f{font-size:.78em;color:#E3B34A;border-top:1px solid #E3B34A;padding-top:.6em}
.sp-real{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,210px),1fr));gap:20px}
.sp-real img{width:100%;height:auto;display:block;border:1px solid #cfc6b0;box-shadow:0 6px 14px rgba(30,41,48,.18);background:#fff}
.sp-spec{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:14px;max-width:980px;list-style:none;padding:0;margin:0}
.sp-spec li{background:var(--sunk,#f1ead9);border-left:4px solid #B4512C;padding:12px 14px;border-radius:2px}
.sp-spec b{display:block;font-family:var(--display);font-size:1.15rem;text-transform:uppercase;margin-bottom:2px}
.sp-note{max-width:820px}
.sp-photo{display:block;width:100%;height:auto;max-height:46%;object-fit:cover;border:1px solid #1E2930;filter:grayscale(1) contrast(1.05);margin:.2em 0 .4em}
.sp-photo.sp-half{max-height:34%}
.sp-cover .sp-photo{filter:none;max-height:52%;border:3px solid #E3B34A}
.sp-plate-page{display:flex;flex-direction:column;justify-content:center;height:100%}
.sp-photo.sp-full{max-height:82%}
.sp-cr{font-style:normal;font-size:.85em;color:#7a6f5a}
.sp-title{display:flex;flex-direction:column;justify-content:center;text-align:center;height:100%}
.sp-title .k{letter-spacing:.16em;text-transform:uppercase;font-size:.75em;color:#B4512C;margin:0}
.sp-title .t{font-family:var(--display);font-weight:900;font-size:3em;line-height:.95;text-transform:uppercase;margin:.25em 0}
.sp-orn{font-size:1.6em;color:#B4512C;margin:.6em 0}
.sp-imprint{margin-top:3em;font-size:.82em;color:#5b6770}
.sp-toc{list-style:none;padding:0;margin:0;text-align:left}
.sp-toc li{display:flex;align-items:baseline;gap:.4em;margin:0 0 .75em;font-size:1.08em}
.sp-toc .dots{flex:1;border-bottom:1px dotted #9a8f78}
.sp-src{padding-left:1.4em;text-align:left;font-size:.92em}
.sp-src li{margin:0 0 .45em}
</style>`;

// An engraved-style plate of a prairie town (original artwork, used where the town has no photographs yet).
function plateSvg(seed) {
  const h = [...String(seed)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const elevX = 250 + (h % 60), sun = 60 + (h % 90);
  let hatch = '';
  for (let y = 18; y < 118; y += 5) hatch += `<path d="M0 ${y}h400" stroke="#cdbf9e" stroke-width=".6"/>`;
  let furrows = '';
  for (let i = 0; i < 14; i++) furrows += `<path d="M${-40 + i * 34} 240L${200 + (i - 7) * 8} 168" stroke="#8c7a55" stroke-width=".8"/>`;
  return `<svg class="sp-plate" viewBox="0 0 400 240" role="img" aria-label="Illustration of a prairie railway town"><rect width="400" height="240" fill="#f3ead6"/>${hatch}<circle cx="${sun}" cy="62" r="20" fill="#f3ead6" stroke="#8c7a55" stroke-width="1.2"/>
<path d="M0 168h400v72H0z" fill="#e6d8b4"/>${furrows}
<path d="M0 166h400" stroke="#1E2930" stroke-width="2"/><path d="M0 172h400M0 176h400" stroke="#1E2930" stroke-width="1"/>
${Array.from({ length: 40 }, (_, i) => `<path d="M${i * 10} 170v8" stroke="#1E2930" stroke-width="1.4"/>`).join('')}
<g stroke="#1E2930" stroke-width="1.6" fill="#f8f1df"><path d="M${elevX} 166V70l18-20 18 20v96z"/><path d="M${elevX - 2} 70h40"/><path d="M${elevX + 36} 166v-52h34v52z"/><path d="M${elevX + 8} 92h20v12h-20z" fill="#e6d8b4"/></g>
<g stroke="#1E2930" stroke-width="1.6" fill="#f8f1df"><path d="M70 166v-38h80v38z"/><path d="M62 130l48-22 48 22z" fill="#d9c79c"/><path d="M84 142h12v14H84zM122 142h12v14h-12z" fill="#e6d8b4"/><path d="M100 166v-20h14v20"/></g>
<g stroke="#1E2930" stroke-width="1.4" fill="#f8f1df"><path d="M170 166v-24h22v24zM196 166v-30h26v30zM226 166v-20h18v20z"/></g>
<path d="M330 120c12-10 22 4 34-6" stroke="#8c7a55" fill="none" stroke-width="1.2"/><path d="M20 40c16-8 30 2 46-4" stroke="#8c7a55" fill="none" stroke-width="1"/></svg>`;
}

function farmPlateSvg() {
  let sky = ''; for (let y = 14; y < 120; y += 5) sky += `<path d="M0 ${y}h400" stroke="#cdbf9e" stroke-width=".6"/>`;
  let rows = ''; for (let i = 0; i < 16; i++) rows += `<path d="M0 ${150 + i * 6}c120-6 280 6 400 0" stroke="#8c7a55" stroke-width=".7" fill="none"/>`;
  return `<svg class="sp-plate" viewBox="0 0 400 240" role="img" aria-label="Illustration of a prairie homestead"><rect width="400" height="240" fill="#f3ead6"/>${sky}<path d="M0 146h400v94H0z" fill="#e6d8b4"/>${rows}
<g stroke="#1E2930" stroke-width="1.6" fill="#f8f1df"><path d="M60 146v-46h70v46z"/><path d="M52 102l43-30 43 30z" fill="#d9c79c"/><path d="M86 146v-22h18v22z" fill="#e6d8b4"/><path d="M150 146v-30h46v30z"/><path d="M144 118l29-18 29 18z" fill="#d9c79c"/><path d="M164 128h12v10h-12z" fill="#e6d8b4"/></g>
<g stroke="#1E2930" stroke-width="1.4" fill="none"><path d="M300 146l12-80 12 80M304 120h16M302 132h20"/><path d="M312 66l-16-10M312 66l16-10M312 66l-10 16M312 66l10 16"/><circle cx="312" cy="66" r="2" fill="#1E2930"/></g>
<g stroke="#1E2930" stroke-width="1.2">${Array.from({ length: 12 }, (_, i) => `<path d="M${215 + i * 15} 146v-14"/>`).join('')}<path d="M212 136h170M212 141h170"/></g>
<path d="M30 46c18-8 32 3 50-3M250 34c14-6 26 2 40-2" stroke="#8c7a55" fill="none"/></svg>`;
}

// Free-to-use photographs of a town from Wikimedia Commons (public domain or CC BY / BY-SA only), with credits. Cached a day.
const PHOTO_CACHE = new Map();
const stripTags = (h) => String(h || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();
async function townPhotos(town) {
  const key = town.slug, hit = PHOTO_CACHE.get(key);
  if (hit && Date.now() - hit.at < 864e5) return hit.list;
  let list = [];
  try {
    const provName = PROV[town.prov] || town.prov;
    const url = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({
      action: 'query', format: 'json', generator: 'search', gsrsearch: `"${town.name}" ${provName} filetype:bitmap`, gsrnamespace: '6', gsrlimit: '20',
      prop: 'imageinfo', iiprop: 'url|extmetadata|mime|size', iiurlwidth: '1000',
    });
    const r = await fetch(url, { headers: { 'User-Agent': 'TownTales/1.0 (https://www.towntales.ca; towntalesinfo@gmail.com)' }, signal: AbortSignal.timeout(4000) });
    if (r.ok) {
      const pages = Object.values(((await r.json()).query || {}).pages || {}).sort((x, y) => (x.index || 0) - (y.index || 0));
      const nameRe = new RegExp(town.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      for (const pg of pages) {
        const ii = (pg.imageinfo || [])[0]; if (!ii || !ii.thumburl) continue;
        const md = ii.extmetadata || {}, lic = stripTags(md.LicenseShortName && md.LicenseShortName.value);
        if (!/^(public domain|pd|cc0|cc[ -]by(-sa)?( \d\.\d)?)/i.test(lic) || /nc|nd/i.test(lic.replace(/^cc[ -]by-sa/i, ''))) continue;
        if (!/jpe?g|png/i.test(ii.mime || '') || (ii.width || 0) < 700) continue;
        if (/\b(map|logo|flag|coat of arms|locator|location|seal|diagram|chart|graph|sign)\b/i.test(pg.title)) continue;
        const desc = stripTags(md.ImageDescription && md.ImageDescription.value);
        if (!nameRe.test(pg.title + ' ' + desc)) continue;
        const caption = (desc || pg.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, '').replace(/[_-]+/g, ' ')).slice(0, 140);
        const artist = stripTags(md.Artist && md.Artist.value).slice(0, 60);
        list.push({ src: ii.thumburl, page: ii.descriptionurl, caption, credit: [artist || 'Unknown', lic, 'Wikimedia Commons'].join(' · '), wide: (ii.width || 0) >= (ii.height || 1) });
        if (list.length >= 5) break;
      }
    }
  } catch (e) { list = []; }
  PHOTO_CACHE.set(key, { at: Date.now(), list });
  return list;
}

async function samplePage(res, town) {
  const s = encodeURIComponent(town.slug), prov = PROV[town.prov] || town.prov;
  const [timeline, items, people, cems, teams, photos, revRow] = await Promise.all([
    q(`timeline?town=eq.${s}&select=year,label,title,body,cat,item_ids&order=year,sort`, { all: true }).catch(() => []),
    q(`items?town=eq.${s}&status=eq.published&select=id,kind,title,body,date_label,source,image_url`, { all: true }).catch(() => []),
    q(`memorials?town=eq.${s}&status=eq.published&select=name,birth_date_label,death_date_label`, { all: true }).catch(() => []),
    q(`cemeteries?town=eq.${s}&select=name&order=name`).catch(() => []),
    q(`teams?town=eq.${s}&select=id`).catch(() => []),
    townPhotos(town),
    q(`town_books?slug=eq.${s}&select=revision`).then((r) => r[0]).catch(() => null),
  ]);
  const n = (x) => Number(x).toLocaleString('en-CA');
  const cut = (t, max) => { t = String(t || '').replace(/\s+/g, ' ').trim(); if (t.length <= max) return t; const i = t.lastIndexOf('. ', max); return i > max * 0.5 ? t.slice(0, i + 1) : t.slice(0, t.lastIndexOf(' ', max)) + '…'; };
  const AVOID = /unverified|klan|kkk|murder|killed|kills|suicide|massacre|scandal|disputed/i;
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  const ownPhotos = items.filter((i) => i.image_url).map((i) => ({ src: i.image_url, caption: i.title || '', credit: i.source || 'TownTales archive', wide: true }));
  const pics = ownPhotos.concat(photos);
  let picAt = 0; const nextPic = () => pics[picAt++] || null;

  // Footnoted sources, numbered in the order they're used.
  const notes = [];
  const noteFor = (t) => {
    const src = (Array.isArray(t.item_ids) ? t.item_ids : []).map((id) => byId[id] && byId[id].source).find(Boolean);
    if (!src) return '';
    let k = notes.indexOf(src); if (k < 0) { notes.push(src); k = notes.length - 1; }
    return `<sup>${k + 1}</sup>`;
  };
  const fnBox = (from, to) => to > from ? `<div class="sp-fn">${notes.slice(from, to).map((x, i) => `${from + i + 1}. ${esc(cut(x, 100))}`).join('<br>')}</div>` : '';
  // Lay out timeline entries as chapter prose, filling pages up to a character budget.
  const usable = timeline.filter((t) => t.body && t.body.length > 80 && !AVOID.test(t.title + ' ' + t.body));
  const used = new Set();
  const fill = (pool, budget, lede) => {
    const out = [];
    for (const t of pool) {
      if (used.has(t)) continue;
      const body = cut(t.body, 420);
      if (budget - body.length < 0 && out.length) break;
      used.add(t); budget -= body.length + 70;
      out.push(lede && !out.length ? `<p class="sp-lede">${esc(body)}${noteFor(t)}</p>` : `<p class="sp-h">${esc(t.title)}</p><p>${esc(body)}${noteFor(t)}</p>`);
    }
    return out.join('');
  };
  const isCh2 = (t) => /railway|business|main street|economy|industry|agricult|farm/i.test(t.cat || '');
  const isCh3 = (t) => /church|school|community|health|war|military|sport|culture|recreation/i.test(t.cat || '');
  const early = usable.filter((t) => !isCh2(t) && !isCh3(t));
  const ch2Pool = usable.filter(isCh2), ch3Pool = usable.filter(isCh3);

  const pg = (inner, num, cls = '') => `<div class="sp-page ${cls}">${inner}${num ? `<span class="sp-n">${num}</span>` : ''}</div>`;
  const fig = (pageHtml, cap) => `<figure class="sp-fig">${pageHtml}<figcaption>${cap}</figcaption></figure>`;
  const picHtml = (pic, cls = '') => pic ? `<img class="sp-photo ${cls}" src="${esc(pic.src)}" alt="${esc(pic.caption)}" loading="lazy"><p class="sp-cap">${esc(cut(pic.caption, 120))}<br><span class="sp-cr">Photo: ${esc(pic.credit)}</span></p>` : '';
  const out = [];

  // 1. Cover
  const coverPic = pics.find((p) => p.wide) || null;
  out.push(fig(pg(`<p class="k">A TownTales history</p><div><p class="t">${esc(town.name)}</p><p class="pv">${esc(prov)}</p></div>${coverPic ? `<img class="sp-photo sp-cover-photo" src="${esc(coverPic.src)}" alt="">` : plateSvg(town.slug)}<p class="f">Every fact sourced · Every name remembered</p>`, '', 'sp-cover'),
    `The cover, in full colour. ${coverPic ? `Photo: ${esc(cut(coverPic.credit, 90))}.` : `The finished book puts a photograph of ${esc(town.name)}'s main street here.`}`));
  if (coverPic) pics.splice(pics.indexOf(coverPic), 1);

  // 2. Title page
  out.push(fig(pg(`<div class="sp-title"><p class="k">A TownTales history</p><p class="t">${esc(town.name)}</p><p>${esc(prov)}</p><p class="sp-orn">❦</p><p style="font-style:italic">The story of a prairie town, told from its own records, newspapers, land grants and families.</p><p class="sp-imprint">Revision ${(revRow && revRow.revision) || 1} · Printed to order by Lulu<br>TownTales · towntales.ca</p></div>`, ''),
    'The title page, with the revision number of your copy.'));

  // 3. Contents
  let chN = 0;
  const chapters = [
    ['Beginnings', 1], ch2Pool.length && ['The Railway and Main Street', 9], ch3Pool.length && ['Faith, School and Community', 17], items.length && ['From the Archive', 27],
  ].filter(Boolean).map(([t, p]) => [String(++chN), t, p]).concat([people.length && ['', 'The Roll of Remembrance', 49], ['', 'Sources', 74]].filter(Boolean));
  out.push(fig(pg(`<h3 class="sp-ch" style="font-size:1.9em;margin-top:8%">Contents</h3><ol class="sp-toc">${chapters.map(([c, t, p]) => `<li><span>${c ? `<b>${c}</b> ` : ''}${esc(t)}</span><span class="dots"></span><span>${p || ''}</span></li>`).join('')}</ol><p style="margin-top:1.5em;font-style:italic;text-align:left">${timeline.length ? `With ${n(timeline.length)} dated events, ` : ''}${items.length ? `${n(items.length)} archive pieces` : ''}${people.length ? ` and ${n(people.length)} names` : ''}.</p>`, 'v'),
    'Contents. Page numbers in this sample are approximate.'));

  // 4–5. Chapter 1
  const n0 = notes.length; const c1 = fill(early.length ? early : usable, 1250, true); const n1 = notes.length;
  if (c1) out.push(fig(pg(`<p class="sp-kick">Chapter 1</p><h3 class="sp-ch">Beginnings</h3>${c1}${fnBox(n0, n1)}`, '1'), `Chapter 1 opens with ${esc(town.name)}'s own story, written in full sentences, with every fact numbered to its source.`));
  const p5pic = nextPic(); const c1b = fill(early.length ? early : usable, p5pic ? 520 : 1100, false); const n2 = notes.length;
  if (c1b) out.push(fig(pg(`${p5pic ? picHtml(p5pic) : farmPlateSvg() + `<p class="sp-cap">A homestead near ${esc(town.name)}, as the first settlers built them. Illustration.</p>`}${c1b}${fnBox(n1, n2)}`, '2'), 'Photographs run through the chapters, each with a caption and credit. Inside pages print in black and white.'));

  // 6. Full-page photograph
  const fullPic = nextPic();
  if (fullPic) out.push(fig(pg(`<div class="sp-plate-page"><img class="sp-photo sp-full" src="${esc(fullPic.src)}" alt="${esc(fullPic.caption)}" loading="lazy"><p class="sp-cap">${esc(cut(fullPic.caption, 140))}<br><span class="sp-cr">Photo: ${esc(fullPic.credit)}</span></p></div>`, '8'), 'Full-page photographs, printed large.'));

  // 7. Chapter 2
  const n3 = notes.length; const c2 = fill(ch2Pool, 950, true); const n4 = notes.length;
  if (c2) { const pic = nextPic(); out.push(fig(pg(`<p class="sp-kick">Chapter 2</p><h3 class="sp-ch">The Railway and Main Street</h3>${pic ? picHtml(pic, 'sp-half') : ''}${c2}${fnBox(n3, n4)}`, '9'), `Chapter 2 follows the railway, the stores and the businesses that made ${esc(town.name)} a town.`)); }

  // 8. Chapter 3
  const n5 = notes.length; const c3 = fill(ch3Pool, 1000, true); const n6 = notes.length;
  if (c3) out.push(fig(pg(`<p class="sp-kick">Chapter ${c2 ? 3 : 2}</p><h3 class="sp-ch">Faith, School and Community</h3>${c3}${fnBox(n5, n6)}`, '17'), 'Churches, schools, halls and the people who ran them.'));

  // 9–10. Archive features
  const feats = items.filter((i) => i.body && i.body.length > 250 && !AVOID.test(i.title + ' ' + i.body)).sort((a, b) => b.body.length - a.body.length).slice(0, 2);
  const sentences = (t) => String(t).replace(/\s+/g, ' ').split(/(?<!\b(?:Sgt|Mr|Mrs|Dr|St|Lt|Col|Gen|Capt|Rev|Jr|Sr|No|Maj|Ste)\.)(?<=[a-z0-9)'"][.!?])\s+(?=[A-Z])/);
  feats.forEach((f, i) => {
    const pull = sentences(f.body).slice(1).find((x) => x.length > 40 && x.length < 200) || '';
    const pic = i === 1 ? nextPic() : null;
    out.push(fig(pg(`<p class="sp-kick">From the archive</p><h3 class="sp-ch" style="font-size:1.6em">${esc(cut(f.title, 70))}</h3>${i === 0 && pull ? `<p class="sp-pull">“${esc(pull.trim())}”</p>` : ''}${pic ? picHtml(pic, 'sp-half') : ''}<p>${esc(cut(f.body, i === 0 ? 950 : 700))}</p><p class="sp-cap" style="text-align:left">${esc(cut([f.date_label, f.source].filter(Boolean).join(' · '), 120))}</p>`, String(27 + i * 3)),
      i === 0 ? `Stories from ${esc(town.name)}'s archive are set as features, with their source.` : 'Every archive piece in the book keeps its date and where it came from.'));
  });

  // 11. Roll of Remembrance
  const roll = people.filter((m) => m.name).slice().sort((a, b) => surnameOf(a.name).localeCompare(surnameOf(b.name)) || String(a.name).localeCompare(String(b.name))).slice(0, 24);
  if (roll.length) out.push(fig(pg(`<p class="sp-kick">Part Four</p><h3 class="sp-ch" style="font-size:1.9em">The Roll of Remembrance</h3><p style="font-style:italic;text-align:left">${n(people.length)} people of ${esc(town.name)}, named one by one${cems.length ? `, from ${cems.length === 1 ? esc(cems[0].name) : cems.slice(0, 3).map((c) => esc(c.name)).join(', ') + (cems.length > 3 ? ' and others' : '')}` : ''}.</p><ul class="sp-roll sp-cols">${roll.map((m) => `<li>${esc(m.name)}${m.birth_date_label || m.death_date_label ? `<span class="d">${esc([m.birth_date_label, m.death_date_label].filter(Boolean).join(' – '))}</span>` : ''}</li>`).join('')}</ul>`, '49'),
    `The Roll of Remembrance lists every person, all ${n(people.length)} of them.`));

  // 12. Sources
  const allSources = [...new Set(items.filter((i) => !AVOID.test(i.title + ' ' + i.body)).map((i) => i.source).filter(Boolean))].slice(0, 16);
  if (allSources.length) out.push(fig(pg(`<p class="sp-kick">Back matter</p><h3 class="sp-ch" style="font-size:1.9em">Sources</h3><ol class="sp-src">${allSources.map((x) => `<li>${esc(cut(x, 120))}</li>`).join('')}</ol>`, '74'), 'A full list of sources at the back, so any fact can be checked.'));

  const pages = out.join('');
  const hasBook = !!(BOOKS[town.slug] || (await dbBook(town.slug)));
  const realPages = [['p23', 'A chapter opening'], ['p24', 'Families and the people who built the town'], ['p14', 'Treaty 4 and the meaning of the town’s name'], ['p49', 'The Roll of Remembrance']];
  const contents = [
    `<li><b>Written chapters</b>: how ${esc(town.name)} began, grew and changed</li>`,
    timeline.length && `<li><b>The timeline</b>: ${n(timeline.length)} dated events, each sourced</li>`,
    items.length && `<li><b>From the archive</b>: ${n(items.length)} stories, documents and records</li>`,
    people.length && `<li><b>The Roll of Remembrance</b>: all ${n(people.length)} names</li>`,
    teams.length && `<li><b>Sports</b>: ${n(teams.length)} ${teams.length === 1 ? 'team' : 'teams'}</li>`,
    `<li><b>Photographs</b>, with credits, and a full list of sources</li>`,
  ].filter(Boolean).join('');

  const main = `<section class="wrap stack" style="padding-top:22px"><p class="crumbs"><a href="/">TownTales</a> › <a href="/${esc(town.slug)}">${esc(town.name)}</a> › <a href="/${esc(town.slug)}/book">Book</a> › Sample</p>
<p class="eyebrow">Sample pages</p><h1>Inside the ${esc(town.name)} book</h1>
<p class="lede sp-note">A TownTales book is a real history book: written chapters, illustrations and photographs, stories from the archive and every name remembered, with a source for every fact. Below are sample pages set from ${esc(town.name)}'s own history, so you can see what you'd be holding.</p>
<div class="btns">${hasBook ? `<a class="btn" href="/${esc(town.slug)}/book#order">Buy the book</a>` : `<a class="btn" href="/${esc(town.slug)}/book#request">Request the ${esc(town.name)} book</a>`}<a class="btn alt" href="/${esc(town.slug)}">Back to ${esc(town.name)}</a></div></section>
<section class="wrap stack"><h2>Sample pages from the ${esc(town.name)} book</h2><div class="sp-grid">${pages}</div>
<p class="small muted sp-note">Sample pages are set from ${esc(town.name)}'s TownTales page as it stands today, and marked SAMPLE. The finished book is longer and fuller.</p></section>
<section class="wrap stack"><h2>What's in the full book</h2><ul class="bk-inside">${contents}</ul></section>
<section class="wrap stack"><h2>Real pages from a finished TownTales book</h2><p class="sp-note">These are pages from <i>Wapella: Railway Town, Prairie Crossroads</i>, our first finished book, exactly as printed. Every TownTales book is made to the same standard.</p>
<div class="sp-real">${realPages.map(([f, c]) => `<figure class="sp-fig"><a href="/book-preview/wapella-sk/${f}.jpg" target="_blank" rel="noopener"><img src="/book-preview/wapella-sk/${f}.jpg" alt="Printed page: ${esc(c)}" loading="lazy" width="935" height="1210"></a><figcaption>${esc(c)}</figcaption></figure>`).join('')}</div></section>
<section class="wrap stack"><h2>A book made to keep</h2><ul class="sp-spec">
<li><b>Written, not just listed</b>Chapters tell the story in full sentences, checked against the sources, with every fact numbered to where it came from.</li>
<li><b>Full size, 8.5 × 11 in</b>A proper coffee-table size, set in a classic book typeface with room for photographs.</li>
<li><b>Paperback or hardcover</b>Printed to order by Lulu, a print-on-demand publisher founded by Canadian Bob Young. Free shipping anywhere in Canada.</li>
<li><b>Every name remembered</b>The Roll of Remembrance names ${people.length ? 'all ' + n(people.length) + ' people' : 'the town’s people'} one by one, with their dates.</li>
<li><b>Always the latest</b>Each copy is built with ${esc(town.name)}'s history as it stands the day you order. The revision number tells you which edition you have.</li>
<li><b>Made by your town</b>Photos, stories and names shared on TownTales go into the next revision. <a href="/#upload">Add yours</a>.</li>
</ul>
<p class="sp-note"><b>The more history is added to ${esc(town.name)}'s page, the richer its book will be.</b> <a href="/#upload">Share a photo, a story or a clipping</a>.</p>
<div class="btns">${hasBook ? `<a class="btn" href="/${esc(town.slug)}/book#order">Buy the book</a>` : `<a class="btn" href="/${esc(town.slug)}/book#request">Request the ${esc(town.name)} book</a>`}</div>
${SAMPLE_CSS}</section>`;
  send(res, 200, page({ title: `Inside the ${town.name}, ${prov} history book | TownTales`, desc: `Sample pages from the ${town.name} history book: written chapters, illustrations, archive stories and the Roll of Remembrance.`, canonical: `${SITE}/${town.slug}/book/sample`, main, noindex: true }), 'public, s-maxage=1800, stale-while-revalidate=86400');
}

// /books/unsubscribe?t=<private token>  — the link at the bottom of the "your book is ready" email.
async function unsubscribePage(res, token) {
  let ok = false;
  if (/^[0-9a-f-]{36}$/i.test(token || '')) {
    try {
      const r = await fetch(`${SB}/rest/v1/rpc/book_unsubscribe`, { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ tok: token }), signal: AbortSignal.timeout(5000) });
      ok = r.ok && (await r.json()) === true;
    } catch (e) { ok = false; }
  }
  const main = `<section class="wrap stack" style="padding-top:22px"><h1>${ok ? "You're unsubscribed" : "We couldn't find that sign-up"}</h1>
<p class="lede">${ok ? "We won't email you about this book again." : "That link may be old or incomplete. If you still get emails from us that you don't want, write to towntalesinfo@gmail.com and we'll remove you."}</p>
<p><a href="/">Back to TownTales</a></p></section>`;
  send(res, 200, page({ title: 'Unsubscribe | TownTales', desc: 'Unsubscribe from TownTales book emails.', canonical: `${SITE}/books/unsubscribe`, main, noindex: true }), 'no-store');
}

// Front-page section: finished books on a shelf, plus "Coming next" (towns people are asking for). Empty string if there's nothing to show.
async function booksSection() {
  try {
    const [done, counts] = await Promise.all([finishedBooks(), requestCounts()]);
    const have = new Set(done.map((b) => b.slug));
    const want = Object.entries(counts).filter(([slug, n]) => !have.has(slug) && n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 6);
    let wantTowns = [];
    if (want.length) wantTowns = await q('towns?select=slug,name,prov&hidden=eq.false&slug=in.(' + want.map(([slug]) => encodeURIComponent(slug)).join(',') + ')');
    wantTowns = wantTowns.filter((t) => counts[t.slug] >= 3);
    if (!done.length && !wantTowns.length) return '';
    const next = wantTowns.map((t) => `<li><a href="/${esc(t.slug)}/book#request">${esc(t.name)}</a>${counts[t.slug] >= 5 ? ` <span class="small muted">· ${counts[t.slug]} requests</span>` : ''}</li>`).join('');
    return `<section class="wrap stack" id="books-shelf"><h2>${done.length ? 'Books you can buy now' : 'Town history books'}</h2>
<p>Each book is built from a town's TownTales page: the timeline, the people, the cemeteries and the teams, with every source. Printed to order by <a href="https://www.lulu.com" rel="noopener">Lulu</a>, a print-on-demand publisher founded by Canadian Bob Young, with free shipping anywhere in Canada. Allow 4 to 6 weeks for a printed copy. <b>The more history is added to a town's page, the better its book will be.</b></p>
${done.length ? `<div class="bk-shelf">${done.map(shelfCard).join('')}</div><p><a href="/books">See all books</a></p>` : ''}
${next ? `<h3>Coming next</h3><p class="small">People are asking for these. Don't see your town's book yet? Request it and we'll email you when it's ready.</p><ul class="bk-next">${next}</ul>` : ''}
${SHELF_CSS}
</section>`;
  } catch (e) { return ''; }
}

function cover(town, prov, ms) {
  const own = !!(ms && ms.image);
  if (!own && SAMPLE_COVER.image) ms = SAMPLE_COVER;
  if (ms && ms.image) {
    const isWapella = town.name === SAMPLE_COVER.town;
    const note = own || isWapella
      ? `Cover: ${esc(town.name)}'s main street${ms.credit ? '. Photo: ' + esc(ms.credit) : ''}`
      : `Sample cover showing ${esc(SAMPLE_COVER.town)}'s main street. When you order, ${esc(town.name)}'s main street will be on the cover.`;
    return `<figure class="bk-fig"><div class="bk-cover bk-photo"><div class="bk-cover-in" style="background:linear-gradient(rgba(30,41,48,.55),rgba(30,41,48,0) 45%,rgba(30,41,48,0) 70%,rgba(30,41,48,.6)),url('${esc(ms.image)}') 52% center/cover"><p class="bk-kicker">A TownTales history</p><div><p class="bk-title">${esc(town.name)}</p><p class="bk-prov">${esc(prov)}</p></div></div></div>
<figcaption class="small muted bk-note">${note}</figcaption></figure>`;
  }
  return `<figure class="bk-fig"><div class="bk-cover" role="img" aria-label="Cover of the ${esc(town.name)} book">
<div class="bk-cover-in"><p class="bk-kicker">A TownTales history</p><p class="bk-title">${esc(town.name)}</p><p class="bk-prov">${esc(prov)}</p>
<svg viewBox="0 0 120 70" aria-hidden="true" class="bk-art"><path d="M0 62h120" stroke="#E3B34A" stroke-width="3"/><path d="M14 62V30L24 18l10 12v32z" fill="#B4512C" stroke="#1E2930" stroke-width="2"/><path d="M40 62V44h46v18z" fill="#2B5C80" stroke="#1E2930" stroke-width="2"/><circle cx="50" cy="63" r="5" fill="#1E2930"/><circle cx="76" cy="63" r="5" fill="#1E2930"/><path d="M86 50h16v12H86z" fill="#B4512C" stroke="#1E2930" stroke-width="2"/></svg>
<p class="bk-foot">Every fact sourced · Every name remembered</p></div></div>
<figcaption class="small muted bk-note">When purchased, ${esc(town.name)}'s main street will be on the cover.</figcaption></figure>`;
}

// /books/checkout?town=<slug>&edition=paperback|hardcover  →  Stripe Checkout at the quoted price (free shipping in Canada).
async function checkout(res, url) {
  const slug = String(url.searchParams.get('town') || '').toLowerCase(), edition = String(url.searchParams.get('edition') || '');
  const book = BOOKS[slug] || await dbBook(slug);
  const back = (msg) => { res.statusCode = 303; res.setHeader('Location', `/${slug || ''}/book${msg ? '?order=unavailable' : ''}#order`); res.setHeader('Cache-Control', 'no-store'); return res.end(); };
  if (!book || !bp.EDITIONS[edition] || !bp.luluReady() || !bp.stripeReady()) return back(true);
  try {
    const [town] = await q(`towns?slug=eq.${encodeURIComponent(slug)}&hidden=eq.false&select=slug,name`);
    if (!town) return back(true);
    const qte = await bp.quote(edition, book.pages);
    const to = await bp.checkoutUrl({ town: slug, townName: town.name, edition, qte, site: SITE });
    res.statusCode = 303; res.setHeader('Location', to); res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Robots-Tag', 'noindex');
    return res.end();
  } catch (e) {
    console.error('book checkout', slug, edition, String(e.message || e).slice(0, 300));
    return back(true);
  }
}

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.searchParams.get('thanks')) return thanksPage(res, url.searchParams.get('e') === 'digital');
  if (url.searchParams.get('checkout')) return checkout(res, url);
  if (url.searchParams.get('index')) return booksIndex(res);
  if (url.searchParams.get('unsub')) return unsubscribePage(res, String(url.searchParams.get('t') || ''));
  const slug = String(url.searchParams.get('slug') || '').toLowerCase();
  const book = BOOKS[slug] || await dbBook(slug);
  try {
    if (url.searchParams.get('sample')) {
      const [t] = await q(`towns?slug=eq.${encodeURIComponent(slug)}&hidden=eq.false&select=slug,name,prov`);
      if (!t) return notFound(res, "We don't have a town at that address.");
      return samplePage(res, t);
    }
    if (url.searchParams.get('look')) {
      const [t] = await q(`towns?slug=eq.${encodeURIComponent(slug)}&hidden=eq.false&select=slug,name,prov`);
      if (!t || !book || !book.look) return notFound(res, "There's no preview for this book yet.");
      return lookPage(res, t, book, await editionsFor(slug, book));
    }
    const s = encodeURIComponent(slug);
    const towns = await q(`towns?slug=eq.${s}&hidden=eq.false&select=slug,name,prov`);
    const town = towns[0];
    if (!town) return notFound(res, "We don't have a town at that address.");
    if (!book) return waitlist(res, town, (await requestCounts())[town.slug] || 0);
    const eds = await editionsFor(slug, book);
    const revRow = (await q(`town_books?slug=eq.${s}&select=revision,revised_at`).catch(() => []))[0];
    const revLine = `<p class="small muted">${esc(revText({ revision: revRow && revRow.revision, revised_at: revRow && revRow.revised_at }))}. <a href="/books">See all TownTales books</a></p>
<p class="small">This book is built from ${esc(town.name)}'s TownTales page, so the more history is added there, the better it gets. <a href="/#upload">Share a photo, a story or a clipping</a>.</p>`;
    const [timeline, items, mems, cems, teams] = await Promise.all([
      q(`timeline?town=eq.${s}&select=year,label,title&order=year,sort`, { all: true }),
      q(`items?town=eq.${s}&status=eq.published&select=id`, { all: true }),
      q(`memorials?town=eq.${s}&status=eq.published&select=id`, { all: true }).catch(() => []),
      q(`cemeteries?town=eq.${s}&select=id`).catch(() => []),
      q(`teams?town=eq.${s}&select=id`).catch(() => []),
    ]);
    const prov = PROV[town.prov] || town.prov;
    const n = (x) => x.toLocaleString('en-CA');
    const first = timeline[0], last = timeline[timeline.length - 1];
    const inside = [
      timeline.length && `<li><b>${n(timeline.length)} dated events</b>${first && last ? `, from ${esc(first.label)} to ${esc(last.label)}` : ''}</li>`,
      mems.length && `<li><b>${n(mems.length)} people remembered</b>${cems.length ? ` in ${cems.length === 1 ? 'one cemetery' : cems.length + ' cemeteries'}` : ''}</li>`,
      items.length && `<li><b>${n(items.length)} archive pieces</b>: documents, stories and records</li>`,
      teams.length && `<li><b>${n(teams.length)} ${teams.length === 1 ? 'team' : 'teams'}</b> from ${esc(town.name)}'s sports history</li>`,
    ].filter(Boolean).join('');

    const main = `<section class="wrap stack" style="padding-top:22px">
<p class="crumbs"><a href="/">TownTales</a> › <a href="/province/${esc(PROV_SLUG[town.prov] || '')}">${esc(prov)}</a> › <a href="/${esc(town.slug)}">${esc(town.name)}</a> › The ${esc(town.name)} Book</p>
<div class="bk-hero">
${cover(town, prov, book.mainStreet)}
<div class="stack">
<p class="eyebrow">The ${esc(town.name)} Book</p>
<h1>${esc(town.name)}'s history, in a book you can hold</h1>
${revLine}
<p class="lede">Everything on ${esc(town.name)}'s TownTales page, gathered into ${book.pages ? 'a ' + book.pages + '-page' : 'one'} book: the timeline, the people, the cemeteries and the teams. Every fact keeps its source.</p>
<div class="btns">${book.sample
      ? `<a class="btn" href="${esc(book.sample)}" target="_blank" rel="noopener">Read the free sample (PDF)</a>`
      : `<a class="btn alt" href="/${esc(town.slug)}/book/sample">See a sample</a>`}${book.look ? `<a class="btn alt" href="/${esc(town.slug)}/book/preview">Look inside</a>` : ''}${eds.length ? `<a class="btn" href="#order">Buy the book</a>` : `<a class="btn alt" href="#request">Request the full book</a>`}</div>
<p class="small muted">${book.sample ? 'The sample has the cover, the contents, the timeline at a glance and the first chapter. Free, nothing to sign up for.' : `The sample is built from ${esc(town.name)}'s TownTales page: the cover, the contents and a page of the Roll of Remembrance. It is a taste, not the book. The full book adds written chapters, the whole timeline, every name and photographs.`}</p>
</div></div>
</section>

${book.mainStreet && book.mainStreet.image ? '' : `<section class="wrap"><div class="pv-soon"><p><b>Have a photo of ${esc(town.name)}'s main street?</b> Every TownTales book has the town's main street on the cover, and ${esc(town.name)}'s doesn't have one yet. Old or new, send it in and we'll credit you on the cover.</p><div class="btns" style="margin-top:10px"><a class="btn" href="/#upload">Send a main street photo</a></div></div></section>`}

<section class="wrap stack"><h2>What's inside</h2><ul class="bk-inside">${inside}</ul>
<p class="small muted">The book is built straight from the collection on this site and is never hand-edited, so it grows each time someone adds a photo, a story or a name.</p></section>

${timeline.length ? `<section class="wrap stack"><h2>${esc(town.name)} at a glance</h2><ol class="bk-glance">${timeline.map((t) => `<li><span class="bk-yr">${esc(t.label)}</span><span>${esc(t.title)}</span></li>`).join('')}</ol>
<p class="small"><a href="/${esc(town.slug)}">See the full timeline with sources →</a></p></section>` : ''}

${orderSection(town, eds)}
<section class="wrap stack" id="request"><h2>${eds.length ? 'Want the digital edition, or not ready to order?' : 'Request the full book'}</h2>
<p>${eds.length ? "Leave your name and we'll email you about the digital edition, or when the book gets new pages. Nothing to pay." : "Tell us which edition you'd like. There's nothing to pay now. We'll email you the price and let you know when your copy is ready to order."}</p>
<div class="bk-eds">
<div class="rm-cem"><h3>Digital edition</h3><p>A PDF you can read on any screen or print at home.</p></div>
<div class="rm-cem"><h3>Printed book</h3><p>A bound paperback, printed when you order it.</p></div>
</div>
<form class="formbox" data-tt-bookform data-town="${esc(town.slug)}" novalidate style="max-width:820px">
<div class="grid2">
<div class="field"><label for="bk-name">Your name</label><input type="text" id="bk-name" name="name" required autocomplete="name"></div>
<div class="field"><label for="bk-email">Your email</label><input type="email" id="bk-email" name="email" required autocomplete="email"><span class="hint">Only used to tell you about your book. Never shown.</span></div>
</div>
<div class="grid2">
<div class="field"><label for="bk-format">Which edition?</label><select id="bk-format" name="format"><option value="digital">Digital edition</option><option value="print">Printed book</option><option value="both">Both</option><option value="unsure">Not sure yet</option></select></div>
<div class="field"><label for="bk-copies">How many copies?</label><select id="bk-copies" name="copies">${[1, 2, 3, 4, 5, 10].map((c) => `<option>${c}</option>`).join('')}</select></div>
</div>
<label class="bk-check"><input type="checkbox" name="updates" checked> Tell me when the ${esc(town.name)} book gets new pages</label>
<p class="err" id="bk-err" role="alert"></p>
<button class="btn" type="submit">Request my copy</button>
</form>
<div id="bk-done" role="status"></div>
</section>

<section class="wrap stack"><h2>Good to know</h2>
<dl class="bk-faq">
<dt>Why is there a sample?</dt><dd>A book is only as full as the history people have shared. The sample shows you exactly what's in ${esc(town.name)}'s book before you ask for it.</dd>
<dt>Can I add to it?</dt><dd>Yes. Anything you <a href="/#upload">share on ${esc(town.name)}'s page</a> goes into the next printing, with your name as the source.</dd>
<dt>Something wrong?</dt><dd><a href="/contact">Tell us</a> and we'll fix it before the next edition.</dd>
</dl></section>`;

    const canonical = `${SITE}/${town.slug}/book`;
    send(res, 200, page({
      title: `The ${town.name} Book — ${town.name}, ${prov} History | TownTales`,
      desc: `A ${book.pages ? book.pages + '-page ' : ''}history of ${town.name}, ${prov}, built from the TownTales collection: ${timeline.length} dated events, ${n(mems.length)} people remembered, and the source for every fact. Free sample available.`,
      canonical, main,
    }));
  } catch (e) {
    console.error('book failed', slug, e && e.message);
    res.statusCode = 503; res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<!doctype html><meta charset="utf-8"><p style="font:20px/1.5 sans-serif;padding:24px">This page is having trouble loading. Please try again in a minute.</p>');
  }
};
module.exports.BOOKS = BOOKS;
module.exports.NEEDS_MAIN_STREET = NEEDS_MAIN_STREET;
module.exports.finishedBooks = finishedBooks;
module.exports.booksSection = booksSection;
module.exports.requestCounts = requestCounts;

// Towns without a book yet: "Don't see your book yet?" request page. Requests show which towns to build next, and
// everyone on the list gets an email with a link to the finished book when it is ready.
function waitlist(res, town, asked) {
  const prov = PROV[town.prov] || town.prov;
  const pageUrl = `${SITE}/${town.slug}/book`;
  const share = encodeURIComponent(`Know someone from ${town.name}? A history book about ${town.name} is on the way if enough people ask: ${pageUrl}`);
  const main = `<section class="wrap stack" style="padding-top:22px">
<p class="crumbs"><a href="/">TownTales</a> › <a href="/province/${esc(PROV_SLUG[town.prov] || '')}">${esc(prov)}</a> › <a href="/${esc(town.slug)}">${esc(town.name)}</a> › Book</p>
<div class="bk-hero">${cover(town, prov)}<div class="stack">
<p class="eyebrow">The ${esc(town.name)} Book</p>
<h1>Don't see ${esc(town.name)}'s book yet?</h1>
<p class="lede">Request it. We build each town's history book from everything on its TownTales page, and the towns people ask for most come first. When ${esc(town.name)}'s book is finished we'll email you a link straight to it. You can look through it first, then decide if you want a copy. No pressure.</p>
${asked >= 5 ? `<p class="small"><b>${asked} people</b> have asked for the ${esc(town.name)} book.</p>` : ''}
<div class="btns"><a class="btn" href="#request">Request the ${esc(town.name)} book</a><a class="btn alt" href="/${esc(town.slug)}/book/sample">See a sample</a></div>
</div></div></section>
<section class="wrap stack" id="request"><h2>Request the ${esc(town.name)} book</h2>
<form class="formbox" data-tt-bookform data-town="${esc(town.slug)}" data-waitlist="1" data-share="${esc(share)}" novalidate style="max-width:820px">
<div class="grid2">
<div class="field"><label for="bk-name">Your name</label><input type="text" id="bk-name" name="name" required autocomplete="name"></div>
<div class="field"><label for="bk-email">Your email</label><input type="email" id="bk-email" name="email" required autocomplete="email"><span class="hint">We'll email you once, when the book is ready. Never shown, never shared.</span></div>
</div>
<div class="grid2">
<div class="field"><label for="bk-format">Which would you want?</label><select id="bk-format" name="format"><option value="digital">Digital edition</option><option value="print">Printed book</option><option value="both">Both</option><option value="unsure">Not sure yet</option></select></div>
<div class="field"><label for="bk-copies">How many copies?</label><select id="bk-copies" name="copies">${[1, 2, 3, 4, 5, 10].map((c) => `<option>${c}</option>`).join('')}</select></div>
</div>
<input type="hidden" name="updates" value="on">
<p class="err" id="bk-err" role="alert"></p>
<button class="btn" type="submit">Request the book</button>
</form>
<div id="bk-done" role="status"></div>
<p>The more ${esc(town.name)} has on its page, the fuller its book will be. Have a photo, a family story, or a history book on a shelf? <a href="/#upload">Share a photo, a story or a clipping</a> or <a href="/share-a-book">share a history book</a>.</p>
</section>`;
  send(res, 200, page({
    title: `${town.name}, ${prov} history book | TownTales`,
    desc: `Request a history book about ${town.name}, ${prov}, built from the TownTales collection.`,
    canonical: `${SITE}/${town.slug}/book`, main, noindex: true,
  }), 'public, s-maxage=3600, stale-while-revalidate=86400');
}
