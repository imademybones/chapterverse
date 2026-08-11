import {
  esc, safeExternalUrl, spotifyEmbedUrl,
  recordToBook, bookToFields,
  recordToAlbum, albumToFields,
  recordToPairing, pairingToFields,
  suggestAlbumsForBook, pairingsForBook, albumsForPairings,
  waveformPath,
} from './lib/pure.js';

// Deliberately still "liner-notes-worker" — the Cloudflare Worker resource
// was never renamed to match the Chapterverse rebrand (would require the
// user to re-run `wrangler secret put` for a new resource). Internal
// infra names don't need to match the public brand — see CLAUDE.md.
const WORKER_URL = 'https://liner-notes-worker.stephen-nolan85.workers.dev';

const BOOK_GENRES = ['Fiction', 'Fantasy', 'Sci-Fi', 'Mystery/Thriller', 'Horror', 'Romance',
  'Historical Fiction', 'Non-Fiction', 'Biography/Memoir', 'History', 'Young Adult', 'Classics'];
const ALBUM_GENRES = ['Ambient', 'Jazz', 'Metal', 'Electronic', 'Rock', 'Folk', 'Classical',
  'Hip-Hop', 'Pop', 'Soundtrack/Score', 'Experimental'];
// Identical vocabulary on both sides — this is what makes "similar mood"
// suggestions meaningful. Keep Books and Albums in sync if this changes;
// it must also match the Mood Tags choices on both Airtable tables.
const MOOD_TAGS = ['Tense', 'Cozy', 'Atmospheric', 'Melancholic', 'Propulsive', 'Eerie',
  'Whimsical', 'Epic', 'Intimate', 'Bleak', 'Dreamy', 'Contemplative'];

const state = {
  books: [],
  albums: [],
  pairings: [],
  activeTab: 'find',
  selectedBookId: null,
  selectedTags: { book: new Set(), album: new Set() },
  curatorKey: localStorage.getItem('chapterverse_curatorKey') || null,
};

// ---- API ----

