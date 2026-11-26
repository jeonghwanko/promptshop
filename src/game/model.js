// What the saved islands mean right now: plots, their fixtures and rates, my wallet's permits and level,
// and rebuild(), which turns the saved docs into the map, the roads and the walkers' buildings. No DOM.
import { SLOTS, centerOf, neighbours, bridgeId, makeIsles, PLOT, drawIsles, slotAt, setLand } from '../v2/isles.js';
import { buildSection } from '../v2/interior.js';
import { roleOf } from '../v2/townsim.js';
import { normalize } from '../v2/spec.js';
import { startingFixtures } from '../v2/insideview.js';
import { shopRates, starsOf } from '../v2/inside.js';
import { START_STOCK, BASE_COIN, maxPlots as maxPlotsOf, LEVELS, levelOf, payPermits, boatPlanOf } from './rules.js';
import { S, me, pr, sim } from './state.js';

/** What the screens do when the model says something: set once by main.js, so this file needs no screen. */
export const hooks = {
  celebrate: (title, sub) => {},
  rebuilt: () => {},
  /** The first-visit guide is running (with `inside`: or the inside-a-shop guide). Nothing pops up on its own then. */
  guiding: (inside) => false,
  /** Something the guide waits for happened ('coin', …). */
  happened: (name) => {},
  /** A plot of mine changed outside its screen (supplies, furniture coming in by itself). */
  plotChanged: (key) => {},
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
export const ratesOf = (p) => shopRates(fixturesOf(p), ownedOf(p), BASE_COIN[p.size] ?? 1, helpersOf(p), levelsOf(p));
/** The plot's kind of guest, or undefined for a building that serves nobody. */
export const servesOf = (p) => { const n = normalize(p.b.input); return roleOf(n.type, n.levels).serves; };
/** Tiles under any building, except the ones under the buildings named in `skip`. */
export function takenSet(...skip) { const t = new Set(); for (const p of allPlots()) if (!skip.includes(p.key)) for (let i = p.x; i < p.x + PLOT[p.size]; i++) for (let k = p.z; k < p.z + PLOT[p.size]; k++) t.add(i + ',' + k); return t; }
/** The tiles of an island right now. */
export function tilesOf(slot) { const [cx, cz] = centerOf(slot), out = []; for (let z = cz - 14; z <= cz + 14; z++) for (let x = cx - 14; x <= cx + 14; x++) if (slotAt(x, z) === slot) out.push([x, z]); return out; }
/** The open shops of an island that still have stock. */
export function islandShops(slot) { return allPlots().filter(p => p.slot === slot && p.b && servesOf(p) && (p.owner === me ? (S.myDoc.plots[p.key]?.stock ?? START_STOCK) : (p.stock ?? START_STOCK)) > 0); }
/** How often a boat comes to an island and how many it brings. */
export function boatPlan(slot) { const shops = islandShops(slot); return boatPlanOf(shops.length, shops.reduce((t, p) => t + ownedOf(p).size, 0)); }

// ---------- my wallet: guests served fill the permit gauge and raise the island's level ----------
/** My wallet, with the permit gauge paid out when it is full. */
export function G() { const w = S.myDoc.wallet, got = payPermits(w);
  if (got) { S.dirty = true; setTimeout(() => hooks.celebrate(`🎫 허가증 +${got}`, ''), 0); }
  return w; }
export function countGuest() {
  const w = G(), lv0 = levelOf(w.served); w.served++; S.dirty = true;
  G();   // pays out a permit when the gauge is full
  const lv = levelOf(w.served); if (lv > lv0) setTimeout(() => hooks.celebrate(`${LEVELS[lv].name}(으)로 성장!`, lv < 3 ? `이제 ${LEVELS[lv].size} 크기 건물을 지을 수 있어요` : '섬이 번화가가 됐어요'), 1600);
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
  const world = S.world = makeIsles(joined, bridges);
  const all = allPlots();
  S.ground = drawIsles(world, pr, { taken: takenSet(), mine: S.mySlot });
  // reset the walkers only when the road network changes (an island joined, a bridge finished)
  const sig = [...joined].sort((a, b) => a - b).join(',') + '|' + [...bridges].filter(([, h]) => h.a && h.b).map(([id]) => id).sort().join(',');
  if (sig !== roadSig) { roadSig = sig; sim.setArea({ w: world.w, d: world.d, isRoad: world.isRoad, lots: [] }); } else sim.A = { ...sim.A, isRoad: world.isRoad };
  const built = new Map(); for (const p of all) if (p.b) { const n = normalize(p.b.input), w = PLOT[p.size]; built.set(p.key, { type: n.type, levels: n.levels, owner: p.owner, stock: p.stock ?? START_STOCK, rates: ratesOf(p), watched: S.watching?.key === p.key, lot: { id: p.key, size: p.size, x: p.x, z: p.z, w, d: w, door: p.door } }); }
  sim.setBuildings(built);

  hooks.rebuilt();
}
