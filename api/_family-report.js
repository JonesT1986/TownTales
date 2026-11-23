// "Your family in [Town]" report — /<town>/family/<surname>
// Built only from records already on the site. Lists people as recorded; never guesses who is related to whom.
const { SITE, PROV, PROV_SLUG, esc, q, page, send, notFound } = require('./_shell');

const EMAIL = 'towntalesinfo@gmail.com';
const yearOf = (s) => { const m = String(s || '').match(/\b(1[6-9]\d\d|20\d\d)\b/); return m ? +m[1] : null; };

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const slug = String(url.searchParams.get('slug') || '').toLowerCase();
  const raw = String(url.searchParams.get('name') || '').replace(/[^A-Za-z' -]/g, '').trim().slice(0, 40);
  try {
    const towns = await q(`towns?slug=eq.${encodeURIComponent(slug)}&hidden=eq.false&select=slug,name,prov`);
    const town = towns[0];
    if (!town || raw.length < 2) return notFound(res, 'Try a family name, for example /wapella-sk/family/mcfadyen.');
    const s = encodeURIComponent(slug), like = encodeURIComponent(`*${raw}*`);
    const [mems, cems] = await Promise.all([
      q(`memorials?town=eq.${s}&status=eq.published&or=(name.ilike.${like},maiden_name.ilike.${like})&select=id,name,maiden_name,birth_date_label,death_date_label,cemetery_id,cemetery_name,note,tier,source,source_url`, { all: true }),
      q(`cemeteries?town=eq.${s}&select=id,name,location_desc`),
    ]);
    const prov = PROV[town.prov] || town.prov;
    // Use the spelling the records use (e.g. "McFadyen", not "Mcfadyen").
    const words = mems.flatMap((m) => [m.name, m.maiden_name].filter(Boolean).join(' ').split(/\s+/));
    const fam = words.find((w) => w.replace(/[^A-Za-z'-]/g, '').toLowerCase() === raw.toLowerCase()) || (raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase());
    const cname = (m) => (cems.find((c) => c.id === m.cemetery_id) || {}).name || m.cemetery_name || 'Cemetery not recorded';
    // Birth year if recorded; otherwise death year minus the recorded age ("Nov 3, 1922 (age 35)"); otherwise last.
    const sortKey = (m) => {
      const b = yearOf(m.birth_date_label); if (b) return b;
      const d = yearOf(m.death_date_label), age = String(m.death_date_label || '').match(/age\s*(\d{1,3})/i);
      return d && age ? d - +age[1] : 3000;
    };
    mems.sort((a, b) => sortKey(a) - sortKey(b));
    const years = mems.flatMap((m) => [yearOf(m.birth_date_label), yearOf(m.death_date_label)]).filter(Boolean);
    const span = years.length ? `${Math.min(...years)}–${Math.max(...years)}` : '';
    const byCem = {};
    for (const m of mems) byCem[cname(m)] = (byCem[cname(m)] || 0) + 1;
    const sources = [...new Set(mems.map((m) => m.source).filter(Boolean))];
    const born = mems.filter((m) => m.maiden_name && m.maiden_name.toLowerCase().includes(raw.toLowerCase()) && !m.name.toLowerCase().includes(raw.toLowerCase()));
    const mail = `mailto:${EMAIL}?subject=${encodeURIComponent(`Family report: ${fam} family, ${town.name}`)}`;

    const row = (m) => {
      const d = [m.birth_date_label, m.death_date_label].filter(Boolean);
      return `<li><a href="/${esc(town.slug)}/remembrance/${encodeURIComponent(m.id)}"><b class="rm-name">${esc(m.name)}${m.maiden_name ? ` <span class="rm-nee">(née ${esc(m.maiden_name)})</span>` : ''}</b></a>` +
        `<span class="rm-meta">${d.length === 2 ? esc(d[0]) + ' – ' + esc(d[1]) : d.length ? (m.birth_date_label ? 'Born ' : 'Died ') + esc(d[0]) : '<span class="muted">Dates not recorded</span>'} · ${esc(cname(m))}</span></li>`;
    };

    const main = `<div class="fr-draft">Sample report</div>
<section class="wrap stack" style="padding-top:22px">
<p class="crumbs"><a href="/">TownTales</a> › <a href="/province/${esc(PROV_SLUG[town.prov] || '')}">${esc(prov)}</a> › <a href="/${esc(town.slug)}">${esc(town.name)}</a> › Family report</p>
<div class="fr-cover">
<p class="bk-kicker" style="color:var(--red)">A TownTales family report</p>
<h1 class="rm-title">The ${esc(fam)} family in ${esc(town.name)}</h1>
<p class="lede">Everything TownTales holds about the ${esc(fam)} name in and around ${esc(town.name)}, ${esc(prov)}, gathered in one place, with the source for every line.</p>
</div>
${mems.length ? `<div class="fr-stats">
<div><b>${mems.length}</b><span>people found</span></div>
${span ? `<div><b>${esc(span)}</b><span>years on record</span></div>` : ''}
<div><b>${Object.keys(byCem).length}</b><span>${Object.keys(byCem).length === 1 ? 'cemetery' : 'cemeteries'}</span></div>
</div>` : `<div class="empty">We don't have anyone named ${esc(fam)} in ${esc(town.name)} yet.</div>`}
</section>

${mems.length ? `<section class="wrap stack"><h2>Where they rest</h2>
<ul class="fr-cems">${Object.entries(byCem).sort((a, b) => b[1] - a[1]).map(([c, n]) => `<li><b>${esc(c)}</b> <span class="muted">· ${n} ${n === 1 ? 'person' : 'people'}</span></li>`).join('')}</ul></section>

<section class="wrap stack"><h2>The people</h2>
<p class="small muted">In order of birth year where it's recorded. Dates are shown exactly as the records give them. This report lists people by name only; it does not guess how they were related.</p>
<ul class="rm-names">${mems.map(row).join('')}</ul>
${born.length ? `<p class="small">Includes ${born.length === 1 ? 'one woman' : born.length + ' women'} born a ${esc(fam)} and recorded under a married name.</p>` : ''}
</section>` : ''}

<section class="wrap stack"><h2>In the full report</h2>
<ul class="fr-more">
<li class="fr-ok"><b>Everyone above</b>, each with their own remembrance page and source</li>
<li class="fr-soon"><b>The family homestead</b>: the original land grant, with the quarter section marked on the township map <span class="pill">coming</span></li>
<li class="fr-soon"><b>The ${esc(fam)} name in ${esc(town.name)}'s history</b>: timeline events, teams and archive pieces that mention the family <span class="pill">as the archive grows</span></li>
<li class="fr-ok"><b>A printable PDF</b> to share with the rest of the family</li>
</ul>
<div class="btns"><a class="btn" href="${esc(mail)}">Request the full ${esc(fam)} report</a><a class="btn alt" href="/${esc(town.slug)}/remembrance/add">Add a ${esc(fam)} who's missing</a></div>
<p class="small muted">Request by email at ${EMAIL}. No payment is taken on this page.</p>
</section>

${sources.length ? `<section class="wrap stack"><h2>Sources</h2><ol class="fr-src">${sources.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></section>` : ''}`;

    send(res, 200, page({
      title: `The ${fam} family in ${town.name}, ${prov} — TownTales family report`,
      desc: `${mems.length} ${fam} family records from ${town.name}, ${prov}: names, dates and resting places, with sources.`,
      canonical: `${SITE}/${town.slug}/family/${raw.toLowerCase()}`, main, noindex: true,
    }), 'public, s-maxage=600');
  } catch (e) {
    console.error('family report failed', slug, raw, e && e.message);
    res.statusCode = 503; res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('Please try again in a minute.');
  }
};
