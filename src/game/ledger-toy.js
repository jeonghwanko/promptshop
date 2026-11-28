// The regulars' ledger, as a toy (2026-11-28 plan: https://claude.ai/artifact/Pnha8jhXAQaF7Zzpa5i8fe). Only with ?ledger=1.
// Orders from my shops' regulars pile up in a panel on the left. "배달" lays two or three routes on the map with their
// forecasts (wet corners, jammed tiles, arrival against the food's "식기 전" time) and I pick one; the bike rides it, the
// camera riding along; at the door the regular takes the box, and food that is still hot earns a tip and a few words.
// Numbers are the simulation's: an order every 15-25 s ÷ couriers^0.9, at most 5, 90-180 s to send it, reward = my island's
// coins a minute × 0.045 / 0.075 / 0.12 × quantity ÷ 2. Nothing is saved: the coins stay in the toy's own counter.
import { S, sim, pr, map } from './state.js';
import { myPlots, servesOf, tilesOf, takenSet } from './model.js';
import { normalize } from '../v2/spec.js';
import { slotAt } from '../v2/isles.js';
import { TYPE_KO } from '../v2/catalog.js';
import { liveRate } from './vault.js';
import { toScreen, applyZoom, safeRect } from './camera.js';
import { reviewLine } from './reviews.js';
import { el } from './ui.js';
import { iconEl } from '../ui/icons.js';

const CAP = 5, ORDER = [15, 25], TTL = [90, 180], K = { near: .045, far: .075, neighbor: .12 }, VMAX = 3.6, STAY = 2.4;   // top speed in tiles a second; seconds at the door (the handoff)
const MENU = { food: ['국밥', '백반', '떡볶이', '김밥'], cafe: ['라떼', '쿠키', '케이크', '스무디'], shop: ['생필품', '꽃다발', '새 옷', '간식'], fun: ['간식 세트', '팝콘', '음료'], rest: ['수건 세트', '조식', '베개'] };
const WHO = { food: '배고픈 단골', cafe: '커피 단골', shop: '장보는 단골', fun: '놀러 온 단골', rest: '쉬러 온 단골' };
const rnd = (a, b) => a + Math.random() * (b - a), pick = (a) => a[Math.floor(Math.random() * a.length)];
const key = (x, z) => x * 1000 + z, DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]], DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const GRASS = .65;   // speed off the road, across open land between the lots: bumpy, but no jams there
const Q = new URLSearchParams(location.search);   // &wx=rain|snow &jam=1 &crash=1: force one thing to look at it

let orders = [], couriers = [], ncour = 1, coins = 0, tips = 0, sent = 0, missed = 0, crashed = 0, redone = 0, hot = 0, nextIn = rnd(...ORDER) / 2, panel = null, collapsed = false;
let choosing = null;   // { o, routes: [{ path, f, name }], hover }

// ---------- roads ----------
/** Road tiles reachable from a start, with their walking distance (the game's road grid, 4 neighbours). */
function walk(from) {
  const A = sim.A, dist = new Map([[key(...from), 0]]), prev = new Map(), q = [from];
  while (q.length) { const [x, z] = q.shift(), d = dist.get(key(x, z));
    for (const [dx, dz] of DIRS) { const nx = x + dx, nz = z + dz, k = key(nx, nz);
      if (nx < 0 || nz < 0 || nx >= A.w || nz >= A.d || !A.isRoad(nx, nz) || dist.has(k)) continue; dist.set(k, d + 1); prev.set(k, [x, z]); q.push([nx, nz]); } }
  const path = (to) => { const out = [to]; let k = key(...to); while (prev.has(k)) { const p = prev.get(k); out.unshift(p); k = key(...p); } return out; };
  return { dist, path };
}
/** The cheapest way in riding time (road steps cost their length, grass steps their length ÷ GRASS, a road corner a little more,
 *  plus extra(x, z, cost so far, isRoad)). grass: open land between the lots is allowed too, diagonals included. */
function route(from, to, extra, grass = false) {
  const A = sim.A, taken = grass ? takenSet() : null, s0 = key(...from), goal = key(...to), dist = new Map([[s0, 0]]), prev = new Map(), done = new Set(), open = [[0, from]];
  const ok = (x, z) => x >= 0 && z >= 0 && x < A.w && z < A.d && (A.isRoad(x, z) || (grass && slotAt(x, z) > 0 && !taken.has(x + ',' + z)));
  while (open.length) {
    let bi = 0; for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
    const [d, [x, z]] = open.splice(bi, 1)[0], k = key(x, z); if (done.has(k)) continue; done.add(k); if (k === goal) break;
    const p = prev.get(k);
    for (const [dx, dz] of grass ? [...DIRS, ...DIAG] : DIRS) { const nx = x + dx, nz = z + dz, nk = key(nx, nz);
      if (!ok(nx, nz) || done.has(nk)) continue;
      const road = A.isRoad(nx, nz) && A.isRoad(x, z);
      if (dx && dz && (road || !ok(x + dx, z) || !ok(x, z + dz))) continue;   // diagonals only off the road, never cutting a lot's corner
      const turn = road && p && (dx !== x - p[0] || dz !== z - p[1]) ? CORNER * VMAX : 0, len = dx && dz ? Math.SQRT2 : 1;
      const nd = d + len / (road ? 1 : GRASS) + turn + extra(nx, nz, d, road);
      if (nd < (dist.get(nk) ?? Infinity)) { dist.set(nk, nd); prev.set(nk, [x, z]); open.push([nd, [nx, nz]]); } } }
  if (!done.has(goal)) return null;
  const out = [to]; let k = goal; while (prev.has(k)) { const p = prev.get(k); out.unshift(p); k = key(...p); } return out;
}
const overlap = (a, b) => { const s = new Set(a.map(t => key(...t))); return b.filter(t => s.has(key(...t))).length / Math.max(a.length, b.length); };
/** Two or three ways to the door (the islands' roads are a cross with no loops, so the choice is road or grass): the big road;
 *  the quickest way when the bike may cut across open land; one that keeps off the road (and its jams) as much as it can. */
function routesFor(o) {
  const from = o.path[0], to = o.path[o.path.length - 1], wetJam = (x, z, d) => (jamAt(key(x, z), d / VMAX) ? 6 : 0) + (skyAt(x + .5, z + .5, d / VMAX) ? 2 : 0);
  const cands = [o.path, route(from, to, () => 0, true), route(from, to, (x, z, d, road) => wetJam(x, z, d) + (road ? 1.2 : 0), true)];
  const out = [];
  for (const p of cands) if (p && p.length >= 2 && !out.some(q => overlap(q.path, p) > .8)) out.push({ path: p, f: forecast(p) });
  for (const r of out) { const off = r.path.filter(([x, z]) => !sim.A.isRoad(x, z)).length / r.path.length; r.name = !off ? '큰길' : off > .6 ? '들판 가로지르기' : '잔디 지름길'; }
  return out;
}
function newOrder() {
  const shops = myPlots().filter(p => p.door && servesOf(p)); if (!shops.length) return null;
  const p = pick(shops), n = normalize(p.b.input), need = servesOf(p), mine = new Set(tilesOf(S.mySlot).map(([x, z]) => key(x, z)));
  const w = walk(p.door), here = [], away = [];
  for (const [k, d] of w.dist) { if (d < 8) continue; const t = [Math.floor(k / 1000), k % 1000]; (mine.has(k) ? here : away).push([t, d]); }   // 8 tiles at least: a ride over in a blink is no ride
  if (!here.length) return null;
  here.sort((a, b) => a[1] - b[1]); const half = here[Math.floor(here.length / 2)][1];
  const r = Math.random(), kind = away.length && r < .15 ? 'neighbor' : r < .6 ? 'near' : 'far';
  const pool = kind === 'neighbor' ? away : kind === 'near' ? here.filter(([, d]) => d <= half) : here.filter(([, d]) => d > half);
  const [to] = pick(pool.length ? pool : here), qty = 1 + Math.floor(Math.random() * 3);
  const g = p.b.input.guests, who = (typeof g?.who === 'string' && g.who) || WHO[need] || '단골 손님';
  const reward = Math.max(5, Math.round(liveRate().coins * K[kind] * qty / 2));
  const path = w.path(to), fresh = Math.ceil(forecast(path, true).t * 1.6 + 1);   // a clear road gets it there hot, the grass on time, a jammed road late
  return { id: Math.random(), shop: p.key, shopName: n.name || TYPE_KO[n.type] || '가게', color: shopColor(p), who, menu: pick(MENU[need] ?? MENU.food), qty, kind, path, fresh, reward, ttl: Math.round(rnd(...TTL)) };
}
const ACCENTS = ['#e2432f', '#3d9ee0', '#2fa86a', '#a07ad0', '#ff6fa3', '#4ec3d8'];   // never the courier's orange jacket or yellow helmet
const shopColor = (p) => ACCENTS[([...String(p.key)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7) >>> 0) % ACCENTS.length];   // the delivery box wears its shop's colour

