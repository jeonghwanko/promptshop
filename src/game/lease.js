// One writer per island. The newest tab claims the island by raising `term` on the doc; the tab that held it saves
// once more (answering with `ack`) and becomes a viewer. Nothing is merged: whoever holds the island is the only one
// who writes it, so neither tab loses what the other did. Pure: no DOM, no clock (the caller says when time is up).

/** How long a new tab waits for the old one's last save before it takes over anyway (ms). */
export const SETTLE_MS = 5000;

/**
 * The page's role after seeing its stored doc `r` (or after a tick, with the last `r` it saw).
 * st: { role: 'new' | 'settle' | 'live' | 'idle', term, claimSeen }. me: this tab's mark.
 * Returns the next st, whether to take the stored copy (adopt), and what to write: 'claim' | 'ack' | 'flush' | null.
 */
export function step(st, r, me, timedOut = false) {
  const term = r.term ?? 0;
  if (st.role === 'new') {   // first sight: take what is stored and claim the next term; nobody held it → play at once
    return { st: { role: r.by ? 'settle' : 'live', term: term + 1, claimSeen: false }, adopt: true, write: 'claim' };
  }
  if (st.role === 'idle') return { st, adopt: true, write: null };
  // someone newer claimed the island (or the same term, and the store kept their claim): save once more, then watch
  if (term > st.term || (term === st.term && r.by && r.by !== me)) return { st: { ...st, role: 'idle' }, adopt: false, write: 'ack' };
  if (st.role === 'settle') {   // take each save of the old holder; play once it answers, or when it never does
    if (r.ack === st.term || timedOut) return { st: { ...st, role: 'live' }, adopt: true, write: 'flush' };
    return { st, adopt: true, write: null };
  }
  // live: never take the stored copy of my own island; claim again if an old page wrote over my claim
  const claimSeen = st.claimSeen || (term === st.term && r.by === me);
  return { st: { ...st, claimSeen }, adopt: false, write: claimSeen && term < st.term ? 'claim' : null };
}
