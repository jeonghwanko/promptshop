// Game buttons as voxel tokens: a plain slab with one simple symbol standing on it, rendered with the same camera,
// light and outline as the buildings. Their colours come from a palette the world does not use, so they read as UI, not as more map.
import { renderVoxels } from '../v2/render.js';

function builder() {
  const map = new Map();
  const put = (x, y, z, c) => { if (c) map.set(`${x},${y},${z}`, [x, y, z, c]); else map.delete(`${x},${y},${z}`); };
  const box = (x0, y0, z0, x1, y1, z1, c) => { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) put(x, y, z, typeof c === 'function' ? c(x, y, z) : c); };
  const ball = (cx, cy, cz, r, c) => { for (let x = Math.floor(cx - r); x <= cx + r; x++) for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let z = Math.floor(cz - r); z <= cz + r; z++)
    if ((x + .5 - cx) ** 2 + (y + .5 - cy) ** 2 + (z + .5 - cz) ** 2 <= r * r) put(x, y, z, typeof c === 'function' ? c(x, y, z) : c); };
  return { put, box, ball, list: () => [...map.values()] };
}
/** A rounded slab n wide and 2 high: top colour and a darker rim, nothing else. */
function slab(v, n, top, side) {
  for (let x = 0; x < n; x++) for (let z = 0; z < n; z++) {
    if ((x === 0 || x === n - 1) && (z === 0 || z === n - 1)) continue;
    v.put(x, 0, z, side); v.put(x, 1, z, x === 0 || z === 0 || x === n - 1 || z === n - 1 ? side : top);
  }
}

/** Palettes: slab [top, rim], build slab, symbol colours c1..c5, ink. */
export const PALETTES = {
  a: { name: '밤 사탕', ink: '#1f2540', slab: ['#2c3560', '#1f2540'], build: ['#ffcf3f', '#d99a12'], c1: '#ff6b6b', c2: '#ffe08a', c3: '#4ee0c1', c4: '#b79cff', c5: '#fff3dc' },
  b: { name: '파스텔 장난감', ink: '#3b2f4a', tops: { globe: ['#9fd8ff', '#6fb0de'], island: ['#a8ecc4', '#6fc394'], chair: ['#d9c3ff', '#a88be0'], boat: ['#ffb3b3', '#e07b7b'], plus: ['#ffd59e', '#e0aa66'], minus: ['#ffd59e', '#e0aa66'] },
       slab: ['#ffd59e', '#e0aa66'], build: ['#ffe066', '#e0b52e'], c1: '#ffffff', c2: '#ff8fa3', c3: '#ffffff', c4: '#ffffff', c5: '#ffffff' },
  c: { name: '뼈와 산호', ink: '#4a3a33', slab: ['#f4ede2', '#cdbfae'], build: ['#ff6f59', '#c94a38'], c1: '#ff6f59', c2: '#f4ede2', c3: '#ff6f59', c4: '#e6dccd', c5: '#ff6f59', hammerHead: '#f4ede2' },
};
let PAL = PALETTES.a;
export function setVoxelPalette(k) { if (PALETTES[k] && PAL !== PALETTES[k]) { PAL = PALETTES[k]; cache.clear(); } }

const tok = (v, name, n = 9) => { const t = name === 'hammer' ? PAL.build : PAL.tops?.[name] ?? PAL.slab; slab(v, n, t[0], t[1]); };
const MODELS = {
  globe() { const v = builder(); tok(v, 'globe');
    v.ball(4.5, 6.5, 4.5, 3.8, (x, y, z) => (x <= 3 && y >= 6 && z >= 5) || (x >= 5 && y <= 6 && z >= 6) || (z <= 3 && y >= 7 && x >= 4) ? PAL.c2 : PAL.c3); return v.list(); },   // a ball with a few patches of land
  island() { const v = builder(); tok(v, 'island');
    v.box(4, 2, 4, 4, 7, 4, PAL.c4);
    v.box(1, 8, 3, 7, 8, 5, PAL.c3); v.box(3, 8, 1, 5, 8, 7, PAL.c3); v.box(3, 9, 3, 5, 9, 5, PAL.c3); return v.list(); },   // a palm: trunk and a plus of leaves
  chair() { const v = builder(); tok(v, 'chair');
    for (const [x, z] of [[3, 3], [6, 3], [3, 6], [6, 6]]) v.box(x, 2, z, x, 3, z, PAL.c4);
    v.box(3, 4, 3, 6, 4, 6, PAL.c4); v.box(3, 5, 3, 3, 8, 6, PAL.c1); return v.list(); },
  boat() { const v = builder(); tok(v, 'boat');
    v.box(3, 2, 4, 7, 2, 5, PAL.c1); v.box(2, 3, 4, 8, 3, 5, PAL.c1);
    v.box(4, 4, 4, 4, 9, 4, PAL.ink);
    for (let y = 5; y <= 9; y++) for (let x = 5; x <= 5 + Math.floor((9 - y) * .8); x++) v.put(x, y, 4, PAL.c5); return v.list(); },
  hammer() { const v = builder(); tok(v, 'hammer', 12);
    v.box(5, 2, 5, 6, 8, 6, PAL.ink); v.box(2, 9, 4, 9, 11, 7, PAL.hammerHead ?? PAL.c5); return v.list(); },
  plus() { const v = builder(); tok(v, 'plus', 9);   // a fat plus standing up, facing the left of the camera
    v.box(3, 2, 4, 5, 10, 4, PAL.c5); v.box(0, 5, 4, 8, 7, 4, PAL.c5); return v.list(); },
  minus() { const v = builder(); tok(v, 'minus', 9);
    v.box(0, 4, 4, 8, 6, 4, PAL.c5); return v.list(); },
};

const cache = new Map();
/** The data URL of a voxel button picture (rendered once per palette). */
export function voxelURL(name, k = 4) {
  const key = name + k; if (!cache.has(key)) { const f = MODELS[name]; cache.set(key, f ? renderVoxels(f(), { k }).toDataURL() : ''); }
  return cache.get(key);
}
export function voxelEl(name, k = 4) { const im = document.createElement('img'); im.src = voxelURL(name, k); im.alt = ''; im.draggable = false; im.className = 'vx'; return im; }
export const VOXEL_NAMES = Object.keys(MODELS);
