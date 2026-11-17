// DRAFT (not deployed): funeral home partner page — /partners/funeral-homes
const { SITE, esc, page, send } = require('./_shell');

const EMAIL = 'towntalesinfo@gmail.com';

module.exports = async (req, res) => {
  const mail = `mailto:${EMAIL}?subject=${encodeURIComponent('Funeral home partnership')}`;
  const main = `<div class="fr-draft">Draft preview · not public</div>
<section class="wrap stack" style="padding-top:22px">
<p class="crumbs"><a href="/">TownTales</a> › Partners › Funeral homes</p>
<p class="eyebrow">For funeral homes</p>
<h1>Give every family a place to remember them</h1>
<p class="lede">TownTales keeps the history of small Canadian towns, including a permanent remembrance page for each person resting in its cemeteries. Partner funeral homes can offer families that page, and a QR plaque that links to it, as part of their service.</p>
<div class="btns"><a class="btn" href="${esc(mail)}">Talk to us about partnering</a><a class="btn alt" href="/wapella-sk/remembrance">See an example town</a></div>
</section>

<section class="wrap stack"><h2>What the family receives</h2>
<div class="pv-grid">
<div class="rm-cem"><h3>A remembrance page</h3><p>A permanent page with their loved one's name, dates, resting place and life story, on their hometown's page. The address never changes.</p></div>
<div class="rm-cem"><h3>A QR plaque</h3><p>A small stainless plaque for the headstone. Visitors scan it with a phone and the remembrance page opens.</p></div>
<div class="rm-cem"><h3>A place in the town's history</h3><p>Their page sits beside the town's timeline, its cemeteries and its families, so they're remembered as part of the community.</p></div>
</div></section>

<section class="wrap stack"><h2>How it works</h2>
<ol class="pn-steps">
<li><b>You mention it</b> when arranging the service, with a short card we supply.</li>
<li><b>The family says yes</b> and shares the details and a photo, with you or directly with us.</li>
<li><b>We build the page</b> and check it with the family before it goes public.</li>
<li><b>The plaque is made</b> and delivered for placement, subject to the cemetery's rules.</li>
</ol></section>

<section class="wrap stack"><h2>For your funeral home</h2>
<ul class="fr-more">
<li class="fr-ok">A meaningful extra you can offer families, with no stock and no extra work for your staff</li>
<li class="fr-ok">A referral payment for each family who orders</li>
<li class="fr-ok">Your funeral home credited on the remembrance pages you refer, if you'd like</li>
</ul>
<p class="small muted">Referral terms, pricing and plaque details are set out in the partner agreement.</p>
<div class="btns"><a class="btn" href="${esc(mail)}">Email ${EMAIL}</a></div>
</section>`;
  send(res, 200, page({
    title: 'Funeral home partners | TownTales',
    desc: 'Offer families a permanent remembrance page and QR headstone plaque through TownTales.',
    canonical: SITE + '/partners/funeral-homes', main, noindex: true,
  }));
};
