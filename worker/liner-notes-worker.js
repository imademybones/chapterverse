// Cloudflare Worker — Airtable CRUD passthrough for Liner Notes.
// Same shape as Sonic Radar's worker, extended to three tables instead of
// one: Books, Albums, Pairings. The Airtable token never reaches the
// client; it lives only as the AIRTABLE_TOKEN secret here.
//
// Public, collaborative app: anyone can add a book, an album, a pairing,
// or heart a pairing (POST — no gate). Editing or deleting an existing
// record (PATCH/DELETE) requires the X-Curator-Passphrase header to match
// the CURATOR_PASSPHRASE secret — same split as Sonic Radar's "collaborative
// write model": open contribution, curator-protected removal/editing. This
// is a single shared static passphrase, not per-user auth.

const AIRTABLE_API = 'https://api.airtable.com/v0';

const TABLES = {
  books: 'Books',
  albums: 'Albums',
  pairings: 'Pairings',
};

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Curator-Passphrase',
  };
}

function passthrough(status, body, headers) {
  return new Response(body, { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}

function isCurator(request, env) {
  const provided = request.headers.get('X-Curator-Passphrase') || '';
  return !!env.CURATOR_PASSPHRASE && provided === env.CURATOR_PASSPHRASE;
}

async function airtableRequest(env, tableName, path, options = {}) {
  const table = encodeURIComponent(tableName);
  const url = `${AIRTABLE_API}/${env.BASE_ID}/${table}${path}`;
  return fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${env.AIRTABLE_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = corsHeaders(env);

    // Answered unconditionally, before any other logic.
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    if (url.pathname === '/health') {
      return passthrough(200, JSON.stringify({ ok: true }), headers);
    }

    // Lets the client confirm a passphrase immediately (for unlock UX)
    // without needing to attempt a real mutation to find out.
    if (url.pathname === '/verify-curator') {
      const ok = isCurator(request, env);
      return passthrough(ok ? 200 : 403, JSON.stringify({ ok }), headers);
    }

    // /books, /albums, /pairings — collection routes.
    const collectionMatch = url.pathname.match(/^\/(books|albums|pairings)$/);
    if (collectionMatch) {
      const tableName = TABLES[collectionMatch[1]];
      if (request.method === 'GET') {
        const offset = url.searchParams.get('offset');
        const path = offset ? `?offset=${encodeURIComponent(offset)}` : '';
        const res = await airtableRequest(env, tableName, path);
        return passthrough(res.status, await res.text(), headers);
      }
      if (request.method === 'POST') {
        // Open — anyone can contribute. typecast lets a contributor's
        // singleSelect value auto-create that choice the first time.
        const res = await airtableRequest(env, tableName, '', { method: 'POST', body: await request.text() });
        return passthrough(res.status, await res.text(), headers);
      }
      return new Response('Method not allowed', { status: 405, headers });
    }

    // POST /pairings/:id/heart — open aggregate counter, same pattern as
    // Sonic Radar. Read-then-write is good enough at this app's scale.
    const heartMatch = url.pathname.match(/^\/pairings\/([A-Za-z0-9]+)\/heart$/);
    if (heartMatch && request.method === 'POST') {
      const id = heartMatch[1];
      const getRes = await airtableRequest(env, TABLES.pairings, `/${id}`);
      if (!getRes.ok) return passthrough(getRes.status, await getRes.text(), headers);
      const record = await getRes.json();
      const current = record.fields?.['Hearts'] || 0;
      const patchRes = await airtableRequest(env, TABLES.pairings, `/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ fields: { 'Hearts': current + 1 } }),
      });
      return passthrough(patchRes.status, await patchRes.text(), headers);
    }

    // /books/:id, /albums/:id, /pairings/:id — single-record routes.
    const recordMatch = url.pathname.match(/^\/(books|albums|pairings)\/([A-Za-z0-9]+)$/);
    if (recordMatch) {
      const tableName = TABLES[recordMatch[1]];
      const id = recordMatch[2];
      if (request.method === 'PATCH') {
        if (!isCurator(request, env)) {
          return passthrough(403, JSON.stringify({ error: 'Curator passphrase required to edit this record.' }), headers);
        }
        const res = await airtableRequest(env, tableName, `/${id}`, { method: 'PATCH', body: await request.text() });
        return passthrough(res.status, await res.text(), headers);
      }
      if (request.method === 'DELETE') {
        if (!isCurator(request, env)) {
          return passthrough(403, JSON.stringify({ error: 'Curator passphrase required to delete this record.' }), headers);
        }
        const res = await airtableRequest(env, tableName, `/${id}`, { method: 'DELETE' });
        return passthrough(res.status, await res.text(), headers);
      }
      return new Response('Method not allowed', { status: 405, headers });
    }

    return new Response('Not found', { status: 404, headers });
  },
};
