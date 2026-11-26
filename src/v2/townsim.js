// Town simulation: people walk the roads, want things, and go to the nearest building that serves that want.
// Everything that decides an outcome is visible: speech bubbles, queues at doors, coins over buildings.
import { GRID, LOTS, isRoad as townRoad } from './town.js';
import { TYPES } from './catalog.js';

export const NEEDS = {
  food: { ko: '배고픔', color: '#e2743b' },
  cafe: { ko: '커피·간식', color: '#8a5a34' },
  shop: { ko: '쇼핑·볼일', color: '#2e86ab' },
  fun: { ko: '놀거리', color: '#8064a2' },
  rest: { ko: '쉴 곳', color: '#5b8a6a' },
};
export const NEED_KEYS = Object.keys(NEEDS);

// What a building does in town: which want it serves, and how many people it brings.
const SERVES = {
  restaurant: 'food', fast_food: 'food', pojangmacha: 'food', bar: 'food', market_hall: 'food',
  cafe: 'cafe', bakery: 'cafe', kiosk: 'cafe',
  convenience_store: 'shop', supermarket: 'shop', boutique: 'shop', pharmacy: 'shop', post_office: 'shop', clinic: 'shop', hospital: 'shop', gas_station: 'shop', sangga: 'shop',
  pc_bang: 'fun', cinema: 'fun', theater: 'fun', gym: 'fun', bowling_alley: 'fun', stadium: 'fun', museum: 'fun', gallery: 'fun', concert_hall: 'fun', swimming_pool: 'fun',
  castle: 'fun', lighthouse: 'fun', windmill: 'fun', clock_tower: 'fun', library: 'fun',
  hotel: 'rest', motel: 'rest', guesthouse: 'rest', temple: 'rest', church: 'rest', mosque: 'rest',
};
const SOURCE = { house: 2, hanok_house: 2, cabin: 1, villa: 2, sangga: 2, apartment: 0, hotel: 0, motel: 3, guesthouse: 2, train_station: 8, bus_terminal: 6, school: 4, university: 5, kindergarten: 2, town_hall: 3, factory: 4, warehouse: 2, workshop: 1, hospital: 3, police: 1, fire_station: 1 };
/** Building types that serve a want. */
export const typesFor = (need) => Object.keys(SERVES).filter(t => SERVES[t] === need);
export function roleOf(type, levels = 1) {
  const serves = SERVES[type] ?? null;
  let source = SOURCE[type] ?? 0;
  if (type === 'apartment') source = Math.min(12, 2 + Math.round(levels / 2));
  if (type === 'hotel') source = Math.min(10, 2 + Math.round(levels / 3));
  return { serves, source };
}
const LOT_CAP = { S: 2, M: 3, L: 4, XL: 5 }, LOT_COIN = { S: 1, M: 2, L: 3, XL: 4 };

// ---------- roads ----------
const key = (x, z) => x * 100 + z;
const nbr = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function bfs(from, to, A) {
  const prev = new Map([[key(...from), null]]), q = [from];
  while (q.length) {
    const [x, z] = q.shift();
    if (x === to[0] && z === to[1]) { const path = []; let k = key(x, z); while (k != null) { path.unshift([Math.floor(k / 100), k % 100]); k = prev.get(k); } return path; }
    for (const [dx, dz] of nbr) { const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= A.w || nz >= A.d || !A.isRoad(nx, nz) || prev.has(key(nx, nz))) continue; prev.set(key(nx, nz), key(x, z)); q.push([nx, nz]); }
  }
  return null;
}
// The road tile in front of a lot's door (lots face +z).
export const doorOf = (lot) => [lot.x + Math.floor(lot.w / 2), lot.z + lot.d];

