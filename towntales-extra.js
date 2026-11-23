/* TownTales add-ons (loaded on every page, after the app):
   1. Cemetery & Remembrance block on each town page (+ live search on /<town>/remembrance)
   2. Family "add someone" form (on /<town>/remembrance)
   3. Newspaper clippings on each town's Archive tab, with an upload form
   4. Remembrance + clippings review queue on the #admin page
   5. Sports & Teams on each town page (only when the town has teams)
   6. Honour Pages: order form (photos + story → Stripe), offer after a family adds someone, admin review queue
   9. Train start: lands on the signed-in visitor's home town, else the stop matching their location
   8. Whole-book upload (/share-a-book): many page photos at once → private book-pages bucket; admin "Book uploads" queue
   7. Homepage "Recently remembered" carousel (Honour Pages first, then the newest names, max 3 per town)
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
    // Nov 23 2026: the page shows 20 random names; searching submits to the server, which searches all of them.
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
        var hn = f.getAttribute("data-honour") && r.id ? '<div class="hn-offer hn-after"><p class="eyebrow">Want to do more?</p><h3>Give ' + esc(v("name")) + ' an Honour Page</h3><p>Add family photos and their life story to their page, with "Placed by" your family and a certificate to print. One time, no subscription.</p><div class="btns"><a class="btn" href="/' + encodeURIComponent(f.getAttribute("data-town")) + '/remembrance/' + encodeURIComponent(r.id) + '/honour">Add photos and their story</a></div></div>' : "";
        $("#mf-done").innerHTML = '<div class="rm-ok"><h3>Thank you.</h3><p>We\'ve received ' + esc(v("name")) + '. A volunteer will look it over, usually within a few days, and then it will appear here as Community Memory with you named as the source.</p><p><a href="" data-act="mf-again">Add another person</a></p></div>' + hn;
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
        body: JSON.stringify({ town: f.getAttribute("data-town"), name: v("name").slice(0, 120), email: v("email").slice(0, 200).toLowerCase(), format: v("format"), copies: parseInt(v("copies"), 10) || 1, updates_ok: f.elements.updates.type === "hidden" ? true : !!f.elements.updates.checked }) })
        .then(function (r) { if (!r.ok) throw new Error("save"); f.hidden = true; $("#bk-done").innerHTML = f.getAttribute("data-waitlist") ? '<div class="rm-ok"><h3>You\'re on the list.</h3><p>Thank you. We\'ll email you when this town\'s book is ready.</p></div>' : '<div class="rm-ok"><h3>You\'re on the list.</h3><p>Thank you. We\'ll email you the price and let you know when your copy is ready to order.</p></div>'; })
        .catch(function () { err.textContent = "Couldn't send that just now. Please try again in a minute."; btn.disabled = false; btn.textContent = "Request my copy"; });
    });
  }
  function bookBlock(t) {
    var view = $("#view"); if (!view || !BOOK_TOWNS[t.slug] || $("#tt-book", view)) return;
    var anchor = $("#history", view); if (!anchor) return;
    var tn = townName(), sec = document.createElement("section");
    sec.className = "wrap"; sec.id = "tt-book";
    sec.innerHTML = '<div class="grow" style="max-width:none"><p class="eyebrow">The ' + esc(tn) + ' Book</p><h2>Get the ' + esc(tn) + ' Book</h2><p>' + esc(tn) + "'s history in one book: the timeline, the people, the cemeteries and the teams, with every source. See a free sample first.</p>" +
      '<div class="btns"><a class="btn" href="/' + esc(t.slug) + '/book/preview">Look inside the book</a><a class="btn alt" href="/' + esc(t.slug) + '/book#order">Order a copy</a></div></div>';
    anchor.parentNode.insertBefore(sec, anchor);
  }

  /* ---------- copy-to-clipboard (contact page email) ---------- */
  function copyText(t) {
    var say = function (ok) {
      var m = $(".ct-copied"); if (m) m.textContent = ok ? "Copied! Paste it into a new email." : "Couldn't copy. Please select the address and copy it.";
      $$(".ct-copy").forEach(function (b) { b.textContent = ok ? "Copied!" : "Copy"; setTimeout(function () { b.textContent = "Copy"; }, 2500); });
    };
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t).then(function () { say(true); }, function () { say(fallback(t)); });
    say(fallback(t));
  }
  function fallback(t) {
    try { var ta = document.createElement("textarea"); ta.value = t; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); var ok = document.execCommand("copy"); ta.remove(); return ok; } catch (e) { return false; }
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
    // Nov 23 2026: never load every name. Count + a random 12; searches run in the database.
    memCache[slug] = Promise.all([
      get("cemeteries?town=eq." + s + "&select=id,name,location_desc,affiliation&order=name"),
      rpc("memorials_summary", { p_town: slug }),
      rpc("memorials_sample", { p_town: slug, p_n: 12 }),
    ]).then(function (r) { var bySur = function (a, b) { return surnameKey(a.name).localeCompare(surnameKey(b.name)); }; return { cems: r[0], total: Number(r[1] && r[1].total) || 0, sample: (r[2] || []).sort(bySur), bySur: bySur }; })
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
    if (!d.total && !d.cems.length) {
      sec.innerHTML = '<p class="eyebrow">Cemetery &amp; Remembrance</p><h2>Remembering the people of ' + esc(tn) + '</h2>' +
        '<p>No names have been added for ' + esc(tn) + ' yet. If someone from your family rests here, you can be the first to add them. Every entry is checked by a volunteer and credited to you.</p>' +
        '<div class="btns"><a class="btn" href="' + base + '/add">Add a family member</a></div>';
      return;
    }
    var cname = {}; d.cems.forEach(function (c) { cname[c.id] = c.name; });
    sec.innerHTML = '<p class="eyebrow">Cemetery &amp; Remembrance</p><h2>Remembering the people of ' + esc(tn) + '</h2>' +
      '<p>' + (d.total === 1 ? "One person is" : d.total.toLocaleString("en-CA") + " people are") + ' remembered here' + (d.cems.length ? ", in " + d.cems.map(function (c) { return esc(c.name); }).join(", ").replace(/, ([^,]*)$/, " and $1") : "") + '. Every name carries its source: ' + pill("documented") + ' from records, ' + pill("community") + ' from families.</p>' +
      '<form class="tt-rm-search" role="search"><div class="field"><label for="tt-rm-q">Search by name</label><input type="search" id="tt-rm-q" placeholder="e.g. Anderson" autocomplete="off"></div>' +
      (d.cems.length > 1 ? '<div class="field"><label for="tt-rm-c">Cemetery</label><select id="tt-rm-c"><option value="">All cemeteries</option>' + d.cems.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.name) + "</option>"; }).join("") + "</select></div>" : "") +
      '</form><p class="small muted" id="tt-rm-n" role="status"></p><ul class="rm-names" id="tt-rm-list"></ul>' +
      '<div class="btns"><a class="btn" href="' + base + '">See the names and the cemeteries</a><a class="btn alt" href="' + base + '/add">Add someone from your family</a></div>';
    var qi = $("#tt-rm-q", sec), ci = $("#tt-rm-c", sec), list = $("#tt-rm-list", sec), n = $("#tt-rm-n", sec);
    var seq = 0, timer = 0;
    function draw() {
      var q = String(qi.value || "").trim(), c = ci ? ci.value : "";
      if (!q && !c) { n.textContent = d.total > d.sample.length ? "A few of the names, picked at random:" : "The names, by surname:"; paint(d.sample); return; }
      var my = ++seq; n.textContent = "Searching…";
      rpc("memorials_search", { p_town: slug, p_q: q, p_cem: c || null, p_limit: 60 }).then(function (r) {
        if (my !== seq) return;
        var rows = (r.rows || []).sort(d.bySur), t = Number(r.total) || 0;
        n.textContent = t ? "Found " + t.toLocaleString("en-CA") + (t > rows.length ? ". Showing the first " + rows.length + "." : ".") : "No names match that search.";
        paint(rows);
      }, function () { if (my === seq) n.textContent = "Search isn't working right now. Please try again."; });
    }
    function paint(shown) {
      list.innerHTML = shown.map(function (m) {
        var cn = cname[m.cemetery_id] || m.cemetery_name || "", dt = dates(m);
        return '<li><a href="' + base + "/" + encodeURIComponent(m.id) + '"><b class="rm-name">' + esc(m.name) + (m.maiden_name ? ' <span class="rm-nee">(née ' + esc(m.maiden_name) + ")</span>" : "") + '</b></a><span class="rm-meta">' + (dt ? esc(dt) : '<span class="muted">Dates not recorded</span>') + (cn ? " · " + esc(cn) : "") + "</span>" + pill(m.tier) + "</li>";
      }).join("");
    }
    qi.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(draw, 300); }); if (ci) ci.addEventListener("change", draw);
    $(".tt-rm-search", sec).addEventListener("submit", function (e) { e.preventDefault(); clearTimeout(timer); draw(); });
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

  /* ---------- 6: Honour Page order form (/<town>/remembrance/<id>/honour) ---------- */
  function wireHonourForm(f) {
    if (f.getAttribute("data-wired")) return; f.setAttribute("data-wired", "1");
    var fi = $("#hn-files", f), prev = $("#hn-prev", f), picked = [];
    function draw() {
      prev.innerHTML = picked.map(function (p, i) {
        return '<div class="hn-pic"><img alt="" src="' + p.preview + '"><div class="field"><label for="hn-cap-' + i + '">Caption <span class="hint">(optional)</span></label><input type="text" id="hn-cap-' + i + '" data-cap="' + i + '" maxlength="200" value="' + esc(p.caption) + '" placeholder="e.g. Harvest, 1948"></div><button type="button" class="btn sm alt" data-rm="' + i + '">Remove</button></div>';
      }).join("");
    }
    fi.addEventListener("change", function () {
      Array.prototype.slice.call(fi.files).forEach(function (x) { if (/^image\//.test(x.type) && picked.length < 6) picked.push({ file: x, preview: URL.createObjectURL(x), caption: "" }); });
      fi.value = ""; draw();
    });
    prev.addEventListener("input", function (e) { var i = e.target.getAttribute("data-cap"); if (i != null) picked[+i].caption = e.target.value; });
    prev.addEventListener("click", function (e) { var i = e.target.getAttribute("data-rm"); if (i != null) { picked.splice(+i, 1); draw(); } });
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var v = function (n) { var el = f.elements[n]; return el ? String(el.value || "").trim() : ""; };
      var err = $("#hn-err", f), btn = f.querySelector('button[type="submit"]'), mem = f.getAttribute("data-mem");
      err.textContent = "";
      if (!v("story") && !picked.length) return (err.textContent = "Please add their story or at least one photo.");
      if (!v("name")) return (err.textContent = "Please enter your name.");
      if (!okEmail(v("email"))) return (err.textContent = "Please enter a working email address. It's never shown.");
      if (!f.elements.ok.checked) return (err.textContent = "Please tick the box to confirm you can share these.");
      btn.disabled = true; btn.textContent = picked.length ? "Uploading photos…" : "One moment…";
      var urls = [];
      var chain = Promise.resolve();
      picked.forEach(function (p) {
        chain = chain.then(function () { return shrink(p.file); }).then(function (blob) {
          if (blob.size > 15 * 1024 * 1024) throw Object.assign(new Error("One of the photos is too large (15 MB maximum)."), { user: 1 });
          var ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
          var path = mem + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + ext;
          return fetch(SB + "/storage/v1/object/honour/" + path, { method: "POST", headers: H({ "Content-Type": blob.type || "image/jpeg" }), body: blob })
            .then(function (r) { if (!r.ok) throw new Error("upload"); urls.push({ url: SB + "/storage/v1/object/public/honour/" + path, caption: p.caption.trim() }); });
        });
      });
      chain.then(function () {
        return rpc("submit_honour", { p_memorial_id: mem, p_story: v("story"), p_photos: urls, p_placed_by: v("by"), p_purchaser_name: v("name"), p_purchaser_email: v("email"), p_relationship: v("rel") });
      }).then(function (r) {
        if (!r || !r.ok) throw Object.assign(new Error((r && r.error) || "Couldn't save that."), { user: 1 });
        btn.textContent = "Opening secure payment…";
        location.href = f.getAttribute("data-link") + "?client_reference_id=" + encodeURIComponent(r.id) + "&prefilled_email=" + encodeURIComponent(v("email"));
      }).catch(function (e) { err.textContent = e && e.user ? e.message : "Couldn't send that just now. Please try again in a minute."; btn.disabled = false; btn.textContent = "Continue to payment"; });
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
      '<div class="btns"><button class="btn sm" data-tt="rm-load">Load remembrance queue</button><button class="btn sm" data-tt="cl-load">Load clippings queue</button><button class="btn sm" data-tt="hn-load">Load Honour Pages</button><button class="btn sm" data-tt="bk-load">Load book uploads</button></div><div id="tt-adm-out" class="stack"></div>';
    host.parentNode.insertBefore(sec, host.nextSibling);
    linksBlock(sec);
    sec.addEventListener("click", function (e) {
      var b = e.target.closest("[data-tt]"); if (!b) return;
      var a = b.getAttribute("data-tt"), out = $("#tt-adm-out", sec);
      if (a === "rm-load") return loadRm(out);
      if (a === "cl-load") return loadCl(out);
      if (a === "hn-load") return loadHn(out);
      if (a === "bk-load") return loadBk(out);
      if (a === "bk-all") { e.preventDefault(); return loadBk(out, true); }
      if (a === "bk-pages" || a === "bk-set") return bkAct(b, a);
      if (a.indexOf("hn-") === 0) return hnAct(b, a);
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

  /* ---------- 4b: AI link reader (admin) ---------- */
  function linksBlock(after) {
    var sec = document.createElement("section");
    sec.className = "wrap stack"; sec.id = "tt-links";
    sec.innerHTML = '<h2>Read links with AI</h2>' +
      '<p class="muted">Paste web pages about one town (museum pages, RM histories, old newspaper archives, Wikipedia). The AI reads each page and lines up dated facts, in its own words, each sourced to that page. They land in the review queue above as <b>pending</b>. Nothing goes public until you publish it. Photos are never taken.</p>' +
      '<div class="field"><label>Town</label><input type="text" id="lk-town" list="lk-towns" placeholder="Start typing a town, e.g. Wapella"><datalist id="lk-towns"></datalist></div>' +
      '<div class="field"><label>Links (one per line)</label><textarea id="lk-urls" rows="6" placeholder="https://..."></textarea></div>' +
      '<div class="btns"><button class="btn sm" data-lk="go">Read these links</button><button class="btn sm alt" data-lk="visitors">Check links visitors shared</button></div>' +
      '<p class="small muted" id="lk-cap"></p><div id="lk-out" class="stack"></div>';
    after.parentNode.insertBefore(sec, after.nextSibling);
    var towns = [];
    get("towns?select=slug,name,prov&order=name,slug", true).then(function (rows) {
      towns = rows || [];
      $("#lk-towns", sec).innerHTML = towns.map(function (t) { return '<option value="' + esc(t.name + ", " + t.prov) + '">'; }).join("");
    }).catch(function () {});
    function townSlug(v) {
      v = (v || "").trim().toLowerCase(); if (!v) return "";
      for (var i = 0; i < towns.length; i++) { var t = towns[i]; if ((t.name + ", " + t.prov).toLowerCase() === v || t.slug === v || t.name.toLowerCase() === v) return t.slug; }
      return "";
    }
    var out = $("#lk-out", sec), cap = $("#lk-cap", sec);
    function status() { return api("links-status").then(function (r) { cap.textContent = r.used_today + " of " + r.cap + " links read in the last 24 hours."; return r; }); }
    function row(label) { var d = document.createElement("div"); d.className = "qitem"; d.innerHTML = '<p class="small" style="word-break:break-all">' + esc(label) + '</p><p class="tt-msg" role="status">Waiting…</p>'; out.appendChild(d); return $(".tt-msg", d); }
    function runAll(jobs, btn) {
      btn.disabled = true; var total = 0, i = 0;
      (function next() {
        if (i >= jobs.length) {
          btn.disabled = false; status().catch(function () {});
          var s = document.createElement("div"); s.className = "notice ok";
          s.innerHTML = "<p><b>Done.</b> " + total + " facts are waiting in the review queue. Scroll up and press <b>Load queue</b> to check and publish them.</p>";
          out.appendChild(s); return;
        }
        var j = jobs[i++]; j.msg.textContent = "Reading… (about 20 to 40 seconds)"; j.msg.className = "tt-msg";
        api("read-link", j.payload).then(function (r) {
          total += r.facts || 0; j.msg.textContent = r.note || "Done."; j.msg.className = "tt-msg " + (r.ok === false ? "err" : "ok");
        }).catch(function (e) { j.msg.textContent = e.message; j.msg.className = "tt-msg err"; if (/limit/i.test(e.message)) i = jobs.length; }).then(next);
      })();
    }
    sec.addEventListener("click", function (e) {
      var b = e.target.closest("[data-lk]"); if (!b) return;
      if (!adminKey()) { out.innerHTML = '<div class="notice warn"><p>Enter the admin key at the top of this page first.</p></div>'; return; }
      var a = b.getAttribute("data-lk");
      if (a === "go") {
        var slug = townSlug($("#lk-town", sec).value);
        if (!slug) { out.innerHTML = '<div class="notice warn"><p>Pick a town from the list.</p></div>'; return; }
        var urls = $("#lk-urls", sec).value.split(/\s+/).map(function (u) { return u.trim(); }).filter(function (u) { return /^https?:\/\/\S+\.\S+/i.test(u); });
        urls = urls.filter(function (u, k) { return urls.indexOf(u) === k; }).slice(0, 25);
        if (!urls.length) { out.innerHTML = '<div class="notice warn"><p>Paste at least one link starting with https://</p></div>'; return; }
        out.innerHTML = "";
        runAll(urls.map(function (u) { return { payload: { town: slug, url: u }, msg: row(u) }; }), b);
      }
      if (a === "visitors") {
        out.innerHTML = '<p class="muted">Checking…</p>';
        status().then(function (r) {
          var L = r.visitor_links || []; out.innerHTML = "";
          if (!L.length) { out.innerHTML = '<div class="empty">No new links from visitors.</div>'; return; }
          var h = document.createElement("h3"); h.textContent = L.length + " visitor link" + (L.length > 1 ? "s" : "") + " to read"; out.appendChild(h);
          runAll(L.map(function (l) { return { payload: { town: l.town, url: l.source_url, item_id: l.id }, msg: row(l.town + " · " + (l.contributor || "Anonymous") + " · " + l.source_url) }; }), b);
        }).catch(function (er) { out.innerHTML = '<div class="notice warn"><p>' + esc(er.message) + ". Check the admin key above.</p></div>"; });
      }
    });
    if (adminKey()) status().catch(function () {});
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

  /* ---------- 6b: Honour Pages admin queue ---------- */
  function money(o) { return o && o.amount_cents != null ? "$" + (o.amount_cents / 100).toFixed(2) + " " + String(o.currency || "").toUpperCase() : ""; }
  function loadHn(out) {
    out.innerHTML = '<p class="muted">Loading…</p>';
    api("honour-queue", { all: true }).then(function (r) {
      var rows = r.honour || [];
      if (!rows.length) { out.innerHTML = '<div class="empty">No Honour Pages waiting.</div>'; return; }
      out.innerHTML = '<h3>Honour Pages (' + rows.length + ')</h3><p class="small muted">"Paid" ones are ready for you. "Waiting for payment" means they filled the form but haven\'t paid (yet).</p>' + rows.map(function (h) {
        var m = h.memorial || {}, o = h.order || {}, paid = h.status === "paid";
        var photos = (h.photos || []).map(function (p, i) { return '<label class="hn-adm-pic"><img alt="" src="' + esc(p.url) + '"><span><input type="checkbox" data-keep="' + i + '" checked> Keep</span><input type="text" data-capx="' + i + '" value="' + esc(p.caption || "") + '" placeholder="Caption"><input type="hidden" data-urlx="' + i + '" value="' + esc(p.url) + '"></label>'; }).join("");
        return '<div class="formbox stack" data-id="' + esc(h.id) + '" style="gap:10px">' +
          '<p><b>' + (paid ? '<span class="rm-pill rm-ver">Paid ' + esc(money(o)) + '</span>' : '<span class="rm-pill rm-mem">Waiting for payment</span>') + '</b> ' +
          '<a href="/' + esc(m.town || h.town) + '/remembrance/' + encodeURIComponent(h.memorial_id) + '" target="_blank" rel="noopener"><b>' + esc(m.name || h.memorial_id) + '</b></a> ' + esc(dates(m)) + (m.status !== "published" ? ' <span class="rm-pill rm-mem">record not published yet</span>' : '') + '</p>' +
          '<p class="small">From <b>' + esc(o.purchaser_name || "") + '</b>' + (o.relationship ? " (" + esc(o.relationship) + ")" : "") + ' · <a href="mailto:' + esc(o.purchaser_email || "") + '">' + esc(o.purchaser_email || "") + '</a> · ' + esc(new Date(h.created_at).toLocaleString("en-CA")) + '</p>' +
          '<div class="field"><label>Placed by</label><input type="text" data-hf="placed_by" value="' + esc(h.placed_by || "") + '"></div>' +
          '<div class="field"><label>Story</label><textarea data-hf="story" rows="8">' + esc(h.story || "") + '</textarea></div>' +
          (photos ? '<div class="hn-adm-pics">' + photos + '</div>' : '<p class="small muted">No photos.</p>') +
          '<div class="btns">' + (paid ? '<button class="btn sm" data-tt="hn-publish">Publish</button>' : '<button class="btn sm alt" data-tt="hn-mark-paid">Mark paid (paid another way)</button>') +
          '<button class="btn sm alt" data-tt="hn-comp">Publish free</button><button class="btn sm alt" data-tt="hn-save">Save edits</button><button class="btn sm alt" data-tt="hn-decline">Decline</button></div>' +
          '<p class="tt-msg" role="status"></p></div>';
      }).join("");
    }).catch(function (e) { out.innerHTML = '<div class="notice warn"><p>' + esc(e.message) + ". Check the admin key above.</p></div>"; });
  }
  function hnAct(b, a) {
    var card = b.closest("[data-id]"), msg = $(".tt-msg", card), act = a.slice(3);
    if (act === "decline" && !confirm("Decline this Honour Page? If they paid, refund them in Stripe.")) return;
    var patch = { story: $('[data-hf="story"]', card).value, placed_by: $('[data-hf="placed_by"]', card).value, photos: [] };
    $$("[data-keep]", card).forEach(function (k) { var i = k.getAttribute("data-keep"); if (k.checked) patch.photos.push({ url: $('[data-urlx="' + i + '"]', card).value, caption: $('[data-capx="' + i + '"]', card).value }); });
    var final = false;
    b.disabled = true;
    api("honour-moderate", { id: card.getAttribute("data-id"), action: act, patch: patch }).then(function (r) {
      msg.className = "tt-msg ok"; final = r.status === "published" || r.status === "declined";
      msg.textContent = r.status === "published" ? "Published. It shows on their page within about 10 minutes. Email the family to let them know." : r.status === "declined" ? "Declined." : r.status === "paid" ? "Marked paid. You can publish it now." : "Saved.";
      if (final) $$("button", card).forEach(function (x) { x.disabled = true; });
      if (r.status === "paid" && act === "mark-paid") loadHn($("#tt-adm-out"));
    }).catch(function (e) { msg.className = "tt-msg err"; msg.textContent = e.message; }).then(function () { if (!final) b.disabled = false; });
  }

  /* ---------- 7: homepage "Recently remembered" carousel ---------- */
  var recentP = null;
  function loadRecent() {
    if (recentP) return recentP;
    recentP = Promise.all([
      get("honour_pages?status=eq.published&select=memorial_id,photos,placed_by,published_at&order=published_at.desc&limit=6"),
      get("memorials?status=eq.published&select=id,town,name,maiden_name,birth_date_label,death_date_label,created_at&order=created_at.desc&limit=80"),
    ]).then(function (r) {
      var hon = r[0], mems = r[1], byId = {}, picked = [], perTown = {};
      mems.forEach(function (m) { byId[m.id] = m; });
      var hid = hon.map(function (h) { return h.memorial_id; }).filter(function (id) { return !byId[id]; });
      return (hid.length ? get("memorials?status=eq.published&id=in.(" + hid.map(encodeURIComponent).join(",") + ")&select=id,town,name,maiden_name,birth_date_label,death_date_label,created_at") : Promise.resolve([])).then(function (extra) {
        extra.forEach(function (m) { byId[m.id] = m; });
        hon.forEach(function (h) { var m = byId[h.memorial_id]; if (m) { m.honour = h; picked.push(m); } });
        var seen = {}; picked.forEach(function (m) { seen[m.id] = 1; });
        mems.forEach(function (m) {
          if (picked.length >= 14 || seen[m.id]) return;
          perTown[m.town] = (perTown[m.town] || 0) + 1;
          if (perTown[m.town] > 3) return; // one cemetery upload shouldn't fill the whole row
          seen[m.id] = 1; picked.push(m);
        });
        var towns = picked.map(function (m) { return m.town; }).filter(function (t, i, a) { return a.indexOf(t) === i; });
        return (towns.length ? get("towns?slug=in.(" + towns.map(encodeURIComponent).join(",") + ")&select=slug,name,prov") : Promise.resolve([])).then(function (ts) {
          var tn = {}; ts.forEach(function (t) { tn[t.slug] = t.name + ", " + t.prov; });
          picked.forEach(function (m) { m.townLabel = tn[m.town] || ""; });
          return picked;
        });
      });
    }).catch(function () { recentP = null; return []; });
    return recentP;
  }
  function recentBlock() {
    var view = $("#view"), grow = view && $("#grow", view);
    if (!grow || $("#tt-recent", view)) return;
    var sec = document.createElement("section");
    sec.id = "tt-recent"; sec.className = "wrap stack rc"; sec.hidden = true;
    grow.parentNode.insertBefore(sec, grow);
    loadRecent().then(function (list) {
      if (list.length < 3 || !sec.isConnected) return; // not enough to make a row yet
      var cards = list.map(function (m) {
        var href = "/" + encodeURIComponent(m.town) + "/remembrance/" + encodeURIComponent(m.id);
        var ph = m.honour && (m.honour.photos || [])[0];
        var d = dates(m);
        return '<li class="rc-card' + (m.honour ? " rc-hon" : "") + '"><a href="' + href + '">' +
          (ph ? '<img src="' + esc(ph.url) + '" alt="" loading="lazy">' : '<span class="rc-mark" aria-hidden="true">❦</span>') +
          '<span class="rc-body"><span class="rc-name">' + esc(m.name) + (m.maiden_name ? ' <span class="rc-nee">(née ' + esc(m.maiden_name) + ")</span>" : "") + "</span>" +
          (d ? '<span class="rc-dates">' + esc(d) + "</span>" : "") +
          (m.townLabel ? '<span class="rc-town">' + esc(m.townLabel) + "</span>" : "") +
          (m.honour ? '<span class="hn-badge">Honour Page</span>' : "") + "</span></a></li>";
      }).join("");
      sec.innerHTML = '<div class="rc-head"><div><p class="eyebrow">Cemetery &amp; Remembrance</p><h2>Recently remembered</h2><p class="small muted">People just added to their town\'s pages by families and volunteers.</p></div>' +
        '<div class="rc-nav"><button type="button" class="btn sm alt" data-rc="-1" aria-label="Scroll back">←</button><button type="button" class="btn sm alt" data-rc="1" aria-label="Scroll forward">→</button></div></div>' +
        '<ul class="rc-track" tabindex="0" aria-label="Recently remembered people">' + cards +
        '<li class="rc-card rc-add"><a href="#towns"><span class="rc-body"><span class="rc-name">Add someone you remember</span><span class="rc-town">Find their town, then open Cemetery &amp; Remembrance. It\'s free.</span></span></a></li></ul>';
      sec.hidden = false;
      var tr = $(".rc-track", sec);
      sec.addEventListener("click", function (e) {
        var b = e.target.closest("[data-rc]"); if (!b) return;
        tr.scrollBy({ left: +b.getAttribute("data-rc") * Math.max(240, tr.clientWidth * 0.8), behavior: "smooth" });
      });
    });
  }

  /* ---------- 8: whole-book upload (/share-a-book) ---------- */
  function bookOrder(files) {
    var list = Array.prototype.slice.call(files);
    // Camera names (IMG_1234, PXL_20261121_…) sort in the order they were taken; otherwise keep the order picked.
    var numbered = list.length > 1 && list.every(function (f) { return /\d{3,}/.test(f.name); });
    if (numbered) list.sort(function (a, b) { return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }); });
    return list;
  }
  function wireBookUpload(f) {
    if (f.getAttribute("data-wired")) return; f.setAttribute("data-wired", "1");
    var fi = $("#bk-files", f), count = $("#bk-count", f);
    fi.addEventListener("change", function () {
      var n = fi.files.length, mb = 0; for (var i = 0; i < n; i++) mb += fi.files[i].size / 1048576;
      count.textContent = n ? n + (n === 1 ? " file" : " pages") + " chosen" + (mb >= 1 ? " (" + Math.round(mb) + " MB)" : "") : "";
    });
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var v = function (n) { var el = f.elements[n]; return el ? String(el.value || "").trim() : ""; };
      var err = $("#bk-err", f), btn = f.querySelector('button[type="submit"]'), prog = $("#bk-prog", f), bar = $("#bk-bar", f), st = $("#bk-status", f);
      var files = bookOrder(fi.files);
      err.textContent = "";
      if (!v("town")) return (err.textContent = "Please choose the town.");
      if (!v("title")) return (err.textContent = "Please enter the book's title.");
      if (!files.length) return (err.textContent = "Please choose the photos of the pages.");
      if (files.length > 2000) return (err.textContent = "That's more than 2,000 files. Please email us and we'll help.");
      if (!v("name")) return (err.textContent = "Please enter your name.");
      if (!okEmail(v("email"))) return (err.textContent = "Please enter a working email address. It's never shown.");
      var perm = (f.querySelector('input[name="perm"]:checked') || {}).value || "unsure";
      btn.disabled = true; btn.textContent = "Sending…"; prog.hidden = false; st.textContent = "Getting ready…";
      $$("input,select,textarea", f).forEach(function (x) { x.disabled = true; });
      var id, done = 0, failed = [];
      function sendOne(file, i, tries) {
        return shrink(file).then(function (blob) {
          var ext = /pdf$/.test(blob.type) ? "pdf" : blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : /hei[cf]$/.test(blob.type) ? "heic" : "jpg";
          var nm = ("000" + (i + 1)).slice(-4) + "-" + String(file.name || "page").replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 40) + "." + ext;
          return fetch(SB + "/storage/v1/object/book-pages/" + id + "/" + nm, { method: "POST", headers: H({ "Content-Type": blob.type || "image/jpeg", "x-upsert": "false" }), body: blob });
        }).then(function (r) {
          if (r.ok || r.status === 409) return; // 409 = already there (a retry after a dropped reply)
          throw new Error("upload " + r.status);
        }).catch(function (e) {
          if (tries >= 4) { failed.push(i + 1); return; }
          return new Promise(function (res) { setTimeout(res, 1500 * (tries + 1)); }).then(function () {
            return navigator.onLine === false ? new Promise(function (res) { window.addEventListener("online", res, { once: true }); }) : null;
          }).then(function () { return sendOne(file, i, tries + 1); });
        });
      }
      rpc("start_book_upload", { p_town: v("town"), p_title: v("title"), p_year: v("year"), p_permission: perm, p_notes: v("notes"), p_name: v("name"), p_email: v("email") })
        .then(function (r) {
          if (!r || !r.ok) throw Object.assign(new Error((r && r.error) || "Couldn't start the upload."), { user: 1 });
          id = r.id;
          // Three at a time: quick on good signal, gentle on rural cell.
          var next = 0;
          function worker() {
            if (next >= files.length) return Promise.resolve();
            var i = next++;
            return sendOne(files[i], i, 0).then(function () {
              done++; bar.value = Math.round(done / files.length * 100);
              st.textContent = "Sent " + done + " of " + files.length + (files.length === 1 ? "" : " pages") + "…";
              return worker();
            });
          }
          return Promise.all([worker(), worker(), worker()]);
        })
        .then(function () { return rpc("finish_book_upload", { p_id: id, p_pages: files.length - failed.length }); })
        .then(function (r) {
          if (!r || !r.ok) throw Object.assign(new Error((r && r.error) || "Couldn't finish the upload."), { user: 1 });
          f.hidden = true;
          $("#bk-done").innerHTML = '<div class="rm-ok"><h3>Thank you! We got ' + (files.length - failed.length) + ' pages of ' + esc(v("title")) + '.</h3>' +
            (failed.length ? '<p><b>' + failed.length + ' page' + (failed.length === 1 ? "" : "s") + ' didn\'t go through</b> (number' + (failed.length === 1 ? " " : "s ") + failed.slice(0, 20).join(", ") + (failed.length > 20 ? "…" : "") + '). Reply to our email and we\'ll sort it out.</p>' : "") +
            '<p>We\'ll check the pages and email you at ' + esc(v("email")) + '. Your photos stay private until we\'ve sorted out who owns the book.</p><p><a href="/share-a-book">Send another book</a></p></div>';
          window.scrollTo(0, 0);
        })
        .catch(function (e) {
          err.textContent = e && e.user ? e.message : "Something went wrong sending the pages. Please check your signal and try again, or email towntalesinfo@gmail.com.";
          btn.disabled = false; btn.textContent = "Try again";
          $$("input,select,textarea", f).forEach(function (x) { x.disabled = false; });
        });
    });
  }

  /* ---------- 8b: Book uploads admin queue ---------- */
  var BK_LABEL = { uploading: "Still uploading", received: "New", processing: "Working on it", done: "Done", declined: "Declined" };
  function loadBk(out, all) {
    out.innerHTML = '<p class="muted">Loading…</p>';
    api("book-queue", { all: !!all }).then(function (r) {
      var rows = r.books || [];
      if (!rows.length) { out.innerHTML = '<div class="empty">No book uploads waiting.</div><p><a href="" data-tt="bk-all">Show finished ones too</a></p>'; return; }
      out.innerHTML = '<h3>Book uploads (' + rows.length + ')</h3>' + (all ? "" : '<p class="small"><a href="" data-tt="bk-all">Show finished and declined too</a></p>') + rows.map(function (b) {
        var t = b.town_row || {};
        return '<div class="formbox stack" data-bk="' + esc(b.id) + '" style="gap:8px">' +
          '<p><span class="rm-pill ' + (b.status === "received" ? "rm-ver" : "rm-mem") + '">' + esc(BK_LABEL[b.status] || b.status) + '</span> <b>' + esc(b.title) + '</b>' + (b.published_year ? " (" + esc(b.published_year) + ")" : "") + ' · ' + esc(t.name ? t.name + ", " + t.prov : b.town) + ' · <b>' + esc(b.page_count) + ' pages</b></p>' +
          '<p class="small">From <b>' + esc(b.uploader_name) + '</b> · <a href="mailto:' + esc(b.uploader_email) + '?subject=' + encodeURIComponent("Your " + b.title + " pages") + '">' + esc(b.uploader_email) + '</a> · ' + esc(new Date(b.created_at).toLocaleString("en-CA")) +
          ' · Owner: ' + esc({ owner: "uploader holds rights", committee: "town/committee", unsure: "not sure" }[b.permission] || b.permission) + '</p>' +
          (b.notes ? '<p class="small">“' + esc(b.notes) + '”</p>' : "") +
          (b.status === "uploading" ? '<p class="small muted">Started but not finished (they may still be sending, or gave up).</p>' : "") +
          '<div class="field"><label>Your note</label><input type="text" data-bknote value="' + esc(b.admin_note || "") + '" placeholder="e.g. sent to Muse; asked committee for permission"></div>' +
          '<div class="btns"><button class="btn sm" data-tt="bk-pages">See the pages</button><button class="btn sm alt" data-tt="bk-set" data-s="processing">Working on it</button><button class="btn sm alt" data-tt="bk-set" data-s="done">Done</button><button class="btn sm alt" data-tt="bk-set" data-s="declined">Decline</button></div>' +
          '<p class="tt-msg" role="status"></p><div class="bk-pages"></div></div>';
      }).join("");
    }).catch(function (e) { out.innerHTML = '<div class="notice warn"><p>' + esc(e.message) + ". Check the admin key above.</p></div>"; });
  }
  function bkAct(b, a) {
    var card = b.closest("[data-bk]"), id = card.getAttribute("data-bk"), msg = $(".tt-msg", card);
    if (a === "bk-pages") {
      var box = $(".bk-pages", card); box.innerHTML = '<p class="muted">Loading pages…</p>';
      return api("book-queue", { id: id }).then(function (r) {
        var pages = r.pages || [];
        box.innerHTML = pages.length ? '<p class="small">' + pages.length + ' files. Links work for 1 hour. Tap a page to open it full size.</p><div class="bk-grid">' + pages.map(function (p, i) {
          return /\.pdf$/i.test(p.name) ? '<a class="bk-pdf" href="' + esc(p.url) + '" target="_blank" rel="noopener">PDF ' + (i + 1) + '</a>' :
            '<a href="' + esc(p.url) + '" target="_blank" rel="noopener" title="' + esc(p.name) + '"><img src="' + esc(p.url) + '" alt="Page ' + (i + 1) + '" loading="lazy"><span>' + (i + 1) + '</span></a>';
        }).join("") + '</div>' : '<p class="muted">No pages arrived for this one.</p>';
      }).catch(function (e) { box.innerHTML = '<p class="err">' + esc(e.message) + '</p>'; });
    }
    b.disabled = true;
    api("book-moderate", { id: id, status: b.getAttribute("data-s"), admin_note: $("[data-bknote]", card).value })
      .then(function (r) { msg.className = "tt-msg ok"; msg.textContent = "Marked: " + (BK_LABEL[r.status] || r.status) + "."; })
      .catch(function (e) { msg.className = "tt-msg err"; msg.textContent = e.message; })
      .then(function () { b.disabled = false; });
  }

  /* ---------- 9: where the train starts ---------- */
  // 1) Signed in with a home town saved (Family trees → Your home town): "Welcome home".
  // 2) Otherwise the stop matching the town Vercel sees for their connection (/api/near): "The closest stop to you".
  // Looked up once per visit; nothing is stored on our side.
  function signedInHomeTown() {
    try {
      var raw = localStorage.getItem("sb-zpqwrzsgpwwjrlbnfynn-auth-token");
      var u = raw && JSON.parse(raw).user;
      var ht = u && u.user_metadata && u.user_metadata.home_town;
      return /^[a-z0-9-]+$/.test(ht || "") ? ht : null;
    } catch (e) { return null; }
  }
  function landTrain(slug, why) {
    window.ttHomeSlug = slug; window.ttHomeWhy = why; window.ttHomeHold = true;
    if (window.ttRideToSlug) window.ttRideToSlug(slug); // only moves the train when the homepage line is showing
  }
  function trainStart() {
    var home = signedInHomeTown();
    if (home) return landTrain(home, "Welcome home");
    var cached = null;
    try { cached = JSON.parse(sessionStorage.getItem("tt-near") || "null"); } catch (e) {}
    if (cached) { if (cached.slug) landTrain(cached.slug, "The closest stop to you"); return; }
    fetch("/api/near", { credentials: "omit" }).then(function (r) { return r.json(); }).then(function (j) {
      try { sessionStorage.setItem("tt-near", JSON.stringify({ slug: j.slug || null })); } catch (e) {}
      if (j && j.slug && !signedInHomeTown()) landTrain(j.slug, "The closest stop to you");
    }).catch(function () {});
  }
  window.ttHomeTownChanged = function (slug) { try { sessionStorage.removeItem("tt-near"); } catch (e) {} if (slug) { window.ttHomeSlug = slug; window.ttHomeWhy = "Welcome home"; window.ttHomeHold = true; } };

  /* ---------- hook into the app ---------- */
  function onView() {
    try {
      var nb = $("#tt-notice"); if (nb) { try { if (localStorage.getItem("tt-notice-1")) nb.remove(); } catch (e) {} }
      var h = (location.hash || "").slice(1);
      if (h === "admin" || h.indexOf("admin/") === 0) return adminBlock();
      var t = currentTown(); if (!t) return recentBlock();
      if (t.archive) clipBlock(t); else { rmBlock(t); teamsBlock(t); bookBlock(t); }
    } catch (e) { if (window.console) console.error("towntales-extra", e); }
  }
  function boot() {
    try { wireIndexFilter(); } catch (e) {}
    $$("[data-tt-memform]").forEach(function (f) { try { wireMemForm(f); } catch (e) {} });
    $$("[data-tt-contact]").forEach(function (f) { try { wireContact(f); } catch (e) {} });
    $$("[data-tt-bookform]").forEach(function (f) { try { wireBookForm(f); } catch (e) {} });
    $$("[data-tt-honourform]").forEach(function (f) { try { wireHonourForm(f); } catch (e) {} });
    $$("[data-tt-bookupload]").forEach(function (f) { try { wireBookUpload(f); } catch (e) {} });
    $$("[data-copy]").forEach(function (b) { b.addEventListener("click", function () { copyText(b.getAttribute("data-copy")); }); });
    // Memorial pages: "Copy address" next to the page link (for corrections).
    $$("[data-copy-url]").forEach(function (b) {
      if (b.getAttribute("data-wired")) return; b.setAttribute("data-wired", "1");
      b.addEventListener("click", function () {
        var t = b.getAttribute("data-copy-url"), m = b.closest(".rm-fix") && $(".rm-copied", b.closest(".rm-fix"));
        var done = function (ok) {
          b.textContent = ok ? "Copied!" : "Copy address";
          if (m) m.textContent = ok ? "Copied. Paste it into your message." : "Couldn't copy. Press and hold the address to copy it.";
          setTimeout(function () { b.textContent = "Copy address"; }, 2500);
        };
        if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(function () { done(true); }, function () { done(fallback(t)); });
        else done(fallback(t));
      });
    });
    if (window.ttRideToSlug) { try { trainStart(); } catch (e) {} } // main app page only
    var v = $("#view");
    if (v && !$(".rm", v)) {
      new MutationObserver(function () { onView(); }).observe(v, { childList: true });
      onView();
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
