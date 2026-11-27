#!/usr/bin/env node
// The hosted game (we.oddbout.com): serves isles.html and its modules, and gives the page what claude.ai's artifact
// runtime gave it before — storage, who is playing, and Claude — through src/site/runtime.js.
//   Players start anonymous: the first visit makes an account and a cookie. Docs live in SQLite (store.mjs), every
//   write is checked (rules.mjs), Claude calls are limited per player and per day (claude.mjs).
// Usage: node server/main.mjs   env: PORT (5310), HOST (127.0.0.1; 0.0.0.0 to reach a local test from another machine), DATA_DIR (server-data), SAMPLE (api|cli|echo), ANTHROPIC_API_KEY,
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
// the picture for links without a board (or a board with no picture yet) ships with the release
const OG_DEFAULT = path.join(root, 'docs/img/og.png');
const store = openStore(path.join(DATA, 'isles.db'));
const SECRET = process.env.SESSION_SECRET ?? (() => { const f = path.join(DATA, 'secret'); if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(32).toString('hex'), { mode: 0o600 }); return fs.readFileSync(f, 'utf8').trim(); })();
const sign = (s) => crypto.createHmac('sha256', SECRET).update(s).digest('base64url').slice(0, 32);

// ---------- players: anonymous at first, a cookie keeps them ----------
const ADJ = ['느긋한', '용감한', '졸린', '반짝이는', '수줍은', '씩씩한', '배고픈', '다정한', '엉뚱한', '부지런한', '신난', '조용한'];
const ANIMAL = ['수달', '갈매기', '거북이', '고래', '해달', '펭귄', '물개', '게', '문어', '돌고래', '복어', '불가사리'];
const pick = (a) => a[crypto.randomInt(a.length)];
// The page only hands out a signed cookie; the player's row is made on their first API call, so link-preview bots
// (which fetch the page and run nothing) leave no players behind. The cookie comes with the page, before any API call,
// so parallel first calls share one id.
function session(req, res, { make = true } = {}) {
  const c = /(?:^|;\s*)sid=([\w-]+)\.([\w-]+)/.exec(req.headers.cookie ?? '');
  const uid = c && sign(c[1]) === c[2] ? c[1] : crypto.randomBytes(12).toString('base64url').replace(/[-_]/g, 'x');
  // the row comes with the first API call that brings back the cookie the page was given (a request with no cookie makes nothing)
  if (make && c && uid === c[1]) store.sql.prepare(`INSERT OR IGNORE INTO users (uid, name, at) VALUES (?, ?, ?)`).run(uid, `${pick(ADJ)} ${pick(ANIMAL)}`, Date.now());
  if (c && uid === c[1]) return uid;
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  res.setHeader('set-cookie', `sid=${uid}.${sign(uid)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${400 * 86400}${secure}`);
  return uid;
}
const nameOf = (uid) => store.sql.prepare(`SELECT name FROM users WHERE uid = ?`).get(uid)?.name ?? null;

