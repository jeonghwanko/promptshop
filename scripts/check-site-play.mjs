// The hosted game played in a browser, by two people with their own cookies: the showcase, making an archipelago,
// choosing an island, the guide's first loop with a real build, the invite link with its token, the friend moving in
// next door and building the free half bridge.
// Usage: node scripts/check-site-play.mjs [base url] [shots dir]
//   no base url: starts server/main.mjs on a throwaway data folder with Claude from the local CLI (SAMPLE=cli)
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-play-'));
let base = process.argv[2], srv = null; const shots = process.argv[3];
if (!base) {
  const PORT = 5392; base = `http://127.0.0.1:${PORT}`;
  srv = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(root, 'server/main.mjs')], { env: { ...process.env, PORT: String(PORT), DATA_DIR: path.join(dir, 'data'), SAMPLE: process.env.SAMPLE ?? 'cli' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => srv.stdout.once('data', r));
}
const port = 9393, chrome = spawn('google-chrome', ['--headless=new', '--password-store=basic', '--no-sandbox', '--use-angle=swiftshader', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}/chrome`, '--window-size=1400,900', 'about:blank'], { stdio: 'ignore' });
process.on('exit', () => { try { chrome.kill(); srv?.kill(); } catch {} try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });
await new Promise(r => setTimeout(r, 1500));
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), errs = [];
const check = (name, ok, info = '') => { console.log(ok ? 'PASS' : 'FAIL', name, info); if (!ok) process.exitCode = 1; };
const browser = new WebSocket((await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl);
await new Promise(r => browser.onopen = r); let bid = 0; const bwait = new Map();
browser.onmessage = (m) => { const x = JSON.parse(m.data); if (x.id && bwait.has(x.id)) { bwait.get(x.id)(x.result); bwait.delete(x.id); } };
const bsend = (method, params = {}) => new Promise(r => { const i = ++bid; bwait.set(i, r); browser.send(JSON.stringify({ id: i, method, params })); });
/** A person: their own browser context (their own cookie), one tab. */
async function person(url) {
  const { browserContextId } = await bsend('Target.createBrowserContext');
  const { targetId } = await bsend('Target.createTarget', { url: 'about:blank', browserContextId });
  const t = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(x => x.id === targetId);
  const ws = new WebSocket(t.webSocketDebuggerUrl); let id = 0; const wait = new Map();
  ws.onmessage = (m) => { const x = JSON.parse(m.data); if (x.id && wait.has(x.id)) { wait.get(x.id)(x.result); wait.delete(x.id); } if (x.method === 'Runtime.exceptionThrown') errs.push(x.params.exceptionDetails.exception?.description?.split('\n')[0]); };
  await new Promise(r => ws.onopen = r);
  const send = (method, params = {}) => new Promise(r => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false }); await send('Page.bringToFront'); await send('Page.navigate', { url });   // a tab in the back draws nothing
  const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true }); return r.result.value ?? r.result.description; };
  const click = async (x, y) => { for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }); };
  const shot = async (n) => { if (!shots) return; const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`${shots}/site_${n}.png`, Buffer.from(r.data, 'base64')); };
  const clickSel = async (sel) => { for (let i = 0; i < 30 && await ev(`!!document.querySelector(${JSON.stringify(sel)})?.closest('.wait')`); i++) await sleep(150);   // the guide's buttons show once its line is typed
    const b = JSON.parse(await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e||!e.offsetParent) return 'null'; const r=e.getBoundingClientRect(); return JSON.stringify([r.left+r.width/2, r.top+r.height/2])})()`)); if (b) await click(b[0], b[1]); return !!b; };
  const arrowNow = async () => JSON.parse(await ev(`(()=>{ const a = document.getElementById('garrow'); return JSON.stringify(a.hidden ? null : [parseFloat(a.style.left), parseFloat(a.style.top)]); })()`));
  const arrow = async () => { let a = await arrowNow(); for (let i = 0; i < 20; i++) { await sleep(300); const b = await arrowNow(); if (JSON.stringify(a) === JSON.stringify(b)) return b; a = b; } return a; };   // once the camera has settled
  const text = () => ev(`document.getElementById('guide').hidden ? '' : document.getElementById('gtext').textContent`);
  return { ev, click, shot, clickSel, arrow, text, front: () => send('Page.bringToFront'), go: (u) => send('Page.navigate', { url: u }) };
}
const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(500); } return false; };

