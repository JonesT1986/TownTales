// Rural Municipality pages, fully server-rendered (routed through api/extra.js?kind=rm to stay under 12 functions).
//   /rm               → every RM on TownTales, by province
//   /rm/<slug>        → one RM: its towns, hamlets, ghost towns, school districts, cemeteries,
//                       district-wide history (uploads marked "covers the whole RM") and a combined timeline,
//                       plus "Request the RM book".
// History only. Data is loaded by Travis's assistant (tables rms, rm_places, towns.rm; see db/2026-11-27-rms.sql).
// Every table read is soft: before the migration runs, /rm shows "coming soon" and nothing else breaks.
const { SITE, PROV, PROV_SLUG, esc, q, page, send, notFound } = require('./_shell');
const MK = require('./_markers');

const ORDER = ['BC', 'AB', 'SK', 'MB', 'ON', 'QC', 'NB', 'NS', 'PE', 'NL', 'YT', 'NT', 'NU'];
const KINDS = [
  ['hamlet', 'Hamlets and villages', 'Hamlet'],
  ['ghost_town', 'Ghost towns and lost places', 'Ghost town'],
  ['school', 'Country school districts', 'School district'],
  ['church', 'Country churches', 'Church'],
  ['post_office', 'Post offices', 'Post office'],
  ['other', 'Other places', 'Place'],
];
const TIER = { documented: ['Verified', 'rm-ver'], community: ['Community Memory', 'rm-mem'] };
const pill = (t) => { const x = TIER[t] || TIER.documented; return `<span class="rm-pill ${x[1]}">${x[0]}</span>`; };
const soft = (p) => p.catch(() => []);
const okUrl = (u) => (/^https?:\/\//i.test(String(u || '')) ? u : '');
const srcLine = (source, url) => source
  ? `<p class="rm-src"><b>Source:</b> ${esc(source)}${okUrl(url) ? ` · <a href="${esc(url)}" rel="nofollow noopener" target="_blank">View source</a>` : ''}</p>` : '';

// "RM of Martin No. 122", "RM of Rockwood", "County of Vermilion River"
function rmTitle(r) {
  if (!r) return '';
  if (r.full_name) return r.full_name;
  const kl = r.kind_label || 'Rural Municipality';
  if (/^rural municipality$/i.test(kl)) return 'RM of ' + r.name + (r.number ? ' No. ' + r.number : '');
  return kl + ' of ' + r.name;
}
function rmLong(r) { // for page titles and Google
  if (r.full_name) return r.full_name;
  const kl = r.kind_label || 'Rural Municipality';
  return kl + ' of ' + r.name + (r.number && /^rural municipality$/i.test(kl) ? ' No. ' + r.number : '');
}
const inList = (slugs) => 'in.(' + slugs.map((s) => '"' + encodeURIComponent(s) + '"').join(',') + ')';
const decade = (y) => (y ? Math.floor(Number(y) / 10) * 10 : null);

async function indexPage(res) {
  const [rms, towns] = await Promise.all([
    soft(q('rms?hidden=eq.false&select=slug,name,number,prov,kind_label,full_name&order=prov,number.nullslast,name', { all: true })),
    soft(q('towns?hidden=eq.false&rm=not.is.null&select=rm', { all: true })),
  ]);
  const count = {};
  for (const t of towns) count[t.rm] = (count[t.rm] || 0) + 1;
  const byProv = {};
  for (const r of rms) (byProv[r.prov] = byProv[r.prov] || []).push(r);
  const provs = ORDER.filter((c) => byProv[c]);
  const body = provs.length
    ? (provs.length > 1 ? `<nav class="rm-az mun-az" aria-label="Jump to a province">${provs.map((c) => `<a href="#p-${c}">${esc(PROV[c])}</a>`).join('')}</nav>` : '') +
      provs.map((c) => `<section class="stack" id="p-${c}"><h2>${esc(PROV[c])}</h2><ul class="pv-towns mun-list">${byProv[c].map((r) =>
        `<li><a href="/rm/${esc(r.slug)}">${esc(rmTitle(r))}</a> <span class="muted small">${count[r.slug] ? (count[r.slug] === 1 ? '1 town' : count[r.slug] + ' towns') : ''}</span></li>`).join('')}</ul></section>`).join('')
    : `<div class="pv-soon"><p><b>Coming soon.</b> The rural municipalities are being added now, with the towns, hamlets, country schools and cemeteries in each one.</p></div>`;
  const main = `<section class="wrap stack" style="padding-top:22px">
<p class="crumbs"><a href="/">TownTales</a> › Rural municipalities</p>
<p class="eyebrow">Beyond the town limits</p><h1>Rural municipalities</h1>
<p class="lede">A lot of prairie history happened out on the farms: the country schools, the little churches, the hamlets that grew up around an elevator and the ones that are gone now. Each RM page gathers that history in one place, along with the towns inside it.</p>
${body}
<div class="btns"><a class="btn" href="/#upload">Share your RM's history</a><a class="btn alt" href="/province">Browse by province</a></div>
</section>`;
  send(res, 200, page({
    title: 'Rural Municipality History — RMs, Hamlets, Country Schools | TownTales',
    desc: `History of ${rms.length ? rms.length + ' ' : ''}rural municipalities across Canada: the towns, hamlets, ghost towns, country school districts and cemeteries in each RM.`,
    canonical: SITE + '/rm', main, noindex: !rms.length,
  }));
}

function placesHtml(places, townSet) {
  const by = {};
  for (const p of places) (by[p.kind] = by[p.kind] || []).push(p);
  return KINDS.filter(([k]) => by[k]).map(([k, h]) => `<div class="stack mun-group"><h3>${esc(h)}</h3><div class="rm-cems">${by[k].map((p) => {
    const kv = [];
    if (p.years_label) kv.push(`<dt>Years</dt><dd>${esc(p.years_label)}</dd>`);
    if (p.location_desc) kv.push(`<dt>Where</dt><dd>${esc(p.location_desc)}</dd>`);
    const link = p.town && townSet.has(p.town) ? `<p><a href="/${esc(p.town)}">${esc(p.name)}'s own page →</a></p>` : '';
    return `<article class="rm-cem" id="place-${esc(p.id)}"><h4>${esc(p.name)}</h4>${kv.length ? `<dl class="kv">${kv.join('')}</dl>` : ''}${p.note ? `<p>${esc(p.note)}</p>` : ''}${link}<p>${pill(p.tier)}</p>${srcLine(p.source, p.source_url)}</article>`;
  }).join('')}</div></div>`).join('');
}

function timelineHtml(rows, tname) {
  if (!rows.length) return '';
  const by = {}, order = [];
  for (const e of rows) { const d = decade(e.year); const k = d == null ? 'undated' : String(d); if (!by[k]) { by[k] = []; order.push(k); } by[k].push(e); }
  const open = rows.length <= 60;
  return `<section class="wrap stack" id="timeline"><h2>Timeline of the district</h2>
