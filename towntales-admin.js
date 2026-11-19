/* TownTales admin add-on (Nov 19 2026), loaded after the app on every page; only does anything on #admin.
   - Review queue: filter by town and by source, tick boxes, "Approve selected", "Approve all for this town",
     and a setting to auto-approve link-reader facts that have a source (so only visitor uploads wait for review).
   - Problem reports tab: open reports with Resolve (stamps the resolved date), Reopen, Delete; "show resolved" toggle.
   - Direct links from the daily email: #admin/item-<id> and #admin/report-<id> open and highlight that entry.
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
        (i.image_url ? '<img src="' + esc(i.image_url) + '" alt="">' : "") + "<p>" + esc(i.body) + "</p>" +
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
        '<dl class="kv"><dt>From</dt><dd>' + esc(r.name || "(no name)") + (r.email ? ' · <a href="mailto:' + esc(r.email) + '">' + esc(r.email) + "</a>" : "") + "</dd><dt>Sent</dt><dd>" + esc(when) + "</dd></dl>" +
        '<div class="btns">' + (r.done ? '<button class="btn sm alt" data-tta="rep-reopen" data-id="' + esc(r.id) + '">Reopen</button>' : '<button class="btn sm" data-tta="rep-resolve" data-id="' + esc(r.id) + '">Resolve</button>') +
        '<button class="btn sm alt" data-tta="rep-delete" data-id="' + esc(r.id) + '">Delete</button></div></div>';
    }).join("") : '<div class="empty">' + (rf.show === "all" ? "No problem reports yet." : "No open problem reports.") + "</div>";
    applyFocus("report-");
    return miss + head + '<div class="stack">' + list + "</div>";
  };

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

  // The app may have drawn #admin before this file loaded: draw it again with the new queue.
  var h = (location.hash || "").slice(1);
  if (h === "admin" || h.indexOf("admin/") === 0) { try { route(); } catch (e) {} }
})();
