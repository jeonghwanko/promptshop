// Interiors for spec v2: a stack of floors drawn as an exploded cross-section.
// Each floor kind is written once (a range of levels), zones are laid out by a squarified treemap
// around a fixed lift core, and fixtures come from zone templates placed by patterns, never by raw coordinates.
import * as THREE from 'three';
import { surface, mat, glow, shade, tex, texMat } from './materials.js';
import { TYPES } from './catalog.js';

// ---------- zones: what makes each zone recognisable ----------
// pattern: back (along the back wall), left (along the left wall), rows (grid), center, corner, front, cells (rooms in a row)
const Z = (tint, fixtures, opts = {}) => ({ tint, fixtures, ...opts });
export const ZONES = {
  lobby: Z('#e9e2d4', [['rug', 'center'], ['sofa', 'center'], ['plant', 'corner']]),
  reception: Z('#e2dccc', [['counter', 'back', { len: 1.6 }], ['plant', 'corner']]),
  dining: Z('#efe3cc', [['table4', 'rows']]), restaurant: 'dining', canteen: 'dining',
  seating: Z('#f1e6d2', [['table2', 'rows']]), reading: 'seating',
  counter: Z('#e8dcc4', [['counter', 'back', { len: 1.8, on: 'coffee' }], ['stool', 'front']]), bar: 'counter',
  kitchen: Z('#d9dde0', [['stove', 'back'], ['fridge', 'left'], ['prep', 'center']]),
  wc: Z('#dfe8ec', [['toilet', 'back'], ['sink', 'left']]), bath: 'wc',
  aisles: Z('#eef1f2', [['gondola', 'rows'], ['shelf', 'back']]), sales: 'aisles', shop: 'aisles', stalls: Z('#efe3cc', [['stall', 'rows']]),
  checkout: Z('#e4e8ea', [['counter', 'center', { len: 1.2, on: 'register' }]]), tickets: 'checkout',
  stockroom: Z('#d8d2c6', [['crates', 'rows']]), racks: 'stockroom', loading: Z('#cfc9bd', [['crates', 'rows'], ['rolldoor', 'back']]),
  fitting: Z('#efe6ea', [['curtain', 'cells', { cell: 1.0 }]]),
  guest_rooms: Z('#eadfd0', [['bed', 'cells', { cell: 1.6 }]]), units: Z('#eadfd0', [['flat', 'cells', { cell: 2.2 }]]), room: 'guest_rooms', bedroom: Z('#eadfd0', [['bed', 'center'], ['wardrobe', 'left']]),
  offices: Z('#e6e8ea', [['desk', 'rows']]), office: 'offices', consult: Z('#e6eef0', [['desk', 'center'], ['couch', 'left']]),
  hall: Z('#e9e2d4', [['rug', 'center'], ['bench', 'left'], ['plant', 'corner']]), foyer: 'hall', concourse: Z('#e4e0d6', [['board', 'back'], ['bench', 'rows'], ['kiosk', 'corner']]), maru: Z('#d8bf98', [['lowtable', 'center'], ['plant', 'corner']]),
  cells: Z('#d8dadc', [['bench', 'cells', { cell: 1.2 }]]),
  bays: Z('#cfd2d4', [['firetruck', 'rows']]), parking: Z('#c8cbcf', [['car', 'rows']]),
  sorting: Z('#e2ddd2', [['prep', 'rows']]),
  stacks: Z('#eadfcc', [['bookshelf', 'rows']]), library: 'stacks',
  classroom: Z('#efe6d0', [['board', 'back'], ['desk1', 'rows']]), lecture: 'classroom',
  play: Z('#f4e3c4', [['rug', 'center'], ['balls', 'center']]),
  corridor: Z('#e4dfd4', []),
  gym: Z('#e8d9b8', [['court', 'center']]), field: Z('#7fb069', [['court', 'center']]),
  waiting: Z('#e6eef0', [['seats', 'rows']]),
  ward: Z('#eef2f4', [['bed', 'cells', { cell: 1.3, curtain: true }]]), nurse: Z('#e6eef0', [['counter', 'center', { len: 1.4 }]]), or: Z('#dfeaea', [['bed', 'center'], ['lamp', 'center']]),
  gallery: Z('#f1ede6', [['pedestal', 'rows'], ['frame', 'back']]),
  auditorium: Z('#7a2e3a', [['stage', 'back'], ['seats', 'rows']]), stands: Z('#c8cbcf', [['seats', 'rows']]), stage: Z('#5a3a2a', [['stage', 'back']]),
  cardio: Z('#d9dde0', [['treadmill', 'rows']]), weights: Z('#d0d4d8', [['weights', 'rows']]), lockers: Z('#dfe3e6', [['locker', 'back'], ['bench', 'center']]),
  pool: Z('#dfe8ec', [['pool', 'center']]),
  lanes: Z('#d8b88a', [['lane', 'rows']]),
  platforms: Z('#c8c4ba', [['platform', 'front'], ['bench', 'rows']]),
  production: Z('#cfcfc8', [['machine', 'rows'], ['conveyor', 'front']]), workshop: Z('#cfcac0', [['prep', 'rows'], ['shelf', 'back']]),
  loft: Z('#d8c39a', [['crates', 'rows']]),
  living: Z('#eadfcc', [['rug', 'center'], ['sofa', 'center'], ['tv', 'back'], ['plant', 'corner']]),
  nave: Z('#e9e2d4', [['altar', 'back'], ['pew', 'rows']]), altar: Z('#e2d8c4', [['altar', 'center']]), prayer_hall: Z('#e9dcc4', [['prayer', 'rows']]),
  lounge: Z('#e2d6c4', [['sofa', 'rows'], ['plant', 'corner']]),
};
const zoneDef = (name) => { let z = ZONES[name]; while (typeof z === 'string') z = ZONES[z]; return z ?? ZONES.lobby; };
export const ZONE_NAMES = Object.keys(ZONES);
// zones that fill repeated upper floors, and zones that like the top floor
const REPEAT = new Set(['guest_rooms', 'units', 'classroom', 'ward', 'offices', 'parking', 'lecture', 'stacks', 'room']);
const TOP = new Set(['restaurant', 'lounge', 'pool', 'gallery']);
// zones that belong at the entrance: kept on the ground floor when upper floors repeat the rest
const ENTRY = new Set(['lobby', 'reception', 'foyer', 'hall', 'checkout', 'tickets', 'waiting', 'concourse', 'counter', 'kitchen', 'wc', 'shop']);