// ---------- weather and traffic you can see (2026-11-28 "운 대신 예측") ----------
// Rain and snow clouds drift across the island and wet the roads under them (a drift through a wet corner may slip: the delivery
// fails); jams sit on a stretch of road for a while (the bike crawls, and food that arrives after its "식기 전" time has gone cold:
// the regular asks again). The forecasts read these same clouds and jams where they will be when the bike gets there.
const CLOUD_PUFFS = [[-.62, .25, .3], [-.3, -.05, .38], [.08, -.3, .42], [.45, -.05, .36], [.72, .28, .26], [0, .3, .5]];   // the cloud's silhouette: puffs in -1..1
const WX = { rain: { crash: .35, say: '비가 와요', ko: '비' }, snow: { crash: .55, say: '눈이 와요', ko: '눈' } }, JAMV = .25, CORNER = .3;
let clouds = [], jams = [], cloudIn = rnd(3, 6), jamIn = rnd(2, 5), home = null;
const skyAt = (x, z, t = 0) => { for (const cl of clouds) { if (t > cl.life) continue; const cx = cl.x + cl.vx * t, cz = cl.z + cl.vz * t; if ((x - cx) ** 2 + (z - cz) ** 2 <= cl.r ** 2) return cl.kind; } return null; };
const jamAt = (k, t = 0) => jams.some(j => j.ttl > t && t >= j.start && j.tiles.has(k));   // jammed at t seconds from now (a forming jam only once its cars are all in)
function islandMid() { if (!home) { const ts = tilesOf(S.mySlot); home = [ts.reduce((s, t) => s + t[0], 0) / ts.length + .5, ts.reduce((s, t) => s + t[1], 0) / ts.length + .5]; } return home; }
/** A cloud aimed across my island, from one side to the other (over: a slow one right over it now). */
function newCloud(kind, over = false) {
  const [mx, mz] = islandMid(), a = Math.random() * Math.PI * 2, sp = rnd(.28, .42) * (over ? .4 : 1), r = rnd(3, 5), far = over ? 2 : 16 + r;
  const tx = mx + rnd(-4, 4), tz = mz + rnd(-4, 4);
  return { kind, x: tx - Math.cos(a) * far, z: tz - Math.sin(a) * far, r, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, life: (far + 16 + r) / sp };
}
const CARS = ['#e2685a', '#5fb6e0', '#f2c12e', '#7bc47f', '#f4f0e6', '#a07ad0'];
/** A jam: three to five road tiles in a row, on my island (or in the middle of the given path). */
function newJam(path, start = 0) {
  // never at a shop's door: every route leaves through it, so a jam there would leave no way round (2026-11-28)
  const door = new Set(myPlots().filter(p => p.door).flatMap(({ door: [x, z] }) => [[0, 0], ...DIRS].map(([dx, dz]) => key(x + dx, z + dz))));
  const A = sim.A, roads = path ? path.slice(2, -2) : tilesOf(S.mySlot).filter(([x, z]) => A.isRoad(x, z) && !door.has(key(x, z))); if (!roads.length) return null;
  const make = (seg, ttl, start = rnd(8, 12)) => ({ tiles: new Set(seg.map(t => key(...t))), list: seg, ttl: ttl + start, start, start0: start, age: 0,   // start: seconds of cars gathering before the road jams (it can be seen coming)
    cars: seg.map((t, i) => ({ col: CARS[(t[0] * 7 + t[1] * 3 + i) % CARS.length], ph: Math.random() * 6 })) });
  if (path) { const i = Math.floor(roads.length / 2); return make(roads.slice(Math.max(0, i - 2), i + 2), rnd(30, 45), start); }
  for (let tries = 0; tries < 20; tries++) { const [x, z] = pick(roads), [dx, dz] = pick(DIRS), seg = [];
    for (let i = 0; i < 5 && A.isRoad(x + dx * i, z + dz * i) && !door.has(key(x + dx * i, z + dz * i)); i++) seg.push([x + dx * i, z + dz * i]);
    if (seg.length >= 3) return make(seg, rnd(25, 50)); }
  return null;
}
function weatherTick(dt) {
  for (const cl of clouds) { cl.x += cl.vx * dt; cl.z += cl.vz * dt; cl.life -= dt; } clouds = clouds.filter(cl => cl.life > 0);
  for (const j of jams) { j.ttl -= dt; j.age += dt; j.start -= dt; } jams = jams.filter(j => j.ttl > 0);
  if ((cloudIn -= dt) <= 0) { cloudIn = rnd(14, 26); if (clouds.length < 2) clouds.push(newCloud(Math.random() < .7 ? 'rain' : 'snow')); }
  if ((jamIn -= dt) <= 0) { jamIn = rnd(8, 16); if (jams.length < 3) { const j = newJam(); if (j) jams.push(j); } }
}
const turnsOf = (path) => { const t = [], R = (q) => sim.A.isRoad(q[0], q[1]); for (let i = 1; i < path.length - 1; i++) { const a = path[i - 1], b = path[i], c = path[i + 1]; if ((b[0] - a[0] !== c[0] - b[0] || b[1] - a[1] !== c[1] - b[1]) && R(a) && R(b) && R(c)) t.push(i); } return t; };   // road corners only: on grass the bike just steers
const segLen = (path, i) => { const a = path[Math.max(0, Math.min(path.length - 2, i))], b = path[Math.max(1, Math.min(path.length - 1, i + 1))]; return Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; };
/** The route's forecast: when the bike would reach each tile, is it wet there, is the road jammed. clear: no sky, no jams. */
function forecast(path, clear = false) {
  let t = 0, wet = 0, jam = 0, soon = 0, kind = null; const turns = new Set(turnsOf(path));
  for (let i = 1; i < path.length; i++) { const [x, z] = path[i], road = sim.A.isRoad(x, z), j = !clear && road && jamAt(key(x, z), t), s = clear ? null : skyAt(x + .5, z + .5, t);
    t += segLen(path, i - 1) / (VMAX * (j ? JAMV : road ? 1 : GRASS) * (s ? .85 : 1)); if (j) { jam++; if (!jamAt(key(x, z))) soon++; }
    if (turns.has(i)) { t += CORNER; if (s) { wet++; kind = kind === 'snow' ? kind : s; } } }
  t += .6 + jam * .25;   // pulling away from the shop and braking into and out of a jam (measured on rides, 2026-11-28)
  return { t, wet, jam, soon, kind };
}

