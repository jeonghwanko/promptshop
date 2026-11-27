// Interiors for spec v2: a stack of floors drawn as an exploded cross-section.
// Each floor kind is written once (a range of levels), zones are laid out by a squarified treemap
// around a fixed lift core, and fixtures come from zone templates placed by patterns, never by raw coordinates.
import * as THREE from 'three';
import { surface, mat, glow, shade, tex, texMat } from './materials.js';
import { TYPES } from './catalog.js';
import { QUEUE_FRONT, QUEUE_GAP } from './inside.js';

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
  ring: Z('#d9dde0', [['ring', 'center'], ['bench', 'left']]), diamond: Z('#5f9e4f', [['diamond', 'center']]),
};
const zoneDef = (name) => { let z = ZONES[name]; while (typeof z === 'string') z = ZONES[z]; return z ?? ZONES.lobby; };
export const ZONE_NAMES = Object.keys(ZONES);
/** Furniture kinds a zone comes with. */
export const zoneFixtures = (name) => [...new Set(zoneDef(name).fixtures.map(f => f[0]))];
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

// ---------- the front door ----------
// Guests come in through the front edge of the ground floor, into the zone meant for them, never through the kitchen.
const DOOR_PREF = ['counter', 'checkout', 'tickets', 'lobby', 'reception', 'foyer', 'hall', 'concourse', 'shop', 'aisles', 'sales', 'stalls', 'seating', 'dining', 'restaurant', 'canteen', 'bar', 'waiting', 'gallery', 'lounge', 'maru', 'living'];
const BACK = new Set(['kitchen', 'stockroom', 'racks', 'loading', 'wc', 'bath', 'bedroom', 'corridor', 'production', 'workshop', 'nurse', 'or', 'lockers']);
function doorOf(zones, front, ox, W) {
  const atFront = zones.filter(z => z.z + z.d >= front - .05 && !BACK.has(z.zone));
  const rank = (z) => { const i = DOOR_PREF.indexOf(z.zone); return i < 0 ? 99 : i; };
  const z = atFront.sort((a, b) => rank(a) - rank(b) || b.w - a.w)[0];
  return z ? { x: z.x + z.w / 2, z: front } : { x: ox + W / 2, z: front };
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
/**
 * @param b normalized building
 * @param opts.owned how many fixtures are bought (in drawing order); the rest are drawn as see-through ghosts.
 *        Leave it undefined to draw every fixture solid.
 */
/** How far apart the rooms are spread compared with the layout size. */
export const SPREAD = 1.5, SPREAD_MAX = 2.3;
/** Layout rules: 1 filled every wall with fixtures; 2 (now) puts a few per zone so the rooms breathe. Saved plots carry the version they were bought under. */
export const LAYOUT = 2;
/**
 * look: how the cut-away is drawn, never where things are (the sim's plan stays the same).
 *   wallH  height of the two back walls (default 1.3; lower walls leave the floor and the fixtures in view)
 *   floor  brightness of the zone floors (1 = the zone tint; below 1 sets the furniture off from the floor)
 *   plainWall  walls in their plain colour, without the material's pattern
 */
export function buildSection(b, { owned, floor, layout = LAYOUT, look = {} } = {}) {
  const few = layout >= 2;
  const placed = [], groups = [];   // groups: each fixture's meshes and footprint, to move it off the aisle   // every fixture placed, in order: { kind, zone, floor, fi, x, y, z }
  const isOwned = (i) => owned === undefined || (typeof owned === 'number' ? i < owned : owned.has(i));
  const plan = { floors: [] };   // where things are, in world units, for a sim that runs inside
  let floorName = '', floorIdx = 0;
  const root = new THREE.Group(), labels = [];
  const main = b.masses.find(m => m.at === 'main') ?? b.masses[0];
  const W = Math.min(7, Math.max(3.2, main.size[0] * 1.7)), D = Math.min(5, Math.max(2.6, main.size[1] * 1.7));
  const multi = b.levels > 1, core = multi ? { x: W - 1.1, z: 0, w: 1.1, d: 1.2 } : null;
  const GAP = Math.max(3.2, (W + D) * 0.42 + 1.2), WH = look.wallH ?? 1.3, FK = look.floor ?? 1;
  const wallColor = main.wall.color, floors = b.floors;
  let cur = root;
  const add = (o) => { o.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } }); cur.add(o); return o; };
  const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y + h / 2, z); return add(o); };
  const cyl = (r1, r2, h, m, x, y, z, s = 10) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, s), m); o.position.set(x, y + h / 2, z); return add(o); };
  const ball = (r, m, x, y, z) => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), m); o.position.set(x, y, z); return add(o); };
  const ox = -W / 2, oz = -D / 2;   // floor local (0..W, 0..D) → world
  // The rooms are laid out at the old size (so the same fixtures, in the same order, come out), then spread apart by S:
  // floors, walls and zones stretch, fixtures keep their own size and only move. Guests walk S times faster to match.
  let S = 1;   // set after every floor is laid out, from how much floor the fixtures cover
  const floorGroups = [];
  const spreadArch = (grp) => { for (const m of grp.children) { if (!m.isMesh || m.userData.fixture) continue; m.position.x *= S; m.position.z *= S;
    const pr = m.geometry.parameters ?? {}; if ((pr.width ?? 0) > .3) m.scale.x = S; if ((pr.depth ?? 0) > .3) m.scale.z = S; } };
  FIX = fixtures(box, cyl, ball);

  floors.forEach((f, i) => {
    floorName = f.name;
    const g = new THREE.Group(); g.position.y = i * GAP; root.add(g); cur = g; floorGroups.push(g);
    const fplan = { y: i * GAP, name: f.name, zones: [] }; plan.floors.push(fplan); floorIdx = i;
    const count = f.range[1] - f.range[0] + 1;
    // ghost plates under a merged floor
    if (count > 1) for (let k = 1; k <= Math.min(3, count - 1); k++) box(W, .08, D, mat(shade(wallColor, .7 - k * .08)), 0, -k * .32, 0);
    box(W + .1, .14, D + .1, mat(shade(wallColor, .6)), 0, -.14, 0);
    const wallM = (len) => look.plainWall ? mat(wallColor) : surface('wall', main.wall.material, wallColor, len, WH);
    box(W, WH, .1, wallM(W), 0, 0, oz - .05);
    box(.1, WH, D, wallM(D), ox - .05, 0, 0);
    box(W, .16, .06, mat(shade(wallColor, .6)), 0, 0, -oz); box(.06, .16, D, mat(shade(wallColor, .6)), -ox, 0, 0);
    // zones
    const items = f.zones.map(z => ({ zone: z.zone ?? z, weight: z.weight ?? 1 }));
    const areaW = core ? W - core.w : W;
    const rects = squarify(items, 0, 0, areaW, D);
    if (core) rects.push({ zone: 'corridor', x: areaW, z: core.d, w: core.w, d: D - core.d });
    for (const r of rects) {
      const def = zoneDef(r.zone);
      fplan.zones.push({ zone: r.zone, x: ox + r.x, z: oz + r.z, w: r.w, d: r.d });
      box(r.w - .04, .02, r.d - .04, mat(shade(f.tint ?? def.tint, FK)), ox + r.x + r.w / 2, 0, oz + r.z + r.d / 2);
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
  // spread the rooms: the more floor the fixtures cover, the wider (one factor for the whole building, so the lift lines up)
  { const area = W * D, cover = floorGroups.map((_, i) => groups.filter(q => q.fi === i).reduce((t, q) => t + q.w * q.d, 0) / area);
    S = Math.max(SPREAD, Math.min(SPREAD_MAX, 1 + Math.max(0, ...cover) * 2.4)); }
  floorGroups.forEach((g, i) => {
    for (const q of groups) if (q.fi === i) { const f = placed[q.idx]; q.fg.position.x = f.x * (S - 1); q.fg.position.z = f.z * (S - 1); f.x *= S; f.z *= S; }
    spreadArch(g); for (const zn of plan.floors[i].zones) { zn.x *= S; zn.z *= S; zn.w *= S; zn.d *= S; }
    makeAisle(g, plan.floors[i], i);
  });
  for (const l of labels) { l.pos.x *= S; l.pos.z *= S; }
  // one floor at a time: every floor is still laid out (fixture numbers and the sim's plan stay whole), only the others are left out of the picture
  const only = floor !== undefined && floors.length > 1 ? Math.max(0, Math.min(floors.length - 1, floor)) : -1;
  if (only >= 0) { root.children.slice().forEach((g, i) => { if (i !== only) root.remove(g); }); labels.splice(0, labels.length, ...labels.filter((_, i) => i === only)); }
  // the lift shaft that threads the floors
  if (core && floors.length > 1 && only < 0) {
    cur = root;
    const h = (floors.length - 1) * GAP + WH;
    box(core.w * .8, h, core.d * .8, mat('#9fc3d0', { transparent: true, opacity: .25, depthWrite: false }), ox + core.x + core.w / 2, 0, oz + core.d / 2);
    box(.5, .5, .5, mat('#e3b448'), ox + core.x + core.w / 2, GAP * .5, oz + core.d / 2);
  }
  spreadArch(root);
  Object.assign(plan, { W: W * S, D: D * S, gap: GAP, wallH: WH, spread: S, core: core ? { x: (ox + core.x + core.w / 2) * S, z: (oz + core.d) * S + .25 } : null, door: doorOf(plan.floors[0]?.zones ?? [], -oz * S, ox * S, W * S) });
  return { group: root, labels, fixtures: placed, plan };

  /** A walkway from the door (or the lift) to the back wall, where the fewest fixtures stand; the ones in the way step aside. */
  function makeAisle(g, fplan, fi) {
    const AW = .8, x0 = ox * S, x1 = -ox * S, zf = -oz * S, zb = oz * S, mine = groups.filter(q => q.fi === fi);
    const want = fi === 0 ? doorOf(fplan.zones, zf, x0, W * S).x : core ? (ox + core.x + core.w / 2) * S : 0;
    const hits = (ax) => mine.filter(q => Math.abs(placed[q.idx].x - ax) < AW / 2 + q.w / 2).length;
    let best = want, bc = Infinity;
    for (let ax = x0 + AW; ax <= x1 - AW - (core ? core.w * S : 0); ax += .25) { const c = hits(ax) * 10 + Math.abs(ax - want); if (c < bc) { bc = c; best = ax; } }
    // the ground floor's aisle starts at the door, always; upper floors take the clearest line near the lift
    const ax = fi === 0 ? Math.max(x0 + AW / 2 + .1, Math.min(x1 - AW / 2 - .1, want)) : Math.round(best * 4) / 4;
    for (const q of mine) { const f = placed[q.idx]; if (Math.abs(f.x - ax) >= AW / 2 + q.w / 2) continue;
      const zn = fplan.zones.find(zz => zz.zone === q.zone && f.z >= zz.z - .01 && f.z <= zz.z + zz.d + .01) ?? { x: x0, w: x1 - x0 };
      const left = ax - AW / 2 - q.w / 2 - .05, right = ax + AW / 2 + q.w / 2 + .05;
      const okL = left - q.w / 2 >= zn.x - .05, okR = right + q.w / 2 <= zn.x + zn.w + .05;
      const nx = okL && (!okR || f.x < ax) ? left : okR ? right : (f.x < ax ? left : right);
      q.fg.position.x += nx - f.x; f.x = nx; }
    // a runner carpet with a lighter border: reads as "people walk here"
    const len = zf - zb - .1, run = (w, h, c, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, len), mat(c)); m.position.set(ax, y, (zf + zb) / 2); m.receiveShadow = true; g.add(m); };
    run(AW, .02, '#e9d8b4', .02); run(AW - .16, .03, '#b8684a', .02);
    if (fi === 0) { const m = new THREE.Mesh(new THREE.BoxGeometry(AW + .3, .05, .35), mat('#4a3a2e')); m.position.set(ax, .045, zf - .2); g.add(m); }   // a door mat where guests come in
    fplan.aisle = { x: ax, z0: zb, z1: zf };
  }

  function partition(at, a0, a1, axis) {
    const len = a1 - a0, gap = Math.min(.7, len * .4), mid = (a0 + a1) / 2, m = mat(shade(wallColor, .92));
    for (const [s, e] of [[a0, mid - gap / 2], [mid + gap / 2, a1]]) {
      if (e - s < .05) continue;
      if (axis === 'x') box(.06, .45, e - s, m, at, 0, (s + e) / 2); else box(e - s, .45, .06, m, (s + e) / 2, 0, at);
    }
  }

  // ---------- placing fixtures by pattern ----------
  function place(kind, pattern, o, r) {
    const x0 = ox + r.x, z0 = oz + r.z, w = r.w, d = r.d, F0 = FIX[kind];
    if (!F0) return;
    // wrap the fixture so each one placed is counted, and drawn as a ghost until it is bought
    const F = { size: F0.size, draw: (x, z, oo) => {
      const before = cur.children.length, idx = placed.length;
      F0.draw(x, z, oo);
      placed.push({ kind, zone: r.zone, floor: floorName, fi: floorIdx, x, z, y: floorIdx * GAP });
      if (kind === 'counter') for (let k = 0; k < 4; k++) box(.22, .015, .14, mat(k ? '#e9c46a' : '#f4d35e'), x, 0, z + QUEUE_FRONT + k * QUEUE_GAP);   // where the line stands
      const parts = cur.children.slice(before), fg = new THREE.Group(); fg.userData.fixture = true; for (const m of parts) { cur.remove(m); fg.add(m); }
      const rot = oo?.rot === 90, gw = rot ? fd : (kind === 'counter' ? (oo?.len ?? fw) : fw), gd = rot ? fw : fd; groups.push({ fg, fi: floorIdx, idx, w: gw, d: gd, zone: r.zone });
      // the height of its body (the top of the parts that cover a quarter of its footprint or more: a table top, not the cup on it), for people it hides
      // and the ground those parts cover, around its centre (chairs round a table are not the table)
      let h = 0; const body = new THREE.Box3();
      for (const m of parts) { if (!m.isMesh) continue; m.updateMatrix(); m.geometry.computeBoundingBox(); const bb = m.geometry.boundingBox.clone().applyMatrix4(m.matrix);
        if ((bb.max.x - bb.min.x) * (bb.max.z - bb.min.z) >= gw * gd * .25) { h = Math.max(h, bb.max.y); body.union(bb); } }
      Object.assign(placed[idx], { h, w: gw, d: gd, body: body.isEmpty() ? null : [body.min.x - x, body.max.x - x, body.min.z - z, body.max.z - z] });
      cur.add(fg);
      if (!isOwned(idx)) for (const m of parts) m.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = .22; o.material.depthWrite = false; o.castShadow = false; } });
    } };
    const [fw, fd] = F.size;
    if (pattern === 'center') return F.draw(x0 + w / 2, z0 + d / 2, o);
    if (pattern === 'corner') return F.draw(x0 + w - .3, z0 + d - .3, o);
    if (pattern === 'back' || pattern === 'front') {
      const z = pattern === 'back' ? z0 + fd / 2 + .08 : z0 + d - fd / 2 - .12;
      const n = o.len ? 1 : Math.max(1, Math.min(o.count ?? 9, Math.floor((w - .3) / (fw + .25)), few ? (o.count ? 3 : 2) : 99));
      for (let k = 0; k < n; k++) F.draw(x0 + (k + .5) * w / n, z, o);
      return;
    }
    if (pattern === 'left') { const n = Math.max(1, Math.min(few ? 2 : 4, Math.floor((d - .3) / (fd + .3)))); for (let k = 0; k < n; k++) F.draw(x0 + fw / 2 + .08, z0 + (k + .5) * d / n, { ...o, rot: 90 }); return; }
    if (pattern === 'rows') {
      const sx = fw + .35, sz = fd + .45, nx = Math.max(1, Math.min(few ? 2 : 99, Math.floor((w - .2) / sx))), nz = Math.max(1, Math.min(few ? 2 : 99, Math.floor((d - .3) / sz)));
      let n = 0; for (let a = 0; a < nz; a++) for (let c = 0; c < nx; c++) { if (o.count && n++ >= o.count) return; F.draw(x0 + (c + .5) * w / nx, z0 + (a + .5) * d / nz, o); }
      return;
    }
    if (pattern === 'cells') {
      const cw = o.cell ?? 1.4, n = Math.max(1, Math.min(few ? 3 : 99, Math.floor(w / cw))), m = mat(shade(wallColor, .95));
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
  const memo = new Map(), M = (c) => { if (!memo.has(c)) memo.set(c, mat(c)); return memo.get(c); };   // one material per colour for the many small parts (a ghost clones its own)
  const glass = mat('#9fc3d0', { emissive: 0x203040 }), tyre = M('#1a1a1a');
  // a chair on four legs; (bx, bz) points from the seat to its back (away from the table)
  const chair = (x, z, c = '#8a6a4a', bx = 0, bz = 0) => { const m = mat(c), l = mat(shade(c, .7));
    box(.22, .04, .22, m, x, .3, z); for (const [a, b] of [[-.09, -.09], [.09, -.09], [-.09, .09], [.09, .09]]) box(.03, .3, .03, l, x + a, 0, z + b);
    if (bx || bz) { const side = Math.abs(bx) > Math.abs(bz); box(side ? .04 : .22, .28, side ? .22 : .04, m, x + bx * .1, .34, z + bz * .1); } };
  // things on tables and counters, so a table reads as a place to eat
  const bowl = (x, y, z, soup = '#b5653a') => { cyl(.06, .042, .045, white, x, y, z, 10); cyl(.052, .052, .006, mat(soup), x, y + .036, z, 10); };
  const plate = (x, y, z, food = '#e3a448') => { cyl(.075, .06, .012, white, x, y, z, 12); ball(.035, mat(food), x, y + .025, z); };
  const cup = (x, y, z) => { cyl(.035, .03, .08, white, x, y, z, 8); cyl(.03, .03, .005, mat('#6b3a1e'), x, y + .074, z, 8); };
  return {
    rug: { size: [1.6, 1.1], draw: (x, z, o) => { const c = o.color ?? '#a8453a';
      box(1.6, .02, 1.1, M(c), x, .02, z); box(1.36, .022, .86, M(shade(c, 1.25)), x, .02, z); box(1.12, .024, .62, M(c), x, .02, z); box(.5, .026, .26, M('#e3b448'), x, .02, z);   // border, field, medallion
      for (const a of [-.82, .82]) box(.04, .01, 1.0, M('#efe6d4'), x + a, .02, z); } },   // fringes
    sofa: { size: [1.1, .5], draw: (x, z, o) => { const c = o.color ?? '#5b8a6a', d = mat(shade(c, .75)), m = mat(c), l = mat(shade(c, 1.12));
      box(1.1, .16, .45, d, x, .04, z); for (const a of [-.48, .48]) box(.04, .04, .04, dark, x + a, 0, z + .17);   // base and feet
      box(.12, .36, .45, m, x - .49, .04, z); box(.12, .36, .45, m, x + .49, .04, z);   // arms
      box(.42, .1, .36, l, x - .22, .2, z + .04); box(.42, .1, .36, l, x + .22, .2, z + .04);   // two seat cushions with a seam
      box(.86, .32, .12, m, x, .2, z - .17); box(.18, .16, .06, mat('#e8c35a'), x - .26, .3, z - .09); } },   // the back and a cushion
    plant: { size: [.4, .4], draw: (x, z) => { cyl(.13, .1, .24, mat('#b8643c'), x, 0, z, 10); cyl(.14, .14, .04, mat('#9a5230'), x, .22, z, 10); cyl(.11, .11, .02, mat('#5a3a24'), x, .25, z, 10);
      ball(.15, mat('#4f8f46'), x, .4, z); ball(.11, mat('#5fa552'), x - .08, .5, z + .05); ball(.1, mat('#3f7a3a'), x + .08, .48, z - .04); ball(.08, mat('#6fb860'), x + .02, .58, z + .06); } },
    counter: { size: [1.6, .45], draw: (x, z, o) => { const L = o.len ?? 1.6, n = Math.max(2, Math.round(L / .4));
      box(L, .7, .45, wood, x, 0, z); box(L - .02, .08, .02, mat('#5a3a24'), x, 0, z + .225);   // body and its kick plate
      for (let k = 1; k < n; k++) box(.025, .5, .015, mat('#7a4c28'), x - L / 2 + k * L / n, .12, z + .228);   // panels on the front
      box(L + .06, .05, .5, mat('#d8b07a'), x, .7, z); box(L + .06, .015, .02, mat('#f0d2a0'), x, .735, z + .25);   // the top and its light edge
      if (o.on === 'register') { box(.28, .1, .22, mat('#2e2e2e'), x, .75, z); box(.22, .14, .03, mat('#3a3d42'), x, .85, z - .06); box(.18, .09, .01, glow('#7fdfa0'), x, .87, z - .04); }
      else if (o.on === 'coffee') { const cx = x - L * .3; box(.3, .34, .26, mat('#2e2e2e'), cx, .75, z - .02); box(.24, .04, .06, mat('#c0c4c8'), cx, .92, z + .12); cup(cx, .75, z + .1); cyl(.06, .06, .05, mat('#b8bcc2'), cx + .05, 1.09, z - .02, 8); }
      cup(x + L * .3, .75, z + .05); box(.12, .1, .06, mat('#e8e4dc'), x + L * .4, .75, z - .1); } },   // a cup and a napkin box
    stool: { size: [.3, .3], draw: (x, z) => { cyl(.11, .11, .05, mat('#c2402e'), x, .4, z, 10); cyl(.1, .1, .02, dark, x, .38, z, 10); cyl(.025, .025, .38, dark, x, 0, z, 6); cyl(.07, .07, .015, dark, x, .15, z, 10); cyl(.09, .09, .02, dark, x, 0, z, 10); } },
    table4: { size: [.8, .8], draw: (x, z, o) => { const c = o.color ?? '#a8703e';
      cyl(.3, .3, .025, mat(shade(c, .72)), x, .425, z, 16); cyl(.29, .29, .03, mat(c), x, .445, z, 16);   // a darker rim under the top
      cyl(.035, .035, .43, dark, x, 0, z, 6); cyl(.13, .15, .03, dark, x, 0, z, 10);
      for (const [a, b] of [[-.38, 0], [.38, 0], [0, -.38], [0, .38]]) chair(x + a, z + b, undefined, Math.sign(a), Math.sign(b));
      bowl(x - .1, .475, z + .06); bowl(x + .11, .475, z - .05); box(.16, .008, .02, mat('#c9a24a'), x + .02, .475, z + .16); } },
    table2: { size: [.6, .5], draw: (x, z, o) => { const c = o.color ?? '#a8703e';
      box(.42, .03, .42, mat(shade(c, .72)), x, .39, z); box(.4, .03, .4, mat(c), x, .42, z); box(.04, .39, .04, dark, x, 0, z); box(.2, .02, .2, dark, x, 0, z);
      chair(x - .3, z, undefined, -1, 0); chair(x + .3, z, undefined, 1, 0); plate(x - .08, .45, z + .05); cup(x + .1, .45, z - .06); } },
    stove: { size: [.6, .5], draw: (x, z) => { box(.6, .65, .5, steel, x, 0, z);
      box(.44, .32, .015, mat('#8a9098'), x, .1, z + .25); box(.3, .16, .01, mat('#26292e'), x, .17, z + .258); box(.36, .025, .03, mat('#e4e8ea'), x, .45, z + .26);   // oven door, its window, the handle
      for (let k = 0; k < 4; k++) box(.05, .05, .02, mat('#2e2e2e'), x - .2 + k * .133, .55, z + .255);   // knobs
      box(.62, .04, .52, mat('#2b2d31'), x, .65, z);
      for (const [a, b] of [[-.15, -.12], [.15, -.12], [-.15, .12], [.15, .12]]) { cyl(.085, .085, .012, mat('#55585e'), x + a, .69, z + b, 12); cyl(.05, .05, .014, mat('#1a1b1e'), x + a, .69, z + b, 10); }   // burners
      cyl(.06, .06, .01, glow('#ff7a2a'), x + .15, .702, z - .12, 10);   // one lit
      cyl(.11, .1, .17, mat('#c0c4c8'), x - .15, .7, z - .12, 12); cyl(.115, .115, .015, mat('#9aa0a6'), x - .15, .87, z - .12, 12); box(.05, .02, .02, dark, x - .15, .885, z - .12);   // a pot with its lid
      cyl(.09, .07, .04, mat('#2e2e2e'), x + .15, .7, z + .12, 12); box(.16, .02, .03, dark, x + .3, .72, z + .12); } },   // a pan
    fridge: { size: [.5, .5], draw: (x, z) => { box(.5, 1.1, .45, mat('#eef1f3'), x, 0, z); box(.5, .015, .01, mat('#9aa0a6'), x, .72, z + .228);   // body, the seam between its doors
      box(.03, .22, .03, mat('#7a8088'), x + .19, .78, z + .24); box(.03, .4, .03, mat('#7a8088'), x + .19, .25, z + .24);   // handles
      box(.06, .06, .005, mat('#e2432f'), x - .1, .9, z + .228); box(.07, .05, .005, mat('#e3b448'), x - .02, .55, z + .228); box(.05, .07, .005, mat('#2e86ab'), x - .13, .45, z + .228);   // notes on the door
      box(.46, .05, .4, mat('#c8ced4'), x, 1.1, z); } },
    prep: { size: [1.0, .5], draw: (x, z) => { box(1.0, .05, .5, steel, x, .55, z); box(.96, .02, .46, mat('#9aa0a6'), x, .15, z);   // the top and a shelf below
      for (const [a, b] of [[-.47, -.22], [.47, -.22], [-.47, .22], [.47, .22]]) box(.03, .6, .03, mat('#8a9098'), x + a, 0, z + b);
      for (let k = 0; k < 3; k++) cyl(.1, .08, .1, mat(k === 1 ? '#c0c4c8' : '#e8e4dc'), x - .3 + k * .3, .17, z, 10);   // bowls on the shelf
      box(.34, .025, .22, mat('#d8b07a'), x - .1, .6, z + .04); box(.14, .01, .025, mat('#e4e8ea'), x - .1, .625, z + .1);   // a cutting board and a knife
      ball(.04, mat('#e2432f'), x + .2, .64, z - .05); ball(.035, mat('#5b8a2a'), x + .28, .635, z + .05); ball(.038, mat('#e3a448'), x + .3, .638, z - .1); } },
    toilet: { size: [.4, .5], draw: (x, z) => { cyl(.11, .08, .3, white, x, 0, z + .04, 12); cyl(.14, .14, .04, mat('#fbfbf8'), x, .3, z + .04, 14); box(.3, .32, .12, white, x, .2, z - .16); box(.08, .02, .02, steel, x + .08, .52, z - .1); } },
    sink: { size: [.4, .4], draw: (x, z) => { box(.4, .5, .35, white, x, 0, z); box(.34, .02, .02, mat('#d8d4cc'), x, .25, z + .176);
      box(.3, .02, .24, mat('#b9d3dc'), x, .495, z + .02); cyl(.012, .012, .14, steel, x, .5, z - .13, 6); box(.024, .024, .09, steel, x, .62, z - .09); } },
    gondola: { size: [1.2, .4], draw: (x, z) => { const fr = mat('#d8dde2'), sh = mat('#bfc5cb'), C = ['#e2432f', '#2e86ab', '#e3b448', '#5b8a6a', '#8064a2', '#f08a3a'];
      box(1.2, .08, .35, mat('#9aa0a6'), x, 0, z); box(1.2, .8, .04, fr, x, 0, z); box(.03, .8, .35, fr, x - .585, 0, z); box(.03, .8, .35, fr, x + .585, 0, z);   // base, spine, ends
      for (const [h, k0] of [[.08, 0], [.36, 2], [.62, 4]]) { box(1.14, .02, .33, sh, x, h, z); box(1.14, .03, .01, mat('#f4d35e'), x, h - .01, z + .17);   // a shelf and its price strip
        for (let k = 0; k < 6; k++) { const c = mat(C[(k + k0) % 6]), hh = .12 + ((k * 7 + k0) % 3) * .03; box(.15, hh, .12, c, x - .46 + k * .185, h + .02, z + .09); box(.15, hh, .12, c, x - .46 + k * .185, h + .02, z - .09); } } } },
    shelf: { size: [1.2, .3], draw: (x, z) => { const wd = mat('#8a6a4a'), C = ['#e2432f', '#2e86ab', '#e3b448', '#5b8a6a', '#8064a2', '#e8e4dc'];
      box(1.2, 1.1, .03, mat('#6b4f36'), x, 0, z - .135); box(.04, 1.1, .3, wd, x - .58, 0, z); box(.04, 1.1, .3, wd, x + .58, 0, z); box(1.2, .03, .3, wd, x, 1.07, z);   // back, sides, top
      [.02, .38, .74].forEach((h, r) => { box(1.12, .03, .28, wd, x, h, z); let px = x - .54;
        for (let k = 0; px < x + .46; k++) { const w = .07 + ((k * 5 + r) % 3) * .04, hh = .16 + ((k * 3 + r) % 4) * .035; box(w - .012, hh, .2, mat(C[(k + r * 2) % 6]), px + w / 2, h + .03, z + .01); px += w; } }); } },   // boards full of goods of different sizes
    stall: { size: [.9, .6], draw: (x, z) => { box(.9, .5, .5, wood, x, 0, z); box(.92, .03, .52, M('#7a4c28'), x, .5, z);
      [['#e2432f', -.28], ['#e3b448', 0], ['#5b8a6a', .28]].forEach(([c, a]) => { box(.24, .08, .32, M('#b08a5a'), x + a, .53, z); for (let k = 0; k < 4; k++) ball(.05, M(c), x + a - .06 + (k % 2) * .12, .65, z - .08 + Math.floor(k / 2) * .16); });   // baskets of produce
      for (const [a, b] of [[-.43, -.23], [.43, -.23], [-.43, .23], [.43, .23]]) box(.03, .55, .03, wood, x + a, .5, z + b);
      for (let k = 0; k < 6; k++) box(.155, .04, .6, M(k % 2 ? '#ffffff' : '#e2432f'), x - .39 + k * .155, 1.03, z + .03); box(.12, .08, .005, white, x + .3, .3, z + .252); } },   // awning, price card
    crates: { size: [.7, .7], draw: (x, z) => { box(.62, .08, .62, M('#9a7448'), x, 0, z); for (const a of [-.22, 0, .22]) box(.1, .02, .62, M('#b08a5a'), x + a, .08, z);   // a pallet
      box(.5, .4, .5, surface('wall', 'wood_boards', '#b8894e', .5, .4), x, .1, z); box(.4, .35, .4, surface('wall', 'wood_boards', '#c99a5e', .4, .35), x + .05, .5, z);
      box(.18, .1, .005, M('#3a2a1c'), x, .25, z + .253); box(.14, .08, .005, M('#c2402e'), x + .05, .62, z + .203); } },   // stencil marks
    rolldoor: { size: [1.0, .1], draw: (x, z) => { box(1.1, 1.12, .06, M('#7a8088'), x, 0, z - .05);
      for (let k = 0; k < 10; k++) box(1.0, .095, .04, M(k % 2 ? '#c0c6ce' : '#a9b0b9'), x, k * .1, z - .02);   // slats
      for (let k = 0; k < 6; k++) box(1.0 / 6, .05, .045, M(k % 2 ? '#2e2e2e' : '#f4d35e'), x - .5 + (k + .5) / 6, 0, z - .015); box(.16, .03, .03, M('#55585e'), x, .12, z + .01); } },   // hazard strip, handle
    curtain: { size: [.8, .6], draw: (x, z) => { box(.3, .02, .3, M('#d8b07a'), x, .02, z); box(.3, .6, .02, glass, x, .25, z - .28);   // a mat and a mirror
      for (let k = 0; k < 6; k++) box(.118, .9, .03, M(k % 2 ? '#c06080' : '#a84f6e'), x - .295 + k * .118, 0, z + .3 + (k % 2) * .015);   // folds
      box(.76, .03, .04, steel, x, .92, z + .3); } },
    bed: { size: [.7, 1.0], draw: (x, z, o) => { const c = o.color ?? '#8a2b3a';
      box(.7, .14, 1.04, wood, x, 0, z + .1); box(.64, .16, .98, white, x, .14, z + .1);   // frame and mattress
      box(.66, .06, .62, mat(c), x, .3, z + .3); box(.66, .07, .08, mat(shade(c, 1.25)), x, .3, z);   // the blanket and its fold
      box(.26, .09, .18, white, x - .15, .3, z - .27); box(.26, .09, .18, white, x + .15, .3, z - .27);   // two pillows
      box(.7, .55, .06, wood, x, 0, z - .42); box(.6, .04, .07, mat('#c99a5e'), x, .55, z - .42); } },
    flat: { size: [1.8, 1.2], draw: (x, z) => { box(.65, .3, 1.0, white, x - .45, 0, z + .1); box(.65, .06, .6, M('#5b8a6a'), x - .45, .3, z + .3); box(.26, .08, .16, white, x - .45, .3, z - .3);   // bed, blanket, pillow
      box(.7, .3, .35, M('#c06040'), x + .45, 0, z + .4); box(.7, .22, .08, M('#a84f36'), x + .45, .3, z + .55);   // a sofa with its back
      box(.6, .01, .45, M('#e3b448'), x + .45, .01, z - .2); box(.4, .04, .4, wood, x + .45, .42, z - .2); box(.04, .42, .04, dark, x + .45, 0, z - .2); cup(x + .5, .46, z - .2);   // rug, table, cup
      cyl(.02, .02, .7, steel, x + .1, 0, z - .45, 4); cyl(.07, .1, .12, M('#f4e2b8'), x + .1, .7, z - .45, 10); } },   // a reading lamp
    wardrobe: { size: [.5, .4], draw: (x, z) => { box(.5, 1.2, .4, wood, x, .04, z); box(.54, .05, .44, M('#7a4c28'), x, 1.24, z); box(.01, 1.1, .005, M('#5a3a24'), x, .1, z + .201);
      for (const a of [-.04, .04]) box(.02, .15, .02, M('#e3c48a'), x + a, .6, z + .21); for (const a of [-.2, .2]) box(.04, .04, .04, dark, x + a, 0, z + .15); } },
    desk: { size: [.8, .7], draw: (x, z) => { box(.8, .04, .45, mat('#e4e8ea'), x, .5, z); box(.04, .5, .4, mat('#9aa0a6'), x - .36, 0, z); box(.04, .5, .4, mat('#9aa0a6'), x + .36, 0, z);
      box(.06, .1, .04, mat('#2e2e2e'), x, .54, z - .13); box(.34, .22, .03, mat('#2e2e2e'), x, .62, z - .13); box(.3, .17, .01, glow('#8fc8e8'), x, .645, z - .113);   // a monitor
      box(.24, .015, .08, mat('#3a3d42'), x - .02, .54, z + .06); box(.04, .015, .06, mat('#3a3d42'), x + .16, .54, z + .07);   // keyboard and mouse
      cyl(.03, .03, .07, mat('#e2432f'), x + .3, .54, z - .05, 8); chair(x, z + .35, '#3b4150', 0, 1); } },
    desk1: { size: [.5, .5], draw: (x, z) => { box(.45, .04, .3, wood, x, .42, z); box(.04, .42, .04, dark, x - .18, 0, z); box(.04, .42, .04, dark, x + .18, 0, z); box(.16, .025, .12, mat('#2e86ab'), x - .06, .46, z); chair(x, z + .25, '#2e5d8a', 0, 1); } },
    couch: { size: [.5, 1.0], draw: (x, z) => { const c = '#9fc3d0';
      box(.5, .16, 1.0, M(shade(c, .75)), x, .04, z); box(.38, .1, .86, M(shade(c, 1.1)), x + .05, .2, z); box(.12, .38, 1.0, M(c), x - .19, .2, z);   // base, seat, back
      for (const b of [-.46, .46]) box(.5, .32, .08, M(c), x, .04, z + b); box(.06, .16, .18, M('#e8c35a'), x - .1, .3, z - .25); } },   // arms and a cushion
    lowtable: { size: [.9, .6], draw: (x, z) => { box(.9, .08, .6, M('#6b4026'), x, .2, z); for (const [a, b] of [[-.35, -.2], [.35, -.2], [-.35, .2], [.35, .2]]) box(.06, .2, .06, M('#4a3020'), x + a, 0, z + b);
      ball(.06, M('#5b8a6a'), x - .15, .34, z); box(.06, .02, .02, M('#5b8a6a'), x - .08, .35, z); cyl(.03, .025, .04, white, x + .05, .28, z + .1, 8); cyl(.03, .025, .04, white, x + .18, .28, z - .08, 8);   // a teapot and cups
      for (const b of [-.45, .45]) box(.34, .05, .3, M('#c2402e'), x, 0, z + b); } },   // floor cushions
    bench: { size: [.9, .3], draw: (x, z) => { for (const b of [-.1, 0, .1]) box(.9, .03, .08, wood, x, .3, z + b); box(.06, .3, .26, dark, x - .38, 0, z); box(.06, .3, .26, dark, x + .38, 0, z); box(.7, .03, .03, dark, x, .12, z); } },
    board: { size: [1.4, .1], draw: (x, z) => { box(1.4, .7, .04, M('#2f4a3a'), x, .55, z - .02); box(1.44, .04, .06, wood, x, .53, z); box(1.44, .04, .06, wood, x, 1.25, z - .01);
      for (const a of [-.7, .7]) box(.04, .76, .06, wood, x + a, .53, z - .01);
      [[.5, .55], [.8, .4], [.3, .7], [.6, .5]].forEach(([w, a], k) => box(w, .02, .005, M('#e8eef2'), x - .62 + w / 2 + (k % 2) * .1, .7 + k * .13 + (a - .5) * 0, z + .002));   // chalk lines
      box(.1, .02, .03, white, x + .45, .57, z + .03); } },
    kiosk: { size: [.6, .6], draw: (x, z) => { box(.6, .9, .6, M('#e3b448'), x, 0, z); box(.4, .3, .005, M('#26292e'), x, .45, z + .302); box(.5, .04, .12, white, x, .42, z + .34);   // booth, window, ledge
      for (let k = 0; k < 5; k++) box(.12, .04, .72, M(k % 2 ? '#ffffff' : '#e2432f'), x - .24 + k * .12, .9, z + .05);   // a striped awning
      box(.44, .14, .04, M('#2e5d8a'), x, .94, z - .2); box(.3, .05, .005, M('#ffd25a'), x, .98, z - .178); } },
    seats: { size: [1.2, .4], draw: (x, z, o) => { const c = o.color ?? '#8a2b3a';
      for (let k = 0; k < 4; k++) { box(.24, .06, .26, M(c), x - .45 + k * .3, .3, z); box(.24, .3, .05, M(shade(c, .8)), x - .45 + k * .3, .3, z + .12); box(.24, .03, .06, M(shade(c, .6)), x - .45 + k * .3, .6, z + .12); }   // cushion, back, its cap
      for (let k = 0; k < 5; k++) box(.04, .14, .26, dark, x - .6 + k * .3, .3, z); box(1.2, .3, .04, dark, x, 0, z); } },   // armrests between
    stage: { size: [2.0, .9], draw: (x, z) => { box(2.0, .3, .9, M('#6b4026'), x, 0, z); box(2.0, .04, .02, M('#c9a24a'), x, .26, z + .45); box(2.0, 1.1, .05, M('#8a2b3a'), x, .3, z - .42);
      for (const a of [-.88, .88]) for (let k = 0; k < 3; k++) box(.08, 1.3, .1, M(k % 2 ? '#a82b3a' : '#8a1f2e'), x + a + (a < 0 ? k : -k) * .08, .3, z - .32);   // curtains drawn back
      cyl(.012, .012, .5, dark, x + .3, .3, z + .1, 4); ball(.035, M('#2e2e2e'), x + .3, .82, z + .1); box(.4, .15, .2, M('#5a3a24'), x - .5, 0, z + .55); } },   // a mic, steps
    treadmill: { size: [.5, .9], draw: (x, z) => { box(.45, .12, .85, M('#2e2e2e'), x, 0, z); box(.36, .012, .72, M('#1a1a1a'), x, .12, z + .04); for (const a of [-.2, .2]) box(.04, .04, .72, M('#5b5b5b'), x + a, .12, z + .04);
      box(.45, .06, .1, M('#5b5b5b'), x, .75, z - .38); box(.2, .05, .005, glow('#7fdfa0'), x, .755, z - .328); box(.04, .75, .04, M('#5b5b5b'), x - .2, 0, z - .38); box(.04, .75, .04, M('#5b5b5b'), x + .2, 0, z - .38);
      for (const a of [-.2, .2]) box(.03, .03, .25, M('#c2402e'), x + a, .7, z - .25); } },   // handles
    weights: { size: [1.0, .4], draw: (x, z) => { box(1.0, .5, .3, M('#4a4a4a'), x, 0, z); box(1.0, .03, .32, M('#2e2e2e'), x, .5, z);
      for (let k = 0; k < 5; k++) { const px = x - .4 + k * .2, s = .07 + k * .006; for (const b of [-.07, .07]) box(.04, s, s, M('#2b2b2b'), px, .53, z + b); box(.015, .015, .14, steel, px, .53 + s / 2 - .008, z); }   // dumbbells, light to heavy
      for (const [a, c] of [[-.38, '#c2402e'], [-.2, '#2e5d8a']]) box(.03, .24, .24, M(c), x + a, .12, z + .165); } },   // plates leaning on the front
    locker: { size: [1.2, .35], draw: (x, z) => { for (let k = 0; k < 4; k++) { const xk = x - .45 + k * .3; box(.28, 1.1, .35, M(k % 2 ? '#5b7a9a' : '#4f6e8e'), xk, 0, z);
      for (const h of [.95, .91, .87]) box(.16, .012, .005, M('#2e3e52'), xk, h, z + .176); box(.02, .07, .02, steel, xk + .09, .55, z + .18); box(.06, .04, .005, white, xk, 1.01, z + .176); } } },   // vents, handle, number
    pool: { size: [2.4, 1.6], draw: (x, z) => { box(2.4, .05, 1.6, M('#e8eef2'), x, 0, z); box(2.24, .055, 1.44, M('#bfe0ea'), x, .005, z); box(2.2, .06, 1.4, mat('#4fb3d9', { emissive: 0x0a3040 }), x, .01, z);   // deck, tiled rim, water
      for (let k = 1; k <= 3; k++) for (let j = 0; j < 11; j++) box(.2, .02, .025, M((j + k) % 2 ? '#e2432f' : '#f4d35e'), x - 1.0 + j * .2, .07, z - .7 + k * .35);   // lane ropes
      for (const a of [-.12, .12]) { cyl(.015, .015, .35, steel, x + .95 + a * 0, .05, z + .55 + a, 4); } box(.02, .02, .26, steel, x + .95, .38, z + .55); } },   // a ladder
    lane: { size: [.5, 2.0], draw: (x, z) => { box(.45, .03, 2.0, M('#e8c088'), x, .01, z); for (const a of [-.245, .245]) box(.04, .02, 2.0, M('#4a3a2a'), x + a, 0, z);   // the lane and its gutters
      for (let k = 0; k < 3; k++) box(.03, .005, .06, M('#8a5a30'), x - .08 + k * .08, .04, z + .4);   // aiming arrows
      for (const [a, b] of [[0, 0], [-.05, -.08], [.05, -.08], [-.1, -.16], [0, -.16], [.1, -.16]]) cyl(.022, .03, .14, white, x + a, .04, z - .78 + b, 6);   // pins
      ball(.065, M('#2e5d8a'), x + .05, .105, z + .8); } },
    platform: { size: [2.0, .5], draw: (x, z) => { box(2.4, .3, .5, M('#9aa0a6'), x, 0, z); box(2.4, .02, .06, M('#e3b448'), x, .3, z - .2); box(2.4, .005, .1, M('#d8c070'), x, .3, z - .1);   // edge line, tactile strip
      for (const a of [.4, .6]) box(2.4, .03, .04, steel, x, 0, z + a); for (let k = 0; k < 8; k++) box(.08, .02, .4, M('#6b4f36'), x - 1.05 + k * .3, 0, z + .5);   // rails and sleepers
      cyl(.02, .02, .7, steel, x + .8, .3, z + .1, 4); box(.5, .14, .03, M('#2e5d8a'), x + .8, .95, z + .1); box(.36, .04, .005, white, x + .8, 1.0, z + .117); } },   // a sign
    machine: { size: [.8, .7], draw: (x, z) => { box(.8, .8, .6, M('#6f7f8f'), x, 0, z); box(.3, .2, .02, glow('#7fdfa0'), x, .5, z + .31); cyl(.12, .12, .2, M('#e3b448'), x + .25, .8, z, 8);
      for (const [a, c] of [[-.2, '#c2402e'], [-.12, '#5fb04a']]) box(.05, .05, .03, M(c), x + a, .35, z + .31);   // buttons
      for (let k = 0; k < 8; k++) box(.1, .06, .005, M(k % 2 ? '#2e2e2e' : '#f4d35e'), x - .35 + k * .1, .02, z + .302);   // hazard stripes
      cyl(.05, .05, .5, M('#9aa0a6'), x - .3, .8, z - .15, 8); } },   // a pipe
    conveyor: { size: [2.0, .4], draw: (x, z) => { box(2.0, .08, .35, M('#2b2d31'), x, .32, z); for (const b of [-.18, .18]) box(2.0, .06, .03, M('#e3b448'), x, .36, z + b);   // belt and rails
      for (let k = 0; k < 10; k++) box(.02, .005, .33, M('#55585e'), x - .9 + k * .2, .4, z);
      for (const [a, b] of [[-.9, -.15], [.9, -.15], [-.9, .15], [.9, .15], [0, -.15], [0, .15]]) box(.05, .32, .05, M('#55585e'), x + a, 0, z + b);   // legs
      for (let k = 0; k < 4; k++) { box(.2, .14, .2, M('#c99a5e'), x - .7 + k * .45, .405, z); box(.2, .02, .04, M('#e8d4a8'), x - .7 + k * .45, .545, z); } } },   // boxes with tape
    car: { size: [.6, 1.0], draw: (x, z, o) => { const c = o.color ?? '#2e86ab';
      box(.55, .25, .95, M(c), x, .07, z); box(.5, .2, .5, M(shade(c, .85)), x, .32, z - .03); box(.46, .15, .02, glass, x, .34, z + .23); box(.46, .13, .02, glass, x, .35, z - .29);   // body, cabin, windows
      for (const [a, b] of [[-.27, -.3], [.27, -.3], [-.27, .3], [.27, .3]]) box(.06, .16, .16, tyre, x + a, 0, z + b);
      for (const a of [-.18, .18]) { box(.08, .05, .01, glow('#fff2c0'), x + a, .2, z + .476); box(.08, .05, .01, glow('#e2432f'), x + a, .2, z - .476); } } },
    firetruck: { size: [.7, 1.4], draw: (x, z) => { box(.65, .5, 1.35, M('#c23b2b'), x, .08, z); box(.66, .05, 1.36, M('#f4f1ea'), x, .25, z);   // body and its stripe
      box(.55, .16, .02, glass, x, .36, z + .676); for (const [a, b] of [[-.3, -.45], [.3, -.45], [-.3, .45], [.3, .45]]) box(.08, .2, .2, tyre, x + a, 0, z + b);
      box(.12, .05, .08, glow('#ff5040'), x - .1, .58, z + .55); box(.12, .05, .08, glow('#5aa0ff'), x + .1, .58, z + .55);   // lights
      for (const a of [-.18, .18]) box(.04, .04, 1.0, M('#d8d8d8'), x + a, .6, z - .1); for (let k = 0; k < 8; k++) box(.36, .02, .03, M('#d8d8d8'), x, .61, z - .55 + k * .13); } },   // a ladder
    pedestal: { size: [.5, .5], draw: (x, z, o) => { box(.46, .06, .46, M('#d8d4cc'), x, 0, z); box(.4, .54, .4, white, x, .06, z); box(.44, .04, .44, M('#d8d4cc'), x, .6, z); box(.16, .06, .005, M('#c9a24a'), x, .4, z + .201);
      cyl(.05, .07, .08, M('#4a3a2a'), x, .64, z, 8); ball(.14, M(o.color ?? '#c9a24a'), x, .84, z); } },
    frame: { size: [.8, .1], draw: (x, z, o) => { box(.68, .53, .03, M('#c9a24a'), x, .61, z - .035); box(.6, .45, .01, M(o.color ?? '#8064a2'), x, .65, z - .015);
      box(.6, .14, .005, M('#5b8a6a'), x, .65, z - .008); box(.08, .08, .005, M('#ffd25a'), x + .15, .92, z - .008); box(.2, .04, .06, M('#2e2e2e'), x, 1.18, z - .02); } },   // a hill, a sun, a picture light
    tv: { size: [1.0, .3], draw: (x, z) => { box(.9, .3, .3, wood, x, 0, z); box(.005, .26, .005, M('#5a3a24'), x, .02, z + .151); box(.2, .04, .1, M('#2e2e2e'), x, .3, z);
      box(.8, .45, .04, M('#1d1f2a'), x, .35, z); box(.74, .39, .005, glow('#5aa0d8'), x, .38, z + .021); box(.3, .12, .005, glow('#8fe0a0'), x - .15, .4, z + .024); box(.5, .05, .06, M('#2e2e2e'), x, .3, z + .1); } },   // stand, screen with a picture, soundbar
    altar: { size: [1.2, .5], draw: (x, z) => { box(1.2, .6, .5, M('#e8dcc4'), x, 0, z); box(1.22, .02, .52, white, x, .6, z); box(.4, .4, .005, M('#8a2b3a'), x, .2, z + .252);   // cloth
      cyl(.03, .03, .4, M('#c9a24a'), x, .6, z, 4); box(.3, .04, .04, M('#c9a24a'), x, .88, z);
      for (const a of [-.42, .42]) { cyl(.025, .025, .16, white, x + a, .62, z, 6); ball(.02, glow('#ffd27a'), x + a, .8, z); }   // candles
      cyl(.04, .03, .1, M('#2e5d8a'), x + .25, .62, z - .1, 8); ball(.06, M('#e2557a'), x + .25, .76, z - .1); } },   // flowers
    pew: { size: [1.2, .4], draw: (x, z) => { box(1.2, .05, .3, wood, x, .3, z); box(1.1, .02, .26, M('#8a2b3a'), x, .35, z); box(1.2, .35, .05, wood, x, .3, z + .14); box(1.2, .3, .04, dark, x, 0, z);
      for (const a of [-.6, .6]) box(.05, .7, .38, M('#7a4c28'), x + a, 0, z + .02); box(1.1, .04, .08, M('#7a4c28'), x, .5, z + .2); } },   // ends and a book ledge
    prayer: { size: [.5, .8], draw: (x, z) => { box(.45, .02, .75, M('#8a2b3a'), x, .01, z); box(.37, .022, .6, M('#b0414a'), x, .01, z + .03); box(.2, .024, .16, M('#c9a24a'), x, .01, z - .22);   // field and its arch
      for (const b of [-.39, .39]) box(.4, .01, .03, M('#efe6d4'), x, .01, z + b); } },
    balls: { size: [.6, .6], draw: (x, z) => { [[-.2, 0, '#e2432f'], [.1, .15, '#2e86ab'], [.2, -.15, '#e3b448'], [-.05, -.2, '#5fb04a'], [-.22, .2, '#8064a2'], [.25, .18, '#f08a3a'], [0, .02, '#e2557a']]
      .forEach(([a, b, c], k) => ball(.1 + (k % 3) * .015, M(c), x + a, .11 + (k === 6 ? .14 : 0), z + b)); } },
    court: { size: [2.2, 1.6], draw: (x, z) => { const c = M('#c98a4b'); box(2.2, .02, 1.6, c, x, .01, z);
      for (const b of [-.75, .75]) box(2.1, .025, .03, white, x, .01, z + b); for (const a of [-1.05, 0, 1.05]) box(.03, .025, 1.5, white, x + a, .01, z);   // lines
      cyl(.26, .26, .026, white, x, .01, z, 20); cyl(.235, .235, .027, c, x, .01, z, 20);   // the centre circle
      for (const s of [-1, 1]) { cyl(.025, .025, 1.0, steel, x + s * 1.12, 0, z, 4); box(.03, .25, .35, white, x + s * 1.08, .95, z); cyl(.08, .08, .015, M('#f08a3a'), x + s * .99, .98, z, 10); } } },   // hoops
    ring: { size: [2.0, 2.0], draw: (x, z) => { box(1.9, .35, 1.9, mat('#2e5d8a'), x, 0, z); box(1.7, .02, 1.7, mat('#e8eef2'), x, .35, z);
      for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(.1, .7, .1, mat(a * b > 0 ? '#d6332a' : '#2e86ab'), x + a * .88, .35, z + b * .88);
      for (const h of [.6, .85]) { box(1.76, .03, .03, white, x, h, z + .88); box(1.76, .03, .03, white, x, h, z - .88); box(.03, .03, 1.76, white, x + .88, h, z); box(.03, .03, 1.76, white, x - .88, h, z); } } },
    diamond: { size: [2.2, 2.2], draw: (x, z) => { const d = box(1.6, .03, 1.6, mat('#c98a4b'), x, .01, z); d.rotation.y = Math.PI / 4; const g = box(1.0, .035, 1.0, mat('#5f9e4f'), x, .01, z); g.rotation.y = Math.PI / 4;
      for (const [a, b] of [[0, .78], [.78, 0], [0, -.78], [-.78, 0]]) box(.12, .05, .12, white, x + a, .02, z + b); } },
    lamp: { size: [.3, .3], draw: (x, z) => { cyl(.08, .1, .03, dark, x + .4, 0, z, 10); cyl(.02, .02, 1.1, steel, x + .4, 0, z, 4); cyl(.1, .16, .18, M('#f4e2b8'), x + .4, 1.05, z, 12); ball(.07, glow('#fff2c0'), x + .4, 1.08, z); } },
  };
}
export const FIXTURE_NAMES = ['ring', 'diamond', 'rug', 'sofa', 'plant', 'counter', 'stool', 'table4', 'table2', 'stove', 'fridge', 'prep', 'toilet', 'sink', 'gondola', 'shelf', 'stall', 'crates', 'rolldoor', 'curtain', 'bed', 'flat', 'wardrobe', 'desk', 'desk1', 'couch', 'lowtable', 'bench', 'board', 'kiosk', 'seats', 'stage', 'treadmill', 'weights', 'locker', 'pool', 'lane', 'platform', 'machine', 'conveyor', 'car', 'firetruck', 'pedestal', 'frame', 'tv', 'altar', 'pew', 'prayer', 'balls', 'court', 'lamp'];

