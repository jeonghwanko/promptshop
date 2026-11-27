// Pixel textures for walls and roofs. Every texture is drawn at tiny size and sampled nearest-neighbour,
// so a material reads as a pattern of a few pixels, the same way hand-made pixel art does.
import * as THREE from 'three';

export const shade = (hex, k) => { const c = new THREE.Color(hex); c.multiplyScalar(k); return '#' + c.getHexString(); };
export const mix = (a, b, t) => { const c = new THREE.Color(a).lerp(new THREE.Color(b), t); return '#' + c.getHexString(); };

export function tex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.imageSmoothingEnabled = false; draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
// Nothing goes near black (the bright, sunny look): a dark grey lifts to deep slate blue, a dark colour keeps its hue and only gets lighter
// (turning a brown toward blue would pass through olive).
export function liftDark(color) {
  if (color === undefined || color === null) return color;
  const c = new THREE.Color(color), hsl = {}; c.getHSL(hsl); if (hsl.l >= .3) return color;
  const grey = hsl.s < .15;
  c.setHSL(grey ? .6 : hsl.h, grey ? .3 : Math.min(.75, hsl.s * 1.1), (grey ? .3 : .32) + hsl.l * .3); return '#' + c.getHexString();
}
export const mat = (color, o = {}) => new THREE.MeshLambertMaterial({ color: liftDark(color), ...o });
export const glow = (color) => new THREE.MeshBasicMaterial({ color });
export function texMat(t, rx = 1, ry = 1, o = {}) { const tt = t.clone(); tt.needsUpdate = true; tt.repeat.set(rx, ry); return mat(0xffffff, { map: tt, ...o }); }

let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
const fill = (g, c, x, y, w, h) => { g.fillStyle = c; g.fillRect(x, y, w, h); };

