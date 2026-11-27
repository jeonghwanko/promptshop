// The first session opens the screen one part at a time: at first only my island, the faces and the bar; each other part
// (a currency, a button, a number on the faces) shows when the guide reaches the moment it is first used, with a pop.
// Islands past the guide see everything. Which part opens at which guide step is the table below; nothing is saved.
import { S } from './state.js';
import { tutOn } from './guide.js';

// the first guide step (TUT in guide.js) at which each part shows, and what it is on the page
const PARTS = {
  permits: { at: 2, el: '#pmt' },                     // building: one 🎫 spent
  coins: { at: 3, el: '#coinb' },                     // built: the first +15 for an answered wish
  rewards: { at: 3 },                                 // the +15 under each face
  boat: { at: 3, el: '#boat' },                       // the first boat comes
  counts: { at: 4 },                                  // guests served: how many wait for each wish
  level: { at: 4, el: '#who' },                       // the level and "다음 🎫까지 손님 N명"
  world: { at: 5, el: '#d-world' }, home: { at: 5, el: '#d-home' },   // after the guide: my island, the world,
  auto: { at: 5, el: '#d-auto' }, zoom: { at: 5, el: '.hud.tr .zoomb' },   // furniture by itself, the zoom buttons
};
const stepNow = () => (S.mySlot && S.myDoc && tutOn() ? S.myDoc.wallet.tut ?? 0 : 99);
/** Is this part of the screen open yet? */
export const opened = (part) => stepNow() >= (PARTS[part]?.at ?? 0);

let was = null;   // what was open at the last look: a part that opens now pops once
/** Put the screen in step with the guide (called with the HUD, twice a second). Returns the parts that just opened. */
export function applyReveal() {
  const now = {}, fresh = [];
  for (const [part, p] of Object.entries(PARTS)) {
    now[part] = opened(part); document.body.classList.toggle('hide-' + part, !now[part]);
    if (was && now[part] && !was[part]) { fresh.push(part); const e = p.el && document.querySelector(p.el); if (e) { e.classList.remove('newly'); void e.offsetWidth; e.classList.add('newly'); setTimeout(() => e.classList.remove('newly'), 1600); } }
  }
  was = now; return fresh;
}
