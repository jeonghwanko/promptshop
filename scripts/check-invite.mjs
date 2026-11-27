// The first session with a friend: choosing an island on the map, the last guide step and the invite link, then the
// friend landing next to the inviter, the free half bridge and the inviter seeing them arrive. Prints PASS/FAIL.
// Usage: node scripts/check-invite.mjs [shots dir]   (with node scripts/dev.mjs 5300 running; needs google-chrome)
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs'; import { tmpdir } from 'node:os';
const dir = fs.mkdtempSync(tmpdir() + '/isles-invite-'), shots = process.argv[2], BOARD = 'qainv';
const api = (m, path) => execSync(`curl -s -X ${m} localhost:5300/api/db/${path}`).toString();
const get = (path) => JSON.parse(api('GET', path) || 'null');
const clean = () => { for (const p of [`i-${BOARD}/qa-i`, `i-${BOARD}/qa-f`, `i-${BOARD}/qa-g`, `log/${BOARD}~qa-i`, `log/${BOARD}~qa-f`, `log/${BOARD}~qa-g`]) api('DELETE', p); };
clean();
const port = 9381, chrome = spawn('google-chrome', ['--headless=new', '--password-store=basic', '--no-sandbox', '--use-angle=swiftshader', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}/chrome`, '--window-size=1400,900', 'about:blank'], { stdio: 'ignore' });
process.on('exit', () => { try { chrome.kill(); } catch {} });
await new Promise(r => setTimeout(r, 1500));
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), errs = [];
async function tab(url) {
  const t = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl); let id = 0; const wait = new Map();
  ws.onmessage = (m) => { const x = JSON.parse(m.data); if (x.id && wait.has(x.id)) { wait.get(x.id)(x.result); wait.delete(x.id); } if (x.method === 'Runtime.exceptionThrown') errs.push(x.params.exceptionDetails.exception?.description?.split('\n')[0]); };
  await new Promise(r => ws.onopen = r);
  const send = (method, params = {}) => new Promise(r => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false }); await send('Page.navigate', { url });
  const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true }); return r.result.value ?? r.result.description; };
  const click = async (x, y) => { for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }); };
  const shot = async (n) => { if (!shots) return; const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`${shots}/invite_${n}.png`, Buffer.from(r.data, 'base64')); };
  return { ev, click, shot, front: () => send('Page.bringToFront') };
}
const check = (name, ok, info = '') => { console.log(ok ? 'PASS' : 'FAIL', name, info); if (!ok) process.exitCode = 1; };
const arrow = async (t) => JSON.parse(await t.ev(`(()=>{ const a = document.getElementById('garrow'); return JSON.stringify(a.hidden ? null : [parseFloat(a.style.left), parseFloat(a.style.top)]); })()`));
const text = (t) => t.ev(`document.getElementById('guide').hidden ? '' : document.getElementById('gtext').textContent`);
const base = 'http://127.0.0.1:5300/isles.html';

// 1. the inviter arrives: the whole archipelago, no number buttons, the guide points at an island
const I = await tab(`${base}?board=${BOARD}&me=qa-i`); await sleep(7000); await I.shot('1-arrive');
check('arrive: no number buttons', await I.ev(`!document.querySelector('#panel .slots')`));
check('arrive: guide asks to choose', (await text(I)).includes('섬'), await text(I));
const a1 = await arrow(I); check('arrive: arrow at an island', !!a1);
// 2. tap the island under the arrow: its card, one button, and I live there
if (a1) await I.click(a1[0], a1[1] + 40); await sleep(800); await I.shot('2-card');
check('island card: live here', await I.ev(`[...document.querySelectorAll('#panel button.gold')].some(b => b.textContent.includes('이 섬에 살기'))`));
await I.ev(`[...document.querySelectorAll('#panel button.gold')].find(b => b.textContent.includes('이 섬에 살기'))?.click()`); await sleep(2500);
const slotI = await I.ev(`__isles.S.mySlot`); check('joined on the map', slotI > 0, `island ${slotI}`);
// 3. the last guide step (the build itself is checked by the tutorial run): points at the empty island next door
await I.ev(`(()=>{ __isles.myDoc.wallet.tut = 8; __isles.S.dirty = true; __isles.guide(); })()`); await sleep(1500);
check('last step: call a friend', (await text(I)).includes('친구'), await text(I)); const a2 = await arrow(I); check('last step: arrow at the free island', !!a2); await I.shot('3-laststep');
if (a2) await I.click(a2[0], a2[1] + 18); await sleep(800); await I.shot('4-invitecard');
check('invite card: picture and button', await I.ev(`!!document.querySelector('#panel .invitecard canvas') && !!document.querySelector('#panel .invitecard button.gold')`));
await I.ev(`document.querySelector('#panel .invitecard button.gold').click()`); await sleep(800);
check('invite pressed: guide done', (await I.ev(`__isles.myDoc.wallet.tut`)) >= 9);
const link = await I.ev(`__isles.inviteLink()`); check('link: board and island', link.includes(`board=${BOARD}`) && link.includes(`from=${slotI}`), link);
// 4. the friend opens the link: the camera is on the inviter, the guide points next door
const F = await tab(`${link}&me=qa-f`); await sleep(7000); await F.shot('5-friend');
check('friend: guide names the inviter', (await text(F)).includes('옆'), await text(F));
const a3 = await arrow(F); if (a3) await F.click(a3[0], a3[1] + 40); await sleep(800); await F.shot('6-friendcard');
check('friend: card says next to the inviter', (await F.ev(`document.querySelector('#panel h2')?.textContent ?? ''`)).includes('옆'));
await F.ev(`[...document.querySelectorAll('#panel button.gold')].find(b => b.textContent.includes('이 섬에 살기'))?.click()`); await sleep(2500);
const slotF = await F.ev(`__isles.S.mySlot`);
const near = await F.ev(`JSON.stringify(__isles.neighbours(${slotI}))`); check('friend: lives next door', slotF > 0 && JSON.parse(near).includes(slotF), `${slotI} ↔ ${slotF}`);
check('friend: first half bridge is free', (await F.ev(`__isles.myDoc.wallet.freeHalf`)) === slotI);
// 5. the inviter sees them arrive: the island rises, 내 섬 gets a mark
await sleep(3000); await I.front(); await sleep(600); await I.shot('7-inviter');
check('inviter: the friend\'s island rises', await I.ev(`!!__isles.S.landAnim`));
await sleep(5000); await I.shot('7b-inviter-later'); check('inviter: and settles', await I.ev(`!__isles.S.landAnim`));
check('inviter: the panel follows (island 2 is the friend\'s now)', !(await I.ev(`!!document.querySelector('#panel .invitecard')`)) || !(await I.ev(`document.querySelector('#panel h2')?.textContent.includes(String(${'${'}slotF})) ?? false`)));
check('inviter: mark on 내 섬', await I.ev(`!!document.querySelector('#d-home .badge')`));
// 6. the friend builds their free half
await F.front(); await F.ev(`(()=>{ __isles.myDoc.wallet.tut = 99; __isles.guide(); document.getElementById('d-home').click(); })()`); await sleep(800); await F.shot('8-friendhome');
const c0 = await F.ev(`__isles.myDoc.wallet.coins`);
await F.ev(`[...document.querySelectorAll('#panel .card.tile button.gold')].find(b => b.textContent.includes('무료'))?.click()`); await sleep(1500);
check('friend: free half built', (await F.ev(`!!__isles.myDoc.half[${slotI}]`)) && (await F.ev(`__isles.myDoc.wallet.coins`)) === c0);
// 7. the funnel log
await sleep(2500); const li = get(`log/${BOARD}~qa-i`) ?? {}, lf = get(`log/${BOARD}~qa-f`) ?? {}, evs = (l) => Object.keys(l).map(k => k.split('_').slice(1).join('_'));
check('log: inviter', ['arrive', 'pick', 'invite_open', 'invite_copy', 'friend_joined'].every(e => evs(li).includes(e)), evs(li).join(' '));
check('log: friend', ['arrive', 'pick', 'bridge_half'].every(e => evs(lf).includes(e)) && Object.entries(lf).some(([k, v]) => k.endsWith('_pick') && v.nextToInviter), evs(lf).join(' '));
// 8. ?pick=grid keeps the old number buttons, to compare
const G = await tab(`${base}?board=${BOARD}&me=qa-g&pick=grid`); await sleep(6000);
check('pick=grid: number buttons', await G.ev(`!!document.querySelector('#panel .slots')`));
check('no errors', errs.length === 0, errs.slice(0, 3).join(' || '));
chrome.kill(); await sleep(500); clean(); fs.rmSync(dir, { recursive: true, force: true });