// ---------- the camera (2026-11-28 "카메라 워킹"): it springs after a target instead of snapping to it ----------
// Choosing: pulled back to show every route. Riding: close, a little ahead of the bike in the way it goes, punching in on a drift
// and a crash. At the door: closer still for the handoff. Then it eases back to where I was and lets go.
const cam = { on: false, x: 0, y: 0, z: 1, home: null, punch: 0, shake: 0, back: false };
const box = () => document.getElementById('mapbox');
function camGrab() {
  if (cam.on) return; const b = box(), sr = safeRect();
  cam.home = { z: S.zoom, x: (b.scrollLeft + sr.cx - map.offsetLeft) / S.zoom, y: (b.scrollTop + sr.cy - map.offsetTop) / S.zoom };
  Object.assign(cam, { on: true, back: false, x: cam.home.x, y: cam.home.y, z: S.zoom, punch: 0, shake: 0 });
}
const camRelease = () => { cam.on = false; cam.back = false; S.zoom = cam.z; applyZoom(); };
const rideZoom = () => { const d = window.devicePixelRatio || 1; return Math.max(2, Math.round(Math.min(6, cam.home.z * 3) * d)) / d; };   // whole device pixels: crisp while riding
function camStep(dt) {
  if (!cam.on) return; const sr = safeRect(); let tx = cam.home.x, ty = cam.home.y, tz = cam.home.z, kp = 6, kz = 3.5;
  const c = couriers.find(q => q.follow);
  if (choosing) {
    const pts = choosing.routes.flatMap(r => r.path).map(([x, z]) => pr.P(x + .5, z + .5)), xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const w = Math.max(...xs) - Math.min(...xs) + 120, h = Math.max(...ys) - Math.min(...ys) + 140;
    tx = (Math.max(...xs) + Math.min(...xs)) / 2; ty = (Math.max(...ys) + Math.min(...ys)) / 2 - 10;
    tz = Math.max(cam.home.z * .8, Math.min(cam.home.z * 2.2, (sr.r - sr.l) / w, (sr.b - sr.t) / h)); kp = 4; kz = 3;
  } else if (c) {
    const [bx, by] = pr.P(...tileAt(c.path, c.at)), lead = c.handoff != null ? 0 : .45;
    tx = bx + (c.vx ?? 0) * lead; ty = by - 14 + (c.vy ?? 0) * lead; tz = rideZoom() * (c.handoff != null ? 1.15 : 1);
    if (c.handoff != null) kp = 3;
  } else if (cam.back) { kp = 3.5; kz = 3; if (Math.hypot(cam.x - tx, cam.y - ty) < 2 && Math.abs(cam.z - tz) < .01) { cam.z = tz; return camRelease(); } }
  else return camRelease();
  const ep = 1 - Math.exp(-kp * dt), ez = 1 - Math.exp(-kz * dt);
  cam.x += (tx - cam.x) * ep; cam.y += (ty - cam.y) * ep; cam.z += (tz - cam.z) * ez;
  cam.punch *= Math.exp(-5 * dt); cam.shake = Math.max(0, cam.shake - dt);
  const k = cam.shake * 22, sx = (Math.random() - .5) * k, sy = (Math.random() - .5) * k;
  S.zoom = cam.z * (1 + cam.punch); applyZoom(); map.style.imageRendering = 'pixelated';
  box().scrollTo({ left: map.offsetLeft + (cam.x + sx) * S.zoom - sr.cx, top: map.offsetTop + (cam.y + sy) * S.zoom - sr.cy, behavior: 'instant' });
}

// ---------- choosing a route ----------
const ROUTE = ['#ffd23a', '#4ee0c1', '#ff8fa3'];
let tags = [];
function choose(o) {
  if (couriers.length >= ncour) return;
  if (Q.get('jam') === '1' && !jams.some(j => o.path.some(t => j.tiles.has(key(...t))))) { const j = newJam(o.path, Q.get('jam') === 'soon' ? 7 : 0); if (j) jams.push(j); }   // &jam=1: a jam on the short way, to look at it; &jam=soon: one starting to gather there
  const routes = routesFor(o); if (routes.length === 1) return send(o, routes[0].path);
  if (Q.get('jam') === 'soon') {   // &jam=soon: cars start gathering on the stretch only the big road takes (so the shortcut can dodge them)
    const others = new Set(routes.slice(1).flatMap(r => r.path.map(t => key(...t)))), own = routes[0].path.filter(t => !others.has(key(...t)) && sim.A.isRoad(...t));
    if (own.length >= 3) { const i = Math.floor(own.length / 2), seg = own.slice(Math.max(0, i - 2), i + 2); jams = jams.filter(j => !seg.some(t => j.tiles.has(key(...t)))); jams.push({ ...newJam(o.path, 6), tiles: new Set(seg.map(t => key(...t))), list: seg, cars: seg.map((t, k) => ({ col: CARS[(t[0] * 7 + t[1] * 3 + k) % CARS.length], ph: Math.random() * 6 })) }); }
  }
  choosing = { o, routes, hover: 0 }; camGrab(); cam.back = false;
  tags = routes.map((r, i) => { const t = el('button', { class: 'routetag', style: `--rc:${ROUTE[i]}`, on: { click: () => send(o, r.path), pointerenter: () => { choosing.hover = i; } } }, el('b', {}, r.name), fcChips(r.f, o.fresh)); document.body.append(t); return t; });
  draw();
}
/** While I choose, the clouds move and the cars gather: each route's forecast is read again, on its tag and in the ledger. */
let refreshIn = 0;
function refreshChoice(dt) {
  if (!choosing || (refreshIn -= dt) > 0) return; refreshIn = .5;
  choosing.routes.forEach((r, i) => { r.f = forecast(r.path); tags[i]?.replaceChildren(el('b', {}, r.name), fcChips(r.f, choosing.o.fresh)); });
  for (const b of panel?.querySelectorAll('.lroute') ?? []) { const i = [...b.parentNode.children].indexOf(b), r = choosing.routes[i]; if (r) b.replaceChildren(el('b', {}, r.name), fcChips(r.f, choosing.o.fresh)); }
}
function unchoose() { choosing = null; tags.forEach(t => t.remove()); tags = []; }
/** Each route's tag sits on a stretch only it takes (the middle of it), so the tags never stack. */
function placeTags() {
  if (!choosing) return;
  choosing.routes.forEach((r, i) => { const others = new Set(choosing.routes.filter((_, j) => j !== i).flatMap(q => q.path.map(t => key(...t))));
    const own = r.path.filter(t => !others.has(key(...t))), list = own.length ? own : r.path, [x, z] = list[Math.floor(list.length / 2)], [sx, sy] = screenAt(x + .5, z + .5);
    const t = tags[i]; if (!t) return; t.style.transform = `translate(${Math.round(sx - t.offsetWidth / 2)}px, ${Math.round(sy - t.offsetHeight - 12)}px)`; t.classList.toggle('on', choosing.hover === i); });
}

// ---------- the ride ----------
const parts = [], pops = [];   // smoke, exhaust, skid marks, sparks, coins: kept in map tiles so they stay put while the camera moves
let fxCanvas = null, sound = null, soundOn = true, hitstop = 0;
const tileAt = (path, s) => { const last = path.length - 1, i = Math.max(0, Math.min(last, Math.floor(s))), f = Math.max(0, Math.min(1, s - i)), a = path[i], b = path[Math.min(last, i + 1)]; return [a[0] + (b[0] - a[0]) * f + .5, a[1] + (b[1] - a[1]) * f + .5]; };
const screenAt = (x, z) => { const [px, py] = pr.P(x, z); return toScreen(px, py); };
const emit = (x, z, kind, n, spread = 1) => { for (let k = 0; k < n; k++) parts.push({ x, z, kind, ox: (Math.random() - .5) * 10 * spread, oy: (Math.random() - .5) * 6 * spread, vx: (Math.random() - .5) * 40 * spread * (kind === 'coin' ? 3 : 1), vy: kind === 'coin' ? -160 - Math.random() * 90 : -10 - Math.random() * 30, life: 0, max: kind === 'skid' ? 3 : kind === 'spark' ? .4 : kind === 'coin' ? .9 : .5 + Math.random() * .5 }); };

