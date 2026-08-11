# Liner Notes — project reference

Quick lookup for IDs and endpoints used by the app. Update this whenever a
table/field is added, renamed, or the Worker is redeployed elsewhere.

## Airtable

Base: **Liner Notes** — `app88t5UhjL4R8G0A`

Created inside the **Library Tracker** workspace (`wspHfhbnKxQm0fxVf`) for
lack of a dedicated workspace at scaffold time — an arbitrary placement,
not a statement that this app belongs there. Move it to its own workspace
in the Airtable UI whenever convenient; nothing here depends on which
workspace it sits in.

### Books — `tbl7yTzGnD7rwsEpb`
Title `fldMjOuUew75nQApw` (primary), Author `fldtstv8iYwtB6p5K`, Genre
`fldsR6PciGS9Wgisd` (singleSelect, 12 choices), Mood Tags
`fldfHxyk4FGMCtVwd` (multipleSelects, 12 choices — **must stay identical
to Albums' Mood Tags choices**, see "Shared mood vocabulary" in
CLAUDE.md), Notes `fldNsv17hbDkxzDZ3`, Added By `fldFAkY1GFYUrjv9V`,
Added At `fldUeCtad2jgJHGs7`.

### Albums — `tbl7TiRQLNQ0i6ncS`
Title `fld4D9Ctf5t6MLaLs` (primary), Artist `fldkNJEP3TXdIvU6n`, Genre
`fldSWfjYLNuKQkfnr` (singleSelect, 11 choices), Mood Tags
`fldX1EdG4JWnDXmAS` (multipleSelects, same 12 choices as Books), Spotify
URL `fldE36VydisRwenEM`, Bandcamp URL `fldcxUjmhGXLjUW7J`, Notes
`fldPRFiBUIASvJ6Mo`, Added By `fldYrn3iEHiyEZOxY`, Added At
`fldcGxaYI7l9FsS5H`.

### Pairings — `tblSHo2vLPZLyRqiG`
Why It Pairs `fldjTXgTrTpXJzoO8` (primary, multilineText), Book
`fldnsPnGwTLvaAe28` (multipleRecordLinks &rarr; Books, app enforces
single-link), Album `fldJovXuL0NMYbGTL` (multipleRecordLinks &rarr;
Albums, same), Hearts `fldJH3Qv7sYfAiG3P` (number, aggregate counter),
Added By `fld3s3PgyLpW2jNTD`, Added At `fldhCPwjTRy1HRc9W`.

Mood Tags choices (both tables): Tense, Cozy, Atmospheric, Melancholic,
Propulsive, Eerie, Whimsical, Epic, Intimate, Bleak, Dreamy,
Contemplative.

## Cloudflare Worker

**Not yet deployed.** Source lives in this repo (`worker/liner-notes-worker.js`),
same as Sonic Radar's setup — deploy with `wrangler deploy` from
`worker/`. `worker/wrangler.toml` has `BASE_ID` set; still needed before
first deploy:

```
wrangler secret put AIRTABLE_TOKEN
wrangler secret put CURATOR_PASSPHRASE
```

Routes (path &rarr; Airtable table):
- `/books`, `/albums`, `/pairings` — GET (list, paginated via `?offset=`),
  POST (open, no gate)
- `/pairings/:id/heart` — POST (open aggregate counter)
- `/books/:id`, `/albums/:id`, `/pairings/:id` — PATCH/DELETE
  (curator-gated via `X-Curator-Passphrase`)
- `/verify-curator` — GET, checks the passphrase header
- `/health` — GET

Once deployed, set `WORKER_URL` in `app.js` (currently `''`, which makes
the app show a "UI preview only" banner instead of attempting real
requests) and `ALLOWED_ORIGIN` in `worker/wrangler.toml` to match wherever
`index.html` ends up served from.

## Deploy

`index.html`, `app.js`, `styles.css`, and `lib/` are the whole
deployable surface — any static host (GitHub Pages, Cloudflare Pages)
works, no build step. The Worker deploys separately via `wrangler deploy`
from `worker/`.

## Naming

"Liner Notes" is a working title picked during scaffolding — a
book/album pun, not a final decision. Rename freely; nothing in the
Airtable base name or Worker name needs to match the eventual public
name.

## Status

Scaffolded 2026-08-11: Airtable base + 3 tables created, Worker source
written but not deployed, static frontend built but untested against
real data (no Worker to hit yet). Next steps: deploy the Worker, seed a
first batch of real pairings from Stephen's reading history, pick a
real name/domain.
