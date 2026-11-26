// A small simulation that runs inside one building's cross-section.
// Fixtures the owner has bought do work: counters take orders, stoves speed them up, tables and sofas give seats,
// toilets serve, plants and rugs make seated guests tip. Guests pay at the table when they finish (take-away shops: at the counter),
// so a guest who orders and finds no seat walks out without paying. Customers walk between them in world units on each floor,
// ride the lift between floors, queue at counters and give up when the line or the room is full.
// No DOM here: the page projects people with the section's camera and draws them.

const SEATS = {
  table4: [[-.38, 0], [.38, 0], [0, -.38], [0, .38]], table2: [[-.3, 0], [.3, 0]], stool: [[0, 0]], sofa: [[-.3, 0], [.3, 0]],
  seats: [[-.45, 0], [-.15, 0], [.15, 0], [.45, 0]], bench: [[-.25, 0], [.25, 0]], pew: [[-.4, 0], [0, 0], [.4, 0]],
  lowtable: [[-.35, .38], [.35, .38], [-.35, -.38], [.35, -.38]], couch: [[0, -.25], [0, .25]], desk1: [[0, .25]], desk: [[0, .35]],
  pool: [[-.6, -.3], [.6, .3], [0, 0], [-.3, .4]], bed: [[0, .1]],
};
const BROWSE = new Set(['gondola', 'shelf', 'stall', 'pedestal', 'frame', 'kiosk']);
const COOK = { stove: 1, prep: .7, machine: 1, fridge: .4 };
const DECOR = new Set(['plant', 'rug', 'tv', 'lamp', 'balls']);
export const FIX_ROLE = (k) => k === 'counter' ? 'serve' : SEATS[k] ? 'seat' : BROWSE.has(k) ? 'browse' : COOK[k] ? 'cook' : k === 'toilet' ? 'wc' : DECOR.has(k) ? 'decor' : 'other';
export const FIX_INFO = {
  counter: ['카운터', '주문 받는 곳 +1'], stove: ['화구', '조리가 빨라짐'], prep: ['조리대', '조리가 빨라짐'], fridge: ['냉장고', '조리가 조금 빨라짐'],
  table4: ['4인 테이블', '자리 +4'], table2: ['2인 테이블', '자리 +2'], stool: ['스툴', '자리 +1'], sofa: ['소파', '자리 +2'], seats: ['좌석 줄', '자리 +4'],
  bench: ['벤치', '자리 +2'], lowtable: ['좌식 상', '자리 +4'], toilet: ['화장실', '손님이 들름'], sink: ['세면대', '꾸밈'],
  plant: ['화분', '이 층 손님이 팁'], rug: ['러그', '이 층 손님이 팁'], tv: ['TV', '이 층 손님이 팁'], lamp: ['조명', '이 층 손님이 팁'],
  gondola: ['진열대', '구경하는 곳'], shelf: ['선반', '구경하는 곳'], stall: ['좌판', '구경하는 곳'], pedestal: ['전시대', '구경하는 곳'], frame: ['그림', '구경하는 곳'], kiosk: ['매점', '구경하는 곳'],
  couch: ['진료 침대', '자리 +2'], desk: ['책상', '자리 +1'], desk1: ['책상', '자리 +1'], pool: ['수영장', '자리 +4'], bed: ['침대', '자리 +1'], pew: ['긴 의자', '자리 +3'], machine: ['기계', '조리가 빨라짐'], balls: ['공', '이 층 손님이 팁'],
};
// fixtures with no job in the sim: named so the hint reads well
const PLAIN = { crates: '상자', rolldoor: '셔터', curtain: '커튼', flat: '집 한 칸', wardrobe: '옷장', board: '칠판', stage: '무대', treadmill: '러닝머신', weights: '역기', locker: '사물함', lane: '레인', platform: '승강장', conveyor: '컨베이어', car: '차', firetruck: '소방차', altar: '제단', prayer: '기도 깔개', court: '코트', ring: '링', diamond: '야구장', sink: '세면대' };
for (const [k, n] of Object.entries(PLAIN)) FIX_INFO[k] ??= [n, '꾸밈'];
export const FIX_COST = { counter: 20, stove: 14, prep: 9, fridge: 6, table4: 12, table2: 7, stool: 3, sofa: 7, seats: 10, bench: 5, lowtable: 10, toilet: 8, sink: 3, plant: 4, rug: 5, tv: 7, lamp: 4 };
export const costOf = (k) => FIX_COST[k] ?? 6;

