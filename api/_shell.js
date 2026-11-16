// Shared helpers for the fully server-rendered pages (Remembrance, memorial pages, province pages).
// These pages reuse the app's own <head> styles, header and footer so they look like the rest of the site,
// but they do NOT load the single-page app script: their content is complete in the HTML (good for Google,
// fast on old phones, and the URLs are permanent for printed QR plaques).
const { getApp } = require('./_app');

const SITE = 'https://www.towntales.ca';
const SB = 'https://zpqwrzsgpwwjrlbnfynn.supabase.co';
const KEY = 'sb_publishable_j_Vw3H_ebMP7WL4uZwRowQ_u-DX37QU'; // public key, same as api/_towns.js; RLS limits what it can read
const PROV = { SK: 'Saskatchewan', MB: 'Manitoba', AB: 'Alberta', BC: 'British Columbia', ON: 'Ontario', QC: 'Quebec', NB: 'New Brunswick', NS: 'Nova Scotia', PE: 'Prince Edward Island', NL: 'Newfoundland and Labrador', YT: 'Yukon', NT: 'Northwest Territories', NU: 'Nunavut' };
const PROV_SLUG = Object.fromEntries(Object.entries(PROV).map(([c, n]) => [c, n.toLowerCase().replace(/ /g, '-')]));
const ASSET_V = '2';

const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const jsonLd = (o) => '<script type="application/ld+json">' + JSON.stringify(o).replace(/</g, '\\u003c') + '</script>';

// Read from the database with the public key. Pages through results (the API returns at most 1000 rows per call).
async function q(path, { all = false, timeout = 5000 } = {}) {
  const out = [];
  const step = 1000;
  for (let from = 0; ; from += step) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout);
    let rows;
    try {
      const r = await fetch(SB + '/rest/v1/' + path, {
        headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Range-Unit': 'items', Range: `${from}-${from + step - 1}` },
        signal: ctl.signal,
      });
      if (!r.ok) {
        const msg = await r.text();
        // Tables not created yet: behave as "no data" instead of breaking the page.
        if (r.status === 404 || /does not exist|schema cache/i.test(msg)) return out;
        throw new Error('db ' + r.status + ' ' + msg.slice(0, 200));
      }
      rows = await r.json();
    } finally { clearTimeout(t); }
    out.push(...rows);
    if (!all || rows.length < step) return out;
  }
}

// Turn the app's in-page links (#towns, #upload …) into links back to the app from a standalone page.
function fixLinks(html) {
  return html.replace(/href="#home"/g, 'href="/"').replace(/href="#([^"]*)"/g, 'href="/#$1"');
}

let parts = null;
function shellParts() {
  if (parts) return parts;
  const html = getApp();
  if (!html) return null;
  const head = html.slice(0, html.indexOf('</head>'))
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<meta\s+name=["']description["'][^>]*>/gi, '')
    .replace(/<link\s+rel=["']canonical["'][^>]*>/gi, '')
    .replace(/<meta\s+property=["']og:[a-z:]+["'][^>]*>/gi, '');
  const hs = html.indexOf('<header'), he = html.indexOf('</header>') + 9;
  const fs = html.indexOf('<footer'), fe = html.indexOf('</footer>') + 9;
  parts = {
    head,
    header: fixLinks(html.slice(hs, he)),
    footer: fixLinks(html.slice(fs, fe)),
  };
  return parts;
}

// Build a complete page. `main` is trusted HTML (callers escape their data).
function page({ title, desc, canonical, main, ld = [], noindex = false, navKey = 'towns' }) {
  const p = shellParts();
  if (!p) return null;
  const header = p.header.replace(/(<a href="\/#towns")/, navKey === 'towns' ? '$1 aria-current="page"' : '$1');
  const metas = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(desc)}">`,
    canonical ? `<link rel="canonical" href="${esc(canonical)}">` : '',
    noindex ? '<meta name="robots" content="noindex">' : '',
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    canonical ? `<meta property="og:url" content="${esc(canonical)}">` : '',
    `<link rel="stylesheet" href="/towntales-extra.css?v=${ASSET_V}">`,
    ld.map(jsonLd).join(''),
  ].filter(Boolean).join('\n');
  return `${p.head}\n${metas}\n</head>\n<body>\n${header}\n<main id="view">${main}</main>\n${p.footer}\n` +
    `<script src="/towntales-extra.js?v=${ASSET_V}" defer></script>\n</body>\n</html>\n`;
}

function send(res, status, html, cache = 'public, s-maxage=3600, stale-while-revalidate=86400') {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', status === 200 ? cache : 'public, s-maxage=60');
  res.end(html);
}

function notFound(res, msg) {
  const html = page({
    title: 'Page not found | TownTales', desc: 'This page could not be found.', noindex: true,
    main: `<section class="wrap stack" style="padding-top:28px"><h1>We couldn't find that page</h1><p class="lede">${esc(msg || 'It may have moved, or the link may be mistyped.')}</p><p><a href="/#towns">See all towns</a></p></section>`,
  });
  send(res, 404, html || 'Not found');
}

module.exports = { SITE, SB, KEY, PROV, PROV_SLUG, ASSET_V, esc, jsonLd, q, page, send, notFound, fixLinks };
