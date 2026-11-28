// The archipelago game: one page, ten friends' islands. Loaded by isles.html.
// This file only puts the pieces together: the state lives in state.js, each screen in its own module (docs/ARCHITECTURE.md).
import { fillVault } from './vault.js';
import { sessionStart } from './persist.js';
import { loadGuest } from './special.js';
import { applyTheme } from '../ui/theme.js';
import { pixelIcons } from '../ui/icons.js';
import { setVoxelPalette } from '../ui/voxelui.js';
import { centerOf, neighbours, PLOT } from '../v2/isles.js';
import { normalize } from '../v2/spec.js';
import { el } from './ui.js';
import { S, db, me, sim, FROM, BOARD, pr, SHOWCASE, site } from './state.js';
import { hooks, allPlots, ratesOf, servesOf, tilesOf } from './model.js';
import { initPersist, WRITER, track } from './persist.js';
import { initCamera, startZoom, chooseZoom, applyZoom, scrollToSlot, toScreen, scrollToPoint, inSafe } from './camera.js';
import { drawMap, riseLand, planks } from './mapview.js';
import { initHud, toast, celebrate, markHome } from './hud.js';
import { initEconomy, takeEvents, stepBoats, stepFest, festSoon } from './economy.js';
import { initGuide, guide, tutOn, inTutOn, tutEvent, pickSpot } from './guide.js';
import { show, showHome, showBuilding, showIsland, closePanel, panelOpen } from './panel.js';
import { initShop, openShop, closeInside, stepInside } from './shop.js';
import { startMove, cancelMove, moveTarget, dropMove } from './move.js';
import { initInput } from './input.js';
import { inviteLink } from './invite.js';
import { setBuildMode, startExtend, initAsk } from './build.js';
import { initUtility } from './utility.js';
import { dustSite } from './mapfx.js';
import { initWorld, openWorld } from './world.js';

const q = new URLSearchParams(location.search);
setVoxelPalette(q.get('vx') || 'a');   // ?vx=a|b|c to compare palettes
if (q.get('theme')) applyTheme(q.get('theme'));   // the skin is on hold: only with ?theme= while the concept is redone
pixelIcons(document.body);   // emoji in the game's words become pixel icons everywhere

// what the model asks of the screens
hooks.celebrate = celebrate;
hooks.guiding = (inside) => tutOn() || (inside && inTutOn());
hooks.happened = tutEvent;
hooks.yielded = () => {   // another tab plays this island now: this one stops and offers to take it back
  closeInside(); setBuildMode(false); cancelMove(); closePanel(); S.fest = null; document.getElementById('festp').hidden = true;
  if (document.querySelector('.handoff')) return;
  document.body.append(el('div', { class: 'handoff' }, el('div', {}, el('b', {}, '다른 창에서 플레이 중'), el('button', { class: 'gold', on: { click: () => location.reload() } }, '여기서 하기'))));
};
hooks.tracked = track;   // model.js cannot import persist.js (persist imports model): level-ups are logged through here
hooks.live = () => { const seen = S.myDoc?.wallet?.seenAt; sessionStart(seen ? (Date.now() - seen) / 60000 : null); keyHint(seen); fillVault(); loadGuest(); const w = S.watching; if (w && !w.mine && S.myDoc?.plots[w.key]) openShop(w.key); };   // back at my island: what it made while I was away waits at the pier   // a shop of mine opened while waiting: open it again as mine
// The island key (panel.js keyCard): said once, on the first visit back after an hour away, when keeping the island matters
function keyHint(seen) {
  const w = S.myDoc?.wallet; if (!site?.key || !w || w.keyHint || !seen || Date.now() - seen < 3600e3) return;
  w.keyHint = 1; S.dirty = true; setTimeout(() => toast('폰을 바꿔도 이어 하려면 · 내 섬 창의 ‘내 섬 열쇠’', 4200), 5000);
}
// back from an island key's link (server /k/<key>): say which way it went, then take it off the address
{ const q = new URLSearchParams(location.search), b = q.get('back');
  if (b !== null) { q.delete('back'); history.replaceState(null, '', location.pathname + (q.size ? '?' + q : '') + location.hash); setTimeout(() => toast(b === '1' ? '열쇠로 내 섬을 찾았어요' : '열쇠가 맞지 않아요 · 새로 만든 열쇠인지 확인해 주세요', 3200), 1200); } }
