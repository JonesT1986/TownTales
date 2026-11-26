# Nov 27, 2026 — timelines stay in step with the archive

## What was wrong
1. **"Last build failed" on big towns.** The AI was asked for the whole timeline in one reply. For a town with ~100+ archive items the reply hit the 16,000-token limit, was cut off mid-array and `JSON.parse` threw (`Expected ',' or ']' after array element`). Seen in the function logs for Charlottetown, Iqaluit, Halifax, Fredericton, Toronto and Whitehorse. It was never a timeout or a size limit on the items (Charlottetown's whole archive is only ~26 KB of text).
2. **Nothing started a build** when an item was approved with a date, re-dated, unpublished or deleted straight in the database, so timelines drifted. Only auto-approved link-reader facts marked a town due.
3. **"Missing" could never reach 0.** Dated items the AI leaves out on purpose (duplicates etc.) counted as missing forever, so those towns would be rebuilt every night.
4. **Stale stats.** The 5-minute stats refresh could finish *after* a build's own refresh and write back an older snapshot (Abercorn showed "0 rows" with 19 on the timeline).
5. The admin only said "last build failed" — the reason was never saved.

## What changed
| Where | Change |
|---|---|
| `supabase/functions/api/timeline.ts` (new) | Sends the archive in batches of 20 items, 4 at a time. If a reply is still cut off the batch is split in half and retried; a build only fails on a real error. |
| `supabase/functions/api/index.ts` | Uses the batching; retries overloaded/rate-limited AI calls; never wipes a timeline if the AI returns nothing; saves the failure reason (`timeline_error`) and a consecutive-failure count; remembers which dated items the AI left out (`timeline_skipped`). |
| `db/2026-11-27-timeline-autobuild.sql` | New columns; trigger on `items` marks a town due when a **dated** item is published, re-dated, unpublished or deleted (debounced: due time moves at most every 20 s, rebuild starts after 3 quiet minutes, so a bulk import = one rebuild); nightly sweep `timeline_nightly_sweep(40)` at 03:30 Saskatchewan time; stats cache can't be overwritten by an older snapshot; `admin_towns()` returns the error, tries and left-out count. |
| `towntales-admin.js` | Towns tab shows the real error, how many dated items are missing (and archive vs timeline counts), and when the nightly job has stopped retrying a town. |
| `test/timeline-batches.mjs` | `node --experimental-strip-types test/timeline-batches.mjs` |

## Deploy — in this order
1. **SQL first:** Supabase → SQL editor → run `db/2026-11-27-timeline-autobuild.sql` (safe to run twice). The function writes the new columns, so the SQL must be there before the function.
2. **Edge function:** deploy `api` (`supabase functions deploy api`) — it now includes `timeline.ts`.
3. **Site:** merge the PR (admin JS) and promote it in Vercel.

## After deploying
- Admin → Towns → tick **Needs rebuild**. The count stays about the same (~174) until towns are rebuilt, then falls. The nightly job does up to 40 towns a night; use **Rebuild all** to go faster (each AI call costs credits; a big town now takes a few calls).
- Click **Rebuild timeline** on Charlottetown or Iqaluit. It should now finish; if it doesn't, the row shows the actual error.
- Towns that fail 3 builds in a row are skipped by the nightly job (the row says so) until you rebuild them by hand or something changes.
- Live check: add a dated archive item to a small town, wait ~5 minutes, and it appears on the timeline with the town still counted OK.

## Not changed
- Editing only an item's text/title does not trigger a rebuild (only publish / date / unpublish / delete do).
- Ingest and moderation still queue their own rebuild, as before.
