// Game buttons as little voxel dioramas: each one is a floating chunk of island with its thing on top,
// rendered with the same camera, light and outline as the buildings, so the buttons belong to the world.
import { renderVoxels } from '../v2/render.js';

const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v * k)))); return '#' + c.map(v => v.toString(16).padStart(2, '0')).join(''); };
const rnd = (x, y, z) => { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return s - Math.floor(s); };

function builder() {
  const map = new Map();
  const put = (x, y, z, c) => { if (c) map.set(`${x},${y},${z}`, [x, y, z, c]); else map.delete(`${x},${y},${z}`); };
  const box = (x0, y0, z0, x1, y1, z1, c) => { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) put(x, y, z, typeof c === 'function' ? c(x, y, z) : c); };
  const ball = (cx, cy, cz, r, c) => { for (let x = Math.floor(cx - r); x <= cx + r; x++) for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let z = Math.floor(cz - r); z <= cz + r; z++)
    if ((x + .5 - cx) ** 2 + (y + .5 - cy) ** 2 + (z + .5 - cz) ** 2 <= r * r) put(x, y, z, typeof c === 'function' ? c(x, y, z) : c); };
  return { put, box, ball, list: () => [...map.values()] };
}
/** A floating chunk: top layer, two earth layers, a narrower rock underneath; n wide, corners cut. */
function chunk(v, n, top, { earth = '#9a6b43', rock = '#7d756c' } = {}) {
  const cut = (x, z, k) => (x < k || x > n - 1 - k) && (z < k || z > n - 1 - k);
  for (let x = 0; x < n; x++) for (let z = 0; z < n; z++) {
    if (cut(x, z, 1)) continue;
    v.put(x, 3, z, typeof top === 'function' ? top(x, z) : shade(top, .94 + rnd(x, 3, z) * .12));
    v.put(x, 2, z, shade(earth, .92 + rnd(x, 2, z) * .14)); v.put(x, 1, z, shade(earth, .82 + rnd(x, 1, z) * .12));
    if (!cut(x, z, 2) && x > 0 && z > 0 && x < n - 1 && z < n - 1) v.put(x, 0, z, shade(rock, .9 + rnd(x, 0, z) * .15));
  }
}
const GRASS = '#7fbf5a', SAND = '#e8d39a', WATER = '#4f9fd0', WOOD = '#a0683a', DARK = '#5b3a22';

const MODELS = {
  globe() { const v = builder(); chunk(v, 12, GRASS);
    v.box(5, 4, 5, 6, 5, 6, '#6b4f2a');
    v.ball(6, 10, 6, 4.8, (x, y, z) => { const land = Math.sin(x * .9 + y * .4) + Math.cos(z * .8 - y * .6) > .7; return land ? (rnd(x, y, z) > .5 ? '#5fae4c' : '#6cbd57') : (rnd(x, y, z) > .5 ? '#3d8fcf' : '#4a9ad8'); });
    return v.list(); },
  map() { const v = builder(); chunk(v, 12, GRASS);
    v.box(2, 4, 3, 9, 4, 8, (x, y, z) => (x + z) % 5 === 0 ? '#c9a46a' : '#f1e2bc');
    v.box(3, 5, 4, 5, 5, 5, '#6cbd57'); v.box(6, 5, 6, 7, 5, 7, '#6cbd57'); v.put(8, 5, 4, '#d9483b'); v.put(7, 5, 5, '#d9483b'); v.put(4, 5, 7, '#4a9ad8');
    v.box(1, 4, 2, 1, 5, 9, '#c79a58'); v.box(10, 4, 2, 10, 5, 9, '#c79a58');
    return v.list(); },
  island() { const v = builder(); chunk(v, 12, (x, z) => (x - 5.5) ** 2 + (z - 5.5) ** 2 < 14 ? shade(SAND, .95 + rnd(x, 3, z) * .08) : shade(WATER, .95 + rnd(x, 3, z) * .1), { earth: '#c9a46a' });
    for (let y = 4; y <= 9; y++) v.put(y > 7 ? 6 : 5, y, 5, y % 2 ? '#8a5a34' : '#9c6a40');
    v.put(6, 10, 5, '#3f8f3a'); for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]]) v.put(6 + dx, 10 - (Math.abs(dx) + Math.abs(dz) > 1 ? 1 : 0), 5 + dz, Math.abs(dx) + Math.abs(dz) > 1 ? '#4f9f45' : '#3f8f3a');
    v.put(6, 9, 6, '#7a4a20'); v.put(7, 9, 5, '#7a4a20');
    return v.list(); },
  chair() { const v = builder(); chunk(v, 12, GRASS);
    for (const [x, z] of [[4, 4], [7, 4], [4, 7], [7, 7]]) v.box(x, 4, z, x, 6, z, DARK);
    v.box(4, 7, 4, 7, 7, 7, WOOD); v.box(4, 8, 4, 4, 11, 7, (x, y, z) => y === 11 || z === 4 || z === 7 ? WOOD : shade(WOOD, 1.15));
    return v.list(); },
  boat() { const v = builder(); chunk(v, 12, (x, z) => x < 2 || z < 2 || x > 9 || z > 9 ? shade(SAND, .95 + rnd(x, 3, z) * .08) : shade('#7cc4e8', .92 + rnd(x, 3, z) * .12), { earth: '#c9a46a' });
    v.box(3, 4, 4, 8, 4, 7, DARK); v.box(2, 5, 4, 9, 5, 7, WOOD); v.box(2, 5, 5, 2, 5, 6, null); v.box(9, 6, 5, 10, 6, 6, WOOD); v.box(1, 6, 5, 1, 6, 6, WOOD);
    v.box(3, 6, 4, 8, 6, 4, '#c0392b'); v.box(3, 6, 7, 8, 6, 7, '#c0392b');
    v.box(5, 6, 5, 5, 13, 5, '#3a2418');
    for (let y = 7; y <= 12; y++) for (let x = 6; x <= 6 + Math.floor((y - 6) * .9); x++) v.put(x, y, 5, '#f4f1ea');
    v.box(5, 14, 5, 6, 14, 5, '#d9483b');
    return v.list(); },
  hammer() { const v = builder(); chunk(v, 14, (x, z) => (x + z) % 4 < 2 && (x === 1 || z === 1 || x === 12 || z === 12) ? '#e3b021' : shade('#b8875a', .92 + rnd(x, 3, z) * .12), { earth: '#8a5f3a' });
    v.box(3, 4, 3, 4, 4, 4, '#c7b49a'); v.box(9, 4, 9, 10, 5, 10, '#d6a35b'); v.box(9, 6, 9, 9, 6, 9, '#d6a35b');
    v.box(6, 4, 6, 7, 12, 7, (x, y, z) => y % 3 === 0 ? '#7a4a20' : '#a0683a');
    v.box(3, 13, 5, 10, 15, 8, (x, y, z) => y === 15 ? '#aab3bd' : x === 3 || x === 10 ? '#5c646e' : '#7d8792');
    return v.list(); },
};

const cache = new Map();
/** The data URL of a voxel button picture (rendered once). */
export function voxelURL(name, k = 3) {
  const key = name + k; if (!cache.has(key)) { const f = MODELS[name]; cache.set(key, f ? renderVoxels(f(), { k }).toDataURL() : ''); }
  return cache.get(key);
}
export function voxelEl(name, k = 3) { const im = document.createElement('img'); im.src = voxelURL(name, k); im.alt = ''; im.draggable = false; im.className = 'vx'; return im; }
export const VOXEL_NAMES = Object.keys(MODELS);