/** The visitor's address: nginx appends it last to X-Forwarded-For (anything before it came from the visitor and is not trusted). */
const ipOf = (req) => netOf((req.headers['x-forwarded-for'] ?? '').split(',').pop().trim() || req.socket.remoteAddress || '');
/** One IPv6 /64 is one household (its owner can pick any address in it): limits count it as one address. */
function netOf(ip) {
  if (ip.startsWith('::ffff:')) return ip.slice(7);
  if (!ip.includes(':')) return ip;
  const [head, tail = ''] = ip.split('::'), h = head ? head.split(':') : [], t = tail ? tail.split(':') : [];
  const full = [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
  return full.slice(0, 4).map(x => (x || '0').toLowerCase()).join(':') + '::/64';
}
// What one address may make in a (Korean) day — a fresh cookie is free, so per-player limits alone do not stop a flood —
// and what everyone together may make. Kept in SQLite, so a restart does not reset them.
const QUOTA = { board: { address: 10, all: 2000 }, log: { address: 40, all: 20000 } };
store.sql.exec(`CREATE TABLE IF NOT EXISTS quota (k TEXT PRIMARY KEY, n INTEGER NOT NULL)`);
const dayKST = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
/** Use one of `kind` for this address today; false when its day (or everyone's) is used up. */
function spendFor(ip, kind) {
  const q = QUOTA[kind], d = dayKST(), mine = `${kind}|${ip}|${d}`, all = `${kind}|*|${d}`, get = (k) => store.sql.prepare(`SELECT n FROM quota WHERE k = ?`).get(k)?.n ?? 0;
  if (get(mine) >= q.address || get(all) >= q.all) return false;
  const up = store.sql.prepare(`INSERT INTO quota (k, n) VALUES (?, 1) ON CONFLICT(k) DO UPDATE SET n = n + 1`); up.run(mine); up.run(all); return true;
}
setInterval(() => store.sql.prepare(`DELETE FROM quota WHERE k NOT LIKE ?`).run(`%|${dayKST()}`), 3600e3).unref();   // yesterday's counts
// Claude calls running per address: one at a time, so one visitor cannot hold every place in the CLI's line
const calling = new Map();

// ---------- invites: a token for one board, 14 days, 9 friends ----------
const INVITE_DAYS = 14, INVITE_USES = +(process.env.INVITE_USES ?? 9);
function makeInvite(board, uid) {
  const live = store.sql.prepare(`SELECT token FROM invites WHERE board = ? AND uid = ? AND exp > ? AND uses < ? ORDER BY exp DESC LIMIT 1`).get(board, uid, Date.now() + 86400e3, INVITE_USES);
  if (live) return live.token;   // the one I made earlier still has days and places left
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
setInterval(() => { const t = Date.now() - 60e3; for (const [k, a] of writes) if (a[a.length - 1] < t) writes.delete(k); }, 60e3).unref();   // forget players who stopped writing
const tooFast = (uid) => { const t = Date.now(), a = (writes.get(uid) ?? []).filter(x => x > t - 60e3); a.push(t); writes.set(uid, a); return a.length > 150; };

// changes wake the long polls that wait on that collection
const waiting = new Map();
store.onChange((col) => { const w = waiting.get(col); if (!w) return; waiting.delete(col); for (const fn of w) fn(); });
const waitFor = (col, ms) => new Promise(ok => { const w = waiting.get(col) ?? new Set(); waiting.set(col, w); const done = () => { clearTimeout(t); w.delete(done); if (!w.size && waiting.get(col) === w) waiting.delete(col); ok(); }; const t = setTimeout(done, ms); w.add(done); });

// ---------- the page: link previews for invites ----------
/** Every module the game imports at start (static imports, read once per release): listed in the page as modulepreload,
 *  so the browser fetches them together instead of one level of imports after another. */
function startModules() {
  const seen = new Set(), walk = (f) => { if (seen.has(f) || !fs.existsSync(f)) return; seen.add(f);
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/^(?:import|export)\b[^;]*?\bfrom\s*['"](\.[^'"]+)['"]/gm)) walk(path.resolve(path.dirname(f), m[1])); };
  walk(path.join(root, 'src/game/main.js'));
  return [...seen].map(f => '/' + path.relative(root, f).split(path.sep).join('/'));
}
let PRELOAD = null;
function page(url) {
  let h = fs.readFileSync(path.join(root, 'isles.html'), 'utf8');
  const board = url.searchParams.get('board'), meta = board && /^[a-z0-9]{3,24}$/.test(board) ? store.get('boards', board) : null;
  const taken = meta ? store.count('i-' + board) : 0;
  const title = meta ? `${meta.name} · 빈 섬 ${10 - taken}개` : '한 줄 군도';
  const img = meta && fs.existsSync(path.join(DATA, 'og', board + '.png')) ? `${ORIGIN}/og/${board}.png` : `${ORIGIN}/og/default.png`;
  const tags = `<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="한 줄을 쓰면 Claude가 가게를 지어요. 옆 섬에 살면서 다리를 놓아요."><meta property="og:image" content="${esc(img)}"><meta property="og:url" content="${esc(ORIGIN + url.pathname + url.search)}"><meta name="twitter:card" content="summary_large_image">`;
  if (BUNDLE) h = h.replace('src="src/game/main.js"', 'src="/dist/main.js"');
  PRELOAD ??= (BUNDLE ? ['/dist/main.js'] : startModules()).map(u => `<link rel="modulepreload" href="${u}">`).join('');
  h = h.replace('<script type="module"', PRELOAD + '<script type="module"');
  return h.replace('<meta charset="utf-8">', `<meta charset="utf-8">${tags}<script src="/src/site/runtime.js"></script>`);
}
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
const PUBLIC = [/^\/src\/.+\.(js|css|png|webp|json)$/, /^\/examples\/isles-seed\.js$/, /^\/dist\/[\w.-]+\.js$/];
// scripts/build-site.mjs bundles the game into dist/ (one minified file and a chunk for the world map); without it the page loads the modules as they are
const BUNDLE = fs.existsSync(path.join(root, 'dist', 'main.js'));
/** A file with an ETag, so a returning player's browser asks "changed?" and gets 304 instead of the whole file again. */
function serveFile(req, res, f, type) {
  const st = fs.statSync(f), tag = `"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
  const head = { 'content-type': type, 'cache-control': 'no-cache', etag: tag };
  // nginx's gzip turns the tag weak (W/"…") on the way out, so the browser sends it back that way
  if ((req.headers['if-none-match'] ?? '').split(',').some(t => t.trim().replace(/^W\//, '') === tag)) { res.writeHead(304, head); return res.end(); }
  res.writeHead(200, head); fs.createReadStream(f).pipe(res);
}

process.on('unhandledRejection', (e) => console.error('unhandled', e));
http.createServer(async (req, res) => {
  res.setTimeout(60e3, () => res.destroy());   // a reader that stops reading does not keep its answer in memory for ever
  let url, p;
  try {
    // nginx and Node must see the same path, or a request could reach /api/ past nginx's limits: no backslashes, no leading //
    if (req.url.includes('\\') || req.url.startsWith('//')) { res.writeHead(400); return res.end(); }
    url = new URL(req.url, 'http://x'); p = url.pathname;
    if (p === '/' || p === '/isles.html') { session(req, res, { make: false }); res.writeHead(200, { 'content-type': TYPES['.html'], 'cache-control': 'no-cache' }); return res.end(page(url)); }
    if (p.startsWith('/og/')) {
      const f = p === '/og/default.png' ? OG_DEFAULT : path.join(DATA, 'og', path.basename(p)); if (!/^\/og\/[a-z0-9]{3,24}\.png$/.test(p) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=300' }); return fs.createReadStream(f).pipe(res);
    }
    if (PUBLIC.some(r => r.test(p))) {
      const f = path.join(root, p); if (!f.startsWith(root + path.sep) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
      return serveFile(req, res, f, TYPES[path.extname(f)] ?? 'application/octet-stream');
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
      let out = store.sinceText(col, after);
      if (!out.n && url.searchParams.get('wait')) { await waitFor(col, 25000); out = store.sinceText(col, after); }
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); return res.end(out.text);
    }
    if (p.startsWith('/api/doc/')) {
      const [col, id] = p.slice(9).split('/').map(decodeURIComponent); if (!col || !id) return json(res, { error: 'bad path' }, 400);
      if (req.method === 'GET') return readable(col) ? json(res, store.get(col, id)) : json(res, { error: 'not readable' }, 403);
      if (tooFast(uid)) return json(res, { error: 'too many writes' }, 429);
      const op = req.method === 'PUT' ? 'set' : req.method === 'PATCH' ? 'update' : req.method === 'DELETE' ? 'delete' : null; if (!op) return json(res, { error: 'bad method' }, 405);
      const data = op === 'delete' ? null : JSON.parse((await body(req)).toString() || 'null');
      if (op !== 'delete' && (typeof data !== 'object' || data === null || Array.isArray(data))) return json(res, { error: 'bad data' }, 400);
      const token = req.headers['x-invite'];
      const why = allowWrite(op, col, id, data, { store, uid,
        boardsOf: (u) => store.sql.prepare(`SELECT COUNT(*) AS n FROM docs WHERE col = 'boards' AND json_extract(data, '$.owner') = ?`).get(u).n,
        spend: (kind) => spendFor(ipOf(req), kind),
        invite: (b) => inviteOk(token, b), useInvite: (b) => store.sql.prepare(`UPDATE invites SET uses = uses + 1 WHERE token = ? AND board = ?`).run(token, b) });
      if (why) return json(res, { error: why }, 403);
      if (op === 'set') store.set(col, id, data); else if (op === 'update') store.update(col, id, data); else store.remove(col, id);
      return json(res, { ok: true });   // the page has what it wrote; sending the whole doc back cost a parse and a copy per save
    }
    if (p === '/api/invite' && req.method === 'POST') {
      if (tooFast(uid)) return json(res, { error: 'too many writes' }, 429);
      const { board } = JSON.parse(await body(req, 2000)); if (!board || board === 'main' || !isMember(board, uid)) return json(res, { error: 'not a member' }, 403);
      return json(res, { token: makeInvite(board, uid), days: INVITE_DAYS, uses: INVITE_USES });
    }
    if (p.startsWith('/api/thumb/') && req.method === 'POST') {   // the archipelago's picture for link previews, from a member's page
      if (tooFast(uid)) return json(res, { error: 'too many writes' }, 429);
      const board = p.slice(11); if (!/^[a-z0-9]{3,24}$/.test(board) || !isMember(board, uid)) return json(res, { error: 'not a member' }, 403);
      const png = await body(req, 400 * 1024); if (png.subarray(1, 4).toString() !== 'PNG') return json(res, { error: 'not a png' }, 400);
      fs.writeFileSync(path.join(DATA, 'og', board + '.png'), png); return json(res, { ok: true });
    }
    if (p === '/api/sample' && req.method === 'POST') {
      const { prompt, kind } = JSON.parse((await body(req, 200 * 1024)).toString());
      const ip = ipOf(req); if (calling.get(ip)) return json(res, { error: 'rate_limited' }, 429);
      const call = admit(store, uid, kind, ip); if (call.no) return json(res, { error: call.no.code }, call.no.status);
      calling.set(ip, 1); res.on('close', () => calling.delete(ip));
      return await stream(prompt, res, req, call.refund);
    }
    return json(res, { error: 'not found' }, 404);
  } catch (e) { console.error(e); if (!res.headersSent) json(res, { error: 'server' }, 500); else res.end(); }
}).listen(PORT, process.env.HOST ?? '127.0.0.1', () => console.log(`we.oddbout.com server on http://${process.env.HOST ?? '127.0.0.1'}:${PORT} (data ${DATA}, Claude ${process.env.SAMPLE ?? 'api'})`));
