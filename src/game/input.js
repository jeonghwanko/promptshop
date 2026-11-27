// Pointer and keys on the map: drag to pan, hover a spot in build or move mode, tap a building to open it,
// press and hold one of mine to move it, tap a spot to move where the next building goes, tap another island to see it.
import { SLOTS, PLOT, placePlot, slotAt } from '../v2/isles.js';
import { $ } from './ui.js';
import { S, me, pr, map, canWrite } from './state.js';
import { allPlots, takenSet, tilesOf } from './model.js';
import { mapXY } from './camera.js';
import { buildingAt } from './mapview.js';
import { plantAt, plantWindow } from './utility.js';
import { vaultAt, openVault } from './vault.js';
import { toast } from './hud.js';
import { setBuildMode, setSpot, openAt, cancelBuild } from './build.js';
import { startMove, cancelMove, moveTarget, dropMove } from './move.js';
import { showIsland, closePanel, panelOpen, halfBridge } from './panel.js';
import { picking, guide } from './guide.js';
import { toScreen, scrollToSlot, tagXY } from './camera.js';
import { openShop } from './shop.js';

/** The island whose name tag is under a map point (tags sit in the water past each island's front shore). */
function labelAt(sx, sy) {
  for (let s = 1; s <= SLOTS; s++) { if (S.owners.get(s) === me) continue; const [lx, ly] = tagXY(s); if (Math.abs(sx - lx) < 60 && sy > ly - 34 && sy < ly - 6) return s; }
  return 0;
}
/** The spot for a building of the size picked nearest a map point on my island (the tile under it first, then the ones
 *  around it), or null: a pointer near a tile edge still lands where the outline showed. */
function fitNear(fx, fz) {
  const n = PLOT[S.size], x0 = Math.round(fx - n / 2), z0 = Math.round(fz - n / 2), taken = takenSet(); let best = null, bd = 9;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const x = x0 + dx, z = z0 + dz, d = Math.hypot(x + n / 2 - fx, z + n / 2 - fz); if (d >= bd) continue; const door = placePlot(S.world, S.mySlot, x, z, n, taken); if (door) { best = { x, z, door }; bd = d; } }
  return best;
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
    if (!S.mySlot || S.building || S.watching) { S.hover = null; map.style.cursor = ''; return; }
    const [sx, sy] = mapXY(e), [fx, fz] = pr.inv(sx, sy);
    if (S.moving) { S.hover = moveTarget(fx, fz); return; }
    const n = PLOT[S.size], x = Math.round(fx - n / 2), z = Math.round(fz - n / 2), mine = slotAt(Math.floor(fx), Math.floor(fz)) === S.mySlot, door = mine && placePlot(S.world, S.mySlot, x, z, n, takenSet());
    // the bar closed: free land where a building fits answers the pointer with a soft outline (a tap there builds)
    const near = !S.buildMode && mine && canWrite() && !buildingAt(e) ? fitNear(fx, fz) : null;
    S.hover = S.buildMode ? (mine ? { x, z, door } : null) : near ? { ...near, idle: true } : null;
    map.style.cursor = S.hover?.idle ? 'pointer' : '';
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
    { const k = buildingAt(e); if (k) { S.choosing = false; return openShop(k); } }
    if (!S.buildMode && vaultAt(sx, sy) && openVault()) return;   // the chest at my pier: what the island made while I was away
    { const k = plantAt(sx, sy); if (k >= 0 && !S.buildMode) return plantWindow(k); }   // my power plant or water tank (after buildings: they are in front)
    { const t = (S.bridgeTags ?? []).find(q => sx >= q.x && sx <= q.x + q.w && sy >= q.y && sy <= q.y + q.h);   // a plank tag: lay my half
      if (t) { const [l, tp] = toScreen(t.x, t.y), [r, b] = toScreen(t.x + t.w, t.y + t.h); return halfBridge(t.n, { getBoundingClientRect: () => ({ left: l, top: tp, right: r, bottom: b, width: r - l, height: b - tp }) }); } }
    const s = slotAt(Math.floor(fx), Math.floor(fz)) || labelAt(sx, sy);   // an island, or its name tag over the water
    if (S.buildMode) {   // the bar is open: the tap moves where the building goes (touch screens have no hover)
      const sp = s === S.mySlot ? fitNear(fx, fz) : null;
      if (sp) return setSpot(sp.x, sp.z, sp.door);
      return showSpots(s !== S.mySlot); }
    if (s && s === S.mySlot && canWrite()) {   // my own land: build here (where it fits; else the bar opens and the spots that fit blink)
      const spot = fitNear(fx, fz); if (spot) openAt(spot); else showSpots(false); return; }
    if (S.choosing && s !== S.mySlot) cancelBuild();   // a face was picked, but the tap is elsewhere: let it go
    if (s && picking() && !S.owners.has(s)) { S.pick = s; closePanel(); return guide(); }   // choosing: the 'live here' button moves to the island I tapped
    if (s && s !== S.mySlot) return showIsland(s);
    if (panelOpen() && S.current?.kind !== 'build') closePanel();
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && (S.buildMode || S.choosing)) cancelBuild(); if (e.key === 'Escape' && S.moving) cancelMove(); });
}
