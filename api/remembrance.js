// Cemetery & Remembrance pages, fully server-rendered.
//   /<town>/remembrance             → the town's cemeteries and everyone remembered there (searchable)
//   /<town>/remembrance/<memorial>  → one person's permanent page (printed QR plaques point here: never change this URL)
const { SITE, PROV, PROV_SLUG, esc, q, page, send, notFound } = require('./_shell');

const TIER = {
  documented: { label: 'Verified', cls: 'rm-ver', note: 'Taken from a documentary source, such as a cemetery record, register or published history.' },
  community: { label: 'Community Memory', cls: 'rm-mem', note: 'Shared by family or community members from their own knowledge. Not yet matched to a documentary record.' },
};
const tierOf = (t) => TIER[t] || TIER.documented;
const pill = (t) => `<span class="rm-pill ${tierOf(t).cls}">${esc(tierOf(t).label)}</span>`;
const SUFFIX = /^(jr|sr|ii|iii|iv)\.?$/i;

// Sort key: surname first, the way cemetery indexes are read. "Smith, John" and "John Smith" both file under S.
function surnameKey(name) {
  const n = String(name || '').trim();
  if (n.includes(',')) return n.toLowerCase();
  const w = n.split(/\s+/).filter(Boolean);
  while (w.length > 1 && SUFFIX.test(w[w.length - 1])) w.pop();
  const last = w.pop() || '';
  return (last + ', ' + w.join(' ')).toLowerCase();
}
const initial = (name) => {
  const c = surnameKey(name).normalize('NFKD').replace(/[^a-z]/g, '').charAt(0).toUpperCase();
  return c || '#';
};
const fullName = (m) => esc(m.name) + (m.maiden_name ? ` <span class="rm-nee">(née ${esc(m.maiden_name)})</span>` : '');
const plainName = (m) => m.name + (m.maiden_name ? ` (née ${m.maiden_name})` : '');
const dates = (m) => {
  const b = m.birth_date_label, d = m.death_date_label;
  if (b && d) return `${b} – ${d}`;
  if (b) return `Born ${b}`;
  if (d) return `Died ${d}`;
  return '';
};
const srcHtml = (source, url) => {
  if (!source && !url) return '';
  const u = /^https?:\/\//i.test(String(url || '')) ? url : '';
  return `<p class="rm-src"><b>Source:</b> ${esc(source || u)}${u ? ` · <a href="${esc(u)}" rel="nofollow noopener" target="_blank">View source</a>` : ''}</p>`;
};
const cemName = (m, cems) => (cems.find((c) => c.id === m.cemetery_id) || {}).name || m.cemetery_name || '';

async function loadTown(slug) {
  const rows = await q(`towns?slug=eq.${encodeURIComponent(slug)}&hidden=eq.false&select=slug,name,prov`);
  return rows[0] || null;
}

function crumbs(town, last) {
  const prov = PROV[town.prov] || town.prov;
  return `<p class="crumbs"><a href="/">TownTales</a> › <a href="/province/${esc(PROV_SLUG[town.prov] || '')}">${esc(prov)}</a> › <a href="/${esc(town.slug)}">${esc(town.name)}</a> › ${last}</p>`;
}

function cemeteryCard(c, count) {
  const aka = Array.isArray(c.aka) ? c.aka.filter(Boolean) : [];
  const bits = [];
  if (c.location_desc) bits.push(`<dt>Where</dt><dd>${esc(c.location_desc)}</dd>`);
  if (c.affiliation) bits.push(`<dt>Affiliation</dt><dd>${esc(c.affiliation)}</dd>`);
  if (c.status && c.status !== 'unknown') bits.push(`<dt>Status</dt><dd>${esc(c.status.charAt(0).toUpperCase() + c.status.slice(1))}</dd>`);
  if (c.managed_by) bits.push(`<dt>Cared for by</dt><dd>${esc(c.managed_by)}</dd>`);
  return `<div class="rm-cem" id="cem-${esc(c.id)}"><h3>${esc(c.name)}</h3>` +
    (aka.length ? `<p class="small muted">Also known as ${aka.map(esc).join(', ')}</p>` : '') +
    (bits.length ? `<dl class="kv">${bits.join('')}</dl>` : '') +
    `<p class="small">${count === 1 ? '1 person' : count + ' people'} remembered here${count ? ` · <a href="?c=${encodeURIComponent(c.id)}#names">Show only this cemetery</a>` : ''}</p>` +
    srcHtml(c.source, c.source_url) + '</div>';
}

