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
const SAMPLE_CSS = '<style>.sp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:26px;align-items:start}.sp-page{aspect-ratio:8.5/11;background:#fffdf7;border:1px solid #cfc6b0;box-shadow:0 6px 16px rgba(30,41,48,.2);padding:9% 9% 8%;overflow:hidden;font-family:Georgia,"Times New Roman",serif;color:#1E2930;font-size:clamp(.62rem,1.6vw,.82rem);line-height:1.4;position:relative}.sp-page h3{font-family:var(--display);text-transform:uppercase;font-size:1.5em;margin:0 0 .6em;line-height:1.05}.sp-page ul{list-style:none;margin:0;padding:0}.sp-page li{margin:0 0 .45em}.sp-page .sp-y{display:inline-block;min-width:3.6em;font-weight:700;color:#B4512C}.sp-page .sp-n{position:absolute;left:0;right:0;bottom:3%;text-align:center;font-size:.8em;color:#7a6f5a}.sp-cols{columns:2;column-gap:1.4em}.sp-cols li{break-inside:avoid}.sp-page::after{content:"SAMPLE";position:absolute;top:3%;right:5%;font:700 .7em/1 var(--hand,monospace);letter-spacing:.14em;color:#B4512C;border:1px solid #B4512C;padding:.2em .45em;opacity:.8}.sp-title{display:flex;flex-direction:column;justify-content:center;text-align:center;height:100%}.sp-title .k{letter-spacing:.14em;text-transform:uppercase;font-size:.8em;color:#B4512C}.sp-title .t{font-family:var(--display);font-size:2.6em;text-transform:uppercase;line-height:1;margin:.3em 0}.sp-note{max-width:820px}</style>';
async function samplePage(res, town) {
  const s = encodeURIComponent(town.slug), prov = PROV[town.prov] || town.prov;
  const [timeline, items, people, cems, teams] = await Promise.all([
    q(`timeline?town=eq.${s}&select=year,label,title&order=year,sort`, { all: true }).catch(() => []),
    q(`items?town=eq.${s}&status=eq.published&select=id`, { all: true }).catch(() => []),
    q(`memorials?town=eq.${s}&status=eq.published&select=name,birth_date_label,death_date_label`, { all: true }).catch(() => []),
    q(`cemeteries?town=eq.${s}&select=id`).catch(() => []),
    q(`teams?town=eq.${s}&select=id`).catch(() => []),
  ]);
  const n = (x) => Number(x).toLocaleString('en-CA');
  const roll = people.filter((m) => m.name).slice().sort((a, b) => surnameOf(a.name).localeCompare(surnameOf(b.name)) || String(a.name).localeCompare(String(b.name))).slice(0, 26);
  const contents = [
    `<li><b>Written chapters</b>: how ${esc(town.name)} began and grew</li>`,
    timeline.length && `<li><b>The timeline</b>: ${n(timeline.length)} dated events</li>`,
    people.length && `<li><b>Roll of Remembrance</b>: ${n(people.length)} people${cems.length ? ` in ${cems.length === 1 ? 'one cemetery' : cems.length + ' cemeteries'}` : ''}</li>`,
    items.length && `<li><b>From the archive</b>: ${n(items.length)} documents, stories and records</li>`,
    teams.length && `<li><b>Sports</b>: ${n(teams.length)} ${teams.length === 1 ? 'team' : 'teams'}</li>`,
  ].filter(Boolean).join('');
  const hasBook = !!(BOOKS[town.slug] || (await dbBook(town.slug)));
  const pg = (inner, num) => `<div class="sp-page">${inner}<span class="sp-n">${num}</span></div>`;
  const pages = [
    pg(`<div class="sp-title"><span class="k">A TownTales history</span><span class="t">${esc(town.name)}</span><span>${esc(prov)}</span><p style="margin-top:1.4em;font-style:italic">Every fact sourced. Every name remembered.</p></div>`, ''),
    pg(`<h3>Contents</h3>${contents ? `<ul>${contents}</ul>` : '<p>This town\'s page is just getting started.</p>'}`, 'ii'),
    roll.length ? pg(`<h3>Roll of Remembrance</h3><ul class="sp-cols">${roll.map((m) => `<li>${esc(m.name)}${m.birth_date_label || m.death_date_label ? `<br><span style="color:#7a6f5a">${esc([m.birth_date_label, m.death_date_label].filter(Boolean).join(' – '))}</span>` : ''}</li>`).join('')}</ul>`, '1') : '',
    pg(`<h3>What's in the full book</h3><ul><li>Written chapters on how ${esc(town.name)} began and grew</li>${timeline.length ? `<li>A timeline of ${n(timeline.length)} dated events</li>` : ''}${people.length ? `<li>The Roll of Remembrance, all ${n(people.length)} names</li>` : ''}<li>Photographs, with credits</li><li>Sources for every fact</li><li>Everything added to ${esc(town.name)}'s page by then</li></ul><p style="margin-top:1em;font-style:italic">This sample shows only the cover, the contents and one page of the Roll. It is not the book.</p>`, '2'),
  ].filter(Boolean).join('');
  const main = `<section class="wrap stack" style="padding-top:22px"><p class="crumbs"><a href="/">TownTales</a> › <a href="/${esc(town.slug)}">${esc(town.name)}</a> › <a href="/${esc(town.slug)}/book">Book</a> › Sample</p>
<p class="eyebrow">Sample</p><h1>A sample of the ${esc(town.name)} book</h1>
<p class="lede sp-note">This is a small taste, not the book. These pages are built from ${esc(town.name)}'s TownTales page: the contents and one page of the Roll of Remembrance. The full book adds written chapters, the whole timeline, every name and photographs.</p>
<p class="sp-note"><b>The more history is added to ${esc(town.name)}'s page, the fuller its book will be.</b> <a href="/#upload">Share a photo, a story or a clipping</a>.</p>
<div class="btns">${hasBook ? `<a class="btn" href="/${esc(town.slug)}/book">See the book</a>` : `<a class="btn" href="/${esc(town.slug)}/book#request">Request the ${esc(town.name)} book</a>`}<a class="btn alt" href="/${esc(town.slug)}">Back to ${esc(town.name)}</a></div></section>
<section class="wrap stack"><div class="sp-grid">${pages}</div>${SAMPLE_CSS}</section>`;
  send(res, 200, page({ title: `${town.name}, ${prov}: sample of the history book | TownTales`, desc: `Sample pages for the ${town.name} history book, built from its TownTales page.`, canonical: `${SITE}/${town.slug}/book/sample`, main, noindex: true }), 'public, s-maxage=1800, stale-while-revalidate=86400');
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
