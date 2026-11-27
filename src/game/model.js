// What the saved islands mean right now: plots, their fixtures and rates, my wallet's level, power and water use,
// and rebuild(), which turns the saved docs into the map, the roads and the walkers' buildings. No DOM.
import { SLOTS, centerOf, neighbours, bridgeId, makeIsles, PLOT, drawIsles, slotAt, setLand, dockOf } from '../v2/isles.js';
import { buildSection } from '../v2/interior.js';
import { roleOf } from '../v2/townsim.js';
import { normalize } from '../v2/spec.js';
import { startingFixtures } from '../v2/insideview.js';
import { shopRates, starsOf, setOwnedFixtures } from '../v2/inside.js';
import { START_STOCK, BASE_COIN, maxPlots as maxPlotsOf, LEVELS, levelOf, boatPlanOf, UTIL, fixUse, supplyOf } from './rules.js';
import { S, me, pr, sim } from './state.js';

/** What the screens do when the model says something: set once by main.js, so this file needs no screen. */
export const hooks = {
  celebrate: (title, sub) => {},
  /** The map was rebuilt from the docs; oldGround is the islands as drawn before. */
  rebuilt: (oldGround) => {},
  /** The first-visit guide is running (with `inside`: or the inside-a-shop guide). Nothing pops up on its own then. */
  guiding: (inside) => false,
  /** Something the guide waits for happened ('coin', …). */
  happened: (name) => {},
  /** A plot of mine changed outside its screen (supplies, furniture coming in by itself). */
  plotChanged: (key) => {},
  /** Another tab took my island over: this one only watches now. */
  yielded: () => {},
  /** This tab holds my island now (after waiting for another tab). */
  live: () => {},
};

export const nameOf = (uid) => uid?.startsWith('seed') ? (S.docs.get(uid)?.name ?? '예시 친구') : uid === me ? '나' : (S.names[uid] || '친구');
/** How many buildings my island may have now. */
export const maxPlots = () => maxPlotsOf(S.myDoc?.land ?? 0);

// ---------- plots ----------
/** Every plot on the board, with its key, owner and slot. */
export function allPlots() { const out = []; for (const [s, uid] of S.owners) { const d = S.docs.get(uid); for (const [key, p] of Object.entries(d?.plots ?? {})) out.push({ ...p, key, owner: uid, slot: s }); } return out; }
const fxCache = new Map();
export function fixturesOf(p) { const k = p.key + ':' + p.b.at; if (!fxCache.has(k)) { let f = []; try { f = buildSection(normalize(p.b.input)).fixtures; } catch {} fxCache.set(k, f); } return fxCache.get(k); }
/** Bought fixtures of a plot: a list of indices (older plots kept a count of the first n). */
export function ownedOf(p) {
  const d = p.owner === me && S.myDoc?.plots[p.key] ? S.myDoc.plots[p.key] : p;
  if (Array.isArray(d.own)) return new Set(d.own);
  if (d.fx === undefined) return new Set(startingFixtures(fixturesOf(p), p.b.input.order));   // never furnished: a counter and a table
  return new Set(Array.from({ length: Math.min(fixturesOf(p).length, d.fx ?? 1) }, (_, i) => i));
}
export const helpersOf = (p) => (p.owner === me && S.myDoc?.plots[p.key] ? S.myDoc.plots[p.key].helpers : p.helpers) ?? 0;
export const levelsOf = (p) => (p.owner === me && S.myDoc?.plots[p.key] ? (S.myDoc.plots[p.key].lv ??= {}) : p.lv) ?? {};
export const starsInfo = (p) => starsOf(fixturesOf(p), ownedOf(p), levelsOf(p));
export const starText = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
export const ratesOf = (p) => shopRates(fixturesOf(p), ownedOf(p), (BASE_COIN[p.size] ?? 1) + (p.look ?? 0), helpersOf(p), levelsOf(p));   // each front tier: a coin more a guest
/** The plot's kind of guest, or undefined for a building that serves nobody. */
export const servesOf = (p) => { const n = normalize(p.b.input); return roleOf(n.type, n.levels).serves; };
/** Tiles under any building (and every island's power plant and water tank), except the ones under the buildings named in `skip`. */
export function takenSet(...skip) { const t = new Set(); for (const p of allPlots()) if (!skip.includes(p.key)) for (let i = p.x; i < p.x + PLOT[p.size]; i++) for (let k = p.z; k < p.z + PLOT[p.size]; k++) t.add(i + ',' + k);
  for (const s of S.owners?.keys() ?? []) for (const [x, z] of plantTiles(s)) t.add(x + ',' + z);
  return t; }
/** The tiles of an island right now. */
export function tilesOf(slot) { const [cx, cz] = centerOf(slot), out = []; for (let z = cz - 14; z <= cz + 14; z++) for (let x = cx - 14; x <= cx + 14; x++) if (slotAt(x, z) === slot) out.push([x, z]); return out; }
/** The open shops of an island that still have stock (and power and water: a shop cut off for an unpaid bill is closed). */
export function islandShops(slot) { return allPlots().filter(p => p.slot === slot && p.b && servesOf(p) && !isOff(p) && (p.owner === me ? (S.myDoc.plots[p.key]?.stock ?? START_STOCK) : (p.stock ?? START_STOCK)) > 0); }
/** How often a boat comes to an island and how many it brings. */
export function boatPlan(slot) { const shops = islandShops(slot); return boatPlanOf(shops.length, shops.reduce((t, p) => t + ownedOf(p).size, 0)); }