hooks.lost = () => showHome('그 섬은 다른 친구가 먼저 들어갔어요. 다른 섬을 골라 주세요.');   // my first save never landed, and the island was taken
hooks.namesChanged = () => { const c = S.current; if (c?.kind === 'island' && panelOpen()) showIsland(c.slot); };   // the name arrived after the panel was drawn
hooks.plotChanged = (key) => { if (S.current?.key === key && !S.watching) showBuilding(key); };
let seen = null;   // the islands taken when the map was last rebuilt
// Friends' shops: a new one lands on my screen with its line over the roof as it is built; coming back, the camera goes
// once to the first one built while I was away (what I saw last is kept in this browser).
let shopsSeen = null; const SEEN_KEY = `isles:seen:${BOARD}`;
function friendsShops() {
  if (!S.mySlot || !S.myDoc) return;   // my island loaded: the board's docs are in
  const others = allPlots().filter(p => p.b && p.owner !== me), id = (p) => `${p.key}:${p.b.at}`, keys = new Set(others.map(id));
  let fresh = [];
  if (shopsSeen === null) { let before = null; try { before = JSON.parse(localStorage.getItem(SEEN_KEY) || 'null'); } catch {}
    if (Array.isArray(before)) { const b = new Set(before); fresh = others.filter(p => !b.has(id(p))); if (fresh[0]) setTimeout(() => showFresh(fresh[0], true), 1800); } }
  else { fresh = others.filter(p => !shopsSeen.has(id(p))); if (fresh[0]) showFresh(fresh[0], false); }
  shopsSeen = keys; try { localStorage.setItem(SEEN_KEY, JSON.stringify([...keys])); } catch {}
}
// a bridge both halves of which are now laid: planks fly, and if it is mine, a moment and the camera on it
let doneSeen = null;
function bridgesDone() {
  if (!S.world || !S.mySlot) return;   // from when my island is in: bridges already there on arrival are not news
  const done = new Set([...S.world.bridges].filter(([, h]) => h.a && h.b).map(([id]) => id));
  if (doneSeen) for (const id of done) if (!doneSeen.has(id)) {
    const [a, b] = id.split('-').map(Number); planks(a, b, false);
    if (a === S.mySlot || b === S.mySlot) { const [ax, az] = centerOf(a), [bx, bz] = centerOf(b); celebrate('다리 완성!', `${a}번 ↔ ${b}번 · 손님이 오가요`); scrollToPoint(...pr.P((ax + bx) / 2, (az + bz) / 2)); }
  }
  doneSeen = done;
}
function showFresh(p, look) {
  if (S.building || S.watching) return;
  const n = PLOT[p.size]; let line = p.b.line; try { line ||= normalize(p.b.input).name; } catch {}
  dustSite({ x: p.x, z: p.z, size: p.size }); S.landing = { key: p.key, t0: performance.now(), line: line || '새 가게' };
  const at = pr.P(p.x + n / 2, p.z + n / 2); if (look && !inSafe(...at)) scrollToPoint(...at);
}
hooks.rebuilt = (oldGround) => {
  if (!S.scrolled) {   // the first view: my island; invited, the inviter's; else the whole archipelago to choose from
    S.scrolled = true; const at = S.mySlot || (FROM && S.owners.has(FROM) ? FROM : 0) || (SHOWCASE ? 3 : 0) || pickSpot() || 1;   // (choosing: the island the guide points at, big enough to read; the showcase: its middle sample island, examples/isles-seed.js seed-c)
    S.zoom = S.mySlot ? startZoom(at) : chooseZoom(at); applyZoom(); setTimeout(() => { scrollToSlot(at, false); lift(); }, 50);   // the cover lifts on a drawn island, never on an empty sea
    track('arrive', { from: FROM, has: !!S.mySlot, taken: S.owners.size });
  }
  // a friend took an island: it rises from the sea, and 내 섬 gets a mark (no window)
  const now0 = new Set(S.owners.keys());
  if (seen && S.mySlot) for (const s of now0) if (!seen.has(s) && s !== S.mySlot && !S.landAnim) {
    riseLand(oldGround, tilesOf(s), centerOf(s)); markHome(); track('friend_joined', { slot: s, next: neighbours(S.mySlot).includes(s) });
  }
  seen = now0;
  friendsShops(); bridgesDone();
  { const c = S.current; if (c?.kind === 'island' && S.owners.get(c.slot) !== c.uid && panelOpen()) showIsland(c.slot); }   // the island on the panel changed hands
  if (!S.mySlot) guide();   // choosing an island: the guide follows who took which
  if (!S.current && !S.mySlot && !panelOpen()) showHome();
  else if (S.mySlot && S.joinShown) closePanel();   // the join card goes away once my island is known
  if (S.myDoc && S.mySlot && !S.guided) { S.guided = true; const w = S.myDoc.wallet, none = !Object.keys(S.myDoc.plots).length;
    if (w.tut === undefined && none) w.tut = 0;
    if (w.tut >= 1 && w.tut <= 2 && none) w.tut = 0;   // came back in the middle of the first build: start it again from the faces
    guide(); }
};

