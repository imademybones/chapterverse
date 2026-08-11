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

Deployed at `https://liner-notes-worker.stephen-nolan85.workers.dev`.
Source lives in this repo (`worker/liner-notes-worker.js`), same as
Sonic Radar's setup — redeploy with `npx wrangler deploy` from `worker/`
after any source change. `AIRTABLE_TOKEN` and `CURATOR_PASSPHRASE` are
set as Worker secrets (`wrangler secret put ...`, run by Stephen
directly — never stored in this repo or asked of Claude).

Routes (path &rarr; Airtable table):
- `/books`, `/albums`, `/pairings` — GET (list, paginated via `?offset=`),
  POST (open, no gate)
- `/pairings/:id/heart` — POST (open aggregate counter)
- `/books/:id`, `/albums/:id`, `/pairings/:id` — PATCH/DELETE
  (curator-gated via `X-Curator-Passphrase`)
- `/verify-curator` — GET, checks the passphrase header
- `/health` — GET

`WORKER_URL` in `app.js` points at the URL above. `ALLOWED_ORIGIN` in
`worker/wrangler.toml` is `https://imademybones.github.io` — matches the
Pages origin below (CORS checks scheme+host only, not path, so it covers
every repo under that GitHub Pages account, same as Sonic Radar's setup).

## Deploy

**Frontend**: GitHub Pages, repo `imademybones/liner-notes` (public),
served from `main` at the repo root — no build step. Live at
`https://imademybones.github.io/liner-notes/`. Push to `main` to update;
Pages rebuilds automatically.

**Worker**: `npx wrangler deploy` from `worker/` (separate deploy step,
not tied to the GitHub push).

## Naming

"Liner Notes" is a working title picked during scaffolding — a
book/album pun, not a final decision. Rename freely; nothing in the
Airtable base name, Worker name, or `imademybones/liner-notes` repo name
needs to match the eventual public name (though renaming the repo later
would change the GitHub Pages URL and require updating `ALLOWED_ORIGIN`
if it ever became repo-specific).

## Status

Deployed 2026-08-11: Airtable base + 3 tables, Worker, and GitHub
Pages frontend are all live and verified working end-to-end (Worker
reaches Airtable, curator gate enforced, CORS confirmed from the real
Pages origin). No content yet — Books/Albums/Pairings are all empty.
Next steps: seed a first batch of real pairings from Stephen's reading
history, pick a real name/domain.
