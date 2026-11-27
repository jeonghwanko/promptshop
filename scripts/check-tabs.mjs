// Several tabs on one island (src/game/lease.js): the newest plays, the older hands over what it did and watches.
// Copies the dev island to a throwaway board, drives tabs in headless Chrome, prints PASS/FAIL, deletes the copy.
// Usage: node scripts/check-tabs.mjs   (with node scripts/dev.mjs 5300 running; needs google-chrome)
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs'; import { tmpdir } from 'node:os';
const dir = fs.mkdtempSync(tmpdir() + '/isles-tabs-'), BOARD = 'qatab', ME = 'qa-t', DOC = `i-${BOARD}/${ME}`;
const api = (m, path, file) => execSync(`curl -s -X ${m} localhost:5300/api/db/${path}${file ? ` --data-binary @${file}` : ''}`).toString();
const stored = () => JSON.parse(execSync(`curl -s localhost:5300/api/db/${DOC}`).toString());
execSync(`curl -s localhost:5300/api/db/i/dev-me -o ${dir}/d.json`);
const d = JSON.parse(fs.readFileSync(`${dir}/d.json`)); d.wallet.tut = 99; d.wallet.tutIn = 99; d.wallet.autoInvest = false; d.rev = 1; delete d.term; delete d.by; delete d.ack;
fs.writeFileSync(`${dir}/d.json`, JSON.stringify(d)); api('DELETE', DOC); api('DELETE', `i-${BOARD}/_mod`); api('PUT', DOC, `${dir}/d.json`);

const port = 9380, chrome = spawn('google-chrome', ['--headless=new', '--password-store=basic', '--no-sandbox', '--use-angle=swiftshader', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}/chrome`, '--window-size=1200,800', 'about:blank'], { stdio: 'ignore' });
process.on('exit', () => { try { chrome.kill(); } catch {} });
await new Promise(r => setTimeout(r, 1500));
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), errs = [];
const url = `http://127.0.0.1:5300/isles.html?board=${BOARD}&me=${ME}`;
async function tab() {
  const t = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl); let id = 0; const wait = new Map();
  ws.onmessage = (m) => { const x = JSON.parse(m.data); if (x.id && wait.has(x.id)) { wait.get(x.id)(x.result); wait.delete(x.id); } if (x.method === 'Runtime.exceptionThrown') errs.push(x.params.exceptionDetails.exception?.description?.split('\n')[0]); };
  await new Promise(r => ws.onopen = r);
  const send = (method, params = {}) => new Promise(r => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.navigate', { url });   // a new tab does not always open the address it was given
  const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true }); return r.result.value ?? r.result.description; };
  const shot = async (file) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(file, Buffer.from(r.data, 'base64')); };
  return { ev, shot, close: () => fetch(`http://127.0.0.1:${port}/json/close/${t.id}`) };
}
const role = (t) => t.ev(`window.__isles?.S?.role ?? 'loading'`);
async function until(t, want, ms = 20000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await role(t) === want) return true; await sleep(300); } return false; }
const check = (name, ok, info = '') => { console.log(ok ? 'PASS' : 'FAIL', name, info); if (!ok) process.exitCode = 1; };

