// Who may read and write what. Every write from a browser passes through allowWrite(); the client is never trusted.
//   i / i-<board>/<uid>     one island per player: only its owner writes it. The first write needs a way in:
//                           the board's owner, an invite token for this board, or an open board. 'main' is a showcase.
//   i-<board>/_mod          removal marks: only the board's owner.
//   boards/<id>             created once by its owner; members may update the summary fields only.
//   log/<board>~<uid>       the funnel log: only its owner, update only.
import { bad } from '../src/game/rules.js';
// Sizes are of the doc as it will be stored (an update is merged first), so many small updates cannot grow a doc without end.
export const MAX_DOC = 128 * 1024, MAX_LOG = 8 * 1024, MAX_BOARD = 2 * 1024, BOARDS_PER_PLAYER = 10, MAX_BUILDINGS = 24;
const SUMMARY = new Set(['n', 'bld', 'users']), BOARD_NEW = new Set(['name', 'lat', 'lng', 'owner', 'at', 'n', 'bld', 'users']);
const ISLAND = new Set(['slot', 'at', 'gap', 'land', 'plots', 'half', 'wallet', 'rev', 'wb', 'hb', 'term', 'by', 'ack']);
const obj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
/** An island as every member's page reads it: one with a broken building would break the board for all of them. */
function islandBad(d) {
  if ('slot' in d && !(Number.isInteger(d.slot) && d.slot >= 1 && d.slot <= 10)) return 'bad island';
  for (const k of ['at', 'gap', 'hb', 'rev', 'term', 'ack']) if (k in d && d[k] !== null && !fin(d[k])) return 'bad ' + k;
  for (const k of ['by', 'wb']) if (k in d && d[k] !== null && !(typeof d[k] === 'string' && d[k].length <= 40)) return 'bad ' + k;
  if ('land' in d && !(Number.isInteger(d.land) && d.land >= 0 && d.land <= 4)) return 'bad land';
  for (const k of ['plots', 'half', 'wallet']) if (k in d && !obj(d[k])) return 'bad ' + k;
  if (d.plots) {
    const ps = Object.values(d.plots); if (ps.length > MAX_BUILDINGS) return 'too many buildings';
    for (const p of ps) if (!obj(p) || !fin(p.x) || !fin(p.z) || !['S', 'M', 'L'].includes(p.size) || ('b' in p && !(obj(p.b) && obj(p.b.input)))) return 'bad building';
  }
  return null;
}
/** A new board carries its summary from the start, so the world map never has to read its islands to count them. */
const SUMMARY_ALL = (b) => 'n' in b && 'bld' in b && 'users' in b;
const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
/** A board's fields, as the world map reads them: a bad one would break the map for everyone. */
function boardBad(b) {
  if (typeof b.name !== 'string' || !b.name.trim() || b.name.length > 24 || bad(b.name)) return 'bad board name';
  if (!num(b.lat, -90, 90) || !num(b.lng, -180, 180)) return 'bad place';
  if ('n' in b && !(Number.isInteger(b.n) && num(b.n, 0, 10))) return 'bad n';
  if ('bld' in b && !(Number.isInteger(b.bld) && num(b.bld, 0, 1000))) return 'bad bld';
  if ('users' in b && !(Array.isArray(b.users) && b.users.length <= 10 && b.users.every(u => typeof u === 'string' && u.length <= 40))) return 'bad users';
  if ('open' in b && typeof b.open !== 'boolean') return 'bad open';
  if (JSON.stringify(b).length > MAX_BOARD) return 'too big';
  return null;
}
const boardOf = (col) => col === 'i' ? 'main' : col.startsWith('i-') ? col.slice(2) : null;
export const readable = (col) => col === 'boards' || boardOf(col) !== null;

/** null when allowed, else why not. op: 'set' | 'update' | 'delete'. ctx: { store, uid, invite(board) → bool, useInvite(board) }. */
export function allowWrite(op, col, id, data, ctx) {
  const { store, uid } = ctx, board = boardOf(col);
  const before = op === 'update' ? store.get(col, id) : null, after = op === 'update' ? { ...(before ?? {}), ...data } : data;
  const size = after == null ? 0 : JSON.stringify(after).length;
  // over a limit, an update that does not make the doc bigger still goes through (a heartbeat, the lease, a save that removed things)
  const tooBig = (max) => size > max && !(op === 'update' && before && size <= JSON.stringify(before).length);
  if (board !== null) {
    if (board === 'main') return 'the showcase is read-only';
    const meta = store.get('boards', board);
    if (!meta) return 'no such board';
    if (id === '_mod') return meta.owner === uid && op !== 'delete' && !tooBig(MAX_LOG) ? null : 'only the board owner removes buildings';
    if (id !== uid) return 'not your island';
    if (tooBig(MAX_DOC)) return 'too big';
    if (op === 'delete') return null;
    if (!Object.keys(data ?? {}).every(k => ISLAND.has(k))) return 'unknown field';
    { const why = islandBad(after); if (why) return why; }
    const cur = store.get(col, id);
    if (!cur) {   // moving in: a way in, and a free island
      if (op !== 'set') return 'no island yet';
      if (meta.owner !== uid && !meta.open && !ctx.invite(board)) return 'invite needed';
      const slot = data?.slot; if (!(Number.isInteger(slot) && slot >= 1 && slot <= 10)) return 'bad island';
      for (const [other, d] of Object.entries(store.all(col))) if (other !== uid && other !== '_mod' && d?.slot === slot) return 'island taken';
      if (meta.owner !== uid && !meta.open) ctx.useInvite(board);
    } else if (op === 'set' && data?.slot !== cur.slot) return 'cannot move to another island';
    else if (op === 'update' && 'slot' in (data ?? {}) && data.slot !== cur.slot) return 'cannot move to another island';
    return null;
  }
  if (col === 'boards') {
    const cur = store.get('boards', id);
    if (!/^[a-z0-9]{3,24}$/.test(id) || id === 'main') return 'bad board id';
    if (!cur) {
      if (op !== 'set' || data?.owner !== uid || !Object.keys(data).every(k => BOARD_NEW.has(k)) || !SUMMARY_ALL(data)) return 'bad new board';
      const why = boardBad(data); if (why) return why;   // checked first: a refused name does not use up the day
      if (ctx.boardsOf(uid) >= BOARDS_PER_PLAYER) return 'too many boards';
      return ctx.spend('board') ? null : 'too many boards today';
    }
    if (op !== 'update') return 'not allowed';
    const keys = Object.keys(data ?? {});
    if (keys.every(k => SUMMARY.has(k))) { if (!store.get('i-' + id, uid) && cur.owner !== uid) return 'not a member'; }
    else if (!(cur.owner === uid && keys.every(k => SUMMARY.has(k) || k === 'name' || k === 'open'))) return 'not allowed';
    return boardBad(after);
  }
  if (col === 'log') {
    const m = /^([a-z0-9]{3,24})~(.+)$/.exec(id);
    if (!m || m[2] !== uid || op === 'delete' || tooBig(MAX_LOG)) return 'not your log';
    if (m[1] !== 'main' && !store.get('boards', m[1])) return 'no such board';
    return store.get('log', id) || ctx.spend('log') ? null : 'too many logs today';   // a fresh cookie is free: new logs are counted by address
  }
  return 'not allowed';
}
