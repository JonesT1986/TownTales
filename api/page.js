// Wraps api/town.js and adds the Family Trees script to every page it serves.
// Also swaps the Donate page's "Send us a note" (which went to Corrections) for a real donation form.
// town.js is left untouched; if anything here fails the page is served as before.
const town = require('./town');
const TAG = '<script src="/api/fam?v=2" defer></script>';
const EXTRA_TAG = '<script src="/towntales-extra.js?v=15" defer></script>';
const ADMIN_TAG = '<script src="/towntales-admin.js?v=7" defer></script>';
const MS_TAG = '<script src="/towntales-milestones.js?v=1" defer></script>';
const MORE_TAG = '<script src="/towntales-more.js?v=3" defer></script>';

// Exact-match swaps on the served page. A swap that no longer matches is skipped.
const SWAPS = [
  {
    // Donate page: replace the "coming soon / send us a note" box with a donation form.
    find: '<div class="notice info" style="max-width:780px"><b>Online donations are coming soon.</b><p>Want to help before then? <a href="#corrections" data-act="donatemsg">Send us a note</a> and we\'ll get in touch.</p></div>',
    replace:
      '<div class="notice info" style="max-width:780px"><b>Online card payments are coming soon.</b><p>Until then, tell us how you\'d like to help below and we\'ll email you the details for sending your donation.</p></div>' +
      '<form class="formbox" data-form="donation" novalidate>' +
      '<div class="grid2"><div class="field"><label for="dn-kind">How would you like to help?</label><select id="dn-kind" name="kind">' +
      '<option>One-time donation</option><option>Monthly support</option><option>Sponsor a town</option><option>Something else</option></select></div>' +
      '<div class="field"><label for="dn-amount">Amount (optional)</label><input type="text" id="dn-amount" name="amount" placeholder="e.g. $25"></div></div>' +
      '<div class="field"><label for="dn-town">For a particular town? (optional)</label><input type="text" id="dn-town" name="town" placeholder="Leave blank to support the whole site"></div>' +
      '<div class="field"><label for="dn-text">Message (optional)</label><textarea id="dn-text" name="text" placeholder="Anything you\'d like us to know"></textarea></div>' +
      '<div class="grid2"><div class="field"><label for="dn-name">Your name</label><input type="text" id="dn-name" name="name"></div>' +
      '<div class="field"><label for="dn-email">Your email</label><input type="email" id="dn-email" name="email"></div></div>' +
      '<p class="err" id="dn-err" role="alert"></p><button class="btn" type="submit">Send</button>' +
      '</form><div id="dn-done"></div>',
  },
  {
    // Form handler for the donation form (same delivery as the corrections form, tagged DONATION).
    find: 'F.correction=f=>{const e="cr-err";',
    replace:
      'F.donation=f=>{const e="dn-err";if(!okEmail(val(f,"email")))return fail(e,"Add a valid email so we can get in touch.");' +
      'const kind=val(f,"kind"),amt=val(f,"amount"),tw=val(f,"town");' +
      'const row={what:"DONATION: "+kind+(amt?" ("+amt+")":"")+(tw?" for "+tw:""),text:val(f,"text")||"Wants to donate. Please get in touch.",name:val(f,"name"),email:val(f,"email")};' +
      '(LIVE?live.post("reports",row):Promise.resolve()).then(()=>done("dn-done",\'<div class="notice ok"><h3>Thank you!</h3><p>We\\\'ll email \'+esc(row.email)+\' within a few days with how to send your donation.</p></div>\',f),()=>fail(e,"Couldn\\\'t send just now. Please try again."));};' +
      'F.correction=f=>{const e="cr-err";',
  },
];

module.exports = async (req, res) => {
  const end = res.end.bind(res);
  res.end = (body, ...rest) => {
    try {
      if (typeof body === 'string' && body.includes('</body>')) {
        for (const s of SWAPS) {
          try {
            if (body.split(s.find).length === 2) body = body.split(s.find).join(s.replace);
            else console.error('swap skipped:', s.find.slice(0, 60));
          } catch (e) { /* skip this swap */ }
        }
        if (!body.includes('/family.js') && !body.includes('/api/fam')) body = body.replace('</body>', TAG + '\n</body>');
        // Remembrance, clippings and admin review add-ons (towntales-extra.js). Loaded after the app; it never blocks it.
        if (!body.includes('/towntales-extra.js')) body = body.replace('</body>', EXTRA_TAG + '\n</body>');
        // Admin review queue, problem reports and email deep links (towntales-admin.js). Only acts on #admin.
        if (!body.includes('/towntales-admin.js')) body = body.replace('</body>', ADMIN_TAG + '\n</body>');
        // Milestone birthdays: banner + gold on the town page, badges on town lists, homepage list (towntales-milestones.js).
        if (!body.includes('/towntales-milestones.js')) body = body.replace('</body>', MS_TAG + '\n</body>');
        // Nov 26 2026: place markers, timeline 5-per-year, New/community tags, clipping links (towntales-more.js).
        if (!body.includes('/towntales-more.js')) body = body.replace('</body>', MORE_TAG + '\n</body>');
        if (res.getHeader && res.getHeader('Content-Length')) res.removeHeader('Content-Length');
      }
    } catch (e) { /* serve unchanged */ }
    return end(body, ...rest);
  };
  return town(req, res);
};
