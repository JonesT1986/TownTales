// Renders every new page against fake database data (no network). Usage: node test/run-pages.js [outdir]
const fs = require('fs'), path = require('path');
const OUT = process.argv[2] || '/tmp/tt-out';
fs.mkdirSync(OUT, { recursive: true });
const { mockFetch } = require('./fixtures');
global.fetch = mockFetch;

function call(handler, reqUrl) {
  return new Promise((resolve) => {
    const headers = {}; let body = '';
    const res = { statusCode: 200, setHeader(k, v) { headers[k.toLowerCase()] = v; }, getHeader(k) { return headers[k.toLowerCase()]; }, removeHeader(k) { delete headers[k.toLowerCase()]; },
      end(c) { if (c != null) body += c; resolve({ status: res.statusCode, headers, body }); } };
    Promise.resolve(handler({ url: reqUrl, headers: {} }, res)).catch((e) => resolve({ status: 'THREW', body: e.stack }));
  });
}
(async () => {
  const sports = require('../api/sports'), rem = require('../api/remembrance'), prov = require('../api/province'), seo = require('../api/seo'), sitemap = require('../api/sitemap');
  const cases = [
    ['rem-index', rem, '/api/remembrance?slug=wapella-sk'],
    ['rem-search', rem, '/api/remembrance?slug=wapella-sk&q=smith&c=wap-cem-2'],
    ['rem-person', rem, '/api/remembrance?slug=wapella-sk&id=wap-0001'],
    ['rem-person-community', rem, '/api/remembrance?slug=wapella-sk&id=wap-0011'],
    ['rem-missing', rem, '/api/remembrance?slug=wapella-sk&id=nope'],
    ['rem-empty-town', rem, '/api/remembrance?slug=moose-jaw-sk'],
    ['rem-bad-town', rem, '/api/remembrance?slug=atlantis-sk'],
    ['sports-wapella', sports, '/api/sports?slug=wapella-sk'],
    ['sports-empty', sports, '/api/sports?slug=moose-jaw-sk'],
    ['sports-bad', sports, '/api/sports?slug=atlantis-sk'],
    ['prov-index', prov, '/api/province'],
    ['prov-sk', prov, '/api/province?name=saskatchewan'],
    ['prov-ns', prov, '/api/province?name=nova-scotia'],
    ['prov-code', prov, '/api/province?name=sk'],
    ['prov-bad', prov, '/api/province?name=atlantis'],
    ['seo-home', seo, '/api/seo?slug=_home'],
    ['seo-town', seo, '/api/seo?slug=wapella-sk'],
    ['seo-archive', seo, '/api/seo?slug=wapella-sk&sub=archive'],
    ['sitemap', sitemap, '/api/sitemap'],
  ];
  for (const [name, h, u] of cases) {
    const r = await call(h, u);
    fs.writeFileSync(path.join(OUT, name + (name === 'sitemap' ? '.xml' : '.html')), r.body);
    const t = (r.body.match(/<title>([^<]*)/) || [])[1] || '';
    console.log(String(r.status).padEnd(6), name.padEnd(22), (r.headers.location || t).slice(0, 110), r.body.length);
  }
})();
