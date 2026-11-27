// Pointer and keys on the map: drag to pan, hover a spot in build or move mode, tap a building to open it,
// press and hold one of mine to move it, tap a spot to move where the next building goes, tap another island to see it.
import { SLOTS, PLOT, placePlot, slotAt, centerOf } from '../v2/isles.js';
import { $ } from './ui.js';
import { S, me, pr, map } from './state.js';
import { allPlots, takenSet, tilesOf } from './model.js';
import { mapXY } from './camera.js';
import { buildingAt } from './mapview.js';
import { toast } from './hud.js';
import { setBuildMode, setSpot } from './build.js';
import { startMove, cancelMove, moveTarget, dropMove } from './move.js';
import { showIsland, closePanel, panelOpen, halfBridge } from './panel.js';
import { picking, guide } from './guide.js';
import { toScreen, scrollToSlot } from './camera.js';
import { openShop } from './shop.js';

/** The island whose name tag is under a map point (tags sit over each island's top corner, often over water). */
function labelAt(sx, sy) {
  for (let s = 1; s <= SLOTS; s++) { const [cx, cz] = centerOf(s), [lx, ly] = pr.P(cx - 4, cz - 4); if (Math.abs(sx - lx) < 60 && sy > ly - 34 && sy < ly - 6) return s; }
  return 0;
}
/** A tap where nothing can be built: the spots on my island where this size fits blink for a moment (no words). */
function showSpots(away) {
  const n = PLOT[S.size], taken = takenSet(), spots = [], seen = new Set();
  for (const [x, z] of tilesOf(S.mySlot)) { const k = x + ',' + z; if (seen.has(k)) continue; if (placePlot(S.world, S.mySlot, x, z, n, taken)) { spots.push({ x, z }); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) seen.add((x + i) + ',' + (z + j)); } }
  if (!spots.length) return toast('이 크기가 들어갈 빈 땅이 없어요', 1600);
  S.spotBlink = { spots, n, t0: performance.now() }; if (away) scrollToSlot(S.mySlot);
}
export function initInput() {
  // drag to pan
  let dragged = false;
  { const box = $('mapbox'); let down = null;
    box.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, l: box.scrollLeft, t: box.scrollTop }; dragged = false; });
    addEventListener('pointermove', (e) => { if (!down) return; const dx = e.clientX - down.x, dy = e.clientY - down.y; if (!dragged && Math.hypot(dx, dy) > 6) { dragged = true; box.classList.add('drag'); } if (dragged) { box.scrollLeft = down.l - dx; box.scrollTop = down.t - dy; } });
    addEventListener('pointerup', () => { down = null; box.classList.remove('drag'); setTimeout(() => { dragged = false; }, 0); }); }

  map.addEventListener('pointermove', (e) => {
    if (!S.mySlot || S.building || !(S.buildMode || S.moving)) { S.hover = null; return; }
    const [sx, sy] = mapXY(e), [fx, fz] = pr.inv(sx, sy);
    if (S.moving) { S.hover = moveTarget(fx, fz); return; }
    const n = PLOT[S.size], x = Math.round(fx - n / 2), z = Math.round(fz - n / 2);
    S.hover = slotAt(Math.floor(fx), Math.floor(fz)) === S.mySlot ? { x, z, door: placePlot(S.world, S.mySlot, x, z, n, takenSet()) } : null;
  });
  map.addEventListener('pointerleave', () => { S.hover = null; });

  // press and hold one of my buildings to pick it up and move it
  let holdT = 0, held = false;
  map.addEventListener('pointerdown', (e) => {
    held = false; clearTimeout(holdT); if (S.building || S.moving || S.buildMode) return;
    const key = buildingAt(e), p = key && allPlots().find(q => q.key === key); if (!p || p.owner !== me) return;
    holdT = setTimeout(() => { if (dragged) return; held = true; startMove(key); }, 550);
  });
  addEventListener('pointerup', () => clearTimeout(holdT)); addEventListener('pointercancel', () => clearTimeout(holdT));

  map.addEventListener('click', (e) => {
    if (S.building || dragged) return;
    if (held) { held = false; return; }   // the press that picked a building up is not also a tap
    const [sx, sy] = mapXY(e), [fx, fz] = pr.inv(sx, sy);
    if (S.moving) return dropMove(moveTarget(fx, fz));
    { const k = buildingAt(e); if (k) return openShop(k); }
    { const t = (S.bridgeTags ?? []).find(q => sx >= q.x && sx <= q.x + q.w && sy >= q.y && sy <= q.y + q.h);   // a plank tag: lay my half
      if (t) { const [l, tp] = toScreen(t.x, t.y), [r, b] = toScreen(t.x + t.w, t.y + t.h); return halfBridge(t.n, { getBoundingClientRect: () => ({ left: l, top: tp, right: r, bottom: b, width: r - l, height: b - tp }) }); } }
    const s = slotAt(Math.floor(fx), Math.floor(fz)) || labelAt(sx, sy);   // an island, or its name tag over the water
    if (S.buildMode) {   // the bar is open: the tap moves where the building goes (touch screens have no hover)
      const n = PLOT[S.size], x = Math.round(fx - n / 2), z = Math.round(fz - n / 2), door = s === S.mySlot ? placePlot(S.world, S.mySlot, x, z, n, takenSet()) : null;
      if (door) return setSpot(x, z, door);
      return showSpots(s !== S.mySlot); }
    if (s && picking() && !S.owners.has(s)) { S.pick = s; closePanel(); return guide(); }   // choosing: the 'live here' button moves to the island I tapped
    if (s && s !== S.mySlot) return showIsland(s);
    if (panelOpen() && S.current?.kind !== 'build') closePanel();
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.buildMode) setBuildMode(false); if (e.key === 'Escape' && S.moving) cancelMove(); });
}
