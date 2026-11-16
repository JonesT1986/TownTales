// Serves the TownTales app at real town URLs (e.g. /bangor-sk) with
// town-specific SEO tags, then hands off to the app's existing #t-<slug> router.

const SITE = 'https://www.towntales.ca';
const { getTowns } = require('./_towns');

const { getApp } = require('./_app');
const loadApp = getApp;

function strip(html, re) { return html.replace(re, ''); }
const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const slug = String(url.searchParams.get('slug') || '').toLowerCase();
  const isArchive = url.searchParams.get('sub') === 'archive';
  let towns = {};
  try { towns = await getTowns(); } catch (e) { /* database unreachable: fall through to 404 page */ }
  const town = towns[slug];
  const name = town && esc(town.name); // visitor-supplied, so escaped before going into the page head
  const provName = town ? esc(town.prov) : 'Saskatchewan';
  let html = loadApp();

  if (!html) { res.statusCode = 500; res.end('App unavailable'); return; }

  if (slug === '_home') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
    res.end(html);
    return;
  }

  if (!name) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(html.replace(/<head([^>]*)>/i, '<head$1>\n<meta name="robots" content="noindex">'));
    return;
  }

  const pagePath = '/' + slug + (isArchive ? '/archive' : '');
  const canonical = SITE + pagePath;
  const title = isArchive
    ? `${name}, ${provName} Archive — Old Photos, Stories and Clippings | TownTales`
    : `${name}, ${provName} — History, Archive and Timeline | TownTales`;
  const desc = isArchive
    ? `Browse old photos, stories and newspaper clippings from ${name}, ${provName}, shared by the people who lived there. Add your own to the archive.`
    : `${name}, ${provName} history: old photos, stories, clippings and a timeline built from what locals share. Have something from ${name}? Add it.`;

  html = strip(html, /<title>[\s\S]*?<\/title>/i);
  html = strip(html, /<meta\s+name=["']description["'][^>]*>/gi);
  html = strip(html, /<link\s+rel=["']canonical["'][^>]*>/gi);
  html = strip(html, /<meta\s+property=["']og:(title|description|url|type)["'][^>]*>/gi);

  const head = [
    `<title>${title}</title>`,
    `<meta name="description" content="${desc}">`,
    `<link rel="canonical" href="${canonical}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${desc}">`,
    `<meta property="og:url" content="${canonical}">`,
  ].join('\n');

  const charset = /<meta\s+charset=[^>]*>/i;
  html = charset.test(html)
    ? html.replace(charset, (m) => `${m}\n${head}`)
    : html.replace(/<head([^>]*)>/i, `<head$1>\n${head}`);

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.end(html);
};
