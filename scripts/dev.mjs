#!/usr/bin/env node
// Dev server: serves the repo, and stands in for claude.ai's page runtime so pages run outside an artifact.
//   - window.claude.use('db')     → a JSON file (dev-data/db.json), shared by every browser that opens this server
//   - window.claude.use('user')   → a name from ?me=… (default "dev-me")
//   - window.claude.use('sample') → the local `claude` CLI in print mode, streamed back as text
// Usage: node scripts/dev.mjs [port]   then open http://<host>:<port>/isles.html
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { brandPage } from '../src/brand.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = +(process.argv[2] ?? 5300);
const dataDir = path.join(root, 'dev-data'), dbFile = path.join(dataDir, 'db.json');
fs.mkdirSync(dataDir, { recursive: true });
let db = fs.existsSync(dbFile) ? JSON.parse(fs.readFileSync(dbFile, 'utf8')) : {};
const saveDb = () => fs.writeFileSync(dbFile, JSON.stringify(db, null, 1));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.css': 'text/css', '.md': 'text/markdown; charset=utf-8' };

const SHIM = `<script>
if (!window.claude) (function () {
  const q = new URLSearchParams(location.search), me = q.get('me') || localStorage.getItem('dev-me') || 'dev-me';
  try { localStorage.setItem('dev-me', me); } catch {}
  const api = (p, o) => fetch('/api/' + p, o).then(r => r.json());
  const docRef = (col, id) => ({ id,
    get: async () => { const d = await api('db/' + col + '/' + id); return { exists: d !== null, data: () => d }; },
    set: async (data) => { await api('db/' + col + '/' + id, { method: 'PUT', body: JSON.stringify(data) }); bump(); },
    update: async (data) => { await api('db/' + col + '/' + id, { method: 'PATCH', body: JSON.stringify(data) }); bump(); },
    delete: async () => { await api('db/' + col + '/' + id, { method: 'DELETE' }); bump(); } });
  const subs = new Set();
  const bump = () => subs.forEach(s => s.poll());
  const collection = (col) => ({
    doc: (id) => docRef(col, id),
    get: async () => { const all = await api('db/' + col); return { docs: Object.entries(all).map(([id, d]) => ({ id, data: () => d })) }; },
    onSnapshot(fn, err) {
      let last = '', on = true;
      const s = { poll: async () => { try { const all = await api('db/' + col), k = JSON.stringify(all); if (k !== last && on) { last = k; fn({ docs: Object.entries(all).map(([id, d]) => ({ id, data: () => d })) }); } } catch (e) { err && err(e); } } };
      subs.add(s); s.poll(); const t = setInterval(s.poll, 2000);
      return () => { on = false; clearInterval(t); subs.delete(s); };
    } });
  const NS = {
    db: { collection, doc: (p) => { const i = p.lastIndexOf('/'); return docRef(p.slice(0, i), p.slice(i + 1)); } },
    user: { id: async () => me, isOwner: async () => me === 'dev-me', profiles: async (ids) => Object.fromEntries(ids.map(i => [i, { name: i }])) },
    sample: async (input, opts = {}) => {
      const prompt = typeof input === 'string' ? input : input.map(m => m.content).join('\\n\\n');
      const r = await fetch('/api/sample', { method: 'POST', body: JSON.stringify({ prompt }), signal: opts.signal });
      if (!r.ok) throw { code: 'unavailable', message: await r.text() };
      const rd = r.body.getReader(), dec = new TextDecoder(); let text = '';
      for (;;) { const { value, done } = await rd.read(); if (done) break; const delta = dec.decode(value, { stream: true }); text += delta; opts.onText && opts.onText({ text, delta }); }
      return { text, truncated: false };
    },
  };
  window.claude = { use: async (name) => NS[name] ?? null };
})();
</script>`;

function body(req) { return new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => r(b)); }); }

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/db/')) {
      const [col, id] = url.pathname.slice(8).split('/').map(decodeURIComponent);
      db[col] ??= {};
      if (!id) { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(db[col])); }
      if (req.method === 'PUT') { db[col][id] = JSON.parse(await body(req)); saveDb(); }
      else if (req.method === 'PATCH') { db[col][id] = { ...(db[col][id] ?? {}), ...JSON.parse(await body(req)) }; saveDb(); }
      else if (req.method === 'DELETE') { delete db[col][id]; saveDb(); }
      res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(db[col][id] ?? null));
    }
    if (url.pathname === '/api/sample' && req.method === 'POST') {
      const { prompt } = JSON.parse(await body(req));
      const cli = spawn('claude', ['-p', '--model', 'haiku', '--output-format', 'stream-json', '--include-partial-messages', '--verbose', '--tools', '', '--no-session-persistence',
        '--system-prompt', 'You write building specs for a game. Follow the instructions in the message exactly and output only what they ask for.'], { stdio: ['pipe', 'pipe', 'pipe'], cwd: os.tmpdir() });
      cli.stdin.end(prompt);
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      let buf = '', err = '';
      cli.stdout.on('data', (c) => {
        buf += c; let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i); buf = buf.slice(i + 1);
          try { const m = JSON.parse(line), d = m.type === 'stream_event' && m.event?.type === 'content_block_delta' && m.event.delta?.text; if (d) res.write(d); } catch {}
        }
      });
      cli.stderr.on('data', (c) => err += c);
      cli.on('close', (code) => { if (code) console.error('claude exited', code, err.slice(0, 400)); res.end(); });
      req.on('close', () => { if (!res.writableEnded) cli.kill(); });
      return;
    }
    let file = path.join(root, decodeURIComponent(url.pathname));
    if (!file.startsWith(root)) { res.statusCode = 403; return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.statusCode = 404; return res.end('not found'); }
    const ext = path.extname(file);
    res.setHeader('content-type', TYPES[ext] ?? 'application/octet-stream'); res.setHeader('cache-control', 'no-store');
    if (ext === '.html') { const h = brandPage(fs.readFileSync(file, 'utf8')), at = h.indexOf('<meta charset="utf-8">'); return res.end(at >= 0 ? h.slice(0, at + 22) + SHIM + h.slice(at + 22) : SHIM + h); }
    fs.createReadStream(file).pipe(res);
  } catch (e) { res.statusCode = 500; res.end(String(e)); }
}).listen(port, '0.0.0.0', () => console.log(`promptshop dev server on http://0.0.0.0:${port}`));
