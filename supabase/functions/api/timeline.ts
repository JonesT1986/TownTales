// Timeline build helpers (Nov 27 2026). No Deno or network code in here, so it can be tested on its own.
//
// Why this exists: a town with ~100+ archive items made the AI answer with 16,000+ tokens of JSON in one go,
// the reply was cut off mid-array and JSON.parse failed ("Expected ',' or ']' after array element"). That is
// what "last build failed" meant for Charlottetown, Iqaluit, Halifax, Fredericton, Toronto and Whitehorse.
// Fix: send the archive in small batches, a few at a time. If a reply is still cut off, split that batch in
// half and try again, so a build never fails just because a town has a lot of history.

export type ArchiveItem = { id: string; kind: string; title: string; date: string | number; source: string; text: string };
export type ModelReply = { text: string; truncated: boolean };
export type ModelCall = (batch: ArchiveItem[]) => Promise<ModelReply>;

export const BATCH_ITEMS = 20;       // archive items per AI call
export const BATCH_CHARS = 45_000;   // ...or this many characters of JSON, whichever comes first
export const CONCURRENCY = 4;        // AI calls in flight at once for one town

/** Chunk the archive in order (items arrive sorted by year, so each batch is a stretch of years). */
export function splitBatches(items: ArchiveItem[], maxItems = BATCH_ITEMS, maxChars = BATCH_CHARS): ArchiveItem[][] {
  const out: ArchiveItem[][] = [];
  let cur: ArchiveItem[] = [];
  let size = 0;
  for (const it of items) {
    const n = JSON.stringify(it).length;
    if (cur.length && (cur.length >= maxItems || size + n > maxChars)) { out.push(cur); cur = []; size = 0; }
    cur.push(it); size += n;
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Parse the AI's JSON reply into entries. Throws a short, readable message if it can't. */
export function parseEntries(text: string): any[] {
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("the AI reply had no JSON in it");
  let parsed: any;
  try { parsed = JSON.parse(text.slice(a, b + 1)); }
  catch (e) { throw new Error("the AI reply was not valid JSON (" + String((e as any)?.message ?? e).slice(0, 80) + ")"); }
  return Array.isArray(parsed?.entries) ? parsed.entries : [];
}

/** A reply that was cut off at the token limit: keep every entry that finished, drop the half-written one. */
export function salvageEntries(text: string): any[] {
  const start = text.indexOf('"entries"');
  if (start < 0) return [];
  const arr = text.indexOf("[", start);
  if (arr < 0) return [];
  // Walk the array, tracking strings and braces, and remember where each complete top-level {...} ends.
  let depth = 0, inStr = false, esc = false, objStart = -1;
  const ok: any[] = [];
  for (let i = arr + 1; i < text.length; i++) {
    const c = text[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; continue; }
    if (c === "{") { if (depth === 0) objStart = i; depth++; }
    else if (c === "}") {
      depth--;
      if (depth === 0 && objStart >= 0) { try { ok.push(JSON.parse(text.slice(objStart, i + 1))); } catch { /* skip */ } objStart = -1; }
    }
  }
  return ok;
}

export type BuildStats = { batches: number; calls: number; splits: number; salvaged: number };

/**
 * Turn archive items into timeline entries by calling `call` on small batches.
 * Order of entries follows the order of the batches. Throws with a readable message on a real failure.
 */
export async function buildEntries(
  items: ArchiveItem[],
  call: ModelCall,
  opts: { maxItems?: number; maxChars?: number; concurrency?: number; deadlineAt?: number } = {},
): Promise<{ entries: any[]; stats: BuildStats }> {
  const stats: BuildStats = { batches: 0, calls: 0, splits: 0, salvaged: 0 };
  const batches = splitBatches(items, opts.maxItems, opts.maxChars);
  stats.batches = batches.length;

  const one = async (batch: ArchiveItem[], label: string): Promise<any[]> => {
    if (opts.deadlineAt && Date.now() > opts.deadlineAt) throw new Error(`ran out of time before ${label} (the build will be retried)`);
    stats.calls++;
    let reply: ModelReply;
    try { reply = await call(batch); }
    catch (e) { throw new Error(`${label}: ${String((e as any)?.message ?? e).slice(0, 200)}`); }
    if (reply.truncated) {
      if (batch.length > 1) {                       // too much output for one reply: halve it and retry
        stats.splits++;
        const mid = Math.ceil(batch.length / 2);
        const left = await one(batch.slice(0, mid), label + "a");
        const right = await one(batch.slice(mid), label + "b");
        return left.concat(right);
      }
      stats.salvaged++;                             // a single item that still overflows: keep what finished
      return salvageEntries(reply.text);
    }
    try { return parseEntries(reply.text); }
    catch (e) {
      if (batch.length > 1) {                       // bad JSON: a smaller ask usually fixes it
        stats.splits++;
        const mid = Math.ceil(batch.length / 2);
        const left = await one(batch.slice(0, mid), label + "a");
        const right = await one(batch.slice(mid), label + "b");
        return left.concat(right);
      }
      throw new Error(`${label}: ${(e as Error).message}`);
    }
  };

  const results: any[][] = new Array(batches.length);
  let next = 0, failed = false;
  const workers = Array.from({ length: Math.min(opts.concurrency ?? CONCURRENCY, batches.length) }, async () => {
    while (!failed) {
      const i = next++;
      if (i >= batches.length) return;
      try { results[i] = await one(batches[i], `batch ${i + 1} of ${batches.length}`); }
      catch (e) { failed = true; throw e; }   // stop starting new AI calls once one batch has really failed
    }
  });
  await Promise.all(workers);
  return { entries: results.flat(), stats };
}
