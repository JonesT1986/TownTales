// Contact page: /contact — email only (towntalesinfo@gmail.com). No form.
// ?topic=book (from the "Send a history book" button) adds a note and a prefilled subject line.
const { SITE, esc, page, send } = require('./_shell');

const EMAIL = 'towntalesinfo@gmail.com';

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const book = url.searchParams.get('topic') === 'book';
  const subject = book ? 'Sending a history book' : 'TownTales';
  const mailto = `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}`;
  const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(EMAIL)}&su=${encodeURIComponent(subject)}`;
  const outlook = `https://outlook.live.com/mail/0/deeplink/compose?to=${encodeURIComponent(EMAIL)}&subject=${encodeURIComponent(subject)}`;
  const main = `<section class="wrap stack" style="padding-top:22px">
<p class="crumbs"><a href="/">TownTales</a> › Contact</p>
<p class="eyebrow">Contact</p>
<h1>Get in touch</h1>
<p class="lede">Questions, ideas, a history book to send, or something on the site that needs fixing? Email us and we'll get back to you.</p>
${book ? `<div class="pv-soon stack" style="gap:10px"><p><b>Sharing a history book?</b> You don't need a scanner. Clear photos from your phone work great.</p>
<ul class="phone-tips"><li>Lay the book flat near a window in daylight. Turn the flash off (it causes glare).</li><li>Hold the phone straight above the page so the whole page fits, edges included.</li><li>One page per photo, in order, and check each one is sharp before you turn the page.</li></ul>
<p><a class="btn" href="/share-a-book">Send all the pages here</a></p><p class="small">Rather mail the book, or share a Google Photos / Drive album link? Email us and we'll sort it out. One copy is all it takes.</p></div>` : ''}
<div class="grow ct-box" style="max-width:820px">
<p style="font-size:1.1rem">Email us at</p>
<div class="ct-row"><button type="button" class="ct-addr" data-copy="${EMAIL}" title="Click to copy">${EMAIL}</button><button type="button" class="btn ct-copy" data-copy="${EMAIL}">Copy</button></div>
<p class="ct-copied" role="status" aria-live="polite"></p>
<p class="small">Open a new email to us in:</p>
<div class="btns"><a class="btn alt" href="${esc(gmail)}" target="_blank" rel="noopener">Gmail</a><a class="btn alt" href="${esc(outlook)}" target="_blank" rel="noopener">Outlook / Hotmail</a></div>
<p class="small muted">Use a different email? Copy the address above and paste it into a new message, or <a href="${esc(mailto)}">open your email app</a>. Please tell us which town you're writing about.</p>
</div>
</section>`;
  const html = page({
    title: 'Contact TownTales',
    desc: 'Get in touch with TownTales: questions, ideas, history books to send, or something on the site that needs fixing.',
    canonical: SITE + '/contact', main, noindex: book,
  });
  send(res, 200, html, 'public, s-maxage=3600, stale-while-revalidate=86400');
};
