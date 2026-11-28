// My guests' words (2026-11-28): the line I wrote comes back. Claude writes, with the building, who loves the place and three
// short reviews about the very things in my line (steps.js 'guests'). Now and then a guest who has just paid says one of them
// over the shop's roof; the first one the moment the shop is finished. One bubble on the island at a time, and a shop waits
// a while before it speaks again. Shops built before this have no words of their own and stay quiet.
import { S } from './state.js';
import { allPlots } from './model.js';
import { toScreen } from './camera.js';
import { el } from './ui.js';

const SHOW_MS = 3400, GAP_MS = 6000, SHOP_GAP_MS = 15000, FIRST = 3;   // a shop's first few paying guests always speak (a new shop serves slowly: that is when its words matter)
let busyUntil = 0; const lastOf = new Map(), nextOf = new Map(), paidOf = new Map();
const wordsOf = (key) => allPlots().find(p => p.key === key)?.b?.input?.guests ?? null;

/** A guest of shop `key` paid: maybe say one of its reviews (not too often, one bubble at a time). */
export function guestPaid(key) {
  const n = (paidOf.get(key) ?? 0) + 1; paidOf.set(key, n);
  const t = performance.now(); if (document.hidden || t < busyUntil) return;
  if (n > FIRST && (t - (lastOf.get(key) ?? -1e9) < SHOP_GAP_MS || Math.random() > .35)) return;
  say(key);
}
/** Say the shop's next review now (the shop just finished: its first words). */
export function say(key) {
  const g = wordsOf(key); if (!g?.reviews?.length) return false;
  const i = nextOf.get(key) ?? 0, text = g.reviews[i % g.reviews.length]; nextOf.set(key, i + 1);
  const t = performance.now(); busyUntil = t + SHOW_MS + GAP_MS; lastOf.set(key, t);
  document.querySelector('.review')?.remove();
  const b = el('div', { class: 'review', role: 'status' }, el('span', { class: 'rs' }, '★★★★★'), el('span', { class: 'rt' }, text));
  document.body.append(b);
  const t0 = t, follow = () => {   // stays over the roof while the camera moves
    if (!b.isConnected) return; const tp = S.lastTops?.[key];
    if (tp) { const [x, y] = toScreen(tp[0], tp[1]); b.style.transform = `translate(${Math.round(x - b.offsetWidth / 2)}px, ${Math.round(y - b.offsetHeight - 26)}px)`; b.style.visibility = ''; }
    else b.style.visibility = 'hidden';
    if (performance.now() - t0 < SHOW_MS) requestAnimationFrame(follow); else { b.classList.add('out'); setTimeout(() => b.remove(), 300); }
  };
  b.style.visibility = 'hidden'; requestAnimationFrame(follow);
  return true;
}
/** For the shop window: who loves the place and what they said. */
export const guestsOf = wordsOf;
