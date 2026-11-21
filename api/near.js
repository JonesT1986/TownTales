// /api/near → the stop on the line closest to the visitor, from Vercel's own location headers
// (city + province worked out from the visitor's internet connection; nothing is stored or logged here).
// Returns { slug, name, how: "city" } when the visitor's town (or a town with the same name in their
// province) is on the line, otherwise { slug: null }. Canada only.
const { q } = require('./_shell');

const norm = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\bst\.?\s/g, 'saint ').replace(/\bste\.?\s/g, 'sainte ').replace(/\bmt\.?\s/g, 'mount ')
  .replace(/[^a-z0-9]+/g, ' ').trim();
const PROVS = ['SK', 'MB', 'AB', 'BC', 'ON', 'QC', 'NB', 'NS', 'PE', 'NL', 'YT', 'NT', 'NU'];
let cache = { at: 0, byProv: null };

async function townsByProv() {
  if (cache.byProv && Date.now() - cache.at < 3600_000) return cache.byProv;
  const rows = await q('towns?hidden=eq.false&select=slug,name,prov', { all: true });
  const byProv = {};
  for (const t of rows) (byProv[t.prov] = byProv[t.prov] || []).push({ slug: t.slug, name: t.name, key: norm(t.name) });
  cache = { at: Date.now(), byProv };
  return byProv;
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  const h = req.headers || {};
  const send = (o) => { res.statusCode = 200; res.end(JSON.stringify(o)); };
  try {
    const country = String(h['x-vercel-ip-country'] || '').toUpperCase();
    const prov = String(h['x-vercel-ip-country-region'] || '').toUpperCase();
    let city = String(h['x-vercel-ip-city'] || '');
    try { city = decodeURIComponent(city); } catch (e) { /* keep raw */ }
    if (country !== 'CA' || !PROVS.includes(prov) || !city) return send({ slug: null });
    const list = (await townsByProv())[prov] || [];
    const key = norm(city);
    const hit = list.find((t) => t.key === key)
      || list.find((t) => t.key.replace(/^(the|village of|town of|city of) /, '') === key);
    return send(hit ? { slug: hit.slug, name: hit.name, how: 'city' } : { slug: null, prov });
  } catch (e) {
    return send({ slug: null });
  }
};
