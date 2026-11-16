// Serves family.js (Family Trees + sign-in) with the small exact-match changes in fam-swaps.json:
// "Log in" in the main menu, confirm-password boxes, resend-confirmation button, friendly email-link errors.
// A change that no longer matches is skipped, so an edit to family.js can never take the site down.
const fs = require('fs');
const path = require('path');
const SWAPS = require('../fam-swaps.json');

let cached = null;
function build() {
  if (cached) return cached;
  let js = null;
  for (const p of [path.join(process.cwd(), 'family.js'), path.join(__dirname, '..', 'family.js')]) {
    try { js = fs.readFileSync(p, 'utf8'); break; } catch (e) { /* try next */ }
  }
  if (js === null) return null;
  const applied = [];
  for (const s of SWAPS) {
    const n = js.split(s.find).length - 1;
    if (n !== 1) { console.error('fam swap skipped (found ' + n + '):', s.name); applied.push(s.name + ':0'); continue; }
    js = js.split(s.find).join(s.replace);
    applied.push(s.name + ':1');
  }
  cached = { js, applied: applied.join(',') };
  return cached;
}

module.exports = (req, res) => {
  const out = build();
  if (!out) { res.statusCode = 404; res.end('// family.js missing'); return; }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
  res.setHeader('X-Fam-Swaps', out.applied);
  res.end(out.js);
};
