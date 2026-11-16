// Province and territory pages, fully server-rendered.
//   /province          → all 13 provinces and territories
//   /province/<name>   → e.g. /province/saskatchewan: settlement overview, province-wide topics, index of its towns
// Overview and topics come from the `provinces` table (content supplied later). Anything without a source is not shown.
const { SITE, PROV, PROV_SLUG, esc, q, page, send, notFound } = require('./_shell');
const { regionIcon } = require('./_icons');

const TERR = new Set(['YT', 'NT', 'NU']);
const ORDER = ['BC', 'AB', 'SK', 'MB', 'ON', 'QC', 'NB', 'NS', 'PE', 'NL', 'YT', 'NT', 'NU']; // west to east, then north
const kind = (c) => (TERR.has(c) ? 'Territory' : 'Province');
const srcLine = (source, url) => {
  const u = /^https?:\/\//i.test(String(url || '')) ? url : '';
  return `<p class="rm-src"><b>Source:</b> ${esc(source)}${u ? ` · <a href="${esc(u)}" rel="nofollow noopener" target="_blank">View source</a>` : ''}</p>`;
};

async function allTowns() {
  return q('towns?hidden=eq.false&select=slug,name,prov&order=name', { all: true });
}

async function indexPage(res) {
  const towns = await allTowns();
  const count = {};
  for (const t of towns) count[t.prov] = (count[t.prov] || 0) + 1;
  const card = (c) => `<a class="pv-card" href="/province/${PROV_SLUG[c]}">${regionIcon(c, '')}<span><b>${esc(PROV[c])}</b><span class="muted small">${count[c] ? (count[c] === 1 ? '1 town' : count[c] + ' towns') : 'No towns yet'}</span></span></a>`;
  const main = `<section class="wrap stack" style="padding-top:22px">
<p class="crumbs"><a href="/">TownTales</a> › Provinces and territories</p>
<p class="eyebrow">Across Canada</p><h1>Towns by province and territory</h1>
<p class="lede">Every province and territory has its own page, with the towns that are on TownTales so far. Don't see yours? Anyone can add a town.</p>
<div class="pv-grid">${ORDER.map(card).join('')}</div>
<div class="btns"><a class="btn" href="/#addtown">Add your town</a></div>
</section>`;
  send(res, 200, page({
    title: 'Small-Town History by Province and Territory | TownTales',
    desc: `Browse ${towns.length} small towns across Canada by province and territory: old photos, stories, clippings, timelines and cemetery records.`,
    canonical: SITE + '/province', main,
  }));
}

