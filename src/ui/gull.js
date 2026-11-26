// 끼룩이, the guide: a voxel seagull drawn by the same renderer as the buildings (same camera, light and outline).
// Its poses are rendered once (body, wings, beak, eyes), then played as a little animation: it bobs, blinks, opens its
// beak while it talks and flaps when something good happens.
import { renderVoxels } from '../v2/render.js';

const C = { white: '#ffffff', shade: '#dfe6ee', wing: '#9aa7b4', wingDark: '#6f7d8c', tip: '#2e3440', beak: '#ffb52e', beakDark: '#e0861c', mouth: '#b4452f',
  eye: '#1b1f2a', glint: '#ffffff', lid: '#d6dadd', foot: '#ff8a3d', cheek: '#ffb0a8', hat: '#3f7fb0', hatBand: '#ffcf3f' };

function grid() {
  const m = new Map();
  const put = (x, y, z, c) => { if (c) m.set(`${x},${y},${z}`, [x, y, z, c]); else m.delete(`${x},${y},${z}`); };
  const ball = (cx, cy, cz, rx, ry, rz, c) => { for (let x = Math.floor(cx - rx); x <= cx + rx; x++) for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let z = Math.floor(cz - rz); z <= cz + rz; z++)
    if (((x + .5 - cx) / rx) ** 2 + ((y + .5 - cy) / ry) ** 2 + ((z + .5 - cz) / rz) ** 2 <= 1) put(x, y, z, typeof c === 'function' ? c(x, y, z) : c); };
  const box = (x0, y0, z0, x1, y1, z1, c) => { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) put(x, y, z, c); };
  return { put, ball, box, has: (x, y, z) => m.has(`${x},${y},${z}`), list: () => [...m.values()] };
}

/**
 * The gull in one pose, facing the viewer (+z), so both eyes and the beak show; its right wing is toward the viewer's right.
 * wing: 0 folded, 1 half up, 2 up. beak: 0 shut, 1 open. eyes: 0 open, 1 shut. squash: 0..1 (a bounce).
 */
export function gullModel({ wing = 0, beak = 0, eyes = 0, squash = 0 } = {}) {
  const v = grid(), sq = squash, dy = -Math.round(sq * 2);
  // feet: orange, three toes forward
  for (const fx of [7, 12]) { v.box(fx, 0, 8, fx + 1, 2, 9, C.foot); v.box(fx - 1, 0, 10, fx + 2, 0, 12, C.foot); }
  // body: a plump egg; grey on the back, a cool shade underneath
  const by = 10 + dy, bry = 7.5 * (1 - sq * .15);
  v.ball(10, by, 9, 7.6 * (1 + sq * .08), bry, 8, (x, y, z) => z < 5 ? C.wing : y < by - 5 ? C.shade : C.white);
  // tail at the back: grey feathers, dark tips
  v.box(7, by - 1, 0, 13, by + 2, 1, C.wing); v.box(8, by + 1, -1, 12, by + 3, -1, C.wingDark); v.box(9, by + 2, -2, 11, by + 3, -2, C.tip);
  // head: big and round
  const hy = 20 + dy * 1.5, hz = 11;
  v.ball(10, hy, hz, 6.2, 5.8, 6, C.white);
  const front = (x, y) => { for (let z = hz + 8; z > hz - 8; z--) if (v.has(x, y, z)) return z; return null; };   // the head's surface toward the viewer
  const onFace = (x, y, c, out = 0) => { const z = front(x, y); if (z !== null) v.put(x, y, z + out, c); };
  // eyes: dark, with a glint; shut = a smiling line
  for (const ex of [7, 13]) {
    const ey = Math.round(hy + 1);
    if (eyes) { onFace(ex - 1, ey, C.eye); onFace(ex, ey + 1, C.eye); onFace(ex + 1, ey, C.eye); onFace(ex - 1, ey - 1, C.lid); onFace(ex + 1, ey - 1, C.lid); }
    else { for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2]]) onFace(ex - 1 + a, ey - 1 + b, C.eye); onFace(ex - 1, ey + 1, C.glint); }
  }
  // cheeks
  for (const cx of [4, 5, 15, 16]) onFace(cx, Math.round(hy - 2), C.cheek);
  // beak: yellow with a red spot at the tip; open = the lower half drops and the mouth shows
  const bz = front(10, Math.round(hy - 2)) ?? hz + 5, beakY = Math.round(hy - 2);
  v.box(8, beakY, bz, 12, beakY + 1, bz + 2, C.beak); v.box(9, beakY, bz + 3, 11, beakY + 1, bz + 4, C.beak); v.put(10, beakY, bz + 4, C.beakDark);
  if (beak) { v.box(9, beakY - 3, bz, 11, beakY - 3, bz + 3, C.beak); v.box(9, beakY - 2, bz, 11, beakY - 1, bz + 2, C.mouth); }
  else v.box(9, beakY - 1, bz, 11, beakY - 1, bz + 3, C.beakDark);
  // a sailor cap: the island's guide
  const ty = Math.round(hy + 5.5);
  v.ball(10, ty, hz - 1, 4.2, 1, 4.2, C.hatBand); v.ball(10, ty + 1.5, hz - 1, 3.6, 1.4, 3.6, C.hat); v.box(10, ty + 3, hz - 1, 10, ty + 3, hz - 1, C.hatBand);   // a pompom on top
  v.put(10, ty + 1, hz + 3, C.glint);   // a little white badge on the front
  // wings on both sides
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? 2 : 18, xo = side < 0 ? 1 : 19, xf = side < 0 ? 0 : 20, wy = by;
    if (wing === 0) {   // folded: the body's own sides turn grey, darker toward the back, with dark tips behind
      for (const [x, y, z] of v.list().map(q => q.slice(0, 3))) if ((side < 0 ? x <= 4 : x >= 16) && y >= wy - 4 && y <= wy + 3 && z <= 13) v.put(x, y, z, z < 6 ? C.wingDark : C.wing);
      v.box(side < 0 ? 4 : 15, wy - 4, 1, side < 0 ? 5 : 16, wy - 2, 2, C.tip);
    }
    else if (wing === 1) { v.box(x0, wy, 5, xo, wy + 3, 12, C.wing); v.box(xf, wy + 3, 5, xf, wy + 6, 11, C.wing); v.box(xf + side, wy + 6, 6, xf + side, wy + 8, 10, C.wingDark); v.box(xf + side, wy + 8, 7, xf + side, wy + 9, 9, C.tip); }
    else { v.box(x0, wy + 2, 6, xo, wy + 4, 11, C.wing); v.box(xf, wy + 4, 6, xf, wy + 9, 11, C.wing); v.box(xf, wy + 10, 6, xf, wy + 12, 10, C.wingDark); v.box(xf, wy + 13, 7, xf, wy + 14, 9, C.tip); }
  }
  return v.list();
}