/** Default floors for a type: public zones on the ground floor, repeated zones above, a special top floor if there is one. */
export function defaultFloors(typeName, levels) {
  const zones = (TYPES[typeName]?.zones ?? ['hall']).filter(z => z !== 'core');
  if (levels <= 1) return [{ range: [1, 1], name: '1층', zones }];
  const rep = zones.filter(z => REPEAT.has(z)), top = levels >= 3 ? zones.filter(z => TOP.has(z) && !REPEAT.has(z)) : [];
  let ground = zones.filter(z => !rep.includes(z) && !top.includes(z));
  if (!ground.length) ground = ['lobby'];
  const floors = [{ range: [1, 1], name: '1층', zones: ground }];
  const upperEnd = top.length ? levels - 1 : levels;
  const upper = rep.length ? rep : (zones.filter(z => !ENTRY.has(z) && !top.includes(z)).length ? zones.filter(z => !ENTRY.has(z) && !top.includes(z)) : ground);
  if (!rep.length && upper !== ground) ground = ground.filter(z => ENTRY.has(z)).concat(upper.slice(0, 1));
  if (upperEnd >= 2) floors.push({ range: [2, upperEnd], name: upperEnd > 2 ? `2~${upperEnd}층` : '2층', zones: upper });
  if (top.length) floors.push({ range: [levels, levels], name: `${levels}층`, zones: top });
  return floors;
}

