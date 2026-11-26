// The archipelago game: one page, ten friends' islands. Loaded by isles.html.
// This file only puts the pieces together: the state lives in state.js, each screen in its own module (docs/ARCHITECTURE.md).
import { applyTheme } from '../ui/theme.js';
import { pixelIcons } from '../ui/icons.js';
import { setVoxelPalette } from '../ui/voxelui.js';
import { centerOf } from '../v2/isles.js';
import { el } from './ui.js';
import { S, db, me, sim } from './state.js';
import { hooks, allPlots, ratesOf, servesOf } from './model.js';
import { initPersist } from './persist.js';
import { initCamera, startZoom, applyZoom, scrollToSlot, toScreen } from './camera.js';
import { drawMap } from './mapview.js';
import { initHud, toast, celebrate } from './hud.js';
import { initEconomy, takeEvents, stepBoats, stepFest, festSoon } from './economy.js';
import { initGuide, guide } from './guide.js';
import { show, showHome, closePanel, panelOpen } from './panel.js';
import { initShop, openShop, closeInside, stepInside } from './shop.js';
import { startMove, cancelMove, moveTarget, dropMove } from './move.js';
import { initInput } from './input.js';
import { site } from './mapfx.js';
import { openWorld } from './world.js';

const q = new URLSearchParams(location.search);
setVoxelPalette(q.get('vx') || 'a');   // ?vx=a|b|c to compare palettes
if (q.get('theme')) applyTheme(q.get('theme'));   // the skin is on hold: only with ?theme= while the concept is redone
pixelIcons(document.body);   // emoji in the game's words become pixel icons everywhere

// what the model asks of the screens
hooks.celebrate = celebrate;
hooks.rebuilt = () => {
  if (!S.scrolled) { S.scrolled = true; S.zoom = startZoom(S.mySlot || 1); applyZoom(); setTimeout(() => scrollToSlot(S.mySlot || 1), 50); }
  if (!S.current && !S.mySlot && !panelOpen()) showHome();
  else if (S.mySlot && S.joinShown) closePanel();   // the join card goes away once my island is known
  if (S.myDoc && S.mySlot && !S.guided) { S.guided = true; const w = S.myDoc.wallet, none = !Object.keys(S.myDoc.plots).length;
    if (w.tut === undefined && none) w.tut = 0;
    if (w.tut >= 2 && w.tut <= 5 && none) w.tut = 1;   // came back in the middle of the first build: start it again from [짓기]
    guide(); }
};

initCamera(); initHud(); initGuide(); initShop(); initInput(); initEconomy();

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
  site: (x, z, sz, on) => { if (on) S.building = { x, z, size: sz, stage: { canvas: document.createElement('canvas'), W: 0, H: 0 } }; else { site.done = { x, z, size: sz, t: 0 }; S.building = null; } },
  get watching() { return S.watching; }, get myDoc() { return S.myDoc; }, get zoom() { return S.zoom; },
  startMove, tryDrop: (fx, fz) => dropMove(moveTarget(fx, fz)), target: (fx, fz) => moveTarget(fx, fz), cancel: cancelMove,
  openShop, close: closeInside, centerOf, S,
};
// ?world=1 opens the world map at once; ?open=<plot key> opens a building's inside at once (for checks)
if (q.get('world')) setTimeout(openWorld, 600);
if (q.get('open')) setTimeout(() => openShop(q.get('open')), 1500);
