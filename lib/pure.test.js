import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  esc,
  safeExternalUrl,
  spotifyEmbedUrl,
  recordToBook,
  bookToFields,
  recordToAlbum,
  albumToFields,
  recordToPairing,
  pairingToFields,
  jaccard,
  suggestAlbumsForBook,
  pairingsForBook,
  albumsForPairings,
  moodSeed,
  waveformPath,
  mostRecentPairings,
} from './pure.js';

// ---- esc / safeExternalUrl / spotifyEmbedUrl ----

test('esc: escapes HTML-significant characters', () => {
  assert.equal(esc('<script>&"\''), '&lt;script&gt;&amp;&quot;&#39;');
  assert.equal(esc(''), '');
  assert.equal(esc(null), '');
});

test('safeExternalUrl: allows only http(s)', () => {
  assert.equal(safeExternalUrl('https://open.spotify.com/album/abc'), 'https://open.spotify.com/album/abc');
  assert.equal(safeExternalUrl('javascript:alert(1)'), null);
  assert.equal(safeExternalUrl(''), null);
});

test('spotifyEmbedUrl: normalizes URLs and URIs, rejects garbage', () => {
  assert.equal(
    spotifyEmbedUrl('https://open.spotify.com/album/abc123?si=xyz'),
    'https://open.spotify.com/embed/album/abc123'
  );
  assert.equal(spotifyEmbedUrl('spotify:album:abc123'), 'https://open.spotify.com/embed/album/abc123');
  assert.equal(spotifyEmbedUrl('not a link'), null);
  assert.equal(spotifyEmbedUrl(''), null);
});

// ---- Airtable <-> app record mapping ----

test('recordToBook / bookToFields round-trip the fields that matter', () => {
  const record = {
    id: 'rec1',
    fields: {
      'Title': 'Piranesi',
      'Author': 'Susanna Clarke',
      'Genre': 'Fantasy',
      'Mood Tags': ['Atmospheric', 'Dreamy'],
      'Notes': 'A house that is the world.',
      'Added By': 'Stephen',
      'Added At': '2026-08-01T00:00:00.000Z',
    },
  };
  const book = recordToBook(record);
  assert.equal(book.id, 'rec1');
  assert.equal(book.title, 'Piranesi');
  assert.deepEqual(book.moodTags, ['Atmospheric', 'Dreamy']);

  const fields = bookToFields(book);
  assert.equal(fields['Title'], 'Piranesi');
  assert.deepEqual(fields['Mood Tags'], ['Atmospheric', 'Dreamy']);
});

test('recordToBook: defaults missing fields safely', () => {
  const book = recordToBook({ id: 'rec2', fields: {} });
  assert.equal(book.title, '');
  assert.deepEqual(book.moodTags, []);
});

test('recordToAlbum / albumToFields round-trip the fields that matter', () => {
  const record = {
    id: 'rec3',
    fields: {
      'Title': 'Music for Airports',
      'Artist': 'Brian Eno',
      'Genre': 'Ambient',
      'Mood Tags': ['Atmospheric', 'Contemplative'],
      'Spotify URL': 'https://open.spotify.com/album/xyz',
    },
  };
  const album = recordToAlbum(record);
  assert.equal(album.artist, 'Brian Eno');
  assert.deepEqual(album.moodTags, ['Atmospheric', 'Contemplative']);

  const fields = albumToFields(album);
  assert.equal(fields['Artist'], 'Brian Eno');
  assert.equal(fields['Spotify URL'], 'https://open.spotify.com/album/xyz');
});

test('recordToPairing / pairingToFields round-trip the fields that matter', () => {
  const record = {
    id: 'rec4',
    fields: {
      'Why It Pairs': 'Both are hushed, architectural, and a little uncanny.',
      'Book': ['rec1'],
      'Album': ['rec3'],
      'Hearts': 3,
    },
  };
  const pairing = recordToPairing(record);
  assert.equal(pairing.hearts, 3);
  assert.deepEqual(pairing.bookIds, ['rec1']);

  const fields = pairingToFields(pairing);
  assert.deepEqual(fields['Book'], ['rec1']);
  assert.deepEqual(fields['Album'], ['rec3']);
  assert.equal(fields['Hearts'], 3);
});

// ---- suggested pairings ----

