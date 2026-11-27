// Regression check for isles.html against the local dev server (node scripts/dev.mjs 5300).
// Copies the dev island (dev-me) to a throwaway board, drives the main paths in headless Chrome, prints PASS/FAIL lines,
// then deletes the copy. Usage: node scripts/check-isles.mjs   (needs google-chrome)
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs'; import { tmpdir } from 'node:os';
const S = mkdtempSync(tmpdir() + '/isles-check-');
execSync(`curl -s localhost:5300/api/db/i/dev-me -o ${S}/qa26.json`);
const put = (path, file) => execSync(`curl -s -X PUT localhost:5300/api/db/${path} --data-binary @${file}`);
const del = (path) => execSync(`curl -s -X DELETE localhost:5300/api/db/${path}`);
(await import('node:fs')).writeFileSync(S + '/rb.json', '{"name":"회귀","lat":-35,"lng":-58}');
const doc = JSON.parse((await import('node:fs')).readFileSync(S + '/qa26.json')); doc.wallet.tut = 4; doc.wallet.tutV = 3; delete doc.wallet.tutIn; doc.rev = 1; doc.wallet.ups = [8, 8];   // power and water to spare
(await import('node:fs')).writeFileSync(S + '/rd.json', JSON.stringify(doc));
del('i-qarg/qa-x'); put('boards/qarg', S + '/rb.json'); put('i-qarg/qa-x', S + '/rd.json');
const port = 9370, chrome = spawn('google-chrome', ['--headless=new', '--password-store=basic', '--no-sandbox', '--use-angle=swiftshader', `--remote-debugging-port=${port}`, `--user-data-dir=/tmp/cdp-rg-${Date.now()}`, '--window-size=1400,900', 'about:blank'], { stdio: 'ignore' });
process.on('exit', () => { try { chrome.kill(); } catch {} });   // never leave a browser saving to the copy
await new Promise(r => setTimeout(r, 1500));
const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl); let id = 0; const wait = new Map(); const errs = [];
const send = (method, params = {}) => new Promise(r => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d.result); wait.delete(d.id); }
  if (d.method === 'Runtime.exceptionThrown') errs.push((d.params.exceptionDetails.url ?? '') + ':' + d.params.exceptionDetails.lineNumber + ' ' + d.params.exceptionDetails.exception?.description?.split('\n').slice(0, 2).join('|'));
  if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errs.push('console: ' + JSON.stringify(d.params.args.map(a => a.value ?? a.description)).slice(0, 200)); };