/** Every pose the guide plays, rendered once: name → canvas (the standing one at once, the others soon after). */
const POSES = {
  idle: {}, blink: { eyes: 1 }, talk: { beak: 1 }, talkBlink: { beak: 1, eyes: 1 },
  flap1: { wing: 1, beak: 1 }, flap2: { wing: 2, beak: 1 }, hop: { wing: 1, squash: 1 },
};
let frames = null;
export function gullFrames(k = 4) {
  if (frames) return frames;
  frames = {};
  // one common box for all poses, so they line up frame to frame
  const all = Object.values(POSES).flatMap(p => gullModel(p)), xs = all.map(v => v[0]), ys = all.map(v => v[1]), zs = all.map(v => v[2]);
  const pin = [[Math.min(...xs), Math.min(...ys), Math.min(...zs)], [Math.max(...xs), Math.max(...ys), Math.max(...zs)]];
  const draw = (name) => { frames[name] = renderVoxels(gullModel(POSES[name]), { k, bounds: pin, yaw: .38, pitch: .32, character: true }); };   // nearly face on, a little from its right
  draw('idle');   // the rest one at a time when the page is idle, so starting the game does not wait for them
  const rest = Object.keys(POSES).filter(n => n !== 'idle'), later = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 60));
  const next = () => { const n = rest.shift(); if (!n) return; draw(n); later(next); }; later(next);
  return frames;
}

/**
 * 끼룩이 alive in `host`: it bobs (CSS), blinks now and then, opens and shuts its beak while it talks, and flaps when
 * something good happens. Returns { talk(on), cheer() }.
 */
export function mountGull(host, scale = 1) {
  const f = gullFrames(), c = document.createElement('canvas'), any = f.idle;
  c.width = any.width; c.height = any.height; c.className = 'gull'; c.style.width = any.width * scale + 'px'; c.style.height = any.height * scale + 'px';
  host.replaceChildren(c);
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  let talking = false, cheerUntil = 0, blinkAt = performance.now() + 2500, shown = '';
  const draw = (name) => { const im = f[name] ?? f.idle; if (im === shown) return; shown = im; g.clearRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0); };
  const tick = () => {
    if (!c.isConnected) return;
    const t = performance.now();
    let name;
    if (t < cheerUntil) name = ['flap1', 'flap2', 'flap1', 'hop'][Math.floor((cheerUntil - t) / 110) % 4];
    else {
      const blink = t > blinkAt; if (t > blinkAt + 130) blinkAt = t + 2200 + Math.random() * 2600;
      name = talking && Math.floor(t / 120) % 2 ? (blink ? 'talkBlink' : 'talk') : blink ? 'blink' : 'idle';
    }
    draw(name); requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return {
    talk: (on) => { talking = on; },
    cheer: () => { cheerUntil = performance.now() + 880; host.classList.remove('hop'); void host.offsetWidth; host.classList.add('hop'); },
  };
}
