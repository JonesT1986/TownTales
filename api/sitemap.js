const { getTowns } = require('./_towns');
const { q, PROV_SLUG } = require('./_shell');

module.exports = async (req, res) => {
  let towns = {};
  try { towns = await getTowns(); } catch (e) { /* serve at least the home page */ }
  const S = 'https://www.towntales.ca';
  const urls = [S + '/', S + '/province'];
  const provs = new Set();
  for (const [slug, t] of Object.entries(towns)) {
    urls.push(`${S}/${slug}`, `${S}/${slug}/archive`);
    const code = Object.keys(PROV_SLUG).find((c) => c === slug.slice(-2).toUpperCase());
    if (code) provs.add(code);
  }
  for (const c of provs) urls.push(`${S}/province/${PROV_SLUG[c]}`);
  // Cemetery & Remembrance: one index per town that has names, plus every person's permanent page.
  try {
    const mems = await q('memorials?status=eq.published&select=id,town&order=town,id', { all: true, timeout: 8000 });
    const seen = new Set();
    for (const m of mems) {
      if (!towns[m.town]) continue;
      if (!seen.has(m.town)) { seen.add(m.town); urls.push(`${S}/${m.town}/remembrance`); }
      urls.push(`${S}/${m.town}/remembrance/${encodeURIComponent(m.id)}`);
    }
  } catch (e) { /* remembrance tables unavailable: skip */ }
  // Sports History pages, only for towns that have teams (empty ones are noindex).
  try {
    const [teams, athletes] = await Promise.all([
      q('teams?status=eq.published&select=town', { all: true, timeout: 8000 }),
      q('athletes?status=eq.published&select=town', { all: true, timeout: 8000 }).catch(() => []),
    ]);
    for (const t of new Set(teams.concat(athletes).map((x) => x.town))) if (towns[t]) urls.push(`${S}/${t}/sports`);
  } catch (e) { /* teams table unavailable: skip */ }
  const esc = (u) => u.replace(/&/g, '&amp;');
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.end('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) => `  <url><loc>${esc(u)}</loc><changefreq>weekly</changefreq></url>`).join('\n') + '\n</urlset>\n');
};
