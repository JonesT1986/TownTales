// Contact page: /contact — email only (towntalesinfo@gmail.com). No form.
// ?topic=book (from the "Send a history book" button) adds a note and a prefilled subject line.
const { SITE, esc, page, send } = require('./_shell');

const EMAIL = 'towntalesinfo@gmail.com';

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const book = url.searchParams.get('topic') === 'book';
  const mail = (subject) => `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}`;
  const main = `<section class="wrap stack" style="padding-top:22px">
<p class="crumbs"><a href="/">TownTales</a> › Contact</p>
<p class="eyebrow">Contact</p>
<h1>Get in touch</h1>
<p class="lede">Questions, ideas, a history book to send, or something on the site that needs fixing? Email us and we'll get back to you.</p>
${book ? `<div class="pv-soon"><p><b>Sending a history book?</b> Email us your town and the book's title, and we'll get back to you about sending it. One copy is all it takes.</p></div>` : ''}
<div class="grow" style="max-width:820px">
<p style="font-size:1.1rem">Email us at</p>
<p style="font-size:clamp(1.3rem,5vw,1.9rem);font-weight:800;overflow-wrap:anywhere"><a href="${esc(mail(book ? 'Sending a history book' : 'TownTales'))}">${EMAIL}</a></p>
<div class="btns"><a class="btn" href="${esc(mail(book ? 'Sending a history book' : 'TownTales'))}">Write us an email</a></div>
<p class="small muted">Please tell us which town you're writing about.</p>
</div>
</section>`;
  const html = page({
    title: 'Contact TownTales',
    desc: 'Get in touch with TownTales: questions, ideas, history books to send, or something on the site that needs fixing.',
    canonical: SITE + '/contact', main, noindex: book,
  });
  send(res, 200, html, 'public, s-maxage=3600, stale-while-revalidate=86400');
};
