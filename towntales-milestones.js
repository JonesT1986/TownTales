/* TownTales milestone birthdays (Nov 23 2026), loaded after the app on every app page.
   A town is "celebrating" for the whole calendar year when (year − est) is 50, 75, 100, 125 … (every 25 from 50).
   - Town page: gold banner above the intro, and the page's accent colour turns gold (body.tt-ms).
   - Town cards and town search results: a small "Turns 125 in 2026" / "125 in 2026" badge.
   - Homepage: "Celebrating milestones in 2026" list, biggest milestone first, then A–Z.
   Data: one small query for towns whose est is a milestone year (est=in.(…)), so it never loads
   the whole towns table. Same rule as api/_milestones.js (server pages). Nothing here can break the app. */
(function () {
  "use strict";
  var SB = "https://zpqwrzsgpwwjrlbnfynn.supabase.co";
  var KEY = "sb_publishable_j_Vw3H_ebMP7WL4uZwRowQ_u-DX37QU"; // public key (same as the server pages); RLS limits it to visible towns
  var PROV = { SK: "Saskatchewan", MB: "Manitoba", AB: "Alberta", BC: "British Columbia", ON: "Ontario", QC: "Quebec", NB: "New Brunswick", NS: "Nova Scotia", PE: "Prince Edward Island", NL: "Newfoundland and Labrador", YT: "Yukon", NT: "Northwest Territories", NU: "Nunavut" };

  function yearNow() {
    try { return Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Regina", year: "numeric" }).format(new Date())); }
    catch (e) { return new Date().getFullYear(); }
  }
  var YEAR = yearNow();
  function milestone(est) {
    var s = String(est == null ? "" : est).trim();
    if (!/^\d{4}$/.test(s)) return 0;
    var n = YEAR - Number(s);
    return n >= 50 && n % 25 === 0 ? n : 0;
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function badge(n, long) { return '<span class="tt-ms-badge" data-ms="1">' + (long ? "Turns " : "") + n + " in " + YEAR + "</span>"; }

  var MS = null; // slug → { slug, name, prov, est, ms }
  var LIST = []; // sorted: biggest milestone first, then A–Z

  function load() {
    var years = [];
    for (var n = 50; YEAR - n >= 1000; n += 25) years.push(YEAR - n);
    var url = SB + "/rest/v1/towns?hidden=eq.false&est=in.(" + years.join(",") + ")&select=slug,name,prov,est&order=name";
    return fetch(url, { headers: { apikey: KEY, Authorization: "Bearer " + KEY, "Range-Unit": "items", Range: "0-999" } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        MS = {};
        LIST = (rows || []).map(function (t) { t.ms = milestone(t.est); return t; }).filter(function (t) { return t.ms; });
        LIST.sort(function (a, b) { return b.ms - a.ms || String(a.name).localeCompare(String(b.name), "en-CA"); });
        LIST.forEach(function (t) { MS[t.slug] = t; });
      });
  }

  var CSS = ".tt-ms-badge{display:inline-block;font:700 .78rem/1 var(--hand,inherit);padding:4px 7px;border-radius:2px;background:#F6E7B8;color:#6E4C08;border:1px solid #D9B65A;white-space:nowrap;vertical-align:middle}" +
    ".towncard .tt-ms-badge{align-self:flex-start}" +
    ".tpick-list .tt-ms-badge{margin-left:8px}" +
    ".tt-ms-banner{background:#F6E7B8;border:2px solid #C9A23E;border-radius:3px;padding:10px 14px;color:#3D2C05;font-size:1.05rem}" +
    ".tt-ms-list{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:8px 18px}" +
    ".tt-ms-list li{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--rule,#D3C8B0)}" +
    ".tt-ms-list a{display:flex;flex-direction:column;text-decoration:none}" +
    "body.tt-ms{--red:#9A6B0E;--red-2:#6E4C08}";

  function decorate() {
    if (!MS) return;
    var view = document.getElementById("view"); if (!view) return;

    // Town page: banner + gold accent.
    var feat = view.querySelector("section.feature");
    var hook = feat && feat.querySelector("[data-act=settown][data-town]");
    var t = hook ? MS[hook.getAttribute("data-town")] : null;
    document.body.classList.toggle("tt-ms", !!t);
    if (t && !feat.querySelector(".tt-ms-banner")) {
      var stack = feat.querySelector(".stack") || feat;
      var b = document.createElement("div");
      b.className = "tt-ms-banner"; b.setAttribute("role", "note");
      b.innerHTML = '<span aria-hidden="true">🎉</span> <b>' + t.ms + " years</b> — " + esc(t.name) + " was founded in " + esc(String(t.est).trim()) + " and turns " + t.ms + " in " + YEAR + ".";
      stack.insertBefore(b, stack.firstChild);
    }

    // Town cards (homepage + Towns page): "Turns 125 in 2026".
    Array.prototype.forEach.call(view.querySelectorAll('a.towncard[href^="#t-"]'), function (a) {
      if (a.querySelector(".tt-ms-badge")) return;
      var m = MS[a.getAttribute("href").slice(3)]; if (!m) return;
      var name = a.querySelector("b");
      if (name) name.insertAdjacentHTML("afterend", badge(m.ms, true));
    });

    // Town search results (Share-history town picker and similar): "125 in 2026".
    Array.prototype.forEach.call(view.querySelectorAll("button[data-slug]"), function (btn) {
      if (btn.querySelector(".tt-ms-badge")) return;
      var m = MS[btn.getAttribute("data-slug")]; if (m) btn.insertAdjacentHTML("beforeend", badge(m.ms, false));
    });

    // Homepage: "Celebrating milestones in 2026", under the train line.
    var line = view.querySelector(".line-wrap");
    if (line && LIST.length && !view.querySelector(".tt-ms-section")) {
      var sec = document.createElement("section");
      sec.className = "wrap stack tt-ms-section";
      sec.innerHTML = "<h2>Celebrating milestones in " + YEAR + "</h2>" +
        '<p class="small muted">Towns turning 50, 75, 100, 125 or more this year, counted from the founding year on their page.</p>' +
        '<ul class="tt-ms-list">' + LIST.map(function (m) {
          return '<li><a href="#t-' + esc(m.slug) + '"><b>' + esc(m.name) + '</b><span class="muted small">' + esc(PROV[m.prov] || m.prov) + "</span></a> " + badge(m.ms, true) + "</li>";
        }).join("") + "</ul>";
      line.parentNode.insertBefore(sec, line.nextSibling);
    }
  }

  var queued = false;
  function soon() { if (queued) return; queued = true; (window.requestAnimationFrame || setTimeout)(function () { queued = false; try { decorate(); } catch (e) {} }); }

  function boot() {
    try { var s = document.createElement("style"); s.textContent = CSS; document.head.appendChild(s); } catch (e) {}
    load().then(function () {
      soon();
      var v = document.getElementById("view");
      if (v && window.MutationObserver) new MutationObserver(soon).observe(v, { childList: true, subtree: true });
      window.addEventListener("hashchange", soon);
    }).catch(function () {});
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
