// The island palette: every colour a building spec carries (from Claude or a style default) snaps to the nearest swatch
// of its role, so buildings made by different people read as one bright, sunny world (reference: Dave the Diver).
// Nothing near black: the darkest swatches are deep blue and warm brown.

export const PALETTE = {
  wall: ['#f6ead0', '#fbf4e4', '#f0d6a4', '#f5c8a0', '#cfe3b4', '#c9e6ee', '#e2d6c2', '#d6785a', '#d7a06a', '#e0b98a', '#b98058', '#8f6a8c', '#6f86b8'],
  roof: ['#e0704a', '#c8544a', '#5f86b0', '#3f9c96', '#79a85a', '#e0aa48', '#4f6f9a'],
  trim: ['#fff8ea', '#8a5a3c', '#3f5f84', '#f0e0bc'],
  accent: ['#ef5a4a', '#ff9a62', '#ffc94a', '#4fbf7a', '#3d9ee0', '#ff7aa8', '#6fe0c0', '#fff8ea', '#3f5f84'],
};

function lab(hex) {
  let [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v > .04045 ? ((v + .055) / 1.055) ** 2.4 : v / 12.92));
  let x = (r * .4124 + g * .3576 + b * .1805) / .95047, y = r * .2126 + g * .7152 + b * .0722, z = (r * .0193 + g * .1192 + b * .9505) / 1.08883;
  const f = (t) => (t > .008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116); [x, y, z] = [f(x), f(y), f(z)];
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const LAB = Object.fromEntries(Object.entries(PALETTE).map(([k, list]) => [k, list.map(c => [c, lab(c)])]));
const memo = new Map();
/** The swatch of `role` nearest to a #rrggbb colour (lightness counts half, so a hue is kept over a shade). */
export function snap(role, hex) {
  const key = role + hex; if (memo.has(key)) return memo.get(key);
  const a = lab(hex); let best = hex, bd = Infinity;
  for (const [c, p] of LAB[role]) { const d = (a[0] - p[0]) ** 2 * .5 + (a[1] - p[1]) ** 2 + (a[2] - p[2]) ** 2; if (d < bd) { bd = d; best = c; } }
  memo.set(key, best); return best;
}
const HEX = /^#[0-9a-f]{6}$/i;
const roleOf = (parent, key) => (parent === 'wall' || parent === 'plinth' ? 'wall' : parent === 'roof' ? 'roof' : ['trim', 'frames', 'shutters'].includes(key) ? 'trim' : 'accent');
/** Snap every colour in the outside of a normalized spec, in place (floors and their tints are the inside and keep theirs). */
export function snapSpec(spec) {
  const seen = new Set();
  const walk = (o, parent) => { if (!o || typeof o !== 'object' || seen.has(o)) return; seen.add(o);
    for (const k of Object.keys(o)) { if (k === 'floors') continue; const v = o[k];
      if (typeof v === 'string' && HEX.test(v)) o[k] = snap(roleOf(parent, k), v); else if (v && typeof v === 'object') walk(v, Array.isArray(o) ? parent : k); } };
  walk(spec, '');
  return spec;
}
