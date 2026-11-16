// Loads the TownTales single-page app (app.html) and applies the small, exact-match patches in patches.json
// (town contact card, large-file uploads, media rendering). A patch that no longer matches is skipped and logged,
// so a change to app.html can never take the site down.
const fs = require('fs');
const path = require('path');
let patches = require('../patches.json');
// Optional add-on patches (provincial flags on the elevators, train icon). Missing file is fine.
try { patches = patches.concat(require('../flag-patches.json')); } catch (e) { /* optional */ }
// Nov 2026 add-ons: homepage "help us grow" copy + stylesheet link, regional icons, province links. Missing files are fine.
try { patches = patches.concat(require('../grow-patches.json')); } catch (e) { /* optional */ }
try { patches = patches.concat(require('../icon-patches.json')); } catch (e) { /* optional */ }

const GA_ID = 'G-C4E2QYM9XW';
const GA_TAG = `<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', '${GA_ID}');
</script>`;

let cached = null;
function getApp() {
  if (cached) return cached;
  let html = null;
  for (const p of [path.join(process.cwd(), 'app.html'), path.join(__dirname, '..', 'app.html')]) {
    try { html = fs.readFileSync(p, 'utf8'); break; } catch (e) { /* try next */ }
  }
  if (html === null) return null;
  for (const p of patches) {
    const n = html.split(p.find).length - 1;
    if (n !== (p.count || 1)) { console.error('patch skipped (found ' + n + '):', p.find.slice(0, 60)); continue; }
    html = html.split(p.find).join(p.replace);
  }
  // Google Analytics (GA4 stream "TownTales"), placed right after <head> on every page.
  if (html.indexOf(GA_ID) === -1) {
    html = html.replace(/<head(\s[^>]*)?>/i, (m) => m + '\n' + GA_TAG);
  }
  cached = html;
  return cached;
}
module.exports = { getApp };