function memForm(town, cems) {
  return `<section class="wrap stack rm-add" id="add">
<h2>Add someone from your family</h2>
<p>Know someone who rests in or near ${esc(town.name)} but isn't listed? Add them here. A volunteer checks every entry before it appears, and it's shown as <b>Community Memory</b> with you named as the source.</p>
<form class="formbox" data-tt-memform data-town="${esc(town.slug)}" novalidate>
<div class="grid2">
<div class="field"><label for="mf-name">Their full name</label><input type="text" id="mf-name" name="name" required autocomplete="off"></div>
<div class="field"><label for="mf-maiden">Maiden name <span class="hint">(if any)</span></label><input type="text" id="mf-maiden" name="maiden" autocomplete="off"></div>
</div>
<div class="grid2">
<div class="field"><label for="mf-bd">Born <span class="hint">(as you know it: "1910", "March 3, 1910", "about 1880")</span></label><input type="text" id="mf-bd" name="bd"></div>
<div class="field"><label for="mf-bp">Where they were born</label><input type="text" id="mf-bp" name="bp"></div>
</div>
<div class="grid2">
<div class="field"><label for="mf-dd">Died</label><input type="text" id="mf-dd" name="dd"></div>
<div class="field"><label for="mf-dp">Where they died</label><input type="text" id="mf-dp" name="dp"></div>
</div>
<div class="field"><label for="mf-cem">Cemetery</label><select id="mf-cem" name="cem"><option value="">Not sure</option>${cems.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></div>
<div class="field"><label for="mf-note">A few words about them <span class="hint">(optional, shown on their page)</span></label><textarea id="mf-note" name="note" maxlength="1500" placeholder="e.g. Farmed north of town for 40 years. Sang in the church choir."></textarea></div>
<div class="field"><label for="mf-src">How do you know this?</label><input type="text" id="mf-src" name="src" required placeholder="e.g. My grandmother; family Bible; the headstone; funeral card"><span class="hint">This is shown as the source.</span></div>
<div class="grid2">
<div class="field"><label for="mf-sname">Your name</label><input type="text" id="mf-sname" name="sname" required autocomplete="name"><span class="hint">Shown as the source.</span></div>
<div class="field"><label for="mf-rel">Your relationship to them</label><input type="text" id="mf-rel" name="rel" placeholder="e.g. Granddaughter"></div>
</div>
<div class="field"><label for="mf-email">Your email</label><input type="email" id="mf-email" name="email" required autocomplete="email"><span class="hint">Never shown. Only used if we have a question.</span></div>
<p class="err" id="mf-err" role="alert"></p>
<button class="btn" type="submit">Send for review</button>
</form>
<div id="mf-done" role="status"></div>
</section>`;
}

