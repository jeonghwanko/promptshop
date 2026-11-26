// Saving my island and loading the board: one doc per owner in the board's collection, numbered by `rev`.
import { GAP } from '../v2/isles.js';
import { ISLES_SEED } from '../../examples/isles-seed.js';
import { moveWithIsland, migrateLayout } from './migrate.js';
import { S, db, user, me, BOARD, COL, now } from './state.js';
import { allPlots, rebuild } from './model.js';

let lastSave = 0;
/** Save my doc: at once with `force`, else at most every 5 s and only when something changed. */
export async function save(force) {
  if (!db || !me || !S.myDoc) return;
  if (!force && (!S.dirty || now() - lastSave < 5000)) return;
  S.dirty = false; lastSave = now();
  S.myDoc.rev = (S.myDoc.rev ?? 0) + 1;   // each save is numbered, so an older copy never replaces a newer one
  try { await db.doc(COL + '/' + me).set(S.myDoc); } catch { S.dirty = true; }
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

/**
 * Start saving and loading. onLoaded() runs after the first load without a database;
 * onError() when the board cannot be read; onRefund(coins) when older saved layouts were moved and refunded.
 */
export function initPersist({ onError, onRefund }) {
  setInterval(() => save(false), 2000);
  setInterval(saveSummary, 10000);
  if (db && BOARD !== 'main') db.doc('boards/' + BOARD).get().then(d => { S.boardName = d.data()?.name ?? ''; }).catch(() => {});
  if (!db) { S.docs = new Map((BOARD === 'main' ? Object.entries(ISLES_SEED) : []).map(([u, d]) => [u, migrateLayout(moveWithIsland(d))])); rebuild(); return; }
  db.collection(COL).onSnapshot(snap => {
    S.docs = new Map();
    for (const d of snap.docs) S.docs.set(d.id, migrateLayout(moveWithIsland(d.data() ?? {})));
    // my own doc: take the stored copy only when it is newer than what this page holds (another tab, or an edit from outside)
    if (me && S.docs.has(me)) { const remote = S.docs.get(me);
      if (!S.myDoc || (remote.rev ?? 0) > (S.myDoc.rev ?? 0)) S.myDoc = { slot: remote.slot, at: remote.at, rev: remote.rev ?? 0, land: remote.land ?? 0, gap: remote.gap, plots: remote.plots ?? {}, half: remote.half ?? {}, wallet: { ...(remote.wallet ?? {}), coins: remote.wallet?.coins ?? 0 } };
      if (remote._migrated && S.myDoc.plots === remote.plots) { S.myDoc.wallet.coins += remote._refund; S.dirty = true; save(true); if (remote._refund) onRefund(remote._refund); }
      S.docs.set(me, S.myDoc); if (remote.gap === GAP && snap.docs.find(x => x.id === me)?.data()?.gap !== GAP) { S.dirty = true; save(true); } }
    else if (me && S.myDoc) S.docs.set(me, S.myDoc);
    rebuild(); resolveNames();
  }, onError);
}