// ---------- my wallet: guests served raise the island's level ----------
/** My wallet (served counted from 0 on a new island). */
export function G() { const w = S.myDoc.wallet; w.served ??= 0; return w; }
export function countGuest() {
  const w = G(), lv0 = levelOf(w.served ?? 0); w.served = (w.served ?? 0) + 1; S.dirty = true;
  const lv = levelOf(w.served); if (lv > lv0) hooks.tracked?.('level', { lv }); if (lv > lv0) setTimeout(() => hooks.celebrate(`${LEVELS[lv].name}로 성장!`, lv < 3 ? `이제 ${LEVELS[lv].size} 크기 건물을 지을 수 있어요` : `섬이 ${LEVELS[lv].name}가 됐어요`), 1600);
}

// ---------- power and water ----------
/** What a building uses: [power, water] — its size, the floors added since, and the machines bought in it. */
export function useOf(p) {
  const b = UTIL.base[p.size] ?? UTIL.base.S, ext = p.b?.ext?.length ?? 0, out = [b[0] + UTIL.floor[0] * ext, b[1] + UTIL.floor[1] * ext];
  if (!p.b) return out;
  const fx = fixturesOf(p), lv = levelsOf(p), first = startOf(p);   // what came with the building is part of its own one lamp
  for (const i of ownedOf(p)) { const u = fixUse(fx[i]?.kind, lv[i]), u1 = first.has(i) ? fixUse(fx[i]?.kind, 1) : [0, 0]; out[0] += u[0] - u1[0]; out[1] += u[1] - u1[1]; }   // what came with it: only its levels count
  return out;
}
const startCache = new Map();
const startOf = (p) => { const k = p.key + ':' + p.b.at; if (!startCache.has(k)) startCache.set(k, new Set(startingFixtures(fixturesOf(p), p.b.input.order))); return startCache.get(k); };
/** My buildings, oldest first (the order the bill is paid in). */
export const myPlots = () => allPlots().filter(p => p.owner === me && p.b).sort((a, b) => (a.b.at0 ?? a.b.at ?? 0) - (b.b.at0 ?? b.b.at ?? 0));   // at0: when it was first built (a floor added later moves at)
/** What my island uses now. */
export function myUse() { const u = [0, 0]; for (const p of myPlots()) { const x = useOf(p); u[0] += x[0]; u[1] += x[1]; } return u; }
/** What my island supplies now. An island from before power and water starts with just enough for what it already has. */
export function mySupply() {
  const w = S.myDoc?.wallet;
  if (w && !w.ups) { const u = myUse(), ups = [0, 0]; for (const k of [0, 1]) { while (supplyOf(ups)[k] < u[k]) ups[k]++; if (u[k]) ups[k]++; } w.ups = ups; S.dirty = true; }   // (one step to spare: not stopped at the very next build)
  return supplyOf(w?.ups);
}
/** Water comes later: the tank arrives by boat when the island reaches its second level (동네); until then nothing runs short of it. */
export const waterOn = (slot = S.mySlot) => { const uid = S.owners.get(slot), w = uid === me ? S.myDoc?.wallet : S.docs.get(uid)?.wallet; return !!w?.water || (uid !== me && levelOf(w?.served ?? 0) >= 1); };   // mine: once the tank has come (utility.js)
/** Which of power (0) and water (1) would run short if my island used `d` more; -1: both fit. */
export function shortOf(d) { const u = myUse(), s = mySupply(); return u[0] + d[0] > s[0] ? 0 : waterOn() && u[1] + d[1] > s[1] ? 1 : -1; }
/** Where an island's power plant (0) and water tank (1) stand: on the shore either side of the road from its pier
 *  (in the water by the pier when that shore is land a building already stands on, or not land at all). */
