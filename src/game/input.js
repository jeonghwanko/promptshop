// Pointer and keys on the map: drag to pan, hover a spot in build or move mode, tap a building to open it,
// press and hold one of mine to move it, tap a spot to build, tap another island to see it.
import { SLOTS, PLOT, placePlot, slotAt, centerOf } from '../v2/isles.js';
import { $ } from './ui.js';
import { S, me, pr, map } from './state.js';
import { allPlots, takenSet } from './model.js';
import { mapXY } from './camera.js';
import { buildingAt } from './mapview.js';
import { toast } from './hud.js';
import { setBuildMode, startBuild } from './build.js';
import { startMove, cancelMove, moveTarget, dropMove } from './move.js';
import { showIsland, closePanel, panelOpen } from './panel.js';
import { openShop } from './shop.js';

/** The island whose name tag is under a map point (tags sit over each island's top corner, often over water). */
function labelAt(sx, sy) {
  for (let s = 1; s <= SLOTS; s++) { const [cx, cz] = centerOf(s), [lx, ly] = pr.P(cx - 4, cz - 4); if (Math.abs(sx - lx) < 60 && sy > ly - 34 && sy < ly - 6) return s; }
  return 0;
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
    const s = slotAt(Math.floor(fx), Math.floor(fz)) || labelAt(sx, sy);   // an island, or its name tag over the water
    if (S.buildMode) {   // the spot comes from the tap itself (touch screens have no hover)
      const n = PLOT[S.size], x = Math.round(fx - n / 2), z = Math.round(fz - n / 2), door = s === S.mySlot ? placePlot(S.world, S.mySlot, x, z, n, takenSet()) : null;
      if (door) { setBuildMode(false); return startBuild(x, z, door); }
      return toast(s === S.mySlot ? '길에 닿은 빈 땅을 고르세요' : '내 섬 땅을 누르세요', 1500); }
    if (s && s !== S.mySlot) return showIsland(s);
    if (panelOpen() && S.current?.kind !== 'build') closePanel();
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.buildMode) setBuildMode(false); if (e.key === 'Escape' && S.moving) cancelMove(); });
}
