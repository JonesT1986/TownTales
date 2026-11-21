// SEO layer for TownTales.
// Wraps api/page.js (which itself wraps api/town.js) and, for crawlers and
// first paint, adds what the JavaScript app otherwise builds only in the browser:
//   1. the town's timeline and archive, server-rendered into <main id="view">
//      (the app replaces this same container when its script runs, so visitors
//      see identical content);
//   2. a plain directory of real <a href="/slug"> links to every town, so search
//      engines can crawl from page to page (the app's own links are #fragments);
//   3. a canonical tag on the homepage and JSON-LD structured data.
// Any failure falls back to serving page.js exactly as before.

const page = require('./page');
const { getApp } = require('./_app');

const SITE = 'https://www.towntales.ca';
const PROV = { SK: 'Saskatchewan', AB: 'Alberta', MB: 'Manitoba', BC: 'British Columbia', ON: 'Ontario', QC: 'Quebec', NB: 'New Brunswick', NS: 'Nova Scotia', PE: 'Prince Edward Island', NL: 'Newfoundland and Labrador', YT: 'Yukon', NT: 'Northwest Territories', NU: 'Nunavut' };
const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const jsonLd = (o) => '<script type="application/ld+json">' + JSON.stringify(o).replace(/</g, '\\u003c') + '</script>';

