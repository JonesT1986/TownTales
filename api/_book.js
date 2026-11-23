// "Get the Wapella Book" page — /<town>/book, Wapella only for now.
// Free sample + request form (saves to the existing book_interest table). No payments.
// Everything shown comes from the live collection; nothing is hand-written about the town.
const { SITE, PROV, PROV_SLUG, esc, q, page, send, notFound } = require('./_shell');

// Towns with a book file ready. sample = public URL of the free sample PDF (null until supplied).
// mainStreet = the town's main street photo used as the cover: { image, credit } (credit = who took it / where it's from).
// Rule: the cover is always the main street. No photo yet → illustrated cover + a request for one, and the town is
// listed in NEEDS_MAIN_STREET so it can be reported.
const BOOKS = {
  'wapella-sk': { pages: 77, sample: null, mainStreet: null },
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
const orderUrl = (link, slug) => `${link}?client_reference_id=${encodeURIComponent(('book_' + slug).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 200))}`;
function orderSection(town) {
  const eds = printCfg();
  if (!eds.length) return '';
  return `<section class="wrap stack" id="order"><h2>Order the printed book</h2>
<p>Pick a cover. You'll pay on Stripe's secure page, add your shipping address there, and Stripe emails you a receipt.</p>
<div class="bk-eds">${eds.map((e) => `<div class="rm-cem"><h3>${esc(e.name)}${e.price ? ` <span class="muted">${esc(e.price)}</span>` : ''}</h3><p>${esc(e.blurb)}</p>
<p style="margin-top:10px"><a class="btn" href="${esc(orderUrl(e.link, town.slug))}" rel="noopener">Order the ${esc(e.name.toLowerCase())}${e.price ? ' · ' + esc(e.price) : ''}</a></p></div>`).join('')}</div>
<p class="small muted">Each copy is printed after you order, with ${esc(town.name)}'s history as it stands that day. Shipping and any tax are added at checkout. Questions? Email <a href="mailto:towntalesinfo@gmail.com">towntalesinfo@gmail.com</a>.</p>
</section>`;
}
function thanksPage(res) {
  const main = `<section class="wrap stack" style="padding-top:28px">
<p class="eyebrow">Your book order</p>
<h1>Thank you</h1>
<div class="rm-ok"><p>Your order went through, and Stripe has emailed you a receipt.</p>
<p>We print each copy after it's ordered, then mail it to the address you gave. We'll email you when it ships.</p></div>
<p>Questions or a change to your order? Email <a href="mailto:towntalesinfo@gmail.com">towntalesinfo@gmail.com</a>.</p>
<p><a class="btn alt" href="/#towns">Back to TownTales</a></p>
</section>`;
  send(res, 200, page({ title: 'Thank you for your order | TownTales', desc: 'Thank you for ordering a TownTales book.', main, noindex: true }), 'private, no-store');
}
const NEEDS_MAIN_STREET = Object.keys(BOOKS).filter((k) => !(BOOKS[k].mainStreet && BOOKS[k].mainStreet.image));

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

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.searchParams.get('thanks')) return thanksPage(res);
  const slug = String(url.searchParams.get('slug') || '').toLowerCase();
  const book = BOOKS[slug];
  try {
    const s = encodeURIComponent(slug);
    const towns = await q(`towns?slug=eq.${s}&hidden=eq.false&select=slug,name,prov`);
    const town = towns[0];
    if (!town) return notFound(res, "We don't have a town at that address.");
    if (!book) return waitlist(res, town);
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
<p class="lede">Everything on ${esc(town.name)}'s TownTales page, gathered into ${book.pages ? 'a ' + book.pages + '-page' : 'one'} book: the timeline, the people, the cemeteries and the teams. Every fact keeps its source.</p>
<div class="btns">${book.sample
      ? `<a class="btn" href="${esc(book.sample)}" target="_blank" rel="noopener">Read the free sample (PDF)</a>`
      : `<span class="btn alt" aria-disabled="true" style="opacity:.6;cursor:default">Free sample coming soon</span>`}${printCfg().length ? `<a class="btn" href="#order">Order the printed book</a>` : `<a class="btn alt" href="#request">Request the full book</a>`}</div>
<p class="small muted">The sample has the cover, the contents, the timeline at a glance and the first chapter. Free, nothing to sign up for.</p>
</div></div>
</section>

${book.mainStreet && book.mainStreet.image ? '' : `<section class="wrap"><div class="pv-soon"><p><b>Have a photo of ${esc(town.name)}'s main street?</b> Every TownTales book has the town's main street on the cover, and ${esc(town.name)}'s doesn't have one yet. Old or new, send it in and we'll credit you on the cover.</p><div class="btns" style="margin-top:10px"><a class="btn" href="/#upload">Send a main street photo</a></div></div></section>`}

<section class="wrap stack"><h2>What's inside</h2><ul class="bk-inside">${inside}</ul>
<p class="small muted">The book is built straight from the collection on this site and is never hand-edited, so it grows each time someone adds a photo, a story or a name.</p></section>

${timeline.length ? `<section class="wrap stack"><h2>${esc(town.name)} at a glance</h2><ol class="bk-glance">${timeline.map((t) => `<li><span class="bk-yr">${esc(t.label)}</span><span>${esc(t.title)}</span></li>`).join('')}</ol>
<p class="small"><a href="/${esc(town.slug)}">See the full timeline with sources →</a></p></section>` : ''}

${orderSection(town)}
<section class="wrap stack" id="request"><h2>${printCfg().length ? 'Want the digital edition, or not ready to order?' : 'Request the full book'}</h2>
<p>${printCfg().length ? "Leave your name and we'll email you about the digital edition, or when the book gets new pages. Nothing to pay." : "Tell us which edition you'd like. There's nothing to pay now. We'll email you the price and let you know when your copy is ready to order."}</p>
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

// Towns without a book yet: a short waitlist. Requests show which towns to research next.
function waitlist(res, town) {
  const prov = PROV[town.prov] || town.prov;
  const main = `<section class="wrap stack" style="padding-top:22px">
<p class="crumbs"><a href="/">TownTales</a> › <a href="/province/${esc(PROV_SLUG[town.prov] || '')}">${esc(prov)}</a> › <a href="/${esc(town.slug)}">${esc(town.name)}</a> › Book</p>
<div class="bk-hero">${cover(town, prov)}<div class="stack">
<p class="eyebrow">The ${esc(town.name)} Book</p>
<h1>Want a book about ${esc(town.name)}?</h1>
<p class="lede">We make a history book for each town from everything on its TownTales page. ${esc(town.name)}'s isn't ready yet. Add your name and we'll let you know when it is. The towns with the most requests get their books first.</p>
</div></div></section>
<section class="wrap stack" id="request"><h2>Put me on the list</h2>
<form class="formbox" data-tt-bookform data-town="${esc(town.slug)}" data-waitlist="1" novalidate style="max-width:820px">
<div class="grid2">
<div class="field"><label for="bk-name">Your name</label><input type="text" id="bk-name" name="name" required autocomplete="name"></div>
<div class="field"><label for="bk-email">Your email</label><input type="email" id="bk-email" name="email" required autocomplete="email"><span class="hint">Only used to tell you about the book. Never shown.</span></div>
</div>
<div class="grid2">
<div class="field"><label for="bk-format">Which would you want?</label><select id="bk-format" name="format"><option value="digital">Digital edition</option><option value="print">Printed book</option><option value="both">Both</option><option value="unsure">Not sure yet</option></select></div>
<div class="field"><label for="bk-copies">How many copies?</label><select id="bk-copies" name="copies">${[1, 2, 3, 4, 5, 10].map((c) => `<option>${c}</option>`).join('')}</select></div>
</div>
<input type="hidden" name="updates" value="on">
<p class="err" id="bk-err" role="alert"></p>
<button class="btn" type="submit">Add me to the list</button>
</form>
<div id="bk-done" role="status"></div>
<p>The more ${esc(town.name)} has on its page, the fuller its book will be. <a href="/#upload">Share a photo, a story or a clipping</a> to help.</p>
</section>`;
  send(res, 200, page({
    title: `${town.name}, ${prov} history book | TownTales`,
    desc: `Request a history book about ${town.name}, ${prov}, built from the TownTales collection.`,
    canonical: `${SITE}/${town.slug}/book`, main, noindex: true,
  }), 'public, s-maxage=3600, stale-while-revalidate=86400');
}