export class TownSim {
  /** area: { w, d, isRoad(x, z), lots: [{ id, size, x, z, w, d }] }; defaults to the fixed demo town */
  constructor(seed = 7, area = { w: GRID.w, d: GRID.d, isRoad: townRoad, lots: LOTS }, { base = 12 } = {}) {
    this.s = seed; this.people = []; this.shops = new Map(); this.events = []; this.t = 0; this.base = base; this.setArea(area);
  }
  setArea(area) {
    this.A = area; this.roads = [];
    for (let x = 0; x < area.w; x++) for (let z = 0; z < area.d; z++) if (area.isRoad(x, z)) this.roads.push([x, z]);
    this.people = []; this.shops = new Map();
  }
  rnd() { return (this.s = (this.s * 9301 + 49297) % 233280) / 233280; }

  /** buildings: Map lotId → { type, levels, owner } */
  setBuildings(buildings) {
    const shops = new Map(); let pop = this.base;
    for (const [id, b] of buildings) {
      const lot = (b.lot ?? this.A.lots?.find(l => l.id === id)); if (!lot) continue;
      const r = roleOf(b.type, b.levels); pop += r.source;
      const old = this.shops.get(id);
      shops.set(id, { id, lot, door: lot.door ?? doorOf(lot), serves: r.serves, source: r.source, owner: b.owner, cap: LOT_CAP[lot.size] + Math.min(4, Math.floor((b.levels - 1) / 2)), coin: LOT_COIN[lot.size],
        queue: old?.queue ?? [], busy: old?.busy ?? 0, fresh: !old, served: old?.served ?? 0, stock: b.stock ?? Infinity, price: (b.price ?? LOT_COIN[lot.size]) + Math.floor((b.fx ?? 0) / 4),
        speed: 1 + .6 * Math.min(1, (b.fx ?? 0) / Math.max(1, b.fxTotal ?? 8)) });
      const sh = shops.get(id);
      if (b.rates) { sh.cap = b.rates.cap; sh.price = b.rates.price; sh.interval = b.rates.interval; }   // the setup inside decides
      else sh.cap += Math.floor((b.fx ?? 0) / 2);   // furniture bought: one more place in the queue per two pieces
      sh.watched = !!b.watched;
    }
    this.shops = shops; this.target = Math.min(70, pop);
    // a new source sends its people out of its own door
    for (const s of shops.values()) if (s.fresh && s.source) for (let k = 0; k < s.source; k++) this.spawn(s.door, k * .4);
    // opening day: a small crowd that wants what a new shop serves arrives from the nearest roads
    for (const s of shops.values()) if (s.fresh && s.serves && this.t > 1 && this.base > 0) for (let k = 0; k < 4; k++) {
      const near = this.roads.filter(([x, z]) => Math.abs(x - s.door[0]) + Math.abs(z - s.door[1]) < 7 && Math.abs(x - s.door[0]) + Math.abs(z - s.door[1]) > 2);
      if (near.length) this.spawn(near[Math.floor(this.rnd() * near.length)], k * .5, s.serves);
    }
    // a new shop pulls everyone who wants what it serves
    for (const s of shops.values()) if (s.fresh && s.serves) for (const p of this.people) if (p.need === s.serves && !p.target) this.route(p);
  }
  serves(need) { for (const s of this.shops.values()) if (s.serves === need) return true; return false; }
  spawn(at, delay = 0, need = null, dock = null, vip = false) {
    if (!this.roads.length) return;
    const [x, z] = at ?? this.roads[Math.floor(this.rnd() * this.roads.length)];
    this.people.push({ dock, x: x + .5, z: z + .5, path: [], need, since: this.t, target: null, wait: delay, t: this.rnd() * 10, shirt: Math.floor(this.rnd() * 8), vip, side: (this.rnd() - .5) * .5, speed: .8 + this.rnd() * .5, mood: 0, giveUp: 0 });
  }
  /** Go to the nearest building that serves this person's want and has room; nothing is hidden: no room → they give up. */
  route(p) {
    const here = [Math.floor(p.x), Math.floor(p.z)];
    let best = null, bd = Infinity;
    for (const s of this.shops.values()) {
      if (s.serves !== p.need || s.queue.length >= s.cap || s.stock <= 0) continue;
      const d = Math.abs(s.door[0] - here[0]) + Math.abs(s.door[1] - here[1]) + s.queue.length * 2;
      if (d < bd) { bd = d; best = s; }
    }
    if (!best) { p.target = null; return false; }
    const path = bfs(here, best.door, this.A); if (!path) return false;
    p.target = best.id; p.path = path.slice(1); return true;
  }
  wander(p) {
    const here = [Math.floor(p.x), Math.floor(p.z)];
    if (!this.roads.length) return;
    const goal = this.roads[Math.floor(this.rnd() * this.roads.length)];
    p.path = (bfs(here, goal, this.A) ?? []).slice(1, 12);
  }
  step(dt) {
    this.t += dt;
    const locals = this.people.filter(p => !p.dock).length;
    if (this.roads.length && locals < this.target) this.spawn();
    if (locals > this.target + 4) this.people.splice(this.people.findIndex(p => !p.dock), 1);
    this.people = this.people.filter(p => !p.gone);
    for (const p of this.people) {
      p.t += dt;
      if (p.wait > 0) { p.wait -= dt; continue; }
      if (p.inside || p.inQueue) continue;   // someone in a queue waits there
      // wants appear over time; a want with nowhere to go turns into a sigh after a while
      if (!p.need && !p.target && !p.dock && this.rnd() < dt * .06) { p.need = NEED_KEYS[Math.floor(this.rnd() * NEED_KEYS.length)]; p.since = this.t; p.mood = 0; this.route(p); }
      if (p.need && !p.target && this.t - p.since > (p.dock ? 14 : this.serves(p.need) ? 20 : 75)) { p.need = null; p.mood = 2; }
      if (p.need && !p.target && (!p.tried || (Math.floor(p.t) % 4 === 0 && this.rnd() < dt))) { p.tried = true; this.route(p); }
      if (p.dock && !p.need && !p.target) {
        const here = [Math.floor(p.x), Math.floor(p.z)];
        if (here[0] === p.dock[0] && here[1] === p.dock[1]) { p.gone = true; continue; }
        if (!p.path.length || !p.homeward) { p.path = (bfs(here, p.dock, this.A) ?? []).slice(1); p.homeward = true; if (!p.path.length) { p.gone = true; continue; } }
      }
      if (!p.path.length) {
        if (p.target) { const s = this.shops.get(p.target); if (s && s.queue.length < s.cap) { s.queue.push(p); p.inQueue = true; p.path = []; } else { p.target = null; this.route(p); } }
        else this.wander(p);
        continue;
      }
      const [tx, tz] = p.path[0], gx = tx + .5, gz = tz + .5, dx = gx - p.x, dz = gz - p.z, d = Math.hypot(dx, dz), v = p.speed * dt;
      if (d <= v) { p.x = gx; p.z = gz; p.path.shift(); } else { p.x += dx / d * v; p.z += dz / d * v; }
      p.dir = Math.abs(dx) > Math.abs(dz) ? 'x' : 'z';
    }
    // shops serve the head of their queue
    for (const s of this.shops.values()) {
      s.queue = s.queue.filter(p => this.people.includes(p));
      s.queue.forEach((p, i) => { p.x = s.door[0] + .5 - i * .32; p.z = s.door[1] + .3; });
      if (!s.queue.length) continue;
      s.busy += dt;
      if (s.busy >= (s.interval ?? 2.2 / (s.speed ?? 1))) {
        s.busy = 0; const p = s.queue.shift(); p.inQueue = false; p.target = null; p.wait = .8;
        if (s.stock <= 0) { p.need = null; p.mood = 2; this.events.push({ kind: 'empty', lot: s.id, owner: s.owner, t: this.t }); continue; }
        s.stock--; s.served++; p.mood = 1;
        // a shop someone is looking inside: the guest walks in there and pays at the table instead
        this.events.push(s.watched ? { kind: 'enter', lot: s.id, owner: s.owner, used: 1, t: this.t, vip: !!p.vip } : { kind: 'coin', lot: s.id, owner: s.owner, coins: s.price, used: 1, t: this.t, vip: !!p.vip }); p.vip = false;
        // a visitor sometimes wants one more thing before going home
        p.need = p.dock && this.rnd() < .3 ? NEED_KEYS[Math.floor(this.rnd() * NEED_KEYS.length)] : null; p.since = this.t; p.tried = false;
      }
    }
  }
  /** Unmet wants right now, per kind, and whether anything in town serves that kind. */
  demand() {
    const out = Object.fromEntries(NEED_KEYS.map(k => [k, { waiting: 0, served: false }]));
    for (const p of this.people) if (p.need && !p.inQueue) out[p.need].waiting++;
    for (const s of this.shops.values()) if (s.serves) out[s.serves].served = true;
    return out;
  }
}

