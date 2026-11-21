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
  const slug = String(url.searchParams.get('slug') || '').toLowerCase();
  const book = BOOKS[slug];
  try {
    const s = encodeURIComponent(slug);
    const towns = await q(`towns?slug=eq.${s}&hidden=eq.false&select=slug,name,prov`);
    const town = towns[0];
    if (!town) return notFound(res, "We don't have a town at that address.");
    if (!book) return await waitlist(res, town);
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
      : `<span class="btn alt" aria-disabled="true" style="opacity:.6;cursor:default">Free sample coming soon</span>`}<a class="btn alt" href="#request">Request the full book</a></div>
<p class="small muted">The sample has the cover, the contents, the timeline at a glance and the first chapter. Free, nothing to sign up for.</p>
</div></div>
</section>

${book.mainStreet && book.mainStreet.image ? '' : `<section class="wrap"><div class="pv-soon"><p><b>Have a photo of ${esc(town.name)}'s main street?</b> Every TownTales book has the town's main street on the cover, and ${esc(town.name)}'s doesn't have one yet. Old or new, send it in and we'll credit you on the cover.</p><div class="btns" style="margin-top:10px"><a class="btn" href="/#upload">Send a main street photo</a></div></div></section>`}

<section class="wrap stack"><h2>What's inside</h2><ul class="bk-inside">${inside}</ul>
<p class="small muted">The book is built straight from the collection on this site and is never hand-edited, so it grows each time someone adds a photo, a story or a name.</p></section>

${timeline.length ? `<section class="wrap stack"><h2>${esc(town.name)} at a glance</h2><ol class="bk-glance">${timeline.map((t) => `<li><span class="bk-yr">${esc(t.label)}</span><span>${esc(t.title)}</span></li>`).join('')}</ol>
<p class="small"><a href="/${esc(town.slug)}">See the full timeline with sources →</a></p></section>` : ''}

<section class="wrap stack" id="request"><h2>Request the full book</h2>
<p>Tell us which edition you'd like. There's nothing to pay now. We'll email you the price and let you know when your copy is ready to order.</p>
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

// ---- Preview edition (Nov 21 2026) ----
// Built the first time someone requests a town's book (book_previews, filled by the book-preview function).
// The AI wrote only the foreword and chapter openings, from this town's timeline; every entry below is live data.
const paras = (t) => String(t || '').split(/\n\s*\n|\n/).map((x) => x.trim()).filter(Boolean).map((x) => `<p>${esc(x)}</p>`).join('');
const lifeDates = (m) => [m.birth_date_label, m.death_date_label].filter(Boolean).join(' – ');
const surname = (n) => { const x = String(n || '').trim(); return (x.includes(',') ? x.split(',')[0] : x.split(/\s+/).pop()).toLowerCase(); };

