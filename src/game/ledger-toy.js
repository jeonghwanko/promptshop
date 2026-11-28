// The regulars' ledger, as a toy (2026-11-28 plan: https://claude.ai/artifact/Pnha8jhXAQaF7Zzpa5i8fe). Only with ?ledger=1.
// Orders from my shops' regulars pile up in a panel on the left; "배달" sends a courier along my island's roads (and over a
// bridge to a friend's island); back at the shop, the coins come in. Numbers are the simulation's final ones:
// an order every 15-25 s ÷ couriers^0.9, at most 5, 90-180 s to send it, reward = my island's coins a minute × 0.045 / 0.075 /
// 0.12 × quantity ÷ 2. Nothing is saved and the coins stay in the toy's own counter: this is for feeling the loop, not for keeps.
import { S, sim, pr } from './state.js';
import { myPlots, servesOf, tilesOf } from './model.js';
import { normalize } from '../v2/spec.js';
import { TYPE_KO } from '../v2/catalog.js';
import { liveRate } from './vault.js';
import { toScreen, scrollToPoint, applyZoom } from './camera.js';
import { say } from './reviews.js';
import { el } from './ui.js';
import { iconEl } from '../ui/icons.js';

const CAP = 5, ORDER = [15, 25], TTL = [90, 180], K = { near: .045, far: .075, neighbor: .12 }, VMAX = 3.6, STAY = 1.4;   // top speed in tiles a second; seconds at the door
const MENU = { food: ['국밥', '백반', '떡볶이', '김밥'], cafe: ['라떼', '쿠키', '케이크', '스무디'], shop: ['생필품', '꽃다발', '새 옷', '간식'], fun: ['간식 세트', '팝콘', '음료'], rest: ['수건 세트', '조식', '베개'] };
const WHO = { food: '배고픈 단골', cafe: '커피 단골', shop: '장보는 단골', fun: '놀러 온 단골', rest: '쉬러 온 단골' };
const rnd = (a, b) => a + Math.random() * (b - a), pick = (a) => a[Math.floor(Math.random() * a.length)];
const key = (x, z) => x * 1000 + z;

let prevZoom = null;   // the zoom before the camera rode along
const rideOn = () => { if (prevZoom == null) { prevZoom = S.zoom; S.zoom = Math.min(5, S.zoom * 2.5); applyZoom(); } };
const rideOff = () => { follow = null; if (prevZoom != null) { S.zoom = prevZoom; prevZoom = null; applyZoom(); } };
let orders = [], couriers = [], ncour = 1, coins = 0, sent = 0, missed = 0, crashed = 0, redone = 0, follow = null, nextIn = rnd(...ORDER) / 2, panel = null, collapsed = false;

/** Road tiles reachable from a start, with their walking distance (the game's road grid, 4 neighbours). */
function walk(from) {
  const A = sim.A, dist = new Map([[key(...from), 0]]), prev = new Map(), q = [from];
  while (q.length) { const [x, z] = q.shift(), d = dist.get(key(x, z));
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz, k = key(nx, nz);
      if (nx < 0 || nz < 0 || nx >= A.w || nz >= A.d || !A.isRoad(nx, nz) || dist.has(k)) continue; dist.set(k, d + 1); prev.set(k, [x, z]); q.push([nx, nz]); } }
  const path = (to) => { const out = [to]; let k = key(...to); while (prev.has(k)) { const p = prev.get(k); out.unshift(p); k = key(...p); } return out; };
  return { dist, path };
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
  const path = w.path(to), fresh = Math.ceil(forecast(path, true).t * 1.3 + 1.5);   // the food keeps a little longer than a clear ride: a jam on the way makes it late
  return { id: Math.random(), shop: p.key, shopName: n.name || TYPE_KO[n.type] || '가게', who, menu: pick(MENU[need] ?? MENU.food), qty, kind, path, fresh, reward, ttl: Math.round(rnd(...TTL)) };
}