async function provPage(res, code) {
  const s = encodeURIComponent(code);
  const [towns, rows] = await Promise.all([
    q(`towns?hidden=eq.false&prov=eq.${s}&select=slug,name&order=name`, { all: true }),
    q(`provinces?code=eq.${s}&select=*`).catch(() => []),
  ]);
  const pv = rows[0] || {};
  const name = PROV[code];
  const topics = (Array.isArray(pv.topics) ? pv.topics : []).filter((t) => t && t.title && t.body && t.source);
  const overview = pv.overview && pv.overview_source
    ? `<div class="article stack" style="max-width:780px"><p>${esc(pv.overview).replace(/\n\n+/g, '</p><p>')}</p>${srcLine(pv.overview_source, pv.overview_source_url)}</div>`
    : `<div class="pv-soon"><p><b>Being written.</b> A short history of how ${esc(name)} was settled is on its way. Like everything on TownTales, every fact in it will carry its source.</p></div>`;
  const topicsHtml = topics.length
    ? topics.map((t) => `<div class="rm-cem"><h3>${esc(t.title)}</h3><p>${esc(t.body)}</p>${srcLine(t.source, t.source_url)}</div>`).join('')
    : `<div class="pv-soon"><p><b>Coming soon.</b> Some history belongs to the whole ${kind(code).toLowerCase()} rather than one town: the railways, homesteading, schools, wars and hard years that shaped every community here. Those stories will be gathered here.</p><p>Have a source to suggest? <a href="/#corrections">Send it to us</a>.</p></div>`;
  const byLetter = {};
  for (const t of towns) { const l = (t.name.normalize('NFKD').charAt(0) || '#').toUpperCase(); (byLetter[l] = byLetter[l] || []).push(t); }
  const letters = Object.keys(byLetter).sort();
  const townsHtml = towns.length
    ? `${letters.length > 6 ? `<nav class="rm-az" aria-label="Jump to a letter">${letters.map((l) => `<a href="#t-${esc(l)}">${esc(l)}</a>`).join('')}</nav>` : ''}
<ul class="pv-towns">${towns.map((t, i) => {
      const l = (t.name.normalize('NFKD').charAt(0) || '#').toUpperCase();
      const first = i === 0 || (towns[i - 1].name.normalize('NFKD').charAt(0) || '#').toUpperCase() !== l;
      return `<li${first ? ` id="t-${esc(l)}"` : ''}><a href="/${esc(t.slug)}">${esc(t.name)}</a></li>`;
    }).join('')}</ul>`
    : `<div class="empty">No ${esc(name)} towns are on TownTales yet. Yours could be the first.</div>`;

  const url = `${SITE}/province/${PROV_SLUG[code]}`;
  const main = `<section class="wrap stack" style="padding-top:22px">
<p class="crumbs"><a href="/">TownTales</a> › <a href="/province">Provinces and territories</a> › ${esc(name)}</p>
<div class="pv-head">${regionIcon(code)}<div class="stack" style="gap:6px"><p class="eyebrow">${kind(code)}</p><h1>${esc(name)}</h1></div></div>
<p class="lede">${towns.length ? `${towns.length === 1 ? 'One town' : towns.length + ' towns'} in ${esc(name)} ${towns.length === 1 ? 'has' : 'have'} a page on TownTales so far, each with an archive, a timeline and a place to remember the people who lived there.` : `${esc(name)}'s towns are waiting to be added.`}</p>
<div class="btns"><a class="btn" href="#towns">See the towns</a><a class="btn alt" href="/#addtown">Add your town</a></div>
</section>
<section class="wrap stack"><h2>How ${esc(name)} was settled</h2>${overview}</section>
<section class="wrap stack"><h2>${esc(name)}-wide history</h2><div class="rm-cems">${topicsHtml}</div></section>
<section class="wrap stack" id="towns"><h2>${esc(name)} towns on TownTales</h2>${townsHtml}</section>`;

  send(res, 200, page({
    title: `${name} Small-Town History — ${towns.length ? towns.length + (towns.length === 1 ? ' Town' : ' Towns') : 'Towns'}, Timelines and Archives | TownTales`,
    desc: `Small-town history in ${name}: ${towns.length ? towns.length + ' towns with ' : ''}old photos, stories, newspaper clippings, timelines and cemetery records, shared by the people who lived there.`,
    canonical: url, main,
    ld: [{
      '@context': 'https://schema.org', '@type': 'CollectionPage', url, name: `${name} small-town history`,
      about: { '@type': 'AdministrativeArea', name, containedInPlace: { '@type': 'Country', name: 'Canada' } },
      breadcrumb: { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'TownTales', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: 'Provinces and territories', item: SITE + '/province' },
        { '@type': 'ListItem', position: 3, name, item: url },
      ] },
    }],
  }));
}

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const name = String(url.searchParams.get('name') || '').toLowerCase();
  try {
    if (!name) return await indexPage(res);
    const code = Object.keys(PROV_SLUG).find((c) => PROV_SLUG[c] === name || c.toLowerCase() === name);
    if (!code) return notFound(res, "We don't have a province or territory at that address.");
    if (PROV_SLUG[code] !== name) { res.statusCode = 301; res.setHeader('Location', '/province/' + PROV_SLUG[code]); return res.end(); }
    return await provPage(res, code);
  } catch (e) {
    console.error('province failed', name, e && e.message);
    res.statusCode = 503;
    res.setHeader('Retry-After', '60');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<!doctype html><meta charset="utf-8"><title>Back shortly | TownTales</title><p style="font:20px/1.5 sans-serif;padding:24px">This page is having trouble loading. Please try again in a minute. <a href="/">TownTales home</a></p>');
  }
};
