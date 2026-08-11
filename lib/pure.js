// Pure, DOM-free helpers shared by index.html and lib/pure.test.js.
// node --test lib/pure.test.js runs these directly — see CLAUDE.md.

export function esc(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Contributor-pasted URLs (Spotify/Bandcamp links) rendered as an href
// must be scheme-checked, not just esc()'d — esc() stops attribute
// breakout but a `javascript:` URL is still a valid, dangerous href.
export function safeExternalUrl(url) {
  if (!url) return null;
  return /^https?:\/\//i.test(url.trim()) ? url.trim() : null;
}

export function spotifyEmbedUrl(spotifyUrl) {
  if (!spotifyUrl) return null;
  const uriMatch = spotifyUrl.match(/^spotify:(album|track|artist):([A-Za-z0-9]+)$/);
  if (uriMatch) return `https://open.spotify.com/embed/${uriMatch[1]}/${uriMatch[2]}`;
  const urlMatch = spotifyUrl.match(/open\.spotify\.com\/(album|track|artist)\/([A-Za-z0-9]+)/);
  if (urlMatch) return `https://open.spotify.com/embed/${urlMatch[1]}/${urlMatch[2]}`;
  return null;
}

// ---- Airtable <-> app record mapping ----

export function recordToBook(record) {
  const f = record.fields || {};
  return {
    id: record.id,
    title: f['Title'] || '',
    author: f['Author'] || '',
    genre: f['Genre'] || '',
    moodTags: f['Mood Tags'] || [],
    notes: f['Notes'] || '',
    addedBy: f['Added By'] || '',
    addedAt: f['Added At'] || null,
  };
}

export function bookToFields(book) {
  const fields = {
    'Title': book.title || '',
    'Author': book.author || '',
    'Mood Tags': book.moodTags || [],
    'Added At': book.addedAt || new Date().toISOString(),
  };
  if (book.genre) fields['Genre'] = book.genre;
  if (book.notes) fields['Notes'] = book.notes;
  if (book.addedBy) fields['Added By'] = book.addedBy;
  return fields;
}

export function recordToAlbum(record) {
  const f = record.fields || {};
  return {
    id: record.id,
    title: f['Title'] || '',
    artist: f['Artist'] || '',
    genre: f['Genre'] || '',
    moodTags: f['Mood Tags'] || [],
    spotifyUrl: f['Spotify URL'] || '',
    bandcampUrl: f['Bandcamp URL'] || '',
    notes: f['Notes'] || '',
    addedBy: f['Added By'] || '',
    addedAt: f['Added At'] || null,
  };
}

export function albumToFields(album) {
  const fields = {
    'Title': album.title || '',
    'Artist': album.artist || '',
    'Mood Tags': album.moodTags || [],
    'Added At': album.addedAt || new Date().toISOString(),
  };
  if (album.genre) fields['Genre'] = album.genre;
  if (album.spotifyUrl) fields['Spotify URL'] = album.spotifyUrl;
  if (album.bandcampUrl) fields['Bandcamp URL'] = album.bandcampUrl;
  if (album.notes) fields['Notes'] = album.notes;
  if (album.addedBy) fields['Added By'] = album.addedBy;
  return fields;
}

export function recordToPairing(record) {
  const f = record.fields || {};
  return {
    id: record.id,
    whyItPairs: f['Why It Pairs'] || '',
    bookIds: f['Book'] || [],
    albumIds: f['Album'] || [],
    hearts: f['Hearts'] || 0,
    addedBy: f['Added By'] || '',
    addedAt: f['Added At'] || null,
  };
}

export function pairingToFields(pairing) {
  const fields = {
    'Why It Pairs': pairing.whyItPairs || '',
    'Book': pairing.bookIds || [],
    'Album': pairing.albumIds || [],
    'Hearts': pairing.hearts || 0,
    'Added At': pairing.addedAt || new Date().toISOString(),
  };
  if (pairing.addedBy) fields['Added By'] = pairing.addedBy;
  return fields;
}

// ---- Suggested pairings ----
// The catalogue grows one curated pairing at a time, so most books won't
// have one yet. jaccard() over the shared Mood Tags vocabulary (identical
// choice list on Books and Albums — see CLAUDE.md) gives a fallback
// suggestion — "no one has paired this book yet, but here's what's tonally
// close" — instead of a dead end. It is explicitly a fallback, never a
// replacement for a real curated Why-It-Pairs note.

export function jaccard(a = [], b = []) {
  const A = new Set(a), B = new Set(b);
  if (A.size === 0 && B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function suggestAlbumsForBook(book, albums, { limit = 6, minScore = 0.01 } = {}) {
  return albums
    .map(album => ({ album, score: jaccard(book.moodTags, album.moodTags) }))
    .filter(x => x.score >= minScore)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit);
}

export function pairingsForBook(book, pairings) {
  return pairings.filter(p => p.bookIds.includes(book.id));
}

export function albumsForPairings(pairingsForThisBook, albumsById) {
  return pairingsForThisBook
    .map(p => ({ pairing: p, album: albumsById[p.albumIds[0]] }))
    .filter(x => !!x.album);
}

// ---- Signal shape ----
// A pairing's "signal shape" is a small waveform derived from its mood
// tags — Frequency's one signature element (see CLAUDE.md "Design"). It's
// a structural device that encodes real content (which tags are present),
// not decoration: a jagged high-frequency tag set reads visibly different
// from a smooth low-amplitude one. moodSeed() is a simple deterministic
// string hash — not cryptographic, just needs to vary per tag name.

export function moodSeed(tag) {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return h;
}

export function waveformPath(tags, w, h, points = 32) {
  if (!tags || tags.length === 0) return `M0,${(h / 2).toFixed(1)} L${w},${(h / 2).toFixed(1)}`;
  let freq = 0, amp = 0, jag = 0;
  for (const tag of tags) {
    const seed = moodSeed(tag);
    freq += 1 + (seed % 5);
    amp += 0.4 + ((seed >> 3) % 10) / 10;
    jag += seed % 3;
  }
  freq /= tags.length; amp = Math.min(amp / tags.length, 1); jag /= tags.length;
  let d = '';
  for (let i = 0; i <= points; i++) {
    const x = (i / points) * w;
    const t = i / points;
    const noise = jag > 1 ? Math.sin(i * 12.9) * 0.5 : 0;
    const y = h / 2 - Math.sin(t * Math.PI * freq) * (h / 2 - 4) * amp * (1 + noise * 0.4);
    d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1) + ' ';
  }
  return d.trim();
}