/** What a building can become when every fixture is bought: counts per role. */
export function profileOf(fixtures) {
  const out = { seat: 0, serve: 0, cook: 0, decor: 0, wc: 0, browse: 0 };
  for (const f of fixtures) { const r = FIX_ROLE(f.kind); if (r === 'seat') out.seat += SEATS[f.kind].length; else if (r === 'cook') out.cook += COOK[f.kind]; else if (out[r] !== undefined) out[r]++; }
  out.cook = Math.round(out.cook * 10) / 10; return out;
}

/**
 * The same setup seen from the map, where a shop is a door with a queue: how often it can take the next guest,
 * how long its queue may grow and what a guest pays. Bottleneck of ordering (counters and cooks) and of seats.
 */
export function shopRates(fixtures, owned, baseCoin = 3) {
  const own = fixtures.filter((_, i) => owned.has(i));
  const counters = own.filter(f => f.kind === 'counter').length, cooks = own.reduce((t, f) => t + (COOK[f.kind] ?? 0), 0);
  const seats = own.reduce((t, f) => t + (SEATS[f.kind]?.length ?? 0), 0), decor = own.filter(f => DECOR.has(f.kind)).length, browse = own.filter(f => BROWSE.has(f.kind)).length;
  const st = 4.2 / (1 + .7 * cooks);
  const order = counters ? counters / st : seats ? 1 / st : .3 + browse * .08;
  const seat = seats ? seats / 13 : Infinity;
  const rate = Math.min(order, seat);
  return { interval: Math.max(.5, .46 / rate), cap: 3 + 2 * counters + Math.floor(seats / 4), price: baseCoin + Math.min(3, decor) + Math.floor(browse / 2), seats, counters, cooks: Math.round(cooks * 10) / 10, decor, slow: seat < order ? 'seat' : 'order' };
}

// ---------- the order fixtures come in ----------
// Four tracks, each with its own order; only the next fixture of each track can be bought.
export const TRACKS = { order: '주문', seat: '자리', browse: '진열', deco: '꾸밈' };
const trackOf = (k) => { const r = FIX_ROLE(k); return r === 'serve' || r === 'cook' ? 'order' : r === 'seat' ? 'seat' : r === 'browse' ? 'browse' : 'deco'; };
/** Per track, fixture indices in the order they are bought: lower floors first, nearer the door first. */
export function trackOrder(fixtures, door) {
  const d = door ?? { x: 0, z: Math.max(0, ...fixtures.map(f => f.z)) + 1 };
  const near = (f) => f.fi * 100 + Math.hypot(f.x - d.x, f.z - d.z);
  const out = { order: [], seat: [], browse: [], deco: [] };
  const idx = fixtures.map((f, i) => i);
  const by = (pred) => idx.filter(i => pred(fixtures[i])).sort((a, b) => near(fixtures[a]) - near(fixtures[b]));
  const counters = by(f => f.kind === 'counter');
  out.order = [...counters.slice(0, 1), ...by(f => COOK[f.kind]), ...counters.slice(1)];
  out.seat = by(f => SEATS[f.kind]);
  out.browse = by(f => BROWSE.has(f.kind));
  out.deco = [...by(f => f.kind === 'toilet'), ...by(f => DECOR.has(f.kind)), ...by(f => trackOf(f.kind) === 'deco' && f.kind !== 'toilet' && !DECOR.has(f.kind))];
  return out;
}
/** The next fixture of each track: { track: index }. */
export function nextUp(fixtures, owned, door) {
  const out = {};
  for (const [t, list] of Object.entries(trackOrder(fixtures, door))) { const i = list.find(i => !owned.has(i)); if (i !== undefined) out[t] = i; }
  return out;
}

/** Unbought fixtures that would raise income (price per guest ÷ seconds per guest) the most, by kind. */
export function bestNext(fixtures, owned, baseCoin = 3) {
  const rev = (set) => { const r = shopRates(fixtures, set, baseCoin); return r.price / r.interval; }, now = rev(owned);
  const gain = new Map();
  const allowed = new Set(Object.values(nextUp(fixtures, owned)));
  fixtures.forEach((f, i) => { if (owned.has(i) || !allowed.has(i)) return; const g = rev(new Set([...owned, i])) - now; if (g > (gain.get(f.kind) ?? 0)) gain.set(f.kind, g); });
  const best = Math.max(0, ...gain.values());
  return best > 0 ? [...gain].filter(([, g]) => g >= best * .8).map(([k]) => k) : [];
}

const SPEED = 1.5, LIFT = 2.4, PRICE = 4;

