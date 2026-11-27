// The hosted server's rules, without a browser: anonymous players, the showcase, private boards and invite tokens,
// who may write what, daily Claude calls, link previews, and changes arriving by long poll. Starts its own server on a
// throwaway data folder with Claude answers faked (SAMPLE=echo). Usage: node scripts/check-site.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import http from 'node:http'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-check-')), PORT = 5391;
const srv = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(root, 'server/main.mjs')], { env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, SAMPLE: 'echo', CLAUDE_PER_USER: '5', CLAUDE_PER_IP: '8', INVITE_USES: '3' }, stdio: ['ignore', 'pipe', 'inherit'] });
process.on('exit', () => { try { srv.kill(); } catch {} fs.rmSync(dir, { recursive: true, force: true }); });
await new Promise(r => srv.stdout.once('data', r));
const base = `http://127.0.0.1:${PORT}`;
const check = (name, ok, info = '') => { console.log(ok ? 'PASS' : 'FAIL', name, info); if (!ok) process.exitCode = 1; };

/** A player: keeps the cookie the server gives it. */
function player() {
  let cookie = '';
  const go = async (p, { method = 'GET', body, headers = {} } = {}) => {
    if (!cookie && p !== '/') await go('/');   // like a browser: the page first (it hands out the cookie)
    const r = await fetch(base + p, { method, body, headers: { cookie, 'x-isles': '1', ...(body && typeof body === 'string' ? { 'content-type': 'application/json' } : {}), ...headers } });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const t = await r.text(); let v = t; try { v = JSON.parse(t); } catch {}
    return { status: r.status, v, text: t };
  };
  return { go, put: (p, d, h) => go('/api/doc/' + p, { method: 'PUT', body: JSON.stringify(d), headers: h }), patch: (p, d, h) => go('/api/doc/' + p, { method: 'PATCH', body: JSON.stringify(d), headers: h }) };
}
const island = (slot) => ({ slot, at: Date.now(), gap: 24, plots: {}, half: {}, wallet: { coins: 30, permits: 1 } });