<p class="muted">What happened across the RM, decade by decade, gathered from each town's own timeline. Tap a line to read the full entry on that town's page.</p>
<div class="mun-tl">${order.map((k) => `<details${open ? ' open' : ''}><summary><b>${k === 'undated' ? 'Date not known' : esc(k) + 's'}</b> <span class="muted small">${by[k].length} ${by[k].length === 1 ? 'entry' : 'entries'}</span></summary><ol>${by[k].map((e) =>
    `<li><span class="mun-yr">${esc(e.label || e.year || '')}</span> <a href="/${esc(e.town)}">${esc(e.title || 'Untitled')}</a> <span class="mun-town">${esc(tname[e.town] || '')}</span></li>`).join('')}</ol></details>`).join('')}</div></section>`;
}

async function rmPage(res, slug) {
  const s = encodeURIComponent(slug);
  const rows = await soft(q(`rms?slug=eq.${s}&hidden=eq.false&select=*`));
  const r = rows[0];
  if (!r) return notFound(res, "We don't have a rural municipality at that address yet.");
  const [towns, places] = await Promise.all([
    soft(q(`towns?hidden=eq.false&rm=eq.${s}&select=slug,name,est,place_kind&order=name`, { all: true })),
    soft(q(`rm_places?rm=eq.${s}&select=*&order=sort,name`, { all: true })),
  ]);
  const slugs = towns.map((t) => t.slug);
  const tname = Object.fromEntries(towns.map((t) => [t.slug, t.name]));
  const townSet = new Set(slugs);
  let wide = [], tl = [], cems = [];
  if (slugs.length) {
    const IN = inList(slugs);
    [wide, tl, cems] = await Promise.all([
      soft(q(`items?town=${IN}&scope=eq.rm&status=eq.published&select=id,town,title,body,year,date_label,source,source_url&order=year.asc.nullslast&limit=200`)),
      soft(q(`timeline?town=${IN}&select=town,year,label,title&order=year,sort`, { all: true })),
      soft(q(`cemeteries?town=${IN}&select=id,town,name,location_desc&order=name`, { all: true })),
    ]);
  }
  tl = tl.filter((e) => e.title).sort((a, b) => (a.year == null) - (b.year == null) || (a.year || 0) - (b.year || 0)).slice(0, 600);
  const prov = PROV[r.prov] || r.prov;
  const title = rmTitle(r);
  const office = r.office_town && tname[r.office_town] ? r.office_town : null;
  const facts = [
    r.est_label || r.est ? `<dt>Formed</dt><dd>${esc(r.est_label || r.est)}</dd>` : '',
    office ? `<dt>Office</dt><dd><a href="/${esc(office)}">${esc(tname[office])}</a></dd>` : '',
    `<dt>Province</dt><dd><a href="/province/${esc(PROV_SLUG[r.prov] || '')}">${esc(prov)}</a></dd>`,
  ].join('');
  const intro = r.intro && r.intro_source
    ? `<div class="article stack" style="max-width:780px"><p>${esc(r.intro).replace(/\n\n+/g, '</p><p>')}</p>${srcLine(r.intro_source, r.intro_source_url)}</div>`
    : `<div class="pv-soon"><p><b>Being written.</b> A short history of the ${esc(title)} is on its way. Like everything on TownTales, every fact in it will carry its source.</p></div>`;

  const townsHtml = towns.length
    ? `<style>${MK.CSS}</style><ul class="pv-towns">${towns.map((t) => `<li>${MK.mark(t.place_kind)}<a href="/${esc(t.slug)}">${esc(t.name)}</a>${t.est ? ` <span class="muted small">est. ${esc(t.est)}</span>` : ''}</li>`).join('')}</ul>`
    : `<div class="empty">No towns in the ${esc(title)} are linked yet.</div>`;
  const rmCems = places.filter((p) => p.kind === 'cemetery');
  const others = places.filter((p) => p.kind !== 'cemetery');
  const cemHtml = (rmCems.length || cems.length) ? `<section class="wrap stack" id="cemeteries"><h2>Cemeteries in the ${esc(title)}</h2>
