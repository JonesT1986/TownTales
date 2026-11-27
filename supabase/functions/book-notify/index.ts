// book-notify (Nov 26 2026): admin-only. Marks a town's book finished and emails everyone who asked for it, once each.
// POST JSON with header x-admin-key (same key as the main api function):
//   {action:"list"}                         -> finished books + how many are waiting per town
//   {action:"ready", slug, pages, title?}   -> mark a town's book finished (pages = interior page count)
//   {action:"unready", slug}                -> take it back off the shelf
//   {action:"test", slug, to}               -> send one sample "it's ready" email to `to` (marks nobody)
//   {action:"revise", slug, note?}        -> book was rebuilt: revision +1, new snapshot of the town's data
//   {action:"changes", slug}               -> what has been added to the town's page since the book's current revision
//   {action:"send", slug}                   -> email everyone on that town's list who said yes and hasn't been emailed (max 80 per call)
// Needs secrets: RESEND_API_KEY, TOWNTALES_ADMIN_KEY (already set). Optional: BOOK_MAIL_FROM.
const SB = Deno.env.get("SUPABASE_URL")!;
const SK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE = "https://www.towntales.ca";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, x-admin-key, authorization, apikey", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const H = { apikey: SK, Authorization: "Bearer " + SK, "Content-Type": "application/json" };
const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rest = (path: string, init: RequestInit = {}) => fetch(SB + "/rest/v1/" + path, { ...init, headers: { ...H, ...(init.headers || {}) } });


const count = async (path: string) => {
  const r = await rest(path, { method: "HEAD", headers: { Prefer: "count=exact" } });
  const m = /\/(\d+)$/.exec(r.headers.get("content-range") || "");
  return m ? Number(m[1]) : 0;
};
// A small record of how much the town's page held when the book was built, so later changes can be spotted.
async function snapshotOf(slug: string) {
  const s = encodeURIComponent(slug);
  const [timeline, items, people] = await Promise.all([count(`timeline?town=eq.${s}&select=id`), count(`items?town=eq.${s}&status=eq.published&select=id`), count(`memorials?town=eq.${s}&status=eq.published&select=id`)]);
  return { timeline, items, people, at: new Date().toISOString() };
}

function email(town: string, slug: string, name: string, token: string) {
  const first = esc(String(name || "").trim().split(/\s+/)[0] || "there");
  const link = `${SITE}/${encodeURIComponent(slug)}/book`;
  const unsub = `${SITE}/books/unsubscribe?t=${token}`;
  const t = esc(town);
  const html = `<div style="font:16px/1.55 Georgia,serif;color:#1E2930;max-width:560px">
<p>Hi ${first},</p>
<p>You asked us to let you know when the <b>${t}</b> book was ready. It is.</p>
<p><a href="${link}" style="display:inline-block;background:#B4512C;color:#fff;padding:12px 20px;text-decoration:none;font-weight:bold">Take a look at the ${t} book</a></p>
<p>You can see the cover, the contents and real pages from inside before you decide. There's no pressure to buy.</p>
<p>If you do, printed copies are made to order by Lulu and shipping anywhere in Canada is included. Please allow 4 to 6 weeks for a printed copy to arrive. The digital edition is a PDF we email to you.</p>
<p>Thank you for asking for it.<br>TownTales</p>
<p style="font-size:13px;color:#5b6770">You're getting this once because you asked for the ${t} book at towntales.ca. <a href="${unsub}">Unsubscribe</a></p></div>`;
  const text = `Hi ${String(name || "").trim().split(/\s+/)[0] || "there"},\n\nYou asked us to let you know when the ${town} book was ready. It is.\n\nTake a look: ${link}\n\nYou can see the cover, the contents and real pages from inside before you decide. No pressure to buy.\n\nPrinted copies are made to order by Lulu, and shipping anywhere in Canada is included. Please allow 4 to 6 weeks for a printed copy. The digital edition is a PDF we email to you.\n\nThank you for asking for it.\nTownTales\n\nYou're getting this once because you asked for the ${town} book at towntales.ca. Unsubscribe: ${unsub}`;
  return { html, text, unsub };
}