// Weather and traffic you can see, not dice (2026-11-28 "운 대신 예측"): rain and snow clouds drift across the island and
// wet the tiles under them (a drift through a corner in the wet may slip: the delivery fails); jams sit on a stretch of road
// for a while (the bike crawls through, and food that arrives after its "식기 전" time has gone soggy: the regular asks again).
// Every order shows its route's forecast for the clouds' and jams' positions when the bike would get there, so the play is
// choosing which order goes now and which waits for the cloud to pass.
const CLOUD_PUFFS = [[-.62, .25, .3], [-.3, -.05, .38], [.08, -.3, .42], [.45, -.05, .36], [.72, .28, .26], [0, .3, .5]];   // the cloud's silhouette: puffs in -1..1
const WX = { rain: { crash: .35, say: '비가 와요', ko: '비' }, snow: { crash: .55, say: '눈이 와요', ko: '눈' } }, JAMV = .18, CORNER = .3;
let clouds = [], jams = [], cloudIn = rnd(3, 6), jamIn = rnd(2, 5), home = null;
const skyAt = (x, z, t = 0) => { for (const cl of clouds) { if (t > cl.life) continue; const cx = cl.x + cl.vx * t, cz = cl.z + cl.vz * t; if ((x - cx) ** 2 + (z - cz) ** 2 <= cl.r ** 2) return cl.kind; } return null; };
const jamAt = (k, t = 0) => jams.some(j => j.ttl > t && j.tiles.has(k));
function islandMid() { if (!home) { const ts = tilesOf(S.mySlot); home = [ts.reduce((s, t) => s + t[0], 0) / ts.length + .5, ts.reduce((s, t) => s + t[1], 0) / ts.length + .5]; } return home; }
/** A cloud aimed across my island, from one side to the other. */
function newCloud(kind, over = false) {
  const [mx, mz] = islandMid(), a = Math.random() * Math.PI * 2, sp = rnd(.28, .42), r = rnd(3, 5), far = over ? 2 : 16 + r;
  const tx = mx + rnd(-4, 4), tz = mz + rnd(-4, 4), x = tx - Math.cos(a) * far, z = tz - Math.sin(a) * far;
  return { kind, x, z, r, vx: Math.cos(a) * sp * (over ? .4 : 1), vz: Math.sin(a) * sp * (over ? .4 : 1), life: (far + 16 + r) / (sp * (over ? .4 : 1)) };
}
/** A jam: three to five road tiles in a row, on my island (or on the given path). */
function newJam(path) {
  const A = sim.A, roads = path ? path.slice(2, -2) : tilesOf(S.mySlot).filter(([x, z]) => A.isRoad(x, z)); if (!roads.length) return null;
  if (path) { const i = Math.floor(roads.length / 2), seg = roads.slice(Math.max(0, i - 2), i + 2); return { tiles: new Set(seg.map(t => key(...t))), list: seg, ttl: rnd(30, 45) }; }
  for (let tries = 0; tries < 20; tries++) { const [x, z] = pick(roads), [dx, dz] = pick([[1, 0], [-1, 0], [0, 1], [0, -1]]), seg = [];
    for (let i = 0; i < 5 && A.isRoad(x + dx * i, z + dz * i); i++) seg.push([x + dx * i, z + dz * i]);
    if (seg.length >= 3) return { tiles: new Set(seg.map(t => key(...t))), list: seg, ttl: rnd(25, 50) }; }
  return null;
}
function weatherTick(dt) {
  for (const cl of clouds) { cl.x += cl.vx * dt; cl.z += cl.vz * dt; cl.life -= dt; } clouds = clouds.filter(cl => cl.life > 0);
  for (const j of jams) j.ttl -= dt; jams = jams.filter(j => j.ttl > 0);
  if ((cloudIn -= dt) <= 0) { cloudIn = rnd(14, 26); if (clouds.length < 2) clouds.push(newCloud(Math.random() < .7 ? 'rain' : 'snow')); }
  if ((jamIn -= dt) <= 0) { jamIn = rnd(8, 16); if (jams.length < 3) { const j = newJam(); if (j) jams.push(j); } }
}
/** The route's forecast: when the bike would reach each tile, is it wet there, is the road jammed. clear: no sky, no jams. */
function forecast(path, clear = false) {
  let t = 0, wet = 0, jam = 0; const turns = new Set(turnsOf(path)); let kind = null;
  for (let i = 1; i < path.length; i++) { const [x, z] = path[i], j = !clear && jamAt(key(x, z), t), s = clear ? null : skyAt(x + .5, z + .5, t);
    t += 1 / (VMAX * (j ? JAMV : 1) * (s ? .85 : 1)); if (j) jam++;
    if (turns.has(i)) { t += CORNER; if (s) { wet++; kind = kind === 'snow' ? kind : s; } } }
  return { t, wet, jam, kind };
}