<p class="muted">Town cemeteries link to the people remembered there. Country cemeteries are listed with what's known about them.</p>
${cems.length ? `<ul class="pv-towns">${cems.map((c) => `<li><a href="/${esc(c.town)}/remembrance?c=${encodeURIComponent(c.id)}">${esc(c.name)}</a> <span class="muted small">${esc(tname[c.town] || '')}</span></li>`).join('')}</ul>` : ''}
${rmCems.length ? `<div class="rm-cems">${rmCems.map((p) => `<article class="rm-cem"><h4>${esc(p.name)}</h4>${p.location_desc ? `<p class="small">${esc(p.location_desc)}</p>` : ''}${p.years_label ? `<p class="small">${esc(p.years_label)}</p>` : ''}${p.note ? `<p>${esc(p.note)}</p>` : ''}${p.town && townSet.has(p.town) ? `<p><a href="/${esc(p.town)}/remembrance">See the people remembered →</a></p>` : ''}<p>${pill(p.tier)}</p>${srcLine(p.source, p.source_url)}</article>`).join('')}</div>` : ''}
</section>` : '';
  const wideHtml = `<section class="wrap stack" id="district"><h2>History of the whole district</h2>
${wide.length ? `<div class="rm-cems">${wide.map((it) => {
    const b = String(it.body || '');
    return `<article class="rm-cem"><p class="eyebrow">${esc(it.date_label || it.year || '')}</p><h4>${esc(it.title || 'Untitled')}</h4>${b ? `<p>${esc(b.slice(0, 420))}${b.length > 420 ? '…' : ''}</p>` : ''}<p class="small">Shared on <a href="/${esc(it.town)}/archive">${esc(tname[it.town] || 'the town')}'s archive</a></p>${srcLine(it.source, it.source_url)}</article>`;
  }).join('')}</div>` : `<div class="pv-soon"><p>Some history belongs to the whole RM rather than one town: the threshing crews, the country schools, the dry years, the rural telephone company, the church picnics. Have something like that? Share it on any town's page in the RM and tick <b>"This is about the whole RM or district"</b>. It will show up here.</p></div>`}
