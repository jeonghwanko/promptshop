// One writer per island. The newest tab claims the island by raising `term` on the doc; the tab that held it saves
// once more (answering with `ack`) and becomes a viewer. Nothing is merged: whoever holds the island is the only one
// who writes it, so neither tab loses what the other did. Pure: no DOM, no clock (the caller says what time tells).

/** How long a new tab waits for the old one's last save before it takes over anyway (ms). */
export const SETTLE_MS = 5000;
/** A holder that has not saved for this long is taken to be gone (ms). It saves at least every HEARTBEAT_MS. */
export const STALE_MS = 15000, HEARTBEAT_MS = 8000;

/**
 * The page's role after seeing its stored doc `r` (or after a tick, with the last `r` it saw).
 * st: { role: 'new' | 'settle' | 'live' | 'idle', term }. me: this tab's mark.
 * ctx.timedOut: the wait for the old holder is over. ctx.holderAlive: r.by is set and saved lately.
 * Returns the next st, whether to take the stored copy (adopt), and what to write: 'claim' | 'ack' | 'flush' | null.
 */
export function step(st, r, me, { timedOut = false, holderAlive = !!r.by } = {}) {
  const term = r.term ?? 0;
  if (st.role === 'new') {   // first sight: take what is stored and claim the next term; nobody holds it → play at once
    return { st: { role: holderAlive ? 'settle' : 'live', term: term + 1 }, adopt: true, write: 'claim' };
  }
  if (st.role === 'idle') return { st, adopt: true, write: null };
  // a newer claim: save once more, then watch
  if (term > st.term) return { st: { ...st, role: 'idle' }, adopt: false, write: 'ack' };
  // two tabs claimed the same term: the lower mark keeps it (both tabs work out the same answer); it writes its claim
  // again until the store shows it, and the other hands over as soon as it sees the lower mark
  if (term === st.term && r.by && r.by !== me) {
    if (r.by < me) return { st: { ...st, role: 'idle' }, adopt: false, write: 'ack' };
    return { st, adopt: st.role === 'settle', write: 'claim' };
  }
  if (st.role === 'settle') {   // take each save of the old holder; play once it answers, or when it never does
    if (r.ack === st.term || timedOut) return { st: { ...st, role: 'live' }, adopt: true, write: 'flush' };
    return { st, adopt: true, write: null };
  }
  // live: never take the stored copy of my own island; claim again if my claim was written over
  // (an older page saving the whole doc, or my own release before a reload that did not happen)
  return { st, adopt: false, write: term < st.term || (term === st.term && !r.by) ? 'claim' : null };
}
