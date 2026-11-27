// The hosted game's runtime (served by server/main.mjs, loaded before the game): window.claude.use(name) as the
// game expects it — db (docs on the server, changes by long poll), user (an anonymous account kept by a cookie),
// sample (Claude, within daily limits) — plus site (invites, the link-preview picture, the showcase board).
(function () {
  if (window.claude) return;
  const q = new URLSearchParams(location.search), board = q.get('board') || 'main';
  // an invite token from the link, kept for this board while the tab lives (it lets me move in)
  try { if (q.get('k')) sessionStorage.setItem('invite:' + board, q.get('k')); } catch {}
  const invite = () => { try { return sessionStorage.getItem('invite:' + board) || q.get('k') || ''; } catch { return q.get('k') || ''; } };
  // every request has a deadline (a long poll waits up to 25 s on the server): one that hangs must not hold the saves queued behind it
  const call = async (path, opts = {}) => {
    const r = await fetch('/api/' + path, { signal: AbortSignal.timeout(path.includes('wait=1') ? 40000 : 20000), ...opts, headers: { 'x-isles': '1', 'x-invite': invite(), ...(opts.body && !(opts.body instanceof Blob) ? { 'content-type': 'application/json' } : {}), ...(opts.headers ?? {}) } });
    const v = await r.json().catch(() => null);
    if (!r.ok) throw { code: r.status === 429 ? (v?.error === 'daily_limit' ? 'daily_limit' : 'rate_limited') : r.status === 403 ? 'denied' : 'unavailable', message: v?.error ?? String(r.status) };
    return v;
  };
  const enc = encodeURIComponent;
  const docRef = (col, id) => ({ id,
    get: async () => { const d = await call(`doc/${enc(col)}/${enc(id)}`); return { exists: d !== null, data: () => d }; },
    set: (data) => call(`doc/${enc(col)}/${enc(id)}`, { method: 'PUT', body: JSON.stringify(data) }),
    /** opts.keepalive: the write outlives the page (leaving it), up to the browser's 64 KB */
    update: (data, opts = {}) => call(`doc/${enc(col)}/${enc(id)}`, { method: 'PATCH', body: JSON.stringify(data), keepalive: !!opts.keepalive }),
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
  // who I am, asked as soon as the page starts (the game's modules are still loading), and asked again a few times:
  // the game cannot start without it, so a single failed request must not leave an empty sea
  const retry = async (f, n = 4) => { for (let i = 0; ; i++) { try { return await f(); } catch (e) { if (i >= n - 1 || e?.code === 'denied') throw e; await new Promise(r => setTimeout(r, 600 * 2 ** i)); } } };
  const offline = () => { if (document.getElementById('offline')) return; const d = document.createElement('div'); d.id = 'offline'; d.className = 'offline';
    d.innerHTML = '<b>연결이 끊겼어요</b><button>다시</button>'; d.querySelector('button').onclick = () => location.reload(); document.body.append(d); };
  let meP = null; const me = () => (meP ??= retry(() => call('me?board=' + enc(board))).catch(e => { meP = null; offline(); throw e; }));
  me().catch(() => {});
  /** Fetch with a deadline that restarts with every piece that arrives: a stream that stops is ended, not waited on forever. */
  const IDLE_MS = 45000;
  const NS = {
    db: { collection, doc: (p) => { const i = p.lastIndexOf('/'); return docRef(p.slice(0, i), p.slice(i + 1)); } },
    user: { id: async () => (await me()).uid, isOwner: async () => (await me()).owner, profiles: (ids) => call('profiles?ids=' + ids.map(enc).join(',')) },
    sample: async (input, opts = {}) => {
      const prompt = typeof input === 'string' ? input : input.map(m => m.content).join('\n\n');
      const ctl = new AbortController(); opts.signal?.addEventListener('abort', () => ctl.abort());
      // the first words may wait for a place in the server's line (90 s); after that, 45 s of silence ends it
      let idle; const wake = (ms = IDLE_MS) => { clearTimeout(idle); idle = setTimeout(() => ctl.abort(), ms); }; wake(90000);
      try {
        const r = await fetch('/api/sample', { method: 'POST', headers: { 'x-isles': '1', 'content-type': 'application/json' }, body: JSON.stringify({ prompt, kind: opts.purpose ?? 'build' }), signal: ctl.signal });
        if (!r.ok) { const v = await r.json().catch(() => null); throw { code: r.status === 429 ? (v?.error === 'rate_limited' ? 'rate_limited' : 'daily_limit') : r.status === 503 ? 'rate_limited' : 'unavailable', message: v?.error }; }
        const rd = r.body.getReader(), dec = new TextDecoder(); let text = '';
        for (;;) { const { value, done } = await rd.read(); if (done) break; wake(); const delta = dec.decode(value, { stream: true }); text += delta; opts.onText && opts.onText({ text, delta }); }
        return { text, truncated: false };
      } catch (e) { if (ctl.signal.aborted && !opts.signal?.aborted) throw { code: 'timeout', message: 'no answer' }; throw e; }
      finally { clearTimeout(idle); }
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