await new Promise(r => ws.onopen = r); await send('Runtime.enable'); await send('Page.navigate', { url: 'http://127.0.0.1:5300/isles.html?board=qarg&me=qa-x' });
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true }); return r.result.value ?? r.result.description; }, sleep = (ms) => new Promise(r => setTimeout(r, ms));
const click = async (x, y) => { for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }); };
const shot = async (n) => { const r = await send('Page.captureScreenshot', { format: 'png' }); (await import('node:fs')).writeFileSync(`${S}/rg_${n}.png`, Buffer.from(r.data, 'base64')); };
const check = (name, ok, info = '') => console.log(ok ? 'PASS' : 'FAIL', name, info);
await sleep(9000); await shot('map');
check('loaded', await ev(`!!window.__isles && !!__isles.myDoc`));
check('hud', (await ev(`document.getElementById('wallet').textContent`)).length > 0, await ev(`document.getElementById('who').textContent`));
// tutorial step 7: tap the shop → inside guide
const a = JSON.parse(await ev(`JSON.stringify(__isles.S.guideAt ?? null)`));   // the middle of what the guide asks to press
check('guide arrow at shop', !!a);
if (a) for (const dy of [0, 12, -12]) { if (await ev(`!!__isles.watching`)) break; await click(a[0], a[1] + dy); await sleep(1500); }
check('shop opened by tap', await ev(`!!__isles.watching?.inPlace`), await ev(`__isles.watching?.key`));
check('inside guide', (await ev(`document.getElementById('gtext').textContent`)).includes('가게 안'));
await ev(`document.querySelector('#gbtns .gold')?.click()`); await sleep(500); await ev(`document.querySelector('#gbtns .gold')?.click()`); await sleep(500);
const acts = await ev(`document.querySelectorAll('#shopacts .act').length`); check('action buttons', acts >= 2, acts); await shot('shop');
const c0 = await ev(`__isles.myDoc.wallet.coins`); await ev(`document.querySelector('#shopacts .act.buy')?.click()`); await sleep(1200);
check('buy spends coins', (await ev(`__isles.myDoc.wallet.coins`)) < c0, `${c0} → ${await ev(`__isles.myDoc.wallet.coins`)}`);
check('shop head names the building', (await ev(`document.getElementById('shophead').hidden ? '' : document.getElementById('sname').textContent`)).length > 0, await ev(`document.getElementById('sname').textContent`));
await ev(`document.querySelector('#sback')?.click()`); await sleep(800); check('back closes the shop', !(await ev(`!!__isles.watching`)));
await ev(`document.querySelector('#gbtns .gold')?.click()`); await sleep(400);
// a two-floor shop: floors switch without resizing
await ev(`__isles.openShop('1_13_16')`); await sleep(1800);
const s0 = await ev(`shopstage.offsetWidth + 'x' + shopstage.offsetHeight`); await ev(`__isles.watching.view.setFloor(1)`); await sleep(400);
check('floor switch keeps size', s0 === await ev(`shopstage.offsetWidth + 'x' + shopstage.offsetHeight`), s0);
await ev(`__isles.close()`); await sleep(600);
// zoom buttons and wheel
const z0 = await ev(`__isles.zoom`); await ev(`document.getElementById('zout').click()`); await sleep(300); check('zoom out', (await ev(`__isles.zoom`)) < z0, `${z0} → ${await ev(`__isles.zoom`)}`);
await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 500, y: 400, deltaX: 0, deltaY: -120 }); await sleep(300); check('wheel zoom in', (await ev(`__isles.zoom`)) === z0);
// long press → move mode
await ev(`__isles.scrollToSlot(1)`); await sleep(900);
const pt = JSON.parse(await ev(`JSON.stringify(__isles.screenOf('1_18_13'))`));
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt[0], y: pt[1] }); await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt[0], y: pt[1], button: 'left', clickCount: 1 }); await sleep(800); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt[0], y: pt[1], button: 'left', clickCount: 1 }); await sleep(300);
check('long press moves', (await ev(`document.getElementById('toast').textContent`)).includes('옮길'));
await ev(`__isles.cancel()`); await sleep(300);
// festival (it waits for the first-visit guide to end: end it)
await ev(`(()=>{ __isles.myDoc.wallet.tut = 99; __isles.guide(); })()`); await ev(`__isles.fest(3)`); await sleep(1500); check('festival coming', (await ev(`JSON.stringify(__isles.festState)`)).includes('coming'), await ev(`document.getElementById('festp').textContent`));
await sleep(4000); { const fs0 = await ev(`JSON.stringify(__isles.festState)`); check('festival landed', fs0.includes('here'), fs0 + ' ' + await ev(`__isles.S.role`)); }
// panel, cards, world
await ev(`document.getElementById('d-home').click()`); await sleep(500); check('home panel', await ev(`!document.getElementById('panel').hidden && document.querySelectorAll('#panel .stat').length === 3`)); await shot('home');
await ev(`document.querySelector('#panel .xb').click()`); await sleep(300);
check('wants over the bar', (await ev(`document.querySelectorAll('#wants .want').length`)) >= 2);
await ev(`document.querySelector('#wants .want').click()`); await sleep(500); check('a face lights the land', await ev(`!!__isles.S.choosing && !__isles.S.buildMode && !!__isles.S.card`));
await ev(`(async()=>{ (await import('/src/game/build.js')).openAt(); })()`); await sleep(500); check('a spot opens the window with that face', await ev(`__isles.S.buildMode && !!__isles.S.card && !document.getElementById('bar').closest('[hidden]') && getComputedStyle(document.getElementById('bar')).display !== 'none'`));
await ev(`document.querySelector('#wants .want.cancel').click()`); await sleep(300); check('취소 closes it', !(await ev(`__isles.S.buildMode`)));
await ev(`document.getElementById('d-world').click()`); await sleep(2000); check('world spots', (await ev(`document.querySelectorAll('#spots .spot, #spots .bubble').length`)) > 0); await shot('world');
// a new archipelago: a bad name is refused before anything is saved
await ev(`document.getElementById('wnew').click()`); await sleep(300); await click(700, 450); await sleep(500);
await ev(`(()=>{ const i = document.querySelector('#wcard input'); i.value = '시발'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); })()`); await sleep(300);
check('new board name checked', (await ev(`document.querySelector('#wcard .err')?.textContent ?? ''`)).includes('쓸 수 없어요'));
await ev(`document.getElementById('wclose').click()`); await sleep(500);
// moving a building: it lands on the first free spot that fits
const moved = await ev(`(()=>{ const k = Object.keys(__isles.myDoc.plots)[0], p = __isles.myDoc.plots[k]; __isles.startMove(k);
  for (let d = 0; d < 400; d++) { const x = p.x - 10 + d % 20, z = p.z - 10 + Math.floor(d / 20), t = __isles.target(x + .5, z + .5); if (t?.door) { __isles.tryDrop(x + .5, z + .5); return k + ' → ' + x + ',' + z; } }
  __isles.cancel(); return ''; })()`);
