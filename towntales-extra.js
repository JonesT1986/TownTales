/* TownTales add-ons (loaded on every page, after the app):
   1. Cemetery & Remembrance block on each town page (+ live search on /<town>/remembrance)
   2. Family "add someone" form (on /<town>/remembrance)
   3. Newspaper clippings on each town's Archive tab, with an upload form
   4. Remembrance + clippings review queue on the #admin page
   5. Sports & Teams on each town page (only when the town has teams)
   Nothing here can break the main app: every step is wrapped, and the app never depends on it. */
(function () {
  "use strict";
  var SB = "https://zpqwrzsgpwwjrlbnfynn.supabase.co";
  // Public (anon) key, already published in the site's own page source. Row-level security limits what it can do.
  var ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpwcXdyenNncHd3anJsYm5meW5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzNDI4MzQsImV4cCI6MjEwNzkxODgzNH0.0SuQ5vpg21azn5g6wzqE7o-mGbH9TCl8LyyR2zXUqIA";
  var PROVRE = "(?:sk|mb|ab|bc|on|qc|nb|ns|pe|nl|yt|nt|nu)";
  var TIER = { documented: ["Verified", "rm-ver"], community: ["Community Memory", "rm-mem"] };

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function norm(s) { return String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, ""); }
  function pill(t) { var x = TIER[t] || TIER.documented; return '<span class="rm-pill ' + x[1] + '">' + x[0] + "</span>"; }
  function okEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
  function H(extra) { var h = { apikey: ANON, Authorization: "Bearer " + ANON }; for (var k in extra) h[k] = extra[k]; return h; }

  function get(path, all) {
    var out = [], step = 1000;
    function page(from) {
      return fetch(SB + "/rest/v1/" + path, { headers: H({ "Range-Unit": "items", Range: from + "-" + (from + step - 1) }) })
        .then(function (r) { if (!r.ok) return r.text().then(function (t) { if (r.status === 404 || /does not exist|schema cache/i.test(t)) return []; throw new Error(t); }); return r.json(); })
        .then(function (rows) { out = out.concat(rows); return all && rows.length === step ? page(from + step) : out; });
    }
    return page(0);
  }
  function rpc(fn, args) {
    return fetch(SB + "/rest/v1/rpc/" + fn, { method: "POST", headers: H({ "Content-Type": "application/json" }), body: JSON.stringify(args) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error((j && j.message) || "Request failed"); return j; }); });
  }
  function surnameKey(name) {
    var n = String(name || "").trim(); if (n.indexOf(",") >= 0) return n.toLowerCase();
    var w = n.split(/\s+/).filter(Boolean); while (w.length > 1 && /^(jr|sr|ii|iii|iv)\.?$/i.test(w[w.length - 1])) w.pop();
    var last = w.pop() || ""; return (last + ", " + w.join(" ")).toLowerCase();
  }
  function dates(m) { var b = m.birth_date_label, d = m.death_date_label; return b && d ? b + " – " + d : b ? "Born " + b : d ? "Died " + d : ""; }

  /* ---------- 1 & 2: standalone remembrance page ---------- */
  function wireIndexFilter() {
    var qi = $("#rm-q"), ci = $("#rm-c"), list = $("#rm-list"), count = $("#rm-count");
    if (!qi || !list) return;
    var items = $$("#rm-list li"), total = items.length;
    function run() {
      var q = norm(qi.value).trim(), c = ci ? ci.value : "", n = 0;
      items.forEach(function (li) { var show = (!c || li.getAttribute("data-c") === c) && (!q || li.getAttribute("data-n").indexOf(q) >= 0); li.hidden = !show; if (show) n++; });
      $$("#rm-list .rm-group").forEach(function (g) { g.hidden = !$$("li", g).some(function (li) { return !li.hidden; }); });
      if (count) count.textContent = n === total ? "Showing all " + total.toLocaleString("en-CA") + " names, by surname." : "Showing " + n.toLocaleString("en-CA") + " of " + total.toLocaleString("en-CA") + " names.";
    }
    qi.addEventListener("input", run); if (ci) ci.addEventListener("change", run);
    var form = qi.form; if (form) form.addEventListener("submit", function (e) { e.preventDefault(); run(); var l = $("#rm-list"); if (l) l.scrollIntoView({ block: "start" }); });
  }

  function wireMemForm(f) {
    if (f.getAttribute("data-wired")) return; f.setAttribute("data-wired", "1");
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var v = function (n) { var el = f.elements[n]; return el ? String(el.value || "").trim() : ""; };
      var err = $("#mf-err"), btn = f.querySelector('button[type="submit"]');
      err.textContent = "";
      if (!v("name")) return (err.textContent = "Please enter their name.");
      if (!v("src")) return (err.textContent = "Please tell us how you know this. It's shown as the source.");
      if (!v("sname")) return (err.textContent = "Please enter your name.");
      if (!okEmail(v("email"))) return (err.textContent = "Please enter a working email address. It's never shown.");
      btn.disabled = true; btn.textContent = "Sending…";
      rpc("submit_memorial", {
        p_town: f.getAttribute("data-town"), p_cemetery_id: v("cem"), p_name: v("name"), p_maiden_name: v("maiden"),
        p_birth_date_label: v("bd"), p_birth_place: v("bp"), p_death_date_label: v("dd"), p_death_place: v("dp"),
        p_note: v("note"), p_submitter_name: v("sname"), p_submitter_email: v("email"), p_relationship: v("rel"), p_attestation: v("src"),
      }).then(function (r) {
        if (!r || !r.ok) { err.textContent = (r && r.error) || "Couldn't send that. Please try again."; btn.disabled = false; btn.textContent = "Send for review"; return; }
        f.hidden = true;
        $("#mf-done").innerHTML = '<div class="rm-ok"><h3>Thank you.</h3><p>We\'ve received ' + esc(v("name")) + '. A volunteer will look it over, usually within a few days, and then it will appear here as Community Memory with you named as the source.</p><p><a href="" data-act="mf-again">Add another person</a></p></div>';
        var again = $('[data-act="mf-again"]'); if (again) again.addEventListener("click", function (e) { e.preventDefault(); f.reset(); f.hidden = false; $("#mf-done").innerHTML = ""; btn.disabled = false; btn.textContent = "Send for review"; f.scrollIntoView({ block: "start" }); });
      }).catch(function () { err.textContent = "Couldn't send that just now. Please try again in a minute."; btn.disabled = false; btn.textContent = "Send for review"; });
    });
  }

  /* ---------- contact page (/contact): send to Formspree without leaving the page ---------- */
  function wireContact(f) {
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var err = $("#ct-err"), btn = f.querySelector('button[type="submit"]');
      var v = function (n) { return String(f.elements[n].value || "").trim(); };
      err.textContent = "";
      if (!v("name")) return (err.textContent = "Please enter your name.");
      if (!okEmail(v("email"))) return (err.textContent = "Please enter a working email address so we can reply.");
      if (!v("message")) return (err.textContent = "Please write your message.");
      btn.disabled = true; btn.textContent = "Sending…";
      fetch(f.action, { method: "POST", body: new FormData(f), headers: { Accept: "application/json" } })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error((j && j.errors && j.errors.map(function (e) { return e.message; }).join(" ")) || "send"); }); })
        .then(function () { f.hidden = true; $("#ct-done").innerHTML = '<div class="rm-ok"><h3>Thank you.</h3><p>Your message is on its way. We\'ll reply by email.</p></div>'; })
        .catch(function () { err.textContent = "Couldn't send that just now. Please try again in a minute."; btn.disabled = false; btn.textContent = "Send message"; });
    });
  }

  /* ---------- town book request (DRAFT, Wapella only) → existing book_interest table ---------- */
  var BOOK_TOWNS = { "wapella-sk": true };
  function wireBookForm(f) {
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var err = $("#bk-err"), btn = f.querySelector('button[type="submit"]');
      var v = function (n) { return String(f.elements[n].value || "").trim(); };
      err.textContent = "";
      if (!v("name")) return (err.textContent = "Please enter your name.");
      if (!okEmail(v("email"))) return (err.textContent = "Please enter a working email address.");
      btn.disabled = true; btn.textContent = "Sending…";
      fetch(SB + "/rest/v1/book_interest", { method: "POST", headers: H({ "Content-Type": "application/json", Prefer: "return=minimal" }),
        body: JSON.stringify({ town: f.getAttribute("data-town"), name: v("name").slice(0, 120), email: v("email").slice(0, 200).toLowerCase(), format: v("format"), copies: parseInt(v("copies"), 10) || 1, updates_ok: !!f.elements.updates.checked }) })
        .then(function (r) { if (!r.ok) throw new Error("save"); f.hidden = true; $("#bk-done").innerHTML = '<div class="rm-ok"><h3>You\'re on the list.</h3><p>Thank you. We\'ll email you when your copy is ready to order.</p></div>'; })
        .catch(function () { err.textContent = "Couldn't send that just now. Please try again in a minute."; btn.disabled = false; btn.textContent = "Request my copy"; });
    });
  }
  function bookBlock(t) {
    var view = $("#view"); if (!view || !BOOK_TOWNS[t.slug] || $("#tt-book", view)) return;
    var anchor = $("#history", view); if (!anchor) return;
    var tn = townName(), sec = document.createElement("section");
    sec.className = "wrap"; sec.id = "tt-book";
    sec.innerHTML = '<div class="grow" style="max-width:none"><p class="eyebrow">The ' + esc(tn) + ' Book</p><h2>Get the ' + esc(tn) + ' Book</h2><p>' + esc(tn) + "'s history in one book: the timeline, the people, the cemeteries and the teams, with every source. See a free sample first.</p>" +
      '<div class="btns"><a class="btn" href="/' + esc(t.slug) + '/book">See the free sample</a><a class="btn alt" href="/' + esc(t.slug) + '/book#request">Request the book</a></div></div>';
    anchor.parentNode.insertBefore(sec, anchor);
  }

  /* ---------- which town page is showing in the app ---------- */
  function currentTown() {
    var h = decodeURIComponent((location.hash || "").slice(1));
    var m = h.match(new RegExp("^(?:t|tl)-([a-z0-9-]+-" + PROVRE + ")(?:/(archive))?$"));
    if (!m && !h) m = location.pathname.match(new RegExp("^/([a-z0-9-]+-" + PROVRE + ")(?:/(archive))?/?$"));
    return m ? { slug: m[1], archive: m[2] === "archive" } : null;
  }

  /* ---------- 1: remembrance block on the town page ---------- */
  var memCache = {};
  function loadTownMem(slug) {
    if (memCache[slug]) return memCache[slug];
    var s = encodeURIComponent(slug);
    memCache[slug] = Promise.all([
      get("cemeteries?town=eq." + s + "&select=id,name,location_desc,affiliation&order=name"),
      get("memorials?town=eq." + s + "&status=eq.published&select=id,name,maiden_name,birth_date_label,death_date_label,cemetery_id,cemetery_name,tier", true),
    ]).then(function (r) { r[1].sort(function (a, b) { return surnameKey(a.name).localeCompare(surnameKey(b.name)); }); return { cems: r[0], mems: r[1] }; })
      .catch(function (e) { delete memCache[slug]; throw e; });
    return memCache[slug];
  }

  function townName() { var h1 = $("#view h1"); return h1 ? h1.textContent.split(",")[0].trim() : "this town"; }

  function rmBlock(t) {
    var view = $("#view"); if (!view || $("#tt-rm", view)) return;
    var anchor = $("#history", view); if (!anchor) return;
    var sec = document.createElement("section");
    sec.className = "wrap tt-rm-block"; sec.id = "tt-rm"; sec.setAttribute("data-slug", t.slug);
    sec.innerHTML = '<p class="eyebrow">Cemetery &amp; Remembrance</p><h2>Remembering the people of ' + esc(townName()) + '</h2><p class="muted">Loading…</p>';
    anchor.parentNode.insertBefore(sec, anchor.nextSibling);
    loadTownMem(t.slug).then(function (d) { if (sec.isConnected) drawRm(sec, t.slug, d); }).catch(function () { sec.remove(); });
  }

  function drawRm(sec, slug, d) {
    var tn = townName(), base = "/" + slug + "/remembrance";
    if (!d.mems.length && !d.cems.length) {
      sec.innerHTML = '<p class="eyebrow">Cemetery &amp; Remembrance</p><h2>Remembering the people of ' + esc(tn) + '</h2>' +
        '<p>No names have been added for ' + esc(tn) + ' yet. If someone from your family rests here, you can be the first to add them. Every entry is checked by a volunteer and credited to you.</p>' +
        '<div class="btns"><a class="btn" href="' + base + '#add">Add someone from your family</a></div>';
      return;
    }
    var cname = {}; d.cems.forEach(function (c) { cname[c.id] = c.name; });
    sec.innerHTML = '<p class="eyebrow">Cemetery &amp; Remembrance</p><h2>Remembering the people of ' + esc(tn) + '</h2>' +
      '<p>' + (d.mems.length === 1 ? "One person is" : d.mems.length.toLocaleString("en-CA") + " people are") + ' remembered here' + (d.cems.length ? ", in " + d.cems.map(function (c) { return esc(c.name); }).join(", ").replace(/, ([^,]*)$/, " and $1") : "") + '. Every name carries its source: ' + pill("documented") + ' from records, ' + pill("community") + ' from families.</p>' +
      '<form class="tt-rm-search" role="search"><div class="field"><label for="tt-rm-q">Search by name</label><input type="search" id="tt-rm-q" placeholder="e.g. Anderson" autocomplete="off"></div>' +
      (d.cems.length > 1 ? '<div class="field"><label for="tt-rm-c">Cemetery</label><select id="tt-rm-c"><option value="">All cemeteries</option>' + d.cems.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.name) + "</option>"; }).join("") + "</select></div>" : "") +
      '</form><p class="small muted" id="tt-rm-n" role="status"></p><ul class="rm-names" id="tt-rm-list"></ul>' +
      '<div class="btns"><a class="btn" href="' + base + '">See all ' + d.mems.length.toLocaleString("en-CA") + ' names and the cemeteries</a><a class="btn alt" href="' + base + '#add">Add someone from your family</a></div>';
    var qi = $("#tt-rm-q", sec), ci = $("#tt-rm-c", sec), list = $("#tt-rm-list", sec), n = $("#tt-rm-n", sec);
    function draw() {
      var q = norm(qi.value).trim(), c = ci ? ci.value : "";
      var hits = d.mems.filter(function (m) { return (!c || m.cemetery_id === c) && (!q || norm(m.name + " " + (m.maiden_name || "")).indexOf(q) >= 0); });
      var max = q || c ? 60 : 12, shown = hits.slice(0, max);
      n.textContent = q || c ? (hits.length ? "Found " + hits.length.toLocaleString("en-CA") + (hits.length > max ? ". Showing the first " + max + "." : ".") : "No names match that search.") : "A few of the names, by surname:";
      list.innerHTML = shown.map(function (m) {
        var cn = cname[m.cemetery_id] || m.cemetery_name || "", dt = dates(m);
        return '<li><a href="' + base + "/" + encodeURIComponent(m.id) + '"><b class="rm-name">' + esc(m.name) + (m.maiden_name ? ' <span class="rm-nee">(née ' + esc(m.maiden_name) + ")</span>" : "") + '</b></a><span class="rm-meta">' + (dt ? esc(dt) : '<span class="muted">Dates not recorded</span>') + (cn ? " · " + esc(cn) : "") + "</span>" + pill(m.tier) + "</li>";
      }).join("");
    }
    qi.addEventListener("input", draw); if (ci) ci.addEventListener("change", draw);
    $(".tt-rm-search", sec).addEventListener("submit", function (e) { e.preventDefault(); draw(); });
    draw();
  }

  /* ---------- 5: Sports & Teams on the town page (hidden when the town has no teams) ---------- */
  function champText(c) {
    if (c == null) return "";
    if (typeof c === "string" || typeof c === "number") return String(c);
    return [c.year || c.years || c.date, c.title || c.name || c.text].filter(Boolean).join(" — ");
  }
  var teamCache = {}, noTeams = {};
  function teamsBlock(t) {
    var view = $("#view"); if (!view || $("#tt-teams", view) || noTeams[t.slug]) return;
    var anchor = $("#tt-rm", view) || $("#history", view); if (!anchor) return;
    var sec = document.createElement("section");
    sec.className = "wrap stack"; sec.id = "tt-teams"; sec.hidden = true;
    anchor.parentNode.insertBefore(sec, anchor.nextSibling);
    teamCache[t.slug] = teamCache[t.slug] || Promise.all([
      get("teams?town=eq." + encodeURIComponent(t.slug) + "&select=id,name,sport,league,years_label,home_venue,championships,note,tier,source,source_url&order=sport,name"),
      get("athletes?town=eq." + encodeURIComponent(t.slug) + "&select=id,name,sport,level&order=name").catch(function () { return []; }),
    ]);
    teamCache[t.slug].then(function (both) {
      var rows = both[0], ath = both[1];
      if (!rows.length && !ath.length) noTeams[t.slug] = true;
      if (!sec.isConnected) return;
      if (!rows.length && !ath.length) return sec.remove();
      var by = {}, order = [];
      rows.forEach(function (r) { if (!by[r.sport]) { by[r.sport] = []; order.push(r.sport); } by[r.sport].push(r); });
      var tn = townName();
      sec.innerHTML = '<p class="eyebrow">Sports History</p><h2>' + esc(tn) + "'s sports history</h2>" +
        '<p class="muted">The teams that played for ' + esc(tn) + ', with the source for each. ' + pill("documented") + " from records, " + pill("community") + " from local memory.</p>" +
        (ath.length ? '<div class="tm-sport"><h3 class="tm-sport-h">Hometown athletes</h3><ul class="rm-names">' + ath.map(function (x) { return '<li><a href="/' + esc(t.slug) + "/sports#athlete-" + encodeURIComponent(x.id) + '"><b class="rm-name">' + esc(x.name) + '</b></a><span class="rm-meta">' + esc([x.sport, x.level].filter(Boolean).join(" · ")) + "</span></li>"; }).join("") + "</ul></div>" : "") +
        order.map(function (sp) {
          return '<div class="tm-sport"><h3 class="tm-sport-h">' + esc(sp) + '</h3><div class="tm-list">' + by[sp].map(function (r) {
            var ch = (Array.isArray(r.championships) ? r.championships : []).map(champText).filter(Boolean);
            var kv = [];
            if (r.league) kv.push("<dt>League</dt><dd>" + esc(r.league) + "</dd>");
            if (r.years_label) kv.push("<dt>Years</dt><dd>" + esc(r.years_label) + "</dd>");
            if (r.home_venue) kv.push("<dt>Home</dt><dd>" + esc(r.home_venue) + "</dd>");
            var u = /^https?:\/\//i.test(r.source_url || "") ? r.source_url : "";
            return '<article class="rm-cem tm-team"><h4>' + esc(r.name) + "</h4>" + (kv.length ? '<dl class="kv">' + kv.join("") + "</dl>" : "") +
              (ch.length ? '<div><b>Championships</b><ul class="tm-ch">' + ch.map(function (c) { return "<li>" + esc(c) + "</li>"; }).join("") + "</ul></div>" : "") +
              (r.note ? "<p>" + esc(r.note) + "</p>" : "") + "<p>" + pill(r.tier) + "</p>" +
              '<p class="rm-src"><b>Source:</b> ' + esc(r.source) + (u ? ' · <a href="' + esc(u) + '" rel="nofollow noopener" target="_blank">View source</a>' : "") + "</p></article>";
          }).join("") + "</div></div>";
        }).join("") +
        '<div class="btns"><a class="btn alt" href="/' + esc(t.slug) + '/sports">' + esc(tn) + "'s sports history page</a></div>" +
        '<p class="small">Something wrong or missing? <a href="#corrections">Tell us</a>.</p>';
      sec.hidden = false;
    }).catch(function () { noTeams[t.slug] = true; sec.remove(); });
  }

  /* ---------- 3: clippings on the Archive tab ---------- */
  function clipLabel(c) {
    if (!c.transcription) return '<p class="small muted">Transcription coming soon.</p>';
    return c.transcription_status === "transcribed"
      ? '<p class="cl-warn"><span class="rm-pill rm-ai">AI transcription — not yet verified.</span></p>'
      : '<p class="small"><span class="rm-pill rm-ver">Checked by a volunteer</span></p>';
  }
  function clipCard(c) {
    var title = [c.paper_name, c.date_label].filter(Boolean).join(", ") || "Newspaper clipping";
    return '<article class="cl-item"><div class="cl-img"><a href="' + esc(c.image_url) + '" target="_blank" rel="noopener"><img src="' + esc(c.image_url) + '" alt="Scan of ' + esc(title) + '" loading="lazy"></a></div>' +
      '<div class="cl-txt"><h3>' + esc(title) + "</h3>" + (c.description ? "<p>" + esc(c.description) + "</p>" : "") + clipLabel(c) +
      (c.transcription ? '<div class="cl-trans" tabindex="0" aria-label="Transcription">' + esc(c.transcription) + "</div>" : "") +
      '<p class="rm-src"><b>Source:</b> ' + esc(c.paper_name || "Newspaper clipping") + (c.date_label ? ", " + esc(c.date_label) : ", date unknown") + (c.submitter_name ? " · Shared by " + esc(c.submitter_name) : "") + "</p></div></article>";
  }
  function clipBlock(t) {
    var view = $("#view"); if (!view || $("#tt-cl", view)) return;
    var anchor = $("#history", view); if (!anchor) return;
    var sec = document.createElement("section");
    sec.className = "wrap stack"; sec.id = "tt-cl";
    var tn = townName();
    sec.innerHTML = '<p class="eyebrow">Newspaper clippings</p><h2>Clippings from ' + esc(tn) + '</h2><div id="tt-cl-list" class="cl-list"><p class="muted">Loading…</p></div>' + clipForm(t.slug, tn);
    anchor.parentNode.insertBefore(sec, anchor.nextSibling);
    get("clippings?town=eq." + encodeURIComponent(t.slug) + "&select=id,image_url,paper_name,date_label,submitter_name,description,transcription,transcription_status&order=created_at.desc").then(function (rows) {
      var l = $("#tt-cl-list", sec); if (!l) return;
      l.innerHTML = rows.length ? rows.map(clipCard).join("") : '<div class="empty">No clippings for ' + esc(tn) + " yet. Have one in a scrapbook or a drawer? A phone photo is all it takes.</div>";
    }).catch(function () { var l = $("#tt-cl-list", sec); if (l) l.innerHTML = ""; });
    wireClipForm(sec, t.slug);
  }
  function clipForm(slug, tn) {
    return '<details class="cl-form"' + (location.hash.indexOf("clip") >= 0 ? " open" : "") + '><summary class="btn">Share a newspaper clipping</summary>' +
      '<form class="formbox" data-tt-clipform novalidate style="margin-top:14px">' +
      '<p>Take a clear photo of the clipping, flat and in good light. We\'ll type out the words so they can be searched. Everything is checked before it appears.</p>' +
      '<div class="field"><label for="cl-file">Photo or scan of the clipping</label><input type="file" id="cl-file" name="file" accept="image/*"><div class="cl-prev" id="cl-prev"></div></div>' +
      '<div class="grid2"><div class="field"><label for="cl-paper">Newspaper <span class="hint">(if you know it)</span></label><input type="text" id="cl-paper" name="paper" placeholder="e.g. Wapella Post"></div>' +
      '<div class="field"><label for="cl-date">Date <span class="hint">(if you know it)</span></label><input type="text" id="cl-date" name="date" placeholder="e.g. June 1952"></div></div>' +
      '<div class="field"><label for="cl-desc">Who\'s in it, what it shows <span class="hint">(optional)</span></label><textarea id="cl-desc" name="desc"></textarea></div>' +
      '<div class="grid2"><div class="field"><label for="cl-name">Your name <span class="hint">(optional)</span></label><input type="text" id="cl-name" name="name"><span class="hint">Shown as "Shared by".</span></div>' +
      '<div class="field"><label for="cl-email">Your email <span class="hint">(optional)</span></label><input type="email" id="cl-email" name="email"><span class="hint">Never shown. Only if we have a question.</span></div></div>' +
      '<p class="err" id="cl-err" role="alert"></p><button class="btn" type="submit">Send the clipping</button></form><div id="cl-done" role="status"></div></details>';
  }
  // Shrink big phone photos before upload (also drops location data). Falls back to the original file.
  function shrink(file) {
    return new Promise(function (resolve) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return resolve(file);
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var max = 3000, w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
        var cv = document.createElement("canvas"); cv.width = Math.round(w * k); cv.height = Math.round(h * k);
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
        cv.toBlob(function (b) { resolve(b && b.size < file.size * 1.2 ? b : file); }, "image/jpeg", 0.88);
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }
  function wireClipForm(root, slug) {
    var f = $("[data-tt-clipform]", root); if (!f) return;
    var fi = $("#cl-file", f);
    fi.addEventListener("change", function () { var p = $("#cl-prev", f), x = fi.files[0]; p.innerHTML = x && /^image\//.test(x.type) ? '<img alt="Preview" src="' + URL.createObjectURL(x) + '">' : ""; });
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var err = $("#cl-err", f), btn = f.querySelector('button[type="submit"]'), file = fi.files[0];
      var v = function (n) { return String(f.elements[n].value || "").trim(); };
      err.textContent = "";
      if (!file) return (err.textContent = "Please choose a photo of the clipping.");
      if (!/^image\//.test(file.type)) return (err.textContent = "Please choose a photo (JPG or PNG).");
      if (file.size > 30 * 1024 * 1024) return (err.textContent = "That photo is very large. Please choose a smaller one.");
      if (v("email") && !okEmail(v("email"))) return (err.textContent = "That email address doesn't look right.");
      btn.disabled = true; btn.textContent = "Sending… please wait";
      shrink(file).then(function (blob) {
        if (blob.size > 15 * 1024 * 1024) throw Object.assign(new Error("That photo is too large (15 MB maximum)."), { user: 1 });
        var ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
        var path = slug + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + ext;
        return fetch(SB + "/storage/v1/object/clippings/" + path, { method: "POST", headers: H({ "Content-Type": blob.type || "image/jpeg" }), body: blob })
          .then(function (r) { if (!r.ok) throw new Error("upload"); return SB + "/storage/v1/object/public/clippings/" + path; });
      }).then(function (imageUrl) {
        return rpc("submit_clipping", { p_town: slug, p_image_url: imageUrl, p_paper_name: v("paper"), p_date_label: v("date"), p_description: v("desc"), p_submitter_name: v("name"), p_submitter_email: v("email") });
      }).then(function (r) {
        if (!r || !r.ok) throw Object.assign(new Error((r && r.error) || "Couldn't save that."), { user: 1 });
        f.hidden = true;
        $("#cl-done", root).innerHTML = '<div class="rm-ok"><h3>Thank you!</h3><p>Your clipping is in. We\'ll type out the words and check it, then it will appear here with your name on it.</p></div>';
      }).catch(function (e) { err.textContent = e && e.user ? e.message : "Couldn't send that just now. Please try again in a minute."; btn.disabled = false; btn.textContent = "Send the clipping"; });
    });
  }

  /* ---------- 4: admin review queue ---------- */
  function adminKey() { try { return sessionStorage.getItem("tt-admin") || ""; } catch (e) { return ""; } }
  function api(action, payload) {
    return fetch(SB + "/functions/v1/api/" + action, { method: "POST", headers: { "Content-Type": "application/json", "x-admin-key": adminKey() }, body: JSON.stringify(payload || {}) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "Request failed"); return j; }); });
  }
  function adminBlock() {
    var view = $("#view"); if (!view || $("#tt-adm", view) || !$("#adm-key", view)) return;
    var host = $("section", view); if (!host) return;
    var sec = document.createElement("section");
    sec.className = "wrap stack"; sec.id = "tt-adm";
    sec.innerHTML = '<h2>Remembrance and clippings</h2><p class="muted">Family submissions and newspaper clippings waiting for a look. Nothing here is public until you publish it.</p>' +
      '<div class="btns"><button class="btn sm" data-tt="rm-load">Load remembrance queue</button><button class="btn sm" data-tt="cl-load">Load clippings queue</button></div><div id="tt-adm-out" class="stack"></div>';
    host.parentNode.insertBefore(sec, host.nextSibling);
    sec.addEventListener("click", function (e) {
      var b = e.target.closest("[data-tt]"); if (!b) return;
      var a = b.getAttribute("data-tt"), out = $("#tt-adm-out", sec);
      if (a === "rm-load") return loadRm(out);
      if (a === "cl-load") return loadCl(out);
      var card = b.closest("[data-id]"), id = card && card.getAttribute("data-id");
      var fields = {}; $$("[data-f]", card).forEach(function (el) { fields[el.getAttribute("data-f")] = el.value; });
      var msg = $(".tt-msg", card);
      var done = function (t) { msg.textContent = t; msg.className = "tt-msg ok"; };
      var fail = function (er) { msg.textContent = er.message; msg.className = "tt-msg err"; };
      b.disabled = true;
      var p;
      if (a === "rm-pub" || a === "rm-ver") p = api("rem-moderate", { id: id, status: "published", tier: a === "rm-ver" ? "documented" : "community", patch: fields }).then(function () { card.remove(); });
      else if (a === "rm-dec") p = api("rem-moderate", { id: id, status: "declined" }).then(function () { card.remove(); });
      else if (a === "cl-save") p = api("clip-moderate", { id: id, patch: fields }).then(function (r) { done("Saved. Now: " + r.clipping.moderation + " / " + r.clipping.transcription_status); });
      else if (a === "cl-item-yes" || a === "cl-item-no") p = api("clip-item", { id: id, decision: a === "cl-item-yes" ? "approve" : "decline" }).then(function (r) { done(r.item_id ? "Added to the archive. The timeline will rebuild." : "Suggested entry declined."); });
      if (p) p.catch(fail).then(function () { b.disabled = false; });
    });
  }
  function inp(label, f, v, area) {
    return '<div class="field"><label>' + label + "</label>" + (area ? '<textarea data-f="' + f + '" rows="' + (area === 2 ? 10 : 3) + '">' + esc(v) + "</textarea>" : '<input type="text" data-f="' + f + '" value="' + esc(v) + '">') + "</div>";
  }
  function loadRm(out) {
    out.innerHTML = '<p class="muted">Loading…</p>';
    api("rem-queue").then(function (r) {
      out.innerHTML = r.memorials.length ? "<h3>Remembrance: " + r.memorials.length + " waiting</h3>" + r.memorials.map(function (m) {
        var s = m.submission || {};
        return '<div class="qitem" data-id="' + esc(m.id) + '"><div class="top"><h3>' + esc(m.name) + '</h3><span class="pill new">' + esc(m.town) + "</span></div>" +
          '<dl class="kv"><dt>From</dt><dd>' + esc(s.submitter_name || "?") + (s.relationship ? " (" + esc(s.relationship) + ")" : "") + " · " + esc(s.submitter_email || "") + "</dd><dt>How they know</dt><dd>" + esc(s.attestation || "") + "</dd><dt>Cemetery</dt><dd>" + esc(m.cemetery_name || "Not sure") + "</dd></dl>" +
          '<div class="grid2">' + inp("Name", "name", m.name) + inp("Maiden name", "maiden_name", m.maiden_name) + inp("Born", "birth_date_label", m.birth_date_label) + inp("Birth place", "birth_place", m.birth_place) + inp("Died", "death_date_label", m.death_date_label) + inp("Death place", "death_place", m.death_place) + "</div>" +
          inp("Note", "note", m.note, 1) + inp("Source (shown publicly)", "source", m.source) + inp("Source link (optional)", "source_url", m.source_url) +
          '<div class="btns"><button class="btn sm" data-tt="rm-pub">Publish as Community Memory</button><button class="btn sm alt" data-tt="rm-ver">Publish as Verified</button><button class="btn sm alt" data-tt="rm-dec">Decline</button></div><p class="tt-msg" role="status"></p></div>';
      }).join("") : '<div class="empty">No remembrance entries waiting.</div>';
    }).catch(function (e) { out.innerHTML = '<div class="notice warn"><p>' + esc(e.message) + ". Check the admin key above.</p></div>"; });
  }
  function sel(f, v, opts) { return '<select data-f="' + f + '">' + opts.map(function (o) { return '<option value="' + o + '"' + (o === v ? " selected" : "") + ">" + o + "</option>"; }).join("") + "</select>"; }
  function loadCl(out) {
    out.innerHTML = '<p class="muted">Loading…</p>';
    api("clip-queue").then(function (r) {
      out.innerHTML = r.clippings.length ? "<h3>Clippings: " + r.clippings.length + " in progress</h3>" + r.clippings.map(function (c) {
        var pi = c.proposed_item;
        return '<div class="qitem" data-id="' + esc(c.id) + '"><div class="top"><h3>' + esc([c.paper_name, c.date_label].filter(Boolean).join(", ") || "Clipping") + '</h3><span class="pill new">' + esc(c.town) + "</span></div>" +
          '<a href="' + esc(c.image_url) + '" target="_blank" rel="noopener"><img src="' + esc(c.image_url) + '" alt="" style="max-height:360px"></a>' +
          '<dl class="kv"><dt>From</dt><dd>' + esc(c.submitter_name || "Anonymous") + (c.submitter_email ? " · " + esc(c.submitter_email) : "") + "</dd></dl>" +
          '<div class="grid2">' + inp("Newspaper", "paper_name", c.paper_name) + inp("Date", "date_label", c.date_label) + "</div>" + inp("Description", "description", c.description, 1) + inp("Transcription", "transcription", c.transcription, 2) +
          '<div class="grid2"><div class="field"><label>Clipping</label>' + sel("moderation", c.moderation, ["pending", "approved", "declined"]) + '</div><div class="field"><label>Transcription stage</label>' + sel("transcription_status", c.transcription_status, ["uploaded", "transcribed", "checked", "published"]) + "</div></div>" +
          '<p class="small muted">The public sees a clipping once it is <b>approved</b> and at least <b>transcribed</b>. "Transcribed" shows the label "AI transcription — not yet verified."</p>' +
          '<div class="btns"><button class="btn sm" data-tt="cl-save">Save</button></div>' +
          (pi ? '<div class="notice info"><b>Suggested timeline entry (' + esc(c.proposed_item_status) + ")</b><p><b>" + esc(pi.title || "") + "</b> " + esc(pi.date_label || pi.year || "") + "</p><p>" + esc(pi.body || "") + '</p><p class="small">Source: ' + esc(pi.source || "") + '</p><div class="btns"><button class="btn sm" data-tt="cl-item-yes">Add to archive</button><button class="btn sm alt" data-tt="cl-item-no">Decline</button></div></div>' : "") +
          '<p class="tt-msg" role="status"></p></div>';
      }).join("") : '<div class="empty">No clippings in progress.</div>';
    }).catch(function (e) { out.innerHTML = '<div class="notice warn"><p>' + esc(e.message) + ". Check the admin key above.</p></div>"; });
  }

  /* ---------- hook into the app ---------- */
  function onView() {
    try {
      var h = (location.hash || "").slice(1);
      if (h === "admin") return adminBlock();
      var t = currentTown(); if (!t) return;
      if (t.archive) clipBlock(t); else { rmBlock(t); teamsBlock(t); bookBlock(t); }
    } catch (e) { if (window.console) console.error("towntales-extra", e); }
  }
  function boot() {
    try { wireIndexFilter(); } catch (e) {}
    $$("[data-tt-memform]").forEach(function (f) { try { wireMemForm(f); } catch (e) {} });
    $$("[data-tt-contact]").forEach(function (f) { try { wireContact(f); } catch (e) {} });
    $$("[data-tt-bookform]").forEach(function (f) { try { wireBookForm(f); } catch (e) {} });
    var v = $("#view");
    if (v && !$(".rm", v)) {
      new MutationObserver(function () { onView(); }).observe(v, { childList: true });
      onView();
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
