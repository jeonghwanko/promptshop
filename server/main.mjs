#!/usr/bin/env node
// The hosted game (we.oddbout.com): serves isles.html and its modules, and gives the page what claude.ai's artifact
// runtime gave it before — storage, who is playing, and Claude — through src/site/runtime.js.
//   Players start anonymous: the first visit makes an account and a cookie. Docs live in SQLite (store.mjs), every
//   write is checked (rules.mjs), Claude calls are limited per player and per day (claude.mjs).
// Usage: node server/main.mjs   env: PORT (5310), DATA_DIR (server-data), SAMPLE (api|cli|echo), ANTHROPIC_API_KEY,
//        SITE_ORIGIN (https://we.oddbout.com, for link previews), SESSION_SECRET (else made once in DATA_DIR)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openStore } from './store.mjs';
import { allowWrite, readable } from './rules.mjs';
import { admit, left, stream } from './claude.mjs';
import { bad } from '../src/game/rules.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +(process.env.PORT ?? 5310), DATA = path.resolve(process.env.DATA_DIR ?? path.join(root, 'server-data'));
const ORIGIN = process.env.SITE_ORIGIN ?? 'https://we.oddbout.com';
fs.mkdirSync(path.join(DATA, 'og'), { recursive: true });
// the picture for links without a board (the showcase): the archipelago from the README until a better one is made
if (!fs.existsSync(path.join(DATA, 'og', 'default.png'))) fs.copyFileSync(path.join(root, 'docs/img/isles.png'), path.join(DATA, 'og', 'default.png'));
const store = openStore(path.join(DATA, 'isles.db'));
const SECRET = process.env.SESSION_SECRET ?? (() => { const f = path.join(DATA, 'secret'); if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(32).toString('hex'), { mode: 0o600 }); return fs.readFileSync(f, 'utf8').trim(); })();
const sign = (s) => crypto.createHmac('sha256', SECRET).update(s).digest('base64url').slice(0, 32);

// ---------- players: anonymous at first, a cookie keeps them ----------
const ADJ = ['느긋한', '용감한', '졸린', '반짝이는', '수줍은', '씩씩한', '배고픈', '다정한', '엉뚱한', '부지런한', '신난', '조용한'];
const ANIMAL = ['수달', '갈매기', '거북이', '고래', '해달', '펭귄', '물개', '게', '문어', '돌고래', '복어', '불가사리'];
const pick = (a) => a[crypto.randomInt(a.length)];
function session(req, res) {
  const c = /(?:^|;\s*)sid=([\w-]+)\.([\w-]+)/.exec(req.headers.cookie ?? '');
  if (c && sign(c[1]) === c[2] && store.sql.prepare(`SELECT 1 FROM users WHERE uid = ?`).get(c[1])) return c[1];
  const uid = crypto.randomBytes(12).toString('base64url').replace(/[-_]/g, 'x');
  store.sql.prepare(`INSERT INTO users (uid, name, at) VALUES (?, ?, ?)`).run(uid, `${pick(ADJ)} ${pick(ANIMAL)}`, Date.now());
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  res.setHeader('set-cookie', `sid=${uid}.${sign(uid)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${400 * 86400}${secure}`);
  return uid;
}
const nameOf = (uid) => store.sql.prepare(`SELECT name FROM users WHERE uid = ?`).get(uid)?.name ?? null;

// ---------- invites: a token for one board, 14 days, 9 friends ----------
const INVITE_DAYS = 14, INVITE_USES = +(process.env.INVITE_USES ?? 9);
function makeInvite(board, uid) {
  const token = crypto.randomBytes(9).toString('base64url');
  store.sql.prepare(`INSERT INTO invites (token, board, uid, exp, uses) VALUES (?, ?, ?, ?, 0)`).run(token, board, uid, Date.now() + INVITE_DAYS * 86400e3);
  return token;
}
const inviteRow = (token, board) => token && store.sql.prepare(`SELECT * FROM invites WHERE token = ? AND board = ?`).get(token, board);
const inviteOk = (token, board) => { const r = inviteRow(token, board); return !!r && r.exp > Date.now() && r.uses < INVITE_USES; };

