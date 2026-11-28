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

const CAP = 5, ORDER = [15, 25], TTL = [90, 180], K = { near: .045, far: .075, neighbor: .12 }, SPEED = 1.1, STAY = 1.2;   // tiles a second; seconds at the door
const MENU = { food: ['국밥', '백반', '떡볶이', '김밥'], cafe: ['라떼', '쿠키', '케이크', '스무디'], shop: ['생필품', '꽃다발', '새 옷', '간식'], fun: ['간식 세트', '팝콘', '음료'], rest: ['수건 세트', '조식', '베개'] };
const WHO = { food: '배고픈 단골', cafe: '커피 단골', shop: '장보는 단골', fun: '놀러 온 단골', rest: '쉬러 온 단골' };
const rnd = (a, b) => a + Math.random() * (b - a), pick = (a) => a[Math.floor(Math.random() * a.length)];
const key = (x, z) => x * 1000 + z;

let prevZoom = null;   // the zoom before the camera rode along
const rideOn = () => { if (prevZoom == null) { prevZoom = S.zoom; S.zoom = Math.min(4, S.zoom * 2); applyZoom(); } };
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
  for (const [k, d] of w.dist) { if (d < 3) continue; const t = [Math.floor(k / 1000), k % 1000]; (mine.has(k) ? here : away).push([t, d]); }
  if (!here.length) return null;
  here.sort((a, b) => a[1] - b[1]); const half = here[Math.floor(here.length / 2)][1];
  const r = Math.random(), kind = away.length && r < .15 ? 'neighbor' : r < .6 ? 'near' : 'far';
  const pool = kind === 'neighbor' ? away : kind === 'near' ? here.filter(([, d]) => d <= half) : here.filter(([, d]) => d > half);
  const [to] = pick(pool.length ? pool : here), qty = 1 + Math.floor(Math.random() * 3);
  const g = p.b.input.guests, who = (typeof g?.who === 'string' && g.who) || WHO[need] || '단골 손님';
  const reward = Math.max(5, Math.round(liveRate().coins * K[kind] * qty / 2));
  return { id: Math.random(), shop: p.key, shopName: n.name || TYPE_KO[n.type] || '가게', who, menu: pick(MENU[need] ?? MENU.food), qty, kind, path: w.path(to), reward, ttl: Math.round(rnd(...TTL)) };
}

// Each delivery meets its own weather and traffic (2026-11-28): the sky may turn to rain or snow on the way (a slip ends the
// delivery), and a crowded road slows the bike (food that arrives late has gone soggy: the regular asks for it again).
const WX = { rain: { p: .28, crash: .3, say: '비가 와요' }, snow: { p: .12, crash: .45, say: '눈이 와요' } };
function send(o) {
  if (couriers.length >= ncour) return;
  orders = orders.filter(x => x !== o); sent++;
  const fx = document.createElement('canvas'); fx.width = 140; fx.height = 140; fx.className = 'toywx';
  const bike = el('span', { class: 'bike' }, iconEl('scooter', 44, ''));
  const mk = el('div', { class: 'toycourier' }, fx, bike); document.body.append(mk);
  const q = new URLSearchParams(location.search), r = Math.random();   // &wx=rain|snow &crash=1 &jam=1: force one outcome to look at it
  const wx = q.get('wx') ?? (r < WX.snow.p ? 'snow' : r < WX.snow.p + WX.rain.p ? 'rain' : null);
  const c = { o, mk, bike, fx, at: 0, back: false, stay: 0, wx, wxAt: rnd(.15, .45), wxOn: false, jam: q.has('jam') || Math.random() < .3 ? [rnd(.25, .4), rnd(.6, .75)] : null, jamSaid: false, flip: 1, lastSx: null };
  c.crashAt = WX[wx] && (q.has('crash') || Math.random() < WX[wx].crash) ? rnd(c.wxAt + .1, .9) : null;
  c.soggy = !!c.jam && (q.has('jam') || Math.random() < .6);
  couriers.push(c); follow = c; rideOn(); draw();
}

function tick(dt) {
  // orders: new ones while there is room (faster with more couriers: more regulars), old ones run out
  if (orders.length < CAP && (nextIn -= dt) <= 0) { const o = newOrder(); if (o) orders.push(o); nextIn = rnd(...ORDER) / ncour ** .9; }
  for (const o of orders) o.ttl -= dt;
  const gone = orders.filter(o => o.ttl <= 0); if (gone.length) { missed += gone.length; orders = orders.filter(o => o.ttl > 0); }
}

