// Milestone birthdays (Nov 23 2026). Pure helpers, no data fetching, no new tables.
// A town is "celebrating" for the whole calendar year when (year − est) is 50, 75, 100, 125 … (every 25 from 50).
// Only a plain 4-digit `est` counts; towns with no est never trigger. The same rule runs in the browser
// (towntales-milestones.js), so server pages and the app always agree.

// The site's home is Saskatchewan: the year turns over at midnight Regina time.
function yearNow() {
  return Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Regina', year: 'numeric' }).format(new Date()));
}

function milestone(est, year) {
  const s = String(est == null ? '' : est).trim();
  if (!/^\d{4}$/.test(s)) return 0;
  const n = (year || yearNow()) - Number(s);
  return n >= 50 && n % 25 === 0 ? n : 0;
}

// All towns from a list that hit a milestone this year: biggest milestone first, then A–Z.
function celebrating(towns, year) {
  year = year || yearNow();
  return (towns || [])
    .map((t) => ({ ...t, ms: milestone(t.est, year) }))
    .filter((t) => t.ms)
    .sort((a, b) => b.ms - a.ms || String(a.name).localeCompare(String(b.name), 'en-CA'));
}

const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function badge(n, year, long) {
  return n ? `<span class="tt-ms-badge">${long ? 'Turns ' : ''}${n} in ${year}</span>` : '';
}

function banner(town, year) {
  const n = milestone(town.est, year);
  if (!n) return '';
  return `<div class="tt-ms-banner" role="note"><span aria-hidden="true">🎉</span> <b>${n} years</b> — ${esc(town.name)} was founded in ${esc(String(town.est).trim())} and turns ${n} in ${year}.</div>`;
}

// "Celebrating milestones in 2026" list. linkFor(t) gives each town's URL.
function section(list, year, { title, linkFor, provName } = {}) {
  if (!list || !list.length) return '';
  const href = linkFor || ((t) => '/' + t.slug);
  return `<section class="wrap stack tt-ms-section"><h2>${esc(title || `Celebrating milestones in ${year}`)}</h2>
<ul class="tt-ms-list">${list.map((t) => `<li><a href="${esc(href(t))}"><b>${esc(t.name)}</b>${provName ? `<span class="muted small">${esc(provName(t.prov))}</span>` : ''}</a> ${badge(t.ms, year, true)}</li>`).join('')}</ul></section>`;
}

// Gold styles. The town page gets body.tt-ms (set by towntales-milestones.js), which swaps the
// site's accent (--red) for gold on that page only. Layout and type are unchanged.
const CSS = `.tt-ms-badge{display:inline-block;font:700 .78rem/1 var(--hand,inherit);padding:4px 7px;border-radius:2px;background:#F6E7B8;color:#6E4C08;border:1px solid #D9B65A;white-space:nowrap;vertical-align:middle}
.tt-ms-banner{background:#F6E7B8;border:2px solid #C9A23E;border-radius:3px;padding:10px 14px;color:#3D2C05;font-size:1.05rem}
.tt-ms-list{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:8px 18px}
.tt-ms-list li{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--rule,#D3C8B0)}
.tt-ms-list a{display:flex;flex-direction:column;text-decoration:none}
body.tt-ms{--red:#9A6B0E;--red-2:#6E4C08}`;

module.exports = { yearNow, milestone, celebrating, badge, banner, section, CSS };