// ---------- drawing ----------
const SHIRTS = ['#c0392b', '#2e86ab', '#e3b448', '#5b8a6a', '#8064a2', '#e2743b', '#f4f1ea', '#2b2f3a'];
const ICON = {
  food: (g, x, y) => { g.fillRect(x, y + 3, 7, 1); g.fillRect(x + 1, y + 4, 5, 2); g.fillRect(x + 2, y, 1, 3); g.fillRect(x + 4, y, 1, 3); },
  cafe: (g, x, y) => { g.fillRect(x + 1, y + 1, 4, 5); g.fillRect(x + 5, y + 2, 1, 2); g.fillRect(x, y + 6, 6, 1); },
  shop: (g, x, y) => { g.fillRect(x + 1, y + 2, 5, 5); g.fillRect(x + 2, y, 1, 2); g.fillRect(x + 4, y, 1, 2); g.fillRect(x + 2, y, 3, 1); },
  fun: (g, x, y) => { g.fillRect(x + 3, y, 1, 7); g.fillRect(x, y + 3, 7, 1); g.fillRect(x + 1, y + 1, 5, 5); },
  rest: (g, x, y) => { g.fillRect(x, y + 3, 7, 2); g.fillRect(x, y + 1, 1, 5); g.fillRect(x + 6, y + 4, 1, 2); g.fillRect(x + 1, y + 2, 2, 1); },
};
export function drawPerson(g, pr, p) {
  const [px, py] = pr.P(p.x + (p.dir === 'z' ? p.side : 0), p.z + (p.dir === 'x' ? p.side : 0));
  const x = Math.round(px), y = Math.round(py), bob = p.wait > 0 || p.inQueue ? 0 : (Math.sin(p.t * 10) > 0 ? 1 : 0);
  g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x - 2, y, 5, 1);
  g.fillStyle = '#3b3f52'; g.fillRect(x - 1, y - 3, 1, 3); g.fillRect(x + 1, y - 3, 1, 3);
  g.fillStyle = SHIRTS[p.shirt]; g.fillRect(x - 1, y - 7 - bob, 3, 4);
  g.fillStyle = '#f1c9a0'; g.fillRect(x - 1, y - 9 - bob, 3, 2);
  if (p.vip) { g.fillStyle = '#ffd23a'; g.fillRect(x - 2, y - 11 - bob, 5, 2); g.fillRect(x - 2, y - 13 - bob, 1, 2); g.fillRect(x, y - 13 - bob, 1, 2); g.fillRect(x + 2, y - 13 - bob, 1, 2); }
  if (p.need && !p.inQueue) {           // speech bubble with what they want
    const bx = x - 5, by = y - 22 - bob;
    g.fillStyle = '#ffffff'; g.fillRect(bx, by, 11, 10); g.fillRect(bx + 4, by + 10, 2, 2);
    g.fillStyle = NEEDS[p.need].color; ICON[p.need](g, bx + 2, by + 2);
  } else if (p.mood === 2 && p.wait <= 0) { g.fillStyle = '#8b9a9c'; g.fillRect(x - 3, y - 14, 1, 1); g.fillRect(x, y - 14, 1, 1); g.fillRect(x + 3, y - 14, 1, 1); }
}
export function drawNeedIcon(g, need, x, y) { g.fillStyle = NEEDS[need].color; ICON[need](g, x, y); }