async function apiRequest(path, options = {}) {
  const res = await fetch(`${WORKER_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(state.curatorKey ? { 'X-Curator-Passphrase': state.curatorKey } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`${options.method || 'GET'} ${path} failed (${res.status})`);
  return res.status === 204 ? null : res.json();
}

async function fetchAllRecords(path) {
  let records = [];
  let offset;
  do {
    const q = offset ? `?offset=${encodeURIComponent(offset)}` : '';
    const page = await apiRequest(`${path}${q}`);
    records = records.concat(page.records || []);
    offset = page.offset;
  } while (offset);
  return records;
}

async function loadAll() {
  const [bookRecords, albumRecords, pairingRecords] = await Promise.all([
    fetchAllRecords('/books'),
    fetchAllRecords('/albums'),
    fetchAllRecords('/pairings'),
  ]);
  state.books = bookRecords.map(recordToBook);
  state.albums = albumRecords.map(recordToAlbum);
  state.pairings = pairingRecords.map(recordToPairing);
}

// ---- Bootstrap ----

async function init() {
  populateGenreSelects();
  populateTagPickers();
  populatePairingFormSelects();
  wireEvents();
  initHeroWave();

  if (!WORKER_URL) {
    showStatus('Not connected to a data source yet — this is a UI preview only. See CLAUDE.md "Deploy".', 'is-error');
    return;
  }
  try {
    await loadAll();
    populatePairingFormSelects();
    renderActiveTab();
  } catch (err) {
    showStatus(`Could not load data: ${err.message}`, 'is-error');
  }
}

function showStatus(message, cls) {
  const el = document.getElementById('statusBanner');
  el.textContent = message;
  el.className = `status-banner ${cls || ''}`;
  el.hidden = false;
}

// Ambient idle waveform in the header — ties the "score your reading
// session" framing to something that actually looks like a signal, before
// any book is even searched. Purely decorative (unlike the per-pairing
// waveform below, which is derived from real mood-tag data) — respects
// prefers-reduced-motion via the CSS animation itself, not JS.
function initHeroWave() {
  const wave = document.getElementById('heroWave');
  if (!wave) return;
  const bars = 48;
  let html = '';
  for (let i = 0; i < bars; i++) {
    const delay = (i * 0.045).toFixed(3);
    const height = (14 + Math.sin(i * 0.6) * 10 + Math.random() * 8).toFixed(1);
    html += `<i style="animation-delay:${delay}s; height:${height}px"></i>`;
  }
  wave.innerHTML = html;
}

// ---- Form scaffolding ----

function populateGenreSelects() {
  fillSelect(document.querySelector('#addBookForm select[name="genre"]'), BOOK_GENRES);
  fillSelect(document.querySelector('#addAlbumForm select[name="genre"]'), ALBUM_GENRES);
}

function fillSelect(select, options) {
  for (const opt of options) {
    const el = document.createElement('option');
    el.value = opt;
    el.textContent = opt;
    select.appendChild(el);
  }
}

function populateTagPickers() {
  for (const picker of document.querySelectorAll('[data-tag-picker]')) {
    const kind = picker.dataset.tagPicker;
    picker.innerHTML = MOOD_TAGS.map(tag =>
      `<button type="button" class="tag-option" data-action="toggle-tag" data-picker="${kind}" data-tag="${esc(tag)}">${esc(tag)}</button>`
    ).join('');
  }
}

function populatePairingFormSelects() {
  const bookSelect = document.querySelector('#addPairingForm select[name="bookId"]');
  const albumSelect = document.querySelector('#addPairingForm select[name="albumId"]');
  if (bookSelect) {
    bookSelect.innerHTML = '<option value="">&ndash; choose a book &ndash;</option>' +
      state.books.map(b => `<option value="${b.id}">${esc(b.title)}${b.author ? ' — ' + esc(b.author) : ''}</option>`).join('');
  }
  if (albumSelect) {
    albumSelect.innerHTML = '<option value="">&ndash; choose an album &ndash;</option>' +
      state.albums.map(a => `<option value="${a.id}">${esc(a.title)}${a.artist ? ' — ' + esc(a.artist) : ''}</option>`).join('');
  }
}

// ---- Tabs ----

function switchTab(tab) {
  state.activeTab = tab;
  for (const btn of document.querySelectorAll('.tab-btn')) {
    btn.classList.toggle('is-active', btn.dataset.tab === tab);
  }
  for (const panel of document.querySelectorAll('.tab-panel')) {
    panel.hidden = panel.id !== `tab-${tab}`;
  }
  renderActiveTab();
}

function renderActiveTab() {
  if (state.activeTab === 'find') renderFind();
  if (state.activeTab === 'browse') renderBrowse();
}

// ---- Find a Pairing ----

function renderBookSearchResults(query) {
  const el = document.getElementById('bookResults');
  const q = query.trim().toLowerCase();
  if (!q) { el.innerHTML = ''; return; }
  const matches = state.books
    .filter(b => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q))
    .slice(0, 8);
  el.innerHTML = matches.map(b => `
    <div class="book-result" data-action="select-book" data-id="${b.id}">
      <span>${esc(b.title)}</span>
      <span class="author">${esc(b.author)}</span>
    </div>
  `).join('');
}

function albumCardHtml(album, { kicker, whyItPairs, hearts, pairingId, suggestedNote, waveformTags } = {}) {
  const spotify = spotifyEmbedUrl(album.spotifyUrl);
  const bandcamp = safeExternalUrl(album.bandcampUrl);
  return `
    <div class="album-card">
      ${kicker ? `<p class="card-kicker">${esc(kicker)}</p>` : ''}
      <div class="album-title">${esc(album.title)}</div>
      <div class="artist">${esc(album.artist)}</div>
      ${whyItPairs ? `<p class="why-it-pairs">&ldquo;${esc(whyItPairs)}&rdquo;</p>` : ''}
      ${suggestedNote ? `<p class="suggested-note">${esc(suggestedNote)}</p>` : ''}
      <div class="tag-row">${(album.moodTags || []).map(t => `<span class="tag-chip">${esc(t)}</span>`).join('')}</div>
      ${waveformTags && waveformTags.length ? `
        <div class="mini-wave"><svg viewBox="0 0 320 44" preserveAspectRatio="none"><path d="${waveformPath(waveformTags, 320, 44)}"></path></svg></div>
        <p class="mini-wave-label">signal shape &mdash; derived from this pairing's mood tags</p>
      ` : ''}
      ${spotify ? `<iframe src="${spotify}" width="100%" height="80" frameborder="0" allow="encrypted-media" loading="lazy"></iframe>` : ''}
      <div class="card-actions">
        ${bandcamp ? `<a class="card-link" href="${bandcamp}" target="_blank" rel="noopener noreferrer">Bandcamp &#8599;</a>` : ''}
        ${pairingId ? `<button class="heart-btn" data-action="heart-pairing" data-id="${pairingId}">&hearts; ${hearts || 0}</button>` : ''}
      </div>
    </div>
  `;
}

function renderFind() {
  const book = state.books.find(b => b.id === state.selectedBookId);
  const out = document.getElementById('findOutput');
  if (!book) { out.innerHTML = ''; return; }

  const curated = pairingsForBook(book, state.pairings);
  const albumsById = Object.fromEntries(state.albums.map(a => [a.id, a]));
  const curatedResolved = albumsForPairings(curated, albumsById);
  const curatedAlbumIds = new Set(curatedResolved.map(x => x.album.id));

  const suggested = suggestAlbumsForBook(book, state.albums)
    .filter(x => !curatedAlbumIds.has(x.album.id));

  out.innerHTML = `
    <div class="selected-book">
      <p class="card-kicker">Now reading</p>
      <h2>${esc(book.title)}</h2>
      <span class="author">${esc(book.author)}</span>
      <div class="tag-row">${(book.moodTags || []).map(t => `<span class="tag-chip is-on">${esc(t)}</span>`).join('')}</div>
    </div>
    <div class="pairing-section-label">The score</div>
    ${curatedResolved.length
      ? curatedResolved.map(x => albumCardHtml(x.album, {
          kicker: 'The score', whyItPairs: x.pairing.whyItPairs, hearts: x.pairing.hearts,
          pairingId: x.pairing.id, waveformTags: book.moodTags,
        })).join('')
      : `<p class="empty-state">No one has scored this book yet &mdash; be the first, in the Contribute tab.</p>`}
    ${suggested.length ? `
      <div class="pairing-section-label">Similar mood, not yet scored</div>
      ${suggested.map(x => albumCardHtml(x.album, { kicker: 'Similar mood', suggestedNote: 'Suggested by shared mood tags, not yet a curated score.' })).join('')}
    ` : ''}
  `;
}

// ---- Browse All ----

function renderBrowse(filterText = '') {
  const grid = document.getElementById('pairingGrid');
  const albumsById = Object.fromEntries(state.albums.map(a => [a.id, a]));
  const booksById = Object.fromEntries(state.books.map(b => [b.id, b]));
  const q = filterText.trim().toLowerCase();

  const rows = state.pairings
    .map(p => ({ pairing: p, book: booksById[p.bookIds[0]], album: albumsById[p.albumIds[0]] }))
    .filter(x => x.book && x.album)
    .filter(x => !q || `${x.book.title} ${x.book.author} ${x.album.title} ${x.album.artist}`.toLowerCase().includes(q));

  if (!rows.length) {
    grid.innerHTML = `<p class="empty-state">No scores yet.</p>`;
    return;
  }

  grid.innerHTML = rows.map(({ pairing, book, album }) => `
    <div class="pairing-row">
      <div class="pairing-books-albums">${esc(book.title)} <span class="sep">&times;</span> ${esc(album.title)}</div>
      <p class="why-it-pairs">&ldquo;${esc(pairing.whyItPairs)}&rdquo;</p>
      <div class="card-actions">
        <button class="heart-btn" data-action="heart-pairing" data-id="${pairing.id}">&hearts; ${pairing.hearts || 0}</button>
        ${state.curatorKey ? `<button class="delete-btn" data-action="delete-pairing" data-id="${pairing.id}">Delete</button>` : ''}
      </div>
    </div>
  `).join('');
}

// ---- Mutations ----

async function heartPairing(id) {
  try {
    const record = await apiRequest(`/pairings/${id}/heart`, { method: 'POST' });
    const idx = state.pairings.findIndex(p => p.id === id);
    if (idx !== -1) state.pairings[idx] = recordToPairing(record);
    renderActiveTab();
  } catch (err) {
    showStatus(`Couldn't add that heart: ${err.message}`, 'is-error');
  }
}

