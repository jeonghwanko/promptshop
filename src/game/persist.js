// Saving my island and loading the board: one doc per owner in the board's collection.
// One tab writes an island at a time (lease.js): the newest tab takes over, the older one saves once more and watches.
import { GAP } from '../v2/isles.js';
import { ISLES_SEED } from '../../examples/isles-seed.js';
import { moveWithIsland, migrateLayout } from './migrate.js';
import { step, SETTLE_MS } from './lease.js';
import { S, db, user, me, BOARD, COL, now } from './state.js';
import { hooks, allPlots, rebuild } from './model.js';

/** This page's own mark: which tab holds the island. */
const WRITER = Math.random().toString(36).slice(2, 10);
/** Removed buildings of other owners (a board owner's demolish), kept in one doc of the board's collection. */
const MOD = '_mod';
let lease = { role: 'new', term: 0, claimSeen: false }, settleAt = 0, lastMine = null;
const myRef = () => db.doc(COL + '/' + me);
/** What a save writes: the island, never the lease fields (so a save and a claim cannot undo each other). */
const dataOf = (d) => ({ slot: d.slot, at: d.at, gap: d.gap, land: d.land ?? 0, plots: d.plots, half: d.half, wallet: d.wallet, rev: (d.rev ?? 0) + 1 });

let lastSave = 0;
/** Save my doc: at once with `force`, else at most every 5 s and only when something changed. Only the tab that holds the island saves. */
export async function save(force) {
  if (!db || !me || !S.myDoc || S.role !== 'live') return;
  if (!force && (!S.dirty || now() - lastSave < 5000)) return;
  S.dirty = false; lastSave = now();
  const data = dataOf(S.myDoc); S.myDoc.rev = data.rev;
  try { await myRef().update(data); } catch { S.dirty = true; }
}
/** My new island: written whole, held by this tab. */
export async function createMine(doc) {
  S.myDoc = doc; S.role = 'live'; lease = { role: 'live', term: 1, claimSeen: false };
  S.docs.set(me, doc); rebuild();
  try { await myRef().set({ ...doc, rev: 1, term: 1, by: WRITER }); } catch { S.dirty = true; }
}
/** Remove someone else's building (the board owner tidying up): a mark their own tab applies, so it never comes back. */
export async function removeOthers(p) {
  const ref = db.doc(COL + '/' + MOD), mark = { [p.key]: p.b.at };
  try { await ref.update(mark); } catch { const cur = await ref.get(); await ref.set({ ...(cur.data() ?? {}), ...mark }); }
}

async function resolveNames() { if (!user) return; const ids = [...S.owners.values()].filter(u => !u.startsWith('seed')); if (!ids.length) return; const ps = await user.profiles(ids); for (const id of ids) S.names[id] = ps[id]?.name || '친구'; }
// keep this board's summary on the world map up to date (friends, buildings, who)
let lastSummary = '';
function saveSummary() {
  if (!db || !me) return;
  const users = [...S.owners.values()], s = { n: S.owners.size, bld: allPlots().filter(p => p.b).length, users };
  const k = JSON.stringify(s); if (k === lastSummary) return; lastSummary = k;
  db.doc('boards/' + BOARD).update(s).catch(() => {});
}

/** The stored copy of my island, as this page keeps it. */
const adopt = (r) => ({ slot: r.slot, at: r.at, rev: r.rev ?? 0, land: r.land ?? 0, gap: r.gap, plots: r.plots ?? {}, half: r.half ?? {}, wallet: { ...(r.wallet ?? {}), coins: r.wallet?.coins ?? 0 } });
/** Act on the lease: what to write, and whether the stored copy replaces mine. */
function onMine(r, timedOut, onRefund) {
  const was = lease.role, o = step(lease, r, WRITER, timedOut); lease = o.st; S.role = lease.role;
  if (was === 'new') settleAt = performance.now();
  if (o.adopt) {
    S.myDoc = adopt(r);
    if (r._migrated) { S.myDoc.wallet.coins += r._refund; S.dirty = true; if (r._refund && was === 'new') onRefund(r._refund); }
    if (r.gap === GAP && r._gapMoved) S.dirty = true;
  }
  if (o.write === 'claim') myRef().update({ term: lease.term, by: WRITER }).catch(() => {});
  if (o.write === 'ack') {   // hand over: what this tab did since its last save goes with the answer
    const data = S.dirty && S.myDoc ? dataOf(S.myDoc) : {}; S.dirty = false;
    myRef().update({ ...data, ack: r.term ?? 0 }).catch(() => {});
    hooks.yielded();
  }
  if (o.write === 'flush' && S.dirty) save(true);
}
/** Buildings the board owner removed from my island: gone for good, once. */
function applyRemovals(marks) {
  if (S.role !== 'live' || !S.myDoc || !marks) return;
  let any = false; for (const [key, at] of Object.entries(marks)) if (S.myDoc.plots[key]?.b?.at === at) { const ps = { ...S.myDoc.plots }; delete ps[key]; S.myDoc.plots = ps; any = true; }
  if (any) { S.dirty = true; save(true); }
}

/** Start saving and loading. onError() when the board cannot be read; onRefund(coins) when older saved layouts were moved and refunded. */
export function initPersist({ onError, onRefund }) {
  setInterval(() => save(false), 2000);
  setInterval(saveSummary, 10000);
  // a new tab that hears nothing from the old one takes over after a while
  setInterval(() => { if (lease.role === 'settle' && lastMine && performance.now() - settleAt > SETTLE_MS) { onMine(lastMine, true, onRefund); rebuild(); } }, 500);
  if (db && BOARD !== 'main') db.doc('boards/' + BOARD).get().then(d => { S.boardName = d.data()?.name ?? ''; }).catch(() => {});
  if (!db) { S.role = 'live'; S.docs = new Map((BOARD === 'main' ? Object.entries(ISLES_SEED) : []).map(([u, d]) => [u, migrateLayout(moveWithIsland(d))])); rebuild(); return; }
  db.collection(COL).onSnapshot(snap => {
    S.docs = new Map(); let marks = null;
    for (const d of snap.docs) {
      if (d.id === MOD) { marks = d.data(); continue; }
      if (d.id.startsWith('_')) continue;
      const raw = d.data() ?? {}, doc = migrateLayout(moveWithIsland(raw));
      if (d.id === me && doc.gap === GAP && raw.gap !== GAP) doc._gapMoved = true;   // islands moved apart: save the new places
      S.docs.set(d.id, doc);
    }
    if (me && S.docs.has(me)) { lastMine = S.docs.get(me); onMine(lastMine, false, onRefund); applyRemovals(marks); }
    if (me && S.myDoc) S.docs.set(me, S.myDoc);
    rebuild(); resolveNames();
  }, onError);
}
