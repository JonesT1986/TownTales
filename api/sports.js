// Sports History page for one town, fully server-rendered: /<town>/sports
// Teams grouped by sport, each with league, years (shown exactly as recorded), home venue,
// championships, note, Verified / Community Memory label and source.
// A town with no teams yet gets a short invitation page (not indexed by Google until it has teams).
const { SITE, PROV, PROV_SLUG, esc, q, page, send, notFound } = require('./_shell');

const TIER = {
  documented: ['Verified', 'rm-ver', 'From a documentary source, such as a newspaper, league record or published history.'],
  community: ['Community Memory', 'rm-mem', 'From local memory. Not yet matched to a documentary record.'],
};
const pill = (t) => { const x = TIER[t] || TIER.documented; return `<span class="rm-pill ${x[1]}">${x[0]}</span>`; };
const champText = (c) => (c == null ? '' : typeof c === 'object'
  ? [c.year || c.years || c.date, c.title || c.name || c.text].filter(Boolean).join(' — ')
  : String(c));

function athleteCard(a) {
  const ach = (Array.isArray(a.achievements) ? a.achievements : []).map(champText).filter(Boolean);
  const kv = [];
  if (a.level) kv.push(`<dt>Level</dt><dd>${esc(a.level)}</dd>`);
  if (a.teams_label) kv.push(`<dt>Teams</dt><dd>${esc(a.teams_label)}</dd>`);
  if (a.years_label) kv.push(`<dt>Years</dt><dd>${esc(a.years_label)}</dd>`);
  const u = /^https?:\/\//i.test(String(a.source_url || '')) ? a.source_url : '';
  return `<article class="rm-cem tm-team" id="athlete-${esc(a.id)}"><h4>${esc(a.name)}</h4>` +
    `<p class="small muted">${esc([a.sport, a.connection].filter(Boolean).join(' · '))}</p>` +
    (kv.length ? `<dl class="kv">${kv.join('')}</dl>` : '') +
    (ach.length ? `<div><b>Highlights</b><ul class="tm-ch">${ach.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>` : '') +
    (a.note ? `<p>${esc(a.note)}</p>` : '') +
    `<p>${pill(a.tier)}</p>` +
    `<p class="rm-src"><b>Source:</b> ${esc(a.source)}${u ? ` · <a href="${esc(u)}" rel="nofollow noopener" target="_blank">View source</a>` : ''}</p></article>`;
}