async function deletePairing(id) {
  if (!confirm('Delete this pairing?')) return;
  try {
    await apiRequest(`/pairings/${id}`, { method: 'DELETE' });
    state.pairings = state.pairings.filter(p => p.id !== id);
    renderActiveTab();
  } catch (err) {
    showStatus(`Couldn't delete: ${err.message}`, 'is-error');
  }
}

async function unlockCurator() {
  const key = prompt('Curator passphrase:');
  if (!key) return;
  try {
    const res = await fetch(`${WORKER_URL}/verify-curator`, { headers: { 'X-Curator-Passphrase': key } });
    if (!res.ok) { alert('Incorrect passphrase.'); return; }
    state.curatorKey = key;
    localStorage.setItem('chapterverse_curatorKey', key);
    renderActiveTab();
  } catch (err) {
    alert(`Could not verify: ${err.message}`);
  }
}

async function handleAddBook(form) {
  const statusEl = form.querySelector('[data-status]');
  const data = new FormData(form);
  const book = {
    title: data.get('title')?.trim(),
    author: data.get('author')?.trim(),
    genre: data.get('genre'),
    moodTags: [...state.selectedTags.book],
    notes: data.get('notes')?.trim(),
    addedBy: data.get('addedBy')?.trim(),
  };
  try {
    const record = await apiRequest('/books', { method: 'POST', body: JSON.stringify({ fields: bookToFields(book) }) });
    state.books.push(recordToBook(record));
    populatePairingFormSelects();
    form.reset();
    state.selectedTags.book.clear();
    syncTagPickerUI('book');
    statusEl.textContent = 'Added.';
    statusEl.className = 'form-status is-success';
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.className = 'form-status is-error';
  }
}

