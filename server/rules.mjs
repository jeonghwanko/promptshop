// Who may read and write what. Every write from a browser passes through allowWrite(); the client is never trusted.
//   i / i-<board>/<uid>     one island per player: only its owner writes it. The first write needs a way in:
//                           the board's owner, an invite token for this board, or an open board. 'main' is a showcase.
//   i-<board>/_mod          removal marks: only the board's owner.
//   boards/<id>             created once by its owner; members may update the summary fields only.
//   log/<board>~<uid>       the funnel log: only its owner, update only.
export const MAX_DOC = 512 * 1024, MAX_LOG = 64 * 1024;
const SUMMARY = new Set(['n', 'bld', 'users']), BOARD_NEW = new Set(['name', 'lat', 'lng', 'owner', 'at', 'n', 'bld', 'users']);
const boardOf = (col) => col === 'i' ? 'main' : col.startsWith('i-') ? col.slice(2) : null;
export const readable = (col) => col === 'boards' || boardOf(col) !== null;

/** null when allowed, else why not. op: 'set' | 'update' | 'delete'. ctx: { store, uid, invite(board) → bool, useInvite(board) }. */
export function allowWrite(op, col, id, data, ctx) {
  const { store, uid } = ctx, size = data == null ? 0 : JSON.stringify(data).length;
  const board = boardOf(col);
  if (board !== null) {
    if (board === 'main') return 'the showcase is read-only';
    const meta = store.get('boards', board);
    if (!meta) return 'no such board';
    if (id === '_mod') return meta.owner === uid && op !== 'delete' && size <= MAX_LOG ? null : 'only the board owner removes buildings';
    if (id !== uid) return 'not your island';
    if (size > MAX_DOC) return 'too big';
    if (op === 'delete') return null;
    const cur = store.get(col, id);
    if (!cur) {   // moving in: a way in, and a free island
      if (op !== 'set') return 'no island yet';
      if (meta.owner !== uid && !meta.open && !ctx.invite(board)) return 'invite needed';
      const slot = data?.slot; if (!(slot >= 1 && slot <= 10)) return 'bad island';
      for (const [other, d] of Object.entries(store.all(col))) if (other !== uid && other !== '_mod' && d?.slot === slot) return 'island taken';
      if (meta.owner !== uid && !meta.open) ctx.useInvite(board);
    } else if (op === 'set' && data?.slot !== cur.slot) return 'cannot move to another island';
    else if (op === 'update' && 'slot' in (data ?? {}) && data.slot !== cur.slot) return 'cannot move to another island';
    return null;
  }
  if (col === 'boards') {
    const cur = store.get('boards', id);
    if (!/^[a-z0-9]{3,24}$/.test(id) || id === 'main') return 'bad board id';
    if (!cur) return op === 'set' && data?.owner === uid && Object.keys(data).every(k => BOARD_NEW.has(k)) && typeof data.name === 'string' && data.name.length <= 24 ? null : 'bad new board';
    if (op === 'update' && Object.keys(data ?? {}).every(k => SUMMARY.has(k))) return store.get('i-' + id, uid) || cur.owner === uid ? null : 'not a member';
    if (op === 'update' && cur.owner === uid && Object.keys(data ?? {}).every(k => SUMMARY.has(k) || k === 'name' || k === 'open')) return null;
    return 'not allowed';
  }
  if (col === 'log') return id.endsWith('~' + uid) && op !== 'delete' && size <= MAX_LOG ? null : 'not your log';
  return 'not allowed';
}