/** Engine, tyres, a crash and a till, made in code (the game has no sound files). */
function makeSound() {
  try {
    const ctx = new AudioContext(), master = ctx.createGain(); master.gain.value = .5; master.connect(ctx.destination);
    const osc = ctx.createOscillator(), lp = ctx.createBiquadFilter(), eg = ctx.createGain(); osc.type = 'sawtooth'; osc.frequency.value = 50; lp.type = 'lowpass'; lp.frequency.value = 700; eg.gain.value = 0;
    osc.connect(lp).connect(eg).connect(master); osc.start();
    const noise = ctx.createBuffer(1, ctx.sampleRate * .6, ctx.sampleRate), d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const burst = (f, q, g, dur, type = 'bandpass') => { const src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), gg = ctx.createGain(); src.buffer = noise; bp.type = type; bp.frequency.value = f; bp.Q.value = q; gg.gain.setValueAtTime(g, ctx.currentTime); gg.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + dur); src.connect(bp).connect(gg).connect(master); src.start(); src.stop(ctx.currentTime + dur); };
    const ding = (f, at) => { const o = ctx.createOscillator(), gg = ctx.createGain(); o.type = 'square'; o.frequency.value = f; gg.gain.setValueAtTime(.0001, ctx.currentTime); gg.gain.setValueAtTime(.08, ctx.currentTime + at); gg.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + at + .18); o.connect(gg).connect(master); o.start(ctx.currentTime + at); o.stop(ctx.currentTime + at + .2); };
    return { set(v, on) { const t = ctx.currentTime; osc.frequency.setTargetAtTime(48 + v * 38, t, .08); eg.gain.setTargetAtTime(on && soundOn ? .07 : 0, t, .1); },
      skid() { if (soundOn) burst(2200, 3, .22, .45); }, crash() { if (soundOn) { burst(300, .7, .5, .5, 'lowpass'); burst(3000, 2, .15, .3); } },
      vroom() { if (soundOn) { const t = ctx.currentTime; osc.frequency.cancelScheduledValues(t); osc.frequency.setValueAtTime(60, t); osc.frequency.linearRampToValueAtTime(170, t + .35); osc.frequency.linearRampToValueAtTime(110, t + .7); } },
      coins(n) { if (soundOn) for (let i = 0; i < n; i++) ding(1320 + i * 220, i * .07); } };
  } catch { return null; }
}

function send(o, path) {
  if (couriers.length >= ncour) return;
  unchoose(); orders = orders.filter(x => x !== o); sent++;
  if (!sound) sound = makeSound();   // the press is the gesture that lets sound start
  for (const q of couriers) q.follow = false;
  const c = { o, path, at: 0, v: 0, back: false, turns: turnsOf(path), drifted: new Set(), drift: 0, dsign: 1, start: .7, puff: 0, lastSaid: 0, follow: true,
    wx: null, wxSaid: false, jamSaid: false, took: 0, soggy: false, flip: 1, up: false, wheel: 0, crashT: 0, handoff: null };
  couriers.push(c); camGrab(); cam.back = false; sound?.vroom();
  const [x, z] = tileAt(path, 0); emit(x, z, 'exhaust', 10, 1.4); popAt(x, z, '부릉!', 'loud'); draw();
}

/** Paid at the door: the reward, and a tip for food that is still hot; the regular says a line of the shop's own reviews. */
function handoff(c) {
  const f = 1 - c.took / c.o.fresh, [x, z] = tileAt(c.path, c.at);
  c.tier = f < 0 ? 'cold' : f >= .35 ? 'hot' : 'ok'; c.handoff = 0;
  if (c.tier === 'cold') { c.soggy = true; redone++; orders.push({ ...c.o, id: Math.random(), ttl: 70, redo: true });
    setTimeout(() => popAt(x, z, '식었어요…', 'loud cold'), 350); setTimeout(() => bubble(c, '★★', '다시 보내 주세요'), 1000); }
  else { const tip = Math.ceil(c.o.reward * (c.tier === 'hot' ? .6 : .15)); coins += c.o.reward + tip; tips += tip; if (c.tier === 'hot') hot++;
    setTimeout(() => popAt(x, z, c.tier === 'hot' ? '따끈 도착!' : `${c.o.menu} 도착!`, c.tier === 'hot' ? 'loud hot' : 'loud'), 350);
    setTimeout(() => { emit(x, z, 'coin', c.tier === 'hot' ? 14 : 6, 1.2); popAt(x, z, `+${c.o.reward}  팁 +${tip}`, 'gold'); sound?.coins(c.tier === 'hot' ? 4 : 2); }, 900);
    setTimeout(() => bubble(c, c.tier === 'hot' ? '★★★★★' : '★★★★', reviewLine(c.o.shop) ?? (c.tier === 'hot' ? '아직 뜨거워요!' : '잘 받았어요')), 1200); }
  draw();
}
function bubble(c, stars, text) {
  const [x, z] = c.path[c.path.length - 1], b = el('div', { class: 'toysay' }, el('span', { class: 'rs' }, stars), el('span', { class: 'rt' }, text)); document.body.append(b);
  pops.push({ el: b, x: x + .5, z: z + .5, t: 0, max: 3, rise: 0, dy: -110 });
}

function tick(dt) {
  // orders: new ones while there is room (faster with more couriers: more regulars), old ones run out
  if (orders.length < CAP && (nextIn -= dt) <= 0) { const o = newOrder(); if (o) orders.push(o); nextIn = rnd(...ORDER) / ncour ** .9; }
  for (const o of orders) o.ttl -= dt;
  const gone = orders.filter(o => o.ttl <= 0); if (gone.length) { missed += gone.length; orders = orders.filter(o => o.ttl > 0); if (choosing && gone.includes(choosing.o)) { unchoose(); cam.back = true; } }
}