function moveCouriers(dt) {
  for (const c of [...couriers]) {
    const path = c.o.path, last = path.length - 1, frac = c.at / Math.max(1, last);
    // the sky turns, the road clogs, the bike slips: each only on this delivery
    if (!c.back && c.wx && !c.wxOn && frac >= c.wxAt) { c.wxOn = true; pop(c, WX[c.wx].say); draw(); }
    const inJam = !c.back && c.jam && frac >= c.jam[0] && frac <= c.jam[1];
    if (inJam && !c.jamSaid) { c.jamSaid = true; pop(c, '길이 막혀요'); draw(); }
    if (c.crashT > 0) { c.crashT -= dt; c.bike.style.transform = `rotate(${Math.sin(performance.now() / 40) * 25}deg)`; if (c.crashT <= 0) { c.bike.style.transform = ''; c.back = true; c.failed = true; draw(); } }
    else if (c.stay > 0) { c.stay -= dt; if (c.stay <= 0 && !c.back) { c.back = true; c.at = last; } }
    else if (!c.back) {
      c.at = Math.min(last, c.at + SPEED * (inJam ? .35 : 1) * (c.wxOn ? .8 : 1) * dt);
      if (c.crashAt != null && c.at / Math.max(1, last) >= c.crashAt) { c.crashAt = null; c.crashT = 1.6; crashed++; pop(c, '꽈당! 배달 실패'); }
      else if (c.at >= last) { c.stay = STAY;
        if (c.soggy) { redone++; pop(c, '불었어요 · 재배달 요청'); orders.push({ ...c.o, id: Math.random(), ttl: 70, redo: true }); }
        else pop(c, `${c.o.menu} 도착`); draw(); }
    }
    else { c.at = Math.max(0, c.at - SPEED * (c.failed ? .7 : 1) * dt);
      if (c.at <= 0) { const paid = !c.failed && !c.soggy; if (paid) { coins += c.o.reward; pop(c, `+${c.o.reward}`); say(c.o.shop); }
        c.mk.remove(); couriers = couriers.filter(x => x !== c); if (follow === c) { const [hx, hy] = pr.P(path[0][0] + .5, path[0][1] + .5); rideOff(); scrollToPoint(hx, hy, true); } draw(); continue; } }
    const i = Math.floor(c.at), f = c.at - i, a = path[i], b = path[Math.min(last, i + 1)], x = a[0] + (b[0] - a[0]) * f + .5, z = a[1] + (b[1] - a[1]) * f + .5;
    const [px, py] = pr.P(x, z), [sx, sy] = toScreen(px, py), bob = c.crashT > 0 ? 0 : Math.sin(performance.now() / 90) * 1.5;
    if (c.lastSx != null && Math.abs(sx - c.lastSx) > .3) c.flip = sx < c.lastSx ? -1 : 1; c.lastSx = sx;
    c.mk.style.transform = `translate(${Math.round(sx - 70)}px, ${Math.round(sy - 100 + bob)}px)`;
    c.bike.style.scale = `${c.flip} 1`;
    if (c.wxOn) weather(c); else if (c.wxCleared !== true) { c.fx.getContext('2d').clearRect(0, 0, 140, 140); c.wxCleared = true; }
    if (follow === c) scrollToPoint(px, py, false);   // the camera rides along (a drag on the map lets go)
  }
}
/** Rain or snow falling around one bike, in map-like pixels. */
function weather(c) {
  const g = c.fx.getContext('2d'), t = performance.now() / 1000, W = 140; g.clearRect(0, 0, W, W); c.wxCleared = false;
  if (c.wx === 'rain') { g.fillStyle = 'rgba(190,225,255,.95)'; for (let k = 0; k < 46; k++) { const x = (k * 37 + t * 40) % W, y = (k * 53 + t * 300) % W; g.fillRect(Math.round(x), Math.round(y), 2, 9); } }
  else { g.fillStyle = '#fff'; for (let k = 0; k < 40; k++) { const x = (k * 29 + Math.sin(t * 2 + k) * 8 + W) % W, y = (k * 41 + t * 45) % W; g.fillRect(Math.round(x), Math.round(y), 4, 4); } }
}
function pop(c, text) {
  const t = el('div', { class: 'toypop' }, text); document.body.append(t);
  t.style.left = c.mk.style.transform ? '0' : '0'; t.style.transform = c.mk.style.transform; setTimeout(() => t.remove(), 1400);
}

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s % 60))).padStart(2, '0')}`;
const WHERE = { near: '가까움', far: '섬 끝', neighbor: '이웃 섬' };
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
    el('div', { class: 'lm' }, el('small', {}, `${WHERE[o.kind]} · ${mmss(o.ttl)} 남음`),
      (() => { const b = el('button', { class: 'lgo', on: { click: () => send(o) } }, '배달 ', iconEl('coin', 14, ''), `+${o.reward}`); b.disabled = free <= 0; return b; })())));
  const going = couriers.map(c => el('div', { class: 'lr going' + (c.failed ? ' bad' : '') }, el('b', {}, c.failed ? '사고 · 돌아오는 중' : c.back ? (c.soggy ? '재배달 요청 받고 돌아오는 중' : '돌아오는 중') : '배달 중'), el('div', {}, `${c.o.shopName} · ${c.o.menu} → ${WHERE[c.o.kind]}${c.wxOn ? ` · ${c.wx === 'rain' ? '비' : '눈'}` : ''}${c.jamSaid ? ' · 막힘' : ''}`)));
  panel.replaceChildren(head, ...going, ...rows, ...(orders.length ? [] : [el('div', { class: 'lempty' }, '주문을 기다리는 중')]),
    el('div', { class: 'lf' }, el('span', {}, '번 돈 ', iconEl('coin', 14, ''), coins.toLocaleString('ko-KR')), el('small', {}, `보냄 ${sent} · 사고 ${crashed} · 재배달 ${redone} · 놓침 ${missed}`),
      el('button', { class: 'lplus', on: { click: () => { ncour = Math.min(4, ncour + 1); draw(); } } }, '배달원 +1')));
}

/** Start the toy once my island is there. */
export function startLedgerToy() {
  const wait = setInterval(() => {
    if (!S.myDoc || !S.mySlot || !sim.A || !myPlots().length) return; clearInterval(wait);
    panel = el('aside', { class: 'ledger', 'aria-label': '단골 장부' }); document.body.append(panel);
    document.getElementById('mapbox')?.addEventListener('pointerdown', () => { if (follow) rideOff(); }, true);   // a drag on the map: the camera stops riding along
    let t0 = performance.now(), acc = 0;
    const frame = (t) => { const dt = Math.min(.25, (t - t0) / 1000); t0 = t; if (!document.hidden) { moveCouriers(dt); acc += dt; if (acc >= 1) { tick(acc); acc = 0; draw(); } } requestAnimationFrame(frame); };
    requestAnimationFrame(frame); draw();
  }, 500);
}
