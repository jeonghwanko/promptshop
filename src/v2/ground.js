// The ground of the archipelago in chunky pixels (two map pixels to one), every pixel classified from a smoothed land field:
// a sea in three blues mixed by ordered dither (never blurred), coasts cut smooth instead of stepping by tile, layered cliffs
// under the front edges with broken foam at their foot, sand, grass, roads, paved plots, wooden bridges and piers, and trees.
// Waves are not painted in: they come back as a list for drawWaves(), which moves them every frame.
import { slotAt, dockOf, bridgeTiles } from './isles.js';

const K = 2;                                   // map pixels per ground pixel
const CLIFF = 11;                              // cliff height in ground pixels
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + .5) / 16);
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const C = {
  deep: hex('#1f86c0'), mid: hex('#2aa2d2'), shal: hex('#46c4dc'), shore: hex('#86e4e2'), foam: hex('#ffffff'),
  grass: hex('#a9cf7c'), grass2: hex('#9cc472'), wild: hex('#b2d488'), tuft: hex('#c6ec7c'), rim: hex('#d6f294'),
  sand: hex('#f8e6ac'), sand2: hex('#efd696'), wet: hex('#dcc48e'),
  road: hex('#cfc9bd'), roadE: hex('#aaa396'), pave: hex('#efe2c4'), pave2: hex('#e8d9b8'),
  wood: hex('#c98a4e'), wood2: hex('#a8703e'), rail: hex('#7a5238'), post: hex('#6b4630'), woodShade: hex('#1a6a9a'),
  soil: hex('#c08452'), soil2: hex('#a26a40'), rock: hex('#b4a698'), rock2: hex('#978a80'), cliffD: hex('#7a5a4e'),
};
const last = { sig: '', canvas: null };
const GREENS = [['#5aae4a', '#8fd65e'], ['#4fa04a', '#7ccb5a'], ['#3f9a62', '#6cc485'], ['#73b048', '#a2d65a']];

