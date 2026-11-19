// n8n "TownTales morning summary" → "Build the email" Code node (Nov 19 2026).
// The subject count is exactly the sum of the counted section headings below, so it always matches the email.
// Every problem report and every listed upload links straight to that entry in the admin page.
const d = $input.first().json;
const SITE = 'https://www.towntales.ca';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const A = (x) => Array.isArray(x) ? x : [];
const N = (x) => Number(x || 0);
const pl = (n, w, ws) => n + ' ' + (n === 1 ? w : (ws || w + 's'));
const adm = (frag) => SITE + '/#admin' + (frag ? '/' + frag : '');
const link = (href, text) => '<a href="' + esc(href) + '" style="color:#2B5C80">' + text + '</a>';
const li = (rows) => '<ul style="padding-left:20px">' + rows.join('') + '</ul>';
const SRC = { link_reader: 'link reader', visitor: 'visitor upload', research: 'town research', other: 'other' };

const counted = [];   // [label, count] — these make up the subject number
const sec = [];

const big = A(d.waitlist_reached_10);
if (big.length) {
  counted.push([pl(big.length, 'waitlist alert'), big.length]);
  sec.push('<h3 style="color:#B4512C">Book waitlist hit 10 (' + big.length + ')</h3>' + li(big.map((t) => '<li><b>' + esc(t.name || t.town) + '</b>: ' + t.people + ' people, ' + N(t.copies) + ' copies. Time to send the "ready to order" email.</li>')));
}

const rep = A(d.reports_open);
if (rep.length) {
  counted.push([pl(rep.length, 'problem report'), rep.length]);
  sec.push('<h3>Problem reports (' + rep.length + ' open)</h3>' + li(rep.map((r) => '<li><b>' + esc(r.what) + '</b>: ' + esc(String(r.text).slice(0, 300)) +
    '<br><small>' + esc(r.name) + ' · <a href="mailto:' + esc(r.email) + '">' + esc(r.email) + '</a> · ' + esc(String(r.at).slice(0, 10)) + ' · ' + link(adm('report-' + r.id), '<b>Open in admin</b>') + '</small></li>')) +
    '<p style="font-size:13px;color:#555">Press <b>Resolve</b> in admin and a report stops appearing here.</p>');
}

const items = A(d.items_waiting_list);
const waiting = Math.max(N(d.items_waiting), items.length);
if (waiting) {
  counted.push([pl(waiting, 'upload'), waiting]);
  const bySrc = {}; items.forEach((i) => { bySrc[i.source] = (bySrc[i.source] || 0) + 1; });
  const fresh = items.filter((i) => i.new).length;
  const parts = Object.keys(bySrc).map((k) => bySrc[k] + ' ' + (SRC[k] || k)).join(', ');
  // Visitor uploads first: they're the ones a person sent in.
  const order = { visitor: 0, research: 1, other: 2, link_reader: 3 };
  const sorted = items.slice().sort((a, b) => (order[a.source] ?? 9) - (order[b.source] ?? 9));
  const show = sorted.slice(0, 25);
  sec.push('<h3>Uploads waiting for review (' + waiting + ')</h3><p style="margin:0 0 6px">' + esc(parts) + (fresh ? '. ' + fresh + ' new since yesterday.' : '.') + '</p>' +
    li(show.map((i) => '<li>' + link(adm('item-' + i.id), esc(i.title)) + ' <small>· ' + esc(i.town_name || i.town) + ' · ' + esc(SRC[i.source] || i.source) + (i.new ? ' · <b>new</b>' : '') + '</small></li>')) +
    (waiting > show.length ? '<p>…and ' + (waiting - show.length) + ' more. ' + link(adm(''), 'Open the review queue') + ' (filter by town or source, approve in bulk).</p>' : ''));
}