await sleep(400); check('move lands', !!moved && !(await ev(`!!__isles.S.moving`)), moved);
// widening my island: the land card's button, with coins enough
await ev(`__isles.myDoc.wallet.coins += 5000`); await ev(`document.getElementById('d-home').click()`); await sleep(400);
const land0 = await ev(`__isles.myDoc.land ?? 0`), canWiden = await ev(`(()=>{ const b = [...document.querySelectorAll('#panel .card.tile')].find(c => c.textContent.includes('땅 넓히기'))?.querySelector('.gold'); if (!b || b.disabled) return false; b.click(); return true; })()`);
await sleep(600); check('widen land', !canWiden || (await ev(`__isles.myDoc.land`)) === land0 + 1, canWiden ? `${land0} → ${await ev(`__isles.myDoc.land`)}` : 'nothing to widen');
await sleep(3000);
// furniture comes in by itself when 자동 is on
const fxSig = `JSON.stringify(Object.values(__isles.myDoc.plots).map(p => [p.own, p.lv]))`, f0 = await ev(fxSig);
await ev(`__isles.myDoc.wallet.autoInvest = true`); await sleep(3600);
check('auto furnish', (await ev(fxSig)) !== f0); await ev(`__isles.myDoc.wallet.autoInvest = false`);
// power and water: the meter opens the window on the plant or tank, whose one button grows it
await ev(`document.getElementById('pmt').click()`); await sleep(300);
const ups0 = await ev(`__isles.myDoc.wallet.ups[0] + __isles.myDoc.wallet.ups[1]`); check('plant window', await ev(`!!document.querySelector('#why.plant')`));
await ev(`document.querySelector('#why.plant .gold')?.click()`); await sleep(300);
check('grow plant or tank', (await ev(`__isles.myDoc.wallet.ups[0] + __isles.myDoc.wallet.ups[1]`)) === ups0 + 1, `${ups0} → ${await ev(`__isles.myDoc.wallet.ups[0] + __isles.myDoc.wallet.ups[1]`)}`);
// with no power to spare, pressing 짓기 opens the window on the plant with its one button (no Claude call)
await ev(`__isles.myDoc.wallet.ups = [0, 0]`); await ev(`document.body.click()`); await sleep(300);
await ev(`(async()=>{ (await import('/src/game/build.js')).openAt(); })()`); await sleep(500); await ev(`document.getElementById('bgo').click()`); await sleep(400);
check('short of power opens the plant', await ev(`!!document.querySelector('#why.plant')`), await ev(`document.getElementById('why')?.textContent ?? 'no window'`));
// construction site and celebration render without errors
await ev(`__isles.site(11,10,'S',true)`); await sleep(600); await ev(`__isles.site(11,10,'S',false)`); await ev(`__isles.celebrate('테스트','')`); await sleep(800);
check('no errors', errs.length === 0, errs.slice(0, 3).join(' || '));
chrome.kill(); await new Promise(r => setTimeout(r, 500)); del('i-qarg/qa-x'); del('boards/qarg'); del('log/qarg~qa-x'); process.exit(errs.length ? 1 : 0);
