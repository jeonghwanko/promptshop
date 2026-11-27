// Saved islands from older rules, brought up to date when they are read. Pure: a doc in, a doc out.
import { normalize } from '../v2/spec.js';
import { buildSection, LAYOUT, remapFixtures } from '../v2/interior.js';
import { startingFixtures } from '../v2/insideview.js';
import { costOf, upgradeCost } from '../v2/inside.js';
import { GAP, OLD_GAP, centerOfGap } from '../v2/isles.js';

/** Islands laid out with the old gap between them: every plot moves with its island's centre. */
export function moveWithIsland(d) {
  if (!d?.slot || (d.gap ?? OLD_GAP) === GAP) return d;
  const [ox, oz] = centerOfGap(d.slot, d.gap ?? OLD_GAP), [nx, nz] = centerOfGap(d.slot, GAP), dx = nx - ox, dz = nz - oz, plots = {};
  for (const [key, p] of Object.entries(d.plots ?? {})) {
    const q = { ...p, x: p.x + dx, z: p.z + dz, door: p.door ? [p.door[0] + dx, p.door[1] + dz] : p.door };
    plots[`${d.slot}_${q.x}_${q.z}`] = q;
  }
  return { ...d, plots, gap: GAP };
}

/**
 * Plots bought under the old "fill every wall" layout: carry the bought fixtures (and their levels) to the new layout once.
 * Fixtures with no place left are refunded: the doc comes back with _refund (coins) and _migrated set.
 */
export function migrateLayout(d) {
  if (!d?.plots) return d; let changed = false, refund = 0; const plots = {};
  for (const [key, p] of Object.entries(d.plots)) {
    if (!p.b || (p.lay ?? 1) >= LAYOUT) { plots[key] = p; continue; }
    let oldFx, newFx; try { const n = normalize(p.b.input); oldFx = buildSection(n, { layout: 1 }).fixtures; newFx = buildSection(n).fixtures; } catch { plots[key] = p; continue; }
    const own = Array.isArray(p.own) ? p.own : p.fx === undefined ? [...startingFixtures(oldFx, p.b.input.order)] : Array.from({ length: Math.min(oldFx.length, p.fx) }, (_, i) => i);
    const r = remapFixtures(oldFx, newFx, own, p.lv ?? {});
    refund += refundOf(r.lost);
    plots[key] = { ...p, own: r.own, fx: r.own.length, lv: r.lv, lay: LAYOUT }; changed = true;
  }
  return changed ? { ...d, plots, _refund: refund, _migrated: true } : d;
}

/** What the fixtures that found no place were worth: their price and every level paid for. */
export const refundOf = (lost) => lost.reduce((t, l) => { let c = costOf(l.kind); for (let L = 1; L < l.level; L++) c += upgradeCost(l.kind, L); return t + c; }, 0);

/**
 * The first-visit guide's step, saved under an older list of steps, moved to where the same step is now (tutV 3: a face,
 * the line, building, the boat, a shop, a friend — six steps, no buttons in the bubble). v1: a 짓기 button, a hand of
 * cards, a tap on the map, a signboard (nine steps); v2: a hello with a button, then the faces and the bar (seven steps).
 */
const TO_V3 = { 1: [0, 0, 0, 1, 1, 2, 3, 4, 5], 2: [0, 0, 1, 2, 3, 4, 5] };
export function migrateGuide(d) {
  const w = d?.wallet, v = w?.tutV ?? 1; if (!w || v >= 3) return d;
  const m = TO_V3[v] ?? TO_V3[1], tut = typeof w.tut === 'number' && w.tut < m.length ? m[w.tut] : w.tut;
  return { ...d, wallet: { ...w, tut, tutV: 3 } };
}
