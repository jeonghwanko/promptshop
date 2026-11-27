// The first session opens the screen one part at a time: at first only my island, the faces and the bar; each other part
// (a currency, a button, a number on the faces) shows when the guide reaches the moment it is first used, with a pop.
// Islands past the guide see everything. Which part opens at which guide step is the table below; nothing is saved.
import { S, SHOWCASE } from './state.js';
import { tutOn, picking } from './guide.js';

// the first guide step (TUT in guide.js) at which each part shows, and what it is on the page
const PARTS = {
  bar: { at: 1, el: '#bar' },                         // a face pressed: the bar comes up for it
  coins: { at: 3, el: '#coinb' },                     // built: the first coins (one thing at that moment)
  util: { at: 3, el: '#pmt' }, level: { at: 5, el: '#who' },   // power and water left: as the first building is connected; the island's level at the end
  rewards: { at: 5 }, counts: { at: 5 }, free: { at: 5 },   // the +15 and waiting guests on the faces, 마음대로
  world: { at: 6, el: '#d-world' }, home: { at: 6, el: '#d-home' },   // after the guide: my island, the world,
  auto: { at: 6, el: '#d-auto' }, zoom: { at: 6, el: '.hud.tr .zoomb' },   // furniture by itself, the zoom buttons
};
// before I have an island (choosing one, or only looking around) nothing but the map and 끼룩이 shows
const stepNow = () => (picking() || (SHOWCASE && !S.mySlot) ? -1 : S.mySlot && S.myDoc && tutOn() ? S.myDoc.wallet.tut ?? 0 : 99);
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
  document.body.dataset.tut = stepNow() >= 0 && stepNow() < 99 ? String(stepNow()) : '';   // the step itself, for what only one step hides
  was = now; return fresh;
}
