// The hosted game's runtime (served by server/main.mjs, loaded before the game): window.claude.use(name) as the
// game expects it — db (docs on the server, changes by long poll), user (an anonymous account kept by a cookie),
// sample (Claude, within daily limits) — plus site (invites, the link-preview picture, the showcase board).
(function () {
  if (window.claude) return;
  const q = new URLSearchParams(location.search), board = q.get('board') || 'main';
  // an invite token from the link, kept for this board while the tab lives (it lets me move in)
  try { if (q.get('k')) sessionStorage.setItem('invite:' + board, q.get('k')); } catch {}
  const invite = () => { try { return sessionStorage.getItem('invite:' + board) || q.get('k') || ''; } catch { return q.get('k') || ''; } };
  const call = async (path, opts = {}) => {
    const r = await fetch('/api/' + path, { ...opts, headers: { 'x-isles': '1', 'x-invite': invite(), ...(opts.body && !(opts.body instanceof Blob) ? { 'content-type': 'application/json' } : {}), ...(opts.headers ?? {}) } });
    const v = await r.json().catch(() => null);
    if (!r.ok) throw { code: r.status === 429 ? (v?.error === 'daily_limit' ? 'daily_limit' : 'rate_limited') : r.status === 403 ? 'denied' : 'unavailable', message: v?.error ?? String(r.status) };
    return v;
  };
  const enc = encodeURIComponent;
  const docRef = (col, id) => ({ id,
    get: async () => { const d = await call(`doc/${enc(col)}/${enc(id)}`); return { exists: d !== null, data: () => d }; },
    set: (data) => call(`doc/${enc(col)}/${enc(id)}`, { method: 'PUT', body: JSON.stringify(data) }),
    update: (data) => call(`doc/${enc(col)}/${enc(id)}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: () => call(`doc/${enc(col)}/${enc(id)}`, { method: 'DELETE' }) });
  const toDocs = (m) => [...m].map(([id, d]) => ({ id, data: () => d }));
  const collection = (col) => ({
    doc: (id) => docRef(col, id),
    get: async () => { const v = await call(`col/${enc(col)}?after=0`); return { docs: v.docs.filter(d => d.data !== null).map(d => ({ id: d.id, data: () => d.data })) }; },
    /** Every change, as the whole collection: the server sends only what changed since the last answer, and holds the request until something does. */
    onSnapshot(fn, err) {
      const docs = new Map(); let ver = 0, on = true, fails = 0;
      (async () => {
        while (on) {
          try {
            const v = await call(`col/${enc(col)}?after=${ver}${ver ? '&wait=1' : ''}`); fails = 0;
            for (const d of v.docs) { if (d.data === null) docs.delete(d.id); else docs.set(d.id, d.data); }
            const first = ver === 0; ver = v.ver;
            if ((v.docs.length || first) && on) fn({ docs: toDocs(docs) });
          } catch (e) { if (++fails === 3 && err) err(e); await new Promise(r => setTimeout(r, Math.min(15000, 1000 * fails))); }
        }
      })();
      return () => { on = false; };
    } });
  let meP = null; const me = () => (meP ??= call('me?board=' + enc(board)));
  const NS = {
    db: { collection, doc: (p) => { const i = p.lastIndexOf('/'); return docRef(p.slice(0, i), p.slice(i + 1)); } },
    user: { id: async () => (await me()).uid, isOwner: async () => (await me()).owner, profiles: (ids) => call('profiles?ids=' + ids.map(enc).join(',')) },
    sample: async (input, opts = {}) => {
      const prompt = typeof input === 'string' ? input : input.map(m => m.content).join('\n\n');
      const r = await fetch('/api/sample', { method: 'POST', headers: { 'x-isles': '1', 'content-type': 'application/json' }, body: JSON.stringify({ prompt, kind: opts.purpose ?? 'build' }), signal: opts.signal });
      if (!r.ok) { const v = await r.json().catch(() => null); throw { code: r.status === 429 ? 'daily_limit' : r.status === 503 ? 'rate_limited' : 'unavailable', message: v?.error }; }
      const rd = r.body.getReader(), dec = new TextDecoder(); let text = '';
      for (;;) { const { value, done } = await rd.read(); if (done) break; const delta = dec.decode(value, { stream: true }); text += delta; opts.onText && opts.onText({ text, delta }); }
      return { text, truncated: false };
    },
    site: {
      hosted: true,
      invited: !!invite(),   // this page came from an invite link to this board
      showcase: board === 'main',   // the first board is a showcase: look around, then make your own archipelago
      me: () => call('me?board=' + enc(board)),
      rename: (name) => call('name', { method: 'POST', body: JSON.stringify({ name }) }),
      invite: async (b) => (await call('invite', { method: 'POST', body: JSON.stringify({ board: b }) })).token,
      thumb: (b, blob) => call('thumb/' + enc(b), { method: 'POST', body: blob, headers: { 'content-type': 'image/png' } }),
    },
  };
  window.claude = { use: async (name) => NS[name] ?? null };
})();
