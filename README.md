# Chapterverse

*(Formerly scaffolded as "Liner Notes" — renamed 2026-08-11, see
project-reference.md "Naming" for the history.)*

Score your reading session: pick the book you're reading, get albums
that suit its mood. Anyone can add a book, an album, or a score; no
accounts, no login.

No build step, no framework — a static `index.html` + `app.js` (ES module)
backed by Airtable via a Cloudflare Worker. See `CLAUDE.md` for
architecture notes and `project-reference.md` for live IDs/URLs and
deploy status.

## Development

```
python3 -m http.server   # serve index.html locally, no build step
node --test lib/pure.test.js   # run the pure-function test suite
```

The Worker is deployed and `WORKER_URL` in `app.js` points at it, but a
local `python3 -m http.server` origin will hit a CORS wall — see
CLAUDE.md "Development". The app still degrades gracefully (a status
banner, not a crash), so it's fine for pure UI iteration.