export class InsideSim {
  /** plan/fixtures from buildSection; owned: Set of fixture indices */
  constructor(plan, fixtures, owned, { seed = 1, every = 2.1, price = PRICE } = {}) {
    this.price = price; this.plan = plan; this.fixtures = fixtures; this.every = every; this.s = seed * 9301 % 233280 || 7;
    this.people = []; this.t = 0; this.next = Number.isFinite(every) ? .5 : Infinity; this.id = 0; this.kitchen = []; this.cooking = 0;
    this.stats = { served: 0, lostLine: 0, lostSeat: 0, coins: 0, log: [] };
    this.events = [];
    this.setOwned(owned);
  }
  rnd() { this.s = (this.s * 9301 + 49297) % 233280; return this.s / 233280; }
  setOwned(owned) {
    this.owned = owned;
    const own = this.fixtures.map((f, i) => ({ ...f, i })).filter(f => owned.has(f.i));
    const keep = new Map((this.counters ?? []).map(c => [c.i, c])), keepSeat = new Map((this.seats ?? []).map(s => [s.key, s]));
    this.counters = own.filter(f => f.kind === 'counter').map(f => keep.get(f.i) ?? { ...f, q: [], busy: null, left: 0 });
    this.seats = own.filter(f => SEATS[f.kind]).flatMap(f => SEATS[f.kind].map(([a, b], k) => keepSeat.get(f.i + ':' + k) ?? { key: f.i + ':' + k, f: f.fi, x: f.x + a, z: f.z + b, who: null, kind: f.kind }));
    this.browse = own.filter(f => BROWSE.has(f.kind));
    this.toilets = own.filter(f => f.kind === 'toilet').map(f => (this.toilets ?? []).find(t => t.i === f.i) ?? { ...f, who: null });
    this.cooks = own.reduce((t, f) => t + (COOK[f.kind] ?? 0), 0);
    this.decor = new Map(); for (const f of own) if (DECOR.has(f.kind)) this.decor.set(f.fi, (this.decor.get(f.fi) ?? 0) + 1);
    this.staff = [...this.counters.map(c => ({ f: c.fi, x: c.x + .45, z: c.z - .05, kind: 'clerk' })), ...own.filter(f => COOK[f.kind] >= .7).map(f => ({ f: f.fi, x: f.x, z: f.z + .4, kind: 'cook' }))];
  }
  get serviceTime() { return 4.2 / (1 + .7 * this.cooks); }
  floorY(f) { return this.plan.floors[f]?.y ?? 0; }

  // walking: a list of waypoints; a floor change goes through the lift
  route(p, f, x, z) {
    const c = this.plan.core;
    if (p.f !== f && c) { p.moves.push({ f: p.f, x: c.x, z: c.z }, { ride: f }, { f, x: c.x, z: c.z }); }
    p.moves.push({ f, x, z });
  }
  spawn() {
    const d = this.plan.door, p = { id: ++this.id, f: 0, x: d.x, z: d.z + 1.1, y: 0, moves: [], state: 'arrive', wait: 0, shirt: Math.floor(this.rnd() * 6), mood: '', t: this.rnd() * 9 };
    p.moves.push({ f: 0, x: d.x, z: d.z + .2 });
    this.people.push(p);
  }
  leave(p, mood) {
    p.seat && (p.seat.who = null); p.seat = null; p.mood = mood ?? p.mood;
    const d = this.plan.door; this.route(p, 0, d.x, d.z + .2); p.moves.push({ f: 0, x: d.x + (this.rnd() - .5), z: d.z + 1.6 }); p.state = 'out';
  }
  findSeat(p) {
    const free = this.seats.filter(s => !s.who); if (!free.length) return false;
    const s = free[Math.floor(this.rnd() * free.length)]; s.who = p.id; p.seat = s; p.state = 'toSeat'; this.route(p, s.f, s.x, s.z); return true;
  }
  afterCounter(p) {
    if (!this.seats.length) { if (!this.counters.length) this.pay(this.price, p.f, p.x, p.z); return this.leave(p, 'ok'); }   // nothing to sit on: pay on the way out
    if (!this.findSeat(p)) { const d = this.plan.door; p.state = 'standing'; p.wait = 5; p.mood = 'seat?'; this.route(p, 0, d.x + .3 + this.rnd() * .9, d.z - .35 - this.rnd() * .3); }
  }

