# Chapterverse — project reference

Quick lookup for IDs and endpoints used by the app. Update this whenever a
table/field is added, renamed, or the Worker is redeployed elsewhere.

## Airtable

Base: **Liner Notes** — `app88t5UhjL4R8G0A` (still the old name — no
Airtable API support for renaming a base, only tables/fields; a 10-second
manual rename in the Airtable UI whenever it's worth doing, purely
cosmetic either way)

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

Deployed at `https://liner-notes-worker.stephen-nolan85.workers.dev` —
**deliberately still the old resource name**, see "Naming" below for
why. Source lives in this repo (`worker/liner-notes-worker.js`), same as
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
every repo under that GitHub Pages account, same as Sonic Radar's setup,
and needed no change when the repo was renamed).

## Deploy

**Frontend**: GitHub Pages, repo `imademybones/chapterverse` (public,
renamed 2026-08-11 from `imademybones/liner-notes` via `gh repo rename`
— GitHub auto-redirects the old URL and Pages carried over without
reconfiguration), served from `main` at the repo root — no build step.
Live at `https://imademybones.github.io/chapterverse/`. Push to `main`
to update; Pages rebuilds automatically.

**Worker**: `npx wrangler deploy` from `worker/` (separate deploy step,
not tied to the GitHub push).

## Naming

**Chapterverse**, decided 2026-08-11, replacing the scaffolding working
title "Liner Notes". Landed on it after a wordplay-vs-plain naming
session: "Chapter & Verse" (the phrase this compresses from) was liked
for its double meaning — chapter (book) meets verse (song), plus the
idiom already means "precise, exact details" — but domain/collision
research turned up too much noise to use as-is:
- `chapterandverse.com` and most other TLDs were squatted since 2002.
- The phrase itself is already used by a SiriusXM/Audible music-and-authors
  series and a few podcasts — soft collisions, no single dominant owner.
- Two literal alternatives considered and rejected for harder collisions:
  **Bookscore** is the name of an actual funded manuscript-scoring startup
  (bookscore.ai, CB Insights profile) — a real live competitor in the book
  space, not just a taken domain. **StoryScore** was similarly crowded
  (6 of 7 TLDs taken, several small independent claimants) though no
  single dominant owner.

**Chapterverse** (the compressed form) cleared the same check:
`chapterverse.com`/`.io` are taken, but `.app`/`.fm`/`.net`/`.org`/`.co`
are open, and it sidesteps the "Chapter and Verse" collisions entirely by
not being that exact phrase. Domain not yet registered — that's on
Stephen, via wherever he buys domains, not something done in this repo.

**Nothing in the Airtable base name or Worker resource name was updated
to match** — both were designed from scaffold time not to need it (see
CLAUDE.md "Design" for why the Worker specifically was left alone: doing
so would mean a brand-new Cloudflare Worker resource and re-entering both
secrets). The GitHub repo *was* renamed, since that determines the public
Pages URL and costs nothing to change (GitHub handles the redirect).

## Status

**Redesigned and renamed 2026-08-11**, same day as the initial deploy.
Visual identity moved from the original plain scaffold styling to the
"Frequency" design direction in the "Magnetic" (violet) color variant —
see CLAUDE.md "Design" for the full decision trail (three concepts, four
palettes, all reviewed as an Artifact mockup before implementation) and
what changed (dark equipment aesthetic, self-hosted Space Grotesk,
mood-tag-driven waveform on curated pairings, "score your reading
session" copy reframe throughout). Repo renamed `liner-notes` &rarr;
`chapterverse` (GitHub + local directory), Worker/Airtable base
deliberately left unrenamed. All changes verified locally (graceful
no-data state, form interactions, tag pickers) and end-to-end against the
live Worker at the new Pages URL. `node --test lib/pure.test.js` passing
(16 tests, including the new waveform functions).

No content yet — Books/Albums/Pairings are all empty. Next steps: seed a
first batch of real pairings from Stephen's reading history, register a
domain.
