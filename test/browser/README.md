# Browser tests (Nov 19 2026)
Start the preview server first: `node test/server.js 3000`, then from this folder:
- `python3 timeline_links.py /tmp/out 390` — timeline card: "Read", "Read the full entry", "From the archive" (Whitewood, the Oct 20 report)
- `python3 item_direct_link.py` — archive item pages opened directly / refreshed / shared
- `python3 stub_clipping.py` — year label on the timeline card is never clipped (320–1280 px)
- `python3 admin.py /tmp/out 390` — problem reports (deep link, resolve, delete), review queue filters, bulk approve, auto-approve setting
All use the fake database in test/fixtures.js; nothing touches the live site.
