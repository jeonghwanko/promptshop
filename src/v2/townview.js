// Drawing the town's walkers on the map: a few pixels each, a bubble with what they want, a crown on a VIP.
// The simulation that moves them is townsim.js; this file only reads them.
import { NEEDS } from './townsim.js';

// ---------- drawing ----------
const SHIRTS = ['#ef5a4a', '#3d9ee0', '#ffc94a', '#4fbf7a', '#a07ad0', '#ff9a62', '#fff8ea', '#3f5f84'];   // the island palette's accents: no near-black
const ICON = {
  food: (g, x, y) => { g.fillRect(x, y + 3, 7, 1); g.fillRect(x + 1, y + 4, 5, 2); g.fillRect(x + 2, y, 1, 3); g.fillRect(x + 4, y, 1, 3); },
  cafe: (g, x, y) => { g.fillRect(x + 1, y + 1, 4, 5); g.fillRect(x + 5, y + 2, 1, 2); g.fillRect(x, y + 6, 6, 1); },
  shop: (g, x, y) => { g.fillRect(x + 1, y + 2, 5, 5); g.fillRect(x + 2, y, 1, 2); g.fillRect(x + 4, y, 1, 2); g.fillRect(x + 2, y, 3, 1); },
  fun: (g, x, y) => { g.fillRect(x + 3, y, 1, 7); g.fillRect(x, y + 3, 7, 1); g.fillRect(x + 1, y + 1, 5, 5); },
  rest: (g, x, y) => { g.fillRect(x, y + 3, 7, 2); g.fillRect(x, y + 1, 1, 5); g.fillRect(x + 6, y + 4, 1, 2); g.fillRect(x + 1, y + 2, 2, 1); },
};
export function drawPerson(g, pr, p) {
  const [px, py] = pr.P(p.x + (p.dir === 'z' ? p.side : 0), p.z + (p.dir === 'x' ? p.side : 0));
  // the map's chunky pixels: every block is 2×2 and sits on the even grid, the figure stays about as tall as before
  const x = Math.round(px / 2) * 2, y = Math.round(py / 2) * 2, bob = p.wait > 0 || p.inQueue ? 0 : (Math.sin(p.t * 10) > 0 ? 2 : 0);
  g.fillStyle = 'rgba(23,63,120,.25)'; g.fillRect(x - 3, y, 6, 2);
  g.fillStyle = '#3f5f84'; g.fillRect(x - 2, y - 2, 2, 2); g.fillRect(x, y - 2, 2, 2);   // legs
  g.fillStyle = SHIRTS[p.shirt]; g.fillRect(x - 2, y - 6 - bob, 4, 4);
  g.fillStyle = '#f5cfa4'; g.fillRect(x - 2, y - 8 - bob, 4, 2);
  if (p.vip) { g.fillStyle = '#ffd23a'; g.fillRect(x - 2, y - 10 - bob, 4, 2); g.fillRect(x - 2, y - 12 - bob, 2, 2); g.fillRect(x, y - 12 - bob, 2, 2); }
  if (p.need && !p.inQueue) {           // speech bubble with what they want
    const bx = x - 5, by = y - 22 - bob;
    g.fillStyle = '#ffffff'; g.fillRect(bx, by, 11, 10); g.fillRect(bx + 4, by + 10, 2, 2);
    g.fillStyle = NEEDS[p.need].color; ICON[p.need](g, bx + 2, by + 2);
  } else if (p.mood === 2 && p.wait <= 0) { g.fillStyle = '#8b9a9c'; g.fillRect(x - 6, y - 14, 2, 2); g.fillRect(x - 1, y - 14, 2, 2); g.fillRect(x + 4, y - 14, 2, 2); }
}
export function drawNeedIcon(g, need, x, y) { g.fillStyle = NEEDS[need].color; ICON[need](g, x, y); }
