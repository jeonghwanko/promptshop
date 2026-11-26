// Moving a building: it lifts, follows the pointer, and lands where it fits; landing on another of mine swaps them.
import { PLOT, placePlot, slotAt } from '../v2/isles.js';
import { S, pr, splash } from './state.js';
import { takenSet, rebuild } from './model.js';
import { save } from './persist.js';
import { toast } from './hud.js';
import { closePanel } from './panel.js';
import { closeInside } from './shop.js';
import { setBuildMode } from './build.js';

export function startMove(key) {
  const p = S.myDoc?.plots[key]; if (!p) return;
  if (S.watching) closeInside(); setBuildMode(false); closePanel();
  S.moving = { key, size: p.size }; S.hover = null; toast('↔ 옮길 자리를 눌러요 · 내 건물을 누르면 자리 바꾸기');
}
export function cancelMove() { S.moving = null; S.hover = null; toast(''); }
/** Where the moved building would land with the pointer at map tile (fx, fz), and why not when it does not fit. */
export function moveTarget(fx, fz) {
  const { moving, myDoc, mySlot, world } = S, n = PLOT[moving.size], x = Math.round(fx - n / 2), z = Math.round(fz - n / 2);
  if (slotAt(Math.floor(fx), Math.floor(fz)) !== mySlot) return null;
  // the same-sized building of mine under the pointer: swap
  const other = Object.entries(myDoc.plots).find(([k, p]) => k !== moving.key && fx >= p.x && fx < p.x + PLOT[p.size] && fz >= p.z && fz < p.z + PLOT[p.size]);
  if (other) { const sw = swapDoors(moving.key, other[0]); return sw ? { x: other[1].x, z: other[1].z, swap: other[0], ...sw } : { x: other[1].x, z: other[1].z, door: null, why: '크기가 달라 그 두 자리는 서로 맞지 않아요' }; }
  const taken = takenSet(moving.key);
  const door = placePlot(world, mySlot, x, z, n, taken);
  if (door) return { x, z, door };
  // why it does not fit, said in words
  let why = '길에 한 면이 닿아야 해요';
  for (let i = x; i < x + n; i++) for (let k = z; k < z + n; k++) { if (slotAt(i, k) !== mySlot) why = '섬 밖이에요'; else if (world.isRoad(i, k)) why = why === '섬 밖이에요' ? why : '길 위예요'; else if (taken.has(i + ',' + k)) why = why === '섬 밖이에요' || why === '길 위예요' ? why : '다른 건물과 겹쳐요'; }
  return { x, z, door: null, why };
}
// doors for two of my buildings trading places, or null if either does not fit the other's spot
function swapDoors(ka, kb) {
  const { myDoc, mySlot, world } = S, a = myDoc.plots[ka], b = myDoc.plots[kb], taken = takenSet(ka, kb);
  const da = placePlot(world, mySlot, b.x, b.z, PLOT[a.size], taken); if (!da) return null;
  const tA = new Set(taken); for (let i = b.x; i < b.x + PLOT[a.size]; i++) for (let k = b.z; k < b.z + PLOT[a.size]; k++) tA.add(i + ',' + k);
  const db = placePlot(world, mySlot, a.x, a.z, PLOT[b.size], tA); return db ? { da, db } : null;
}
export function dropMove(t) {
  if (!t || (!t.door && !t.swap)) return toast(`${t?.why ?? '내 섬 땅을 누르세요'} · 내 다른 건물을 누르면 자리를 바꿔요 · Esc 취소`, 2000);
  const { myDoc, mySlot } = S, a = myDoc.plots[S.moving.key], plots = { ...myDoc.plots }; delete plots[S.moving.key];
  const at = (p, x, z, door) => ({ ...p, x, z, door });
  if (t.swap) {   // exchange places; each finds its door again from its new spot
    const b = plots[t.swap]; delete plots[t.swap];
    plots[`${mySlot}_${b.x}_${b.z}`] = at(a, b.x, b.z, t.da); plots[`${mySlot}_${a.x}_${a.z}`] = at(b, a.x, a.z, t.db);
  } else plots[`${mySlot}_${t.x}_${t.z}`] = at(a, t.x, t.z, t.door);
  myDoc.plots = plots;
  // a thump of dust where it lands
  const n = PLOT[a.size], [px, py] = pr.P(t.x + n / 2, t.z + n / 2); for (let i = 0; i < 14; i++) splash.push({ x: px + (Math.random() - .5) * 40, y: py + (Math.random() - .5) * 10, vx: (Math.random() - .5) * 70, vy: -20 - Math.random() * 30, t: 0, dust: true });
  S.moving = null; S.hover = null; toast(t.swap ? '⇄ 자리를 바꿨어요' : '쿵! 옮겼어요', 1300); rebuild(); save(true);
}
