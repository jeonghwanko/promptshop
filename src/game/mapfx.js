// Things drawn over the island map: a building site, the festival boat, the ordinary boats.
// Each takes the canvas context and the map projection, and draws what it is given; the game state stays in main.js.
import { PLOT } from '../v2/isles.js';

/** The building site's own state: its sparks and dust, a finished build's dust burst (done), the staked spot before building (pending). */
export const site = { parts: [], t: 0, done: null, pending: null, dt: 0, step(dt) { this.dt = dt; this.t += dt; } };

/** Draw the building site's back half (behind the building) or front half; building: the plot being built, or null. */
export function drawSite(g, pr, half, building) {
  if (half === 'front' && site.pending && !building) { const q = site.pending, m = PLOT[q.size], C0 = [pr.P(q.x, q.z), pr.P(q.x + m, q.z), pr.P(q.x + m, q.z + m), pr.P(q.x, q.z + m)], pul = .6 + .4 * Math.sin(site.t * 5);
    g.strokeStyle = `rgba(255,207,63,${pul})`; g.lineWidth = 2; g.beginPath(); C0.forEach(([a, c], i) => i ? g.lineTo(a, c) : g.moveTo(a, c)); g.closePath(); g.stroke();
    const [mx, my] = pr.P(q.x + m / 2, q.z + m / 2); g.fillStyle = '#5b3a22'; g.fillRect(Math.round(mx) - 1, Math.round(my) - 22, 3, 22); g.fillStyle = '#c08a4a'; g.fillRect(Math.round(mx) - 9, Math.round(my) - 30, 19, 11); g.fillStyle = '#2e241a'; g.fillRect(Math.round(mx) - 9, Math.round(my) - 30, 19, 1); g.fillRect(Math.round(mx) - 9, Math.round(my) - 20, 19, 1); }
  const b = building ?? site.done; if (!b) return; const dt = site.dt, P = (x, z) => pr.P(x, z);
  const n = PLOT[b.size], x0 = b.x, z0 = b.z, C = [P(x0, z0), P(x0 + n, z0), P(x0 + n, z0 + n), P(x0, z0 + n)], H = 26 + n * 10;   // C[0] back, C[2] front
  const line = (a, c, col, w) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(Math.round(a[0]) + .5, Math.round(a[1]) + .5); g.lineTo(Math.round(c[0]) + .5, Math.round(c[1]) + .5); g.stroke(); };
  const tape = (a, c) => { const m = 10; for (let i = 0; i < m; i++) line([a[0] + (c[0] - a[0]) * i / m, a[1] + (c[1] - a[1]) * i / m - 4], [a[0] + (c[0] - a[0]) * (i + 1) / m, a[1] + (c[1] - a[1]) * (i + 1) / m - 4], i % 2 ? '#2e241a' : '#ffcf3f', 2); };
  if (half === 'back') {
    if (!building) return;
    // a tower crane on the back corner, its jib turning a little, a load swinging on the hook
    const base = C[0], mast = H + 40, top = [base[0], base[1] - mast], sw = Math.sin(site.t * .7) * 14, tip = [top[0] + 34 + sw, top[1] + 6], back = [top[0] - 18 - sw * .4, top[1] - 2];
    line(base, top, '#2e241a', 4); line(base, top, '#ffcf3f', 2);
    for (let y = 8; y < mast; y += 8) line([base[0] - 1, base[1] - y], [base[0] + 1, base[1] - y + 6], '#b58a10', 1);
    line(back, tip, '#2e241a', 4); line(back, tip, '#ffcf3f', 2); g.fillStyle = '#5b5f66'; g.fillRect(Math.round(back[0]) - 3, Math.round(back[1]) - 1, 6, 5);
    const hook = [tip[0] - 6, tip[1] + 18 + Math.sin(site.t * 2) * 3]; line([tip[0] - 6, tip[1]], hook, '#2e241a', 1); g.fillStyle = '#c08a4a'; g.fillRect(Math.round(hook[0]) - 4, Math.round(hook[1]), 8, 4);
    // back poles, the planks between them, the back fence
    for (const c of [C[0], C[1], C[3]]) line(c, [c[0], c[1] - H], 'rgba(58,42,28,.9)', 2);
    for (const f of [.45, .9]) for (const [a, c] of [[C[3], C[0]], [C[0], C[1]]]) line([a[0], a[1] - H * f], [c[0], c[1] - H * f], '#c08a4a', 2);
    tape(C[3], C[0]); tape(C[0], C[1]);
    return;
  }
  if (building) {
    line(C[2], [C[2][0], C[2][1] - H], 'rgba(58,42,28,.9)', 2);
    tape(C[1], C[2]); tape(C[2], C[3]);
    if (Math.random() < dt * 8) { const c = C[Math.floor(Math.random() * 4)]; for (let i = 0; i < 5; i++) site.parts.push({ x: c[0] + (Math.random() - .5) * 20, y: c[1] - H * (.3 + Math.random() * .6), vx: (Math.random() - .5) * 50, vy: -20 - Math.random() * 30, t: 0, spark: true }); }
    if (Math.random() < dt * 4) { const k = Math.floor(Math.random() * 4); site.parts.push({ x: C[k][0], y: C[k][1], vx: (Math.random() - .5) * 12, vy: -8, t: 0 }); }
  } else if (site.done && site.done.t === 0) {   // finished: a ring of dust bursts out from the foot
    for (let i = 0; i < 26; i++) { const a = i / 26 * 6.28; site.parts.push({ x: (C[0][0] + C[2][0]) / 2, y: (C[0][1] + C[2][1]) / 2, vx: Math.cos(a) * 60, vy: Math.sin(a) * 26 - 6, t: 0, big: true }); }
  }
  if (site.done) { site.done.t += dt; if (site.done.t > 1.2) site.done = null; }
  for (const q of site.parts) { q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt; if (q.spark) q.vy += 100 * dt; else { q.vx *= .96; q.vy *= .96; } }
  site.parts = site.parts.filter(q => q.t < (q.spark ? .45 : q.big ? 1.1 : 1));
  for (const q of site.parts) { if (q.spark) { g.fillStyle = `rgba(255,${200 + Math.random() * 55 | 0},90,${1 - q.t / .45})`; g.fillRect(Math.round(q.x), Math.round(q.y), 2, 2); }
    else { g.fillStyle = `rgba(225,210,180,${(q.big ? .8 : .5) * (1 - q.t / (q.big ? 1.1 : 1))})`; g.beginPath(); g.arc(q.x, q.y, (q.big ? 4 : 2) + q.t * (q.big ? 9 : 5), 0, 7); g.fill(); } }
}

