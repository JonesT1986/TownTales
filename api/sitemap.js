const { getTowns } = require('./_towns');
module.exports = async (req, res) => {
  let towns = {};
  try { towns = await getTowns(); } catch (e) { /* serve at least the home page */ }
  const urls = ['https://www.towntales.ca/'];
  for (const slug of Object.keys(towns)) urls.push(`https://www.towntales.ca/${slug}`, `https://www.towntales.ca/${slug}/archive`);
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.end('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) => `  <url><loc>${u}</loc><changefreq>weekly</changefreq></url>`).join('\n') + '\n</urlset>\n');
};
