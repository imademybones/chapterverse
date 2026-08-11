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

**Renamed to "Chapterverse" on 2026-08-11**, replacing the scaffolding
working title "Liner Notes" — see project-reference.md "Naming" for the
history and the domain-availability research behind the choice (several
other candidates, including "Bookscore" and "StoryScore", were rejected
for colliding with existing live products in the same space).

## Development

`lib/pure.js` has a `node:test` suite (`lib/pure.test.js`) covering
Airtable field mapping and the mood-tag-overlap suggestion logic — run
via `node --test lib/pure.test.js`. A GitHub Actions workflow
(`.github/workflows/test.yml`) runs it on every push/PR to `main`.

- Open `index.html` directly in a browser, or serve it locally
  (`python3 -m http.server` from the repo root) — no build step either way.
- The Worker is deployed and `WORKER_URL` in `app.js` points at it — see
  project-reference.md for the URL and current status. **A local
  `python3 -m http.server` origin will hit a CORS wall**, though:
  `ALLOWED_ORIGIN` in `worker/wrangler.toml` is scoped to the real GitHub
  Pages origin, not `localhost`. The app still degrades gracefully (a
  "Could not load data" banner, not a crash — verified during the initial
  deploy), so this is fine for pure UI iteration, but Find/Browse/
  Contribute need the real Pages URL (or a temporary `ALLOWED_ORIGIN`
  change + Worker redeploy) to exercise against real data locally.
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

**Teaser cards + one shared modal, not full cards everywhere.** The
landing page (Find tab, no book selected yet) and Browse All both show
`pairingTeaserHtml()` — book × album, authors, up to 3 mood chips, nothing
else — in a `.pairing-grid`. Clicking one calls `openPairingModal(id)`,
which writes the full detail (why it pairs, all chips, the mood-tag
waveform, Spotify/Bandcamp, heart, curator delete) into the `#modalSlot`
div that was sitting unused in `index.html` since scaffolding. This
replaced a landing page that was blank until you searched, and fixed a
real bug where clicking a Browse All row did nothing — full detail was
only ever reachable via search-then-select. Don't duplicate the full
card markup into the grids to "fix" this differently; the whole point is
one detail view, reached two ways. The Find tab's post-search results
(`renderFind()` when a book *is* selected) still render full cards
inline, not via the modal — that flow was already correct, only the
zero-state and Browse All were broken.

**Backdrop-click-to-close checks `e.target === e.currentTarget`, not the
delegated `data-action` switch.** `.modal-close` (the &times; button) is
wired through the normal switch like everything else, but the backdrop
itself is deliberately handled by a one-off listener attached in
`openPairingModal()`. Routing it through `closest('[data-action]')` like
other actions would close the modal on *any* click inside `.modal-panel`
— the panel is a descendant of the backdrop, so `closest()` climbing the
tree would find the backdrop's `data-action` regardless of where inside
the modal you clicked. If you touch this, keep the direct
`e.target === e.currentTarget` check rather than "simplifying" it back
into the delegated switch.

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

## Design

**"Frequency" in the "Magnetic" palette — a deliberate, committed dark
theme, not a light/dark toggle.** Chosen 2026-08-11 after reviewing
three full design directions as an Artifact mockup (a kraft-paper
"Sleeve" concept, a handwritten-marginalia "Marginalia" concept, and
this one) and four color variants of Frequency specifically (Phosphor
teal, Magnetic violet, Solar amber, Crimson pink-red). Magnetic won for
tying directly to the "magnetic" word in the original design brief and
reading more distinctive/premium than the cooler Phosphor original. Same
reasoning as Sonic Radar committing to one light theme: this is an
equipment/signal aesthetic, and it doesn't make sense half-inverted for
a conventional "light mode" — see `:root` in `styles.css` for the token
set (`--void`/`--panel`/`--signal`/`--mist`/`--hair`).

**The reframe from "find an album" to "score your reading session" is
copy, not just a slogan — it changed real UI text.** The original
scaffold framed this as browsing music to find something to read *to*;
the user pointed out that's backwards, since you already have the book
and are looking for what accompanies it. That flipped the nav label
("Find a Pairing" &rarr; "Find a Score"), the tagline, the contribute
form ("Pair a book with an album" &rarr; "Score a book", "Add pairing"
&rarr; "Add score"), and the result panel's kicker labels ("Now
reading" for the book, "The score" for the paired album) — book is
always presented as the given, album as the output. If you touch this
copy again, keep that direction; don't drift back to album-first
language.

**Space Grotesk is self-hosted** (`fonts/space-grotesk-700.woff2`, one
weight only, `@font-face` in `styles.css`) rather than loaded from
Google Fonts — used sparingly, only for the wordmark and card/heading
titles, exactly as "used with restraint" as the design brief called for.
Body text and nav are system sans; mono labels/chips/inputs use a system
monospace stack (`--font-mono`) — no mono webfont needed, system
monospace is a legitimate, deliberate choice here (see the
`artifact-design` skill's guidance on utility faces), not a corner cut.

**The per-pairing waveform (`.mini-wave`) is genuinely data-driven, not
decorative — this is the one signature element, per "spend your
boldness in one place."** `waveformPath()` in `lib/pure.js` (tested in
`lib/pure.test.js`) derives a smooth-vs-jagged, high-vs-low-amplitude
SVG path from a book's actual Mood Tags via a deterministic string hash
(`moodSeed()`) — a "Dreamy, Contemplative" book reads as a smooth low
curve, a "Tense, Bleak" one reads jagged. It only renders on **curated**
pairing cards in the Find tab (using the *book's* mood tags, not the
album's — see `renderFind()` in `app.js`), deliberately not on suggested
albums, browse-tab rows, or anywhere else — adding it everywhere would
turn the one signature moment into wallpaper. The header's `.hero-wave`
is a separate, purely decorative ambient animation (`initHeroWave()`)
that reacts to nothing; don't confuse the two or try to make the hero
wave "mean" something — it's atmosphere, the mini-wave is data.

**The Cloudflare Worker resource keeps its old name
(`liner-notes-worker`), by design, not oversight.** Renaming it to match
the brand would mean deploying a brand-new Worker under a new name (Cloudflare
doesn't rename in place) and asking the user to re-run `wrangler secret
put` for both secrets on that new resource. Internal infra names never
needed to match the public brand (see project-reference.md "Naming"),
so this was skipped to avoid the friction. `WORKER_URL` in `app.js`
still points at `liner-notes-worker.stephen-nolan85.workers.dev` —
that's expected, not a leftover bug. Same reasoning applied to the
Airtable base name (still "Liner Notes" in the Airtable UI — no API
support for renaming a base exists anyway) and the `linerNotes_curatorKey`
&rarr; `chapterverse_curatorKey` localStorage key, which *was* renamed
since it's just a client-side cache key with zero users yet — no
migration cost, no reason not to.