<div class="btns"><a class="btn alt" href="/#upload">Share history from the ${esc(title)}</a><a class="btn alt" href="/share-a-book">Share an RM history book</a></div>
</section>`;

  const url = `${SITE}/rm/${slug}`;
  const share = encodeURIComponent(`A history book about the ${title} is on the way if enough people ask: ${url}#book`);
  const bookHtml = `<section class="wrap stack" id="book"><h2>Request the ${esc(title)} book</h2>
<p>Many of the old local history books covered the whole RM. We'd like to build a new one from everything on this page and its towns' pages. Ask for it below and we'll email you once, when it's ready, with a link to look through it first.</p>
<form class="formbox" data-tt-bookform data-rm="${esc(slug)}" data-waitlist="1" data-share="${esc(share)}" novalidate style="max-width:820px">
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
<p class="small">The more history on this page, the fuller the book will be.</p>
</section>`;

  const main = `<section class="wrap stack" style="padding-top:22px">
<p class="crumbs"><a href="/">TownTales</a> › <a href="/province/${esc(PROV_SLUG[r.prov] || '')}">${esc(prov)}</a> › <a href="/rm">Rural municipalities</a> › ${esc(title)}</p>
<p class="eyebrow">${esc(r.kind_label || 'Rural Municipality')} · ${esc(prov)}</p>
<h1>${esc(title)}</h1>
<p class="lede">The history of the ${esc(title)}: ${towns.length ? (towns.length === 1 ? 'its town' : 'its ' + towns.length + ' towns') + ', ' : ''}the hamlets, country schools, churches and cemeteries out on the land, and the stories of the families who farmed it.</p>
<dl class="kv mun-facts">${facts}</dl>
<div class="btns"><a class="btn" href="/#upload">Share history from the ${esc(title)}</a><a class="btn alt" href="#book">Request the RM book</a></div>
</section>
<section class="wrap stack"><h2>About the ${esc(title)}</h2>${intro}</section>
<section class="wrap stack" id="towns"><h2>Towns in the ${esc(title)}</h2>${townsHtml}</section>
${others.length ? `<section class="wrap stack" id="places"><h2>Out in the country</h2><p class="muted">Places in the RM that are small now, or gone. ${pill('documented')} from records, ${pill('community')} from local memory.</p>${placesHtml(others, townSet)}</section>` : ''}
${cemHtml}
${wideHtml}
${timelineHtml(tl, tname)}
${bookHtml}
<section class="wrap"><p class="small">Something wrong or missing? <a href="/#corrections">Tell us</a>.</p></section>`;

  const thin = !towns.length && !places.length && !wide.length && !r.intro;
  send(res, 200, page({
    title: `${rmLong(r)}, ${prov} — History, Towns, Schools and Cemeteries | TownTales`,
    desc: `History of the ${title}, ${prov}${towns.length ? ': ' + towns.slice(0, 6).map((t) => t.name).join(', ') + (towns.length > 6 ? ' and more' : '') : ''}. Hamlets, country school districts, churches, cemeteries and a district timeline.`,
    canonical: url, main, noindex: thin,
    ld: [{
      '@context': 'https://schema.org', '@type': 'CollectionPage', url, name: `${title} history`,
      about: { '@type': 'AdministrativeArea', name: rmLong(r), containedInPlace: { '@type': 'AdministrativeArea', name: prov } },
      breadcrumb: { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'TownTales', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: 'Rural municipalities', item: SITE + '/rm' },
        { '@type': 'ListItem', position: 3, name: title, item: url },
      ] },
    }],
  }));
}

async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const slug = String(url.searchParams.get('slug') || '').toLowerCase();
  try {
    if (!slug) return await indexPage(res);
    if (!/^[a-z0-9-]+$/.test(slug)) return notFound(res);
    return await rmPage(res, slug);
  } catch (e) {
    console.error('rm failed', slug, e && e.message);
    res.statusCode = 503;
    res.setHeader('Retry-After', '60');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<!doctype html><meta charset="utf-8"><title>Back shortly | TownTales</title><p style="font:20px/1.5 sans-serif;padding:24px">This page is having trouble loading. Please try again in a minute. <a href="/">TownTales home</a></p>');
  }
}
module.exports = handler;
module.exports.rmTitle = rmTitle;