async function sendMail(to: string, town: string, slug: string, name: string, token: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) throw new Error("RESEND_API_KEY is not set yet");
  const m = email(town, slug, name, token);
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("BOOK_MAIL_FROM") || "TownTales <books@towntales.ca>", to: [to], reply_to: "towntalesinfo@gmail.com",
      subject: `The ${town} book is ready: take a look`, html: m.html, text: m.text,
      headers: { "List-Unsubscribe": `<${m.unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    }),
  });
  if (!r.ok) throw new Error("Resend " + r.status + " " + (await r.text()).slice(0, 200));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const ak = Deno.env.get("TOWNTALES_ADMIN_KEY");
  if (!ak || req.headers.get("x-admin-key") !== ak) return json({ error: "Bad admin key" }, 401);
  let b: any = {};
  try { b = await req.json(); } catch { /* empty */ }
  const action = String(b.action || "");
  const slug = String(b.slug || "").toLowerCase();
  try {
    if (action === "list") {
      const [books, waiting] = await Promise.all([
        rest("town_books?select=slug,pages,title,ready_at,revision,revised_at&order=ready_at.desc").then((r) => r.json()),
        rest("book_interest?select=town,updates_ok,notified_at&limit=10000").then((r) => r.json()),
      ]);
      const w: Record<string, { total: number; toEmail: number; emailed: number }> = {};
      for (const x of Array.isArray(waiting) ? waiting : []) {
        const o = (w[x.town] ??= { total: 0, toEmail: 0, emailed: 0 });
        o.total++; if (x.notified_at) o.emailed++; else if (x.updates_ok) o.toEmail++;
      }
      return json({ books, waiting: w, mail_ready: !!Deno.env.get("RESEND_API_KEY") });
    }
    if (!/^[a-z0-9-]{2,80}$/.test(slug)) return json({ error: "Bad town" }, 400);
    if (action === "ready") {
      const pages = Math.round(Number(b.pages));
      if (!(pages >= 24 && pages <= 800)) return json({ error: "Pages must be between 24 and 800" }, 400);
      const r = await rest("town_books?on_conflict=slug", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ slug, pages, title: b.title ? String(b.title).slice(0, 160) : null, snapshot: await snapshotOf(slug) }) });
      if (!r.ok) return json({ error: "Couldn't save: " + (await r.text()).slice(0, 200) }, 500);
      return json({ ok: true });
    }
    if (action === "unready") {
      const r = await rest("town_books?slug=eq." + encodeURIComponent(slug), { method: "DELETE" });
      return r.ok ? json({ ok: true }) : json({ error: "Couldn't remove" }, 500);
    }
    if (action === "revise") {
      const [cur] = await rest("town_books?slug=eq." + encodeURIComponent(slug) + "&select=revision").then((r) => r.json());
      if (!cur) return json({ error: "Mark this town's book ready first" }, 400);
      const r = await rest("town_books?slug=eq." + encodeURIComponent(slug), { method: "PATCH", body: JSON.stringify({ revision: (cur.revision || 1) + 1, revised_at: new Date().toISOString(), snapshot: await snapshotOf(slug), revision_note: b.note ? String(b.note).slice(0, 300) : null }) });
      return r.ok ? json({ ok: true, revision: (cur.revision || 1) + 1 }) : json({ error: "Couldn't save" }, 500);
    }
    if (action === "changes") {
      const [cur] = await rest("town_books?slug=eq." + encodeURIComponent(slug) + "&select=revision,revised_at,snapshot").then((r) => r.json());
      if (!cur) return json({ error: "No finished book for this town" }, 400);
      const now = await snapshotOf(slug); const was = cur.snapshot || {};
      const fresh: any[] = await rest("items?town=eq." + encodeURIComponent(slug) + "&status=eq.published&created_at=gt." + encodeURIComponent(cur.revised_at) + "&select=title,kind,created_at&order=created_at.desc&limit=40").then((r) => r.json());
      const diff = { timeline: now.timeline - (was.timeline ?? now.timeline), items: now.items - (was.items ?? now.items), people: now.people - (was.people ?? now.people) };
      return json({ revision: cur.revision, revised_at: cur.revised_at, was, now, diff, changed: diff.timeline !== 0 || diff.items !== 0 || diff.people !== 0 || (Array.isArray(fresh) && fresh.length > 0), newItems: Array.isArray(fresh) ? fresh : [] });
    }
    const [t] = await rest("towns?slug=eq." + encodeURIComponent(slug) + "&select=slug,name").then((r) => r.json());
    if (!t) return json({ error: "No such town" }, 404);
    if (action === "test") {
      const to = String(b.to || "").trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return json({ error: "Enter a valid email" }, 400);
      await sendMail(to, t.name, slug, "Test", "00000000-0000-0000-0000-000000000000");
      return json({ ok: true, sent: 1 });
    }
    if (action === "send") {
      const [done] = await rest("town_books?slug=eq." + encodeURIComponent(slug) + "&select=slug").then((r) => r.json());
      if (!done) return json({ error: "Mark this town's book ready first" }, 400);
      const rows: any[] = await rest("book_interest?town=eq." + encodeURIComponent(slug) + "&updates_ok=eq.true&notified_at=is.null&select=id,name,email,unsub_token&order=created_at.asc&limit=400").then((r) => r.json());
      const seen = new Set<string>(); const todo: any[] = []; const dupes: string[] = [];
      for (const r of rows) { const e = String(r.email || "").toLowerCase(); if (!e) continue; if (seen.has(e)) dupes.push(r.id); else { seen.add(e); todo.push(r); } }
      const batch = todo.slice(0, 80); let sent = 0; const failed: string[] = [];
      for (const r of batch) {
        try {
          await sendMail(r.email, t.name, slug, r.name, r.unsub_token);
          await rest("book_interest?id=eq." + r.id, { method: "PATCH", body: JSON.stringify({ notified_at: new Date().toISOString() }) });
          sent++;
        } catch (e) { failed.push(String(r.email) + ": " + String((e as Error).message).slice(0, 120)); if (/RESEND_API_KEY/.test(String((e as Error).message))) break; }
        await sleep(600);
      }
      if (dupes.length && batch.length === todo.length) await rest("book_interest?id=in.(" + dupes.join(",") + ")", { method: "PATCH", body: JSON.stringify({ notified_at: new Date().toISOString() }) });
      return json({ ok: failed.length === 0, sent, failed, remaining: Math.max(0, todo.length - batch.length) });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) { return json({ error: String((e as Error).message || e).slice(0, 300) }, 500); }
});