  step(dt) {
    this.t += dt; this.next -= dt;
    if (this.next <= 0) { this.next = this.every * (.7 + this.rnd() * .6); this.spawn(); }
    // table service: the kitchen cooks one order at a time, faster with more cooks
    if (this.kitchen.length) { this.cooking += dt; if (this.cooking >= this.serviceTime) { this.cooking = 0; const id = this.kitchen.shift(), p = this.people.find(q => q.id === id); if (p) { p.ordered = true; p.state = 'toSeat'; } } }
    for (const c of this.counters) {
      if (c.busy) { c.left -= dt; if (c.left <= 0) { const p = this.people.find(q => q.id === c.busy); c.busy = null; if (p) { if (!this.seats.length) this.pay(this.price, c.fi, c.x, c.z); p.state = 'served'; p.mood = ''; this.afterCounter(p); } } }
      if (!c.busy && c.q.length) { const p = this.people.find(q => q.id === c.q[0]); if (p && !p.moves.length && Math.hypot(p.x - c.x, p.z - (c.z + .55)) < .2) { c.q.shift(); c.busy = p.id; c.left = this.serviceTime; p.state = 'order'; } }
    }
    for (const p of this.people) {
      p.t += dt;
      if (p.moves.length) { this.walk(p, dt); continue; }
      switch (p.state) {
        case 'arrive': {
          if (this.browse.length && this.rnd() < .8) { const b = this.browse[Math.floor(this.rnd() * this.browse.length)]; p.state = 'browse'; p.wait = 2.5; this.route(p, b.fi, b.x + (this.rnd() - .5) * .4, b.z + .45); break; }
          this.toCounter(p); break;
        }
        case 'browse': if ((p.wait -= dt) <= 0) this.toCounter(p); break;
        case 'queue': { const c = p.counter, k = c.q.indexOf(p.id); if (k >= 0) { const tz = c.z + .55 + k * .32; if (Math.abs(p.z - tz) > .02 || Math.abs(p.x - c.x) > .02) p.moves.push({ f: c.fi, x: c.x, z: tz }); } p.mood = k > 2 ? 'wait' : ''; break; }
        case 'standing': if (this.findSeat(p)) { p.mood = ''; break; } if ((p.wait -= dt) <= 0) { this.stats.lostSeat++; this.events.push({ kind: 'lost', f: p.f, x: p.x, z: p.z, why: '자리 없음' }); this.leave(p, 'angry'); } break;
        case 'toSeat':
          // no counter: the order is taken at the table and waits for the kitchen
          if (!this.counters.length && p.ordered !== true) { p.state = 'food'; p.mood = 'wait'; this.kitchen.push(p.id); break; }
          p.state = 'sit'; p.wait = 10 + this.rnd() * 6; p.mood = this.decor.get(p.f) ? 'heart' : ''; break;
        case 'food': break;
        case 'sit': if ((p.wait -= dt) <= 0) {
          const tip = this.decor.get(p.f) ? Math.min(3, this.decor.get(p.f)) : 0;
          this.pay(this.price + tip, p.f, p.x, p.z, tip > 0);   // the bill is paid at the table, with a tip if the floor is decorated
          p.seat.who = null; p.seat = null; this.stats.served++;
          const t = this.toilets.find(t => !t.who);
          if (t && this.rnd() < .35) { t.who = p.id; p.wc = t; p.state = 'wc'; p.wait = 3; p.mood = ''; this.route(p, t.fi, t.x, t.z + .45); } else this.leave(p, 'ok');
        } break;
        case 'wc': if ((p.wait -= dt) <= 0) { p.wc.who = null; p.wc = null; this.leave(p, 'ok'); } break;
        case 'out': p.state = 'gone'; break;
      }
    }
    this.people = this.people.filter(p => p.state !== 'gone');
  }
  pay(n, f, x, z, tip) { this.stats.coins += n; this.events.push({ kind: 'coin', f, x, z, n, tip }); }
  toCounter(p) {
    if (!this.counters.length) return this.afterCounter(p);
    const c = this.counters.reduce((a, b) => (b.q.length + (b.busy ? 1 : 0) < a.q.length + (a.busy ? 1 : 0) ? b : a));
    if (c.q.length >= 7) { this.stats.lostLine++; this.events.push({ kind: 'lost', f: 0, x: p.x, z: p.z, why: '줄이 길어' }); return this.leave(p, 'angry'); }
    c.q.push(p.id); p.counter = c; p.state = 'queue'; this.route(p, c.fi, c.x, c.z + .55 + (c.q.length - 1) * .32);
  }
  walk(p, dt) {
    const m = p.moves[0];
    if (m.ride !== undefined) {   // in the lift shaft
      const ty = this.floorY(m.ride), c = this.plan.core; p.x = c.x; p.inLift = true;
      p.y += Math.sign(ty - p.y) * Math.min(Math.abs(ty - p.y), LIFT * dt);
      if (Math.abs(p.y - ty) < 1e-3) { p.y = ty; p.f = m.ride; p.inLift = false; p.moves.shift(); }
      return;
    }
    const dx = m.x - p.x, dz = m.z - p.z, d = Math.hypot(dx, dz), s = SPEED * dt;
    if (d <= s) { p.x = m.x; p.z = m.z; p.moves.shift(); } else { p.x += dx / d * s; p.z += dz / d * s; }
    p.y = this.floorY(p.f);
  }
}
