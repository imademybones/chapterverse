# Liner Notes

*Working title — rename freely once something better sticks.*

A public, collaborative pairing of books and music: pick the book you're
reading, get albums that suit its mood. Anyone can add a book, an album,
or a pairing; no accounts, no login.

No build step, no framework — a static `index.html` + `app.js` (ES module)
backed by Airtable via a Cloudflare Worker. See `CLAUDE.md` for
architecture notes and `project-reference.md` for live IDs/URLs and
deploy status.

## Development

```
python3 -m http.server   # serve index.html locally, no build step
node --test lib/pure.test.js   # run the pure-function test suite
```

The app renders its shell without a live Worker (see `CONFIG.WORKER_URL`
in `app.js`) — useful for pure UI iteration, but Find/Browse/Contribute
need real data to do anything.