// ---------- walls (12) ----------
// Size of one texture repeat in tiles, so patterns keep the same pixel scale on any wall.
export const WALL = {
  brick: { tile: [0.8, 0.4], draw: (c) => tex(32, 16, (g, w, h) => { fill(g, c, 0, 0, w, h); g.fillStyle = shade(c, .72);
    for (let y = 0; y < h; y += 4) { g.fillRect(0, y, w, 1); for (let x = (y / 4) % 2 ? 4 : 0; x < w; x += 8) g.fillRect(x, y, 1, 4); }
    g.fillStyle = shade(c, 1.15); for (let y = 1; y < h; y += 4) for (let x = (y % 8 < 4 ? 1 : 5); x < w; x += 8) g.fillRect(x, y, 3, 1); }) },
  plaster: { tile: [0.8, 0.8], draw: (c) => tex(32, 32, (g, w, h) => { fill(g, c, 0, 0, w, h); seed = 7; g.fillStyle = shade(c, .93); for (let i = 0; i < 26; i++) g.fillRect(Math.floor(rnd() * w), Math.floor(rnd() * h), 1, 1); }) },
  wood_boards: { tile: [0.8, 0.8], draw: (c) => tex(32, 32, (g, w, h) => { fill(g, c, 0, 0, w, h); g.fillStyle = shade(c, .76); for (let i = 1; i < 6; i++) g.fillRect(Math.round(i * w / 6), 0, 1, h); g.fillStyle = shade(c, 1.1); for (let i = 0; i < 6; i++) g.fillRect(Math.round(i * w / 6) + 2, 3 + i * 5 % h, 1, 2); }) },
  timber_framing: { tile: [1.2, 1.2], draw: (c) => tex(32, 32, (g, w, h) => { fill(g, c, 0, 0, w, h); g.fillStyle = '#4a3020';
    g.fillRect(0, 0, w, 2); g.fillRect(0, h - 2, w, 2); g.fillRect(0, 0, 2, h); g.fillRect(15, 0, 2, h);
    for (let i = 0; i < 15; i++) { g.fillRect(2 + i, 2 + Math.round(i * 28 / 15), 2, 2); g.fillRect(30 - i, 2 + Math.round(i * 28 / 15), 2, 2); } }) },
  stone: { tile: [0.8, 0.4], draw: (c) => tex(32, 16, (g, w, h) => { fill(g, c, 0, 0, w, h); g.fillStyle = shade(c, .78);
    for (let y = 0; y < h; y += 4) { g.fillRect(0, y, w, 1); for (let x = (y / 4) % 2 ? 4 : 0; x < w; x += 8) g.fillRect(x, y, 1, 4); }
    g.fillStyle = shade(c, 1.1); for (let y = 1; y < h; y += 4) for (let x = (y % 8 < 4 ? 1 : 5); x < w; x += 8) g.fillRect(x, y, 3, 1); }) },
  concrete: { tile: [1.2, 0.8], draw: (c) => tex(32, 24, (g, w, h) => { fill(g, c, 0, 0, w, h); g.fillStyle = shade(c, .86); g.fillRect(0, 11, w, 1); g.fillRect(15, 0, 1, h);
    g.fillStyle = shade(c, .9); for (const [x, y] of [[4, 4], [24, 4], [4, 17], [24, 17]]) g.fillRect(x, y, 1, 1); }) },
  glass: { tile: [0.5, 0.5], draw: (c) => tex(16, 16, (g, w, h) => { fill(g, c, 0, 0, w, h); g.fillStyle = shade(c, 1.25); g.fillRect(2, 2, 3, 1); g.fillRect(2, 3, 1, 2); g.fillStyle = '#4a5560'; g.fillRect(0, 0, w, 1); g.fillRect(0, 0, 1, h); }) },
  metal_sheet: { tile: [0.6, 0.8], draw: (c) => tex(16, 16, (g, w, h) => { fill(g, c, 0, 0, w, h); g.fillStyle = shade(c, .78); for (let x = 1; x < w; x += 3) g.fillRect(x, 0, 1, h); g.fillStyle = shade(c, 1.12); for (let x = 2; x < w; x += 3) g.fillRect(x, 0, 1, h); }) },
  marble: { tile: [1, 1], draw: (c) => tex(32, 32, (g, w, h) => { fill(g, c, 0, 0, w, h); g.fillStyle = shade(c, .86); for (let i = 0; i < 30; i++) g.fillRect(i, 6 + Math.round(Math.sin(i / 4) * 3), 1, 1); for (let i = 0; i < 20; i++) g.fillRect(10 + i, 22 + Math.round(Math.cos(i / 3) * 2), 1, 1); g.fillStyle = shade(c, .92); g.fillRect(0, 15, w, 1); }) },
  adobe: { tile: [0.8, 0.8], draw: (c) => tex(32, 32, (g, w, h) => { fill(g, c, 0, 0, w, h); seed = 3; for (let i = 0; i < 40; i++) { g.fillStyle = rnd() > .5 ? shade(c, .9) : shade(c, 1.06); g.fillRect(Math.floor(rnd() * w), Math.floor(rnd() * h), 2, 1); } }) },
  bamboo: { tile: [0.5, 0.8], draw: (c) => tex(16, 32, (g, w, h) => { fill(g, c, 0, 0, w, h); g.fillStyle = shade(c, .75); for (let x = 0; x < w; x += 4) g.fillRect(x, 0, 1, h); for (let x = 0; x < w; x += 4) g.fillRect(x, (x * 3) % 12 + 6, 4, 1); }) },
  tile: { tile: [0.5, 0.5], draw: (c) => tex(16, 16, (g, w, h) => { fill(g, c, 0, 0, w, h); g.fillStyle = shade(c, .8); for (let i = 0; i < w; i += 4) { g.fillRect(i, 0, 1, h); g.fillRect(0, i, w, 1); } }) },
};
export const WALL_MATERIALS = Object.keys(WALL);