const memW = N(d.memorials_waiting), mem = A(d.memorials_new);
if (memW) {
  counted.push([pl(memW, 'remembrance entry', 'remembrance entries'), memW]);
  sec.push('<h3>Remembrance entries waiting (' + memW + ')</h3>' + (mem.length ? li(mem.map((m) => '<li>' + esc(m.town) + ': ' + esc(m.name) + (m.by ? ' <small>from ' + esc(m.by) + '</small>' : '') + ' <small>(new)</small></li>')) : '') +
    '<p>' + link(adm(''), 'Open admin') + ' → "Load remembrance queue".</p>');
}

const clipW = N(d.clippings_waiting);
if (clipW) {
  counted.push([pl(clipW, 'clipping'), clipW]);
  sec.push('<h3>Clippings waiting (' + clipW + ')</h3><p>' + link(adm(''), 'Open admin') + ' → "Load clippings queue".</p>');
}

const books = A(d.book_requests_new);
if (books.length) {
  counted.push([pl(books.length, 'book request'), books.length]);
  sec.push('<h3>New book requests (' + books.length + ')</h3>' + li(books.map((b) => '<li>' + esc(b.town) + ': ' + esc(b.name) + ' &lt;' + esc(b.email) + '&gt;, ' + esc(b.format) + ', ' + pl(N(b.copies) || 1, 'copy', 'copies') + '</li>')));
}

// For your information (not counted in the subject)
const fyi = [];
const towns = A(d.towns_added);
if (towns.length) fyi.push('<p><b>Towns added (' + towns.length + '):</b> ' + towns.slice(0, 30).map((t) => esc(t.name) + ' ' + esc(t.prov)).join(', ') + (towns.length > 30 ? ', and ' + (towns.length - 30) + ' more' : '') + '</p>');
const look = A(d.research_needs_look);
if (look.length) fyi.push('<p><b>Town research needs a look (' + look.length + '):</b></p>' + li(look.map((t) => '<li>' + esc(t.name) + ': ' + esc(t.status) + '. ' + esc(t.note) + '</li>')));
if (N(d.visitor_links_waiting)) fyi.push('<p><b>Visitor links not read yet:</b> ' + N(d.visitor_links_waiting) + ' (admin → "Check links visitors shared").</p>');
const wl = A(d.waitlist_totals);
if (wl.length) fyi.push('<p><b>Book waitlist:</b> ' + wl.reduce((s, t) => s + N(t.people), 0) + ' people (' + wl.slice(0, 5).map((t) => esc(t.town) + ' ' + t.people).join(', ') + ')</p>');
fyi.push('<p style="font-size:13px;color:#555">Auto-approve for link-reader facts is <b>' + (d.auto_approve_link_reader === true ? 'on' : 'off') + '</b>.</p>');

const n = counted.reduce((s, c) => s + c[1], 0);
const quiet = n === 0;
const html = '<div style="font-family:Arial,sans-serif;font-size:15px;color:#1E2930;max-width:640px">' +
  '<h2 style="margin:0 0 8px">TownTales this morning</h2>' +
  (quiet ? '<p>Nothing is waiting for you. 🎉</p>' : '<p style="margin:0 0 4px"><b>' + pl(n, 'thing') + ' to look at:</b> ' + counted.map((c) => c[0]).join(', ') + '.</p>' + sec.join('')) +
  '<h3 style="margin-top:22px">For your information</h3>' + fyi.join('') +
  '<p style="margin-top:18px"><a href="' + adm('') + '" style="background:#2B5C80;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Open the admin page</a></p>' +
  '<p style="font-size:12px;color:#777">Links open the admin page; enter the admin key once per browser tab.</p></div>';
const top = counted.slice(0, 2).map((c) => c[0]).join(', ') + (counted.length > 2 ? ', …' : '');
const subject = (big.length ? '📚 Waitlist hit 10 · ' : '') + 'TownTales: ' + (quiet ? 'nothing waiting' : pl(n, 'thing') + ' to look at (' + top + ')');
return [{ json: { subject, html, count: n } }];