// ---------- squarified treemap ----------
function squarify(items, x, z, w, d) {
  const total = items.reduce((a, b) => a + b.weight, 0) || 1, out = [];
  let rest = items.map(it => ({ ...it, area: it.weight / total * w * d })), rx = x, rz = z, rw = w, rd = d;
  while (rest.length) {
    const short = Math.min(rw, rd); let row = [rest[0]], best = worst(row, short);
    for (let i = 1; i < rest.length; i++) { const t = [...row, rest[i]], s = worst(t, short); if (s > best) break; row = t; best = s; }
    const sum = row.reduce((a, b) => a + b.area, 0);
    if (rw >= rd) { const cw = sum / rd; let cz = rz; for (const it of row) { const h = it.area / cw; out.push({ ...it, x: rx, z: cz, w: cw, d: h }); cz += h; } rx += cw; rw -= cw; }
    else { const ch = sum / rw; let cx = rx; for (const it of row) { const ww = it.area / ch; out.push({ ...it, x: cx, z: rz, w: ww, d: ch }); cx += ww; } rz += ch; rd -= ch; }
    rest = rest.slice(row.length);
  }
  return out;
  function worst(row, s) { const sum = row.reduce((a, b) => a + b.area, 0), mx = Math.max(...row.map(r => r.area)), mn = Math.min(...row.map(r => r.area)); return Math.max(s * s * mx / (sum * sum), sum * sum / (s * s * mn)); }
}

// ---------- the section ----------
/**
 * @param {object} b  normalized building (spec.js), with b.floors (from normalizeFloors)
 * @returns {{group: THREE.Group, labels: {pos: THREE.Vector3, text: string}[]}}
 */