// ---------- roofs (10) ----------
export const ROOF = {
  roof_tiles: { tile: [0.6, 0.6], draw: (c) => tex(24, 24, (g, w, h) => { fill(g, c, 0, 0, w, h); g.fillStyle = shade(c, .78);
    for (let y = 5; y < h; y += 6) g.fillRect(0, y, w, 1); for (let y = 0; y < h; y += 6) for (let x = (y / 6) % 2 ? 3 : 0; x < w; x += 6) g.fillRect(x, y, 1, 5);
    g.fillStyle = shade(c, 1.18); for (let y = 0; y < h; y += 6) g.fillRect(0, y, w, 1); }) },
  slate: { tile: [0.6, 0.6], draw: (c) => tex(24, 24, (g, w, h) => { fill(g, c, 0, 0, w, h); g.fillStyle = shade(c, .75); for (let y = 0; y < h; y += 4) { g.fillRect(0, y + 3, w, 1); for (let x = (y / 4) % 2 ? 3 : 0; x < w; x += 6) g.fillRect(x, y, 1, 3); } }) },
  metal_sheet: WALL.metal_sheet,
  copper: { tile: [0.6, 0.6], draw: (c) => tex(16, 16, (g, w, h) => { fill(g, c, 0, 0, w, h); g.fillStyle = shade(c, .8); for (let x = 3; x < w; x += 4) g.fillRect(x, 0, 1, h); g.fillStyle = shade(c, 1.15); g.fillRect(1, 5, 1, 3); g.fillRect(9, 11, 1, 2); }) },
  asphalt_shingle: { tile: [0.5, 0.5], draw: (c) => tex(24, 24, (g, w, h) => { fill(g, c, 0, 0, w, h); g.fillStyle = shade(c, .8);
    for (let y = 0; y < h; y += 4) { g.fillRect(0, y + 3, w, 1); for (let x = (y / 4) % 2 ? 2 : 0; x < w; x += 4) g.fillRect(x, y, 1, 3); } }) },
  gravel: { tile: [0.5, 0.5], draw: (c) => tex(16, 16, (g, w, h) => { fill(g, c, 0, 0, w, h); seed = 11; for (let i = 0; i < 30; i++) { g.fillStyle = rnd() > .5 ? shade(c, .85) : shade(c, 1.12); g.fillRect(Math.floor(rnd() * w), Math.floor(rnd() * h), 1, 1); } }) },
  glass: WALL.glass,
  thatch: { tile: [0.5, 0.5], draw: (c) => tex(16, 16, (g, w, h) => { fill(g, c, 0, 0, w, h); g.fillStyle = shade(c, .78); for (let x = 0; x < w; x += 2) g.fillRect(x, (x * 5) % 4, 1, h); g.fillStyle = shade(c, 1.15); for (let x = 1; x < w; x += 4) g.fillRect(x, 0, 1, h); }) },
  grass: { tile: [0.5, 0.5], draw: (c) => tex(16, 16, (g, w, h) => { fill(g, c, 0, 0, w, h); seed = 5; for (let i = 0; i < 24; i++) { g.fillStyle = rnd() > .5 ? shade(c, .82) : shade(c, 1.18); g.fillRect(Math.floor(rnd() * w), Math.floor(rnd() * h), 1, 2); } }) },
  wood_shingle: { tile: [0.5, 0.5], draw: (c) => tex(24, 24, (g, w, h) => { fill(g, c, 0, 0, w, h); g.fillStyle = shade(c, .74);
    for (let y = 0; y < h; y += 4) { g.fillRect(0, y + 3, w, 1); for (let x = (y / 4) % 2 ? 1 : 3; x < w; x += 5) g.fillRect(x, y, 1, 3); } }) },
};
export const ROOF_MATERIALS = Object.keys(ROOF);

const cache = new Map();
/** A material for `kind` ('wall'|'roof'), sized for a surface of `w` × `h` tiles. */
// Texel size: a pattern's pixels should land near one screen pixel each. Textures are drawn ~40 texels per tile, right for a cut-away at
// twice the map's pixels; the map's half-size render (14 px per tile) would sample them 2.8:1 into speckle, so it draws them bigger.
let TEXEL = 1;
export const setTexel = (k) => { TEXEL = k; };
export function surface(kind, name, color, w = 1, h = 1) {
  const lib = kind === 'roof' ? ROOF : WALL;
  const m = lib[name] ?? (kind === 'roof' ? ROOF.roof_tiles : WALL.plaster);
  const key = kind + name + color;
  if (!cache.has(key)) cache.set(key, m.draw(liftDark(color)));
  return texMat(cache.get(key), Math.max(1, w / (m.tile[0] * TEXEL)), Math.max(1, h / (m.tile[1] * TEXEL)));
}
