// The archipelago game: one page, ten friends' islands. Loaded by isles.html.
// This file only puts the pieces together: the state lives in state.js, each screen in its own module (docs/ARCHITECTURE.md).
import { applyTheme } from '../ui/theme.js';
import { pixelIcons } from '../ui/icons.js';
import { setVoxelPalette } from '../ui/voxelui.js';
import { centerOf, neighbours } from '../v2/isles.js';
import { el } from './ui.js';
import { S, db, me, sim, FROM } from './state.js';
import { hooks, allPlots, ratesOf, servesOf, tilesOf } from './model.js';
import { initPersist, WRITER, track } from './persist.js';
import { initCamera, startZoom, applyZoom, scrollToSlot, toScreen } from './camera.js';
import { drawMap, riseLand } from './mapview.js';
import { initHud, toast, celebrate, markHome } from './hud.js';
import { initEconomy, takeEvents, stepBoats, stepFest, festSoon } from './economy.js';
import { initGuide, guide, tutOn, inTutOn, tutEvent, pickSpot } from './guide.js';
import { show, showHome, showBuilding, showIsland, closePanel, panelOpen } from './panel.js';
import { initShop, openShop, closeInside, stepInside } from './shop.js';
import { startMove, cancelMove, moveTarget, dropMove } from './move.js';
import { initInput } from './input.js';
import { inviteLink } from './invite.js';
import { setBuildMode, startExtend } from './build.js';
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
  closeInside(); setBuildMode(false); cancelMove(); closePanel(); S.fest = null; document.getElementById('festp').hidden = true; document.getElementById('cards').hidden = true;
  if (document.querySelector('.handoff')) return;
  document.body.append(el('div', { class: 'handoff' }, el('div', {}, el('b', {}, '다른 창에서 플레이 중'), el('button', { class: 'gold', on: { click: () => location.reload() } }, '여기서 하기'))));
};
hooks.live = () => { const w = S.watching; if (w && !w.mine && S.myDoc?.plots[w.key]) openShop(w.key); };   // a shop of mine opened while waiting: open it again as mine
hooks.plotChanged = (key) => { if (S.current?.key === key && !S.watching) showBuilding(key); };
let seen = null;   // the islands taken when the map was last rebuilt
hooks.rebuilt = (oldGround) => {
  if (!S.scrolled) {   // the first view: my island; invited, the inviter's; else the whole archipelago to choose from
    S.scrolled = true; const at = S.mySlot || (FROM && S.owners.has(FROM) ? FROM : 0) || pickSpot() || 1;   // (choosing: the island the guide points at, big enough to read)
    S.zoom = S.mySlot ? startZoom(at) : 1; applyZoom(); setTimeout(() => scrollToSlot(at, false), 50);
    track('arrive', { from: FROM, has: !!S.mySlot, taken: S.owners.size });
  }
  // a friend took an island: it rises from the sea, and 내 섬 gets a mark (no window)
  const now0 = new Set(S.owners.keys());
  if (seen && S.mySlot) for (const s of now0) if (!seen.has(s) && s !== S.mySlot && !S.landAnim) {
    riseLand(oldGround, tilesOf(s), centerOf(s)); markHome(); track('friend_joined', { slot: s, next: neighbours(S.mySlot).includes(s) });
  }
  seen = now0;
  { const c = S.current; if (c?.kind === 'island' && S.owners.get(c.slot) !== c.uid && panelOpen()) showIsland(c.slot); }   // the island on the panel changed hands
  if (!S.mySlot) guide();   // choosing an island: the guide follows who took which
  if (!S.current && !S.mySlot && !panelOpen()) showHome();
  else if (S.mySlot && S.joinShown) closePanel();   // the join card goes away once my island is known
  if (S.myDoc && S.mySlot && !S.guided) { S.guided = true; const w = S.myDoc.wallet, none = !Object.keys(S.myDoc.plots).length;
    if (w.tut === undefined && none) w.tut = 0;
    if (w.tut >= 2 && w.tut <= 5 && none) w.tut = 1;   // came back in the middle of the first build: start it again from [짓기]
    guide(); }
};

initCamera(); initHud(); initGuide(); initShop(); initInput(); initEconomy(); initWorld();

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
// the game is up: the plain title that covered the loading goes
{ const b = document.getElementById('boot'); if (b) { b.style.opacity = '0'; setTimeout(() => b.remove(), 400); } }
// ?world=1 opens the world map at once; ?open=<plot key> opens a building's inside at once (for checks)
if (q.get('world')) setTimeout(openWorld, 600);
if (q.get('open')) { const t = setInterval(() => { if (S.role === 'live') { clearInterval(t); openShop(q.get('open')); } }, 300); }