test('jaccard: overlap of two tag sets', () => {
  assert.equal(jaccard(['Atmospheric', 'Dreamy'], ['Atmospheric', 'Tense']), 1 / 3);
  assert.equal(jaccard([], []), 0);
  assert.equal(jaccard(['Cozy'], []), 0);
});

test('suggestAlbumsForBook: ranks albums by mood-tag overlap, drops zero-overlap', () => {
  const book = { id: 'b1', moodTags: ['Atmospheric', 'Dreamy'] };
  const albums = [
    { id: 'a1', moodTags: ['Atmospheric', 'Dreamy'] }, // score 1
    { id: 'a2', moodTags: ['Atmospheric', 'Tense'] },  // score 1/3
    { id: 'a3', moodTags: ['Cozy'] },                  // score 0, dropped
  ];
  const ranked = suggestAlbumsForBook(book, albums);
  assert.deepEqual(ranked.map(x => x.album.id), ['a1', 'a2']);
});

test('suggestAlbumsForBook: respects limit', () => {
  const book = { id: 'b1', moodTags: ['Cozy'] };
  const albums = Array.from({ length: 10 }, (_, i) => ({ id: `a${i}`, moodTags: ['Cozy'] }));
  const ranked = suggestAlbumsForBook(book, albums, { limit: 3 });
  assert.equal(ranked.length, 3);
});

// ---- curated pairing lookups ----

test('pairingsForBook: filters to pairings linking this book', () => {
  const book = { id: 'b1' };
  const pairings = [
    { id: 'p1', bookIds: ['b1'] },
    { id: 'p2', bookIds: ['b2'] },
  ];
  assert.deepEqual(pairingsForBook(book, pairings).map(p => p.id), ['p1']);
});

test('albumsForPairings: resolves album records, drops dangling links', () => {
  const pairings = [
    { id: 'p1', albumIds: ['a1'] },
    { id: 'p2', albumIds: ['missing'] },
  ];
  const albumsById = { a1: { id: 'a1', title: 'Found' } };
  const resolved = albumsForPairings(pairings, albumsById);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].album.title, 'Found');
});

// ---- signal shape ----

test('moodSeed: deterministic and varies per tag', () => {
  assert.equal(moodSeed('Dreamy'), moodSeed('Dreamy'));
  assert.notEqual(moodSeed('Dreamy'), moodSeed('Tense'));
});

test('waveformPath: produces a valid SVG path string starting with M', () => {
  const d = waveformPath(['Atmospheric', 'Dreamy', 'Eerie'], 320, 44);
  assert.match(d, /^M[\d.]+,[\d.]+ L/);
  // 32 points by default -> 33 coordinate pairs (M + 32 L)
  assert.equal((d.match(/[ML]/g) || []).length, 33);
});

test('waveformPath: empty tags falls back to a flat midline, not a crash', () => {
  const d = waveformPath([], 320, 44);
  assert.match(d, /^M0,22\.0 L320,22\.0$/);
});

test('waveformPath: different tag sets produce different shapes', () => {
  const dreamy = waveformPath(['Dreamy', 'Contemplative'], 320, 44);
  const tense = waveformPath(['Tense', 'Bleak'], 320, 44);
  assert.notEqual(dreamy, tense);
});

// ---- recently added ----

test('mostRecentPairings: sorts newest addedAt first', () => {
  const pairings = [
    { id: 'p1', addedAt: '2026-08-01T00:00:00.000Z' },
    { id: 'p2', addedAt: '2026-08-11T00:00:00.000Z' },
    { id: 'p3', addedAt: '2026-08-05T00:00:00.000Z' },
  ];
  assert.deepEqual(mostRecentPairings(pairings).map(p => p.id), ['p2', 'p3', 'p1']);
});

test('mostRecentPairings: respects limit and does not mutate input', () => {
  const pairings = Array.from({ length: 15 }, (_, i) => ({ id: `p${i}`, addedAt: `2026-08-${String(i + 1).padStart(2, '0')}T00:00:00.000Z` }));
  const original = [...pairings];
  const recent = mostRecentPairings(pairings, 10);
  assert.equal(recent.length, 10);
  assert.equal(recent[0].id, 'p14');
  assert.deepEqual(pairings, original);
});
