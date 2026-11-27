// Today's special guest of an archipelago, asked of Claude once a day per archipelago and kept in the store (col 'special',
// id `<board>:<day>`). It counts against the server's daily calls only, never a player's own five. When Claude cannot be
// asked (no calls left, an error, a bad answer) the fixed list stands in, so everyone on the board still sees the same guest.
import { stream, PER_DAY, today } from './claude.mjs';
import { fixedGuest, checkGuest, guestPrompt } from '../src/v2/special.js';

const pending = new Map();   // two players asking at once share one call

/** Claude's whole answer to a prompt, as text (the streaming call, collected). */
function ask(prompt) {
  return new Promise((done) => {
    let text = '';
    const res = { headersSent: false, destroyed: false, writableEnded: false, on() {}, writeHead() { this.headersSent = true; }, write(t) { text += t; }, end() { this.writableEnded = true; done(text); } };
    stream(prompt, res, null, () => {}).catch(() => done(text));
  });
}

export async function guestOf(store, board) {
  const day = today(), id = board + ':' + day, kept = store.get('special', id); if (kept) return kept;
  if (pending.has(id)) return pending.get(id);
  const p = (async () => {
    let guest = null;
    const sql = store.sql, used = sql.prepare(`SELECT COUNT(*) AS n FROM calls WHERE day = ?`).get(day).n;
    if (process.env.SAMPLE !== 'echo' && used < PER_DAY) {
      sql.prepare(`INSERT INTO calls (uid, day, kind, at) VALUES (?, ?, 'special', ?)`).run('special:' + board, day, Date.now());
      try { const t = await ask(guestPrompt(day)), m = t.match(/\{[\s\S]*\}/); guest = m ? checkGuest(JSON.parse(m[0]), day) : null; } catch { guest = null; }
    }
    guest ??= fixedGuest(board, day);
    store.set('special', id, guest); return guest;
  })().finally(() => pending.delete(id));
  pending.set(id, p); return p;
}
