// DRAFT (not deployed): "Get the Wapella Book" page — /<town>/book, Wapella only for now.
// Free sample + request form (saves to the existing book_interest table). No payments.
// Everything shown comes from the live collection; nothing is hand-written about the town.
const { SITE, PROV, PROV_SLUG, esc, q, page, send, notFound } = require('./_shell');

// Towns with a book file ready. sample = public URL of the free sample PDF (null until supplied).
const BOOKS = {
  'wapella-sk': { pages: 77, sample: null },
};

function cover(town, prov) {
  return `<div class="bk-cover" role="img" aria-label="Cover of the ${esc(town.name)} book">
<div class="bk-cover-in"><p class="bk-kicker">A TownTales history</p><p class="bk-title">${esc(town.name)}</p><p class="bk-prov">${esc(prov)}</p>
<svg viewBox="0 0 120 70" aria-hidden="true" class="bk-art"><path d="M0 62h120" stroke="#E3B34A" stroke-width="3"/><path d="M14 62V30L24 18l10 12v32z" fill="#B4512C" stroke="#1E2930" stroke-width="2"/><path d="M40 62V44h46v18z" fill="#2B5C80" stroke="#1E2930" stroke-width="2"/><circle cx="50" cy="63" r="5" fill="#1E2930"/><circle cx="76" cy="63" r="5" fill="#1E2930"/><path d="M86 50h16v12H86z" fill="#B4512C" stroke="#1E2930" stroke-width="2"/></svg>
<p class="bk-foot">Every fact sourced · Every name remembered</p></div></div>`;
}

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const slug = String(url.searchParams.get('slug') || '').toLowerCase();
  const book = BOOKS[slug];
  try {
    if (!book) return notFound(res, "There isn't a book page for that town yet.");
    const s = encodeURIComponent(slug);
    const towns = await q(`towns?slug=eq.${s}&hidden=eq.false&select=slug,name,prov`);
    const town = towns[0];
    if (!town) return notFound(res);
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
${cover(town, prov)}
<div class="stack">
<p class="eyebrow">The ${esc(town.name)} Book</p>
<h1>${esc(town.name)}'s history, in a book you can hold</h1>
<p class="lede">Everything on ${esc(town.name)}'s TownTales page, gathered into ${book.pages ? 'a ' + book.pages + '-page' : 'one'} book: the timeline, the people, the cemeteries and the teams. Every fact keeps its source.</p>
<div class="btns">${book.sample
      ? `<a class="btn" href="${esc(book.sample)}" target="_blank" rel="noopener">Read the free sample (PDF)</a>`
      : `<span class="btn alt" aria-disabled="true" style="opacity:.6;cursor:default">Free sample coming soon</span>`}<a class="btn alt" href="#request">Request the full book</a></div>
<p class="small muted">The sample has the cover, the contents, the timeline at a glance and the first chapter. Free, nothing to sign up for.</p>
</div></div>
</section>

<section class="wrap stack"><h2>What's inside</h2><ul class="bk-inside">${inside}</ul>
<p class="small muted">The book is built straight from the collection on this site and is never hand-edited, so it grows each time someone adds a photo, a story or a name.</p></section>

${timeline.length ? `<section class="wrap stack"><h2>${esc(town.name)} at a glance</h2><ol class="bk-glance">${timeline.map((t) => `<li><span class="bk-yr">${esc(t.label)}</span><span>${esc(t.title)}</span></li>`).join('')}</ol>
<p class="small"><a href="/${esc(town.slug)}">See the full timeline with sources →</a></p></section>` : ''}

<section class="wrap stack" id="request"><h2>Request the full book</h2>
<p>Tell us which edition you'd like. There's nothing to pay now. We'll email you when your copy is ready to order.</p>
<div class="bk-eds">
<div class="rm-cem"><h3>Digital edition</h3><p>A PDF you can read on any screen or print at home.</p><p class="bk-price">About $15–20</p></div>
<div class="rm-cem"><h3>Printed book</h3><p>A bound paperback, printed when you order it.</p><p class="bk-price">About $40</p></div>
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