let creds = null;
function supa() {
  if (creds) return creds;
  const html = getApp() || '';
  const url = (html.match(/https:\/\/[a-z0-9]+\.supabase\.co/) || [])[0];
  const key = (html.match(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/) || [])[0];
  creds = url && key ? { url, key } : false;
  return creds;
}
async function q(path) {
  const c = supa();
  if (!c) throw new Error('no db config');
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 4000);
  try {
    const r = await fetch(c.url + '/rest/v1/' + path, { headers: { apikey: c.key, Authorization: 'Bearer ' + c.key }, signal: ctl.signal });
    if (!r.ok) throw new Error('db ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

// Run page.js against a capturing response so we can edit its HTML.
function capture(req) {
  return new Promise((resolve, reject) => {
    const headers = {};
    let body = '';
    const res = {
      statusCode: 200,
      setHeader(k, v) { headers[k.toLowerCase()] = v; return res; },
      getHeader(k) { return headers[k.toLowerCase()]; },
      removeHeader(k) { delete headers[k.toLowerCase()]; },
      status(c) { res.statusCode = c; return res; },
      write(c) { body += c == null ? '' : String(c); return true; },
      end(c) { if (c != null) body += String(c); resolve({ statusCode: res.statusCode, headers, body }); return res; },
      send(c) { return res.end(c); },
    };
    Promise.resolve(page(req, res)).catch(reject);
  });
}

function directory(towns, current) {
  const byProv = {};
  for (const t of towns) (byProv[t.prov] = byProv[t.prov] || []).push(t);
  const groups = Object.keys(byProv).sort().map((p) =>
    '<div><h3><a href="/province/' + esc(String(PROV[p] || p).toLowerCase().replace(/ /g, '-')) + '">' + esc(PROV[p] || p) + ' towns</a></h3><p class="small" style="line-height:1.9">' +
    byProv[p].map((t) => t.slug === current
      ? '<b>' + esc(t.name) + '</b>'
      : '<a href="/' + esc(t.slug) + '">' + esc(t.name) + '</a>').join(' · ') +
    '</p></div>').join('');
  return '<nav aria-label="All towns" class="wrap" id="ssr-towns" style="padding:24px 0;display:grid;gap:16px">' + groups + '</nav>';
}

function townBody(town, timeline, items, archive, cems, clips, teams) {
  cems = cems || []; clips = clips || []; teams = teams || [];
  const prov = PROV[town.prov] || town.prov;
  let h = '<section class="wrap stack" id="ssr-town"><p class="small"><a href="/">TownTales</a> › ' + esc(town.name) + '</p>' +
    '<h1>' + esc(town.name) + ', ' + esc(prov) + (archive ? ' — Archive' : '') + '</h1>';
  if (!archive) {
    h += '<p>A community-built history of ' + esc(town.name) + ', ' + esc(prov) + ': ' + timeline.length + ' timeline entries and ' + items.length + ' archive items so far. <a href="/' + esc(town.slug) + '/archive">Browse the full archive</a>.</p>';
    if (timeline.length) {
      h += '<h2>' + esc(town.name) + ' history timeline</h2><ol>';
      for (const e of timeline) h += '<li><h3>' + esc(e.label || e.year || '') + (e.title ? ' — ' + esc(e.title) : '') + '</h3><p>' + esc(e.body) + '</p></li>';
      h += '</ol>';
    } else {
      h += '<p>' + esc(town.name) + '\'s page is just getting started. Have an old photo or a story? You could be the first to add it.</p>';
    }
  } else {
    h += '<p>Photos, stories, clippings and documents about ' + esc(town.name) + ' shared by locals. <a href="/' + esc(town.slug) + '">See the ' + esc(town.name) + ' timeline</a>.</p>';
  }
  if (!archive) {
    h += '<h2>' + esc(town.name) + ' Cemetery &amp; Remembrance</h2><p>' +
      (cems.length ? 'Cemeteries: ' + cems.map((c) => esc(c.name)).join(', ') + '. ' : '') +
      '<a href="/' + esc(town.slug) + '/remembrance">Search the people remembered in ' + esc(town.name) + '</a>, or add someone from your family.</p>';
  }
  if (!archive && teams.length) {
    const tierLabel = (t) => (t === 'community' ? 'Community Memory' : 'Verified');
    const champ = (c) => (c == null ? '' : typeof c === 'object' ? [c.year || c.years || c.date, c.title || c.name || c.text].filter(Boolean).join(' — ') : String(c));
    const bySport = {};
    for (const t of teams) (bySport[t.sport] = bySport[t.sport] || []).push(t);
    h += '<h2>' + esc(town.name) + ' Sports &amp; Teams</h2>';
    for (const sp of Object.keys(bySport)) {
      h += '<h3>' + esc(sp) + '</h3><ul>';
      for (const t of bySport[sp]) {
        const ch = (Array.isArray(t.championships) ? t.championships : []).map(champ).filter(Boolean);
        h += '<li><h4>' + esc(t.name) + '</h4><p>' + [t.league && 'League: ' + esc(t.league), t.years_label && 'Years: ' + esc(t.years_label), t.home_venue && 'Home: ' + esc(t.home_venue)].filter(Boolean).join(' · ') + '</p>' +
          (ch.length ? '<p>Championships:</p><ul>' + ch.map((c) => '<li>' + esc(c) + '</li>').join('') + '</ul>' : '') +
          (t.note ? '<p>' + esc(t.note) + '</p>' : '') +
          '<p class="small">' + tierLabel(t.tier) + ' · Source: ' + esc(t.source) + '</p></li>';
      }
      h += '</ul>';
    }
  }
  if (archive && clips.length) {
    h += '<h2>Newspaper clippings from ' + esc(town.name) + '</h2><ul>';
    for (const c of clips) {
      const t = [c.paper_name, c.date_label].filter(Boolean).join(', ') || 'Newspaper clipping';
      h += '<li><h3>' + esc(t) + '</h3>' + (c.description ? '<p>' + esc(c.description) + '</p>' : '') +
        (c.transcription ? '<p>' + (c.transcription_status === 'transcribed' ? '<b>AI transcription — not yet verified.</b> ' : '') + esc(String(c.transcription).slice(0, 1500)) + '</p>' : '') +
        '<p class="small">Source: ' + esc(t) + (c.submitter_name ? ' · Shared by ' + esc(c.submitter_name) : '') + '</p></li>';
    }
    h += '</ul>';
  }
  if (items.length) {
    h += '<h2>From the ' + esc(town.name) + ' archive</h2><ul>';
    for (const it of items.slice(0, archive ? 200 : 25)) {
      const body = String(it.body || '');
      h += '<li><h3>' + esc(it.title || 'Untitled') + '</h3>' +
        (body ? '<p>' + esc(archive ? body : body.slice(0, 280) + (body.length > 280 ? '…' : '')) + '</p>' : '') +
        (it.source ? '<p class="small">Source: ' + esc(it.source) + '</p>' : '') + '</li>';
    }
    h += '</ul>';
  }
  return h + '</section>';
}

module.exports = async (req, res) => {
  let out;
  try {
    out = await capture(req);
  } catch (e) {
    return page(req, res); // never make things worse
  }
  let html = out.body;
  try {
    const isHtml = String(out.headers['content-type'] || '').includes('text/html');
    if (out.statusCode === 200 && isHtml && html.includes('<main id="view"></main>')) {
      const url = new URL(req.url, 'http://localhost');
      const slug = String(url.searchParams.get('slug') || '').toLowerCase();
      const archive = url.searchParams.get('sub') === 'archive';
      const towns = await q('towns?select=slug,name,prov&hidden=eq.false&order=name.asc');
      const inject = [];
      let main = '';

      if (slug === '_home') {
        if (!/rel=["']canonical["']/i.test(html)) inject.push('<link rel="canonical" href="' + SITE + '/">');
        inject.push(jsonLd({ '@context': 'https://schema.org', '@type': 'WebSite', name: 'TownTales', url: SITE + '/', description: 'Community-built history of small prairie towns: old photos, stories, clippings and timelines.' }));
        main = '<section class="wrap stack" id="ssr-home"><h1>TownTales: small-town prairie history</h1>' +
          '<p>Old photos, stories, clippings and a timeline for ' + towns.length + ' small towns, built from what locals share.</p>' +
          '<p>New towns are added every week — and every town\'s history grows with your help. <a href="/#upload">Add a memory, a photo, or your family\'s story →</a></p>' +
          '<h2>This site grows one town, and one memory, at a time.</h2>' +
          '<p>New towns are added every week, but the real history doesn\'t live in archives — it lives with the people who were there. If you know a story, hold a photo, or have your community\'s history book on a shelf, you can put it where it belongs: on your town\'s page, with your name on it as the source.</p>' +
          '<ul><li>Share a memory or correct a date on any town\'s timeline</li><li><a href="/share-a-book">Share your community\'s history book</a> — no scanner needed: clear phone photos of the pages work great</li><li>Add your family\'s people to the town\'s Cemetery &amp; Remembrance section</li></ul>' +
          '<p>Every entry is sourced and credited. This history belongs to the towns — we\'re just keeping it safe.</p>' +
          '<p><a href="/province">Browse towns by province</a></p></section>';
      } else {
        const town = towns.find((t) => t.slug === slug);
        if (town) {
          const s = encodeURIComponent(slug);
          const soft = (p) => p.catch(() => []); // new tables: never let them break the town page
          const [timeline, items, cems, clips, teams] = await Promise.all([
            archive ? Promise.resolve([]) : q('timeline?town=eq.' + s + '&select=year,label,title,body&order=year,sort'),
            q('items?town=eq.' + s + '&status=eq.published&select=title,body,year,source&order=created_at.desc'),
            archive ? Promise.resolve([]) : soft(q('cemeteries?town=eq.' + s + '&select=name&order=name')),
            archive ? soft(q('clippings?town=eq.' + s + '&select=paper_name,date_label,description,transcription,transcription_status,submitter_name&order=created_at.desc&limit=100')) : Promise.resolve([]),
            archive ? Promise.resolve([]) : soft(q('teams?town=eq.' + s + '&select=name,sport,league,years_label,home_venue,championships,note,tier,source&order=sport,name')),
          ]);
          main = townBody(town, timeline, items, archive, cems, clips, teams);
          const prov = PROV[town.prov] || town.prov;
          const pageUrl = SITE + '/' + slug + (archive ? '/archive' : '');
          inject.push(jsonLd({
            '@context': 'https://schema.org', '@type': 'WebPage', url: pageUrl,
            name: town.name + ', ' + prov + (archive ? ' — Archive' : ' — History and Timeline'),
            about: { '@type': 'Place', name: town.name + ', ' + prov, address: { '@type': 'PostalAddress', addressLocality: town.name, addressRegion: town.prov, addressCountry: 'CA' } },
            breadcrumb: { '@type': 'BreadcrumbList', itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'TownTales', item: SITE + '/' },
              { '@type': 'ListItem', position: 2, name: town.name, item: SITE + '/' + slug },
            ].concat(archive ? [{ '@type': 'ListItem', position: 3, name: 'Archive', item: pageUrl }] : []) },
          }));
        }
      }

      if (main) html = html.replace('<main id="view"></main>', '<main id="view">' + main + '</main>');
      if (towns.length) html = html.replace('</footer>', directory(towns, slug) + '</footer>');
      if (inject.length) html = html.replace('</head>', inject.join('') + '</head>');
    }
  } catch (e) {
    html = out.body; // data fetch failed: serve the original page unchanged
  }
  res.statusCode = out.statusCode;
  for (const [k, v] of Object.entries(out.headers)) {
    if (k !== 'content-length') res.setHeader(k, v);
  }
  res.end(html);
};