export function buildSection(b) {
  const root = new THREE.Group(), labels = [];
  const main = b.masses.find(m => m.at === 'main') ?? b.masses[0];
  const W = Math.min(7, Math.max(3.2, main.size[0] * 1.7)), D = Math.min(5, Math.max(2.6, main.size[1] * 1.7));
  const multi = b.levels > 1, core = multi ? { x: W - 1.1, z: 0, w: 1.1, d: 1.2 } : null;
  const GAP = Math.max(3.2, (W + D) * 0.42 + 1.2), WH = 1.3;
  const wallColor = main.wall.color, floors = b.floors;
  let cur = root;
  const add = (o) => { o.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } }); cur.add(o); return o; };
  const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y + h / 2, z); return add(o); };
  const cyl = (r1, r2, h, m, x, y, z, s = 10) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, s), m); o.position.set(x, y + h / 2, z); return add(o); };
  const ball = (r, m, x, y, z) => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), m); o.position.set(x, y, z); return add(o); };
  const ox = -W / 2, oz = -D / 2;   // floor local (0..W, 0..D) → world
  FIX = fixtures(box, cyl, ball);

  floors.forEach((f, i) => {
    const g = new THREE.Group(); g.position.y = i * GAP; root.add(g); cur = g;
    const count = f.range[1] - f.range[0] + 1;
    // ghost plates under a merged floor
    if (count > 1) for (let k = 1; k <= Math.min(3, count - 1); k++) box(W, .08, D, mat(shade(wallColor, .7 - k * .08)), 0, -k * .32, 0);
    box(W + .1, .14, D + .1, mat(shade(wallColor, .6)), 0, -.14, 0);
    box(W, WH, .1, surface('wall', main.wall.material, wallColor, W, WH), 0, 0, oz - .05);
    box(.1, WH, D, surface('wall', main.wall.material, wallColor, D, WH), ox - .05, 0, 0);
    box(W, .16, .06, mat(shade(wallColor, .6)), 0, 0, -oz); box(.06, .16, D, mat(shade(wallColor, .6)), -ox, 0, 0);
    // zones
    const items = f.zones.map(z => ({ zone: z.zone ?? z, weight: z.weight ?? 1 }));
    const areaW = core ? W - core.w : W;
    const rects = squarify(items, 0, 0, areaW, D);
    if (core) rects.push({ zone: 'corridor', x: areaW, z: core.d, w: core.w, d: D - core.d });
    for (const r of rects) {
      const def = zoneDef(r.zone);
      box(r.w - .04, .02, r.d - .04, mat(f.tint ? shade(f.tint, 1) : def.tint), ox + r.x + r.w / 2, 0, oz + r.z + r.d / 2);
      // low partitions on inner edges, with a doorway gap
      if (r.x > .01) partition(ox + r.x, oz + r.z, oz + r.z + r.d, 'x');
      if (r.z > .01) partition(oz + r.z, ox + r.x, ox + r.x + r.w, 'z');
      for (const [kind, pattern, o] of def.fixtures) place(kind, pattern, o ?? {}, r);
      for (const fx of f.fixtures ?? []) if (fx.zone === r.zone) place(fx.kind, fx.pattern ?? 'rows', { color: fx.color, count: fx.count }, r);
    }
    if (core) { // lift core: shaft walls, doors, a small stair
      box(core.w, WH, .06, mat('#b8bcc2'), ox + core.x + core.w / 2, 0, oz + core.d);
      box(.5, 1.0, .03, mat('#d8dde2'), ox + core.x + .35, 0, oz + core.d + .04);
      box(.02, 1.0, .04, mat('#8a9098'), ox + core.x + .35, 0, oz + core.d + .05);
      for (let s = 0; s < 4; s++) box(.4, .1 * (s + 1), .22, mat('#cfc9bd'), ox + core.x + .85, 0, oz + core.d - .15 - s * .22);
    }
    labels.push({ pos: new THREE.Vector3(ox - .1, i * GAP + .2, -oz), text: f.name, count });
  });
  // the lift shaft that threads the floors
  if (core && floors.length > 1) {
    cur = root;
    const h = (floors.length - 1) * GAP + WH;
    box(core.w * .8, h, core.d * .8, mat('#9fc3d0', { transparent: true, opacity: .25, depthWrite: false }), ox + core.x + core.w / 2, 0, oz + core.d / 2);
    box(.5, .5, .5, mat('#e3b448'), ox + core.x + core.w / 2, GAP * .5, oz + core.d / 2);
  }
  return { group: root, labels };

  function partition(at, a0, a1, axis) {
    const len = a1 - a0, gap = Math.min(.7, len * .4), mid = (a0 + a1) / 2, m = mat(shade(wallColor, .92));
    for (const [s, e] of [[a0, mid - gap / 2], [mid + gap / 2, a1]]) {
      if (e - s < .05) continue;
      if (axis === 'x') box(.06, .45, e - s, m, at, 0, (s + e) / 2); else box(e - s, .45, .06, m, (s + e) / 2, 0, at);
    }
  }

  // ---------- placing fixtures by pattern ----------
  function place(kind, pattern, o, r) {
    const x0 = ox + r.x, z0 = oz + r.z, w = r.w, d = r.d, F = FIX[kind];
    if (!F) return;
    const [fw, fd] = F.size;
    if (pattern === 'center') return F.draw(x0 + w / 2, z0 + d / 2, o);
    if (pattern === 'corner') return F.draw(x0 + w - .3, z0 + d - .3, o);
    if (pattern === 'back' || pattern === 'front') {
      const z = pattern === 'back' ? z0 + fd / 2 + .08 : z0 + d - fd / 2 - .12;
      const n = o.len ? 1 : Math.max(1, Math.min(o.count ?? 9, Math.floor((w - .3) / (fw + .25))));
      for (let k = 0; k < n; k++) F.draw(x0 + (k + .5) * w / n, z, o);
      return;
    }
    if (pattern === 'left') { const n = Math.max(1, Math.min(4, Math.floor((d - .3) / (fd + .3)))); for (let k = 0; k < n; k++) F.draw(x0 + fw / 2 + .08, z0 + (k + .5) * d / n, { ...o, rot: 90 }); return; }
    if (pattern === 'rows') {
      const sx = fw + .35, sz = fd + .45, nx = Math.max(1, Math.floor((w - .2) / sx)), nz = Math.max(1, Math.floor((d - .3) / sz));
      let n = 0; for (let a = 0; a < nz; a++) for (let c = 0; c < nx; c++) { if (o.count && n++ >= o.count) return; F.draw(x0 + (c + .5) * w / nx, z0 + (a + .5) * d / nz, o); }
      return;
    }
    if (pattern === 'cells') {
      const cw = o.cell ?? 1.4, n = Math.max(1, Math.floor(w / cw)), m = mat(shade(wallColor, .95));
      for (let k = 0; k < n; k++) {
        const cx = x0 + (k + .5) * w / n;
        if (k > 0) box(.06, .9, d * .75, m, x0 + k * w / n, 0, z0 + d * .375);
        F.draw(cx, z0 + Math.min(d * .3, .7), o);
        if (o.curtain) box(.5, .8, .02, mat('#9fc3d0'), cx, 0, z0 + Math.min(d * .3, .7) + .55);
      }
    }
  }
}