// ---------- the ride (2026-11-28 "부릉부릉 달려가다가 드리프트"): pull away with a wheelie, race the straights, brake into
// a corner and slide round it leaving smoke and skid marks; the camera rides along and jolts on every drift ----------
const parts = [];   // smoke, exhaust, skid marks, sparks: kept in map tiles so they stay on the road while the camera moves
let fxCanvas = null, sound = null, soundOn = true;
const turnsOf = (path) => { const t = []; for (let i = 1; i < path.length - 1; i++) { const a = path[i - 1], b = path[i], c = path[i + 1]; if (b[0] - a[0] !== c[0] - b[0] || b[1] - a[1] !== c[1] - b[1]) t.push(i); } return t; };
const tileAt = (path, s) => { const last = path.length - 1, i = Math.max(0, Math.min(last, Math.floor(s))), f = Math.max(0, Math.min(1, s - i)), a = path[i], b = path[Math.min(last, i + 1)]; return [a[0] + (b[0] - a[0]) * f + .5, a[1] + (b[1] - a[1]) * f + .5]; };
const screenAt = (x, z) => { const [px, py] = pr.P(x, z); return toScreen(px, py); };
const emit = (x, z, kind, n, spread = 1) => { for (let k = 0; k < n; k++) parts.push({ x, z, kind, ox: (Math.random() - .5) * 10 * spread, oy: (Math.random() - .5) * 6 * spread, vx: (Math.random() - .5) * 40 * spread, vy: -10 - Math.random() * 30, life: 0, max: kind === 'skid' ? 3 : kind === 'spark' ? .4 : .5 + Math.random() * .5 }); };

/** Engine, tyres and a crash, made in code (the game has no sound files). */
function makeSound() {
  try {
    const ctx = new AudioContext(), master = ctx.createGain(); master.gain.value = .5; master.connect(ctx.destination);
    const osc = ctx.createOscillator(), lp = ctx.createBiquadFilter(), eg = ctx.createGain(); osc.type = 'sawtooth'; osc.frequency.value = 50; lp.type = 'lowpass'; lp.frequency.value = 700; eg.gain.value = 0;
    osc.connect(lp).connect(eg).connect(master); osc.start();
    const noise = ctx.createBuffer(1, ctx.sampleRate * .6, ctx.sampleRate), d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const burst = (f, q, g, dur, type = 'bandpass') => { const src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), gg = ctx.createGain(); src.buffer = noise; bp.type = type; bp.frequency.value = f; bp.Q.value = q; gg.gain.setValueAtTime(g, ctx.currentTime); gg.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + dur); src.connect(bp).connect(gg).connect(master); src.start(); src.stop(ctx.currentTime + dur); };
    return { set(v, on) { const t = ctx.currentTime; osc.frequency.setTargetAtTime(48 + v * 38, t, .08); eg.gain.setTargetAtTime(on && soundOn ? .07 : 0, t, .1); },
      skid() { if (soundOn) burst(2200, 3, .22, .45); }, crash() { if (soundOn) { burst(300, .7, .5, .5, 'lowpass'); burst(3000, 2, .15, .3); } }, vroom() { if (soundOn) { const t = ctx.currentTime; osc.frequency.cancelScheduledValues(t); osc.frequency.setValueAtTime(60, t); osc.frequency.linearRampToValueAtTime(170, t + .35); osc.frequency.linearRampToValueAtTime(110, t + .7); } } };
  } catch { return null; }
}

function send(o) {
  if (couriers.length >= ncour) return;
  orders = orders.filter(x => x !== o); sent++;
  if (!sound) sound = makeSound();   // the press is the gesture that lets sound start
  const fx = document.createElement('canvas'); fx.width = 140; fx.height = 140; fx.className = 'toywx';
  const bike = el('span', { class: 'bike' }, iconEl('scooter', 76, ''));
  const mk = el('div', { class: 'toycourier' }, fx, bike); document.body.append(mk);
  if (new URLSearchParams(location.search).has('jam') && !jams.some(j => o.path.some(t => j.tiles.has(key(...t))))) { const j = newJam(o.path); if (j) jams.push(j); }   // &jam=1: a jam on this route, to look at it
  const fresh = el('i'), meter = el('div', { class: 'fresh' }, fresh); mk.append(meter);
  const c = { o, mk, bike, fx, meter, freshBar: fresh, at: 0, v: 0, back: false, stay: 0, turns: turnsOf(o.path), drifted: new Set(), drift: 0, dsign: 1, start: .7, shake: 0, puff: 0, lastSaid: 0,
    wx: null, wxSaid: false, jamSaid: false, took: 0, soggy: false, flip: 1, lastSx: null, lastSy: null };
  couriers.push(c); follow = c; rideOn(); sound?.vroom();
  const [x, z] = tileAt(o.path, 0); emit(x, z, 'exhaust', 10, 1.4); popAt(x, z, '부릉!', 'loud'); draw();
}

