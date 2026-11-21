/* TownTales — Family Trees
   Anyone can view published trees. Building one needs a free account (Supabase Auth).
   Hooks into the main single-page app: adds a "Family trees" nav link, its own #fam routes,
   and a "Family trees" block on every town page for trees connected to that town. */
(function () {
  "use strict";
  const SB_URL = "https://zpqwrzsgpwwjrlbnfynn.supabase.co";
  const SB_KEY = "sb_publishable_j_Vw3H_ebMP7WL4uZwRowQ_u-DX37QU";
  const SB_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js";
  const THIS_YEAR = new Date().getFullYear();

  const FINE_TOWNS = "Connecting a town lists this tree on that town's TownTales page (for example, Wapella's page) as well as in the Family Trees section, so anyone browsing that town can find and open it. People marked as living are always hidden from the public: visitors see a first name only, with no dates, places, photos or stories. You can disconnect a town at any time.";
  const FINE_GENERAL = "Published trees can be viewed by anyone, without an account. Only you can edit your tree. Please don't add private details about living people (addresses, phone numbers, health), and only upload photos and stories you have the right to share.";

  /* ---------- helpers ---------- */
  const esc = (v) => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const yearOf = (s) => { const m = String(s || "").match(/\b(1[0-9]{3}|20[0-9]{2})\b/); return m ? parseInt(m[1], 10) : null; };
  const fullName = (p) => p.living && p.surname === undefined ? p.given : [p.given, p.surname].filter(Boolean).join(" ");
  const lifeSpan = (p) => {
    if (p.living) return p.surname === undefined ? "Living · private" : "Living";
    const b = p.born_label || (p.born_year || ""), d = p.died_label || (p.died_year || "");
    if (!b && !d) return "";
    return (b ? "b. " + b : "") + (b && d ? " – " : "") + (d ? "d. " + d : "");
  };

  let sb = null, sbLoading = null, user = null, townsCache = null;
  function loadSB() {
    if (sb) return Promise.resolve(sb);
    if (sbLoading) return sbLoading;
    sbLoading = new Promise((res, rej) => {
      const go = () => {
        try {
          sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" } });
          sb.auth.onAuthStateChange((ev, session) => {
            user = session ? session.user : null;
            if (ev === "PASSWORD_RECOVERY") { location.hash = "fam-reset"; }
            if (ev === "SIGNED_IN" && /[?&]code=/.test(location.search)) {
              try { history.replaceState(null, "", location.pathname + "#families"); } catch (e) {}
              render();
            }
          });
          sb.auth.getSession().then(({ data }) => { user = data.session ? data.session.user : null; res(sb); }, () => res(sb));
        } catch (e) { rej(e); }
      };
      if (window.supabase && window.supabase.createClient) return go();
      const s = document.createElement("script");
      s.src = SB_JS; s.async = true; s.onload = go; s.onerror = () => rej(new Error("Could not load the sign-in library. Check your connection and refresh."));
      document.head.appendChild(s);
    });
    return sbLoading;
  }
  async function towns() {
    if (townsCache) return townsCache;
    await loadSB();
    const { data, error } = await sb.from("towns").select("slug,name,prov").eq("hidden", false).order("name");
    if (error) throw error;
    townsCache = data || [];
    return townsCache;
  }
  const errMsg = (e) => (e && (e.message || e.error_description)) || String(e);

  /* ---------- styles ---------- */
  const css = `
.fam-hero{display:flex;flex-wrap:wrap;gap:18px;align-items:flex-end;justify-content:space-between}
.fam-home-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.fam-home-row select{flex:1 1 240px;width:auto}
.fam-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr));gap:16px}
.fam-card{background:var(--card);border:2px solid var(--ink);border-radius:2px;padding:18px;display:flex;flex-direction:column;gap:8px;text-decoration:none;color:var(--ink);box-shadow:4px 4px 0 var(--wheat)}
.fam-card:hover{color:var(--ink);box-shadow:4px 4px 0 var(--red)}
.fam-card h3{font-size:1.35rem}
.fam-towns{display:flex;flex-wrap:wrap;gap:6px}
.fam-fine{font-size:.86rem;line-height:1.5;color:var(--ink-2);border-left:3px solid var(--wheat);padding:8px 12px;background:var(--sunk);border-radius:2px;max-width:70ch}
.fam-fine b{color:var(--ink)}
.fam-chart{overflow-x:auto;background:var(--card);border:2px solid var(--ink);border-radius:2px;-webkit-overflow-scrolling:touch}
.fam-gens{position:relative;display:inline-flex;flex-direction:column;gap:56px;padding:22px;min-width:100%}
.fam-row{display:flex;gap:26px;justify-content:flex-start;align-items:flex-start;position:relative;z-index:1}
.fam-row>:first-child{margin-left:auto}.fam-row>:last-child{margin-right:auto}
.fam-unit{display:flex;gap:4px;align-items:center}
.fam-ring{font:700 .9rem var(--hand);color:var(--red);padding:0 2px}
.fam-node{width:168px;min-height:74px;background:#FFFEFA;border:2px solid var(--ink);border-radius:3px;padding:8px 10px;text-align:left;font:inherit;color:var(--ink);cursor:pointer;display:flex;gap:8px;align-items:center}
.fam-node:hover,.fam-node.on{border-color:var(--red);box-shadow:0 0 0 3px rgba(180,81,44,.18)}
.fam-node.priv{background:var(--sunk);border-style:dashed}
.fam-node img{width:40px;height:40px;object-fit:cover;border-radius:2px;flex:none}
.fam-node b{display:block;font-size:.95rem;line-height:1.2}
.fam-node span{display:block;font:400 .78rem/1.3 var(--hand);color:var(--ink-2);margin-top:3px}
.fam-lines{position:absolute;inset:0;z-index:0;pointer-events:none}
.fam-lines path{fill:none;stroke:var(--ink-2);stroke-width:1.6}
.fam-detail{background:var(--card);border:2px solid var(--ink);border-radius:2px;padding:20px;display:grid;gap:14px;grid-template-columns:minmax(0,1fr)}
.fam-detail img{max-width:260px;border:2px solid var(--ink)}
.fam-rel{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.fam-chip{border:1.5px solid var(--rule);background:#FFFEFA;border-radius:2px;padding:4px 10px;font:600 .9rem var(--body);cursor:pointer;color:var(--denim)}
.fam-chip:hover{border-color:var(--red);color:var(--red)}
.fam-x{border:0;background:none;color:var(--bad);cursor:pointer;font-weight:700;padding:0 4px}
.fam-plist{display:flex;flex-direction:column;gap:10px}
.fam-prow{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;background:var(--card);border:1.5px solid var(--rule);border-radius:2px;padding:10px 14px}
.fam-prow .who b{display:block}
.fam-err{color:var(--bad);font-weight:700}
.fam-ok{color:var(--ok);font-weight:700}
.fam-check{display:flex;gap:10px;align-items:flex-start;font-weight:400}
.fam-check input{width:22px;height:22px;margin-top:3px;flex:none}
.fam-tabs{display:flex;gap:8px;flex-wrap:wrap}
.fam-town-block{margin-top:36px;margin-bottom:36px}
@media (max-width:600px){.fam-node{width:140px}.fam-row{gap:14px}.formbox{padding:18px}}
`;
  function addStyle() { if ($("#fam-css")) return; const s = document.createElement("style"); s.id = "fam-css"; s.textContent = css; document.head.appendChild(s); }

  /* ---------- nav ---------- */
  function addNav() {
    const nav = $("nav.main");
    if (nav && !nav.querySelector('a[href="#families"]')) {
      const a = document.createElement("a"); a.href = "#families"; a.textContent = "Family trees";
      const after = nav.querySelector('a[href="#towns"]');
      after ? after.after(a) : nav.prepend(a);
    }
    const ul = $$("footer ul")[0];
    if (ul && !ul.querySelector('a[href="#families"]')) {
      const li = document.createElement("li"); li.innerHTML = '<a href="#families">Build a family tree</a>'; ul.appendChild(li);
    }
  }
  function markNav(on) {
    $$("nav.main a").forEach((a) => {
      if (a.getAttribute("href") === "#families") { on ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"); }
      else if (on) a.removeAttribute("aria-current");
    });
  }

  /* ---------- routing ---------- */
  function famRoute() { const h = (location.hash || "").slice(1); return h === "families" || h.startsWith("fam-") ? h : ""; }
  function townSlugFromPage() {
    const h = (location.hash || "").slice(1);
    let m = h.match(/^t[l]?-([a-z0-9-]+)/);
    if (m) return m[1].split("/")[0];
    if (h && h !== "") return "";
    m = location.pathname.match(/^\/([a-z0-9-]+-(?:sk|mb|ab|bc|on|qc|nb|ns|pe|nl|yt|nt|nu))(\/archive)?\/?$/);
    return m ? m[1] : "";
  }

  let busy = false, renderSeq = 0, lastFam = "";
  const view = () => $("#view");
  function paint(html) { busy = true; const v = view(); if (v) v.innerHTML = `<div data-fam-page>${html}</div>`; busy = false; }
  const loading = (t) => `<section class="wrap stack" style="padding:40px 16px"><p class="muted">${esc(t || "Loading…")}</p></section>`;

  async function render() {
    const r = famRoute();
    const v = view(); if (!v) return;
    if (!r) { markNav(false); lastFam = ""; return townBlock(); }
    markNav(true);
    const seq = ++renderSeq;
    if (r.split("~")[0] !== lastFam.split("~")[0]) window.scrollTo(0, 0);
    lastFam = r;
    paint(loading());
    try {
      await loadSB();
      if (seq !== renderSeq) return;
      if (r === "families") await pageList(seq);
      else if (r === "fam-login") pageLogin();
      else if (r === "fam-reset") pageReset();
      else if (r.startsWith("fam-new")) await pageNew(seq, r.split("~")[1] || "");
      else if (r.startsWith("fam-edit-")) await pageEdit(seq, r.slice(9));
      else await pageTree(seq, r.slice(4));
    } catch (e) {
      if (seq === renderSeq) paint(`<section class="wrap stack" style="padding:40px 16px"><h1>Something went wrong</h1><p class="muted">${esc(errMsg(e))}</p><p><a href="#families">Back to family trees</a></p></section>`);
    }
  }

  /* ---------- list page ---------- */
  function treeCard(t) {
    const tw = (t.towns || []).map((w) => `<span class="pill st">${esc(w.name)}, ${esc(w.prov)}</span>`).join("");
    return `<a class="fam-card" href="#fam-${esc(t.slug)}"><span class="eyebrow">${esc(t.people)} ${t.people == 1 ? "person" : "people"}</span><h3>${esc(t.title)}</h3>${t.intro ? `<p class="small muted">${esc(t.intro)}${t.intro.length >= 280 ? "…" : ""}</p>` : ""}${tw ? `<div class="fam-towns">${tw}</div>` : ""}${t.owner_name ? `<p class="small muted">Built by ${esc(t.owner_name)}</p>` : ""}</a>`;
  }
  async function pageList(seq) {
    document.title = "Family trees · TownTales";
    const [{ data, error }, mine] = await Promise.all([
      sb.rpc("family_list", { p_town: null, p_q: null }),
      user ? sb.rpc("family_mine") : Promise.resolve({ data: [] }),
    ]);
    if (error) throw error;
    if (seq !== renderSeq) return;
    const my = (mine && mine.data) || [];
    paint(`<section class="wrap stack" style="padding:36px 16px 56px;gap:24px">
      <div class="fam-hero"><div class="stack" style="gap:10px"><p class="eyebrow">Family trees</p><h1>The families who built these towns</h1><p class="lede">Browse family trees from prairie towns, or build your own. Free to view, free to build.</p></div>
      <div class="btns">${user ? `<a class="btn" href="#fam-new">Build a family tree</a><button class="btn alt sm" id="fam-out" type="button">Sign out</button>` : `<a class="btn" href="#fam-login">Sign in to build a tree</a>`}</div></div>
      ${user ? `<div class="fam-home formbox" style="max-width:620px;gap:10px"><h2 style="font-size:1.3rem">Your home town</h2><p class="small">Pick your home town and the train on the front page will stop there whenever you visit while signed in.</p><div class="fam-home-row"><select id="fam-home" aria-label="Your home town"><option value="">Loading towns…</option></select><button class="btn sm" id="fam-home-save" type="button">Save</button></div><p class="small" id="fam-home-msg" role="status"></p></div>` : ""}
      ${my.length ? `<div class="stack" style="gap:10px"><h2>Your trees</h2><div class="fam-plist">${my.map((t) => `<div class="fam-prow"><div class="who"><b>${esc(t.title)}</b><span class="small muted">${t.status === "published" ? "Published" : t.status === "draft" ? "Draft, only you can see it" : "Hidden by TownTales"}</span></div><div class="btns"><a class="btn alt sm" href="#fam-${esc(t.slug)}">View</a><a class="btn sm" href="#fam-edit-${esc(t.slug)}">Edit</a></div></div>`).join("")}</div></div>` : ""}
      <div class="stack" style="gap:12px"><h2>All family trees</h2>
      <div class="field" style="max-width:480px"><label for="fam-q">Search by family name or tree</label><input type="text" id="fam-q" placeholder="e.g. Henderson"></div>
      <div class="fam-cards" id="fam-all">${(data || []).length ? data.map(treeCard).join("") : `<p class="muted">No family trees yet. Be the first to start one.</p>`}</div></div>
      <p class="fam-fine">${esc(FINE_GENERAL)} <b>Towns:</b> a tree connected to a town also shows on that town's page.</p>
    </section>`);
    const out = $("#fam-out"); if (out) out.onclick = async () => { await sb.auth.signOut(); user = null; render(); };
    const hs = $("#fam-home");
    if (hs && user) {
      const cur = (user.user_metadata && user.user_metadata.home_town) || "";
      towns().then((ts) => {
        hs.innerHTML = `<option value="">Choose your home town…</option>` + ts.map((t) => `<option value="${esc(t.slug)}"${t.slug === cur ? " selected" : ""}>${esc(t.name)}, ${esc(t.prov)}</option>`).join("");
      }).catch(() => { hs.innerHTML = `<option value="">Couldn't load towns</option>`; });
      $("#fam-home-save").onclick = async () => {
        const msg = $("#fam-home-msg"), slug = hs.value;
        msg.textContent = "Saving…";
        const { data, error } = await sb.auth.updateUser({ data: { home_town: slug || null } });
        if (error) { msg.textContent = "Couldn't save that. Please try again."; return; }
        user = data.user || user;
        if (window.ttHomeTownChanged) window.ttHomeTownChanged(slug);
        msg.textContent = slug ? "Saved. The train will stop at " + hs.options[hs.selectedIndex].text + " when you visit." : "Cleared.";
      };
    }
    let tm; const q = $("#fam-q");
    if (q) q.addEventListener("input", () => { clearTimeout(tm); tm = setTimeout(async () => {
      const { data: d } = await sb.rpc("family_list", { p_town: null, p_q: q.value.trim() || null });
      const box = $("#fam-all"); if (box) box.innerHTML = (d || []).length ? d.map(treeCard).join("") : `<p class="muted">No trees match “${esc(q.value)}”.</p>`;
    }, 250); });
  }

  /* ---------- login ---------- */
  function pageLogin(mode) {
    document.title = "Sign in · Family trees · TownTales";
    mode = mode || "in";
    const next = sessionStorage.getItem("fam-next") || "#families";
    if (user) { location.hash = next.slice(1); return; }
    paint(`<section class="wrap stack" style="padding:36px 16px 56px;gap:20px">
      <p class="eyebrow"><a href="#families">Family trees</a></p><h1>${mode === "up" ? "Create your free account" : mode === "forgot" ? "Reset your password" : "Sign in to TownTales"}</h1>${mode !== "forgot" ? `<p class="lede" style="font-size:1.05rem">With a free account you can build family trees and pick your home town, so the train stops there when you visit.</p>` : ""}
      <p class="lede">You only need an account to build or edit a tree. Anyone can view published trees.</p>
      <form class="formbox" id="fam-auth" novalidate>
        <div class="fam-tabs"><button type="button" class="btn sm ${mode === "in" ? "" : "alt"}" data-m="in">Sign in</button><button type="button" class="btn sm ${mode === "up" ? "" : "alt"}" data-m="up">Create account</button></div>
        ${mode === "up" ? `<div class="field"><label for="fa-name">Your name <span class="muted small">(shown on your trees as “Built by”)</span></label><input type="text" id="fa-name" autocomplete="name" maxlength="80"></div>` : ""}
        <div class="field"><label for="fa-email">Email</label><input type="email" id="fa-email" autocomplete="email" required></div>
        ${mode !== "forgot" ? `<div class="field"><label for="fa-pass">Password ${mode === "up" ? `<span class="muted small">(8 characters or more)</span>` : ""}</label><input type="password" id="fa-pass" autocomplete="${mode === "up" ? "new-password" : "current-password"}" minlength="8" required></div>` : ""}
        <p class="fam-err" id="fa-err" hidden></p><p class="fam-ok" id="fa-ok" hidden></p>
        <div class="btns"><button class="btn" type="submit">${mode === "up" ? "Create account" : mode === "forgot" ? "Email me a reset link" : "Sign in"}</button>${mode === "in" ? `<button type="button" class="fam-chip" data-m="forgot">Forgot password?</button>` : ""}</div>
        <p class="fam-fine">We use your email only to sign you in. It is never shown on the site.</p>
      </form></section>`);
    $$("#fam-auth [data-m]").forEach((b) => (b.onclick = () => pageLogin(b.dataset.m)));
    $("#fam-auth").onsubmit = async (e) => {
      e.preventDefault();
      const err = $("#fa-err"), ok = $("#fa-ok"); err.hidden = ok.hidden = true;
      const email = $("#fa-email").value.trim(), pass = $("#fa-pass") ? $("#fa-pass").value : "";
      const btn = e.submitter || $("#fam-auth button[type=submit]"); btn.disabled = true;
      try {
        if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Please enter a valid email address.");
        if (mode === "forgot") {
          const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + "/" });
          if (error) throw error;
          ok.textContent = "If that email has an account, a reset link is on its way."; ok.hidden = false;
        } else if (mode === "up") {
          if (pass.length < 8) throw new Error("Please use a password of at least 8 characters.");
          const name = ($("#fa-name").value || "").trim();
          const { data, error } = await sb.auth.signUp({ email, password: pass, options: { data: { name }, emailRedirectTo: location.origin + "/" } });
          if (error) throw error;
          if (data.session) { user = data.session.user; location.hash = next.slice(1); }
          else { ok.textContent = "Almost done. Check your email and click the link to confirm your account, then come back and sign in."; ok.hidden = false; }
        } else {
          const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
          if (error) throw error;
          user = data.user; sessionStorage.removeItem("fam-next"); location.hash = next.slice(1);
        }
      } catch (x) { err.textContent = errMsg(x); err.hidden = false; }
      btn.disabled = false;
    };
  }
  function pageReset() {
    document.title = "New password · TownTales";
    paint(`<section class="wrap stack" style="padding:36px 16px 56px;gap:20px"><h1>Choose a new password</h1>
      <form class="formbox" id="fam-rs"><div class="field"><label for="fr-pass">New password</label><input type="password" id="fr-pass" minlength="8" autocomplete="new-password" required></div>
      <p class="fam-err" id="fr-err" hidden></p><div class="btns"><button class="btn" type="submit">Save password</button></div></form></section>`);
    $("#fam-rs").onsubmit = async (e) => {
      e.preventDefault(); const err = $("#fr-err"); err.hidden = true;
      const { error } = await sb.auth.updateUser({ password: $("#fr-pass").value });
      if (error) { err.textContent = errMsg(error); err.hidden = false; return; }
      location.hash = "families";
    };
  }
  function needLogin(next) { sessionStorage.setItem("fam-next", next); location.hash = "fam-login"; }

  /* ---------- tree layout ---------- */
  function layout(t) {
    const P = {}; t.people.forEach((p) => (P[p.id] = p));
    const parentsOf = (p) => [p.parent1, p.parent2].filter((id) => id && P[id]);
    const spouses = {}; t.unions.forEach((u) => { if (!P[u.a] || !P[u.b]) return; (spouses[u.a] = spouses[u.a] || []).push(u.b); (spouses[u.b] = spouses[u.b] || []).push(u.a); });
    const gen = {}; t.people.forEach((p) => (gen[p.id] = 0));
    for (let k = 0; k < 14; k++) {
      let changed = false;
      t.people.forEach((p) => { const ps = parentsOf(p); if (ps.length) { const g = Math.max(...ps.map((x) => gen[x])) + 1; if (g !== gen[p.id] && g < 60) { gen[p.id] = g; changed = true; } } });
      t.unions.forEach((u) => {
        if (!P[u.a] || !P[u.b]) return;
        const ha = parentsOf(P[u.a]).length, hb = parentsOf(P[u.b]).length;
        const set = (id, g) => { if (gen[id] !== g) { gen[id] = g; changed = true; } };
        if (!ha && hb) set(u.a, gen[u.b]); else if (ha && !hb) set(u.b, gen[u.a]);
        else if (!ha && !hb) { const g = Math.max(gen[u.a], gen[u.b]); set(u.a, g); set(u.b, g); }
      });
      if (!changed) break;
    }
    const levels = [...new Set(Object.values(gen))].sort((a, b) => a - b);
    const pos = {}, rows = [];
    levels.forEach((L) => {
      const inRow = t.people.filter((p) => gen[p.id] === L);
      const placed = new Set();
      const key = (p) => { const ps = parentsOf(p).filter((x) => pos[x] != null); return ps.length ? ps.reduce((s, x) => s + pos[x], 0) / ps.length : 2 + (p.born_year || 3000) / 10000; };
      const attached = (p) => !parentsOf(p).length && (spouses[p.id] || []).some((s) => gen[s] === L && parentsOf(P[s]).length);
      const anchors = inRow.filter((p) => !attached(p)).sort((a, b) => key(a) - key(b) || (a.born_year || 3000) - (b.born_year || 3000));
      const units = [];
      anchors.forEach((a) => {
        if (placed.has(a.id)) return;
        const u = [a]; placed.add(a.id);
        (spouses[a.id] || []).forEach((s) => { if (!placed.has(s) && gen[s] === L && (!parentsOf(P[s]).length)) { u.push(P[s]); placed.add(s); } });
        units.push(u);
      });
      inRow.forEach((p) => { if (!placed.has(p.id)) { units.push([p]); placed.add(p.id); } });
      const flat = units.flat(); flat.forEach((p, i) => (pos[p.id] = (i + 0.5) / flat.length));
      rows.push(units);
    });
    return { rows, P, parentsOf, spouses };
  }
  function nodeHTML(p) {
    const priv = p.living && p.surname === undefined;
    return `<button type="button" class="fam-node${priv ? " priv" : ""}" data-pid="${esc(p.id)}">${p.photo_url ? `<img src="${esc(p.photo_url)}" alt="" loading="lazy">` : ""}<div><b>${esc(fullName(p))}</b>${p.maiden ? `<span>née ${esc(p.maiden)}</span>` : ""}<span>${esc(lifeSpan(p))}</span></div></button>`;
  }
  function chartHTML(t) {
    if (!t.people.length) return `<div class="fam-chart"><p class="muted" style="padding:22px">No one has been added to this tree yet.</p></div>`;
    const { rows } = layout(t);
    return `<div class="fam-chart" id="fam-chart"><div class="fam-gens" id="fam-gens"><svg class="fam-lines" id="fam-lines" aria-hidden="true"></svg>${rows.map((units) => `<div class="fam-row">${units.map((u) => `<div class="fam-unit">${u.map(nodeHTML).join('<span class="fam-ring" aria-hidden="true">&amp;</span>')}</div>`).join("")}</div>`).join("")}</div></div>`;
  }
  function drawLines(t) {
    const g = $("#fam-gens"), svg = $("#fam-lines"); if (!g || !svg) return;
    const box = g.getBoundingClientRect();
    svg.setAttribute("width", g.scrollWidth); svg.setAttribute("height", g.scrollHeight);
    svg.setAttribute("viewBox", `0 0 ${g.scrollWidth} ${g.scrollHeight}`);
    const at = (id) => { const el = g.querySelector(`[data-pid="${id}"]`); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left - box.left + r.width / 2, top: r.top - box.top, bot: r.bottom - box.top }; };
    let d = "";
    t.people.forEach((p) => {
      const ps = [p.parent1, p.parent2].filter(Boolean).map(at).filter(Boolean); if (!ps.length) return;
      const c = at(p.id); if (!c) return;
      const sx = ps.reduce((s, q) => s + q.x, 0) / ps.length, sy = Math.max(...ps.map((q) => q.bot));
      const my = c.top - 22;
      d += `M${sx.toFixed(1)} ${sy.toFixed(1)}V${my.toFixed(1)}H${c.x.toFixed(1)}V${c.top.toFixed(1)}`;
    });
    svg.innerHTML = d ? `<path d="${d}"/>` : "";
  }
  function detailHTML(t, id, L) {
    const p = L.P[id]; if (!p) return "";
    const priv = p.living && p.surname === undefined;
    const chip = (q) => `<button type="button" class="fam-chip" data-go="${esc(q.id)}">${esc(fullName(q))}</button>`;
    const parents = L.parentsOf(p).map((x) => L.P[x]);
    const sp = t.unions.filter((u) => u.a === id || u.b === id).map((u) => ({ q: L.P[u.a === id ? u.b : u.a], label: u.label })).filter((x) => x.q);
    const kids = t.people.filter((q) => q.parent1 === id || q.parent2 === id);
    const facts = priv ? [] : [
      p.born_label || p.born_place ? `<b>Born:</b> ${esc([p.born_label, p.born_place].filter(Boolean).join(", "))}` : "",
      p.died_label || p.died_place ? `<b>Died:</b> ${esc([p.died_label, p.died_place].filter(Boolean).join(", "))}` : "",
    ].filter(Boolean);
    return `<div class="fam-detail" id="fam-detail">
      <div class="stack" style="gap:6px"><h2>${esc(fullName(p))}</h2>${p.maiden ? `<p class="muted">née ${esc(p.maiden)}</p>` : ""}${priv ? `<p class="muted">This person is marked as living, so their details are private.</p>` : facts.map((f) => `<p>${f}</p>`).join("")}</div>
      ${!priv && p.photo_url ? `<img src="${esc(p.photo_url)}" alt="Photo of ${esc(fullName(p))}">` : ""}
      ${!priv && p.bio ? `<p style="white-space:pre-wrap">${esc(p.bio)}</p>` : ""}
      ${parents.length ? `<div class="fam-rel"><b>Parents:</b>${parents.map(chip).join("")}</div>` : ""}
      ${sp.length ? `<div class="fam-rel"><b>Spouse${sp.length > 1 ? "s" : ""}:</b>${sp.map((x) => chip(x.q) + (x.label ? `<span class="small muted">${esc(x.label)}</span>` : "")).join("")}</div>` : ""}
      ${kids.length ? `<div class="fam-rel"><b>Children:</b>${kids.map(chip).join("")}</div>` : ""}
    </div>`;
  }
  function wireChart(t, root, onPick) {
    const L = layout(t);
    const pick = (id, scroll) => {
      $$(".fam-node", root).forEach((n) => n.classList.toggle("on", n.dataset.pid === id));
      if (onPick) return onPick(id);
      const slot = $("#fam-detail-slot", root); if (!slot) return;
      slot.innerHTML = detailHTML(t, id, L);
      $$("[data-go]", slot).forEach((b) => (b.onclick = () => { pick(b.dataset.go, true); const n = root.querySelector(`.fam-node[data-pid="${b.dataset.go}"]`); if (n) n.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" }); }));
      if (scroll) slot.scrollIntoView({ block: "nearest", behavior: "smooth" });
    };
    $$(".fam-node", root).forEach((n) => (n.onclick = () => pick(n.dataset.pid, true)));
    requestAnimationFrame(() => { drawLines(t); const c = $("#fam-chart"); if (c && c.scrollWidth > c.clientWidth) c.scrollLeft = (c.scrollWidth - c.clientWidth) / 2; });
    $$("img", root).forEach((im) => im.addEventListener("load", () => drawLines(t), { once: true }));
    if (wireChart.ro) wireChart.ro.disconnect();
    if (window.ResizeObserver && $("#fam-gens")) { wireChart.ro = new ResizeObserver(() => drawLines(t)); wireChart.ro.observe($("#fam-gens")); }
    return pick;
  }

  /* ---------- tree page ---------- */
  async function pageTree(seq, slug) {
    const { data: t, error } = await sb.rpc("family_get", { p_slug: slug });
    if (error) throw error;
    if (seq !== renderSeq) return;
    if (!t) { paint(`<section class="wrap stack" style="padding:40px 16px"><h1>Tree not found</h1><p class="muted">It may have been removed or made private.</p><p><a href="#families">See all family trees</a></p></section>`); return; }
    document.title = t.title + " · Family trees · TownTales";
    const link = location.origin + "/#fam-" + t.slug;
    paint(`<section class="wrap stack" style="padding:36px 16px 56px;gap:22px">
      <p class="eyebrow"><a href="#families">Family trees</a>${t.towns.map((w) => ` · <a href="/${esc(w.slug)}">${esc(w.name)}</a>`).join("")}</p>
      <div class="fam-hero"><div class="stack" style="gap:8px"><h1>${esc(t.title)}</h1>${t.owner_name ? `<p class="hand">Built by ${esc(t.owner_name)}</p>` : ""}${t.status !== "published" ? `<p><span class="pill warn">${t.status === "draft" ? "Draft: only you can see this" : "Hidden by TownTales"}</span></p>` : ""}</div>
      <div class="btns">${t.mine ? `<a class="btn" href="#fam-edit-${esc(t.slug)}">Edit this tree</a>` : ""}<button class="btn alt sm" type="button" id="fam-share">Copy link</button></div></div>
      ${t.intro ? `<p class="lede" style="white-space:pre-wrap">${esc(t.intro)}</p>` : ""}
      ${t.towns.length ? `<div class="fam-rel"><b>Connected towns:</b>${t.towns.map((w) => `<a class="fam-chip" href="/${esc(w.slug)}">${esc(w.name)}, ${esc(w.prov)}</a>`).join("")}</div>` : ""}
      <p class="small muted">Tap anyone in the tree to see their story.</p>
      ${chartHTML(t)}
      <div id="fam-detail-slot"></div>
      <p class="fam-fine">People marked as living show a first name only. See something wrong or private? <a href="#corrections">Ask for a correction or removal</a>.</p>
    </section>`);
    const root = view();
    wireChart(t, root);
    $("#fam-share").onclick = async () => { try { await navigator.clipboard.writeText(link); $("#fam-share").textContent = "Link copied"; } catch (e) { prompt("Copy this link:", link); } };
  }

  /* ---------- new tree ---------- */
  function townPicker(selected, all) {
    const sel = new Set(selected);
    return `<div class="field"><label for="ft-townq">Connected towns</label>
      <div class="fam-rel" id="ft-chips">${all.filter((w) => sel.has(w.slug)).map((w) => `<span class="fam-chip" data-slug="${esc(w.slug)}">${esc(w.name)}, ${esc(w.prov)} <button type="button" class="fam-x" aria-label="Remove ${esc(w.name)}">×</button></span>`).join("") || `<span class="small muted">No towns connected yet.</span>`}</div>
      <input type="text" id="ft-townq" list="ft-townlist" placeholder="Type a town name, then pick it">
      <datalist id="ft-townlist">${all.map((w) => `<option value="${esc(w.name)}, ${esc(w.prov)}"></option>`).join("")}</datalist>
      <p class="fam-fine"><b>What connecting a town does:</b> ${esc(FINE_TOWNS)} Don't see your town? <a href="#addtown">Add it first</a>.</p></div>`;
  }
  function wireTownPicker(all, selected) {
    const sel = new Set(selected);
    const draw = () => {
      const chips = $("#ft-chips"); if (!chips) return;
      chips.innerHTML = all.filter((w) => sel.has(w.slug)).map((w) => `<span class="fam-chip" data-slug="${esc(w.slug)}">${esc(w.name)}, ${esc(w.prov)} <button type="button" class="fam-x" aria-label="Remove ${esc(w.name)}">×</button></span>`).join("") || `<span class="small muted">No towns connected yet.</span>`;
      $$(".fam-x", chips).forEach((b) => (b.onclick = () => { sel.delete(b.parentElement.dataset.slug); draw(); }));
    };
    const q = $("#ft-townq");
    const tryAdd = () => { const v = q.value.trim().toLowerCase(); const w = all.find((x) => (x.name + ", " + x.prov).toLowerCase() === v); if (w) { sel.add(w.slug); q.value = ""; draw(); } };
    q.addEventListener("change", tryAdd); q.addEventListener("input", tryAdd);
    q.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); tryAdd(); } });
    draw();
    return () => [...sel];
  }
  async function pageNew(seq, preTown) {
    document.title = "Build a family tree · TownTales";
    if (!user) return needLogin("#fam-new" + (preTown ? "~" + preTown : ""));
    const all = await towns();
    if (seq !== renderSeq) return;
    const myName = (user.user_metadata && user.user_metadata.name) || "";
    paint(`<section class="wrap stack" style="padding:36px 16px 56px;gap:20px">
      <p class="eyebrow"><a href="#families">Family trees</a></p><h1>Start a family tree</h1>
      <p class="lede">Give your tree a name and connect the towns your family lived in. You'll add people on the next screen.</p>
      <form class="formbox" id="fam-newf" novalidate>
        <div class="field"><label for="ft-title">Tree name</label><input type="text" id="ft-title" maxlength="120" placeholder="e.g. The Hendersons of Wapella" required></div>
        <div class="grid2"><div class="field"><label for="ft-surname">Main family name</label><input type="text" id="ft-surname" maxlength="80" placeholder="Henderson"></div>
        <div class="field"><label for="ft-owner">Your name, shown as “Built by”</label><input type="text" id="ft-owner" maxlength="80" value="${esc(myName)}"></div></div>
        <div class="field"><label for="ft-intro">About this family <span class="muted small">(optional)</span></label><textarea id="ft-intro" maxlength="8000" placeholder="Where they came from, when they arrived, what they did…"></textarea></div>
        ${townPicker(preTown ? [preTown] : [], all)}
        <p class="fam-fine">${esc(FINE_GENERAL)}</p>
        <p class="fam-err" id="ft-err" hidden></p>
        <div class="btns"><button class="btn" type="submit">Create tree and add people</button><a href="#families" class="btn alt sm">Cancel</a></div>
      </form></section>`);
    const getTowns = wireTownPicker(all, preTown ? [preTown] : []);
    $("#fam-newf").onsubmit = async (e) => {
      e.preventDefault(); const err = $("#ft-err"); err.hidden = true;
      const title = $("#ft-title").value.trim();
      if (title.length < 2) { err.textContent = "Please give the tree a name."; err.hidden = false; return; }
      const btn = $("#fam-newf button[type=submit]"); btn.disabled = true;
      try {
        const { data, error } = await sb.from("family_trees").insert({ title, surname: $("#ft-surname").value.trim(), owner_name: $("#ft-owner").value.trim(), intro: $("#ft-intro").value.trim(), status: "published" }).select("id,slug").single();
        if (error) throw error;
        const tw = getTowns();
        if (tw.length) { const { error: e2 } = await sb.from("family_tree_towns").insert(tw.map((town) => ({ tree: data.id, town }))); if (e2) throw e2; }
        location.hash = "fam-edit-" + data.slug;
      } catch (x) { err.textContent = errMsg(x); err.hidden = false; btn.disabled = false; }
    };
  }

  /* ---------- builder ---------- */
  let ED = null; // { t, all }
  async function pageEdit(seq, slug) {
    if (!user) return needLogin("#fam-edit-" + slug);
    const [{ data: t, error }, all] = await Promise.all([sb.rpc("family_get", { p_slug: slug }), towns()]);
    if (error) throw error;
    if (seq !== renderSeq) return;
    if (!t || !t.mine) { paint(`<section class="wrap stack" style="padding:40px 16px"><h1>You can't edit this tree</h1><p class="muted">Only the person who built a tree can edit it.</p><p><a href="#fam-${esc(slug)}">View the tree</a></p></section>`); return; }
    ED = { t, all };
    document.title = "Editing " + t.title + " · TownTales";
    drawEditor();
  }
  async function reloadTree(keepOpen) {
    const { data, error } = await sb.rpc("family_get", { p_slug: ED.t.slug });
    if (error) throw error;
    ED.t = data; drawEditor(keepOpen);
  }
  function drawEditor(openPid) {
    const t = ED.t;
    const people = t.people.slice().sort((a, b) => (a.born_year || 3000) - (b.born_year || 3000) || fullName(a).localeCompare(fullName(b)));
    paint(`<section class="wrap stack" style="padding:36px 16px 56px;gap:22px">
      <p class="eyebrow"><a href="#families">Family trees</a> · Editing</p>
      <div class="fam-hero"><div class="stack" style="gap:6px"><h1>${esc(t.title)}</h1><p class="muted">${t.people.length} ${t.people.length === 1 ? "person" : "people"} · ${t.status === "published" ? "Published, anyone can view it" : t.status === "draft" ? "Draft, only you can see it" : "Hidden by TownTales"}</p></div>
      <div class="btns"><a class="btn alt sm" href="#fam-${esc(t.slug)}">View as visitors see it</a><button class="btn" type="button" id="fe-add">Add a person</button></div></div>
      <div id="fe-form-slot"></div>
      ${t.people.length ? `<div class="stack" style="gap:10px"><h2>Tree preview</h2><p class="small muted">Tap a person to edit them.</p>${chartHTML(t)}</div>` : `<div class="formbox"><h2>Add the first person</h2><p>Start with the oldest ancestor you know about, or with yourself and work back. You can add parents, spouses and children from each person.</p><div class="btns"><button class="btn" type="button" id="fe-add2">Add the first person</button></div></div>`}
      ${t.people.length ? `<div class="stack" style="gap:10px"><h2>Everyone in this tree</h2><div class="fam-plist">${people.map((p) => `<div class="fam-prow"><div class="who"><b>${esc(fullName(p))}${p.living ? ` <span class="pill st">Living</span>` : ""}</b><span class="small muted">${esc(lifeSpan(p) || "No dates yet")}</span></div><div class="btns"><button class="btn alt sm" data-edit="${esc(p.id)}" type="button">Edit</button><button class="btn alt sm" data-rel="child" data-of="${esc(p.id)}" type="button">+ Child</button><button class="btn alt sm" data-rel="spouse" data-of="${esc(p.id)}" type="button">+ Spouse</button><button class="btn alt sm" data-rel="parent" data-of="${esc(p.id)}" type="button">+ Parent</button></div></div>`).join("")}</div></div>` : ""}
      <details class="formbox" id="fe-settings"><summary><b>Tree settings: name, about, towns, privacy</b></summary>
        <form id="fe-tf" class="stack" style="gap:16px;margin-top:16px" novalidate>
          <div class="field"><label for="ft-title">Tree name</label><input type="text" id="ft-title" maxlength="120" value="${esc(t.title)}"></div>
          <div class="grid2"><div class="field"><label for="ft-surname">Main family name</label><input type="text" id="ft-surname" maxlength="80" value="${esc(t.surname)}"></div>
          <div class="field"><label for="ft-owner">Your name, shown as “Built by”</label><input type="text" id="ft-owner" maxlength="80" value="${esc(t.owner_name)}"></div></div>
          <div class="field"><label for="ft-intro">About this family</label><textarea id="ft-intro" maxlength="8000">${esc(t.intro)}</textarea></div>
          ${townPicker(t.towns.map((w) => w.slug), ED.all)}
          ${t.status === "hidden" ? `<p class="fam-fine">TownTales has hidden this tree. <a href="#corrections">Contact us</a> if you think that's a mistake.</p>` : `<div class="field"><label for="ft-status">Who can see this tree</label><select id="ft-status"><option value="published"${t.status === "published" ? " selected" : ""}>Published: anyone can view it</option><option value="draft"${t.status === "draft" ? " selected" : ""}>Draft: only me</option></select></div>`}
          <p class="fam-err" id="ft-err" hidden></p><p class="fam-ok" id="ft-ok" hidden></p>
          <div class="btns"><button class="btn" type="submit">Save settings</button><button class="btn alt sm" type="button" id="fe-del" style="border-color:var(--bad);color:var(--bad)">Delete this tree</button></div>
        </form></details>
      <p class="fam-fine">${esc(FINE_GENERAL)} <b>Living people:</b> anyone marked “living” shows to visitors as a first name only, with no dates, places, photos or story. Only you see their full details here.</p>
    </section>`);
    const root = view();
    if (t.people.length) wireChart(t, root, (id) => personForm(id));
    [$("#fe-add"), $("#fe-add2")].forEach((b) => b && (b.onclick = () => personForm(null)));
    $$("[data-edit]").forEach((b) => (b.onclick = () => personForm(b.dataset.edit)));
    $$("[data-rel]").forEach((b) => (b.onclick = () => personForm(null, { rel: b.dataset.rel, of: b.dataset.of })));
    const getTowns = wireTownPicker(ED.all, t.towns.map((w) => w.slug));
    $("#fe-tf").onsubmit = async (e) => {
      e.preventDefault(); const err = $("#ft-err"), ok = $("#ft-ok"); err.hidden = ok.hidden = true;
      try {
        const patch = { title: $("#ft-title").value.trim(), surname: $("#ft-surname").value.trim(), owner_name: $("#ft-owner").value.trim(), intro: $("#ft-intro").value.trim() };
        if ($("#ft-status")) patch.status = $("#ft-status").value;
        if (patch.title.length < 2) throw new Error("Please give the tree a name.");
        const { error } = await sb.from("family_trees").update(patch).eq("id", t.id); if (error) throw error;
        const want = new Set(getTowns()), have = new Set(t.towns.map((w) => w.slug));
        const add = [...want].filter((s) => !have.has(s)), del = [...have].filter((s) => !want.has(s));
        if (del.length) { const { error: e2 } = await sb.from("family_tree_towns").delete().eq("tree", t.id).in("town", del); if (e2) throw e2; }
        if (add.length) { const { error: e3 } = await sb.from("family_tree_towns").insert(add.map((town) => ({ tree: t.id, town }))); if (e3) throw e3; }
        await reloadTree();
        const o = $("#ft-ok"); if (o) { $("#fe-settings").open = true; o.textContent = "Saved."; o.hidden = false; }
      } catch (x) { err.textContent = errMsg(x); err.hidden = false; }
    };
    $("#fe-del").onclick = async () => {
      if (!confirm(`Delete “${t.title}” and everyone in it? This can't be undone.`)) return;
      const { error } = await sb.from("family_trees").delete().eq("id", t.id);
      if (error) return alert(errMsg(error));
      location.hash = "families";
    };
    if (openPid) personForm(openPid);
  }

  function personForm(pid, ctx) {
    const t = ED.t, P = {}; t.people.forEach((p) => (P[p.id] = p));
    const p = pid ? P[pid] : null;
    const of = ctx && P[ctx.of];
    const pre = { given: "", surname: "", maiden: "", sex: "", born_label: "", born_place: "", died_label: "", died_place: "", living: true, bio: "", photo_url: "", parent1: null, parent2: null };
    if (ctx && of) {
      if (ctx.rel === "child") {
        pre.parent1 = of.id;
        const sp = t.unions.filter((u) => u.a === of.id || u.b === of.id).map((u) => (u.a === of.id ? u.b : u.a));
        if (sp.length === 1) pre.parent2 = sp[0];
        pre.surname = of.sex === "F" && sp.length === 1 && P[sp[0]] ? P[sp[0]].surname || "" : of.surname || "";
      }
      if (ctx.rel === "parent") pre.surname = of.surname || "";
    }
    const v = Object.assign({}, pre, p || {});
    const others = t.people.filter((q) => !p || q.id !== p.id).sort((a, b) => fullName(a).localeCompare(fullName(b)));
    const opt = (sel) => `<option value="">Not in this tree / unknown</option>` + others.map((q) => `<option value="${esc(q.id)}"${sel === q.id ? " selected" : ""}>${esc(fullName(q))}${q.born_year ? " (" + q.born_year + ")" : ""}</option>`).join("");
    const myUnions = p ? t.unions.filter((u) => u.a === p.id || u.b === p.id) : [];
    const title = p ? "Edit " + fullName(p) : ctx && of ? `Add a ${ctx.rel} of ${fullName(of)}` : "Add a person";
    const slot = $("#fe-form-slot");
    slot.innerHTML = `<form class="formbox" id="fp" novalidate style="max-width:none">
      <h2>${esc(title)}</h2>
      <div class="grid2"><div class="field"><label for="fp-given">First and middle names</label><input type="text" id="fp-given" maxlength="80" value="${esc(v.given)}" required></div>
      <div class="field"><label for="fp-surname">Last name</label><input type="text" id="fp-surname" maxlength="80" value="${esc(v.surname)}"></div>
      <div class="field"><label for="fp-maiden">Maiden name <span class="muted small">(if different)</span></label><input type="text" id="fp-maiden" maxlength="80" value="${esc(v.maiden)}"></div>
      <div class="field"><label for="fp-sex">Sex</label><select id="fp-sex"><option value="">Not stated</option><option value="F"${v.sex === "F" ? " selected" : ""}>Female</option><option value="M"${v.sex === "M" ? " selected" : ""}>Male</option><option value="X"${v.sex === "X" ? " selected" : ""}>Other</option></select></div></div>
      <div class="grid2"><div class="field"><label for="fp-born">Born <span class="muted small">(e.g. 1882, Spring 1882, about 1880)</span></label><input type="text" id="fp-born" maxlength="40" value="${esc(v.born_label)}"></div>
      <div class="field"><label for="fp-bplace">Birthplace</label><input type="text" id="fp-bplace" maxlength="120" value="${esc(v.born_place)}"></div>
      <div class="field"><label for="fp-died">Died</label><input type="text" id="fp-died" maxlength="40" value="${esc(v.died_label)}"></div>
      <div class="field"><label for="fp-dplace">Place of death or burial</label><input type="text" id="fp-dplace" maxlength="120" value="${esc(v.died_place)}"></div></div>
      <label class="fam-check"><input type="checkbox" id="fp-living"${v.living ? " checked" : ""}><span><b>This person is living</b><br><span class="small muted">Visitors will see a first name only: no dates, places, photo or story. We tick this automatically for anyone without a death date who was born in the last 100 years.</span></span></label>
      <div class="field"><label for="fp-bio">Their story <span class="muted small">(optional)</span></label><textarea id="fp-bio" maxlength="8000" placeholder="Where they farmed, what they did, memories, how they came to town…">${esc(v.bio)}</textarea></div>
      <div class="field"><label for="fp-photo">Photo <span class="muted small">(optional, JPG, PNG or WebP)</span></label>${v.photo_url ? `<div class="fam-rel" id="fp-curphoto"><img src="${esc(v.photo_url)}" alt="" style="width:72px;height:72px;object-fit:cover;border:2px solid var(--ink)"><button type="button" class="fam-chip" id="fp-rmphoto">Remove photo</button></div>` : ""}<input type="file" id="fp-photo" accept="image/jpeg,image/png,image/webp"></div>
      <div class="grid2"><div class="field"><label for="fp-p1">Parent</label><select id="fp-p1">${opt(v.parent1)}</select></div>
      <div class="field"><label for="fp-p2">Other parent</label><select id="fp-p2">${opt(v.parent2)}</select></div></div>
      ${ctx && ctx.rel === "parent" ? `<p class="small muted">After saving, this person will be set as a parent of ${esc(fullName(of))}.</p>` : ""}
      ${ctx && ctx.rel === "spouse" ? `<div class="field"><label for="fp-ulabel">Marriage <span class="muted small">(optional, e.g. m. 1912, Wapella)</span></label><input type="text" id="fp-ulabel" maxlength="120"></div>` : ""}
      ${p ? `<div class="field"><span class="lbl">Spouses and partners</span><div class="stack" style="gap:6px" id="fp-unions">${myUnions.length ? myUnions.map((u) => { const q = P[u.a === p.id ? u.b : u.a]; return `<div class="fam-rel"><span>${esc(q ? fullName(q) : "?")}</span>${u.label ? `<span class="small muted">${esc(u.label)}</span>` : ""}<button type="button" class="fam-x" data-unlink="${esc(u.id)}">Remove link</button></div>`; }).join("") : `<span class="small muted">None yet.</span>`}</div>
        <div class="grid2"><select id="fp-newsp"><option value="">Link a spouse already in this tree…</option>${others.filter((q) => !myUnions.some((u) => u.a === q.id || u.b === q.id)).map((q) => `<option value="${esc(q.id)}">${esc(fullName(q))}</option>`).join("")}</select><input type="text" id="fp-newsplabel" maxlength="120" placeholder="Marriage, e.g. m. 1912, Wapella"></div></div>` : ""}
      <p class="fam-err" id="fp-err" hidden></p>
      <div class="btns"><button class="btn" type="submit">${p ? "Save changes" : "Add to tree"}</button><button type="button" class="btn alt sm" id="fp-cancel">Cancel</button>${p ? `<button type="button" class="btn alt sm" id="fp-del" style="border-color:var(--bad);color:var(--bad)">Remove from tree</button>` : ""}</div>
    </form>`;
    slot.scrollIntoView({ block: "start", behavior: "smooth" });
    setTimeout(() => { const g = $("#fp-given"); if (g) g.focus({ preventScroll: true }); }, 250);
    // living auto-tick until the user touches it
    let livingTouched = !!p;
    const autoLiving = () => {
      if (livingTouched) return;
      const by = yearOf($("#fp-born").value), dl = $("#fp-died").value.trim() || $("#fp-dplace").value.trim();
      $("#fp-living").checked = !dl && (!by || by > THIS_YEAR - 100);
    };
    ["#fp-born", "#fp-died", "#fp-dplace"].forEach((s) => $(s).addEventListener("input", autoLiving));
    $("#fp-living").addEventListener("change", () => (livingTouched = true));
    let removePhoto = false;
    if ($("#fp-rmphoto")) $("#fp-rmphoto").onclick = () => { removePhoto = true; $("#fp-curphoto").remove(); };
    $("#fp-cancel").onclick = () => { slot.innerHTML = ""; };
    $$("[data-unlink]", slot).forEach((b) => (b.onclick = async () => {
      const { error } = await sb.from("family_unions").delete().eq("id", b.dataset.unlink);
      if (error) return alert(errMsg(error));
      await reloadTree(p.id);
    }));
    if ($("#fp-del")) $("#fp-del").onclick = async () => {
      if (!confirm(`Remove ${fullName(p)} from this tree? Their links to parents, spouses and children will be removed too.`)) return;
      const { error } = await sb.from("family_people").delete().eq("id", p.id);
      if (error) return alert(errMsg(error));
      await reloadTree();
    };
    $("#fp").onsubmit = async (e) => {
      e.preventDefault(); const err = $("#fp-err"); err.hidden = true;
      const btn = $("#fp button[type=submit]"); btn.disabled = true; btn.textContent = "Saving…";
      try {
        const given = $("#fp-given").value.trim(); if (!given) throw new Error("Please enter at least a first name.");
        const p1 = $("#fp-p1").value || null, p2 = $("#fp-p2").value || null;
        if (p1 && p1 === p2) throw new Error("The two parents can't be the same person.");
        const row = {
          tree: t.id, given, surname: $("#fp-surname").value.trim(), maiden: $("#fp-maiden").value.trim(), sex: $("#fp-sex").value,
          born_label: $("#fp-born").value.trim(), born_year: yearOf($("#fp-born").value), born_place: $("#fp-bplace").value.trim(),
          died_label: $("#fp-died").value.trim(), died_year: yearOf($("#fp-died").value), died_place: $("#fp-dplace").value.trim(),
          living: $("#fp-living").checked, bio: $("#fp-bio").value.trim(), parent1: p1, parent2: p2,
        };
        const file = $("#fp-photo").files[0];
        if (file) row.photo_url = await uploadPhoto(file);
        else if (removePhoto) row.photo_url = "";
        let id = p && p.id;
        if (p) { const { error } = await sb.from("family_people").update(row).eq("id", p.id); if (error) throw error; }
        else { const { data, error } = await sb.from("family_people").insert(row).select("id").single(); if (error) throw error; id = data.id; }
        if (!p && ctx && of && ctx.rel === "parent") {
          const slotKey = !of.parent1 ? "parent1" : !of.parent2 ? "parent2" : null;
          if (slotKey) { const { error } = await sb.from("family_people").update({ [slotKey]: id }).eq("id", of.id); if (error) throw error; }
          else alert(`${fullName(of)} already has two parents. ${given} was added, but not linked as a parent.`);
        }
        if (!p && ctx && of && ctx.rel === "spouse") {
          const { error } = await sb.from("family_unions").insert({ tree: t.id, a: of.id, b: id, label: ($("#fp-ulabel").value || "").trim() }); if (error) throw error;
        }
        if (p && $("#fp-newsp") && $("#fp-newsp").value) {
          const { error } = await sb.from("family_unions").insert({ tree: t.id, a: p.id, b: $("#fp-newsp").value, label: $("#fp-newsplabel").value.trim() }); if (error) throw error;
        }
        await reloadTree();
      } catch (x) { err.textContent = errMsg(x); err.hidden = false; btn.disabled = false; btn.textContent = p ? "Save changes" : "Add to tree"; }
    };
  }

  async function shrink(file) {
    if (file.size < 1.5e6 && /^image\/(jpeg|png|webp)$/.test(file.type)) return file;
    try {
      const bmp = await createImageBitmap(file);
      const s = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas"); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      return await new Promise((res) => c.toBlob((b) => res(b || file), "image/jpeg", 0.85));
    } catch (e) { return file; }
  }
  async function uploadPhoto(file) {
    const f = await shrink(file);
    const type = f.type || "image/jpeg";
    if (!/^image\/(jpeg|png|webp)$/.test(type)) throw new Error("Please choose a JPG, PNG or WebP photo.");
    if (f.size > 6e6) throw new Error("That photo is too large. Please choose one under 6 MB.");
    const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
    const path = `${user.id}/${(crypto.randomUUID && crypto.randomUUID()) || Date.now()}.${ext}`;
    const { error } = await sb.storage.from("family").upload(path, f, { contentType: type, upsert: false });
    if (error) throw error;
    return sb.storage.from("family").getPublicUrl(path).data.publicUrl;
  }

  /* ---------- town page block ---------- */
  let townSeq = 0;
  async function townBlock() {
    const slug = townSlugFromPage(); const v = view();
    if (!slug || !v || v.querySelector(".fam-town-block")) return;
    const seq = ++townSeq;
    try {
      await loadSB();
      const { data, error } = await sb.rpc("family_list", { p_town: slug, p_q: null });
      if (error || seq !== townSeq || townSlugFromPage() !== slug || famRoute()) return;
      const all = await towns().catch(() => []);
      const tn = (all.find((w) => w.slug === slug) || {}).name || "this town";
      if (v.querySelector(".fam-town-block")) return;
      const sec = document.createElement("section");
      sec.className = "wrap stack fam-town-block"; sec.style.gap = "14px";
      sec.innerHTML = `<p class="eyebrow">Family trees</p><h2>Families of ${esc(tn)}</h2>
        ${data && data.length ? `<div class="fam-cards">${data.map(treeCard).join("")}</div>` : `<p class="muted">No family trees are connected to ${esc(tn)} yet. Did your family live here?</p>`}
        <div class="btns"><a class="btn alt sm" href="#fam-new~${esc(slug)}">Build a family tree for ${esc(tn)}</a><a class="small" href="#families">See all family trees</a></div>
        <p class="fam-fine">Trees appear here because their builders connected them to ${esc(tn)}. Connecting a tree to a town lists it on that town's page and in the Family Trees section. Living people are shown by first name only.</p>`;
      busy = true; v.appendChild(sec); busy = false;
    } catch (e) { /* family block is optional; never break the town page */ }
  }

  /* ---------- boot ---------- */
  function boot() {
    addStyle(); addNav();
    const v = view(); if (!v) return;
    new MutationObserver(() => { if (busy) return; if (famRoute()) { if (!v.querySelector("[data-fam-page]")) render(); } else { markNav(false); townBlock(); } }).observe(v, { childList: true });
    window.addEventListener("hashchange", () => { if (famRoute()) render(); });
    // Sign-in links come back with ?code=…; load the client so it can finish signing in.
    if (/[?&]code=/.test(location.search)) loadSB().catch(() => {});
    if (famRoute()) render(); else townBlock();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