async function indexPage(req, res, town, url) {
  const s = encodeURIComponent(town.slug);
  const [cems, mems] = await Promise.all([
    q(`cemeteries?town=eq.${s}&select=*&order=name`),
    q(`memorials?town=eq.${s}&status=eq.published&select=id,name,maiden_name,birth_date_label,death_date_label,cemetery_id,cemetery_name,tier`, { all: true }),
  ]);
  const prov = PROV[town.prov] || town.prov;
  const fq = String(url.searchParams.get('q') || '').trim().slice(0, 80);
  const fc = String(url.searchParams.get('c') || '').trim().slice(0, 120);
  const norm = (v) => String(v || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, '');
  mems.sort((a, b) => surnameKey(a.name).localeCompare(surnameKey(b.name)) || String(a.birth_date_label || '').localeCompare(String(b.birth_date_label || '')));
  const shown = mems.filter((m) => (!fc || m.cemetery_id === fc) && (!fq || norm(m.name + ' ' + (m.maiden_name || '')).includes(norm(fq))));
  const count = {};
  for (const m of mems) count[m.cemetery_id] = (count[m.cemetery_id] || 0) + 1;

  const groups = {};
  for (const m of shown) (groups[initial(m.name)] = groups[initial(m.name)] || []).push(m);
  const letters = Object.keys(groups).sort();
  const row = (m) => {
    const cn = cemName(m, cems);
    const d = dates(m);
    return `<li data-n="${esc(norm(m.name + ' ' + (m.maiden_name || '')))}" data-c="${esc(m.cemetery_id || '')}"><a href="/${esc(town.slug)}/remembrance/${encodeURIComponent(m.id)}"><b class="rm-name">${fullName(m)}</b></a>` +
      `<span class="rm-meta">${d ? esc(d) : '<span class="muted">Dates not recorded</span>'}${cn ? ' · ' + esc(cn) : ''}</span>${pill(m.tier)}</li>`;
  };

  const intro = mems.length
    ? `<p class="lede">${mems.length === 1 ? 'One person is' : mems.length.toLocaleString('en-CA') + ' people are'} remembered here${cems.length ? `, across ${cems.length === 1 ? 'one cemetery' : cems.length + ' cemeteries'}` : ''}. Every name carries its source.</p>`
    : `<p class="lede">No names have been added for ${esc(town.name)} yet. If your family has someone resting here, you can be the first to add them.</p>`;

  const main = `<section class="wrap stack rm" style="padding-top:22px">
${crumbs(town, 'Cemetery &amp; Remembrance')}
<p class="eyebrow">Cemetery &amp; Remembrance</p>
<h1>Remembering the people of ${esc(town.name)}</h1>
${intro}
<div class="rm-legend"><p>${pill('documented')} ${esc(TIER.documented.note)}</p><p>${pill('community')} ${esc(TIER.community.note)}</p></div>
<div class="btns"><a class="btn" href="#add">Add someone from your family</a><a class="btn alt" href="/${esc(town.slug)}">Back to ${esc(town.name)}'s history</a></div>
</section>
${cems.length ? `<section class="wrap stack"><h2>${cems.length === 1 ? 'The cemetery' : 'The cemeteries'}</h2><div class="rm-cems">${cems.map((c) => cemeteryCard(c, count[c.id] || 0)).join('')}</div></section>` : ''}
${mems.length ? `<section class="wrap stack" id="names"><h2>Names</h2>
<form class="filters rm-filter" method="get" action="#names" role="search">
<div class="field"><label for="rm-q">Search by name</label><input type="search" id="rm-q" name="q" value="${esc(fq)}" placeholder="e.g. Anderson" autocomplete="off"></div>
${cems.length > 1 ? `<div class="field"><label for="rm-c">Cemetery</label><select id="rm-c" name="c"><option value="">All cemeteries</option>${cems.map((c) => `<option value="${esc(c.id)}"${c.id === fc ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>` : ''}
<div class="field rm-go"><button class="btn" type="submit">Search</button></div>
</form>
<p class="small muted" id="rm-count" role="status">${shown.length === mems.length ? `Showing all ${mems.length.toLocaleString('en-CA')} names, by surname.` : `Showing ${shown.length.toLocaleString('en-CA')} of ${mems.length.toLocaleString('en-CA')} names. <a href="?#names">Show everyone</a>`}</p>
${letters.length > 3 ? `<nav class="rm-az" aria-label="Jump to a letter">${letters.map((l) => `<a href="#l-${esc(l)}">${esc(l)}</a>`).join('')}</nav>` : ''}
<div id="rm-list">${letters.map((l) => `<div class="rm-group" id="l-${esc(l)}"><h3 class="rm-letter">${esc(l)}</h3><ul class="rm-names">${groups[l].map(row).join('')}</ul></div>`).join('') || '<div class="empty">No names match that search.</div>'}</div>
</section>` : ''}
${memForm(town, cems)}`;

  const canonical = `${SITE}/${town.slug}/remembrance`;
  const html = page({
    title: `${town.name}, ${prov} Cemetery & Remembrance — ${mems.length ? mems.length.toLocaleString('en-CA') + ' names' : 'Burials and family records'} | TownTales`,
    desc: `Search the cemeteries of ${town.name}, ${prov}: ${mems.length ? mems.length.toLocaleString('en-CA') + ' people remembered' : 'burial records and family memories'}, with birth and death dates as recorded and the source for every entry.`,
    canonical, main, noindex: !!(fq || fc),
    ld: [{
      '@context': 'https://schema.org', '@type': 'CollectionPage', url: canonical,
      name: `${town.name}, ${prov} Cemetery & Remembrance`,
      about: { '@type': 'Place', name: `${town.name}, ${prov}` },
      breadcrumb: { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'TownTales', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: town.name, item: `${SITE}/${town.slug}` },
        { '@type': 'ListItem', position: 3, name: 'Cemetery & Remembrance', item: canonical },
      ] },
    }],
  });
  send(res, 200, html, 'public, s-maxage=900, stale-while-revalidate=86400');
}

async function memorialPage(req, res, town, id) {
  const rows = await q(`memorials?id=eq.${encodeURIComponent(id)}&town=eq.${encodeURIComponent(town.slug)}&status=eq.published&select=*`);
  const m = rows[0];
  if (!m) return notFound(res, 'This remembrance record may be waiting for review, or the link may be mistyped.');
  const cems = m.cemetery_id ? await q(`cemeteries?id=eq.${encodeURIComponent(m.cemetery_id)}&select=*`) : [];
  const cem = cems[0] || null;
  const cn = cem ? cem.name : (m.cemetery_name || '');
  const prov = PROV[town.prov] || town.prov;
  const url = `${SITE}/${town.slug}/remembrance/${encodeURIComponent(m.id)}`;
  const t = tierOf(m.tier);
  const facts = [];
  if (m.birth_date_label || m.birth_place) facts.push(`<dt>Born</dt><dd>${esc([m.birth_date_label, m.birth_place].filter(Boolean).join(', '))}</dd>`);
  if (m.death_date_label || m.death_place) facts.push(`<dt>Died</dt><dd>${esc([m.death_date_label, m.death_place].filter(Boolean).join(', '))}</dd>`);
  if (cn) facts.push(`<dt>Resting place</dt><dd>${cem ? `<a href="/${esc(town.slug)}/remembrance?c=${encodeURIComponent(cem.id)}#names">${esc(cn)}</a>` : esc(cn)}${cem && cem.location_desc ? `<br><span class="small muted">${esc(cem.location_desc)}</span>` : ''}</dd>`);
  const d = dates(m);

  const main = `<section class="wrap stack rm rm-person" style="padding-top:22px">
${crumbs(town, `<a href="/${esc(town.slug)}/remembrance">Cemetery &amp; Remembrance</a>`)}
<p class="eyebrow">In memory of</p>
<h1 class="rm-title">${fullName(m)}</h1>
${d ? `<p class="rm-dates">${esc(d)}</p>` : ''}
<div class="rm-card">
${facts.length ? `<dl class="kv rm-facts">${facts.join('')}</dl>` : '<p class="muted">No dates or places have been recorded yet.</p>'}
${m.note ? `<p class="rm-note">${esc(m.note)}</p>` : ''}
<div class="stack" style="gap:6px"><p>${pill(m.tier)}</p><p class="small">${esc(t.note)}</p></div>
${srcHtml(m.source, m.source_url)}
</div>
<p class="small muted">Dates and places are shown exactly as the source records them.</p>
<div class="btns"><a class="btn" href="/${esc(town.slug)}/remembrance#add">Add a family member</a><a class="btn alt" href="/${esc(town.slug)}/remembrance">Everyone remembered in ${esc(town.name)}</a></div>
<p class="small">Something wrong or missing? <a href="/#corrections">Tell us</a> and mention this page's address:<br><code class="rm-url">${esc(url)}</code></p>
</section>`;

  const desc = `${plainName(m)}${d ? ' (' + d + ')' : ''}${cn ? ', resting at ' + cn : ''}, ${town.name}, ${prov}. ${t.label} record with source.`;
  const person = { '@type': 'Person', name: m.name };
  if (m.maiden_name) person.additionalName = m.maiden_name;
  if (m.birth_place) person.birthPlace = { '@type': 'Place', name: m.birth_place };
  if (m.death_place) person.deathPlace = { '@type': 'Place', name: m.death_place };
  const html = page({
    title: `${plainName(m)}${d ? ' (' + d + ')' : ''} — ${cn ? cn + ', ' : ''}${town.name}, ${prov} | TownTales`,
    desc, canonical: url, main,
    ld: [{
      '@context': 'https://schema.org', '@type': 'WebPage', url, name: `In memory of ${plainName(m)}`, about: person,
      breadcrumb: { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'TownTales', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: town.name, item: `${SITE}/${town.slug}` },
        { '@type': 'ListItem', position: 3, name: 'Cemetery & Remembrance', item: `${SITE}/${town.slug}/remembrance` },
        { '@type': 'ListItem', position: 4, name: m.name, item: url },
      ] },
    }],
  });
  send(res, 200, html);
}

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const slug = String(url.searchParams.get('slug') || '').toLowerCase();
  const id = url.searchParams.get('id');
  try {
    const town = await loadTown(slug);
    if (!town) return notFound(res, "We don't have a town at that address.");
    if (id) return await memorialPage(req, res, town, id);
    return await indexPage(req, res, town, url);
  } catch (e) {
    console.error('remembrance failed', slug, id, e && e.message);
    res.statusCode = 503;
    res.setHeader('Retry-After', '60');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<!doctype html><meta charset="utf-8"><title>Back shortly | TownTales</title><p style="font:20px/1.5 sans-serif;padding:24px">This page is having trouble loading. Please try again in a minute. <a href="/">TownTales home</a></p>');
  }
};

module.exports.surnameKey = surnameKey;
module.exports.TIER = TIER;