function tick(dt) {
  // orders: new ones while there is room (faster with more couriers: more regulars), old ones run out
  if (orders.length < CAP && (nextIn -= dt) <= 0) { const o = newOrder(); if (o) orders.push(o); nextIn = rnd(...ORDER) / ncour ** .9; }
  for (const o of orders) o.ttl -= dt;
  const gone = orders.filter(o => o.ttl <= 0); if (gone.length) { missed += gone.length; orders = orders.filter(o => o.ttl > 0); }
}

function moveCouriers(dt) {
  let vmaxNow = 0, moving = false;
  for (const c of [...couriers]) {
    const path = c.o.path, last = path.length - 1;
    // under a cloud, in a jam: where the bike is now, on the same clouds and jams the map shows
    const [hx, hz] = tileAt(path, c.at), here = path[Math.max(0, Math.min(last, Math.round(c.at)))];
    c.wx = skyAt(hx, hz); c.wxOn = !!c.wx; if (c.wx && !c.wxSaid && !c.back) { c.wxSaid = true; pop(c, WX[c.wx].say); draw(); }
    const inJam = jamAt(key(...here));
    if (inJam && !c.jamSaid && !c.back) { c.jamSaid = true; pop(c, '길이 막혀요'); draw(); }
    if (!c.back && !c.failed && c.stay <= 0 && !(c.crashT > 0)) { c.took += dt; c.freshBar.style.width = `${Math.max(0, 100 - 100 * c.took / c.o.fresh)}%`; c.meter.classList.toggle('late', c.took > c.o.fresh); }
    if (c.crashT > 0) { c.crashT -= dt; c.v = 0; if (c.crashT <= 0) { c.back = true; c.failed = true; draw(); } }
    else if (c.stay > 0) { c.stay -= dt; c.v = 0; if (c.stay <= 0 && !c.back) { c.back = true; c.at = last; c.drifted.clear(); c.start = .6; sound?.vroom(); } }
    else {
      // speed: full on the straights, braking into the next corner, slower in a jam, in rain or snow, or limping home after a crash
      const fwd = !c.back, ahead = fwd ? c.turns.find(t => t > c.at) : [...c.turns].reverse().find(t => t < c.at), dist = ahead == null ? 99 : Math.abs(ahead - c.at);
      let target = VMAX * (inJam && !c.back ? JAMV : 1) * (c.wxOn ? .85 : 1) * (c.failed ? .45 : 1); if (dist < 1.2 && c.v > 2) target = Math.min(target, 1.9);
      c.v += (target - c.v) * (c.v < target ? 2.4 : 7) * dt;
      const s0 = c.at; c.at = fwd ? Math.min(last, c.at + c.v * dt) : Math.max(0, c.at - c.v * dt);
      // a corner crossed at speed: drift
      if (ahead != null && (fwd ? s0 < ahead && c.at >= ahead : s0 > ahead && c.at <= ahead) && !c.drifted.has(ahead) && c.v > 1.2) {
        c.drifted.add(ahead); const p0 = screenAt(...tileAt(path, ahead + (fwd ? -1 : 1))), p1 = screenAt(...tileAt(path, ahead)), p2 = screenAt(...tileAt(path, ahead + (fwd ? 1 : -1)));
        c.dsign = Math.sign((p1[0] - p0[0]) * (p2[1] - p1[1]) - (p1[1] - p0[1]) * (p2[0] - p1[0])) || 1; c.drift = .55; c.shake = .28; sound?.skid();
        const [x, z] = tileAt(path, c.at); emit(x, z, 'smoke', 16, 1.8); emit(x, z, 'spark', 8, 1);
        if (performance.now() - c.lastSaid > 1200) { c.lastSaid = performance.now(); popAt(x, z, '끼익!', 'loud'); }
        if (fwd && c.wx && (new URLSearchParams(location.search).has('crash') || Math.random() < WX[c.wx].crash)) c.slip = true;   // a drift on a wet corner: the tyres let go
      }
      if (c.slip) { c.slip = false; c.crashT = 1.6; c.meter.remove(); crashed++; c.shake = .5; sound?.crash(); const [x, z] = tileAt(path, c.at); emit(x, z, 'smoke', 14, 1.6); emit(x, z, 'spark', 10, 1.2); pop(c, '꽈당!', 'loud'); setTimeout(() => pop(c, '배달 실패'), 500); }
      else if (fwd && c.at >= last) { c.stay = STAY; c.v = 0;
        c.soggy = c.took > c.o.fresh; c.meter.remove();
        if (c.soggy) { redone++; pop(c, '식었어요 · 재배달 요청'); orders.push({ ...c.o, id: Math.random(), ttl: 70, redo: true }); }
        else pop(c, `${c.o.menu} 도착!`); draw(); }
      else if (!fwd && c.at <= 0) { const paid = !c.failed && !c.soggy; if (paid) { coins += c.o.reward; pop(c, `+${c.o.reward}`); say(c.o.shop); }
        c.mk.remove(); couriers = couriers.filter(x => x !== c); if (follow === c) { const [hx, hy] = pr.P(path[0][0] + .5, path[0][1] + .5); rideOff(); scrollToPoint(hx, hy, true); } draw(); continue; }
      moving = true; vmaxNow = Math.max(vmaxNow, c.v);
      // exhaust behind, dust when fast; skid marks while drifting
      const [x, z] = tileAt(path, c.at); c.puff -= dt; if (c.puff <= 0) { c.puff = c.v > 2.5 ? .06 : .12; emit(x, z, 'exhaust', 1, .5); }
      if (c.drift > 0) emit(x, z, 'skid', 1, .3);
    }
    // where it is, and how it leans: a wheelie pulling away, a hard lean and a slide through a drift, a spin in a crash
    const [x, z] = tileAt(path, c.at), [sx, sy] = screenAt(x, z);
    if (c.lastSx != null && Math.abs(sx - c.lastSx) > .4) c.flip = sx < c.lastSx ? -1 : 1;
    c.mv = c.lastSx == null ? [0, 0] : [sx - c.lastSx, sy - c.lastSy]; c.lastSx = sx; c.lastSy = sy;
    c.start = Math.max(0, c.start - dt); c.drift = Math.max(0, c.drift - dt); c.shake = Math.max(0, c.shake - dt);
    const dp = c.drift > 0 ? Math.sin(Math.PI * (1 - c.drift / .55)) : 0, wheelie = c.start > 0 ? -22 * (c.start / .7) : 0;
    const lean = c.crashT > 0 ? Math.sin(performance.now() / 35) * 40 : wheelie * c.flip + c.dsign * 34 * dp, slide = c.dsign * 18 * dp;
    const bob = c.crashT > 0 || c.v < .2 ? 0 : Math.sin(performance.now() / 70) * (1 + c.v * .4);
    c.mk.style.transform = `translate(${Math.round(sx - 70 + slide)}px, ${Math.round(sy - 108 + bob)}px)`;
    c.bike.style.transform = `scale(${c.flip}, 1) rotate(${(lean * c.flip).toFixed(1)}deg)`;
    if (c.wxOn) weather(c); else if (c.wxCleared !== true) { c.fx.getContext('2d').clearRect(0, 0, 140, 140); c.wxCleared = true; }
    if (follow === c) { const [px, py] = pr.P(x, z), k = c.shake * 18; scrollToPoint(px + (Math.random() - .5) * k, py + (Math.random() - .5) * k, false); }   // the camera rides along and jolts
  }
  sound?.set(vmaxNow, moving);
  drawParts(dt);
}
/** Smoke, exhaust, skid marks and sparks, square pixels over the map, the size of the map's own pixels. */
function drawParts(dt) {
  if (!fxCanvas) { fxCanvas = document.createElement('canvas'); fxCanvas.className = 'toyfx'; document.body.append(fxCanvas); }
  const d = window.devicePixelRatio || 1; if (fxCanvas.width !== Math.round(innerWidth * d)) { fxCanvas.width = Math.round(innerWidth * d); fxCanvas.height = Math.round(innerHeight * d); }
  const g = fxCanvas.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, innerWidth, innerHeight);
  const map = document.getElementById('map'), k = map ? map.getBoundingClientRect().width / map.width : 1, px = Math.max(2, Math.round(2 * k));
  drawSky(g, px);
  for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life += dt; if (p.life >= p.max) { parts.splice(i, 1); continue; }
    const t = p.life / p.max, [sx, sy] = screenAt(p.x, p.z);
    if (p.kind !== 'skid') { p.ox += p.vx * dt; p.oy += p.vy * dt; p.vx *= .96; }
    const x = Math.round(sx + p.ox), y = Math.round(sy + p.oy);
    if (p.kind === 'skid') { g.fillStyle = `rgba(40,32,28,${.55 * (1 - t)})`; g.fillRect(x - px * 1.5, y - px / 2, px * 3, px * 1.5); }
    else if (p.kind === 'spark') { g.fillStyle = t < .5 ? '#fff3a0' : '#f2a12e'; g.fillRect(x, y, px, px); }
    else { const n = p.kind === 'smoke' ? 4 + Math.round(t * 5) : 2 + Math.round(t * 3), a = (p.kind === 'smoke' ? .85 : .6) * (1 - t); if (p.kind === 'smoke') { g.fillStyle = `rgba(120,118,128,${a})`; g.fillRect(x - (n + 1) * px / 2, y - (n - 1) * px / 2, (n + 1) * px, (n + 1) * px); }   // a grey shadow under each puff, so the smoke reads as chunks, not a white smudge
      g.fillStyle = p.kind === 'smoke' ? `rgba(250,250,250,${a})` : `rgba(150,150,160,${a})`; g.fillRect(x - n * px / 2, y - n * px / 2, n * px, n * px); }
  }
  // speed lines behind a fast bike
  for (const c of couriers) { if (c.v < 2.6 || !c.mv || c.crashT > 0) continue; const [mx, my] = c.mv, m = Math.hypot(mx, my); if (m < .5) continue;
    const ux = mx / m, uy = my / m, [x, z] = tileAt(c.o.path, c.at), [sx, sy] = screenAt(x, z); g.fillStyle = 'rgba(255,255,255,.75)';
    for (let k2 = 0; k2 < 5; k2++) { const off = (k2 - 2) * 8, bx = sx - ux * (30 + k2 * 7) - uy * off, by = sy - 22 - uy * (30 + k2 * 7) + ux * off; for (let j = 0; j < 7; j++) g.fillRect(Math.round(bx - ux * j * 4), Math.round(by - uy * j * 4), px, px); } }
}
/** The clouds and jams the forecast reads, on the map: wet tiles under each cloud, rain or snow falling on them, the cloud
 *  itself above in chunky pixels; little cars nose to tail on a jammed stretch. */
