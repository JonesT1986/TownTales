/* TownTales admin add-on (Nov 19 2026), loaded after the app on every page; only does anything on #admin.
   - Review queue: filter by town and by source, tick boxes, "Approve selected", "Approve all for this town",
     and a setting to auto-approve link-reader facts that have a source (so only visitor uploads wait for review).
   - Problem reports tab: open reports with Resolve (stamps the resolved date), Reopen, Delete; "show resolved" toggle.
   - Direct links from the daily email: #admin/item-<id> and #admin/report-<id> open and highlight that entry.
   - Towns tab (Nov 22 2026): "Needs rebuild" toggle with count, search box, A–Z letter bar, 100 towns per page,
     status per town; a rebuilt town updates in place. Data comes from the admin-towns edge function (database-side filtering).
   It uses the app's internals through window.TTapp. If that is missing it does nothing. */
(function () {
  "use strict";
  // The app runs inside its own closure; it hands us what we need on window.TTapp (see fix-patches.json).
  var T = window.TTapp; if (!T || !T.P || !T.P.admin) return;
  var A = T.A, P = T.P, live = T.live, DB = T.DB, route = T.route, town = T.town, esc = T.esc, KINDS = T.KINDS, pending = T.pending, LIVE = T.LIVE, loadedTowns = T.loadedTowns;

  var qf = { town: "", src: "", sel: new Set() };
  var rf = { show: "open", data: null, err: "" };
  var settings = null, settingsErr = false, focusMiss = "";

  var SRC = { link: "Link reader", visitor: "Visitor upload", research: "Town research", other: "Other" };
  function srcOf(i) {
    var x = String(i.external_id || "");
    if (x.indexOf("link:") === 0) return "link";
    if (x.indexOf("auto:") === 0) return "research";
    if (i.origin === "community") return "visitor";
    return "other";
  }
  function townName(slug) { var t = town(slug); return (t && t.name) || slug; }
  function plural(n, w) { return n + " " + w + (n === 1 ? "" : "s"); }
  function msg(t, ok) { var m = document.getElementById("tta-msg"); if (m) { m.textContent = t; m.className = "tt-msg " + (ok ? "ok" : "err"); } }
  function focusTarget() { return String(window.ttAdmFocus || ""); }
  // The deep link is used once: afterwards the address goes back to plain #admin, so filters and clicks behave normally.
  function clearFocus() { window.ttAdmFocus = ""; if (/^#admin\//.test(location.hash)) { try { history.replaceState(null, "", location.pathname + "#admin"); } catch (e) {} } }
  function applyFocus(prefix) {
    var f = focusTarget(); if (f.indexOf(prefix) !== 0) return;
    setTimeout(function () {
      var el = document.getElementById("tta-" + f);
      if (el) { el.classList.add("tta-focus"); el.scrollIntoView({ block: "center" }); }
      clearFocus();
    }, 60);
  }

  /* ---------- tabs + deep links ---------- */
  var adminOrig = P.admin;
  P.admin = function () {
    var f = focusTarget();
    if (f.indexOf("report-") === 0) T.at = "reports";
    else if (f.indexOf("item-") === 0) { T.at = "queue"; qf.town = ""; qf.src = ""; }
    if (LIVE && rf.data === null && hasKey()) loadReports();
    var html = adminOrig();
    var n = rf.data ? rf.data.filter(function (r) { return !r.done; }).length : 0;
    var tab = '<button role="tab" aria-selected="' + (T.at === "reports") + '" data-act="tab" data-t="reports">Problem reports' + (n ? '<span class="count">' + n + "</span>" : "") + "</button>";
    return html.replace('<button role="tab" aria-selected="' + (T.at === "towns") + '" data-act="tab" data-t="towns">', tab + "$&");
  };

  /* ---------- review queue ---------- */
  A.queue = function () {
    if (LIVE && !T.queueLoaded) {
      live.api("queue", {}).then(function (r) {
        T.S.items = T.S.items.filter(function (i) { return i.status !== "pending"; }).concat(r.items); T.queueLoaded = true; route();
      }, function () { T.queueLoaded = "err"; route(); });
      return '<p class="muted">Loading…</p>';
    }
    if (T.queueLoaded === "err") return '<div class="notice warn"><p>Couldn\'t load the queue. Check the admin key above.</p></div>';
    if (LIVE && settings === null && !settingsErr) {
      live.api("settings", {}).then(function (r) { settings = r.settings || {}; route(); }, function () { settingsErr = true; route(); });
    }
    var all = pending();
    var f = focusTarget();
    if (f.indexOf("item-") === 0 && !all.some(function (i) { return "item-" + i.id === f; })) { focusMiss = "That upload has already been reviewed (or was removed)."; clearFocus(); }

    var auto = settings && settings.auto_approve_link_reader === true;
    var set = LIVE ? '<div class="formbox tta-set"><label class="tta-check"><input type="checkbox" data-tta="auto"' + (auto ? " checked" : "") + (settings === null ? " disabled" : "") +
      '> Auto-approve link-reader facts that have a source</label><p class="hint">When this is on, facts the AI link reader finds (with a source page) are published straight away and the town\'s timeline rebuilds a few minutes later. Visitor uploads still wait here for you. It applies to new facts; use the buttons below for the ones already waiting.</p>' +
      '<label class="tta-check" style="margin-top:10px">"New" tag shows for <input type="number" min="0" max="365" step="1" style="width:5em" data-tta="newdays" value="' + esc(settings && settings.new_tag_days != null ? settings.new_tag_days : 30) + '"' + (settings === null ? " disabled" : "") + '> days after something goes live</label><p class="hint">Timeline entries, archive items and clippings added on or after ' + esc((settings && settings.new_tag_since) || "2026-11-26") + ' carry a small "New" tag for this many days, then it drops off on its own. 0 turns the tag off.</p>' +
      (settingsErr ? '<p class="err">Couldn\'t load this setting.</p>' : "") + "</div>" : "";

    if (!all.length) return set + (focusMiss ? '<div class="notice info"><p>' + esc(focusMiss) + "</p></div>" : "") + '<div class="empty">Nothing waiting. Share something on the public site to see it here.</div>';

    var byTown = {}, bySrc = {};
    all.forEach(function (i) { byTown[i.town] = (byTown[i.town] || 0) + 1; var s = srcOf(i); bySrc[s] = (bySrc[s] || 0) + 1; });
    if (qf.town && !byTown[qf.town]) qf.town = "";
    if (qf.src && !bySrc[qf.src]) qf.src = "";
    var shown = all.filter(function (i) { return (!qf.town || i.town === qf.town) && (!qf.src || srcOf(i) === qf.src); });
    var ids = new Set(all.map(function (i) { return i.id; }));
    qf.sel.forEach(function (id) { if (!ids.has(id)) qf.sel.delete(id); });
    var selShown = shown.filter(function (i) { return qf.sel.has(i.id); }).length;

    var towns = Object.keys(byTown).sort(function (a, b) { return townName(a).localeCompare(townName(b)); });
    var filters = '<div class="filters tta-filters">' +
      '<div class="field"><label for="tta-town">Town</label><select id="tta-town" data-tta="town"><option value="">All towns (' + all.length + ")</option>" +
      towns.map(function (t) { return '<option value="' + esc(t) + '"' + (qf.town === t ? " selected" : "") + ">" + esc(townName(t)) + " (" + byTown[t] + ")</option>"; }).join("") + "</select></div>" +
      '<div class="field"><label for="tta-src">Source</label><select id="tta-src" data-tta="src"><option value="">All sources</option>' +
      ["link", "visitor", "research", "other"].filter(function (s) { return bySrc[s]; }).map(function (s) { return '<option value="' + s + '"' + (qf.src === s ? " selected" : "") + ">" + SRC[s] + " (" + bySrc[s] + ")</option>"; }).join("") + "</select></div></div>";

    var townLabel = qf.town ? townName(qf.town) : "";
    var bar = '<div class="tta-bar"><label class="tta-check"><input type="checkbox" data-tta="all"' + (shown.length && selShown === shown.length ? " checked" : "") + "> Select all " + shown.length + " shown</label>" +
      '<div class="btns"><button class="btn sm" data-tta="pub-sel"' + (selShown ? "" : " disabled") + ">Approve selected (" + selShown + ")</button>" +
      '<button class="btn sm alt" data-tta="dec-sel"' + (selShown ? "" : " disabled") + ">Decline selected</button>" +
      (qf.town ? '<button class="btn sm" data-tta="pub-town">Approve all ' + shown.length + " for " + esc(townLabel) + "</button>" : "") + "</div>" +
      (qf.town ? "" : '<p class="small muted">Pick a town to get an "Approve all for this town" button.</p>') +
      '<p class="tt-msg" id="tta-msg" role="status"></p></div>';

    var list = shown.map(function (i) {
      var s = srcOf(i);
      return '<div class="qitem" id="tta-item-' + esc(i.id) + '"><div class="top"><label class="tta-check tta-pick"><input type="checkbox" data-tta="pick" data-id="' + esc(i.id) + '"' + (qf.sel.has(i.id) ? " checked" : "") + '><span class="sr">Select</span></label><h3>' + esc(i.title) + "</h3><span>" +
        '<span class="pill st">' + esc(KINDS[i.kind] || i.kind) + '</span> <span class="pill new">' + esc(townName(i.town)) + '</span> <span class="pill tta-src tta-' + s + '">' + SRC[s] + "</span></span></div>" +
        qimg(i) + "<p>" + esc(i.body) + "</p>" +
        '<dl class="kv"><dt>When</dt><dd>' + esc(i.date_label || "—") + "</dd><dt>Source</dt><dd>" + esc(i.source || "—") +
        (i.source_url ? ' · <a href="' + esc(i.source_url) + '" target="_blank" rel="noopener">open page</a>' : "") + "</dd><dt>From</dt><dd>" + esc(i.contributor || "Anonymous") + (i.contact_email ? " · " + esc(i.contact_email) : "") + "</dd></dl>" +
        '<div class="btns"><button class="btn sm" data-act="approve" data-id="' + esc(i.id) + '">Publish</button><button class="btn sm alt" data-act="decline" data-id="' + esc(i.id) + '">Decline</button></div></div>';
    }).join("");

    applyFocus("item-");
    var miss = focusMiss ? '<div class="notice info"><p>' + esc(focusMiss) + "</p></div>" : ""; focusMiss = "";
    return set + miss + filters + bar + '<div class="stack">' + list + "</div>";
  };

  function bulk(ids, status, label) {
    if (!ids.length) return;
    if (status === "declined" && !confirm("Decline " + plural(ids.length, "item") + "? They won't be published.")) return;
    var bs = document.querySelectorAll("[data-tta^=pub],[data-tta^=dec]"); bs.forEach(function (b) { b.disabled = true; });
    msg((status === "published" ? "Publishing " : "Declining ") + plural(ids.length, "item") + "…", true);
    var job = LIVE ? live.api("moderate-bulk", { ids: ids, status: status })
      : Promise.all(ids.map(function (id) { return DB.setItem(id, { status: status }); })).then(function () { return { changed: ids.length, towns: [] }; });
    job.then(function (r) {
      var gone = new Set(ids);
      if (LIVE) { T.S.items = T.S.items.filter(function (i) { return !gone.has(i.id); }); loadedTowns.clear(); }
      ids.forEach(function (id) { qf.sel.delete(id); });
      route();
      setTimeout(function () { msg(label.replace("{n}", plural(r.changed, "item")) + (status === "published" && r.towns && r.towns.length ? " Timelines rebuild in about a minute." : ""), true); }, 50);
    }, function (e) { bs.forEach(function (b) { b.disabled = false; }); msg("That didn't work: " + e.message); });
  }

  /* ---------- problem reports ---------- */
  function hasKey() { try { return !!sessionStorage.getItem("tt-admin"); } catch (e) { return false; } }
  function loadReports() {
    if (rf.loading) return; rf.loading = true; rf.err = "";
    live.api("reports", { show: rf.show }).then(function (r) { rf.loading = false; rf.data = r.reports || []; route(); },
      function (e) { rf.loading = false; rf.data = []; rf.err = e.message; route(); });
  }
  A.reports = function () {
    if (!LIVE) return '<p class="muted">Problem reports are only stored on the live site.</p>';
    if (rf.data === null) { loadReports(); return '<p class="muted">Loading…</p>'; }
    if (rf.err) return '<div class="notice warn"><p>Couldn\'t load problem reports. Check the admin key above.</p></div>';
    var f = focusTarget(), miss = "";
    if (f.indexOf("report-") === 0 && !rf.data.some(function (r) { return "report-" + r.id === f; })) {
      if (rf.show !== "all") { rf.show = "all"; rf.data = null; loadReports(); return '<p class="muted">Loading…</p>'; }
      miss = '<div class="notice info"><p>That report was deleted.</p></div>'; clearFocus();
    }
    var open = rf.data.filter(function (r) { return !r.done; }).length;
    var head = '<div class="tta-bar"><label class="tta-check"><input type="checkbox" data-tta="rep-all"' + (rf.show === "all" ? " checked" : "") + "> Show resolved reports too</label>" +
      '<p class="small muted">' + (open ? plural(open, "open report") + ". Only open reports appear in the morning email." : "No open reports.") + '</p><p class="tt-msg" id="tta-msg" role="status"></p></div>';
    var list = rf.data.length ? rf.data.map(function (r) {
      var when = new Date(r.created_at).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
      var res = r.resolved_at ? new Date(r.resolved_at).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" }) : "";
      return '<div class="qitem' + (r.done ? " tta-done" : "") + '" id="tta-report-' + esc(r.id) + '"><div class="top"><h3>' + esc(r.what || "(no subject)") + "</h3><span>" +
        (r.done ? '<span class="pill doc">Resolved ' + esc(res) + "</span>" : '<span class="pill new">Open</span>') + "</span></div>" +
        '<p class="tta-text">' + esc(r.text) + "</p>" +
        '<dl class="kv">' + (r.town ? "<dt>Town</dt><dd>" + esc(r.town) + "</dd>" : "") + '<dt>From</dt><dd>' + esc(r.name || "(no name)") + (r.email ? ' · <a href="mailto:' + esc(r.email) + '">' + esc(r.email) + "</a>" : "") + "</dd><dt>Sent</dt><dd>" + esc(when) + "</dd></dl>" +
        '<div class="btns">' + (r.done ? '<button class="btn sm alt" data-tta="rep-reopen" data-id="' + esc(r.id) + '">Reopen</button>' : '<button class="btn sm" data-tta="rep-resolve" data-id="' + esc(r.id) + '">Resolve</button>') +
        '<button class="btn sm alt" data-tta="rep-delete" data-id="' + esc(r.id) + '">Delete</button></div></div>';
    }).join("") : '<div class="empty">' + (rf.show === "all" ? "No problem reports yet." : "No open problem reports.") + "</div>";
    applyFocus("report-");
    return miss + head + '<div class="stack">' + list + "</div>";
  };

  /* ---------- towns tab (Nov 22 2026): Needs-rebuild view, search, A–Z, paging ----------
     Everything is filtered and counted in the database (admin-towns function → public.admin_towns), one page
     at a time, so towns past the first 1,000 are never dropped. Typing only redraws the list, not the
     whole page, so the search box keeps its focus. */
  var townsOrig = A.towns;
  var PAGE = 100;
  var tf = { q: "", letter: "", needs: false, offset: 0, data: null, err: "", seq: 0, timer: 0, watch: {} };
  // "Rebuild all" (Nov 23 2026): one town every few seconds, so the AI and the edge function aren't flooded.
  var bulkRun = { on: false, stop: false, done: 0, total: 0, failed: [] };
  var BULK_GAP_MS = 4000;
  var LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ#".split("");
  // Separate small edge function (supabase/functions/admin-towns), same admin key as the main api.
  var TOWNS_URL = "https://zpqwrzsgpwwjrlbnfynn.supabase.co/functions/v1/admin-towns";
  function townsApi(payload) {
    var key = ""; try { key = sessionStorage.getItem("tt-admin") || ""; } catch (e) {}
    return fetch(TOWNS_URL, { method: "POST", headers: { "Content-Type": "application/json", "x-admin-key": key }, body: JSON.stringify(payload) })
      .then(function (r) { return r.ok ? r.json() : r.text().then(function (t) { var m = t; try { m = JSON.parse(t).error || t; } catch (e) {} throw new Error(m); }); });
  }

  function whyNeeds(r) {
    var w = [];
    if (r.timeline_status === "error") w.push("last build failed");
    else if (!r.timeline_built_at || r.timeline_status === "empty") w.push("timeline never built");
    if (r.newer) w.push("items added since the last build");
    if (r.uncovered) w.push(plural(r.uncovered, "dated item") + " not on the timeline");
    if (r.stale) w.push("timeline points to " + plural(r.stale, "removed item"));
    return w.join("; ");
  }
  function statusCell(r) {
    if (r.status === "rebuilding" || tf.watch[r.slug]) return '<span class="pill st">Rebuilding…</span>';
    if (r.status === "needs") return '<span class="pill ttt-needs" title="' + esc(whyNeeds(r)) + '">Needs rebuild</span><br><span class="small muted">' + esc(whyNeeds(r)) + "</span>";
    return '<span class="pill doc">OK</span>';
  }
  function townRow(r) {
    return '<tr id="ttt-' + esc(r.slug) + '"><td><b>' + esc(r.name) + "</b>" + (r.hidden ? ' <span class="small muted">(hidden)</span>' : "") +
      '<br><a class="small" href="#t-' + esc(r.slug) + '">View</a></td><td>' + esc(r.prov) + '</td><td class="num">' + r.items + '</td><td class="num">' + r.rows +
      "</td><td>" + statusCell(r) + '</td><td><div class="btns"><button class="btn sm alt" data-ttt="rebuild" data-id="' + esc(r.slug) + '"' + (tf.watch[r.slug] || r.status === "rebuilding" ? " disabled" : "") + ">" +
      (tf.watch[r.slug] || r.status === "rebuilding" ? "Rebuilding…" : "Rebuild timeline") + "</button>" +
      (r.hidden ? '<button class="btn sm alt" data-act="tshow" data-id="' + esc(r.slug) + '">Show</button>' : '<button class="btn sm alt" data-act="thide" data-id="' + esc(r.slug) + '">Hide</button>') + "</div></td></tr>";
  }
  function drawTowns() {
    var box = document.getElementById("ttt-results"); if (!box) return;
    var d = tf.data;
    var badge = document.getElementById("ttt-needs-n"); if (badge && d) badge.textContent = "(" + d.needs + ")";
    var bar = document.getElementById("ttt-letters");
    if (bar && d) bar.innerHTML = '<button type="button" data-ttt="letter" data-l="" aria-pressed="' + (!tf.letter) + '">All</button>' + LETTERS.map(function (L) {
      var n = (d.letters && d.letters[L]) || 0;
      return '<button type="button" data-ttt="letter" data-l="' + L + '" aria-pressed="' + (tf.letter === L) + '"' + (n || tf.letter === L ? "" : " disabled") + ">" + L + "<small>" + n + "</small></button>";
    }).join("");
    if (tf.err) { box.innerHTML = '<div class="notice warn"><p>Couldn\'t load towns: ' + esc(tf.err) + ". Check the admin key above.</p></div>"; return; }
    if (!d) { box.innerHTML = '<p class="muted">Loading…</p>'; return; }
    var from = d.total ? d.offset + 1 : 0, to = Math.min(d.offset + d.rows.length, d.total);
    var what = (tf.needs ? "towns needing a rebuild" : "towns") + (tf.letter ? ' starting with "' + tf.letter + '"' : "") + (tf.q ? ' matching "' + tf.q + '"' : "");
    var pager = d.total > PAGE ? '<div class="btns"><button class="btn sm alt" data-ttt="page" data-d="-1"' + (d.offset ? "" : " disabled") + '>← Previous</button><button class="btn sm alt" data-ttt="page" data-d="1"' + (to < d.total ? "" : " disabled") + ">Next →</button></div>" : "";
    var foot = d.stats_at ? '<p class="small muted">Rebuild check last refreshed ' + new Date(d.stats_at).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" }) + " (every 5 minutes, and right after each rebuild). " + plural(d.needs_all, "town") + " need a rebuild in total.</p>" : "";
    var bulkBar = "";
    if (bulkRun.on) bulkBar = '<div class="ttt-bulk"><p><b>Rebuilding all:</b> started ' + bulkRun.done + " of " + bulkRun.total + (bulkRun.failed.length ? " (" + bulkRun.failed.length + " couldn't start)" : "") + '. Keep this page open until it finishes.</p><progress max="' + bulkRun.total + '" value="' + bulkRun.done + '"></progress><div class="btns"><button class="btn sm alt" data-ttt="bulk-stop"' + (bulkRun.stop ? " disabled" : "") + ">" + (bulkRun.stop ? "Stopping…" : "Stop") + "</button></div></div>";
    else if (tf.needs && d.needs_all > 0) bulkBar = '<div class="ttt-bulk"><p>' + plural(d.needs_all, "town") + ' need a rebuild. Rebuild them all in one go: one town starts every few seconds, and each takes about a minute.</p><div class="btns"><button class="btn sm" data-ttt="bulk">Rebuild all ' + d.needs_all + "</button></div></div>";
    box.innerHTML = bulkBar + '<p class="small muted" role="status">' + (d.total ? "Showing " + from + "–" + to + " of " + d.total + " " + what + "." : "No " + what + ".") + "</p>" + pager +
      (d.rows.length ? '<div class="tbl"><table><thead><tr><th>Town</th><th>Prov.</th><th class="num">Archive</th><th class="num">Timeline</th><th>Status</th><th>Actions</th></tr></thead><tbody>' + d.rows.map(townRow).join("") + "</tbody></table></div>" : "") +
      pager + foot + '<p class="tt-msg" id="tta-msg" role="status"></p>';
  }
  function loadTowns(keepOffset) {
    if (!keepOffset) tf.offset = 0;
    var my = ++tf.seq;
    return townsApi({ q: tf.q, letter: tf.letter, needs: tf.needs, limit: PAGE, offset: tf.offset }).then(function (r) {
      if (my !== tf.seq) return;
      if (!r.rows.length && tf.offset > 0 && r.total > 0) { tf.offset = Math.max(0, Math.floor((r.total - 1) / PAGE) * PAGE); return loadTowns(true); }
      tf.err = ""; tf.data = r; drawTowns();
    }, function (e) { if (my !== tf.seq) return; tf.err = e.message; tf.data = null; drawTowns(); });
  }
  // After a rebuild: check that town every 10 s (up to 4 min) and update its row once the build is done.
  function watchTown(slug) {
    var started = Date.now();
    tf.watch[slug] = true;
    (function poll() {
      setTimeout(function () {
        townsApi({ q: slug, limit: 20 }).then(function (r) {
          var row = (r.rows || []).filter(function (x) { return x.slug === slug; })[0];
          if (row && row.status === "rebuilding" && Date.now() - started < 240000) return poll();
          delete tf.watch[slug];
          // Redraws counts, badge and letters; a fixed town drops out of the Needs-rebuild view.
          loadTowns(true).then(function () {
            if (row) msg(row.name + ": " + (row.status === "needs" ? "rebuilt, but still flagged (" + whyNeeds(row) + ")." : row.status === "rebuilding" ? "still rebuilding. Click Rebuild again later if it stays stuck." : "timeline rebuilt."), row.status !== "needs");
          });
        }, function () { if (Date.now() - started < 240000) poll(); else { delete tf.watch[slug]; drawTowns(); } });
      }, 10000);
    })();
  }
  function allNeedsSlugs() {
    var out = [];
    function page(off) {
      return townsApi({ q: "", letter: "", needs: true, limit: PAGE, offset: off }).then(function (r) {
        (r.rows || []).forEach(function (x) { if (x.status === "needs" && !tf.watch[x.slug]) out.push(x.slug); });
        return (r.rows || []).length === PAGE && off + PAGE < r.total ? page(off + PAGE) : out;
      });
    }
    return page(0);
  }
  function rebuildAll() {
    if (bulkRun.on) return;
    var n = tf.data ? tf.data.needs_all : 0;
    if (!confirm("Rebuild the timeline for all " + plural(n, "town") + " that need it?\n\nOne town starts every few seconds, so this takes about " + Math.max(1, Math.ceil(n * BULK_GAP_MS / 60000)) + " minutes. Each rebuild is one AI run. Keep this page open until it finishes.")) return;
    bulkRun = { on: true, stop: false, done: 0, total: n, failed: [] }; drawTowns();
    allNeedsSlugs().then(function (slugs) {
      bulkRun.total = slugs.length; drawTowns();
      (function next(i) {
        if (bulkRun.stop || i >= slugs.length) {
          var stopped = bulkRun.stop, done = bulkRun.done, failed = bulkRun.failed.length;
          bulkRun.on = false;
          setTimeout(function () { loadTowns(true); }, 90000);
          loadTowns(true).then(function () { msg((stopped ? "Stopped. " : "") + "Started " + plural(done, "rebuild") + (failed ? "; " + failed + " couldn't start (try those again)" : "") + ". Rebuilds finish in the background over the next few minutes; this list refreshes as they do.", !failed); });
          return;
        }
        DB.rebuild(slugs[i]).then(function () { bulkRun.done++; }, function () { bulkRun.failed.push(slugs[i]); })
          .then(function () { if (bulkRun.done % 10 === 0) loadTowns(true); else drawTowns(); setTimeout(function () { next(i + 1); }, BULK_GAP_MS); });
      })(0);
    }, function (e) { bulkRun.on = false; drawTowns(); msg("Couldn't load the list of towns: " + e.message); });
  }
  A.towns = function () {
    if (!LIVE) return townsOrig();
    setTimeout(function () { drawTowns(); loadTowns(true); }, 0);
    return '<div class="ttt-tools"><div class="field"><label for="ttt-q">Search towns</label><input type="search" id="ttt-q" data-ttt="q" autocomplete="off" placeholder="Type part of a town name" value="' + esc(tf.q) + '"></div>' +
      '<label class="tta-check ttt-needs-toggle"><input type="checkbox" data-ttt="needs"' + (tf.needs ? " checked" : "") + '> Needs rebuild <span id="ttt-needs-n">' + (tf.data ? "(" + tf.data.needs + ")" : "") + "</span></label></div>" +
      '<div class="ttt-letters" id="ttt-letters" role="group" aria-label="First letter"></div>' +
      '<div id="ttt-results"></div>';
  };
  (function () {
    var css = ".ttt-tools{display:flex;flex-wrap:wrap;align-items:flex-end;gap:16px}.ttt-tools .field{flex:1 1 260px;margin:0}" +
      ".ttt-letters{display:flex;flex-wrap:wrap;gap:4px}.ttt-letters button{min-width:38px;padding:6px 6px 4px;border:1px solid var(--rule,#ccc);border-radius:6px;background:#fff;font-weight:700;cursor:pointer;line-height:1.1}" +
      ".ttt-letters button small{display:block;font-weight:400;font-size:.7em;opacity:.7}.ttt-letters button[aria-pressed=true]{background:var(--denim,#2B5C80);color:#fff;border-color:var(--denim,#2B5C80)}" +
      ".ttt-letters button[disabled]{opacity:.35;cursor:default}.pill.ttt-needs{background:#fbeee5;color:#B4512C}" +
      ".ttt-bulk{border:2px solid var(--red,#B4512C);background:#fbeee5;padding:12px 16px;margin:0 0 12px;display:flex;flex-direction:column;gap:8px}.ttt-bulk progress{width:100%;max-width:420px}";
    var s = document.createElement("style"); s.textContent = css; document.head.appendChild(s);
  })();
  document.addEventListener("input", function (ev) {
    var el = ev.target; if (!el || el.getAttribute("data-ttt") !== "q") return;
    tf.q = el.value.trim(); clearTimeout(tf.timer); tf.timer = setTimeout(function () { loadTowns(); }, 250);
  });
  document.addEventListener("change", function (ev) {
    var el = ev.target; if (!el || el.getAttribute("data-ttt") !== "needs") return;
    tf.needs = el.checked; loadTowns();
  });
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest("button[data-ttt]"); if (!b) return;
    var a = b.getAttribute("data-ttt");
    if (a === "letter") { tf.letter = b.getAttribute("data-l") || ""; loadTowns(); }
    else if (a === "page") { tf.offset = Math.max(0, tf.offset + PAGE * (+b.dataset.d)); loadTowns(true); var t = document.getElementById("ttt-q"); if (t) t.scrollIntoView({ block: "start" }); }
    else if (a === "bulk") rebuildAll();
    else if (a === "bulk-stop") { bulkRun.stop = true; drawTowns(); }
    else if (a === "rebuild") {
      var slug = b.dataset.id; b.disabled = true; b.textContent = "Rebuilding…";
      DB.rebuild(slug).then(function () { watchTown(slug); drawTowns(); }, function (e) { b.disabled = false; b.textContent = "Rebuild timeline"; msg("That didn't work: " + e.message); });
    }
  });

  /* ---------- events (data-tta, so the app's own data-act handler never sees them) ---------- */
  document.addEventListener("change", function (ev) {
    var el = ev.target.closest && ev.target.closest("[data-tta]"); if (!el) return;
    var a = el.getAttribute("data-tta");
    if (a === "town") { qf.town = el.value; route(); }
    else if (a === "src") { qf.src = el.value; route(); }
    else if (a === "pick") { if (el.checked) qf.sel.add(el.dataset.id); else qf.sel.delete(el.dataset.id); route(); }
    else if (a === "all") {
      pending().filter(function (i) { return (!qf.town || i.town === qf.town) && (!qf.src || srcOf(i) === qf.src); })
        .forEach(function (i) { if (el.checked) qf.sel.add(i.id); else qf.sel.delete(i.id); });
      route();
    }
    else if (a === "auto") {
      var on = el.checked; el.disabled = true;
      live.api("settings", { set: { auto_approve_link_reader: on } }).then(function (r) {
        settings = r.settings || {}; route();
        setTimeout(function () { msg(on ? "Auto-approve is on. New link-reader facts with a source will publish on their own." : "Auto-approve is off. Every new fact waits here.", true); }, 50);
      }, function (e) { el.checked = !on; el.disabled = false; alert("Couldn't save the setting: " + e.message); });
    }
    else if (a === "newdays") {
      var d = parseInt(el.value, 10); if (!(d >= 0 && d <= 365)) { alert("Use a number of days from 0 to 365."); return; }
      el.disabled = true;
      live.api("settings", { set: { new_tag_days: d } }).then(function (r) {
        settings = r.settings || {}; route();
        setTimeout(function () { msg(d ? 'The "New" tag now shows for ' + d + " days." : 'The "New" tag is off.', true); }, 50);
      }, function (e) { el.disabled = false; alert("Couldn't save the setting: " + e.message); });
    }
    else if (a === "rep-all") { rf.show = el.checked ? "all" : "open"; rf.data = null; route(); }
  });
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest("button[data-tta]"); if (!b) return;
    var a = b.getAttribute("data-tta"), id = b.dataset.id;
    var shown = pending().filter(function (i) { return (!qf.town || i.town === qf.town) && (!qf.src || srcOf(i) === qf.src); });
    if (a === "pub-sel") return bulk(shown.filter(function (i) { return qf.sel.has(i.id); }).map(function (i) { return i.id; }), "published", "Published {n}.");
    if (a === "dec-sel") return bulk(shown.filter(function (i) { return qf.sel.has(i.id); }).map(function (i) { return i.id; }), "declined", "Declined {n}.");
    if (a === "pub-town") {
      if (!confirm("Publish all " + plural(shown.length, "item") + " for " + townName(qf.town) + (qf.src ? " (" + SRC[qf.src] + " only)" : "") + "?")) return;
      return bulk(shown.map(function (i) { return i.id; }), "published", "Published {n} for " + townName(qf.town) + ".");
    }
    if (a === "rep-resolve" || a === "rep-reopen") {
      b.disabled = true;
      live.api("report-resolve", { id: id, resolved: a === "rep-resolve" }).then(function (r) {
        rf.data = rf.data.map(function (x) { return x.id === id ? Object.assign({}, x, r.report) : x; });
        if (rf.show === "open") rf.data = rf.data.filter(function (x) { return !x.done; });
        route(); setTimeout(function () { msg(a === "rep-resolve" ? "Resolved. It won't appear in the morning email any more." : "Reopened.", true); }, 50);
      }, function (e) { b.disabled = false; msg("That didn't work: " + e.message); });
      return;
    }
    if (a === "rep-delete") {
      if (!confirm("Delete this report for good? This can't be undone.")) return;
      b.disabled = true;
      live.api("report-delete", { id: id }).then(function () {
        rf.data = rf.data.filter(function (x) { return x.id !== id; }); route(); setTimeout(function () { msg("Deleted.", true); }, 50);
      }, function (e) { b.disabled = false; msg("That didn't work: " + e.message); });
    }
  });
  // A new admin key means everything reloads.
  document.addEventListener("click", function (ev) { if (ev.target.closest && ev.target.closest('[data-act="setkey"]')) { settings = null; settingsErr = false; rf.data = null; } }, true);

  // Nov 26 2026: submission images open full size. Click = lightbox (fit to screen); click the big image to
  // zoom to actual size and scroll around; "Open in new tab" for the original. Documents/scans show ~600px wide.
  function qimg(i) {
    if (!i.image_url) return "";
    var u = esc(i.image_url);
    if (/\.pdf(\?|$)/i.test(i.image_url)) return '<p><a class="btn sm alt" href="' + u + '" target="_blank" rel="noopener">Open the PDF ↗</a></p>';
    var doc = i.kind === "document" || i.kind === "story";
    return '<a class="tta-zoom' + (doc ? " tta-doc" : "") + '" href="' + u + '" target="_blank" rel="noopener" data-tta-zoom="' + u + '" title="Click to see it full size">' +
      '<img src="' + u + '" alt="Submitted image: ' + esc(i.title || "") + '" loading="lazy"><span class="tta-zoom-hint">🔍 Click to enlarge</span></a>';
  }
  function zoomBox(url) {
    var d = document.getElementById("tta-zoom-dlg");
    if (!d) {
      d = document.createElement("dialog"); d.id = "tta-zoom-dlg";
      d.innerHTML = '<div class="tta-zbar"><span class="small">Click the image to zoom in or out. Esc closes.</span><span class="btns"><a class="btn sm alt" target="_blank" rel="noopener" data-z="open">Open in new tab ↗</a><button class="btn sm" data-z="close">Close ✕</button></span></div><div class="tta-zwrap"><img alt="Full-size submission"></div>';
      d.addEventListener("click", function (e) {
        var t = e.target;
        if (t === d || (t.closest && t.closest("[data-z=close]"))) { d.close(); return; }
        if (t.tagName === "IMG") d.classList.toggle("zoomed");
      });
      document.body.appendChild(d);
    }
    d.classList.remove("zoomed");
    d.querySelector(".tta-zwrap img").src = url;
    d.querySelector("[data-z=open]").href = url;
    if (d.showModal) d.showModal(); else window.open(url, "_blank", "noopener");
  }
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("[data-tta-zoom]");
    if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return; // ctrl/cmd-click still opens a new tab
    e.preventDefault(); zoomBox(a.getAttribute("data-tta-zoom"));
  });
  (function () {
    var st = document.createElement("style");
    st.textContent =
      ".tta-zoom{display:inline-block;position:relative;cursor:zoom-in;line-height:0;max-width:100%}" +
      ".qitem .tta-zoom img{max-width:240px;width:auto;border:1px solid var(--rule)}" +
      ".qitem .tta-zoom.tta-doc img{max-width:min(600px,100%);width:600px;height:auto}" +
      ".tta-zoom-hint{position:absolute;left:6px;bottom:6px;background:rgba(30,41,48,.82);color:#fff;font-size:.8rem;line-height:1.2;padding:3px 7px;border-radius:2px}" +
      ".tta-zoom:hover img,.tta-zoom:focus-visible img{outline:3px solid var(--denim,#2B5C80);outline-offset:2px}" +
      "#tta-zoom-dlg{width:96vw;max-width:96vw;height:94vh;max-height:94vh;padding:0;border:3px solid var(--ink,#1E2930);background:#2a2f33}" +
      "#tta-zoom-dlg::backdrop{background:rgba(20,24,27,.8)}" +
      ".tta-zbar{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 12px;background:var(--paper,#FFFCF3)}" +
      ".tta-zwrap{height:calc(100% - 56px);overflow:auto;display:flex;align-items:center;justify-content:center}" +
      ".tta-zwrap img{max-width:100%;max-height:100%;cursor:zoom-in;background:#fff}" +
      "#tta-zoom-dlg.zoomed .tta-zwrap{display:block}" +
      "#tta-zoom-dlg.zoomed .tta-zwrap img{max-width:none;max-height:none;cursor:zoom-out}";
    document.head.appendChild(st);
  })();

  // The app may have drawn #admin before this file loaded: draw it again with the new queue.
  var h = (location.hash || "").slice(1);
  if (h === "admin" || h.indexOf("admin/") === 0) { try { route(); } catch (e) {} }
})();
