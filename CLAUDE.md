# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## What this is

A **public, collaborative** pairing of books and music: pick the book
you're reading, get albums that suit its mood. Anyone can add a book, an
album, or a pairing, or heart one; no accounts, no login. `index.html`
(markup) + `app.js` (`<script type="module">`) + `styles.css`, with pure
helper/mapping logic factored out to `lib/pure.js`. No build step, no
package manager, no framework — served as a static file.

It follows the same architecture as the sibling project `sonic-radar`
(also public/collaborative, Airtable + Worker, no build step) rather
than `library-tracker`/`music-tracker` (personal, single-user apps) —
this is the right template because the core premise here is the same:
open contribution, low-stakes engagement (hearts), curator-gated removal.
Separate repo, separate Airtable base, separate Worker.

"Liner Notes" is a **working title**, chosen during scaffolding purely
as a books/music pun — not a considered final name. Don't treat it as
settled; see project-reference.md "Naming".

## Development

`lib/pure.js` has a `node:test` suite (`lib/pure.test.js`) covering
Airtable field mapping and the mood-tag-overlap suggestion logic — run
via `node --test lib/pure.test.js`. A GitHub Actions workflow
(`.github/workflows/test.yml`) runs it on every push/PR to `main`.

- Open `index.html` directly in a browser, or serve it locally
  (`python3 -m http.server` from the repo root) — no build step either way.
- `app.js` needs a live Worker to load/save real data — see
  project-reference.md for `WORKER_URL` and deploy status. **Not deployed
  yet** as of scaffolding: `WORKER_URL` is `''`, which short-circuits to a
  status banner ("UI preview only") instead of a real fetch, so the shell
  still renders and tabs still switch — useful for pure UI iteration, but
  Find/Browse/Contribute have nothing to show until a Worker exists.
- Verify changes by exercising the UI in a browser (search for a book,
  switch tabs, fill out the contribute forms, heart a pairing, curator
  unlock + delete) — no UI test automation, only the pure-function suite.

## Architecture

**No frontend framework.** Module-level state in `app.js` (`books`,
`albums`, `pairings`, `activeTab`, `selectedBookId`, `curatorKey`, etc.),
`innerHTML` template-literal rendering into slot elements (`#bookResults`,
`#findOutput`, `#pairingGrid`). Every mutation is followed by an explicit
render call — there's no reactivity, no diffing.

**Event handling is delegated, not inline** — a single
`document.addEventListener('click', ...)` keyed off `data-action`/
`data-id` (plus a couple of context-specific data attrs like `data-tab`,
`data-tag`) on rendered markup, same pattern as Sonic Radar. Adding a new
interactive element just needs a `data-action` value and a `case` in that
one switch.

**Data persistence is remote, via a Cloudflare Worker proxy, and the
Worker's source lives in this repo** (`worker/liner-notes-worker.js`),
deployed with `wrangler deploy` — reviewable, not tribal knowledge,
same reasoning as Sonic Radar. The Airtable token never reaches the
client.

**Three tables, one Worker, routed by path prefix** — `/books`,
`/albums`, `/pairings` each map to their Airtable table (see `TABLES` in
the Worker). This is the one real structural departure from Sonic
Radar's Worker, which only ever proxied a single table; Liner Notes
needs three because a pairing is a real join, not a tag on one side.

**Collaborative write model — same split as Sonic Radar, "open
contribution, curator-protected removal/editing."** `POST /books`,
`POST /albums`, `POST /pairings`, and `POST /pairings/:id/heart` are open
to anyone, no gate. `PATCH`/`DELETE` require an `X-Curator-Passphrase`
header matching the `CURATOR_PASSPHRASE` Worker secret. This is a single
shared static passphrase, not per-user auth — don't describe it to users
as real authentication.