// ---------- small helpers ----------
const json = (res, v, status = 200) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(v)); };
const body = (req, max = 600 * 1024) => new Promise((ok, no) => { const parts = []; let n = 0; req.on('data', c => { n += c.length; if (n > max) { no(new Error('too big')); req.destroy(); } else parts.push(c); }); req.on('end', () => ok(Buffer.concat(parts))); });
const isMember = (board, uid) => !!store.get(board === 'main' ? 'i' : 'i-' + board, uid) || store.get('boards', board)?.owner === uid;
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const writes = new Map();   // uid → [times] in the last minute
const tooFast = (uid) => { const t = Date.now(), a = (writes.get(uid) ?? []).filter(x => x > t - 60e3); a.push(t); writes.set(uid, a); return a.length > 150; };

// changes wake the long polls that wait on that collection
const waiting = new Map();
store.onChange((col) => { const w = waiting.get(col); if (!w) return; waiting.delete(col); for (const fn of w) fn(); });
const waitFor = (col, ms) => new Promise(ok => { const w = waiting.get(col) ?? new Set(); waiting.set(col, w); const done = () => { clearTimeout(t); w.delete(done); ok(); }; const t = setTimeout(done, ms); w.add(done); });

// ---------- the page: link previews for invites ----------
function page(url) {
  let h = fs.readFileSync(path.join(root, 'isles.html'), 'utf8');
  const board = url.searchParams.get('board'), meta = board && /^[a-z0-9]{3,24}$/.test(board) ? store.get('boards', board) : null;
  const taken = meta ? Object.keys(store.all('i-' + board)).filter(k => !k.startsWith('_')).length : 0;
  const title = meta ? `${meta.name} · 빈 섬 ${10 - taken}개` : '한 줄 군도';
  const img = meta && fs.existsSync(path.join(DATA, 'og', board + '.png')) ? `${ORIGIN}/og/${board}.png` : `${ORIGIN}/og/default.png`;
  const tags = `<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="한 줄을 쓰면 Claude가 가게를 지어요. 옆 섬에 살면서 다리를 놓아요."><meta property="og:image" content="${esc(img)}"><meta property="og:url" content="${esc(ORIGIN + url.pathname + url.search)}"><meta name="twitter:card" content="summary_large_image">`;
  return h.replace('<meta charset="utf-8">', `<meta charset="utf-8">${tags}<script src="/src/site/runtime.js"></script>`);
}
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
const PUBLIC = [/^\/src\/.+\.(js|css|png|webp|json)$/, /^\/examples\/isles-seed\.js$/];

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'), p = url.pathname;
  try {
    if (p === '/' || p === '/isles.html') { session(req, res); res.writeHead(200, { 'content-type': TYPES['.html'], 'cache-control': 'no-cache' }); return res.end(page(url)); }
    if (p.startsWith('/og/')) {
      const f = path.join(DATA, 'og', path.basename(p)); if (!/^\/og\/[a-z0-9]{3,24}\.png$/.test(p) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=300' }); return fs.createReadStream(f).pipe(res);
    }
    if (PUBLIC.some(r => r.test(p))) {
      const f = path.join(root, p); if (!f.startsWith(root + path.sep) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': TYPES[path.extname(f)] ?? 'application/octet-stream', 'cache-control': 'no-cache' }); return fs.createReadStream(f).pipe(res);
    }
    if (!p.startsWith('/api/')) { res.writeHead(404); return res.end('not found'); }

    const uid = session(req, res);
    if (req.method !== 'GET' && req.headers['x-isles'] !== '1') return json(res, { error: 'bad request' }, 400);   // only the page's own calls (a header a form cannot send)
    if (p === '/api/me') { const board = url.searchParams.get('board') ?? 'main'; return json(res, { uid, name: nameOf(uid), left: left(store, uid), owner: store.get('boards', board)?.owner === uid }); }
    if (p === '/api/profiles') { const ids = (url.searchParams.get('ids') ?? '').split(',').filter(Boolean).slice(0, 50); return json(res, Object.fromEntries(ids.map(i => [i, { name: nameOf(i) ?? '친구' }]))); }
    if (p === '/api/name' && req.method === 'POST') {
      const name = String(JSON.parse(await body(req, 2000)).name ?? '').trim().slice(0, 12);
      if (!name || bad(name)) return json(res, { error: 'bad name' }, 400);
      store.sql.prepare(`UPDATE users SET name = ? WHERE uid = ?`).run(name, uid); return json(res, { name });
    }
    if (p.startsWith('/api/col/')) {   // what changed in a collection after ?after=n; with ?wait=1 it waits up to 25 s for a change
      const col = decodeURIComponent(p.slice(9)), after = +(url.searchParams.get('after') ?? 0);
      if (!readable(col)) return json(res, { error: 'not readable' }, 403);
      let out = store.since(col, after);
      if (!out.docs.length && url.searchParams.get('wait')) { await waitFor(col, 25000); out = store.since(col, after); }
      return json(res, out);
    }
    if (p.startsWith('/api/doc/')) {
      const [col, id] = p.slice(9).split('/').map(decodeURIComponent); if (!col || !id) return json(res, { error: 'bad path' }, 400);
      if (req.method === 'GET') return readable(col) ? json(res, store.get(col, id)) : json(res, { error: 'not readable' }, 403);
      if (tooFast(uid)) return json(res, { error: 'too many writes' }, 429);
      const op = req.method === 'PUT' ? 'set' : req.method === 'PATCH' ? 'update' : req.method === 'DELETE' ? 'delete' : null; if (!op) return json(res, { error: 'bad method' }, 405);
      const data = op === 'delete' ? null : JSON.parse((await body(req)).toString() || 'null');
      if (op !== 'delete' && (typeof data !== 'object' || data === null || Array.isArray(data))) return json(res, { error: 'bad data' }, 400);
      const token = req.headers['x-invite'];
      const why = allowWrite(op, col, id, data, { store, uid, invite: (b) => inviteOk(token, b), useInvite: (b) => store.sql.prepare(`UPDATE invites SET uses = uses + 1 WHERE token = ? AND board = ?`).run(token, b) });
      if (why) return json(res, { error: why }, 403);
      if (op === 'set') store.set(col, id, data); else if (op === 'update') store.update(col, id, data); else store.remove(col, id);
      return json(res, store.get(col, id));
    }
    if (p === '/api/invite' && req.method === 'POST') {
      const { board } = JSON.parse(await body(req, 2000)); if (!board || board === 'main' || !isMember(board, uid)) return json(res, { error: 'not a member' }, 403);
      return json(res, { token: makeInvite(board, uid), days: INVITE_DAYS, uses: INVITE_USES });
    }
    if (p.startsWith('/api/thumb/') && req.method === 'POST') {   // the archipelago's picture for link previews, from a member's page
      const board = p.slice(11); if (!/^[a-z0-9]{3,24}$/.test(board) || !isMember(board, uid)) return json(res, { error: 'not a member' }, 403);
      const png = await body(req, 400 * 1024); if (png.subarray(1, 4).toString() !== 'PNG') return json(res, { error: 'not a png' }, 400);
      fs.writeFileSync(path.join(DATA, 'og', board + '.png'), png); return json(res, { ok: true });
    }
    if (p === '/api/sample' && req.method === 'POST') {
      const { prompt, kind } = JSON.parse((await body(req, 200 * 1024)).toString());
      const no = admit(store, uid, kind); if (no) return json(res, { error: no.code }, no.status);
      return stream(prompt, res, req);
    }
    return json(res, { error: 'not found' }, 404);
  } catch (e) { console.error(e); if (!res.headersSent) json(res, { error: 'server' }, 500); else res.end(); }
}).listen(PORT, '127.0.0.1', () => console.log(`we.oddbout.com server on http://127.0.0.1:${PORT} (data ${DATA}, Claude ${process.env.SAMPLE ?? 'api'})`));