const fast = async (t, ms) => { const t0 = Date.now(); const ok = await until(t, 'live', ms); return [ok, ((Date.now() - t0) / 1000).toFixed(1) + ' s'] };
// 1. a reload: the last holder let go or stopped saving long ago → play at once, no waiting
{ const x = stored(); x.by = 'gone'; x.hb = Date.now() - 60000; fs.writeFileSync(`${dir}/d.json`, JSON.stringify(x)); api('PUT', DOC, `${dir}/d.json`); }
const A = await tab(); await until(A, 'loading', 1); { const [ok, t] = await fast(A, 4000 + 9000); check('stale holder: plays at once', ok && parseFloat(t) < 12, t); }
// 2. A changes things it has not saved; B opens: B waits for A's answer, A hands everything over and only watches
await sleep(2500);
await A.ev(`(()=>{ const w = __isles.myDoc.wallet; w.coins += 1234; w.markA = 1; const k = Object.keys(__isles.myDoc.plots)[0]; __isles.myDoc.plots[k].stock = 77; __isles.S.dirty = true; })()`);
const coinsA = await A.ev(`__isles.myDoc.wallet.coins`), writerA = await A.ev(`__isles.writer`);
const B = await tab(); await until(B, 'settle', 15000); const tB = Date.now(); const [bLive] = await fast(B, 8000), waited = (Date.now() - tB) / 1000;
if (process.env.SHOT) await A.shot(process.env.SHOT);
const s0 = stored();
check('second tab plays after the answer', bLive && s0.ack === s0.term && waited < 4.5, `${waited.toFixed(1)} s, ack ${s0.ack} term ${s0.term}`);
check('first tab watches', await role(A) === 'idle' && await A.ev(`!!document.querySelector('.handoff')`));
check('unsaved changes handed over', (await B.ev(`__isles.myDoc.wallet.markA`)) === 1 && (await B.ev(`__isles.myDoc.wallet.coins`)) >= coinsA && (await B.ev(`Object.values(__isles.myDoc.plots)[0].stock`)) >= 70, `${coinsA} → ${await B.ev(`__isles.myDoc.wallet.coins`)}`);
// 3. the watcher writes nothing and earns nothing, and follows what the player saves
const writerB = await B.ev(`__isles.writer`);
await B.ev(`__isles.myDoc.wallet.markB = 1; __isles.S.dirty = true`); await A.ev(`__isles.myDoc.wallet.markW = 1; __isles.S.dirty = true`); await sleep(8000);
const s1 = stored();
check('only the player writes', s1.wb === writerB && s1.wallet.markW === undefined, `wb ${s1.wb === writerB ? 'B' : s1.wb === writerA ? 'A' : s1.wb}`);
check('watcher follows', (await A.ev(`__isles.myDoc.wallet.markB`)) === 1 && s1.wallet.markA === 1);
// 4. a tab that woke up and saved an old copy before it saw the new claim: the player puts its own back
{ const old = { wallet: { ...s1.wallet, coins: 1 }, wb: 'sleeper', hb: Date.now(), rev: 1 }; fs.writeFileSync(`${dir}/old.json`, JSON.stringify(old)); api('PATCH', DOC, `${dir}/old.json`); }
await sleep(6000); { const s2 = stored(); check('old copy written over by the player', s2.wb === writerB && s2.wallet.coins > 1, `${s2.wallet.coins}`); }
// 5. the player closes its tab (it lets go as it leaves): the next tab plays at once
await B.close(); await sleep(1500);
const C = await tab(); { const [ok, t] = await fast(C, 13000); check('after a closed tab: plays at once', ok && parseFloat(t) < 12, t); }
check('old watcher stays a watcher', await role(A) === 'idle');
// 6. a shop opened while waiting for the holder's answer becomes mine to run once this tab plays
const key0 = Object.keys(stored().plots)[0];
const F = await tab(); await until(F, 'settle', 15000); await F.ev(`__isles.openShop('${key0}')`); await until(F, 'live', 8000); await sleep(2500);
check('shop opened while waiting runs as mine', (await F.ev(`!!__isles.watching?.mine`)) && (await F.ev(`document.querySelectorAll('#shopacts .act').length`)) >= 2);
// 7. two tabs at once: exactly one plays
await F.close(); await C.close(); await A.close(); await sleep(1500);
const [D, E] = await Promise.all([tab(), tab()]); await sleep(16000);
const roles = [await role(D), await role(E)]; check('two at once: one plays', roles.filter(r => r === 'live').length === 1, roles.join(' '));
const P = roles[0] === 'live' ? D : E;
// 8. the board owner removes one of my buildings (marked by the building's time): my playing tab applies it for good
const [key, plot] = Object.entries(stored().plots)[0];
fs.writeFileSync(`${dir}/mod.json`, JSON.stringify({ [String(plot.b.at)]: key })); api('PUT', `i-${BOARD}/_mod`, `${dir}/mod.json`);
await sleep(5000); await P.ev(`__isles.S.dirty = true`); await sleep(7000);
check('removal sticks', !(key in stored().plots) && !(await P.ev(`'${key}' in __isles.myDoc.plots`)));
check('no errors', errs.length === 0, errs.slice(0, 3).join(' || '));
chrome.kill(); await sleep(500); api('DELETE', DOC); api('DELETE', `i-${BOARD}/_mod`); api('DELETE', `log/${BOARD}~${ME}`); fs.rmSync(dir, { recursive: true, force: true });