async function previewSection(town, pv) {
  if (!pv) return '';
  const tn = esc(town.name);
  if (pv.status === 'queued' || pv.status === 'building') {
    return `<section class="wrap stack" id="preview"><div class="bkp-wait" data-tt-bkwait data-town="${esc(town.slug)}"><p class="eyebrow">Free preview</p><h2>Putting together the ${tn} preview…</h2><p>We're laying out the first pages of ${tn}'s book from its TownTales page. This usually takes about a minute. The page will refresh when it's ready.</p></div></section>`;
  }
  if (pv.status === 'thin') {
    return `<section class="wrap stack" id="preview"><div class="pv-soon"><p><b>Not quite enough for a preview yet.</b> ${tn}'s page needs a few more dated stories, photos or clippings before we can lay out a book. <a href="/#upload">Share something</a> to help it along.</p></div></section>`;
  }
  if (pv.status !== 'ready' || !Array.isArray(pv.chapters) || !pv.chapters.length) return '';
  const s = encodeURIComponent(town.slug);
  const [tl, mems, teams] = await Promise.all([
    q(`timeline?town=eq.${s}&select=year,label,title,body&order=year,sort`, { all: true }),
    q(`memorials?town=eq.${s}&status=eq.published&select=name,birth_date_label,death_date_label`, { all: true }).catch(() => []),
    q(`teams?town=eq.${s}&select=id`).catch(() => []),
  ]);
  const chs = pv.chapters;
  const inCh = (c) => tl.filter((e) => Number.isInteger(e.year) && e.year >= c.from_year && e.year <= c.to_year);
  const yrs = (c) => (c.from_year === c.to_year ? String(c.from_year) : `${c.from_year}–${c.to_year}`);
  const entry = (e) => `<div class="bkp-entry"><p class="bkp-when">${esc(e.label || e.year)}</p><h4>${esc(e.title)}</h4><p>${esc(e.body)}</p></div>`;
  const contents = chs.map((c, i) => `<li><span>${i + 1}. ${esc(c.title)}</span><span class="bkp-dots"></span><span>${esc(yrs(c))}</span></li>`).join('')
    + (mems.length ? `<li><span>In Memory</span><span class="bkp-dots"></span><span>${mems.length.toLocaleString('en-CA')} names</span></li>` : '')
    + (teams.length ? `<li><span>Teams and Sports</span><span class="bkp-dots"></span><span>${teams.length} teams</span></li>` : '')
    + `<li><span>Sources</span><span class="bkp-dots"></span><span></span></li>`;
  const c1 = chs[0], c1e = inCh(c1);
  const chapterOne = `<article class="bkp-page"><p class="bkp-chno">Chapter 1</p><h3>${esc(c1.title)}</h3><p class="bkp-yrs">${esc(yrs(c1))}</p><p class="bkp-open">${esc(c1.opening)}</p>${c1e.slice(0, 10).map(entry).join('')}${c1e.length > 10 ? `<p class="bkp-more">…and ${c1e.length - 10} more in this chapter of the full book.</p>` : ''}</article>`;
  const rest = chs.slice(1).map((c, i) => {
    const es = inCh(c);
    return `<article class="bkp-page bkp-locked"><p class="bkp-chno">Chapter ${i + 2}</p><h3>${esc(c.title)}</h3><p class="bkp-yrs">${esc(yrs(c))}</p><p class="bkp-open">${esc(c.opening)}</p>${es.slice(0, 2).map((e) => `<p class="bkp-peek"><b>${esc(e.label || e.year)}</b> ${esc(e.title)}</p>`).join('')}<p class="bkp-more">Continues in the full book${es.length ? ` · ${es.length} ${es.length === 1 ? 'entry' : 'entries'}` : ''}</p></article>`;
  }).join('');
  const names = mems.slice().sort((a, b) => surname(a.name).localeCompare(surname(b.name))).slice(0, 24);
  const memory = mems.length ? `<article class="bkp-page"><p class="bkp-chno">In Memory</p><h3>Those we remember</h3><ul class="bkp-names">${names.map((m) => `<li><b>${esc(m.name)}</b>${lifeDates(m) ? `<span>${esc(lifeDates(m))}</span>` : ''}</li>`).join('')}</ul>${mems.length > names.length ? `<p class="bkp-more">…and ${(mems.length - names.length).toLocaleString('en-CA')} more names in the full book.</p>` : ''}</article>` : '';
  const when = pv.built_at ? new Date(pv.built_at).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Regina' }) : '';
  return `<section class="wrap stack" id="preview">
<p class="eyebrow">Free preview</p><h2>Look inside the ${tn} Book</h2>
<p class="lede">The first pages of ${tn}'s book, laid out from its TownTales page. The finished book grows as more history is shared.</p>
<div class="bkp-book">
<article class="bkp-page bkp-contents"><h3>Contents</h3><ol>${contents}</ol></article>
<article class="bkp-page"><p class="bkp-chno">Foreword</p><h3>${tn}</h3>${paras(pv.foreword)}</article>
${chapterOne}${rest}${memory}
</div>
<p class="small muted">Preview laid out${when ? ` on ${esc(when)}` : ''} from ${tn}'s timeline (${pv.entry_count || tl.length} entries). The foreword and chapter introductions were written with AI from those entries only; every entry comes from a sourced record on TownTales.</p>
</section>`;
}

// Towns without a book yet: a short waitlist. Requests show which towns to research next.
async function waitlist(res, town) {
  const prov = PROV[town.prov] || town.prov;
  const [pv] = await q(`book_previews?town=eq.${encodeURIComponent(town.slug)}&select=status,foreword,chapters,entry_count,built_at`).catch(() => []);
  const preview = await previewSection(town, pv).catch((e) => { console.error('preview failed', town.slug, e && e.message); return ''; });
  const main = `<section class="wrap stack" style="padding-top:22px">
<p class="crumbs"><a href="/">TownTales</a> › <a href="/province/${esc(PROV_SLUG[town.prov] || '')}">${esc(prov)}</a> › <a href="/${esc(town.slug)}">${esc(town.name)}</a> › Book</p>
<div class="bk-hero">${cover(town, prov)}<div class="stack">
<p class="eyebrow">The ${esc(town.name)} Book</p>
<h1>Want a book about ${esc(town.name)}?</h1>
<p class="lede">We make a history book for each town from everything on its TownTales page. ${esc(town.name)}'s isn't ready yet. Add your name and we'll let you know when it is. The towns with the most requests get their books first.</p>
${pv && pv.status === 'ready' ? `<div class="btns"><a class="btn" href="#preview">Look inside the preview</a><a class="btn alt" href="#request">Put me on the list</a></div>` : `<p><b>Request it and we'll lay out a free preview of the first pages right away.</b></p>`}
</div></div></section>
${preview}
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
  }), pv && pv.status === 'ready' ? 'public, s-maxage=600, stale-while-revalidate=86400' : 'public, s-maxage=30, stale-while-revalidate=60');
}