/** The festival boat: a big boat with bunting and a deck full of people. */
export function drawFestBoat(g, pr, fest) {
  if (!fest) return; const [px, py] = pr.P(fest.x, fest.z), x = Math.round(px), y = Math.round(py + Math.sin(fest.bt * 2) * 2), s = 2;
  g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x - 13 * s, y + 3 * s, 26 * s, 2);
  g.fillStyle = '#6b4026'; g.beginPath(); g.moveTo(x - 14 * s, y - 3 * s); g.lineTo(x + 14 * s, y - 3 * s); g.lineTo(x + 10 * s, y + 3 * s); g.lineTo(x - 10 * s, y + 3 * s); g.closePath(); g.fill();
  g.fillStyle = '#c0392b'; g.fillRect(x - 14 * s, y - 4 * s, 28 * s, 2 * s);
  for (const mx of [-6, 6]) { g.fillStyle = '#3a2418'; g.fillRect(x + mx * s, y - 26 * s, 2, 22 * s); g.fillStyle = '#f4f1ea'; g.beginPath(); g.moveTo(x + mx * s + 2, y - 25 * s); g.lineTo(x + mx * s + 11 * s, y - 9 * s); g.lineTo(x + mx * s + 2, y - 9 * s); g.closePath(); g.fill(); }
  const cols = ['#e2432f', '#ffcf3f', '#4ee0c1', '#b79cff', '#ff8fa3']; for (let k = 0; k < 9; k++) { const u = k / 8, fx = x - 6 * s + u * 12 * s, fy = y - 26 * s + Math.sin(u * Math.PI) * 4 * s; g.fillStyle = cols[k % 5]; g.fillRect(Math.round(fx) - 1, Math.round(fy), 3, 4); }
  if (fest.state === 'coming') { const n = Math.min(14, fest.total); for (let k = 0; k < n; k++) { g.fillStyle = cols[k % 5]; g.fillRect(x - 11 * s + (k % 7) * 3.2 * s, y - 7 * s - Math.floor(k / 7) * 3, 3, 4); } }
}

/** An ordinary boat bringing guests: a hull, a sail, a few heads while it is coming in. */
export function drawBoat(g, pr, b) {
  const [px, py] = pr.P(b.x, b.z), x = Math.round(px), y = Math.round(py + Math.sin(b.t * 3) * 1.5);
  g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x - 12, y + 3, 24, 1);
  g.fillStyle = '#6b4026'; g.beginPath(); g.moveTo(x - 13, y - 3); g.lineTo(x + 13, y - 3); g.lineTo(x + 9, y + 3); g.lineTo(x - 9, y + 3); g.closePath(); g.fill();
  g.fillStyle = '#8a5a34'; g.fillRect(x - 13, y - 4, 26, 2);
  g.fillStyle = '#3a2418'; g.fillRect(x, y - 24, 1, 21);
  g.fillStyle = '#f4f1ea'; g.beginPath(); g.moveTo(x + 1, y - 23); g.lineTo(x + 12, y - 7); g.lineTo(x + 1, y - 7); g.closePath(); g.fill();
  g.fillStyle = '#c0392b'; g.fillRect(x - 1, y - 27, 6, 3);
  if (b.state !== 'out') for (let k = 0; k < Math.min(5, b.people); k++) { g.fillStyle = ['#c0392b', '#2e86ab', '#e3b448', '#5b8a6a', '#8064a2'][k]; g.fillRect(x - 9 + k * 4, y - 7, 2, 3); }
}