// ---------- fixtures ----------
// size [w, d] is the footprint used for spacing; draw(x, z, opts) adds meshes at floor height 0.
let FIX = {};
function fixtures(box, cyl, ball) {
  const wood = mat('#a8703e'), dark = mat('#4a3a2a'), steel = mat('#b8bcc2'), white = mat('#f4f1ea');
  const chair = (x, z, c = '#8a6a4a') => { box(.22, .04, .22, mat(c), x, .32, z); box(.04, .32, .04, mat(shade(c, .7)), x, 0, z); };
  return {
    rug: { size: [1.6, 1.1], draw: (x, z, o) => box(1.6, .02, 1.1, mat(o.color ?? '#a8453a'), x, .02, z) },
    sofa: { size: [1.1, .5], draw: (x, z, o) => { const c = o.color ?? '#5b8a6a'; box(1.1, .3, .45, mat(c), x, 0, z); box(1.1, .32, .12, mat(shade(c, .85)), x, .3, z - .17); } },
    plant: { size: [.4, .4], draw: (x, z) => { cyl(.12, .09, .22, mat('#b8643c'), x, 0, z, 8); ball(.2, mat('#4f8f46'), x, .38, z); } },
    counter: { size: [1.6, .45], draw: (x, z, o) => { const L = o.len ?? 1.6; box(L, .7, .45, wood, x, 0, z); box(L + .06, .05, .5, mat('#d8b07a'), x, .7, z);
      if (o.on === 'register') box(.25, .15, .2, mat('#2e2e2e'), x, .75, z); if (o.on === 'coffee') box(.3, .3, .25, mat('#2e2e2e'), x - L * .3, .75, z); } },
    stool: { size: [.3, .3], draw: (x, z) => { cyl(.1, .1, .04, wood, x, .4, z, 8); cyl(.025, .025, .4, dark, x, 0, z, 4); } },
    table4: { size: [.8, .8], draw: (x, z, o) => { cyl(.28, .28, .04, mat(o.color ?? '#a8703e'), x, .45, z, 10); cyl(.04, .04, .45, dark, x, 0, z, 6); for (const [a, b] of [[-.38, 0], [.38, 0], [0, -.38], [0, .38]]) chair(x + a, z + b); } },
    table2: { size: [.6, .5], draw: (x, z, o) => { box(.4, .04, .4, mat(o.color ?? '#a8703e'), x, .42, z); box(.04, .42, .04, dark, x, 0, z); chair(x - .3, z); chair(x + .3, z); } },
    stove: { size: [.6, .5], draw: (x, z) => { box(.6, .65, .5, steel, x, 0, z); box(.62, .04, .52, mat('#3a3d42'), x, .65, z); cyl(.14, .12, .2, mat('#c0c4c8'), x, .69, z, 8); } },
    fridge: { size: [.5, .5], draw: (x, z) => { box(.5, 1.1, .45, mat('#e4e8ea'), x, 0, z); box(.02, .9, .4, mat('#9fc3d0', { emissive: 0x203040 }), x + .26, .1, z); } },
    prep: { size: [1.0, .5], draw: (x, z) => { box(1.0, .6, .5, steel, x, 0, z); box(.3, .06, .2, mat('#f4f1ea'), x, .6, z); } },
    toilet: { size: [.4, .5], draw: (x, z) => { box(.3, .35, .4, white, x, 0, z); box(.3, .3, .12, white, x, .2, z - .16); } },
    sink: { size: [.4, .4], draw: (x, z) => { box(.4, .5, .35, white, x, 0, z); } },
    gondola: { size: [1.2, .4], draw: (x, z) => { box(1.2, .7, .35, mat('#d8dde2'), x, 0, z); for (let k = 0; k < 4; k++) box(.2, .14, .3, mat(['#e2432f', '#2e86ab', '#e3b448', '#5b8a6a'][k]), x - .45 + k * .3, .7, z); } },
    shelf: { size: [1.2, .3], draw: (x, z) => { box(1.2, 1.1, .3, mat('#8a6a4a'), x, 0, z); for (let k = 0; k < 5; k++) box(.18, .2, .22, mat(['#e2432f', '#2e86ab', '#e3b448', '#5b8a6a', '#8064a2'][k]), x - .45 + k * .22, .55, z + .04); } },
    stall: { size: [.9, .6], draw: (x, z) => { box(.9, .5, .5, wood, x, 0, z); for (let k = 0; k < 3; k++) ball(.1, mat(['#e2432f', '#e3b448', '#5b8a6a'][k]), x - .25 + k * .25, .58, z); box(.9, .05, .5, mat('#e2432f'), x, 1.0, z); } },
    crates: { size: [.7, .7], draw: (x, z) => { box(.5, .4, .5, surface('wall', 'wood_boards', '#b8894e', .5, .4), x, 0, z); box(.4, .35, .4, surface('wall', 'wood_boards', '#c99a5e', .4, .35), x + .05, .4, z); } },
    rolldoor: { size: [1.0, .1], draw: (x, z) => box(1.0, 1.0, .04, mat('#b8bcc4'), x, 0, z - .02) },
    curtain: { size: [.8, .6], draw: (x, z) => { box(.7, .9, .02, mat('#c06080'), x, 0, z + .3); box(.3, .02, .3, mat('#d8b07a'), x, .02, z); } },
    bed: { size: [.7, 1.0], draw: (x, z, o) => { box(.65, .3, 1.0, white, x, 0, z + .1); box(.65, .06, .6, mat(o.color ?? '#8a2b3a'), x, .3, z + .3); box(.6, .12, .2, white, x, .3, z - .28); box(.7, .5, .06, wood, x, 0, z - .42); } },
    flat: { size: [1.8, 1.2], draw: (x, z) => { box(.65, .3, 1.0, white, x - .45, 0, z + .1); box(.65, .06, .6, mat('#5b8a6a'), x - .45, .3, z + .3); box(.7, .3, .35, mat('#c06040'), x + .45, 0, z + .4); box(.4, .04, .4, wood, x + .45, .42, z - .2); } },
    wardrobe: { size: [.5, .4], draw: (x, z) => box(.5, 1.2, .4, wood, x, 0, z) },
    desk: { size: [.8, .7], draw: (x, z) => { box(.8, .04, .45, mat('#e4e8ea'), x, .5, z); box(.04, .5, .4, mat('#9aa0a6'), x - .36, 0, z); box(.04, .5, .4, mat('#9aa0a6'), x + .36, 0, z); box(.3, .22, .03, mat('#2e2e2e'), x, .54, z - .12); chair(x, z + .35, '#3b4150'); } },
    desk1: { size: [.5, .5], draw: (x, z) => { box(.45, .04, .3, wood, x, .42, z); box(.04, .42, .04, dark, x, 0, z); chair(x, z + .25, '#2e5d8a'); } },
    couch: { size: [.5, 1.0], draw: (x, z) => box(.5, .45, 1.0, mat('#9fc3d0'), x, 0, z) },
    lowtable: { size: [.9, .6], draw: (x, z) => { box(.9, .08, .6, mat('#6b4026'), x, .2, z); for (const [a, b] of [[-.35, -.2], [.35, -.2], [-.35, .2], [.35, .2]]) box(.06, .2, .06, mat('#4a3020'), x + a, 0, z + b); } },
    bench: { size: [.9, .3], draw: (x, z) => { box(.9, .05, .3, wood, x, .3, z); box(.06, .3, .26, dark, x - .38, 0, z); box(.06, .3, .26, dark, x + .38, 0, z); } },
    board: { size: [1.4, .1], draw: (x, z) => { box(1.4, .7, .04, mat('#2f4a3a'), x, .55, z - .02); box(1.44, .04, .06, wood, x, .53, z); } },
    kiosk: { size: [.6, .6], draw: (x, z) => { box(.6, .9, .6, mat('#e3b448'), x, 0, z); } },
    seats: { size: [1.2, .4], draw: (x, z, o) => { for (let k = 0; k < 4; k++) { box(.24, .06, .26, mat(o.color ?? '#8a2b3a'), x - .45 + k * .3, .3, z); box(.24, .3, .05, mat(shade(o.color ?? '#8a2b3a', .8)), x - .45 + k * .3, .3, z + .12); } box(1.2, .3, .04, dark, x, 0, z); } },
    stage: { size: [2.0, .9], draw: (x, z) => { box(2.0, .3, .9, mat('#6b4026'), x, 0, z); box(2.0, 1.1, .05, mat('#8a2b3a'), x, .3, z - .42); } },
    treadmill: { size: [.5, .9], draw: (x, z) => { box(.45, .12, .85, mat('#2e2e2e'), x, 0, z); box(.45, .06, .1, mat('#5b5b5b'), x, .75, z - .38); box(.04, .75, .04, mat('#5b5b5b'), x - .2, 0, z - .38); box(.04, .75, .04, mat('#5b5b5b'), x + .2, 0, z - .38); } },
    weights: { size: [1.0, .4], draw: (x, z) => { box(1.0, .5, .3, mat('#4a4a4a'), x, 0, z); for (let k = 0; k < 4; k++) cyl(.08, .08, .1, mat('#2b2b2b'), x - .35 + k * .23, .5, z, 8); } },
    locker: { size: [1.2, .35], draw: (x, z) => { for (let k = 0; k < 4; k++) box(.28, 1.1, .35, mat(k % 2 ? '#5b7a9a' : '#4f6e8e'), x - .45 + k * .3, 0, z); } },
    pool: { size: [2.4, 1.6], draw: (x, z) => { box(2.4, .05, 1.6, mat('#e8eef2'), x, 0, z); box(2.2, .06, 1.4, mat('#4fb3d9', { emissive: 0x0a3040 }), x, .01, z); } },
    lane: { size: [.5, 2.0], draw: (x, z) => { box(.45, .03, 2.0, mat('#e8c088'), x, .01, z); for (let k = 0; k < 3; k++) cyl(.04, .05, .18, white, x - .1 + k * .1, .04, z - .85, 6); } },
    platform: { size: [2.0, .5], draw: (x, z) => { box(2.4, .3, .5, mat('#9aa0a6'), x, 0, z); box(2.4, .02, .06, mat('#e3b448'), x, .3, z - .2); } },
    machine: { size: [.8, .7], draw: (x, z) => { box(.8, .8, .6, mat('#6f7f8f'), x, 0, z); box(.3, .2, .02, glow('#7fdfa0'), x, .5, z + .31); cyl(.12, .12, .2, mat('#e3b448'), x + .25, .8, z, 8); } },
    conveyor: { size: [2.0, .4], draw: (x, z) => { box(2.0, .4, .35, mat('#3a3d42'), x, 0, z); for (let k = 0; k < 4; k++) box(.2, .14, .2, mat('#c99a5e'), x - .7 + k * .45, .4, z); } },
    car: { size: [.6, 1.0], draw: (x, z, o) => { box(.55, .25, .95, mat(o.color ?? '#2e86ab'), x, .05, z); box(.5, .2, .5, mat(shade(o.color ?? '#2e86ab', .8)), x, .3, z); } },
    firetruck: { size: [.7, 1.4], draw: (x, z) => { box(.65, .5, 1.35, mat('#c23b2b'), x, .05, z); box(.5, .08, 1.0, mat('#d8d8d8'), x, .55, z + .1); } },
    pedestal: { size: [.5, .5], draw: (x, z, o) => { box(.4, .6, .4, white, x, 0, z); ball(.14, mat(o.color ?? '#c9a24a'), x, .75, z); } },
    frame: { size: [.8, .1], draw: (x, z, o) => box(.6, .45, .03, mat(o.color ?? '#8064a2'), x, .65, z - .03) },
    tv: { size: [1.0, .3], draw: (x, z) => { box(.9, .3, .3, wood, x, 0, z); box(.8, .45, .04, mat('#1d1f2a'), x, .35, z); } },
    altar: { size: [1.2, .5], draw: (x, z) => { box(1.2, .6, .5, mat('#e8dcc4'), x, 0, z); cyl(.03, .03, .4, mat('#c9a24a'), x, .6, z, 4); box(.3, .04, .04, mat('#c9a24a'), x, .88, z); } },
    pew: { size: [1.2, .4], draw: (x, z) => { box(1.2, .05, .3, wood, x, .3, z); box(1.2, .35, .05, wood, x, .3, z + .14); box(1.2, .3, .04, dark, x, 0, z); } },
    prayer: { size: [.5, .8], draw: (x, z) => box(.45, .02, .75, mat('#8a2b3a'), x, .01, z) },
    balls: { size: [.6, .6], draw: (x, z) => { ball(.12, mat('#e2432f'), x - .2, .12, z); ball(.12, mat('#2e86ab'), x + .1, .12, z + .15); ball(.12, mat('#e3b448'), x + .2, .12, z - .15); } },
    court: { size: [2.2, 1.6], draw: (x, z) => { box(2.2, .02, 1.6, mat('#c98a4b'), x, .01, z); box(2.0, .025, .03, white, x, .01, z); box(.03, .025, 1.4, white, x, .01, z); } },
    lamp: { size: [.3, .3], draw: (x, z) => { cyl(.02, .02, 1.2, steel, x + .4, 0, z, 4); ball(.12, glow('#fff2c0'), x + .4, 1.2, z); } },
  };
}
export const FIXTURE_NAMES = ['rug', 'sofa', 'plant', 'counter', 'stool', 'table4', 'table2', 'stove', 'fridge', 'prep', 'toilet', 'sink', 'gondola', 'shelf', 'stall', 'crates', 'rolldoor', 'curtain', 'bed', 'flat', 'wardrobe', 'desk', 'desk1', 'couch', 'lowtable', 'bench', 'board', 'kiosk', 'seats', 'stage', 'treadmill', 'weights', 'locker', 'pool', 'lane', 'platform', 'machine', 'conveyor', 'car', 'firetruck', 'pedestal', 'frame', 'tv', 'altar', 'pew', 'prayer', 'balls', 'court', 'lamp'];