const plantMemo = new Map();
export function plantTiles(slot) {
  const m = plantMemo.get(slot), t = performance.now(); if (m && m.world === S.world && t - m.t < 500) return m.v;
  const v = plantTilesNow(slot); plantMemo.set(slot, { v, world: S.world, t }); return v;
}
function plantTilesNow(slot) {
  const d = dockOf(slot), [cx, rz] = d.road, built = new Set();
  for (const p of allPlots()) if (p.slot === slot) for (let i = p.x; i < p.x + PLOT[p.size]; i++) for (let k = p.z; k < p.z + PLOT[p.size]; k++) built.add(i + ',' + k);
  const ok = (x) => slotAt(x, rz) === slot && !built.has(x + ',' + rz);
  return [ok(cx + 1) ? [cx + 1, rz] : [d.pier[1][0] + 1, d.pier[1][1]], ok(cx - 1) ? [cx - 1, rz] : [d.pier[0][0] + 1, d.pier[0][1]]];
}
/** What an island uses and supplies (anyone's: the map draws every island's plant and tank). */
const useMemo = new Map();
export function slotUse(slot) { const m = useMemo.get(slot), t = performance.now(); if (m && t - m.t < 200) return m.v; const v = slotUseNow(slot); useMemo.set(slot, { v, t }); return v; }   // (drawing only: buying asks myUse)
function slotUseNow(slot) { const u = [0, 0]; for (const p of allPlots()) if (p.slot === slot && p.b) { const x = useOf(p); u[0] += x[0]; u[1] += x[1]; } return u; }
export const slotSupply = (slot) => S.owners.get(slot) === me ? mySupply() : supplyOf(S.docs.get(S.owners.get(slot))?.wallet?.ups);
/** Cut off for an unpaid bill: dark, closed to guests. */
export const isOff = (p) => !!(p.owner === me ? S.myDoc?.wallet?.off : S.docs.get(p.owner)?.wallet?.off)?.includes(p.key);
/** The road tiles from an island's pier to a door (the way cable and pipe are laid), or null. */
const pathMemo = { world: null, m: new Map() };
export function roadPath(from, to) {
  if (!from || !to) return null; if (pathMemo.world !== S.world) { pathMemo.world = S.world; pathMemo.m.clear(); }
  const pk = from.join() + '|' + to.join(); if (!pathMemo.m.has(pk)) pathMemo.m.set(pk, roadPathNow(from, to)); return pathMemo.m.get(pk);
}
function roadPathNow(from, to) {
  const isRoad = S.world?.isRoad; if (!isRoad) return null;
  const k = (x, z) => x + ',' + z, prev = new Map([[k(...from), null]]), q = [from];
  while (q.length) { const [x, z] = q.shift(); if (x === to[0] && z === to[1]) { const out = []; for (let c = k(x, z); c; c = prev.get(c)) out.unshift(c.split(',').map(Number)); return out; }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz, nk = k(nx, nz); if (prev.has(nk) || !isRoad(nx, nz)) continue; prev.set(nk, k(x, z)); q.push([nx, nz]); } }
  return null;
}

// ---------- the docs → the map ----------
let roadSig = null;
export function rebuild() {
  const owners = S.owners = new Map();
  for (const [uid, d] of [...S.docs].sort((a, b) => (a[1].at ?? 0) - (b[1].at ?? 0))) if (d.slot >= 1 && d.slot <= SLOTS && !owners.has(d.slot)) owners.set(d.slot, uid);
  S.mySlot = 0; for (const [s, u] of owners) if (u === me) S.mySlot = s;
  for (const [sl, uid] of owners) setLand(sl, S.docs.get(uid)?.land ?? 0);   // widened islands
  const joined = new Set(owners.keys()), bridges = new Map();
  for (const s of joined) for (const n of neighbours(s)) if (n > s && joined.has(n)) {
    const da = S.docs.get(owners.get(s)), dbb = S.docs.get(owners.get(n));
    bridges.set(bridgeId(s, n), { a: !!da?.half?.[n], b: !!dbb?.half?.[s] });
  }
  const world = S.world = makeIsles(joined, bridges), oldGround = S.ground;
  const all = allPlots();
  setOwnedFixtures(all.filter(p => p.owner === me && p.b).reduce((n, p) => n + ownedOf(p).size, 0) - (S.myDoc?.wallet?.fxBase ?? 0));   // prices grow with what my island already has (inside.js)
  const avoid = new Set(); for (const sl of joined) for (const t of plantTiles(sl)) if (t) avoid.add(t[0] + ',' + t[1]);   // no trees where power and water stand
  const lots = takenSet(), b = S.building; if (b) for (let i = b.x; i < b.x + PLOT[b.size]; i++) for (let k = b.z; k < b.z + PLOT[b.size]; k++) lots.add(i + ',' + k);   // the site being built shows as a cleared lot (for the picture only: placing still checks takenSet)
  S.ground = drawIsles(world, pr, { taken: lots, avoid });
  // reset the walkers only when the road network changes (an island joined, a bridge finished)
  const sig = [...joined].sort((a, b) => a - b).join(',') + '|' + [...bridges].filter(([, h]) => h.a && h.b).map(([id]) => id).sort().join(',');
  if (sig !== roadSig) { roadSig = sig; sim.setArea({ w: world.w, d: world.d, isRoad: world.isRoad, lots: [] }); } else sim.A = { ...sim.A, isRoad: world.isRoad };
  const built = new Map(); for (const p of all) if (p.b) { const n = normalize(p.b.input), w = PLOT[p.size]; built.set(p.key, { type: n.type, levels: n.levels, owner: p.owner, stock: isOff(p) ? 0 : p.stock ?? START_STOCK, rates: ratesOf(p), watched: S.watching?.key === p.key, lot: { id: p.key, size: p.size, x: p.x, z: p.z, w, d: w, door: p.door } }); }
  sim.setBuildings(built);

  hooks.rebuilt(oldGround);
}