function drawSky(g, px) {
  const t = performance.now() / 1000, diamond = (x, z) => { const a = screenAt(x, z), b = screenAt(x + 1, z), c2 = screenAt(x + 1, z + 1), d2 = screenAt(x, z + 1); g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.lineTo(...c2); g.lineTo(...d2); g.closePath(); g.fill(); };
  for (const j of jams) { const fade = Math.min(1, j.ttl / 2);
    g.fillStyle = `rgba(226,60,40,${.38 * fade})`; for (const [x, z] of j.list) diamond(x, z);
    j.list.forEach(([x, z], i) => { const [sx, sy] = screenAt(x + .5, z + .5), col = ['#e2685a', '#5fb6e0', '#f2c12e', '#7bc47f', '#f4f0e6'][(x * 7 + z * 3) % 5], jig = Math.sin(t * 9 + i) > .7 ? -px : 0;
      g.globalAlpha = fade; g.fillStyle = '#2b2117'; g.fillRect(sx - px * 4, sy - px * 3 + jig, px * 8, px * 4);
      g.fillStyle = col; g.fillRect(sx - px * 3, sy - px * 4 + jig, px * 6, px * 3); g.fillStyle = '#bfe3f5'; g.fillRect(sx - px, sy - px * 4 + jig, px * 2, px);
      if (Math.sin(t * 4 + i * 2) > 0) { g.fillStyle = '#ff3b2f'; g.fillRect(sx - px * 4, sy - px * 2 + jig, px, px); } g.globalAlpha = 1; }); }
  for (const cl of clouds) {
    const fade = Math.min(1, cl.life / 3), [cx, cy] = screenAt(cl.x, cl.z), [ex, ey] = screenAt(cl.x + cl.r, cl.z), rs = Math.hypot(ex - cx, ey - cy);
    g.fillStyle = cl.kind === 'rain' ? `rgba(40,90,170,${.4 * fade})` : `rgba(240,248,255,${.7 * fade})`;
    for (let z = Math.floor(cl.z - cl.r); z <= cl.z + cl.r; z++) for (let x = Math.floor(cl.x - cl.r); x <= cl.x + cl.r; x++) if (sim.A.isRoad(x, z) && (x + .5 - cl.x) ** 2 + (z + .5 - cl.z) ** 2 <= cl.r ** 2) diamond(x, z);   // the wet roads: what the forecast counts
    const n = Math.round(rs * rs / 260), lift = 120 + rs * .25;
    for (let i = 0; i < n; i++) { const u = ((i * 0.618) % 1) * 2 - 1, v = ((i * 0.377 + .13) % 1) * 2 - 1; if (u * u + v * v > 1) continue;
      const gx = cx + u * rs, gy = cy + v * rs * .55, fall = cl.kind === 'rain' ? 320 : 50, y = gy - lift + ((i * 37 + t * fall) % lift);
      g.globalAlpha = fade * (cl.kind === 'rain' ? .8 : 1);
      if (cl.kind === 'rain') { g.fillStyle = '#bfe1ff'; g.fillRect(Math.round(gx), Math.round(y), px, px * 4); }
      else { g.fillStyle = '#fff'; g.fillRect(Math.round(gx + Math.sin(t * 2 + i) * 6), Math.round(y), px * 2, px * 2); } }
    // the cloud: a lump of puffs on a chunky pixel grid, outlined, lit on top and shaded under, the size of a few houses
    const cs = px * 3, W = Math.min(rs * 1.7, 300), cols = Math.round(W / cs), rows = Math.round(cols * .5), x0 = Math.round(cx - cols * cs / 2), y0 = Math.round(cy - lift - rows * cs * .8);
    const pal = cl.kind === 'rain' ? ['#56637a', '#8b98ae', '#b3bfd0', '#dbe3ee'] : ['#7d8aa0', '#d3dceb', '#eef3fa', '#ffffff'];
    const inside = (i, j) => { const u = (i + .5) / cols * 2 - 1, v = (j + .5) / rows * 2 - 1; return CLOUD_PUFFS.some(([px0, py0, r]) => ((u - px0) / r) ** 2 + ((v - py0) / (r * 1.9)) ** 2 <= 1) && v < .85; };
    g.globalAlpha = fade * .94;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { if (!inside(i, j)) continue;
      const edge = !inside(i - 1, j) || !inside(i + 1, j) || !inside(i, j - 1) || !inside(i, j + 1), top = !inside(i, j - 2), under = !inside(i, j + 2);
      g.fillStyle = edge ? pal[0] : under ? pal[1] : top ? pal[3] : pal[2]; g.fillRect(x0 + i * cs, y0 + j * cs, cs, cs); }
    g.globalAlpha = 1; }
}
/** Rain or snow falling around one bike, in map-like pixels. */
function weather(c) {
  const g = c.fx.getContext('2d'), t = performance.now() / 1000, W = 140; g.clearRect(0, 0, W, W); c.wxCleared = false;
  if (c.wx === 'rain') { g.fillStyle = 'rgba(190,225,255,.95)'; for (let k = 0; k < 46; k++) { const x = (k * 37 + t * 40) % W, y = (k * 53 + t * 300) % W; g.fillRect(Math.round(x), Math.round(y), 2, 9); } }
  else { g.fillStyle = '#fff'; for (let k = 0; k < 40; k++) { const x = (k * 29 + Math.sin(t * 2 + k) * 8 + W) % W, y = (k * 41 + t * 45) % W; g.fillRect(Math.round(x), Math.round(y), 4, 4); } }
}
function popAt(x, z, text, cls = '') {
  const [sx, sy] = screenAt(x, z), t = el('div', { class: 'toypop ' + cls }, text); document.body.append(t);
  t.style.transform = `translate(${Math.round(sx - 30)}px, ${Math.round(sy - 80)}px)`; setTimeout(() => t.remove(), 1100);
}
function pop(c, text, cls = '') { const [x, z] = tileAt(c.o.path, c.at); popAt(x, z, text, cls); }

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s % 60))).padStart(2, '0')}`;
const WHERE = { near: '가까움', far: '섬 끝', neighbor: '이웃 섬' };
/** The route's forecast, read off the clouds and jams on the map: wet corners, jammed tiles, arrival against the food's time. */
function fcRow(o) {
  const f = forecast(o.path), late = f.t > o.fresh, chips = [];
  if (f.wet) chips.push(el('span', { class: 'fc bad' }, `${WX[f.kind].ko} 모퉁이 ${f.wet}`));
  if (f.jam) chips.push(el('span', { class: 'fc warn' }, `막힘 ${f.jam}칸`));
  if (!chips.length) chips.push(el('span', { class: 'fc ok' }, '맑은 길'));
  return el('div', { class: 'lfc' }, ...chips, el('small', { class: late ? 'late' : '' }, `${Math.ceil(f.t)}초 / 식기 전 ${o.fresh}초`));
}
function draw() {
  if (!panel) return;
  const free = ncour - couriers.length;
  panel.classList.toggle('min', collapsed);
  const head = el('div', { class: 'lh' }, el('b', {}, '단골 장부'), el('small', {}, `배달원 ${couriers.length}/${ncour}`),
    el('button', { class: 'lx', title: collapsed ? '펼치기' : '접기', 'aria-label': collapsed ? '펼치기' : '접기', on: { click: () => { collapsed = !collapsed; draw(); } } }, collapsed ? `주문 ${orders.length}` : '–'));
  if (collapsed) { panel.replaceChildren(head); return; }
  const rows = orders.slice().sort((a, b) => a.ttl - b.ttl).map(o => el('div', { class: 'lr' },
    el('div', { class: 'lw' }, el('b', {}, o.redo ? `재배달 · ${o.who}` : o.who), el('button', { class: 'ld', title: '버리기', 'aria-label': '버리기', on: { click: () => { orders = orders.filter(x => x !== o); draw(); } } }, '✕')),
    el('div', {}, `${o.shopName} · ${o.menu} ${o.qty}개`),
    fcRow(o),
    el('div', { class: 'lm' }, el('small', {}, `${WHERE[o.kind]} · ${mmss(o.ttl)} 남음`),
      (() => { const b = el('button', { class: 'lgo', on: { click: () => send(o) } }, '배달 ', iconEl('coin', 14, ''), `+${o.reward}`); b.disabled = free <= 0; return b; })())));
  const going = couriers.map(c => el('div', { class: 'lr going' + (c.failed ? ' bad' : '') }, el('b', {}, c.failed ? '사고 · 돌아오는 중' : c.back ? (c.soggy ? '재배달 요청 받고 돌아오는 중' : '돌아오는 중') : '배달 중'), el('div', {}, `${c.o.shopName} · ${c.o.menu} → ${WHERE[c.o.kind]}${c.wxOn ? ` · ${c.wx === 'rain' ? '비' : '눈'}` : ''}${c.jamSaid ? ' · 막힘' : ''}`)));
  panel.replaceChildren(head, ...going, ...rows, ...(orders.length ? [] : [el('div', { class: 'lempty' }, '주문을 기다리는 중')]),
    el('div', { class: 'lf' }, el('span', {}, '번 돈 ', iconEl('coin', 14, ''), coins.toLocaleString('ko-KR')), el('small', {}, `보냄 ${sent} · 사고 ${crashed} · 재배달 ${redone} · 놓침 ${missed}`),
      el('button', { class: 'lplus', on: { click: () => { soundOn = !soundOn; draw(); } } }, soundOn ? '소리 켬' : '소리 끔'),
      el('button', { class: 'lplus', on: { click: () => { ncour = Math.min(4, ncour + 1); draw(); } } }, '배달원 +1')));
}

/** Start the toy once my island is there. */
export function startLedgerToy() {
  const wait = setInterval(() => {
    if (!S.myDoc || !S.mySlot || !sim.A || !myPlots().length) return; clearInterval(wait);
    panel = el('aside', { class: 'ledger', 'aria-label': '단골 장부' }); document.body.append(panel);
    document.getElementById('mapbox')?.addEventListener('pointerdown', () => { if (follow) rideOff(); }, true);   // a drag on the map: the camera stops riding along
    let t0 = performance.now(), acc = 0;
    const frame = (t) => { const dt = Math.min(.25, (t - t0) / 1000); t0 = t; if (!document.hidden) { weatherTick(dt); moveCouriers(dt); acc += dt; if (acc >= 1) { tick(acc); acc = 0; draw(); } } requestAnimationFrame(frame); };
    const wq = new URLSearchParams(location.search).get('wx'); if (WX[wq]) clouds.push(newCloud(wq, true));   // &wx=rain|snow: a slow cloud over my island now, to look at it
    requestAnimationFrame(frame); draw();
  }, 500);
}