/**
 * Carry bought fixtures from one layout to another: each bought fixture goes to a free fixture of the same kind,
 * on the same floor and zone if there is one (else the same floor, else anywhere), nearest first.
 * Returns { own: number[], lv: {index: level}, lost: [{ kind, level }] } — lost ones had no place left (refund them).
 */
export function remapFixtures(oldFx, newFx, own, lv = {}) {
  const taken = new Set(), out = [], outLv = {}, lost = [];
  const pick = (f, test) => { let best = -1, bd = Infinity; newFx.forEach((g, j) => { if (taken.has(j) || g.kind !== f.kind || !test(g)) return; const d = Math.hypot(g.x - f.x, g.z - f.z); if (d < bd) { bd = d; best = j; } }); return best; };
  // the most levelled first, so they keep the best places
  for (const i of [...own].sort((a, b) => (lv[b] ?? 1) - (lv[a] ?? 1))) {
    const f = oldFx[i]; if (!f) continue;
    let j = pick(f, g => g.fi === f.fi && g.zone === f.zone); if (j < 0) j = pick(f, g => g.fi === f.fi); if (j < 0) j = pick(f, () => true);
    if (j < 0) { lost.push({ kind: f.kind, level: lv[i] ?? 1 }); continue; }
    taken.add(j); out.push(j); if ((lv[i] ?? 1) > 1) outLv[j] = lv[i];
  }
  return { own: out.sort((a, b) => a - b), lv: outLv, lost };
}