function moveCouriers(dt) {
  let vmaxNow = 0, moving = false;
  if (hitstop > 0) { hitstop -= dt; return; }   // a crash freezes everything for a blink
  for (const c of [...couriers]) {
    const path = c.path, last = path.length - 1;
    // under a cloud, in a jam: where the bike is now, on the same clouds and jams the map shows
    const [hx, hz] = tileAt(path, c.at), here = path[Math.max(0, Math.min(last, Math.round(c.at)))];
    c.wx = skyAt(hx, hz); if (c.wx && !c.wxSaid && !c.back) { c.wxSaid = true; pop(c, WX[c.wx].say); draw(); }
    const inJam = jamAt(key(...here)), grass = !sim.A.isRoad(...here); c.grass = grass;
    if (inJam && !c.jamSaid && !c.back) { c.jamSaid = true; pop(c, '길이 막혀요'); draw(); }
    if (!c.back && !c.failed && c.handoff == null && c.crashT <= 0) c.took += dt;
    if (c.crashT > 0) { c.crashT -= dt; c.v = 0; if (c.crashT <= 0) { c.back = true; c.failed = true; if (c.follow) { c.follow = false; cam.back = true; } draw(); } }
    else if (c.handoff != null) { c.handoff += dt; c.v = 0; if (c.handoff >= STAY) { c.handoff = null; c.back = true; c.at = last; c.drifted.clear(); c.start = .6; if (c.follow) { c.follow = false; cam.back = true; } sound?.vroom(); draw(); } }
    else {
      // speed: full on the straights, braking into the next corner, slower in a jam, in rain or snow, or limping home after a crash
      const fwd = !c.back, ahead = fwd ? c.turns.find(t => t > c.at) : [...c.turns].reverse().find(t => t < c.at), dist = ahead == null ? 99 : Math.abs(ahead - c.at);
      let target = VMAX * (inJam && fwd ? JAMV : grass ? GRASS : 1) * (c.wx ? .85 : 1) * (c.failed ? .45 : 1); if (dist < 1.2 && c.v > 2) target = Math.min(target, 1.9);
      if (fwd && ahead == null && last - c.at < 1.5) target = Math.min(target, 1.2 + (last - c.at));   // pull up at the door
      c.v += (target - c.v) * (c.v < target ? 2.4 : 7) * dt;
      const s0 = c.at, step = c.v * dt / segLen(path, fwd ? Math.floor(c.at) : Math.ceil(c.at) - 1); c.at = fwd ? Math.min(last, c.at + step) : Math.max(0, c.at - step);
      // a corner crossed at speed: drift (on a wet one the tyres may let go)
      if (ahead != null && (fwd ? s0 < ahead && c.at >= ahead : s0 > ahead && c.at <= ahead) && !c.drifted.has(ahead) && c.v > 1.2) {
        c.drifted.add(ahead); const p0 = screenAt(...tileAt(path, ahead + (fwd ? -1 : 1))), p1 = screenAt(...tileAt(path, ahead)), p2 = screenAt(...tileAt(path, ahead + (fwd ? 1 : -1)));
        c.dsign = Math.sign((p1[0] - p0[0]) * (p2[1] - p1[1]) - (p1[1] - p0[1]) * (p2[0] - p1[0])) || 1; c.drift = .55; sound?.skid();
        if (c.follow) { cam.shake = .22; cam.punch = .07; }
        const [x, z] = tileAt(path, c.at); emit(x, z, 'smoke', 16, 1.8); emit(x, z, 'spark', 8, 1);
        if (performance.now() - c.lastSaid > 1200) { c.lastSaid = performance.now(); popAt(x, z, '끼익!', 'loud'); }
        if (fwd && c.wx && (Q.has('crash') || Math.random() < WX[c.wx].crash)) c.slip = true;
      }
      if (c.slip) { c.slip = false; c.crashT = 1.6; crashed++; hitstop = .14; sound?.crash(); if (c.follow) { cam.shake = .5; cam.punch = .16; }
        const [x, z] = tileAt(path, c.at); emit(x, z, 'smoke', 14, 1.6); emit(x, z, 'spark', 10, 1.2); pop(c, '꽈당!', 'loud'); setTimeout(() => pop(c, '배달 실패'), 500); draw(); }
      else if (fwd && c.at >= last) { c.v = 0; handoff(c); }
      else if (!fwd && c.at <= 0) { couriers = couriers.filter(x => x !== c); draw(); continue; }
      moving = true; vmaxNow = Math.max(vmaxNow, c.v);
      // exhaust behind; skid marks while drifting
      const [x, z] = tileAt(path, c.at); c.puff -= dt; if (c.puff <= 0) { c.puff = c.v > 2.5 ? .06 : .12; emit(x, z, grass ? 'dust' : 'exhaust', grass ? 2 : 1, .5); }
      if (c.drift > 0) emit(x, z, 'skid', 1, .3);
    }
    // which way it faces, how fast it moves on the map (the camera leads by it)
    const [x, z] = tileAt(path, c.at), [px, py] = pr.P(x, z);
    if (c.lx != null && dt > 0) { const vx = (px - c.lx) / dt, vy = (py - c.ly) / dt; c.vx = (c.vx ?? 0) * .85 + vx * .15; c.vy = (c.vy ?? 0) * .85 + vy * .15; if (Math.abs(px - c.lx) > .05) c.flip = px < c.lx ? -1 : 1; if (Math.abs(py - c.ly) > .05) c.up = py < c.ly; }
    c.lx = px; c.ly = py; c.wheel += c.v * dt * 4;
    c.start = Math.max(0, c.start - dt); c.drift = Math.max(0, c.drift - dt);
  }
  sound?.set(vmaxNow, moving);
}