// players start anonymous, with a name
const A = player(), B = player(), C = player(), D = player();
const meA = (await A.go('/api/me')).v; check('anonymous player', !!meA.uid && !!meA.name, meA.name);
const page = await A.go('/'); check('page loads the runtime', page.text.includes('/src/site/runtime.js') && page.text.includes('og:title'));
check('no repo files outside the game', (await A.go('/server/main.mjs')).status === 404 && (await A.go('/dev-data/db.json')).status === 404 && (await A.go('/.git/config')).status === 404);
// the showcase is read-only
check('showcase: nobody moves in', (await A.put('i/' + meA.uid, island(3))).status === 403);
// A makes an archipelago and moves in
const board = 'b' + Date.now().toString(36);
check('make a board', (await A.put('boards/' + board, { name: 'A의 군도', lat: 37, lng: 127, owner: meA.uid, at: Date.now(), n: 0, bld: 0, users: [] })).status === 200);
check('cannot make a board for someone else', (await B.put('boards/x' + board, { name: 'x', lat: 0, lng: 0, owner: meA.uid, at: 1 })).status === 403);
check('owner moves in', (await A.put(`i-${board}/${meA.uid}`, island(3))).status === 200);
// B has no invite: cannot move in; with A's token: can, next door, and only into a free island
const meB = (await B.go('/api/me')).v;
check('no invite: cannot move in', (await B.put(`i-${board}/${meB.uid}`, island(2))).status === 403);
check('a stranger gets no token', (await B.go('/api/invite', { method: 'POST', body: JSON.stringify({ board }) })).status === 403);
const tok = (await A.go('/api/invite', { method: 'POST', body: JSON.stringify({ board }) })).v.token; check('member gets a token', !!tok);
check('invite: island taken is refused', (await B.put(`i-${board}/${meB.uid}`, island(3), { 'x-invite': tok })).status === 403);
check('invite: moves in', (await B.put(`i-${board}/${meB.uid}`, island(2), { 'x-invite': tok })).status === 200);
check('a token for another board does nothing', (await C.put(`i-${board}x/${(await C.go('/api/me')).v.uid}`, island(4), { 'x-invite': tok })).status === 403);
// nobody writes someone else's island, or moves their own to another island
check("cannot write another player's island", (await B.patch(`i-${board}/${meA.uid}`, { wallet: { coins: 1e9 } })).status === 403);
check('cannot jump to another island', (await B.patch(`i-${board}/${meB.uid}`, { slot: 7 })).status === 403);
check('own island saves', (await B.patch(`i-${board}/${meB.uid}`, { wallet: { coins: 99 } })).status === 200);
// removal marks: only the board's owner
check('removal marks: not a member', (await B.put(`i-${board}/_mod`, { 1: 'x' })).status === 403);
check('removal marks: the owner', (await A.patch(`i-${board}/_mod`, { 1: 'x' })).status === 200);
// summaries: members may update n/bld/users, nothing else
check('summary by a member', (await B.patch('boards/' + board, { n: 2, bld: 0, users: [meA.uid, meB.uid] })).status === 200);
check('board name only by its owner', (await B.patch('boards/' + board, { name: 'mine now' })).status === 403);
// the funnel log: only my own
check('own log', (await B.patch(`log/${board}~${meB.uid}`, { '1_arrive': { s: 0 } })).status === 200);
check("not another's log", (await B.patch(`log/${board}~${meA.uid}`, { '1_arrive': { s: 0 } })).status === 403);
// docs cannot grow without end, carry unknown fields, or break the world map
const big = (n) => 'x'.repeat(n * 1024);
check('a save answers short', (await B.patch(`i-${board}/${meB.uid}`, { wallet: { coins: 99 } })).text === '{"ok":true}');
check('island: unknown field refused', (await B.patch(`i-${board}/${meB.uid}`, { evil: 1 })).status === 403);
check('island: size counts the merged doc', (await B.patch(`i-${board}/${meB.uid}`, { half: { a: big(100) } })).status === 200 && (await B.patch(`i-${board}/${meB.uid}`, { wallet: { a: big(40) } })).status === 403);
check('island: over the limit, a write that does not grow it still lands', (await B.patch(`i-${board}/${meB.uid}`, { hb: 1 })).status === 200);
await B.patch(`i-${board}/${meB.uid}`, { half: {} });
check('board: a summary that would break the map is refused', (await B.patch('boards/' + board, { users: 1 })).status === 403 && (await B.patch('boards/' + board, { n: 'x' })).status === 403);
check('board: bad name refused', (await A.put('boards/bad' + board.slice(1), { name: '시발', lat: 37, lng: 127, owner: meA.uid, at: 1, n: 0, bld: 0, users: [] })).status === 403);
check('board: bad place refused', (await A.put('boards/bad' + board.slice(1), { name: 'ok', lat: 999, lng: 127, owner: meA.uid, at: 1 })).status === 403);
check('board: a new board carries its summary', (await A.put('boards/ns' + board.slice(1), { name: 'ok', lat: 1, lng: 1, owner: meA.uid, at: 1 })).status === 403);
// a whole island number only (1.5 or "3" would slip past "island taken")
{ const Q = player(), q = (await Q.go('/api/me')).v.uid, qb = 'q' + board.slice(1);
  await Q.put('boards/' + qb, { name: 'Q', lat: 1, lng: 1, owner: q, at: 1, n: 0, bld: 0, users: [] });
  check('island number must be whole', (await Q.put(`i-${qb}/${q}`, { ...island(3), slot: 1.5 })).status === 403 && (await Q.put(`i-${qb}/${q}`, island(3))).status === 200); }
// boards nobody lives in do not count against their maker, but one address makes at most 10 a day (2 counted above: A's board and Q's; a refused one does not count)
{ const P = player(), u = (await P.go('/api/me')).v.uid; let made = 0; for (let i = 0; i < 9; i++) if ((await P.put(`boards/m${i}${board}`, { name: '군도', lat: 1, lng: 1, owner: u, at: 1, n: 0, bld: 0, users: [] })).status === 200) made++;
  check('boards a day per address', made === 8, `${made} made`); }
// the funnel log: exactly <board>~<me>, for a board that exists
{ const L = player(); let n = 0; for (let i = 0; i < 45; i++) { const P = player(), u = (await P.go('/api/me')).v.uid; if ((await P.patch(`log/${board}~${u}`, { a: 1 })).status === 200) n++; }
  check('new logs per address a day', n <= 40 && n >= 30, `${n} made`); }
