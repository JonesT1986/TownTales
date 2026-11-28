// Sitemap index + child sitemaps.
//   /sitemap.xml                    -> index (this is the only one to submit in Search Console)
//   /sitemap-core.xml               -> home, provinces, towns, archives, sports
//   /sitemap-remembrance-<n>.xml    -> remembrance people, CHUNK rows per file (n starts at 1)
// Google rejects a sitemap over 50,000 URLs or with any URL over 2,048 characters, so people are split
// into chunks and absurdly long ids (bad imported data) are left out.
const { getTowns } = require('./_towns');
const { q, PROV_SLUG, SB, KEY } = require('./_shell');

const S = 'https://www.towntales.ca';
const CHUNK = 10000;          // rows per remembrance file (well under the 50,000 limit)
const PAGE = 1000;            // rows per database request (the API's cap)
const MAX_ID = 150;           // longer ids are bad data; the page itself is noindexed too
const esc = (u) => u.replace(/&/g, '&amp;');

function send(res, xml) {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.end('<?xml version="1.0" encoding="UTF-8"?>\n' + xml + '\n');
}
const urlset = (urls) => '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map((u) => `  <url><loc>${esc(u)}</loc><changefreq>weekly</changefreq></url>`).join('\n') + '\n</urlset>';

const headers = (extra) => Object.assign({ apikey: KEY, Authorization: 'Bearer ' + KEY, 'Range-Unit': 'items' }, extra);

async function countMemorials() {
  const r = await fetch(`${SB}/rest/v1/memorials?status=eq.published&select=id`, { headers: headers({ Prefer: 'count=exact', Range: '0-0' }) });
  const m = /\/(\d+)$/.exec(r.headers.get('content-range') || '');
  if (!m) throw new Error('no count');
  return Number(m[1]);
}

async function memorialRows(from, to) {
  const jobs = [];
  for (let s = from; s < to; s += PAGE) {
    const e = Math.min(s + PAGE, to) - 1;
    jobs.push(fetch(`${SB}/rest/v1/memorials?status=eq.published&select=id,town,birth_date_label,death_date_label&order=id`, { headers: headers({ Range: `${s}-${e}` }) })
      .then((r) => (r.ok ? r.json() : r.status === 416 ? [] : Promise.reject(new Error('memorials ' + r.status)))));  // 416 = page is past the last row
  }
  return [].concat(...(await Promise.all(jobs)));
}

// Towns with more than ARCHIVE_MIN published items, or any clippings. Their archive page is worth indexing;
// the rest repeat the town page and are noindexed there.
const ARCHIVE_MIN = 25;
async function archiveTowns() {
  const r = await fetch(`${SB}/rest/v1/items?status=eq.published&select=id`, { headers: headers({ Prefer: 'count=exact', Range: '0-0' }) });
  const m = /\/(\d+)$/.exec(r.headers.get('content-range') || '');
  if (!m) throw new Error('no item count');
  const total = Number(m[1]);
  const rows = [];
  const one = (s) => fetch(`${SB}/rest/v1/items?status=eq.published&select=town&order=id`, { headers: headers({ Range: `${s}-${s + PAGE - 1}` }) })
    .then((x) => (x.ok ? x.json() : x.status === 416 ? [] : Promise.reject(new Error('items ' + x.status))));
  for (let s = 0; s < total; s += PAGE * 10) { // ten requests at a time: the database refuses a burst of 70+
    const batch = [];
    for (let b = s; b < Math.min(s + PAGE * 10, total); b += PAGE) batch.push(one(b));
    for (const part of await Promise.all(batch)) rows.push(...part);
  }
  const n = {};
  for (const it of rows) n[it.town] = (n[it.town] || 0) + 1;
  const out = new Set(Object.keys(n).filter((t) => n[t] > ARCHIVE_MIN));
  const clips = await q('clippings?select=town', { all: true, timeout: 8000 }).catch(() => []);
  for (const c of clips) out.add(c.town);
  return out;
}

module.exports = async (req, res) => {
  const sp = new URL(req.url, S).searchParams;
  const part = sp.get('part') || 'index';

  if (part === 'index') {
    let n = 12; // if the count lookup fails, over-list: empty files are still valid sitemaps
    try { n = Math.max(1, Math.ceil((await countMemorials()) / CHUNK)); } catch (e) { /* keep fallback */ }
    const maps = [`${S}/sitemap-core.xml`];
    for (let i = 1; i <= n; i++) maps.push(`${S}/sitemap-remembrance-${i}.xml`);
    return send(res, '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      maps.map((u) => `  <sitemap><loc>${u}</loc></sitemap>`).join('\n') + '\n</sitemapindex>');
  }

  let towns = {};
  try { towns = await getTowns(); } catch (e) { /* serve what we can */ }

  if (part === 'core') {
    const urls = [S + '/', S + '/province'];
    const provs = new Set();
    let bigArchive = null; // towns whose archive has more than the town page shows (see seo.js ARCHIVE_MIN)
    try { bigArchive = await archiveTowns(); } catch (e) { /* unknown: list every archive, as before */ }
    for (const slug of Object.keys(towns)) {
      urls.push(`${S}/${slug}`);
      if (!bigArchive || bigArchive.has(slug)) urls.push(`${S}/${slug}/archive`);
      const code = Object.keys(PROV_SLUG).find((c) => c === slug.slice(-2).toUpperCase());
      if (code) provs.add(code);
    }
    for (const c of provs) urls.push(`${S}/province/${PROV_SLUG[c]}`);
    // Sports History pages, only for towns that have teams (empty ones are noindex).
    try {
      const [teams, athletes] = await Promise.all([
        q('teams?status=eq.published&select=town', { all: true, timeout: 8000 }),
        q('athletes?status=eq.published&select=town', { all: true, timeout: 8000 }).catch(() => []),
      ]);
      for (const t of new Set(teams.concat(athletes).map((x) => x.town))) if (towns[t]) urls.push(`${S}/${t}/sports`);
    } catch (e) { /* teams table unavailable: skip */ }
    return send(res, urlset(urls));
  }

  if (part === 'rem') {
    const n = parseInt(sp.get('n'), 10);
    if (!(n >= 1)) { res.statusCode = 404; return res.end('Not found'); }
    const urls = [];
    try {
      const rows = await memorialRows((n - 1) * CHUNK, n * CHUNK);
      const seen = new Set();
      for (const m of rows) {
        if (!towns[m.town]) continue;
        if (!seen.has(m.town)) { seen.add(m.town); urls.push(`${S}/${m.town}/remembrance`); } // a town's index can repeat across files; harmless
        if (!m.id || m.id.length > MAX_ID) continue;
        if (!m.birth_date_label && !m.death_date_label) continue; // name only: too thin to submit (the page stays live)
        urls.push(`${S}/${m.town}/remembrance/${encodeURIComponent(m.id)}`);
      }
    } catch (e) { res.statusCode = 503; return res.end('Temporarily unavailable'); }
    return send(res, urlset(urls));
  }

  res.statusCode = 404;
  res.end('Not found');
};
