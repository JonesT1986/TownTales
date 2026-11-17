// DRAFT (not deployed): anniversary & reunion packs for town committees — /anniversary  (?town=wapella-sk for the sample banner)
const { SITE, PROV, esc, q, page, send } = require('./_shell');

const EMAIL = 'towntalesinfo@gmail.com';

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const slug = String(url.searchParams.get('town') || 'wapella-sk').toLowerCase();
  let town = null, timeline = [];
  try {
    town = (await q(`towns?slug=eq.${encodeURIComponent(slug)}&hidden=eq.false&select=slug,name,prov,est`))[0] || null;
    if (town) timeline = await q(`timeline?town=eq.${encodeURIComponent(slug)}&select=year,label,title&order=year,sort`, { all: true });
  } catch (e) { /* sample is optional */ }
  const mail = `mailto:${EMAIL}?subject=${encodeURIComponent('Anniversary pack' + (town ? ': ' + town.name : ''))}`;
  // Pick up to 8 events spread across the years for the banner sample.
  const pick = timeline.length > 8 ? Array.from({ length: 8 }, (_, i) => timeline[Math.round(i * (timeline.length - 1) / 7)]) : timeline;
  const banner = town && pick.length ? `<div class="an-banner" role="img" aria-label="Sample timeline banner for ${esc(town.name)}">
<div class="an-head"><span class="bk-kicker">${esc(town.name)}, ${esc(PROV[town.prov] || town.prov)}</span><b>Our story, year by year</b></div>
<ol class="an-line">${pick.map((t) => `<li><span class="an-yr">${esc(t.label)}</span><span class="an-tx">${esc(t.title)}</span></li>`).join('')}</ol>
<p class="an-foot">Every event sourced · towntales.ca/${esc(town.slug)}</p></div>
<p class="small muted">Sample built automatically from ${esc(town.name)}'s timeline on TownTales. A real banner is printed large (e.g. 8 ft) and checked with your committee first.</p>` : '';

  const main = `<div class="fr-draft">Draft preview · not public</div>
<section class="wrap stack" style="padding-top:22px">
<p class="crumbs"><a href="/">TownTales</a> › Anniversaries and reunions</p>
<p class="eyebrow">For anniversary and reunion committees</p>
<h1>Your town's story, ready for the big weekend</h1>
<p class="lede">Planning a town anniversary, homecoming or school reunion? We turn your town's TownTales history into displays and keepsakes people will gather around, all sourced and checked with your committee.</p>
<div class="btns"><a class="btn" href="${esc(mail)}">Ask about a pack for your town</a></div>
</section>

${banner ? `<section class="wrap stack"><h2>Sample: a timeline banner</h2>${banner}</section>` : ''}

<section class="wrap stack"><h2>What can go in a pack</h2>
<div class="pv-grid">
<div class="rm-cem"><h3>Timeline banners</h3><p>Large printed banners of the town's history, decade by decade, for the hall or the rink.</p></div>
<div class="rm-cem"><h3>Families board</h3><p>The names of families from the town's records, for a wall where visitors find their own.</p></div>
<div class="rm-cem"><h3>Slideshow</h3><p>A looping show of the town's history and photos for a screen at the event.</p></div>
<div class="rm-cem"><h3>Keepsake booklets</h3><p>A short printed history to hand out or sell to raise funds for the event.</p></div>
<div class="rm-cem"><h3>Your town's book</h3><p>The full town history book, at a committee rate for resale at the event.</p></div>
<div class="rm-cem"><h3>Memory collection</h3><p>A table where visitors share stories and photos, added to the town's page afterwards with their names as sources.</p></div>
</div></section>

<section class="wrap stack"><h2>How it works</h2>
<ol class="pn-steps">
<li><b>Tell us your town and date.</b> Six months ahead is ideal.</li>
<li><b>We gather the history</b> from your town's page, plus anything your committee or museum adds.</li>
<li><b>You check every panel</b> before anything is printed.</li>
<li><b>We deliver</b> the printed pack in time for the event.</li>
</ol>
<div class="btns"><a class="btn" href="${esc(mail)}">Email ${EMAIL}</a></div>
</section>`;
  send(res, 200, page({
    title: 'Town anniversary and reunion packs | TownTales',
    desc: 'Timeline banners, families boards, slideshows and keepsake booklets for town anniversaries and reunions, built from your town\'s history.',
    canonical: SITE + '/anniversary', main, noindex: true,
  }));
};