function hash(x, z) { let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi, sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

/**
 * Paint the whole map's ground. world: from makeIsles; taken: Set of 'x,z' plot tiles; avoid: Set of 'x,z' tiles that stay clear of trees
 * (power and water). Returns a canvas the size of the map, with .waves for drawWaves().
 */
export function paintGround(world, pr, { taken = new Set(), avoid = new Set() } = {}) {
  const W = world.w, D = world.d, HW = Math.ceil(pr.width / K), HH = Math.ceil(pr.height / K);
  // ---------- tile grids ----------
  const slot = new Int8Array(W * D), woodG = new Uint8Array(W * D), takenG = new Uint8Array(W * D);
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) { slot[z * W + x] = slotAt(x, z); if (world.isBridge(x, z)) woodG[z * W + x] = 1; }
  const inW = (x, z) => x >= 0 && z >= 0 && x < W && z < D, at = (x, z) => (inW(x, z) ? slot[z * W + x] : 0);
  const setWood = ([x, z]) => { if (inW(x, z)) woodG[z * W + x] = 1; };
  for (const s of world.joined) dockOf(s).pier.forEach(setWood);
  for (const [id, h] of world.bridges) { if (h.a && h.b) continue; const [a, b] = id.split('-').map(Number), t = bridgeTiles(a, b), half = Math.ceil(t.length / 2);
    (h.a ? t.slice(0, half) : h.b ? t.slice(t.length - half) : []).forEach(setWood); }
  for (const k of taken) { const [x, z] = k.split(',').map(Number); if (inW(x, z)) takenG[z * W + x] = 1; }
  // the map asks again every few seconds: when nothing the ground shows has changed, the last picture is reused
  let h = 2166136261; const mix = (v) => { h = Math.imul(h ^ v, 16777619); };
  for (let k = 0; k < W * D; k++) { mix(slot[k]); mix(woodG[k] | takenG[k] << 1); }
  for (const s2 of [...world.joined].sort()) mix(s2); for (const k of [...avoid].sort()) for (let q = 0; q < k.length; q++) mix(k.charCodeAt(q));
  const sig = [h, W, D, pr.width, pr.height].join(':'); if (last.sig === sig) return last.canvas;
  const dist = new Float32Array(W * D);   // distance to land in tiles, up to 6
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) { if (slot[z * W + x]) continue; let r = 6;
    for (let dz = -6; dz <= 6; dz++) for (let dx = -6; dx <= 6; dx++) if (at(x + dx, z + dz)) r = Math.min(r, Math.hypot(dx, dz) * .85 + .15);
    dist[z * W + x] = r; }
  const bil = (f, u, v) => { const x0 = Math.floor(u - .5), z0 = Math.floor(v - .5), tx = u - .5 - x0, tz = v - .5 - z0;
    return f(x0, z0) * (1 - tx) * (1 - tz) + f(x0 + 1, z0) * tx * (1 - tz) + f(x0, z0 + 1) * (1 - tx) * tz + f(x0 + 1, z0 + 1) * tx * tz; };
  const landF = (x, z) => (at(x, z) ? 1 : 0), distF = (x, z) => (inW(x, z) ? dist[z * W + x] : 6);
  const slotNear = (u, v) => { const x = Math.floor(u), z = Math.floor(v); let s = at(x, z); for (let r = 1; !s && r <= 1; r++) for (let dz = -r; dz <= r && !s; dz++) for (let dx = -r; dx <= r && !s; dx++) s = at(x + dx, z + dz); return s; };

  // ---------- pixels ----------
  const c2 = document.createElement('canvas'); c2.width = HW; c2.height = HH; const g2 = c2.getContext('2d');
  const img = g2.createImageData(HW, HH), d = img.data, kind = new Uint8Array(HW * HH), lv = new Float32Array(HW * HH), dv = new Float32Array(HW * HH);
  const put = (i, col) => { d[i * 4] = col[0]; d[i * 4 + 1] = col[1]; d[i * 4 + 2] = col[2]; d[i * 4 + 3] = 255; };
  const WATER = 0, LAND = 1, CL = 2, FOAM = 3, WOOD = 4;
  for (let y = 0; y < HH; y++) for (let x = 0; x < HW; x++) {
    const [u, v] = pr.inv(x * K + K / 2, y * K + K / 2), i = y * HW + x;
    if (u < -7 || v < -7 || u > W + 7 || v > D + 7) { lv[i] = 0; dv[i] = 6; continue; }
    lv[i] = bil(landF, u, v) + (vnoise(u * 1.7, v * 1.7) - .5) * .32;
    dv[i] = bil(distF, u, v) + (vnoise(u * .9 + 40, v * .9) - .5) * .7;
  }
  for (let y = 0; y < HH; y++) for (let x = 0; x < HW; x++) {
    const i = y * HW + x, l = lv[i], b = BAYER[(y & 3) * 4 + (x & 3)];
    const [u, v] = pr.inv(x * K + K / 2, y * K + K / 2), tx = Math.floor(u), tz = Math.floor(v), ti = inW(tx, tz) ? tz * W + tx : -1;
    if (l <= .5 && ti >= 0 && woodG[ti]) {   // planks across the walk, a dark seam every quarter tile
      // a walk along x or z: planks across it, a rail along each side
      const alongX = world.isRoad(tx - 1, tz) || world.isRoad(tx + 1, tz) || (woodG[ti - 1] && woodG[ti + 1]) || (inW(tx - 1, tz) && woodG[ti - 1] && !(inW(tx, tz - 1) && woodG[ti - W]));
      const along = alongX ? u : v, side = alongX ? v - tz : u - tx, f = (along * 4) % 1;
      put(i, side < .12 || side > .88 ? C.rail : side < .2 || side > .8 ? C.wood2 : f < .18 ? C.wood2 : C.wood); kind[i] = WOOD; continue;
    }
    if (l > .5) {
      const s = slotNear(u, v), joined = world.joined.has(s);
      if (l < .74 + (b - .5) * .06) put(i, l < .58 && b > .5 ? C.wet : vnoise(u * 3, v * 3) > .6 ? C.sand2 : C.sand);
      else if (joined && ti >= 0 && world.isRoad(tx, tz)) { const fx = u - tx, fz = v - tz; put(i, fx < .08 || fx > .92 || fz < .08 || fz > .92 ? C.roadE : C.road); }
      else if (ti >= 0 && takenG[ti]) put(i, ((Math.floor(u * 2) + Math.floor(v * 2)) & 1) ? C.pave2 : C.pave);
      else { put(i, vnoise(u * 2.3, v * 2.3) > .62 + (b - .5) * .12 ? C.grass2 : joined ? C.grass : C.wild); if (hash(x, y) < .012) put(i, C.tuft); }
      if (y < HH - 1 && lv[i + HW] <= .5) put(i, l < .74 ? C.sand : C.rim);   // the lit lip of the front edge
      kind[i] = LAND; continue;
    }
    const dd = dv[i] + (b - .5) * .55; put(i, dd < .9 ? C.shore : dd < 1.9 ? C.shal : dd < 3.2 ? C.mid : C.deep);
  }
  // cliffs hang under every front edge: a dark lip, soil, rock, a ragged foot, then broken foam where they meet the sea
  for (let x = 0; x < HW; x++) {
    let q = -1;   // ground pixels since the last land pixel in this column (-1: none above)
    const hcol = CLIFF - 2 + Math.round(vnoise(x * .21, 3) * 5);
    for (let y = 0; y < HH; y++) { const i = y * HW + x;
      if (kind[i] === LAND) { q = 0; continue; }
      if (q < 0 || kind[i] === WOOD) { q = -1; continue; }
      if (q < hcol) { const t = q / hcol;
        put(i, q < 1 ? C.cliffD : t < .35 ? (vnoise(x * .3, q * .5) > .55 ? C.soil2 : C.soil) : t < .45 ? C.soil2 : (vnoise(x * .25, q * .4 + 9) > .5 ? C.rock2 : C.rock)); kind[i] = CL; }
      else if (q < hcol + 2) { if (hash(x, 7) > .2) { put(i, C.foam); kind[i] = FOAM; } }
      else if (q < hcol + 5) { if ((x + q) % 5 < 2 && hash(x, q) > .5) put(i, C.shore); }
      else { q = -1; continue; }
      q++;
    }
  }
  for (let y = 1; y < HH - 2; y++) for (let x = 0; x < HW; x++) { const i = y * HW + x; if (kind[i] !== WATER) continue;
    if (kind[i + HW] === LAND || (kind[i + HW * 2] === LAND && hash(x, y) > .35)) put(i, C.foam);   // foam along the back edges
    else if (kind[i - HW] === WOOD) { put(i, C.woodShade); if (x % 12 < 2) for (let q = 0; q < 4 && y + q < HH; q++) { const j = i + q * HW; if (kind[j] === WATER) put(j, q < 3 ? C.post : C.foam); } } }   // a bridge's shadow on the water, and its posts every few planks
  g2.putImageData(img, 0, 0);

  // ---------- trees and bushes on the free land of joined islands ----------
  const P = (x, z) => { const [a, b2] = pr.P(x, z); return [a / K, b2 / K]; };
  const near = (x, z) => [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]].some(([a, b2]) => inW(x + a, z + b2) && takenG[(z + b2) * W + x + a]);
  const docks = new Set(); for (const s of world.joined) { const dk = dockOf(s); docks.add(dk.road.join(',')); }
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const s = slot[z * W + x]; if (!s || !world.joined.has(s) || world.isRoad(x, z) || takenG[z * W + x] || avoid.has(x + ',' + z) || docks.has(x + ',' + z)) continue;
    if (!at(x + 1, z) || !at(x - 1, z) || !at(x, z + 1) || !at(x, z - 1)) continue;   // not on the beach
    const r = hash(x * 7 + 3, z * 13 + 1), [px, py] = P(x + .5, z + .5), j = (k) => (hash(x + k, z * 3 + k) - .5);
    if (near(x, z) && r < .5) bush(g2, px + j(1) * 5, py, 3 + hash(x, z + 9) * 1.4, '#5aae4a', '#8fd65e', r < .18 ? '#f2c2d4' : r < .3 ? '#f3d98a' : null);
    else if (!near(x, z) && r < .3) tree(g2, px + j(2) * 6, py + j(3) * 2, (k) => hash(x * 31 + k, z * 17 + k));
  }

  // ---------- waves: short arcs on open water, on a jittered grid (drawn and moved by drawWaves) ----------
  const waves = [];
  for (let gy = 0; gy < HH; gy += 24) for (let gx = 0; gx < HW; gx += 40) {
    const x = gx + Math.floor(hash(gx, gy) * 34), y = gy + Math.floor(hash(gy, gx) * 18);
    if (x >= HW - 6 || y >= HH - 2 || kind[y * HW + x] !== WATER || dv[y * HW + x] < 2.6) continue;
    waves.push(x * K, y * K, hash(x, y));
  }

  const c = document.createElement('canvas'); c.width = pr.width; c.height = pr.height; const g = c.getContext('2d');
  g.imageSmoothingEnabled = false; g.drawImage(c2, 0, 0, HW * K, HH * K);
  c.waves = new Float32Array(waves);
  last.sig = sig; last.canvas = c;
  return c;
}