check('log: any other name is refused', (await B.patch(`log/x1~${meB.uid}`, { a: 1 })).status === 403 && (await B.patch(`log/zzzzzz~${meB.uid}`, { a: 1 })).status === 403);
// island values the board's pages draw: a broken building would break the board for everyone
check('island: a broken building is refused', (await B.patch(`i-${board}/${meB.uid}`, { plots: { a: null } })).status === 403 && (await B.patch(`i-${board}/${meB.uid}`, { plots: { a: { x: 1, z: 1, size: 'S', b: { input: null } } } })).status === 403);
check('island: a building that draws is fine', (await B.patch(`i-${board}/${meB.uid}`, { plots: { a: { x: 1, z: 1, size: 'S', b: { input: { type: 'cafe' } } } } })).status === 200);
check('island: bad land and coins holder refused', (await B.patch(`i-${board}/${meB.uid}`, { land: 99 })).status === 403 && (await B.patch(`i-${board}/${meB.uid}`, { wallet: 5 })).status === 403);
await B.patch(`i-${board}/${meB.uid}`, { plots: {} });
// paths nginx and Node would read differently
{ const raw = (p) => new Promise(r => (http.get({ host: '127.0.0.1', port: PORT, path: p }, (x) => { x.resume(); r(x.statusCode); })).on('error', () => r(0)));   // fetch would tidy the path first
  check('odd paths refused', (await raw('/x\\..\\api/me')) === 400 && (await raw('//api/me')) === 400, `${await raw('/x\\..\\api/me')} ${await raw('//api/me')}`); }
// no cookie, no player row
{ const r = await fetch(base + '/api/me', { headers: { 'x-isles': '1' } }); check('a request without a cookie makes no player', (await r.json()).name === null); }
// a member's invite link stays the same while it has days and places left
{ const t1 = (await B.go('/api/invite', { method: 'POST', body: JSON.stringify({ board }) })).v.token, t2 = (await B.go('/api/invite', { method: 'POST', body: JSON.stringify({ board }) })).v.token; check('invite token reused', !!t1 && t1 === t2); }
check('a write without the page header is refused', (await fetch(base + `/api/doc/i-${board}/x`, { method: 'PUT', body: '{}' })).status === 400);
// the token lets in nine friends at most
let used = 1; for (let s = 4; s <= 10; s++) { const P = player(), u = (await P.go('/api/me')).v.uid; if ((await P.put(`i-${board}/${u}`, island(s), { 'x-invite': tok })).status === 200) used++; }
const P10 = player(), u10 = (await P10.go('/api/me')).v.uid;
check('a token lets in only so many (3 here)', used === 3, `${used} moved in`);
// changes arrive by long poll: a waiting request returns when someone saves
const v0 = (await C.go(`/api/col/i-${board}?after=0`)).v.ver;
const t0 = Date.now(), wait = C.go(`/api/col/i-${board}?after=${v0}&wait=1`);
await new Promise(r => setTimeout(r, 400)); await B.patch(`i-${board}/${meB.uid}`, { wallet: { coins: 100 } });
const got = (await wait).v; check('long poll wakes on a change', got.docs.length === 1 && got.docs[0].id === meB.uid && Date.now() - t0 < 3000, `${Date.now() - t0} ms`);
// Claude: five a day; the fix right after a build is free
const ask = (P, kind) => P.go('/api/sample', { method: 'POST', body: JSON.stringify({ prompt: 'x', kind }) });
let ok = 0; for (let i = 0; i < 5; i++) if ((await ask(D, 'build')).status === 200) ok++;
check('five builds a day', ok === 5); check('the sixth waits for tomorrow', (await ask(D, 'build')).status === 429);
check('the fix after a build is free', (await ask(D, 'revise')).status === 200);
check('a fix without a build is not', (await ask(player(), 'revise')).status === 429);
check('calls left', (await D.go('/api/me')).v.left === 0);
// accounts are free, so a day's calls are counted by address too (8 here; D used 5 of them)
{ const E = player(); let n = 0; for (let i = 0; i < 5; i++) if ((await ask(E, 'build')).status === 200) n++; check('calls per address', n === 3, `${n} more from the same address`); }
// link previews: the board's name and free islands
const pv = await C.go(`/?board=${board}`); check('link preview names the board', pv.text.includes('A의 군도 · 빈 섬'), (pv.text.match(/og:title" content="([^"]+)/) ?? [])[1]);
const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex');
check('thumb: members only', (await C.go('/api/thumb/' + board, { method: 'POST', body: png, headers: { 'content-type': 'image/png' } })).status === 403);
check('thumb: a member sends it', (await B.go('/api/thumb/' + board, { method: 'POST', body: png, headers: { 'content-type': 'image/png' } })).status === 200);
check('preview picture served', (await fetch(`${base}/og/${board}.png`)).status === 200 && (await C.go(`/?board=${board}`)).text.includes(`/og/${board}.png`));
srv.kill(); process.exit();
