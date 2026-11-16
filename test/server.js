// Local preview server that mimics vercel.json rewrites, with the fake database. Usage: node test/server.js [port]
const http = require('http'), fs = require('fs'), path = require('path');
const { mockFetch } = require('./fixtures');
global.fetch = mockFetch;
const ROOT = path.join(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const rules = cfg.rewrites.map((r) => {
  const names = [];
  const re = new RegExp('^' + r.source.replace(/:([a-z]+)(\(([^)]*(?:\([^)]*\)[^)]*)*)\))?/gi, (m, n, g, inner) => { names.push(n); return '(' + (inner || '[^/]+') + ')'; }) + '/?$');
  return { re, names, dest: r.destination };
});
const handlers = {};
const handler = (n) => handlers[n] || (handlers[n] = require(path.join(ROOT, 'api', n + '.js')));
http.createServer(async (req, res) => {
  let u = new URL(req.url, 'http://x');
  if (u.pathname === '/__db') { // client-side database calls are redirected here by the browser test
    const r = await mockFetch(u.searchParams.get('u'), { headers: { Range: req.headers['range'] } });
    res.writeHead(r.status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); return res.end(await r.text());
  }
  for (const r of rules) {
    const m = u.pathname.match(r.re);
    if (m) { let d = r.dest; r.names.forEach((n, i) => { d = d.replace(':' + n, m[i + 1]); }); const q = u.search ? '&' + u.search.slice(1) : ''; u = new URL(d + (d.includes('?') ? q : (q ? '?' + q.slice(1) : '')), 'http://x'); break; }
  }
  if (u.pathname.startsWith('/api/')) { req.url = u.pathname + u.search; return handler(u.pathname.slice(5).replace(/\.js$/, ''))(req, res); }
  const f = path.join(ROOT, u.pathname);
  if (f.startsWith(ROOT) && fs.existsSync(f) && fs.statSync(f).isFile()) {
    const type = { '.js': 'application/javascript', '.css': 'text/css', '.txt': 'text/plain', '.html': 'text/html' }[path.extname(f)] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': type }); return res.end(fs.readFileSync(f));
  }
  res.writeHead(404); res.end('not found');
}).listen(Number(process.argv[2] || 3000), () => console.log('preview on', process.argv[2] || 3000));
