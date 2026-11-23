# Wapella: Railway Town, Prairie Crossroads — KDP book source

Build (needs `pip install weasyprint pypdf` and the Crimson Text + Anton fonts installed):

    python3 build.py        # build/wapella-paperback-8.5x11.pdf, build/wapella-hardcover-8.25x11.pdf
    python3 cover.py 78     # build/cover-paperback.pdf, build/cover-hardcover-DRAFT.pdf (pass the final page count)

- Manuscript: `ms/*.html` (in order). Roll of Remembrance: `data/roll-*.txt` (name|born|died; exported from `memorials`, Nov 23 2026, 1,304 names). Timeline at a glance: `data/timeline.json`.
- Photos: drop grayscale 300-DPI JPGs into `img/<id>.jpg` (ids: pc029673, pc005212, pc026546, pc018670, pc026953, pc042577 — Peel's Prairie Postcards on archive.org). `img/cover.jpg` replaces the illustrated cover art.
- Paperback is 8.5x11 (KDP paperback has no 8.25x11); hardcover is 8.25x11. Hardcover needs ≥ 75 pages.
- Hardcover cover geometry must be checked against KDP's own cover template for the final page count.
- After rebuilding, re-render the "Look inside" images into `/book-preview/wapella-sk/` and update `BOOKS['wapella-sk'].look` in `api/_book.js`.