initCamera(); initHud(); initUtility(); initAsk(); initGuide(); initShop(); initInput(); initEconomy(); initWorld();

let last = performance.now();
function frame(t) {
  const dt = Math.min(.05, (t - last) / 1000); last = t;
  sim.step(dt); stepBoats(dt); stepInside(dt); stepFest(dt); takeEvents();
  drawMap(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

initPersist({
  onError: () => show(el('p', { class: 'err' }, '군도를 불러오지 못했어요.')),
  onRefund: (coins) => setTimeout(() => toast(`가게 안을 넓게 다시 놓았어요 · 자리 없는 가구 값 ${coins}동전 돌려받음`, 3200), 1500),
});
if (!db) showHome();   // without a database there is nothing to wait for

// for checks from the browser console
window.__isles = {
  screenOf: (k) => { const tp = S.lastTops[k]; return tp && toScreen(tp[0], tp[1] + 30); },
  dbgRates: () => JSON.stringify(allPlots().filter(p => p.owner === me && p.b).map(p => { const r = ratesOf(p), sh = sim.shops.get(p.key); return [p.key, servesOf(p), +r.interval.toFixed(2), r.cap, sh && [sh.cap, +(sh.interval ?? 0).toFixed(2), sh.stock]]; })),
  fest: festSoon,
  get festState() { const f = S.fest; return f && { state: f.state, served: f.served, total: f.total, needs: f.needs }; },
  celebrate,
  site: (x, z, sz, on) => { if (on) S.building = { x, z, size: sz, stage: { canvas: document.createElement('canvas'), W: 0, H: 0 } }; else { dustSite({ x, z, size: sz }); S.building = null; } },
  get watching() { return S.watching; }, get myDoc() { return S.myDoc; }, get zoom() { return S.zoom; },
  startMove, tryDrop: (fx, fz) => dropMove(moveTarget(fx, fz)), target: (fx, fz) => moveTarget(fx, fz), cancel: cancelMove,
  openShop, close: closeInside, extend: startExtend, centerOf, neighbours, S, writer: WRITER, scrollToSlot, guide, inviteLink,
};
// the plain title that covers the loading goes when the first view is drawn and in place (hooks.rebuilt), or after 8 s whatever happens
function lift() { const b = document.getElementById('boot'); if (b && b.style.opacity !== '0') { b.style.opacity = '0'; b.style.pointerEvents = 'none'; setTimeout(() => b.remove(), 400); } }   // no animation frame: a tab in the background has none
setTimeout(lift, 8000);
// ?world=1 opens the world map at once; ?open=<plot key> opens a building's inside at once (for checks)
if (q.get('world')) setTimeout(openWorld, 600);
if (q.get('open')) { const t = setInterval(() => { if (S.role === 'live') { clearInterval(t); openShop(q.get('open')); } }, 300); }