**Delete is only wired up for Pairings, not Books or Albums, as an
explicit scope trim at scaffold time.** Deleting a book or album out from
under pairings that link to it is a real data-integrity question (orphan
the pairing? cascade-delete it? block the delete?) that hasn't been
decided yet — rather than guess, the MVP only exposes deleting a pairing
itself (in the Browse tab, curator-gated). If book/album deletion is
wanted later, decide the cascade behavior first, then add it — don't
just wire up the same delete button pattern without that decision.

**Data model.** A `pairing` (`recordToPairing`/`pairingToFields` in
`lib/pure.js`) links one `book` and one `album` (Airtable
`multipleRecordLinks` fields, which are arrays — the app only ever reads/
writes index `[0]`, enforcing "one book, one album" at the app layer, not
the schema layer) plus `whyItPairs` (the curatorial payload — why these
two actually go together), `hearts` (aggregate), `addedBy`/`addedAt`. A
`book`/`album` each carry `title`, plus `author`/`artist`, `genre`
(singleSelect, separate taxonomies per side), `moodTags`
(multipleSelects), `notes`, `addedBy`/`addedAt`.

**Shared mood vocabulary is what makes suggestions possible, and it must
stay identical on both sides.** Books and Albums each have a `Mood Tags`
multipleSelects field with the *same* 12 choices (Tense, Cozy,
Atmospheric, Melancholic, Propulsive, Eerie, Whimsical, Epic, Intimate,
Bleak, Dreamy, Contemplative — see `MOOD_TAGS` in `app.js`, and keep it
in sync with the Airtable choice lists on both tables if it ever changes).
Without a shared vocabulary, "similar mood" has nothing to compute
against — this is the one piece of schema design the whole
suggestion feature depends on.

**Suggested pairings are a `jaccard()`-overlap fallback, not a
replacement for curated pairings — same "not a vote you can trust
adversarially" spirit as Sonic Radar's Hearts.** Most books won't have a
real, human-written pairing for a long time (this catalogue starts from
nothing and grows one contribution at a time). `suggestAlbumsForBook()`
in `lib/pure.js` ranks albums by Mood Tags overlap with the selected book
so Find never dead-ends into "nothing here" — but it's visually and
textually marked "not yet a curated pairing" (see `renderFind()` in
`app.js`) and excluded once a real pairing exists for that book/album
combination. Don't let this quietly become the primary experience; the
curated `whyItPairs` note is the actual point of the app.

**`esc()` (in `lib/pure.js`) must wrap any user-provided string
interpolated into `innerHTML`** (title, author/artist, notes,
`whyItPairs`, mood/genre values) — the only XSS defense, applied
consistently across every render path. Keep doing this for new fields.

**`safeExternalUrl()` gates Bandcamp link-outs; `spotifyEmbedUrl()`
normalizes Spotify links into an embed.** Both are contributor-pasted
strings, so both get the same treatment Sonic Radar uses: `esc()` alone
stops attribute breakout but not a `javascript:` scheme, so hrefs go
through `safeExternalUrl()` first. There is no Spotify Web API
integration (no client ID/secret, no search-autofill) — a contributor
pastes a link, same as Sonic Radar.

**No cover art / art fetching in this first pass**, unlike Sonic Radar's
iTunes-lookup pattern for album covers or Library Tracker's Open Library
lookup for book covers. Deliberately deferred, not forgotten — the
catalogue needs real pairings before cover art is worth the added
complexity (lazy-loading, rate limits, cache keys — see Sonic Radar's
CLAUDE.md for what that entailed). Add it as a separate, later decision.

**Genre taxonomies are separate per side and don't feed the matching
logic.** Books' Genre reuses Library Tracker's 12-choice fiction/
non-fiction taxonomy (see `BOOK_GENRES` in `app.js`); Albums' Genre is
an 11-choice music taxonomy loosely following Sonic Radar's family
list plus a few more (see `ALBUM_GENRES`). Genre is browse/filter
metadata only — `suggestAlbumsForBook()` matches on Mood Tags, never
Genre, deliberately: a genre match (e.g. "Fantasy book, Soundtrack
album") says nothing about whether the *mood* actually fits.