function teamCard(t) {
  const ch = (Array.isArray(t.championships) ? t.championships : []).map(champText).filter(Boolean);
  const kv = [];
  if (t.league) kv.push(`<dt>League</dt><dd>${esc(t.league)}</dd>`);
  if (t.years_label) kv.push(`<dt>Years</dt><dd>${esc(t.years_label)}</dd>`);
  if (t.home_venue) kv.push(`<dt>Home</dt><dd>${esc(t.home_venue)}</dd>`);
  const u = /^https?:\/\//i.test(String(t.source_url || '')) ? t.source_url : '';
  return `<article class="rm-cem tm-team" id="team-${esc(t.id)}"><h4>${esc(t.name)}</h4>` +
    (kv.length ? `<dl class="kv">${kv.join('')}</dl>` : '') +
    (ch.length ? `<div><b>Championships</b><ul class="tm-ch">${ch.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>` : '') +
    (t.note ? `<p>${esc(t.note)}</p>` : '') +
    `<p>${pill(t.tier)}</p>` +
    `<p class="rm-src"><b>Source:</b> ${esc(t.source)}${u ? ` · <a href="${esc(u)}" rel="nofollow noopener" target="_blank">View source</a>` : ''}</p></article>`;
}

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const slug = String(url.searchParams.get('slug') || '').toLowerCase();
  try {
    const towns = await q(`towns?slug=eq.${encodeURIComponent(slug)}&hidden=eq.false&select=slug,name,prov`);
    const town = towns[0];
    if (!town) return notFound(res, "We don't have a town at that address.");
    const [teams, athletes] = await Promise.all([
      q(`teams?town=eq.${encodeURIComponent(slug)}&select=id,name,sport,league,years_label,home_venue,championships,note,tier,source,source_url&order=sport,name`, { all: true }),
      q(`athletes?town=eq.${encodeURIComponent(slug)}&select=id,name,sport,level,connection,teams_label,years_label,achievements,note,tier,source,source_url&order=name`, { all: true }).catch(() => []),
    ]);
    const any = teams.length + athletes.length;
    const prov = PROV[town.prov] || town.prov;
    const bySport = {};
    for (const t of teams) (bySport[t.sport] = bySport[t.sport] || []).push(t);
    const sports = Object.keys(bySport);

    const athletesHtml = athletes.length
      ? `<section class="wrap stack tm-sport" id="athletes"><h2 class="tm-sport-h">Hometown athletes</h2><p class="muted">People from ${esc(town.name)} who went on to play at the top levels of their sport.</p><div class="tm-list">${athletes.map(athleteCard).join('')}</div></section>`
      : '';
    const body = any
      ? `<p class="lede">${[teams.length ? (teams.length === 1 ? 'one team' : teams.length + ' teams') : '', athletes.length ? (athletes.length === 1 ? 'one hometown athlete' : athletes.length + ' hometown athletes') : ''].filter(Boolean).join(' and ').replace(/^./, (c) => c.toUpperCase())} so far. Every entry carries its source.</p>
<div class="rm-legend"><p>${pill('documented')} ${esc(TIER.documented[2])}</p><p>${pill('community')} ${esc(TIER.community[2])}</p></div>
${sports.length + (athletes.length ? 1 : 0) > 1 ? `<nav class="rm-az" aria-label="Jump to a section">${athletes.length ? '<a href="#athletes" style="padding:0 12px">Hometown athletes</a>' : ''}${sports.map((s, i) => `<a href="#sport-${i}" style="padding:0 12px">${esc(s)}</a>`).join('')}</nav>` : ''}
</section>
${athletesHtml}
${sports.map((s, i) => `<section class="wrap stack tm-sport" id="sport-${i}"><h2 class="tm-sport-h">${esc(s)}</h2><div class="tm-list">${bySport[s].map(teamCard).join('')}</div></section>`).join('\n')}
<section class="wrap stack">
<p>Something wrong, or a team or athlete missing? <a href="/#corrections">Tell us</a> and we'll look into it.</p>`
      : `<p class="lede">No teams or athletes have been added for ${esc(town.name)} yet.</p>
<div class="pv-soon"><p><b>Remember a ${esc(town.name)} team, or someone from here who made it big?</b> A hockey, baseball or curling team, a ladies' softball club, or a local player who went on to the NHL, junior or the pros. Tell us the name, the years and where you heard about it, and we'll add it with its source.</p><div class="btns" style="margin-top:12px"><a class="btn" href="/#corrections">Tell us about a team</a></div></div>`;

    const main = `<section class="wrap stack rm" style="padding-top:22px">
<p class="crumbs"><a href="/">TownTales</a> › <a href="/province/${esc(PROV_SLUG[town.prov] || '')}">${esc(prov)}</a> › <a href="/${esc(town.slug)}">${esc(town.name)}</a> › Sports History</p>
<p class="eyebrow">Sports History</p>
<h1>${esc(town.name)} sports and teams</h1>
${body}
<div class="btns"><a class="btn alt" href="/${esc(town.slug)}">Back to ${esc(town.name)}'s history</a><a class="btn alt" href="/${esc(town.slug)}/remembrance">Cemetery &amp; Remembrance</a></div>
</section>`;

    const canonical = `${SITE}/${town.slug}/sports`;
    send(res, 200, page({
      title: `${town.name}, ${prov} Sports History — ${any ? [sports.join(', '), athletes.length ? 'Hometown Athletes' : ''].filter(Boolean).join(', ') : 'Teams and Athletes'} | TownTales`,
      desc: teams.length
        ? `Sports history of ${town.name}, ${prov}: ${[athletes.length ? 'hometown athletes' : '', sports.length ? sports.join(', ') + ' teams' : ''].filter(Boolean).join(' and ')}, with leagues, years, championships and the source for every entry.`
        : `Sports history of ${town.name}, ${prov}. Remember a local team? Help us add it.`,
      canonical, main, noindex: !any,
      ld: any ? [{
        '@context': 'https://schema.org', '@type': 'CollectionPage', url: canonical, name: `${town.name}, ${prov} sports history`,
        hasPart: athletes.map((a) => ({ '@type': 'Person', name: a.name })).concat(teams.map((t) => ({ '@type': 'SportsTeam', name: t.name, sport: t.sport, ...(t.league ? { memberOf: { '@type': 'SportsOrganization', name: t.league } } : {}) }))),
        breadcrumb: { '@type': 'BreadcrumbList', itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'TownTales', item: SITE + '/' },
          { '@type': 'ListItem', position: 2, name: town.name, item: `${SITE}/${town.slug}` },
          { '@type': 'ListItem', position: 3, name: 'Sports History', item: canonical },
        ] },
      }] : [],
    }), 'public, s-maxage=900, stale-while-revalidate=86400');
  } catch (e) {
    console.error('sports failed', slug, e && e.message);
    res.statusCode = 503;
    res.setHeader('Retry-After', '60');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<!doctype html><meta charset="utf-8"><title>Back shortly | TownTales</title><p style="font:20px/1.5 sans-serif;padding:24px">This page is having trouble loading. Please try again in a minute. <a href="/">TownTales home</a></p>');
  }
};
