/* TownTales add-ons, Nov 26 2026. Loaded after the app on every app page. Nothing here can break the app:
   every step is wrapped, and the app never depends on it.
   1. Place markers: provincial/territorial capitals get a legislature-building marker, other cities a small
      city marker, towns keep the normal look. Driven by towns.place_kind (capital | city | town).
   2. Timeline: a year shows at most 5 entries; "More" opens the rest of that year, "Show less" closes it.
   3. "New" tag for a set number of days after something goes live (admin setting new_tag_days, counted
      from new_tag_since), and "Shared by a community member" where a public contribution isn't credited.
   4. Timeline entries that come from a newspaper clipping: "Read the full clipping" lands on the clipping
      itself (image + full transcription), shown on the entry's archive page. */
(function () {
  "use strict";
  var SB = "https://zpqwrzsgpwwjrlbnfynn.supabase.co";
  var KEY = "sb_publishable_j_Vw3H_ebMP7WL4uZwRowQ_u-DX37QU"; // public key; RLS limits it
  var CAP_PER_YEAR = 5;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function $$(sel, r) { return Array.prototype.slice.call((r || document).querySelectorAll(sel)); }
  function getJSON(path, opt) {
    return fetch(SB + path, Object.assign({ headers: { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" } }, opt || {}))
      .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  // The app runs in its own closure and hands its state out on window.TTapp (see fix-patches.json).
  function appState() { try { return window.TTapp ? window.TTapp.S : null; } catch (e) { return null; } }

  /* ---------- markers ---------- */
  // Original drawings in the site's line style (ink outline, heritage colours). Silhouettes so they read small.
  var CAP_SVG = '<svg class="tt-mk-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g fill="#B4512C" stroke="#1E2930" stroke-width="1.5" stroke-linejoin="round">' +
    '<path d="M12 2v2.2"/><path d="M7.5 9.5a4.5 4.5 0 0 1 9 0z"/><rect x="9" y="9.5" width="6" height="1.8"/><path d="M3 12.5L12 11l9 1.5z"/></g>' +
    '<g fill="#FFFCF3" stroke="#1E2930" stroke-width="1.5"><rect x="4" y="12.5" width="16" height="7.5"/></g>' +
    '<path d="M7 13.5v5.5M10.3 13.5v5.5M13.7 13.5v5.5M17 13.5v5.5" stroke="#1E2930" stroke-width="1.4"/>' +
    '<rect x="2.5" y="20" width="19" height="2" fill="#1E2930"/></svg>';
  var CITY_SVG = '<svg class="tt-mk-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g fill="#2B5C80" stroke="#1E2930" stroke-width="1.5" stroke-linejoin="round">' +
    '<rect x="3" y="11" width="6" height="10"/><rect x="9" y="5" width="6" height="16"/><rect x="15" y="9" width="6" height="12"/></g>' +
    '<path d="M11 8h2M11 11h2M11 14h2M5 14h2M17 12h2M17 15h2" stroke="#FFFCF3" stroke-width="1.3"/></svg>';
  var KIND_LABEL = { capital: "Provincial or territorial capital", city: "City" };
  function mark(kind) {
    if (kind !== "capital" && kind !== "city") return "";
    return '<span class="tt-mk tt-mk-' + kind + '" title="' + KIND_LABEL[kind] + '" role="img" aria-label="' + KIND_LABEL[kind] + '">' + (kind === "capital" ? CAP_SVG : CITY_SVG) + "</span>";
  }
  var KIND = {}; // slug -> capital | city (towns are absent)
  function kindOf(slug) {
    if (KIND[slug]) return KIND[slug];
    var st = appState(), t = st && st.towns && st.towns.find(function (x) { return x.slug === slug; });
    return t && t.place_kind && t.place_kind !== "town" ? t.place_kind : "";
  }
  function capProv(slug) {
    var st = appState(), t = st && st.towns && st.towns.find(function (x) { return x.slug === slug; });
    return t ? (/^(YT|NT|NU)$/.test(t.prov) ? "Territorial capital" : "Provincial capital") : "Capital";
  }

  function markPlaces(view) {
    // Homepage train line: station signs.
    var stops = null; try { stops = window.TTapp && window.TTapp.lineStops ? window.TTapp.lineStops() : null; } catch (e) { stops = null; }
    if (stops) $$("button.station[data-i]", view).forEach(function (b) {
      if (b.querySelector(".tt-mk")) return;
      var s = stops[+b.getAttribute("data-i")]; if (!s || s.ghost || !s.town) return;
      var k = kindOf(s.town.slug); if (!k) return;
      b.classList.add("tt-kind-" + k);
      var nb = b.querySelector(".nb"); if (nb) nb.insertAdjacentHTML("afterbegin", mark(k));
    });
    // Town cards (homepage, Towns page).
    $$('a.towncard[href^="#t-"]', view).forEach(function (a) {
      if (a.querySelector(".tt-mk")) return;
      var k = kindOf(a.getAttribute("href").slice(3).split("/")[0]); if (!k) return;
      a.classList.add("tt-kind-" + k);
      var b = a.querySelector("b"); if (b) b.insertAdjacentHTML("afterbegin", mark(k));
    });
    // Town search results (share form picker and similar).
    $$("button[data-slug]", view).forEach(function (btn) {
      if (btn.querySelector(".tt-mk")) return;
      var k = kindOf(btn.getAttribute("data-slug")); if (k) btn.insertAdjacentHTML("afterbegin", mark(k));
    });
    // Town page: the "Welcome to" sign and the heading.
    var feat = view.querySelector("section.feature"), hook = feat && feat.querySelector("[data-act=settown][data-town]");
    if (hook && !feat.querySelector(".tt-mk")) {
      var slug = hook.getAttribute("data-town"), k = kindOf(slug);
      if (k) {
        var board = feat.querySelector(".board b"); if (board) board.insertAdjacentHTML("beforebegin", mark(k));
        var h1 = feat.querySelector("h1");
        if (h1) h1.insertAdjacentHTML("afterend", '<p class="tt-mk-line">' + mark(k) + " " + (k === "capital" ? capProv(slug) : "City") + "</p>");
      }
    }
  }

  /* ---------- New / community tags ---------- */
  var NEW_DAYS = 30, NEW_SINCE = "2026-11-26";
  function isNew(created) {
    if (!created || !(NEW_DAYS > 0)) return false;
    var t = Date.parse(created); if (isNaN(t)) return false;
    var since = Date.parse(NEW_SINCE + "T00:00:00-06:00");
    return t >= (isNaN(since) ? 0 : since) && Date.now() - t < NEW_DAYS * 864e5;
  }
  var NEW_PILL = '<span class="pill tt-new">New</span>';
  var COMM_PILL = '<span class="pill tt-comm">Shared by a community member</span>';
  function itemById(id) { var st = appState(); return st && st.items ? st.items.find(function (i) { return i.id === id; }) : null; }

  /* ---------- timeline: 5 per year ---------- */
  var OPEN = {}; // "town|year" -> true when expanded
  function townSlug(view) { var h = view.querySelector("section.feature [data-act=settown][data-town]"); return h ? h.getAttribute("data-town") : ""; }

  function timeline(view) {
    var list = view.querySelector("#tl-list"); if (!list) return;
    var slug = townSlug(view);
    var ticks = $$("article.tick[data-year]", list);
    // Tags + clipping links on each card (once).
    ticks.forEach(function (t) {
      var ids = String(t.getAttribute("data-items") || "").split(",").filter(Boolean);
      var src = ids.map(itemById).filter(Boolean);
      if (!t.getAttribute("data-tag")) {
        t.setAttribute("data-tag", "1");
        var btns = t.querySelector("summary .btns"), pills = "";
        if (src.some(function (i) { return isNew(i.created_at); })) pills += NEW_PILL;
        if (src.some(function (i) { return i.origin === "community"; })) pills += COMM_PILL;
        if (pills && btns) btns.insertAdjacentHTML("afterbegin", pills);
      }
      var clip = src.map(function (i) { return CLIP_BY_ITEM[i.id]; }).filter(Boolean)[0];
      var rf = t.querySelector(".readfull a");
      if (clip && rf && !rf.getAttribute("data-clip")) { rf.textContent = "Read the full clipping →"; rf.setAttribute("data-clip", clip.id); }
    });
    // Group by year within each decade section.
    var groups = {};
    ticks.forEach(function (t) {
      var key = (t.parentNode && (t.parentNode.id || "")) + "|" + t.getAttribute("data-year");
      (groups[key] = groups[key] || []).push(t);
    });
    Object.keys(groups).forEach(function (key) {
      var g = groups[key], year = key.split("|")[1], okey = slug + "|" + year;
      var last = g[g.length - 1], btn = last.nextElementSibling;
      if (!(btn && btn.classList.contains("tt-yr-more"))) btn = null;
      if (g.length <= CAP_PER_YEAR) { if (btn) btn.remove(); g.forEach(function (t) { t.hidden = false; }); return; }
      var open = !!OPEN[okey];
      g.forEach(function (t, n) { t.hidden = !open && n >= CAP_PER_YEAR; });
      if (!btn) {
        btn = document.createElement("button"); btn.type = "button"; btn.className = "btn sm alt tt-yr-more";
        btn.setAttribute("data-yr", okey); last.parentNode.insertBefore(btn, last.nextSibling);
      }
      var extra = g.length - CAP_PER_YEAR;
      var label = open ? "Show less (" + year + ")" : "More from " + year + " (" + extra + " more)";
      if (btn.textContent !== label) btn.textContent = label; // only when it changes (the observer watches the page)
      if (btn.getAttribute("aria-expanded") !== String(open)) btn.setAttribute("aria-expanded", String(open));
    });
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest(".tt-yr-more"); if (!b) return;
    var k = b.getAttribute("data-yr"); OPEN[k] = !OPEN[k];
    var view = document.getElementById("view"); if (view) timeline(view);
    if (!OPEN[k]) { var y = k.split("|")[1], first = document.querySelector('#tl-list article.tick[data-year="' + y + '"]'); if (first && first.scrollIntoView) first.scrollIntoView({ block: "nearest" }); }
  });

  /* ---------- archive cards, item pages, clipping cards ---------- */
  function archive(view) {
    $$("#a-list a.acard[href^='#i-']", view).forEach(function (a) {
      if (a.getAttribute("data-tag")) return; a.setAttribute("data-tag", "1");
      var i = itemById(a.getAttribute("href").slice(3)); if (!i) return;
      var pills = (isNew(i.created_at) ? NEW_PILL : "") + (i.origin === "community" && !i.contributor ? COMM_PILL : "");
      var k = a.querySelector(".txt .k"); if (pills && k) k.insertAdjacentHTML("afterend", '<span class="tt-tags">' + pills + "</span>");
    });
    $$("#tt-cl-list .cl-card", view).forEach(function (c) {
      if (c.getAttribute("data-tag")) return; c.setAttribute("data-tag", "1");
      if (isNew(c.getAttribute("data-created"))) { var m = c.querySelector(".cl-meta"); if (m) m.insertAdjacentHTML("beforebegin", '<span class="tt-tags">' + NEW_PILL + "</span>"); }
    });
  }
  function itemPage(view) {
    var sec = view.querySelector("section.item"); if (!sec || sec.getAttribute("data-tag")) return;
    var m = /^#i-([0-9a-f-]{36})/.exec(location.hash); if (!m) return;
    sec.setAttribute("data-tag", "1");
    var i = itemById(m[1]); if (!i) return;
    var eb = sec.querySelector(".eyebrow");
    var pills = (isNew(i.created_at) ? NEW_PILL : "") + (i.origin === "community" && !i.contributor ? COMM_PILL : "");
    if (pills && eb) eb.insertAdjacentHTML("afterend", '<p class="tt-tags">' + pills + "</p>");
    loadClips(i.town).then(function () {
      var c = CLIP_BY_ITEM[i.id]; if (!c || sec.querySelector(".cl-on-item")) return;
      var full = window.ttClip && window.ttClip.full ? window.ttClip.full(c) : "";
      if (!full) return;
      var box = document.createElement("div"); box.className = "cl-on-item"; box.id = "clipping";
      var tw = null; try { tw = window.TTapp && window.TTapp.town ? window.TTapp.town(i.town) : null; } catch (e) {}
      box.innerHTML = '<p class="small"><b>From the newspaper clipping</b> in the ' + esc(tw && tw.name ? tw.name : i.town) + " archive:</p>" + full;
      var h1 = sec.querySelector("h1"); if (h1) h1.parentNode.insertBefore(box, h1.nextSibling);
      var ph = sec.querySelector(".photo"); if (ph) ph.hidden = true; // the clipping image is shown in full above
      if (/clipping/.test(location.search + location.hash) && box.scrollIntoView) box.scrollIntoView();
    });
  }

  /* ---------- clippings linked to timeline items ---------- */
  var CLIP_BY_ITEM = {}, CLIP_TOWNS = {};
  function loadClips(slug) {
    if (!slug) return Promise.resolve();
    if (CLIP_TOWNS[slug]) return CLIP_TOWNS[slug];
    CLIP_TOWNS[slug] = getJSON("/rest/v1/clippings?town=eq." + encodeURIComponent(slug) + "&item_id=not.is.null&select=id,item_id,image_url,paper_name,date_label,headline,submitter_name,description,transcription,transcription_status,created_at")
      .then(function (rows) {
        (rows || []).forEach(function (c) { CLIP_BY_ITEM[c.item_id] = c; if (window.ttClip && window.ttClip.cache) window.ttClip.cache[c.id] = c; });
        soon();
      });
    return CLIP_TOWNS[slug];
  }

  /* ---------- run ---------- */
  function decorate() {
    var view = document.getElementById("view"); if (!view) return;
    var slug = townSlug(view); if (slug && !CLIP_TOWNS[slug]) loadClips(slug);
    try { markPlaces(view); } catch (e) {}
    try { timeline(view); } catch (e) {}
    try { archive(view); } catch (e) {}
    try { itemPage(view); } catch (e) {}
  }
  var queued = false;
  function soon() { if (queued) return; queued = true; (window.requestAnimationFrame || setTimeout)(function () { queued = false; try { decorate(); } catch (e) {} }); }

  var CSS =
    ".tt-mk{display:inline-flex;vertical-align:-0.12em;margin-right:.3em;line-height:0}" +
    ".tt-mk-svg{width:1em;height:1em;display:block}" +
    ".tt-mk-capital .tt-mk-svg{width:1.15em;height:1.15em}" +
    ".tt-mk-city .tt-mk-svg{width:.8em;height:.8em}" +
    ".station .nb .tt-mk{margin-right:.35em}" +
    ".towncard.tt-kind-capital::before{content:'CAPITAL';background:#B4512C}" +
    ".towncard.tt-kind-city::before{content:'CITY';background:#2B5C80}" +
    ".sign .board .tt-mk{display:block;margin:0 auto 4px;width:max-content}.sign .board .tt-mk-svg{width:30px;height:30px}.sign .board .tt-mk-city .tt-mk-svg{width:20px;height:20px}" +
    ".tt-mk-line{margin:-4px 0 0;font:700 .9rem/1.2 var(--hand,inherit);letter-spacing:.06em;text-transform:uppercase;color:var(--ink-2,#46525A)}" +
    ".pill.tt-new{background:#F6E7B8;color:#6E4C08;border-color:#D9B65A}" +
    ".pill.tt-comm{background:#E4EEE0;color:#2F4F2A;border-color:#9DB894}" +
    ".tt-tags{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0}" +
    ".tt-yr-more{align-self:flex-start;margin:2px 0 6px}" +
    ".tick .readfull a{display:inline-block;border:2px solid var(--denim,#2B5C80);border-radius:2px;padding:6px 12px;text-decoration:none;background:#fff}" +
    ".tick .readfull a:hover{background:var(--denim,#2B5C80);color:#fff}" +
    ".tick .readfull{margin:4px 0 2px}";

  function boot() {
    try { var s = document.createElement("style"); s.textContent = CSS; document.head.appendChild(s); } catch (e) {}
    var ready = Promise.all([
      getJSON("/rest/v1/rpc/public_settings", { method: "POST", body: "{}" }).then(function (r) {
        if (r && typeof r.new_tag_days === "number") NEW_DAYS = r.new_tag_days;
        if (r && typeof r.new_tag_since === "string") NEW_SINCE = r.new_tag_since;
      }),
      getJSON("/rest/v1/towns?hidden=eq.false&place_kind=neq.town&select=slug,place_kind").then(function (rows) {
        (rows || []).forEach(function (t) { KIND[t.slug] = t.place_kind; });
      }),
    ]);
    soon();
    var v = document.getElementById("view");
    if (v && window.MutationObserver) new MutationObserver(soon).observe(v, { childList: true, subtree: true });
    window.addEventListener("hashchange", soon);
    ready.then(soon, soon);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
