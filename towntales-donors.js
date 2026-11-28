/* TownTales donors (Nov 27 2026), loaded after the app on every app page.
   - Town page: "Friends of <town>" block (replaces the general "Help keep this going" band there).
   - Donate page: Stripe links carry the town, so the gift is listed under it.
   - #admin: approve / hide / add donors.
   Nothing here can break the app. */
(function () {
  "use strict";
  var SB = "https://zpqwrzsgpwwjrlbnfynn.supabase.co";
  var KEY = "sb_publishable_j_Vw3H_ebMP7WL4uZwRowQ_u-DX37QU";
  var SHOW = 10;
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  /* ---------- which town is the gift for ---------- */
  var mem = null;
  function getGive() { try { return JSON.parse(sessionStorage.getItem("tt-give") || "null"); } catch (e) { return mem; } }
  function setGive(v) { mem = v; try { if (v) sessionStorage.setItem("tt-give", JSON.stringify(v)); else sessionStorage.removeItem("tt-give"); } catch (e) {} }
  function refFor(slug) {
    if (!slug) return "donate_general";
    if (/^[A-Za-z0-9_-]{1,180}$/.test(slug)) return "donate_" + slug;
    return "donateb_" + btoa(unescape(encodeURIComponent(slug))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function pageTown(view) {
    var hook = view.querySelector("section.feature [data-act=settown][data-town]");
    if (!hook) return null;
    var h1 = view.querySelector("section.feature h1");
    var slug = hook.getAttribute("data-town");
    return { slug: slug, name: h1 ? h1.textContent.split(",")[0].trim() : slug };
  }
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest('a[href="#donate"]');
    if (!a) return;
    var view = document.getElementById("view");
    // From a town page the gift is for that town; from the header or footer it is a general gift.
    setGive(view && view.contains(a) ? pageTown(view) : null);
  }, true);

  /* ---------- town page block ---------- */
  var cache = {};
  function load(slug) {
    if (!cache[slug]) {
      cache[slug] = fetch(SB + "/rest/v1/donors?select=display_name,dedication,monthly,monthly_active&status=eq.published&town=eq." + encodeURIComponent(slug) + "&order=created_at.desc&limit=" + (SHOW + 1),
        { headers: { apikey: KEY, Authorization: "Bearer " + KEY } })
        .then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; });
    }
    return cache[slug];
  }
  function townBlock(view) {
    var t = pageTown(view);
    if (!t || view.querySelector(".tt-friends")) return;
    var sec = document.createElement("section");
    sec.className = "wrap stack tt-friends";
    sec.innerHTML = "<h2>Friends of " + esc(t.name) + "</h2><div data-list></div>" +
      '<div class="btns"><a class="btn" href="#donate">Support ' + esc(t.name) + "&rsquo;s page</a> <a class=\"btn alt\" href=\"/donors\">See all donors</a></div>" +
      '<p class="small muted">Your gift supports TownTales and keeps ' + esc(t.name) + "&rsquo;s history online. It does not go to the town office.</p>";
    var band = view.querySelector('section.wrap > .share a[href="#donate"]');
    var bandSec = band && band.closest("section");
    if (bandSec) { bandSec.hidden = true; bandSec.parentNode.insertBefore(sec, bandSec); } else view.appendChild(sec);
    load(t.slug).then(function (rows) {
      var box = sec.querySelector("[data-list]");
      if (!rows.length) { box.innerHTML = "<p>Be the first Friend of " + esc(t.name) + ".</p>"; return; }
      box.innerHTML = "<p>These people helped keep " + esc(t.name) + "&rsquo;s story online.</p><ul>" + rows.slice(0, SHOW).map(function (d) {
        return "<li><b>" + esc(d.display_name || "A friend") + "</b>" + (d.monthly && d.monthly_active ? ' <span class="small muted">· monthly supporter</span>' : "") +
          (d.dedication ? ' <span class="muted">— ' + esc(d.dedication) + "</span>" : "") + "</li>";
      }).join("") + "</ul>" + (rows.length > SHOW ? '<p><a href="/donors">See all of ' + esc(t.name) + "&rsquo;s Friends</a></p>" : "");
    });
  }

  /* ---------- donate page ---------- */
  function donatePage(view) {
    if ((location.hash || "") !== "#donate") return;
    var give = getGive();
    var links = view.querySelectorAll('a[href^="https://buy.stripe.com/"],a[href^="https://donate.stripe.com/"]');
    var ref = refFor(give && give.slug);
    Array.prototype.forEach.call(links, function (a) {
      var base = a.getAttribute("href").split("?")[0], next = base + "?client_reference_id=" + ref;
      if (a.getAttribute("href") !== next) a.setAttribute("href", next);
    });
    var lede = view.querySelector(".lede");
    if (!lede || view.querySelector(".tt-give")) return;
    var box = document.createElement("div");
    box.className = "tt-give";
    box.innerHTML = (give && links.length ? '<p><b>Your gift will be listed under ' + esc(give.name) + '.</b> <button type="button" class="btn sm alt" data-general>Make it a general gift</button></p>' : "") +
      (links.length ? "<p>Want to be recognized? Fill in the optional name box at checkout. Leave it blank to give anonymously. No amounts are ever shown.</p>" : "") +
      '<p><a href="/donors">See our donors</a></p>';
    lede.parentNode.insertBefore(box, lede.nextSibling);
    var b = box.querySelector("[data-general]");
    if (b) b.addEventListener("click", function () { setGive(null); box.remove(); donatePage(view); });
  }

  /* ---------- admin ---------- */
  function adminKey() { try { return sessionStorage.getItem("tt-admin") || localStorage.getItem("tt-admin-saved") || ""; } catch (e) { return ""; } }
  function api(action, body) {
    return fetch(SB + "/functions/v1/donors/" + action, { method: "POST", headers: { "Content-Type": "application/json", "x-admin-key": adminKey() }, body: JSON.stringify(body || {}) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "Something went wrong"); return j; }); });
  }
  var STATUS = { pending: "Waiting for approval", published: "Showing on the site", hidden: "Hidden", anonymous: "Anonymous (not listed)" };
  function card(d) {
    var p = d.payment || {};
    var money = p.amount_cents != null ? "$" + (p.amount_cents / 100).toFixed(2) + " " + String(p.currency || "").toUpperCase() + (d.monthly ? " a month" + (d.monthly_active ? "" : " (cancelled)") : "") : "Added by hand";
    function field(k, label, v, ph) { return '<div class="field"><label>' + label + '</label><input type="text" data-f="' + k + '" value="' + esc(v || "") + '" placeholder="' + (ph || "") + '"></div>'; }
    return '<div class="formbox" data-id="' + esc(d.id || "") + '">' +
      (d.id ? "<p><b>" + esc(STATUS[d.status] || d.status) + "</b> · " + esc(money) + (p.payer_name ? " · paid by " + esc(p.payer_name) : "") + (p.donor_email ? " · " + esc(p.donor_email) : "") + " · " + esc(String(d.created_at).slice(0, 10)) + "</p>" : "<p><b>Add a donor by hand</b> (e-transfer, cash, or an earlier donor who agreed to be named)</p>") +
      field("display_name", "Name to show", d.display_name) + field("dedication", "In memory or honour of", d.dedication) + field("town", "Town address (blank = general)", d.town, "e.g. wapella-sk") +
      '<div class="btns"><button type="button" class="btn sm" data-s="published">' + (d.id ? "Approve / save as showing" : "Add and show") + "</button>" +
      (d.id ? ' <button type="button" class="btn sm alt" data-s="hidden">Hide</button>' : "") + '</div><p class="small" data-msg role="status"></p></div>';
  }
  function adminBlock(view) {
    if (view.querySelector("#tt-donors-adm") || !view.querySelector("#adm-key")) return;
    var sec = document.createElement("section");
    sec.className = "wrap stack"; sec.id = "tt-donors-adm";
    sec.innerHTML = '<h2>Donors</h2><div class="btns"><button type="button" class="btn alt" data-load>Load donors</button></div><div class="stack" data-out></div>';
    view.appendChild(sec);
    var out = sec.querySelector("[data-out]");
    function show() {
      out.innerHTML = "<p>Loading…</p>";
      api("list").then(function (r) {
        var rank = { pending: 0, published: 1, hidden: 2, anonymous: 3 };
        var rows = r.donors.slice().sort(function (a, b) { return rank[a.status] - rank[b.status]; });
        var waiting = rows.filter(function (d) { return d.status === "pending"; }).length;
        out.innerHTML = "<p><b>" + waiting + " waiting for approval</b>, " + rows.length + " in total.</p>" + rows.map(card).join("") + card({});
      }).catch(function (e) { out.innerHTML = '<div class="notice warn"><p>' + esc(e.message) + ". Check the admin key above.</p></div>"; });
    }
    sec.addEventListener("click", function (e) {
      if (e.target.closest("[data-load]")) { show(); return; }
      var b = e.target.closest("[data-s]"); if (!b) return;
      var c = b.closest("[data-id]"), id = c.getAttribute("data-id");
      var body = { id: id, status: b.getAttribute("data-s") };
      Array.prototype.forEach.call(c.querySelectorAll("[data-f]"), function (i) { body[i.getAttribute("data-f")] = i.value; });
      b.disabled = true;
      api(id ? "save" : "add", body).then(function () { cache = {}; show(); })
        .catch(function (er) { b.disabled = false; c.querySelector("[data-msg]").textContent = er.message; });
    });
  }

  function decorate() {
    var view = document.getElementById("view"); if (!view) return;
    var h = location.hash || "";
    if (h === "#admin" || h.indexOf("#admin/") === 0) return adminBlock(view);
    donatePage(view);
    townBlock(view);
  }
  var queued = false;
  function soon() { if (queued) return; queued = true; setTimeout(function () { queued = false; try { decorate(); } catch (e) { if (window.console) console.error("towntales-donors", e); } }, 30); }
  function boot() {
    var v = document.getElementById("view");
    if (v && window.MutationObserver) new MutationObserver(soon).observe(v, { childList: true, subtree: true });
    window.addEventListener("hashchange", soon);
    soon();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