function bush(g, x, y, r, c1, c2, c3) {
  g.fillStyle = '#2f6a4a'; g.beginPath(); g.ellipse(x, y + .6, r + .6, r * .8 + .6, 0, 0, 7); g.fill();
  g.fillStyle = c1; g.beginPath(); g.ellipse(x, y, r, r * .8, 0, 0, 7); g.fill();
  g.fillStyle = c2; g.beginPath(); g.ellipse(x - r * .3, y - r * .3, r * .55, r * .4, 0, 0, 7); g.fill();
  if (c3) { g.fillStyle = c3; for (const [dx, dy] of [[-r * .4, 0], [r * .3, -r * .2], [0, r * .3]]) g.fillRect(Math.round(x + dx), Math.round(y + dy), 1, 1); }
}
/** Three kinds (round, pine, a clump of bushes) in four greens and varied sizes, so a grove never reads as one stamp. */
function tree(g, x, y, rnd) {
  const k = rnd(1), [c1, c2] = GREENS[Math.floor(rnd(2) * GREENS.length)], s = (.8 + rnd(3) * .5) * .6;
  g.fillStyle = 'rgba(23,63,120,.22)'; g.beginPath(); g.ellipse(x + 2, y + .6, 7 * s, 3 * s, 0, 0, 7); g.fill();
  if (k < .4) { g.fillStyle = '#8a5a3c'; g.fillRect(Math.round(x), Math.round(y - 9 * s), 1, Math.round(9 * s)); bush(g, x, y - 12 * s, 7 * s, c1, c2); bush(g, x + 4 * s, y - 9 * s, 4 * s, c1, c2); }
  else if (k < .75) { g.fillStyle = '#8a5a3c'; g.fillRect(Math.round(x), Math.round(y - 3), 1, 3);
    for (let i = 0; i < 3; i++) { const w = (8 - i * 2) * s, ty = y - 3 - i * 5 * s;
      g.fillStyle = '#2f6a4a'; g.beginPath(); g.moveTo(x - w - .6, ty + .6); g.lineTo(x + w + .6, ty + .6); g.lineTo(x, ty - 9 * s - .6); g.fill();
      g.fillStyle = c1; g.beginPath(); g.moveTo(x - w, ty); g.lineTo(x + w, ty); g.lineTo(x, ty - 9 * s); g.fill();
      g.fillStyle = c2; g.beginPath(); g.moveTo(x - w * .6, ty - .6); g.lineTo(x - .6, ty - .6); g.lineTo(x - .6, ty - 8 * s); g.fill(); } }
  else { bush(g, x - 3 * s, y - 2, 4.5 * s, c1, c2); bush(g, x + 3 * s, y - 1, 4 * s, c1, c2); bush(g, x, y - 4, 4.5 * s, c1, c2, rnd(4) < .4 ? '#f2c2d4' : null); }
}

/** The waves, moved: each arc drifts a ground pixel side to side and shows for part of its own cycle (t in seconds).
 *  view: [x0, y0, x1, y1] in map pixels; only the waves on screen are drawn (they cost a frame's time over the whole map). */
export function drawWaves(g, waves, t, view = null) {
  if (!waves?.length) return;
  const [vx0, vy0, vx1, vy1] = view ?? [-Infinity, -Infinity, Infinity, Infinity];
  for (const [col, lo, hi] of [['#5cc2ea', 0, .7], ['#d2f6ff', .7, 1]]) {
    g.fillStyle = col; g.beginPath();
    for (let i = 0; i < waves.length; i += 3) { const s = waves[i + 2]; if (s < lo || s >= hi) continue;
      if (waves[i] < vx0 - 12 || waves[i] > vx1 || waves[i + 1] < vy0 - 4 || waves[i + 1] > vy1) continue;
      if (Math.sin(t * .55 + s * 40) < -.25) continue;
      const x = waves[i] + Math.round(Math.sin(t * .9 + s * 6.28)) * K, y = waves[i + 1];
      g.rect(x + K, y, K * 3, K); g.rect(x, y + K, K, K); g.rect(x + K * 4, y + K, K, K); }
    g.fill();
  }
}
