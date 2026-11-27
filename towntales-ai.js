/* AI reader panel on #admin (Nov 27 2026). Talks to the ai-reader edge function with the admin key.
   - What the AI has read (photos, clippings, gravestones, book pages), spend this month, retry failed.
   - Whole-book uploads: download all the pages' text in one file.
   - Book update drafts: read, edit, Approve (revision +1) or Reject. */
(function () {
  "use strict";
  function key() { try { return sessionStorage.getItem("tt-admin") || localStorage.getItem("tt-admin-saved") || ""; } catch (e) { return ""; } }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function call(action, payload) {
    var body = { action: action }; for (var k in payload || {}) body[k] = payload[k];
    return fetch(base() + "/functions/v1/ai-reader", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-key": key() }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok || j.error) throw new Error(j.error || "Request failed"); return j; }); });
  }
  var BASE = "";
  function base() { return BASE; }
  var KIND = { photo: "Shared photos", clipping: "Newspaper clippings", memorial_photo: "Gravestone photos", book_page: "Book pages" };
  var STATUS = { queued: "waiting", running: "reading now", done: "read", failed: "failed", skipped: "can't read" };

  function mount() {
    var grp = document.querySelector("#tt-adm .tt-qgroups");
    if (!grp || document.getElementById("tt-ai-grp")) return;
    var d = document.createElement("div"); d.className = "tt-qg"; d.id = "tt-ai-grp";
    d.innerHTML = '<h3>AI reader</h3><p class="small muted">Reads photos, clippings, gravestones and book pages, translates English ↔ French, and drafts book updates for you to approve.</p>' +
      '<div class="btns"><button class="btn sm" data-ai="drafts">Book update drafts</button><button class="btn sm alt" data-ai="status">What the AI read</button></div>';
    grp.appendChild(d);
    var out = document.createElement("div"); out.id = "tt-ai-out"; out.className = "stack";
    grp.parentNode.insertBefore(out, grp.nextSibling);
    document.getElementById("tt-adm").addEventListener("click", onClick);
  }

  function onClick(e) {
    var b = e.target.closest("[data-ai]"); if (!b) return;
    if (b.tagName === "A") e.preventDefault();
    var a = b.getAttribute("data-ai"), out = document.getElementById("tt-ai-out");
    if (a === "status") return status(out);
    if (a === "list") return list(out, b.getAttribute("data-kind"), b.getAttribute("data-status"));
    if (a === "retry-all") return act(b, call("retry", { all: true }), function (r) { b.textContent = r.queued + " queued again"; });
    if (a === "retry") return act(b, call("read-now", { id: b.getAttribute("data-id") }), function (r) { b.textContent = r.ok ? "Read ✓" : "Failed: " + (r.error || ""); });
    if (a === "book-text") return bookText(b);
    if (a === "drafts") return drafts(out);
    if (a === "draft-now") { var slug = window.prompt("Town address to check now (e.g. wapella-sk), or leave empty for every book:", ""); if (slug === null) return; return act(b, call("draft-now", { slug: slug.trim() }), function (r) { b.disabled = false; window.alert((r.books || []).map(function (x) { return x.slug + ": " + (x.error || x.skipped || (x.entries + " new entries drafted")); }).join("\n") || (r.paused || "Done")); drafts(out); }); }
    if (a === "approve" || a === "reject") {
      var card = b.closest("[data-draft]"), id = card.getAttribute("data-draft");
      if (a === "approve" && !window.confirm("Approve this draft? The book's revision number goes up by one.")) return;
      var ta = card.querySelector("textarea"), note = (card.querySelector("[data-note]") || {}).value || "";
      return act(b, call(a === "approve" ? "draft-approve" : "draft-reject", { id: id, draft: ta ? ta.value : undefined, note: note }), function (r) {
        card.querySelector(".tt-msg").textContent = r.status === "approved" ? "Approved. The book is now revision " + r.revision + ". Use this text in the rebuild." : "Rejected. These entries won't be drafted again.";
        card.querySelector(".tt-msg").className = "tt-msg ok";
        card.querySelectorAll("button[data-ai=approve],button[data-ai=reject]").forEach(function (x) { x.remove(); });
      });
    }
    if (a === "copy") { var t = b.closest("[data-draft]").querySelector("textarea"); t.select(); try { navigator.clipboard.writeText(t.value); } catch (er) { document.execCommand("copy"); } b.textContent = "Copied"; }
  }
  function act(b, p, ok) { b.disabled = true; return p.then(ok, function (e) { b.disabled = false; window.alert(e.message); }); }

  function status(out) {
    out.innerHTML = '<p class="muted">Loading…</p>';
    call("status").then(function (r) {
      var rows = Object.keys(KIND).map(function (k) {
        var c = r.counts[k] || {}, n = 0; for (var s in c) n += c[s];
        return "<tr><td>" + KIND[k] + "</td>" + ["done", "queued", "failed", "skipped"].map(function (s) {
          return "<td>" + (c[s] ? '<a href="#" data-ai="list" data-kind="' + k + '" data-status="' + s + '">' + c[s] + "</a>" : "0") + "</td>";
        }).join("") + "<td>" + (n ? '<a href="#" data-ai="list" data-kind="' + k + '">all</a>' : "") + "</td></tr>";
      }).join("");
      out.innerHTML = "<h3>What the AI has read</h3>" +
        (r.key ? "" : '<div class="notice warn"><p><b>Not switched on yet:</b> add the OPENROUTER_API_KEY secret in Supabase (Edge Functions → Secrets). Pictures are queued and will be read once it\'s there.</p></div>') +
        '<p class="small muted">Spent this month: <b>$' + Number(r.spent || 0).toFixed(2) + "</b> of the $" + r.cap + " monthly limit · reading with " + esc(r.read_model) + " · drafting with " + esc(r.text_model) + "</p>" +
        '<div class="tt-ct"><table><thead><tr><th></th><th>Read</th><th>Waiting</th><th>Failed</th><th>Can\'t read</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
        '<div class="btns"><button class="btn sm alt" data-ai="retry-all">Try the failed ones again</button></div><div id="tt-ai-list" class="stack"></div>';
    }).catch(function (e) { out.innerHTML = '<div class="notice warn"><p>' + esc(e.message) + ". Check the admin key above.</p></div>"; });
  }
  function list(out, kind, st) {
    var box = document.getElementById("tt-ai-list") || out;
    box.innerHTML = '<p class="muted">Loading…</p>';
    call("list", { kind: kind, status: st || "" }).then(function (r) {
      var uploads = {};
      box.innerHTML = "<h3>" + esc(KIND[kind] || "") + (st ? " · " + esc(STATUS[st] || st) : "") + " (latest 60)</h3>" + (r.rows.length ? r.rows.map(function (x) {
        if (x.kind === "book_page") { var u = String(x.ref_id).split("/")[0]; if (uploads[u]) return ""; uploads[u] = 1; return '<div class="qitem"><p><b>' + esc(x.town) + '</b> · book upload ' + esc(u.slice(0, 8)) + '</p><button class="btn sm" data-ai="book-text" data-upload="' + esc(u) + '">Download all the pages\' text</button></div>'; }
        var names = x.fields && x.fields.names && x.fields.names.length ? "<p><b>Names:</b> " + x.fields.names.map(function (n) { return esc(n.name) + (n.born || n.died ? " (" + esc(n.born) + " – " + esc(n.died) + ")" : ""); }).join("; ") + "</p>" : "";
        return '<details class="qitem"><summary><b>' + esc(x.town || "") + "</b> · " + esc(STATUS[x.status] || x.status) + (x.lang ? " · " + esc(x.lang) : "") + (x.applied ? " · added to the entry" : "") + " · " + esc(String(x.created_at).slice(0, 10)) + "</summary>" +
          (x.error ? '<p class="tt-msg err">' + esc(x.error) + "</p>" : "") +
          (x.description_en ? "<p><b>Shows:</b> " + esc(x.description_en) + "</p>" : "") + names +
          (x.text_original ? '<p><b>Writing:</b></p><pre class="tt-ai-pre">' + esc(x.text_original) + "</pre>" : "") +
          (x.text_en && x.lang !== "en" ? '<p><b>English:</b></p><pre class="tt-ai-pre">' + esc(x.text_en) + "</pre>" : "") +
          (x.text_fr && x.lang !== "fr" ? '<p><b>Français :</b></p><pre class="tt-ai-pre">' + esc(x.text_fr) + "</pre>" : "") +
          (x.status !== "done" ? '<button class="btn sm alt" data-ai="retry" data-id="' + esc(x.id) + '">Read it now</button>' : "") + "</details>";
      }).join("") : '<div class="empty">Nothing here.</div>');
    }).catch(function (e) { box.innerHTML = '<p class="tt-msg err">' + esc(e.message) + "</p>"; });
  }
  function bookText(b) {
    act(b, call("book-text", { upload: b.getAttribute("data-upload") }), function (r) {
      b.disabled = false; b.textContent = "Downloaded (" + r.done + " of " + r.pages + " pages read)";
      var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([r.text], { type: "text/plain;charset=utf-8" }));
      a.download = "book-" + b.getAttribute("data-upload").slice(0, 8) + ".txt"; document.body.appendChild(a); a.click(); a.remove();
    });
  }
  function drafts(out) {
    out.innerHTML = '<p class="muted">Loading…</p>';
    call("draft-list").then(function (r) {
      var ds = r.drafts || [];
      out.innerHTML = "<h3>Book update drafts</h3>" +
        '<p class="small muted">Every morning the AI checks each finished book for history added since its last revision and drafts the new paragraphs, following the TownTales book rules. Read it, fix anything, then Approve: the revision number goes up and this text goes into the rebuilt book. Nothing changes in a book until you approve.</p>' +
        '<div class="btns"><button class="btn sm alt" data-ai="draft-now">Check for new history now</button></div>' +
        (ds.length ? ds.map(function (d) {
          var pend = d.status === "pending";
          return '<div class="qitem" data-draft="' + esc(d.id) + '"><p><b>' + esc(d.town) + "</b> · for revision " + (Number(d.base_revision) + 1) + " · " + esc((d.item_ids || []).length) + " new entries · " + esc(String(d.created_at).slice(0, 10)) + " · <b>" + esc(d.status) + "</b></p>" +
            "<p>" + esc(d.summary || "") + "</p>" +
            '<textarea rows="' + (pend ? 14 : 6) + '" style="width:100%;font:15px/1.5 Georgia,serif"' + (pend ? "" : " readonly") + ">" + esc(d.draft) + "</textarea>" +
            (pend ? '<div class="field"><label>Note (optional)</label><input type="text" data-note></div><div class="btns"><button class="btn sm" data-ai="approve">Approve (revision +1)</button><button class="btn sm alt" data-ai="reject">Reject</button><button class="btn sm alt" data-ai="copy">Copy text</button></div>' : '<div class="btns"><button class="btn sm alt" data-ai="copy">Copy text</button></div>') +
            '<p class="tt-msg"></p></div>';
        }).join("") : '<div class="empty">No drafts yet. They appear the morning after new history is added to a town that has a finished book.</div>');
    }).catch(function (e) { out.innerHTML = '<div class="notice warn"><p>' + esc(e.message) + ". Check the admin key above.</p></div>"; });
  }

  function start() {
    if (!/^#admin/.test(location.hash)) return;
    mount();
  }
  BASE = "https://zpqwrzsgpwwjrlbnfynn.supabase.co"; // same project as towntales-extra.js
  new MutationObserver(start).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("hashchange", start);
  start();
})();