async function handleAddAlbum(form) {
  const statusEl = form.querySelector('[data-status]');
  const data = new FormData(form);
  const album = {
    title: data.get('title')?.trim(),
    artist: data.get('artist')?.trim(),
    genre: data.get('genre'),
    moodTags: [...state.selectedTags.album],
    spotifyUrl: data.get('spotifyUrl')?.trim(),
    bandcampUrl: data.get('bandcampUrl')?.trim(),
    notes: data.get('notes')?.trim(),
    addedBy: data.get('addedBy')?.trim(),
  };
  try {
    const record = await apiRequest('/albums', { method: 'POST', body: JSON.stringify({ fields: albumToFields(album) }) });
    state.albums.push(recordToAlbum(record));
    populatePairingFormSelects();
    form.reset();
    state.selectedTags.album.clear();
    syncTagPickerUI('album');
    statusEl.textContent = 'Added.';
    statusEl.className = 'form-status is-success';
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.className = 'form-status is-error';
  }
}

async function handleAddPairing(form) {
  const statusEl = form.querySelector('[data-status]');
  const data = new FormData(form);
  const pairing = {
    bookIds: [data.get('bookId')],
    albumIds: [data.get('albumId')],
    whyItPairs: data.get('whyItPairs')?.trim(),
    hearts: 0,
    addedBy: data.get('addedBy')?.trim(),
  };
  try {
    const record = await apiRequest('/pairings', { method: 'POST', body: JSON.stringify({ fields: pairingToFields(pairing) }) });
    state.pairings.push(recordToPairing(record));
    form.reset();
    statusEl.textContent = 'Scored.';
    statusEl.className = 'form-status is-success';
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.className = 'form-status is-error';
  }
}

function syncTagPickerUI(kind) {
  const picker = document.querySelector(`[data-tag-picker="${kind}"]`);
  for (const btn of picker.querySelectorAll('.tag-option')) {
    btn.classList.toggle('is-selected', state.selectedTags[kind].has(btn.dataset.tag));
  }
}

// ---- Events (delegated, data-action keyed — see CLAUDE.md) ----

function wireEvents() {
  document.addEventListener('click', (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) return;
    const { action, id, tab, tag, picker } = target.dataset;
    switch (action) {
      case 'switch-tab':
        switchTab(tab);
        break;
      case 'select-book':
        state.selectedBookId = id;
        document.getElementById('bookResults').innerHTML = '';
        document.getElementById('bookSearch').value = '';
        renderFind();
        break;
      case 'heart-pairing':
        heartPairing(id);
        break;
      case 'delete-pairing':
        deletePairing(id);
        break;
      case 'unlock-curator':
        e.preventDefault();
        unlockCurator();
        break;
      case 'toggle-tag': {
        const set = state.selectedTags[picker];
        set.has(tag) ? set.delete(tag) : set.add(tag);
        syncTagPickerUI(picker);
        break;
      }
    }
  });

  document.getElementById('bookSearch').addEventListener('input', (e) => renderBookSearchResults(e.target.value));
  document.getElementById('browseSearch').addEventListener('input', (e) => renderBrowse(e.target.value));

  document.getElementById('addBookForm').addEventListener('submit', (e) => { e.preventDefault(); handleAddBook(e.target); });
  document.getElementById('addAlbumForm').addEventListener('submit', (e) => { e.preventDefault(); handleAddAlbum(e.target); });
  document.getElementById('addPairingForm').addEventListener('submit', (e) => { e.preventDefault(); handleAddPairing(e.target); });
}

init();
