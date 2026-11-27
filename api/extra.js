// One handler for the add-on pages (keeps the site under Vercel's 12-function limit on the Hobby plan).
//   ?kind=book         → /<town>/book               (_book.js)
//   ?kind=family       → /<town>/family/<surname>   (_family-report.js)
//   ?kind=partners     → /partners/funeral-homes    (_partners.js)
//   ?kind=anniversary  → /anniversary               (_anniversary.js)
//   ?kind=rm           → /rm and /rm/<slug>         (_rm.js)
const PAGES = {
  book: () => require('./_book'),
  family: () => require('./_family-report'),
  partners: () => require('./_partners'),
  anniversary: () => require('./_anniversary'),
  rm: () => require('./_rm'),
};
module.exports = (req, res) => {
  const kind = new URL(req.url, 'http://localhost').searchParams.get('kind');
  const load = PAGES[kind];
  if (!load) { res.statusCode = 404; res.setHeader('Content-Type', 'text/plain'); return res.end('Not found'); }
  return load()(req, res);
};
