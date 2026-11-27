// Things drawn over the island map: a building site, the festival boat, the ordinary boats.
// Each takes the canvas context and the map projection, and draws what it is given; the game state stays in main.js.
import { PLOT } from '../v2/isles.js';

/** The building site's own state: its sparks and dust, a finished build's dust burst (done), the staked spot before building (pending). */
export const site = { parts: [], t: 0, done: null, pending: null, dt: 0, step(dt) { this.dt = dt; this.t += dt; } };
/** Stake a spot (a sign waits for the line) or take the stake away (null). */
export const stakeSite = (spot) => { site.pending = spot && { x: spot.x, z: spot.z, size: spot.size }; };
/** A dust burst at a spot: something landed or was finished there. */
/** A part landed: the crane's hook load drops and comes back up. */
export const hookDrop = () => { site.hookAt = performance.now(); };
export const dustSite = (spot, o = {}) => { site.done = { x: spot.x, z: spot.z, size: spot.size, t: 0, finish: !!o.finish }; };   // finish: the scaffold flies off too

/** Draw the building site's back half (behind the building) or front half; building: the plot being built, or null. */
export function drawSite(g, pr, half, building) {
  if (half === 'front' && site.pending && !building) { const q = site.pending, m = PLOT[q.size], C0 = [pr.P(q.x, q.z), pr.P(q.x + m, q.z), pr.P(q.x + m, q.z + m), pr.P(q.x, q.z + m)], pul = .6 + .4 * Math.sin(site.t * 5);
    g.strokeStyle = `rgba(255,207,63,${pul})`; g.lineWidth = 2; g.beginPath(); C0.forEach(([a, c], i) => i ? g.lineTo(a, c) : g.moveTo(a, c)); g.closePath(); g.stroke();
    const [mx, my] = pr.P(q.x + m / 2, q.z + m / 2); g.fillStyle = '#5b3a22'; g.fillRect(Math.round(mx) - 1, Math.round(my) - 22, 3, 22); g.fillStyle = '#c08a4a'; g.fillRect(Math.round(mx) - 9, Math.round(my) - 30, 19, 11); g.fillStyle = '#2e241a'; g.fillRect(Math.round(mx) - 9, Math.round(my) - 30, 19, 1); g.fillRect(Math.round(mx) - 9, Math.round(my) - 20, 19, 1); }
  const b = building ?? site.done; if (!b) return; const dt = site.dt, P = (x, z) => pr.P(x, z);
  const n = PLOT[b.size], x0 = b.x, z0 = b.z, C = [P(x0, z0), P(x0 + n, z0), P(x0 + n, z0 + n), P(x0, z0 + n)], H = 26 + n * 10;   // C[0] back, C[2] front
  // the scaffold grows while Claude thinks (time) and with every part it sends: never still, and its height is the progress
  const grow = building ? Math.min(1, .15 + Math.min(.55, (performance.now() - (building.t0 ?? 0)) / 16000 * .55) + (building.parts ?? 0) * .06) : 1, Hg = H * grow;
  const line = (a, c, col, w) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(Math.round(a[0]) + .5, Math.round(a[1]) + .5); g.lineTo(Math.round(c[0]) + .5, Math.round(c[1]) + .5); g.stroke(); };
  const tape = (a, c) => { const m = 10; for (let i = 0; i < m; i++) line([a[0] + (c[0] - a[0]) * i / m, a[1] + (c[1] - a[1]) * i / m - 4], [a[0] + (c[0] - a[0]) * (i + 1) / m, a[1] + (c[1] - a[1]) * (i + 1) / m - 4], i % 2 ? '#3a2e22' : '#d9a92e', 2); };
  // ---- the parts of a scaffold, drawn the same way while it stands and while it comes down ----
  const hash = (i) => { const v = Math.sin(i * 12.9898) * 43758.5453; return v - Math.floor(v); };
  /** A deck of planks along a→c at `lift` px up: pieces 6–9 px with 1 px gaps and ±1 px jitter, a dark underside; fall/rot/alpha bring it down. */
  const deck = (a, c, lift, seed, fall = 0, rot = 0, alpha = 1) => {
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]); g.save(); g.globalAlpha = alpha;
    for (let u = 0, i = 0; u < len; i++) { const L = 6 + hash(seed + i) * 3, u2 = Math.min(len, u + L), j = Math.round(hash(seed + i + 50) * 2 - 1);
      const p = [a[0] + (c[0] - a[0]) * u / len, a[1] + (c[1] - a[1]) * u / len - lift + j + fall], q = [a[0] + (c[0] - a[0]) * u2 / len, a[1] + (c[1] - a[1]) * u2 / len - lift + j + fall];
      if (rot) { const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], r = rot * (hash(seed + i + 9) > .5 ? 1 : -1), cs = Math.cos(r), sn = Math.sin(r), turn = (v) => [m[0] + (v[0] - m[0]) * cs - (v[1] - m[1]) * sn, m[1] + (v[0] - m[0]) * sn + (v[1] - m[1]) * cs]; p.splice(0, 2, ...turn(p)); q.splice(0, 2, ...turn(q)); }
      line([p[0], p[1] + 1], [q[0], q[1] + 1], '#7a5230', 1); line(p, q, '#c08a4a', 2); u = u2 + 1; }
    g.restore();
  };
  const brace = (a, c, f0, f1) => line([a[0], a[1] - H * f0], [c[0], c[1] - H * f1], '#5a4030', 1);
  const LEVELS = [.3, .6, .9], BACK = [[C[3], C[0]], [C[0], C[1]]], FRONT = [[C[1], C[2]], [C[2], C[3]]];
  // finished (site.done.finish, t in s): the building fills the last of itself (0–.12), then the decks drop top first 40 ms apart
  // (gravity, a little turn, land, hold, two cuts), then the poles sink (easeInQuad, .22 s); dust as the first planks land
  const fin = !building && site.done?.finish ? site.done.t : -1;
  const plankState = (li) => { const t0 = .12 + (2 - li) * .04, h = H * LEVELS[li], tl = Math.sqrt(2 * h / 600), u = fin - t0;   // li 2 = top
    if (u <= 0) return { fall: 0, rot: 0, alpha: 1 }; if (u < tl) return { fall: 300 * u * u, rot: .44 * u / tl, alpha: 1 };
    const after = u - tl; return { fall: h, rot: .44, alpha: after < .06 ? 1 : after < .12 ? .6 : after < .18 ? .3 : 0 }; };
  const poleH = fin < 0 ? Hg : fin < .32 ? H : fin < .54 ? H * (1 - ((fin - .32) / .22) ** 2) : 0;
  if (half === 'back') {
    if (building) {
      // a tower crane on the back corner, its jib turning a little; each part that lands drops the load on the hook (in, then up)
      const base = C[0], mast = H + 40, top = [base[0], base[1] - mast], sw = Math.sin(site.t * .7) * 14, tip = [top[0] + 34 + sw, top[1] + 6], back = [top[0] - 18 - sw * .4, top[1] - 2];
      line(base, top, '#2e241a', 4); line(base, top, '#ffcf3f', 2);
      for (let y = 8; y < mast; y += 8) line([base[0] - 1, base[1] - y], [base[0] + 1, base[1] - y + 6], '#b58a10', 1);
      line(back, tip, '#2e241a', 4); line(back, tip, '#ffcf3f', 2); g.fillStyle = '#5b5f66'; g.fillRect(Math.round(back[0]) - 3, Math.round(back[1]) - 1, 6, 5);
      const hu = site.hookAt ? (performance.now() - site.hookAt) / 1000 : 9, drop = hu < .16 ? 12 * (hu / .16) ** 2 : hu < .46 ? 12 * (1 - (hu - .16) / .3) ** 2 : 0;
      const hook = [tip[0] - 6, tip[1] + 18 + drop + Math.sin(site.t * 2) * 2]; line([tip[0] - 6, tip[1]], hook, '#2e241a', 1); g.fillStyle = '#c08a4a'; g.fillRect(Math.round(hook[0]) - 4, Math.round(hook[1]), 8, 4);
    } else if (fin < 0 || poleH <= 0) return;
    for (const c of [C[0], C[1], C[3]]) if (poleH > 0) line(c, [c[0], c[1] - poleH], 'rgba(58,42,28,.9)', 2);
    LEVELS.forEach((f, li) => { if (building ? grow < f + .04 : false) return; const st = fin < 0 ? { fall: 0, rot: 0, alpha: 1 } : plankState(li); if (!st.alpha) return; BACK.forEach(([a, c], e) => deck(a, c, H * f, li * 10 + e * 3, st.fall, st.rot, st.alpha)); });
    return;
  }
  if (building || fin >= 0) {
    if (poleH > 0) line(C[2], [C[2][0], C[2][1] - poleH], 'rgba(58,42,28,.9)', 2);
    LEVELS.forEach((f, li) => { if (building && grow < f + .04) return; const st = fin < 0 ? { fall: 0, rot: 0, alpha: 1 } : plankState(li); if (!st.alpha) return; FRONT.forEach(([a, c], e) => deck(a, c, H * f, 100 + li * 10 + e * 3, st.fall, st.rot, st.alpha)); });
    if (building) {
      for (let li = 0; li < 2; li++) if (grow >= LEVELS[li + 1] + .04) { brace(C[1], C[2], LEVELS[li], LEVELS[li + 1]); brace(C[3], C[2], LEVELS[li + 1], LEVELS[li]); }   // one diagonal brace per level
      tape(C[1], C[2]); tape(C[2], C[3]);
      // two workers at the front corners, hammering in turn: each blow knocks off a couple of wood chips
      for (const [k, c] of [[0, C[1]], [1, C[3]]]) {
        const ph = site.t * 6 + k * Math.PI, up = Math.sin(ph) > 0, x = Math.round(c[0] + (k ? 6 : -9)), y = Math.round(c[1] + 2);
        g.fillStyle = '#3a6ea5'; g.fillRect(x, y - 6, 3, 4); g.fillStyle = '#f6d2b8'; g.fillRect(x, y - 8, 3, 2); g.fillStyle = '#ffcf3f'; g.fillRect(x - 1, y - 9, 5, 1);   // body, face, hard hat
        g.fillStyle = '#2e241a'; g.fillRect(x, y - 2, 1, 2); g.fillRect(x + 2, y - 2, 1, 2);
        const hx = x + (k ? -2 : 4); g.fillStyle = '#5b5f66'; g.fillRect(hx, up ? y - 9 : y - 5, 2, 2);   // the hammer, up or down
        const was = site['w' + k]; site['w' + k] = up; if (was && !up) for (let i = 0; i < 2; i++) site.parts.push({ x: hx, y: y - 4, vx: (Math.random() - .5) * 40, vy: -20 - Math.random() * 15, t: 0, chip: true });
      }
    }
  }
  // dust: a few chunks pushed out low from the two front edges (the back ones would land on the facade), stepped fades
  const dust = (k) => { const cx = (C[0][0] + C[2][0]) / 2, cy = (C[0][1] + C[2][1]) / 2;
    for (const [a, c] of FRONT) for (let i = 0; i < k; i++) { const u = Math.random(), x = a[0] + (c[0] - a[0]) * u, y = a[1] + (c[1] - a[1]) * u, v = 10 + Math.random() * 14, r = Math.random();
      site.parts.push({ x, y: y - 1, vx: (x - cx) / 20 * v, vy: (y - cy) / 20 * v - 3, t: 0, big: true, s: r < .4 ? 3 : r < .8 ? 2 : 1 }); } };
  if (site.done && site.done.t === 0 && !site.done.finish) dust(3);
  if (fin >= .24 && !site.done.dusted) { site.done.dusted = true; dust(6); }
  if (site.done) { site.done.t += dt; if (site.done.t > (site.done.finish ? .8 : .6)) site.done = null; }
  for (const q of site.parts) { q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt; if (q.chip) q.vy += 140 * dt; else { q.vx *= .9; q.vy *= .9; } }
  site.parts = site.parts.filter(q => q.t < (q.chip ? .35 : q.big ? .55 : .5));
  for (const q of site.parts) {
    if (q.chip) { g.fillStyle = q.t < .15 ? '#e0a868' : '#8a5a32'; g.fillRect(Math.round(q.x), Math.round(q.y), 1, 1); continue; }   // wood chips off the hammer
    const [col, a] = q.t < .15 ? ['232,216,176', 1] : q.t < .35 ? ['184,154,106', .8] : ['138,110,72', .5];   // stepped, like hand-drawn frames (no smooth smear)
    const s = q.s ?? 2; g.fillStyle = `rgba(${col},${q.big ? a : a * .6})`; g.fillRect(Math.round(q.x), Math.round(q.y), s, s);
  }
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
