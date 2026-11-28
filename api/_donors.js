// /donors — "Friends of TownTales": every approved donor, grouped by town. Names only, never amounts.
const { SITE, PROV, esc, q, page, send } = require('./_shell');

const donorLine = (d) => '<li><b>' + esc(d.display_name || 'A friend') + '</b>' +
  (d.monthly && d.monthly_active ? ' <span class="small muted">· monthly supporter</span>' : '') +
  (d.dedication ? '<br><span class="muted">' + esc(d.dedication) + '</span>' : '') + '</li>';

module.exports = async (req, res) => {
  try {
    const donors = await q('donors?select=town,display_name,dedication,monthly,monthly_active,created_at&status=eq.published&order=created_at.desc,id', { all: true });
    const slugs = [...new Set(donors.map((d) => d.town).filter(Boolean))];
    const towns = {};
    for (let i = 0; i < slugs.length; i += 100) {
      const list = slugs.slice(i, i + 100).map((s) => '"' + encodeURIComponent(s) + '"').join(',');
      for (const t of await q('towns?select=slug,name,prov&hidden=eq.false&slug=in.(' + list + ')')) towns[t.slug] = t;
    }
    const list = (rows) => '<ul style="list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px 24px">' + rows.map(donorLine).join('') + '</ul>';
    // A donor whose town is hidden or gone is still thanked, under general supporters.
    const general = donors.filter((d) => !towns[d.town]);
    const groups = slugs.filter((s) => towns[s]).sort((a, b) => towns[a].name.localeCompare(towns[b].name, 'en-CA')).map((s) =>
      '<div class="stack"><h2><a href="/' + esc(s) + '">' + esc(towns[s].name) + ', ' + esc(PROV[towns[s].prov] || towns[s].prov) + '</a></h2>' +
      list(donors.filter((d) => d.town === s)) + '</div>').join('');
    const main = `<section class="wrap stack" style="padding-top:28px">
<p class="eyebrow">Donors</p>
<h1>Friends of TownTales</h1>
<p class="lede">These people helped keep small-town history online. Thank you.</p>
${groups}
${general.length ? '<div class="stack"><h2>General supporters</h2>' + list(general) + '</div>' : ''}
${donors.length ? '' : '<div class="notice info"><p>Our first Friends will be listed here.</p></div>'}
<p><a class="btn" href="/#donate">Support TownTales</a></p>
<p class="small muted">Names appear only when a donor asks to be listed. Gifts support TownTales, not a town office. TownTales is not a registered charity, so donations are not tax-deductible. Want your name changed or removed? Email <a href="mailto:towntalesinfo@gmail.com">towntalesinfo@gmail.com</a>.</p>
</section>`;
    send(res, 200, page({ title: 'Friends of TownTales — Our Donors | TownTales', desc: 'The people who help keep small-town history online.', canonical: SITE + '/donors', main, navKey: '' }), 'public, s-maxage=300, stale-while-revalidate=3600');
  } catch (e) {
    console.error('donors failed', e && e.message);
    res.statusCode = 503;
    res.setHeader('Retry-After', '60');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<!doctype html><meta charset="utf-8"><title>Back shortly | TownTales</title><p style="font:20px/1.5 sans-serif;padding:24px">This page is having trouble loading. Please try again in a minute. <a href="/">TownTales home</a></p>');
  }
};
