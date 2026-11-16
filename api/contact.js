// Contact page: /contact — a standalone page (not linked from the menus) with a form that sends to Formspree.
const { SITE, esc, page, send } = require('./_shell');

const FORMSPREE = 'https://formspree.io/f/mjywyzne';

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const sent = url.searchParams.get('sent') === '1';
  const main = `<section class="wrap stack" style="padding-top:22px">
<p class="crumbs"><a href="/">TownTales</a> › Contact</p>
<p class="eyebrow">Contact</p>
<h1>Get in touch</h1>
<p class="lede">Questions, ideas, a history book to send, or something on the site that needs fixing? Send us a note and we'll get back to you.</p>
${sent ? '<div class="rm-ok"><h3>Thank you.</h3><p>Your message is on its way. We\'ll reply by email.</p></div>' : ''}
<form class="formbox" action="${FORMSPREE}" method="POST" data-tt-contact novalidate style="max-width:820px">
<input type="hidden" name="_subject" value="TownTales contact form">
<input type="hidden" name="_next" value="${SITE}/contact?sent=1">
<div class="grid2">
<div class="field"><label for="ct-name">Your name</label><input type="text" id="ct-name" name="name" required autocomplete="name"></div>
<div class="field"><label for="ct-email">Your email</label><input type="email" id="ct-email" name="email" required autocomplete="email"><span class="hint">So we can reply. Never shown on the site.</span></div>
</div>
<div class="grid2">
<div class="field"><label for="ct-town">Your town <span class="hint">(optional)</span></label><input type="text" id="ct-town" name="town" placeholder="e.g. Wapella, SK"></div>
<div class="field"><label for="ct-topic">What's it about?</label><select id="ct-topic" name="topic">
<option>A question</option><option>Sending a history book</option><option>Something to fix on the site</option><option>An idea or suggestion</option><option>Something else</option>
</select></div>
</div>
<div class="field"><label for="ct-msg">Your message</label><textarea id="ct-msg" name="message" required rows="7"></textarea></div>
<div style="position:absolute;left:-5000px" aria-hidden="true"><label for="ct-gotcha">Leave this empty</label><input type="text" id="ct-gotcha" name="_gotcha" tabindex="-1" autocomplete="off"></div>
<p class="err" id="ct-err" role="alert"></p>
<button class="btn" type="submit">Send message</button>
</form>
<div id="ct-done" role="status"></div>
</section>`;
  const html = page({
    title: 'Contact TownTales',
    desc: 'Get in touch with TownTales: questions, ideas, history books to send, or something on the site that needs fixing.',
    canonical: SITE + '/contact', main, noindex: sent,
  });
  send(res, 200, html, 'public, s-maxage=3600, stale-while-revalidate=86400');
};