// ---------- drawing on the map (mapview's hooks: the ground under the buildings, things sorted in with them) ----------
const OUT = '#2b2117';
let GA = 1;   // the alpha everything below is drawn at (the see-through copy over the buildings draws at less)
const rect = (g, x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
/** Shapes drawn twice: a dark outline pass a pixel wider, then the colours (the map's buildings carry the same dark rim). */
function outlined(g, shapes) { for (const [x, y, w, h] of shapes) rect(g, x - 1, y - 1, w + 2, h + 2, OUT); for (const [x, y, w, h, col] of shapes) rect(g, x, y, w, h, col); }
function wheel(g, cx, cy, ph) {
  const rows = [[-2, 4], [-3, 6], [-4, 8], [-4, 8], [-4, 8], [-4, 8], [-3, 6], [-2, 4]];
  rows.forEach(([x, w], i) => rect(g, cx + x - 1, cy - 4 + i, w + 2, 1, OUT)); rect(g, cx - 3, cy - 5, 6, 1, OUT); rect(g, cx - 3, cy + 4, 6, 1, OUT);
  rows.forEach(([x, w], i) => rect(g, cx + x + 1, cy - 4 + i, Math.max(0, w - 2), 1, '#4a423c'));
  rect(g, cx - 1, cy - 1, 2, 2, '#c9c2b6'); rect(g, Math.round(cx - .5 + Math.cos(ph) * 2.4), Math.round(cy - .5 + Math.sin(ph) * 2.4), 1, 1, '#e8e0d0');
}
/** The courier: a scooter with a delivery box in the shop's colour, a rider in a yellow helmet. Side view facing right, ground at y 0. */
function drawBike(g, c) {
  const [x, z] = tileAt(c.path, c.at), [px, py] = pr.P(x, z), crash = c.crashT > 0;
  const dp = c.drift > 0 ? Math.sin(Math.PI * (1 - c.drift / .55)) : 0, wheelie = c.start > 0 ? -.38 * (c.start / .7) : 0;
  const lean = crash ? Math.sin(performance.now() / 35) * .7 : c.dsign * .45 * dp * c.flip, slide = c.dsign * 6 * dp;
  const bob = crash || c.v < .2 ? 0 : c.grass ? -Math.round(Math.abs(Math.sin(performance.now() / 45 + c.at)) * 3) : (Math.sin(performance.now() / 60) > 0 ? -1 : 0);   // bumps on the grass
  rect(g, Math.round(px - 13), Math.round(py - 1), 26, 3, 'rgba(23,40,70,.28)');   // shadow on the road
  g.save(); g.translate(Math.round(px + slide), Math.round(py + bob)); g.scale(c.flip, 1);
  if (wheelie) { g.translate(-7, 0); g.rotate(wheelie); g.translate(7, 0); } else if (lean) g.rotate(lean);
  const acc = c.o.color;
  wheel(g, -7, -5, c.wheel); wheel(g, 8, -5, c.wheel);
  outlined(g, [
    ...(c.back ? [[-13, -16, 7, 2, '#8a8378']] : [[-14, -22, 9, 8, '#fff8ea'], [-14, -16, 9, 2, '#e0cfaa'], [-11, -20, 3, 3, acc]]),   // the box (on the way back: an empty rack)
    [-12, -13, 13, 5, acc], [-12, -9, 12, 1, 'rgba(0,0,0,.25)'],                         // rear body
    [-1, -9, 7, 2, '#5a4a3a'],                                                            // floor
    [5, -18, 3, 11, acc], [6, -18, 1, 9, 'rgba(255,255,255,.35)'],                       // front shield
    [8, -7, 1, 3, '#8a8378'], [3, -20, 5, 1, OUT], [8, -16, 1, 2, '#fff3a0'],            // fork, handlebar, headlight
    [-4, -14, 5, 2, '#3f5f84'], [0, -14, 2, 5, '#3f5f84'],                               // legs
    [-5, -21, 5, 7, '#ff8a3d'], [-5, -16, 5, 2, '#d9652a'], [-1, -20, 6, 2, '#ff8a3d'],   // the courier's orange jacket, arm
    [-4, -23, 3, 2, '#f5cfa4'],                                                           // face
    [-6, -27, 6, 4, '#ffd23a'], [-6, -24, 6, 1, '#d9a52a'], ...(c.up ? [] : [[-1, -26, 2, 2, '#2b5797']]),   // helmet (the visor shows coming my way)
  ]);
  g.restore();
  // steam off the box while the food is hot, thinning as it cools; a slim bar of what is left of the "식기 전" time
  if (!c.back && c.handoff == null && !crash) {
    const f = Math.max(0, 1 - c.took / c.o.fresh), t = performance.now() / 1000, bx = Math.round(px - 10 * c.flip), by = Math.round(py - 26);
    for (let i = 0; i < 3; i++) { const u = (t * .9 + i / 3) % 1; g.globalAlpha = GA * (1 - u) * Math.min(1, f * 1.6); rect(g, Math.round(bx + Math.sin(t * 3 + i * 2) * 2 + (i - 1) * 3), Math.round(by - u * 12), 2, 2, '#ffffff'); }
    g.globalAlpha = GA; const W = 18, X = Math.round(px - W / 2), Y = Math.round(py - 38); rect(g, X - 1, Y - 1, W + 2, 4, OUT); rect(g, X, Y, Math.round(W * f), 2, f > .35 ? '#f2a12e' : '#e2685a');
  }
}
/** The regular at the door, stepping out to take the box (arms up when it lands, a hop and hearts for a hot one). */
function drawRegular(g, c) {
  const [x, z] = c.path[c.path.length - 1], [px0, py0] = pr.P(x + .5, z + .5), u = c.handoff ?? 0, side = c.flip > 0 ? 1 : -1;
  const hop = c.tier === 'hot' && u > .9 && u < 1.6 ? -Math.round(Math.abs(Math.sin((u - .9) * 9)) * 4) : 0, px = Math.round(px0 + side * 14), py = Math.round(py0) + hop;
  g.globalAlpha = GA * Math.min(1, u / .3);
  rect(g, px - 4, Math.round(py0) - 1, 8, 2, 'rgba(23,40,70,.25)');
  outlined(g, [[-3, -4, 2, 4, '#3f5f84'], [1, -4, 2, 4, '#3f5f84'], [-4, -11, 8, 7, '#ef5a4a'], [-3, -15, 6, 4, '#f5cfa4'], [-3, -17, 6, 2, '#6b4630']].map(([a, b, w, h, col]) => [px + a, py + b, w, h, col]));
  if (u > .6) { rect(g, px - 6, py - 15, 2, 5, '#ef5a4a'); rect(g, px + 4, py - 15, 2, 5, '#ef5a4a'); }   // arms up
  if (u > .4 && c.tier !== 'cold') { const lift = Math.min(1, (u - .4) / .3); outlined(g, [[Math.round(px - 4 - side * 22 * (1 - lift)), Math.round(py - 23 + 6 * (1 - lift)), 8, 6, '#fff8ea']]); }   // the box passes over
  if (c.tier === 'hot' && u > 1) for (let i = 0; i < 3; i++) { const v = ((u - 1) * .8 + i * .3) % 1; g.globalAlpha = GA * (1 - v); const hx = px - 9 + i * 7, hy = Math.round(py - 30 - v * 16); rect(g, hx, hy, 2, 2, '#ff5d73'); rect(g, hx + 3, hy, 2, 2, '#ff5d73'); rect(g, hx, hy + 2, 5, 2, '#ff5d73'); rect(g, hx + 1, hy + 4, 3, 1, '#ff5d73'); }
  g.globalAlpha = GA;
}
/** A car stuck in a jam: a little side-on hatchback, brake lights blinking, inching. */
function drawCar(g, j, i) {
  const n = j.list.length, [x, z] = j.list[i], car = j.cars[i], t = performance.now() / 1000;
  const elapsed = j.start0 - Math.max(0, j.start), due = (n - 1 - i) / n * .85 * j.start0, u = j.start0 ? Math.max(0, Math.min(1, (elapsed - due) / .8)) : 1;   // the front car first, then each behind it
  if (u <= 0) return;
  const [ax, az] = j.list[0], [bx, bz] = j.list[Math.min(1, n - 1)], back = (1 - u) ** 2 * 2.5;   // coming in from behind the queue, braking to a stop
  const [px, py] = pr.P(x + .5 - (bx - ax) * back, z + .5 - (bz - az) * back), fade = Math.max(0, Math.min(1, j.ttl / 2, u * 3)), stopped = u >= 1, nudge = stopped && Math.sin(t * 2 + car.ph) > .85 ? 1 : 0;
  const X = Math.round(px - 7 + nudge), Y = Math.round(py); g.globalAlpha = GA * fade;
  rect(g, X - 1, Y - 1, 16, 3, 'rgba(23,40,70,.25)');
  outlined(g, [[X, Y - 7, 14, 4, car.col], [X + 3, Y - 10, 8, 3, car.col], [X + 4, Y - 9, 3, 2, '#bfe3f5'], [X + 8, Y - 9, 2, 2, '#bfe3f5']]);
  rect(g, X + 1, Y - 3, 3, 3, OUT); rect(g, X + 10, Y - 3, 3, 3, OUT);
  if (!stopped || Math.sin(t * 5 + car.ph) > 0) rect(g, X, Y - 6, 1, 2, '#ff3b2f');   // brake lights: on while pulling up, blinking once stuck
  g.globalAlpha = GA;
}
/** Where the bike is going: a bouncing pin over the door. */
function drawPin(g, path, col) {
  const [x, z] = path[path.length - 1], [px, py] = pr.P(x + .5, z + .5), b = -Math.round(Math.abs(Math.sin(performance.now() / 260)) * 5), X = Math.round(px), Y = Math.round(py - 30 + b);
  outlined(g, [[X - 5, Y - 8, 10, 8, col], [X - 3, Y, 6, 2, col], [X - 1, Y + 2, 2, 2, col], [X - 2, Y - 6, 4, 4, '#fff8ea']]);
}
const diamond = (g, x, z) => { const a = pr.P(x, z), b = pr.P(x + 1, z), c2 = pr.P(x + 1, z + 1), d2 = pr.P(x, z + 1); g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.lineTo(...c2); g.lineTo(...d2); g.closePath(); g.fill(); };
/** A route as marching pixel dashes along the road (the picked one bright and thick). */
function drawRoute(g, path, col, strong, from = 0) {
  const t = performance.now() / 1000, s = strong ? 6 : 4, gap = strong ? 10 : 9;
  let along = -((t * 36) % gap); g.globalAlpha = strong ? 1 : .6;
  for (let i = Math.max(0, Math.floor(from)); i < path.length - 1; i++) { const [ax, ay] = pr.P(path[i][0] + .5, path[i][1] + .5), [bx, by] = pr.P(path[i + 1][0] + .5, path[i + 1][1] + .5), L = Math.hypot(bx - ax, by - ay);
    for (; along < L; along += gap) { if (along < 0) continue; const u = along / L, X = Math.round(ax + (bx - ax) * u - s / 2), Y = Math.round(ay + (by - ay) * u - s / 2); rect(g, X - 1, Y - 1, s + 2, s + 2, OUT); rect(g, X, Y, s, s, col); }
    along -= L; }
  g.globalAlpha = 1;
}
function mapGround(g) {
  const A = sim.A; if (!A) return;
  for (const cl of clouds) { const a = Math.min(1, cl.life / 3); g.fillStyle = cl.kind === 'rain' ? `rgba(40,90,170,${.4 * a})` : `rgba(240,248,255,${.7 * a})`;
    for (let z = Math.floor(cl.z - cl.r); z <= cl.z + cl.r; z++) for (let x = Math.floor(cl.x - cl.r); x <= cl.x + cl.r; x++) if (A.isRoad(x, z) && (x + .5 - cl.x) ** 2 + (z + .5 - cl.z) ** 2 <= cl.r ** 2) diamond(g, x, z); }   // the wet roads: what the forecast counts
  for (const j of jams) { const forming = j.start > 0, a = forming ? (.1 + .14 * (1 - j.start / j.start0)) * (.75 + .25 * Math.sin(performance.now() / 180)) : .38 * Math.min(1, j.ttl / 2);   // faint and pulsing while the cars gather, solid once jammed
    g.fillStyle = `rgba(226,60,40,${a})`; for (const [x, z] of j.list) diamond(g, x, z); }
  if (choosing) { choosing.routes.forEach((r, i) => { if (i !== choosing.hover) drawRoute(g, r.path, ROUTE[i], false); }); drawRoute(g, choosing.routes[choosing.hover].path, ROUTE[choosing.hover], true); }
  for (const c of couriers) if (!c.back && c.handoff == null && c.crashT <= 0) drawRoute(g, c.path, 'rgba(255,248,234,.9)', false, c.at + 1);   // the way ahead, faint
}
function mapItems(items, g) {
  for (const j of jams) j.list.forEach(([x, z], i) => items.push({ d: x + z + 1.2, draw: () => drawCar(g, j, i) }));
  const ghost = (f) => () => { GA = .45; g.globalAlpha = GA; f(); GA = 1; g.globalAlpha = 1; };   // drawn again faintly over everything: seen through a building in front
  for (const c of couriers) { const [x, z] = tileAt(c.path, c.at), bike = () => drawBike(g, c); items.push({ d: x + z + .3, draw: bike }, { d: 1e8 - 1, draw: ghost(bike) });
    if (c.handoff != null) { const [ex, ez] = c.path[c.path.length - 1], who = () => drawRegular(g, c); items.push({ d: ex + ez + 1.4, draw: who }, { d: 1e8 - 1, draw: ghost(who) }); }
    if (!c.back && c.handoff == null) items.push({ d: 1e8, draw: () => drawPin(g, c.path, '#ffd23a') }); }
  if (choosing) items.push({ d: 1e8, draw: () => drawPin(g, choosing.o.path, ROUTE[choosing.hover]) });
}

// ---------- the sky, smoke and the like, over everything (a screen canvas) ----------
function drawOver(dt) {
  if (!fxCanvas) { fxCanvas = document.createElement('canvas'); fxCanvas.className = 'toyfx'; document.body.append(fxCanvas); }
  const d = window.devicePixelRatio || 1; if (fxCanvas.width !== Math.round(innerWidth * d)) { fxCanvas.width = Math.round(innerWidth * d); fxCanvas.height = Math.round(innerHeight * d); }
  const g = fxCanvas.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, innerWidth, innerHeight);
  const px = Math.max(2, Math.round(map.getBoundingClientRect().width / map.width));
  drawSky(g, px);
  for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life += dt; if (p.life >= p.max) { parts.splice(i, 1); continue; }
    const t = p.life / p.max, [sx, sy] = screenAt(p.x, p.z);
    if (p.kind !== 'skid') { p.ox += p.vx * dt; p.oy += p.vy * dt; p.vx *= .96; if (p.kind === 'coin') p.vy += 520 * dt; }
    const x = Math.round(sx + p.ox), y = Math.round(sy + p.oy - (p.kind === 'coin' ? 30 : 0));
    if (p.kind === 'skid') { g.fillStyle = `rgba(40,32,28,${.55 * (1 - t)})`; g.fillRect(x - px * 1.5, y - px / 2, px * 3, px * 1.5); }
    else if (p.kind === 'spark') { g.fillStyle = t < .5 ? '#fff3a0' : '#f2a12e'; g.fillRect(x, y, px, px); }
    else if (p.kind === 'coin') { const w = Math.round(Math.abs(Math.cos(p.life * 14)) * px * 3 + px); g.fillStyle = OUT; g.fillRect(x - w / 2 - 1, y - px * 2 - 1, w + 2, px * 4 + 2); g.fillStyle = '#ffd23a'; g.fillRect(x - w / 2, y - px * 2, w, px * 4); g.fillStyle = '#fff3a0'; g.fillRect(x - w / 2, y - px * 2, Math.max(1, w / 3), px); }
    else { const n = p.kind === 'smoke' ? 4 + Math.round(t * 5) : 2 + Math.round(t * 3), a = (p.kind === 'smoke' ? .85 : .6) * (1 - t); if (p.kind === 'smoke') { g.fillStyle = `rgba(120,118,128,${a})`; g.fillRect(x - (n + 1) * px / 2, y - (n - 1) * px / 2, (n + 1) * px, (n + 1) * px); }   // a grey shadow under each puff, so the smoke reads as chunks, not a white smudge
      g.fillStyle = p.kind === 'smoke' ? `rgba(250,250,250,${a})` : p.kind === 'dust' ? `rgba(196,160,104,${a * 1.3})` : `rgba(150,150,160,${a})`; g.fillRect(x - n * px / 2, y - n * px / 2, n * px, n * px); }
  }
  // speed lines behind a fast bike
  for (const c of couriers) { if (c.v < 2.6 || c.crashT > 0 || c.vx == null) continue; const m = Math.hypot(c.vx, c.vy); if (m < 5) continue;
    const ux = c.vx / m, uy = c.vy / m, [x, z] = tileAt(c.path, c.at), [sx, sy] = screenAt(x, z); g.fillStyle = 'rgba(255,255,255,.75)';
    for (let k2 = 0; k2 < 5; k2++) { const off = (k2 - 2) * 3 * px, bx = sx - ux * (14 + k2 * 3) * px - uy * off, by = sy - 10 * px - uy * (14 + k2 * 3) * px + ux * off; for (let j = 0; j < 7; j++) g.fillRect(Math.round(bx - ux * j * 2 * px), Math.round(by - uy * j * 2 * px), px, px); } }
}
/** The clouds over the island: rain or snow falling from a lump of puffs on a chunky pixel grid, outlined, lit on top. */
function drawSky(g, px) {
  const t = performance.now() / 1000;
  for (const cl of clouds) {
    const fade = Math.min(1, cl.life / 3), [cx, cy] = screenAt(cl.x, cl.z), [ex, ey] = screenAt(cl.x + cl.r, cl.z), rs = Math.hypot(ex - cx, ey - cy);
    const n = Math.round(rs * rs / 260), lift = 120 + rs * .25;
    for (let i = 0; i < n; i++) { const u = ((i * 0.618) % 1) * 2 - 1, v = ((i * 0.377 + .13) % 1) * 2 - 1; if (u * u + v * v > 1) continue;
      const gx = cx + u * rs, gy = cy + v * rs * .55, fall = cl.kind === 'rain' ? 320 : 50, y = gy - lift + ((i * 37 + t * fall) % lift);
      g.globalAlpha = fade * (cl.kind === 'rain' ? .8 : 1);
      if (cl.kind === 'rain') { g.fillStyle = '#bfe1ff'; g.fillRect(Math.round(gx), Math.round(y), px, px * 4); }
      else { g.fillStyle = '#fff'; g.fillRect(Math.round(gx + Math.sin(t * 2 + i) * 6), Math.round(y), px * 2, px * 2); } }
    const cs = px * 3, W = Math.min(rs * 1.7, 300), cols = Math.round(W / cs), rows = Math.round(cols * .5), x0 = Math.round(cx - cols * cs / 2), y0 = Math.round(cy - lift - rows * cs * .8);
    const pal = cl.kind === 'rain' ? ['#56637a', '#8b98ae', '#b3bfd0', '#dbe3ee'] : ['#7d8aa0', '#d3dceb', '#eef3fa', '#ffffff'];
    const inside = (i, j) => { const u = (i + .5) / cols * 2 - 1, v = (j + .5) / rows * 2 - 1; return CLOUD_PUFFS.some(([px0, py0, r]) => ((u - px0) / r) ** 2 + ((v - py0) / (r * 1.9)) ** 2 <= 1) && v < .85; };
    g.globalAlpha = fade * .94;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { if (!inside(i, j)) continue;
      const edge = !inside(i - 1, j) || !inside(i + 1, j) || !inside(i, j - 1) || !inside(i, j + 1), top = !inside(i, j - 2), under = !inside(i, j + 2);
      g.fillStyle = edge ? pal[0] : under ? pal[1] : top ? pal[3] : pal[2]; g.fillRect(x0 + i * cs, y0 + j * cs, cs, cs); }
    g.globalAlpha = 1; }
}
/** Words over the map, pinned to a map point (they ride along with the camera), rising and fading. */
function popAt(x, z, text, cls = '') { const t = el('div', { class: 'toypop ' + cls }, text); document.body.append(t); pops.push({ el: t, x, z, t: 0, max: 1.2, rise: 30, dy: -70 }); }
function pop(c, text, cls = '') { const [x, z] = tileAt(c.path, c.at); popAt(x, z, text, cls); }
function placePops(dt) {
  for (let i = pops.length - 1; i >= 0; i--) { const p = pops[i]; p.t += dt; if (p.t >= p.max) { p.el.remove(); pops.splice(i, 1); continue; }
    const [sx, sy] = screenAt(p.x, p.z); p.el.style.transform = `translate(${Math.round(sx - p.el.offsetWidth / 2)}px, ${Math.round(sy + p.dy - p.rise * p.t / p.max)}px)`; }
}

