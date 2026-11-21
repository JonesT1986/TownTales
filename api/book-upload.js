// Whole-book upload page: /share-a-book (optionally ?town=<slug>)
// People photograph every page with their phone and send them all at once. Pages stay private (see db/2026-11-21-book-uploads.sql).
// The upload itself runs in towntales-extra.js (section 8: wireBookUpload).
const { SITE, PROV, esc, q, page, send } = require('./_shell');

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pre = String(url.searchParams.get('town') || '').toLowerCase();
  let towns = [];
  try { towns = await q('towns?hidden=eq.false&select=slug,name,prov&order=name', { all: true }); } catch (e) { /* form still shows; RPC checks the town */ }
  const opts = towns.map((t) => `<option value="${esc(t.slug)}"${t.slug === pre ? ' selected' : ''}>${esc(t.name)}, ${esc(PROV[t.prov] || t.prov)}</option>`).join('');

  const main = `<section class="wrap stack" style="padding-top:22px">
<p class="crumbs"><a href="/">TownTales</a> › Share a history book</p>
<p class="eyebrow">Share a history book</p>
<h1>Send us your town's history book, page by page</h1>
<p class="lede">No scanner needed. Take a clear photo of each page with your phone, then send them all here at once. We use it to build your town's page and timeline, and to help make its new history book.</p>

<div class="grow bk-tips">
<h2>How to photograph the pages</h2>
<ol class="phone-tips">
<li>Lay the book flat near a window in daylight. Turn the flash off (it causes glare).</li>
<li>Hold the phone straight above the page so the whole page fits, edges included.</li>
<li>One page per photo, front cover first, in order. Don't skip pages, even blank-looking ones.</li>
<li>Check each photo is sharp before you turn the page. Zoom in once in a while to make sure you can read the words.</li>
</ol>
<p class="small">Big book? That's fine. 300 pages is normal. Do it in one sitting if you can so the photos stay in order.</p>
</div>

<form class="formbox stack" data-tt-bookupload novalidate>
<div class="field"><label for="bk-town">Town</label><select id="bk-town" name="town" required><option value="">Choose the town…</option>${opts}</select><span class="hint">Not listed? <a href="/#addtown">Add your town</a> first.</span></div>
<div class="grid2">
<div class="field"><label for="bk-title">Book title</label><input type="text" id="bk-title" name="title" maxlength="200" required placeholder="e.g. Wapella Wagon Trails"></div>
<div class="field"><label for="bk-year">Year it was printed <span class="hint">(if you know)</span></label><input type="text" id="bk-year" name="year" maxlength="40" placeholder="e.g. 1982"></div>
</div>
<div class="field"><label for="bk-files">Photos of the pages</label>
<input type="file" id="bk-files" name="files" accept="image/*,application/pdf" multiple>
<span class="hint">Tap the button, open your photo library, and select all the page photos at once. Already have a PDF? Choose that instead.</span>
<p class="bk-count" id="bk-count" aria-live="polite"></p></div>
<fieldset class="stack" style="border:0;padding:0;margin:0;gap:8px"><legend class="lbl">Who owns the book?</legend>
<label class="hn-check"><input type="radio" name="perm" value="committee"> Our town or history committee made it</label>
<label class="hn-check"><input type="radio" name="perm" value="owner"> I wrote it, or I hold the rights</label>
<label class="hn-check"><input type="radio" name="perm" value="unsure" checked> I'm not sure, and that's fine. We'll check before anything is made public.</label>
</fieldset>
<div class="field"><label for="bk-notes">Anything we should know? <span class="hint">(optional)</span></label><textarea id="bk-notes" name="notes" maxlength="2000" rows="3" placeholder="e.g. Pages 40–44 are missing from my copy. The committee contact was Jean Smith."></textarea></div>
<div class="grid2">
<div class="field"><label for="bk-name">Your name</label><input type="text" id="bk-name" name="name" required autocomplete="name"></div>
<div class="field"><label for="bk-email">Your email</label><input type="email" id="bk-email" name="email" required autocomplete="email"><span class="hint">Never shown. We'll email you when it's received.</span></div>
</div>
<p class="small">Your photos stay private. Nothing from the book goes on the site until we've checked who owns it.</p>
<p class="err" id="bk-err" role="alert"></p>
<div class="bk-prog" id="bk-prog" hidden><progress id="bk-bar" max="100" value="0"></progress><p id="bk-status" aria-live="polite"></p><p class="small muted">Keep this page open until it's done. If the signal drops, it keeps trying each page until it goes through.</p></div>
<button class="btn" type="submit">Send the pages</button>
</form>
<div id="bk-done"></div>
<p class="small">Rather mail the book, or stuck? Email <a href="mailto:towntalesinfo@gmail.com?subject=Sending%20a%20history%20book">towntalesinfo@gmail.com</a> and we'll help.</p>
</section>`;
  send(res, 200, page({
    title: 'Share a town history book | TownTales',
    desc: 'Photograph each page of your town history book with your phone and send them to TownTales. No scanner needed.',
    canonical: SITE + '/share-a-book', main,
  }), 'public, s-maxage=600, stale-while-revalidate=86400');
};
