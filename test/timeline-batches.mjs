// Run: node --experimental-strip-types test/timeline-batches.mjs
// Checks the timeline batching in supabase/functions/api/timeline.ts with a fake AI (no network).
import assert from "node:assert/strict";
import { splitBatches, parseEntries, salvageEntries, buildEntries } from "../supabase/functions/api/timeline.ts";

const mkItems = (n) => Array.from({ length: n }, (_, i) => ({ id: "id" + i, kind: "document", title: "Item " + i, date: 1880 + i, source: "book", text: "x".repeat(150) }));
const entryFor = (it) => ({ year: Number(it.date), label: String(it.date), title: it.title, body: "About " + it.title + ".", cat: "Events", tier: "documented", item_ids: [it.id], cite: "" });

// A fake AI that, like the real one did, gets cut off when asked for too many entries in one reply.
function fakeAi(limit, log = []) {
  return async (batch) => {
    log.push(batch.length);
    const entries = batch.map(entryFor);
    if (batch.length <= limit) return { text: JSON.stringify({ entries }), truncated: false };
    const full = JSON.stringify({ entries });
    return { text: full.slice(0, Math.floor(full.length * (limit / batch.length)) - 7), truncated: true };   // cut mid-entry
  };
}

// 1. the bug: the old single call over 176 items would have been cut off and JSON.parse would throw
{
  const items = mkItems(176);
  const whole = await fakeAi(60)(items);
  assert.equal(whole.truncated, true);
  assert.throws(() => parseEntries(whole.text), /not valid JSON/, "old behaviour: one big call fails to parse");
}

// 2. new behaviour: same 176 items build completely, nothing lost, in order
{
  const items = mkItems(176), log = [];
  const { entries, stats } = await buildEntries(items, fakeAi(60, log));
  assert.equal(entries.length, 176);
  assert.deepEqual(entries.map((e) => e.item_ids[0]), items.map((i) => i.id), "order preserved");
  assert.equal(stats.batches, 9, "176 items / 20 per batch");
  assert.ok(Math.max(...log) <= 20);
}

// 3. a batch that is still too big for the AI's reply is halved until it fits
{
  const log = [];
  const { entries, stats } = await buildEntries(mkItems(40), fakeAi(6, log), { maxItems: 40 });
  assert.equal(entries.length, 40);
  assert.ok(stats.splits > 0, "had to split");
  assert.ok(log.every((n, i) => n <= 40) && log.includes(5), "halved down to a size that fits");
}

// 4. real failures give a readable message that names the batch
{
  let calls = 0;
  const bad = async () => { calls++; throw new Error("Claude API 401: invalid x-api-key"); };
  await assert.rejects(buildEntries(mkItems(50), bad), /batch \d+ of 3: Claude API 401/);
  assert.ok(calls <= 4, "stops starting new AI calls after a failure (concurrency 4)");
}

// 5. garbage JSON on a single item is reported, on a bigger batch it is retried smaller
{
  const flaky = async (b) => (b.length > 1 ? { text: "sorry, here you go: [", truncated: false } : { text: JSON.stringify({ entries: [entryFor(b[0])] }), truncated: false });
  const { entries } = await buildEntries(mkItems(8), flaky);
  assert.equal(entries.length, 8);
  await assert.rejects(buildEntries(mkItems(1), async () => ({ text: "nope", truncated: false })), /no JSON/);
}

// 6. salvage keeps finished entries from a cut-off reply, even with braces and quotes inside the text
{
  const e = [{ year: 1900, title: 'He said "hi" {and} left', body: "a", item_ids: ["a"] }, { year: 1901, title: "Two", body: "b", item_ids: ["b"] }, { year: 1902, title: "Three", body: "c", item_ids: ["c"] }];
  const full = JSON.stringify({ entries: e });
  const cut = full.slice(0, full.lastIndexOf('"Three"') + 4);
  const got = salvageEntries(cut);
  assert.equal(got.length, 2);
  assert.equal(got[0].title, 'He said "hi" {and} left');
}

// 7. deadline: gives up cleanly instead of running into the platform's time limit
{
  await assert.rejects(buildEntries(mkItems(60), fakeAi(60), { deadlineAt: Date.now() - 1 }), /ran out of time/);
}

// 8. batching respects both the item count and the size
{
  const big = mkItems(10).map((i) => ({ ...i, text: "y".repeat(20000) }));
  const b = splitBatches(big, 20, 45000);
  assert.ok(b.every((x) => x.length <= 2), "size cap splits big items");
  assert.equal(b.flat().length, 10);
  assert.deepEqual(splitBatches([], 20, 45000), []);
}

console.log("timeline batches: all ok");