// ---------- the ledger panel ----------
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s % 60))).padStart(2, '0')}`;
const WHERE = { near: '가까움', far: '섬 끝', neighbor: '이웃 섬' };
function fcChips(f, fresh) {
  const chips = [];
  if (f.wet) chips.push(el('span', { class: 'fc bad' }, `${WX[f.kind].ko} 모퉁이 ${f.wet}`));
  if (f.jam) chips.push(el('span', { class: 'fc warn' }, `${f.soon * 2 >= f.jam ? '곧 막힘' : '막힘'} ${f.jam}칸`));   // most of it not jammed yet, but will be when the bike gets there
  if (!chips.length) chips.push(el('span', { class: 'fc ok' }, '맑은 길'));
  return el('span', { class: 'fcs' }, ...chips, el('small', { class: f.t > fresh ? 'late' : '' }, `${Math.ceil(f.t)}초 / 식기 전 ${fresh}초`));
}
const cancelChoose = () => { unchoose(); cam.back = true; draw(); };
function draw() {
  if (!panel) return;
  const free = ncour - couriers.length;
  panel.classList.toggle('min', collapsed);
  const head = el('div', { class: 'lh' }, el('b', {}, '단골 장부'), el('small', {}, `배달원 ${couriers.length}/${ncour}`),
    el('button', { class: 'lx', title: collapsed ? '펼치기' : '접기', 'aria-label': collapsed ? '펼치기' : '접기', on: { click: () => { collapsed = !collapsed; draw(); } } }, collapsed ? `주문 ${orders.length}` : '–'));
  if (collapsed) { panel.replaceChildren(head); return; }
  const rows = orders.slice().sort((a, b) => a.ttl - b.ttl).map(o => {
    const picking = choosing?.o === o;
    return el('div', { class: 'lr' + (picking ? ' picking' : '') },
      el('div', { class: 'lw' }, el('b', {}, o.redo ? `재배달 · ${o.who}` : o.who), el('button', { class: 'ld', title: '버리기', 'aria-label': '버리기', on: { click: () => { if (picking) cancelChoose(); orders = orders.filter(x => x !== o); draw(); } } }, '✕')),
      el('div', {}, `${o.shopName} · ${o.menu} ${o.qty}개`),
      picking
        ? el('div', { class: 'lroutes' }, ...choosing.routes.map((r, i) => el('button', { class: 'lroute' + (choosing.hover === i ? ' on' : ''), style: `--rc:${ROUTE[i]}`, on: { click: () => send(o, r.path), pointerenter: () => { choosing.hover = i; } } }, el('b', {}, r.name), fcChips(r.f, o.fresh))),
            el('button', { class: 'lplus', on: { click: cancelChoose } }, '취소'))
        : el('div', { class: 'lfc' }, fcChips(forecast(o.path), o.fresh)),
      picking ? '' : el('div', { class: 'lm' }, el('small', {}, `${WHERE[o.kind]} · ${mmss(o.ttl)} 남음`),
        (() => { const b = el('button', { class: 'lgo', on: { click: () => choose(o) } }, '배달 ', iconEl('coin', 14, ''), `+${o.reward}`); b.disabled = free <= 0 || !!choosing; return b; })()));
  });
  const going = couriers.map(c => el('div', { class: 'lr going' + (c.failed || c.soggy ? ' bad' : '') }, el('b', {}, c.failed ? '사고 · 돌아오는 중' : c.handoff != null ? (c.tier === 'hot' ? '따끈 도착!' : c.tier === 'cold' ? '식어서 재배달 요청' : '도착') : c.back ? '돌아오는 중' : '배달 중'), el('div', {}, `${c.o.shopName} · ${c.o.menu} → ${WHERE[c.o.kind]}${c.wx ? ` · ${WX[c.wx].ko}` : ''}${c.jamSaid ? ' · 막힘' : ''}`)));
  panel.replaceChildren(head, ...going, ...rows, ...(orders.length ? [] : [el('div', { class: 'lempty' }, '주문을 기다리는 중')]),
    el('div', { class: 'lf' }, el('span', {}, '번 돈 ', iconEl('coin', 14, ''), coins.toLocaleString('ko-KR')), el('small', {}, `팁 ${tips.toLocaleString('ko-KR')} · 따끈 ${hot} · 보냄 ${sent} · 사고 ${crashed} · 식음 ${redone} · 놓침 ${missed}`),
      el('button', { class: 'lplus', on: { click: () => { soundOn = !soundOn; draw(); } } }, soundOn ? '소리 켬' : '소리 끔'),
      el('button', { class: 'lplus', on: { click: () => { ncour = Math.min(4, ncour + 1); draw(); } } }, '배달원 +1')));
}

/** Start the toy once my island is there. */
export function startLedgerToy() {
  const wait = setInterval(() => {
    if (!S.myDoc || !S.mySlot || !sim.A || !myPlots().length) return; clearInterval(wait);
    panel = el('aside', { class: 'ledger', 'aria-label': '단골 장부' }); document.body.append(panel);
    S.mapGround = mapGround; S.mapItems = mapItems;
    window.__ledger = { cam, get couriers() { return couriers; }, get orders() { return orders; }, get jams() { return jams; }, screenAt, routesFor, route, forecast, newJam };   // for the recording checks
    box()?.addEventListener('pointerdown', () => { if (cam.on) { for (const c of couriers) c.follow = false; cam.back = false; camRelease(); } }, true);   // a drag on the map: the camera lets go
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && choosing) cancelChoose(); });
    let t0 = performance.now(), acc = 0;
    const frame = (t) => { const dt = Math.min(.25, (t - t0) / 1000); t0 = t;
      if (!document.hidden) { weatherTick(dt); moveCouriers(dt); camStep(dt); drawOver(dt); placePops(dt); refreshChoice(dt); placeTags(); acc += dt; if (acc >= 1) { tick(acc); acc = 0; draw(); } }
      requestAnimationFrame(frame); };
    const wq = Q.get('wx'); if (WX[wq]) clouds.push(newCloud(wq, true));   // &wx=rain|snow: a slow cloud over my island now, to look at it
    requestAnimationFrame(frame); draw();
  }, 500);
}