// 1. a stranger: the showcase, and one button
const A = await person(base + '/'); await until(async () => (await A.text()).includes('구경'), 15000); await sleep(1500); await A.shot('1-showcase');
check('showcase: sample islands, a button to make my own', (await A.text()).includes('구경') && await A.ev(`!!document.querySelector('#gbtns .gold')`), await A.text());
await A.clickSel('#gbtns .gold');
check('my own archipelago', await until(async () => (await A.ev('location.search')).includes('board=b'), 8000), await A.ev('location.search'));
await sleep(5000); await A.shot('2-myboard');
// 2. choose the island the guide points at
const a1 = await A.arrow(); if (a1) await A.click(a1[0], a1[1] + 22); await sleep(800);
await A.ev(`[...document.querySelectorAll('#panel button.gold')].find(b => b.textContent.includes('이 섬에 살기'))?.click()`);
check('moved in', await until(() => A.ev('__isles.S.mySlot > 0 && __isles.S.role === "live"'), 8000), await A.ev('__isles.S.mySlot'));
// 3. the first loop with a real build
await A.clickSel('#gbtns .gold'); await sleep(600); await A.clickSel('#d-build'); await sleep(1000); await A.clickSel('#cards .rcard'); await sleep(1200);
const a2 = await A.arrow(); if (a2) await A.click(a2[0], a2[1] + 14); await sleep(1200); await A.clickSel('#signcard .chips button');
check('built by Claude', await until(() => A.ev('Object.values(__isles.myDoc.plots).some(p => p.b)'), 120000)); await A.shot('3-built');
check('one call used', (await A.ev(`fetch('/api/me', { headers: { 'x-isles': '1' } }).then(r => r.json()).then(v => v.left)`)) === 4);
await A.ev(`(()=>{ __isles.myDoc.wallet.tut = 8; __isles.S.dirty = true; __isles.guide(); })()`); await sleep(1500);
// 4. the invite: a link with a token, and the archipelago's picture for previews
const a3 = await A.arrow(); if (a3) await A.click(a3[0], a3[1] + 18); await sleep(800);
await A.ev(`navigator.clipboard.writeText = (t) => { window.__copied = t; return Promise.resolve(); }`);
await A.ev(`document.querySelector('#panel .invitecard button.gold')?.click()`);
check('invite link with a token', await until(() => A.ev('!!window.__copied'), 5000));
const link = await A.ev('window.__copied'); check('link has board, island, token', /board=b\w+/.test(link) && /from=\d/.test(link) && /k=[\w-]+/.test(link), link);
await sleep(1500); const board = /board=(\w+)/.exec(link)[1];
check('preview picture sent', (await fetch(`${base}/og/${board}.png`)).status === 200);
const html = await (await fetch(link.replace(/^https?:\/\/[^/]+/, base))).text();
check('link preview: board name and free islands', /og:title" content="[^"]+의 군도 · 빈 섬 9개/.test(html), (html.match(/og:title" content="([^"]+)/) ?? [])[1]);
// 5. the friend, in their own browser: lands next to A, moves in with the token, builds the free half
const B = await person(link.replace(/^https?:\/\/[^/]+/, base)); await sleep(6000); await B.shot('4-friend');
await until(async () => (await B.text()).includes('옆'), 15000); await sleep(1500);
check('friend: guide points next door', (await B.text()).includes('옆'), await B.text());
const b1 = await B.arrow(); if (b1) await B.click(b1[0], b1[1] + 22); await sleep(800);
await B.ev(`[...document.querySelectorAll('#panel button.gold')].find(b => b.textContent.includes('이 섬에 살기'))?.click()`);
check('friend moved in (token)', await until(() => B.ev('__isles.S.mySlot > 0'), 8000), await B.ev(`JSON.stringify({ b1: ${JSON.stringify(b1)}, panel: document.getElementById('panel').hidden ? '' : document.getElementById('panel').innerText, toast: document.getElementById('toast').textContent, at: (() => { const e = document.elementFromPoint(${b1?.[0] ?? 0}, ${(b1?.[1] ?? 0) + 22}); return e?.className || e?.tagName; })() })`));
await B.ev(`(()=>{ __isles.myDoc.wallet.tut = 99; __isles.guide(); document.getElementById('d-home').click(); })()`); await sleep(1000);
await B.ev(`[...document.querySelectorAll('#panel .card.tile button.gold')].find(b => b.textContent.includes('무료'))?.click()`); await sleep(1500);
check('friend: free half bridge', (await B.ev('Object.keys(__isles.myDoc?.half ?? {}).length')) === 1); await B.shot('5-friendhome');
// 6. A sees them
await A.front(); await sleep(4000); await A.shot('6-inviter');
check('inviter sees the friend', await A.ev(`__isles.S.owners.size === 2 && !!document.querySelector('#d-home .badge')`));
// 7. without the token, a third person is shown the way to an archipelago of their own, and cannot move in
const C = await person(base + `/?board=${board}`); await sleep(6000); await C.shot('7-stranger');
await until(async () => (await C.text()).includes('초대받은'), 25000);
check('no token: told to make their own', (await C.text()).includes('초대받은'), await C.text());
const free = await C.ev(`(() => { for (let s = 1; s <= 10; s++) if (!__isles.S.owners.has(s)) return s; })()`);
const st = await C.ev(`(async () => { const me = await (await fetch('/api/me', { headers: { 'x-isles': '1' } })).json(); const r = await fetch('/api/doc/i-${board}/' + me.uid, { method: 'PUT', headers: { 'x-isles': '1', 'content-type': 'application/json' }, body: JSON.stringify({ slot: ${free}, plots: {}, half: {}, wallet: {} }) }); return r.status + ' ' + (await r.text()); })()`);
check('no token: the server refuses', String(st).startsWith('403'), st);
check('no errors', errs.length === 0, errs.slice(0, 3).join(' || '));
process.exit();
