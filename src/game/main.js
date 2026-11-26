// The archipelago game: one page, ten friends' islands. Loaded by isles.html.
import { lineReader } from '../steps.js';
import { Stage2 } from '../v2/stage.js';
import { renderView } from '../v2/render.js';
import { emptyBuilding, applyStep, buildPrompt, extendPrompt, applyExtension } from '../v2/steps.js';
import { check, missingParts, revisePrompt } from '../v2/check.js';
import { normalize } from '../v2/spec.js';
import { TYPE_KO } from '../v2/catalog.js';
import { SLOTS, WORLD, centerOf, neighbours, bridgeId, makeIsles, placePlot, PLOT, islesProjection, drawIsles, slotAt, dockOf, setLand, landSize, LAND_MAX, GAP, OLD_GAP, centerOfGap } from '../v2/isles.js';
import { buildSection, LAYOUT, remapFixtures } from '../v2/interior.js';
import { TownSim, NEEDS, NEED_KEYS, roleOf, drawPerson, typesFor } from '../v2/townsim.js';
import { ISLES_SEED } from '../../examples/isles-seed.js';
import { drawLand, countryAt, placeLabel } from '../v2/geo.js';
import { InsideView, startingFixtures } from '../v2/insideview.js';
import { shopRates, bestNext, FIX_INFO, FIX_ROLE, nextUp, TRACKS, costOf, flowCaps, LV_MAX, upgradeCost, starsOf, starBonus } from '../v2/inside.js';
import { applyTheme } from '../ui/theme.js';
import { pixelIcons, iconCanvas, iconEl, EMOJI } from '../ui/icons.js';
import { voxelEl, setVoxelPalette } from '../ui/voxelui.js';
import { moveWithIsland, migrateLayout, refundOf } from './migrate.js';
import { START_COINS, START_STOCK, RESTOCK, BASE_COIN, BRIDGE, HELPER_MAX, helperCost, vipBonus, REQ_BONUS, PLOTS_PER_LAND, LAND_COST, LAND_LEVEL, maxPlots as maxPlotsOf, LEVELS, levelOf, sizesOpen, payPermits, boatPlanOf, FEST, festNeeds, festCapacity, festTip, festStars, festBonus, bad } from './rules.js';
setVoxelPalette(new URLSearchParams(location.search).get('vx') || 'a');   // ?vx=a|b|c to compare palettes

const $ = (id) => document.getElementById(id);
// the game skin: ?theme=wood|sea to compare, remembered per browser
{ const q = new URLSearchParams(location.search).get('theme'); if (q) applyTheme(q); pixelIcons(document.body); }   // emoji in the game's words become pixel icons everywhere   // the skin is on hold: only with ?theme= while the concept is redone
const el = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'on') for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn); else if (k === 'class') e.className = v; else e.setAttribute(k, v); } for (const c of kids.flat()) if (c != null && c !== false) e.append(c instanceof Node ? c : document.createTextNode(String(c))); return e; };
const use = async (n) => (await window.claude?.use?.(n)?.catch?.(() => null)) ?? null;
const [db, user, sample] = await Promise.all([use('db'), use('user'), use('sample')]);
const me = user ? await user.id() : null, isOwner = user ? await user.isOwner() : false;
// widening my island: one ring of land a step, more buildings allowed
const maxPlots = () => maxPlotsOf(myDoc?.land ?? 0);
function landCard() {
  const k = myDoc.land ?? 0;
  if (k >= LAND_MAX) return el('div', { class: 'card tile' }, iconEl('sprout', 40, ''), el('span', { class: 'tt' }, el('b', {}, `땅 ${k}/${LAND_MAX}`), el('small', {}, '끝까지 넓혔어요')));
  const lv = levelOf(G().served), need = LAND_LEVEL[k], cost = LAND_COST[k], locked = lv < need;
  setLand(mySlot, k); const now0 = landSize(mySlot); setLand(mySlot, k + 1); const gain = landSize(mySlot) - now0; setLand(mySlot, k);
  const b = el('button', { class: 'gold', on: { click: () => widen() } }, el('span', { class: 'pr' }, locked ? iconEl('lock', 20, '') : iconEl('coin', 20, ''), locked ? `Lv.${need + 1}` : String(cost)));
  b.disabled = locked || myDoc.wallet.coins < cost;
  return el('div', { class: 'card tile' + (!b.disabled ? ' alert' : '') }, iconEl('sprout', 40, ''), el('span', { class: 'tt' }, el('b', {}, `땅 넓히기 ${k}/${LAND_MAX}`), el('small', {}, `+${gain}칸 · 건물 +${PLOTS_PER_LAND}`)), b);
}
// the tiles of an island right now
function tilesOf(slot) { const [cx, cz] = centerOf(slot), out = []; for (let z = cz - 14; z <= cz + 14; z++) for (let x = cx - 14; x <= cx + 14; x++) if (slotAt(x, z) === slot) out.push([x, z]); return out; }
async function widen() {
  const k = myDoc.land ?? 0, cost = LAND_COST[k]; if (k >= LAND_MAX || myDoc.wallet.coins < cost) return;
  setLand(mySlot, k); const was = new Set(tilesOf(mySlot).map(t => t + ''));
  const old = ground;   // the coast as it was, shown while the new ring rises
  myDoc.wallet.coins -= cost; myDoc.land = k + 1; rebuild(); save(true);
  const [cx, cz] = centerOf(mySlot), fresh = tilesOf(mySlot).filter(t => !was.has(t + ''));
  // new land rises from the sea, from the old coast outward, like a wave going round the island
  const d0 = Math.min(...fresh.map(([x, z]) => Math.hypot(x - cx, z - cz)));
  landAnim = { old, t: 0, tiles: fresh.map(([x, z]) => ({ x, z, at: (Math.hypot(x - cx, z - cz) - d0) * .35 + ((Math.atan2(z - cz, x - cx) + Math.PI) / (2 * Math.PI)) * .9 + Math.random() * .08, splashed: false })) };
  landAnim.end = Math.max(...landAnim.tiles.map(t => t.at)) + .5;
  closePanel(); scrollToSlot(mySlot); toast('🌱 땅이 솟아올라요…', 1600);
  setTimeout(() => { celebrate('🌱 땅이 넓어졌어요!', `땅 +${fresh.length}칸 · 이제 건물 ${maxPlots()}채까지`); }, landAnim.end * 1000 + 100);
}
// ---------- a building site: fence tape, scaffold, a tower crane, sparks and dust while Claude designs; a dust burst when it is done ----------
const site = { parts: [], t: 0, done: null, pending: null, dt: 0, step(dt) { this.dt = dt; this.t += dt; } };
function placeSign() {   // the signboard sits above its spot, wherever the map is scrolled
  const c = document.querySelector('.signcard'); if (!c) return; const [x, z] = JSON.parse(c.dataset.at), [px, py] = pr.P(x, z), r = map.getBoundingClientRect();
  const sx = r.left + px * r.width / map.width, sy = r.top + py * r.height / map.height, w = c.offsetWidth, h = c.offsetHeight;
  c.style.left = Math.max(8, Math.min(innerWidth - w - 8, sx - w / 2)) + 'px'; c.style.top = Math.max(70, Math.min(innerHeight - h - 120, sy - h - 70)) + 'px';
}
function drawSite(half) {
  if (half === 'front' && site.pending && !building) { const q = site.pending, m = PLOT[q.size], C0 = [pr.P(q.x, q.z), pr.P(q.x + m, q.z), pr.P(q.x + m, q.z + m), pr.P(q.x, q.z + m)], pul = .6 + .4 * Math.sin(site.t * 5);
    g.strokeStyle = `rgba(255,207,63,${pul})`; g.lineWidth = 2; g.beginPath(); C0.forEach(([a, c], i) => i ? g.lineTo(a, c) : g.moveTo(a, c)); g.closePath(); g.stroke();
    const [mx, my] = pr.P(q.x + m / 2, q.z + m / 2); g.fillStyle = '#5b3a22'; g.fillRect(Math.round(mx) - 1, Math.round(my) - 22, 3, 22); g.fillStyle = '#c08a4a'; g.fillRect(Math.round(mx) - 9, Math.round(my) - 30, 19, 11); g.fillStyle = '#2e241a'; g.fillRect(Math.round(mx) - 9, Math.round(my) - 30, 19, 1); g.fillRect(Math.round(mx) - 9, Math.round(my) - 20, 19, 1); }
  const b = building ?? site.done; if (!b) return; const dt = site.dt, P = (x, z) => pr.P(x, z);
  const n = PLOT[b.size], x0 = b.x, z0 = b.z, C = [P(x0, z0), P(x0 + n, z0), P(x0 + n, z0 + n), P(x0, z0 + n)], H = 26 + n * 10;   // C[0] back, C[2] front
  const line = (a, c, col, w) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(Math.round(a[0]) + .5, Math.round(a[1]) + .5); g.lineTo(Math.round(c[0]) + .5, Math.round(c[1]) + .5); g.stroke(); };
  const tape = (a, c) => { const m = 10; for (let i = 0; i < m; i++) line([a[0] + (c[0] - a[0]) * i / m, a[1] + (c[1] - a[1]) * i / m - 4], [a[0] + (c[0] - a[0]) * (i + 1) / m, a[1] + (c[1] - a[1]) * (i + 1) / m - 4], i % 2 ? '#2e241a' : '#ffcf3f', 2); };
  if (half === 'back') {
    if (!building) return;
    // a tower crane on the back corner, its jib turning a little, a load swinging on the hook
    const base = C[0], mast = H + 40, top = [base[0], base[1] - mast], sw = Math.sin(site.t * .7) * 14, tip = [top[0] + 34 + sw, top[1] + 6], back = [top[0] - 18 - sw * .4, top[1] - 2];
    line(base, top, '#2e241a', 4); line(base, top, '#ffcf3f', 2);
    for (let y = 8; y < mast; y += 8) line([base[0] - 1, base[1] - y], [base[0] + 1, base[1] - y + 6], '#b58a10', 1);
    line(back, tip, '#2e241a', 4); line(back, tip, '#ffcf3f', 2); g.fillStyle = '#5b5f66'; g.fillRect(Math.round(back[0]) - 3, Math.round(back[1]) - 1, 6, 5);
    const hook = [tip[0] - 6, tip[1] + 18 + Math.sin(site.t * 2) * 3]; line([tip[0] - 6, tip[1]], hook, '#2e241a', 1); g.fillStyle = '#c08a4a'; g.fillRect(Math.round(hook[0]) - 4, Math.round(hook[1]), 8, 4);
    // back poles, the planks between them, the back fence
    for (const c of [C[0], C[1], C[3]]) line(c, [c[0], c[1] - H], 'rgba(58,42,28,.9)', 2);
    for (const f of [.45, .9]) for (const [a, c] of [[C[3], C[0]], [C[0], C[1]]]) line([a[0], a[1] - H * f], [c[0], c[1] - H * f], '#c08a4a', 2);
    tape(C[3], C[0]); tape(C[0], C[1]);
    return;
  }
  if (building) {
    line(C[2], [C[2][0], C[2][1] - H], 'rgba(58,42,28,.9)', 2);
    tape(C[1], C[2]); tape(C[2], C[3]);
    if (Math.random() < dt * 8) { const c = C[Math.floor(Math.random() * 4)]; for (let i = 0; i < 5; i++) site.parts.push({ x: c[0] + (Math.random() - .5) * 20, y: c[1] - H * (.3 + Math.random() * .6), vx: (Math.random() - .5) * 50, vy: -20 - Math.random() * 30, t: 0, spark: true }); }
    if (Math.random() < dt * 4) { const k = Math.floor(Math.random() * 4); site.parts.push({ x: C[k][0], y: C[k][1], vx: (Math.random() - .5) * 12, vy: -8, t: 0 }); }
  } else if (site.done && site.done.t === 0) {   // finished: a ring of dust bursts out from the foot
    for (let i = 0; i < 26; i++) { const a = i / 26 * 6.28; site.parts.push({ x: (C[0][0] + C[2][0]) / 2, y: (C[0][1] + C[2][1]) / 2, vx: Math.cos(a) * 60, vy: Math.sin(a) * 26 - 6, t: 0, big: true }); }
  }
  if (site.done) { site.done.t += dt; if (site.done.t > 1.2) site.done = null; }
  for (const q of site.parts) { q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt; if (q.spark) q.vy += 100 * dt; else { q.vx *= .96; q.vy *= .96; } }
  site.parts = site.parts.filter(q => q.t < (q.spark ? .45 : q.big ? 1.1 : 1));
  for (const q of site.parts) { if (q.spark) { g.fillStyle = `rgba(255,${200 + Math.random() * 55 | 0},90,${1 - q.t / .45})`; g.fillRect(Math.round(q.x), Math.round(q.y), 2, 2); }
    else { g.fillStyle = `rgba(225,210,180,${(q.big ? .8 : .5) * (1 - q.t / (q.big ? 1.1 : 1))})`; g.beginPath(); g.arc(q.x, q.y, (q.big ? 4 : 2) + q.t * (q.big ? 9 : 5), 0, 7); g.fill(); } }
}
let landAnim = null; const splash = [];
function drawLandAnim(dt) {   // old coast, then each new tile rising into place, with spray
  const a = landAnim; a.t += dt;
  g.drawImage(a.old, 0, 0);
  for (const tl of a.tiles) {
    const u = Math.max(0, Math.min(1, (a.t - tl.at) / .45)); if (u <= 0) continue;
    if (!tl.splashed) { tl.splashed = true; const [px, py] = pr.P(tl.x + .5, tl.z + .5); for (let i = 0; i < 6; i++) splash.push({ x: px + (Math.random() - .5) * 18, y: py, vx: (Math.random() - .5) * 50, vy: -50 - Math.random() * 60, t: 0 }); }
    const e = 1 - (1 - u) ** 3, dy = (1 - e) * 14 - Math.sin(u * Math.PI) * 3;   // comes up from below, overshoots a little
    const c = [pr.P(tl.x, tl.z), pr.P(tl.x + 1, tl.z), pr.P(tl.x + 1, tl.z + 1), pr.P(tl.x, tl.z + 1)];
    g.save(); g.beginPath(); c.forEach(([x, y], i) => i ? g.lineTo(x, y + dy) : g.moveTo(x, y + dy)); g.closePath(); g.clip();
    g.globalAlpha = .35 + .65 * e; g.drawImage(ground, 0, dy);
    g.globalAlpha = (1 - u) * .7; g.fillStyle = '#fff6c8'; g.fill(); g.restore();   // a flash as it surfaces
  }
  if (a.t > a.end) landAnim = null;
}
function drawSplash(dt) {
  for (const p of splash) { p.t += dt; p.vy += 160 * dt; p.x += p.vx * dt; p.y += p.vy * dt; g.globalAlpha = Math.max(0, 1 - p.t / .7); g.fillStyle = p.dust ? (p.t < .25 ? '#e8d8b0' : '#b89a6a') : p.t < .25 ? '#ffffff' : '#bfe3f2'; g.fillRect(Math.round(p.x), Math.round(p.y), 3, 3); }
  g.globalAlpha = 1; for (let i = splash.length - 1; i >= 0; i--) if (splash[i].t > .7) splash.splice(i, 1);
}
// ---------- growth: guests served fill the permit gauge; a permit builds one building; served guests also raise the island's level ----------
const REQ = {
  food: { ko: '배고파요', sub: '식당 · 포장마차', icon: '🍜', en: 'a place to eat', ex: ['할머니 국밥집', '골목 포장마차', '바다 보이는 횟집'] },
  cafe: { ko: '커피 한잔 하고 싶어요', sub: '카페 · 빵집 · 노점', icon: '☕', en: 'coffee and snacks', ex: ['창가 자리 많은 카페', '아침마다 줄 서는 빵집', '붕어빵 노점'] },
  shop: { ko: '살 게 있어요', sub: '가게 · 볼일', icon: '🛍️', en: 'a shop or an errand', ex: ['24시간 편의점', '작은 약국', '바닷가 우체국'] },
  fun: { ko: '놀 데가 없어요', sub: '놀거리 · 구경거리', icon: '🎳', en: 'something fun to do', ex: ['레트로 볼링장', '작은 영화관', '등대 전망대'] },
  rest: { ko: '쉴 곳이 필요해요', sub: '숙소 · 쉼터', icon: '🛏️', en: 'a place to stay and rest', ex: ['바닷가 게스트하우스', '작은 모텔', '조용한 산사'] },
};
function G() { const w = myDoc.wallet, got = payPermits(w);   // the permit gauge, paid out when full
  if (got) { dirty = true; setTimeout(() => celebrate(`🎫 허가증 +${got}`, ''), 0); }
  return w; }
function countGuest() {
  const w = G(), lv0 = levelOf(w.served); w.served++; dirty = true;
  G();   // pays out a permit when the gauge is full
  const lv = levelOf(w.served); if (lv > lv0) setTimeout(() => celebrate(`${LEVELS[lv].name}(으)로 성장!`, lv < 3 ? `이제 ${LEVELS[lv].size} 크기 건물을 지을 수 있어요` : '섬이 번화가가 됐어요'), 1600);
}   // what a guest pays at a shop of this size, before decoration
const now = () => Date.now();

// ---------- shared state ----------
let docs = new Map();             // uid → { slot, at, plots, half, wallet }
let owners = new Map();           // slot → uid (first to take it)
let myDoc = null, mySlot = 0, dirty = false, lastSave = 0, names = {}, roadSig = null;
let world = makeIsles(new Set(), new Map());
// which board (ten islands of one group of friends) this page shows; the first board keeps the old collection name
const BOARD = new URLSearchParams(location.search).get('board') || 'main';
const COL = BOARD === 'main' ? 'i' : 'i-' + BOARD;
const nameOf = (uid) => uid?.startsWith('seed') ? (docs.get(uid)?.name ?? '예시 친구') : uid === me ? '나' : (names[uid] || '친구');
function rebuild() {
  owners = new Map();
  for (const [uid, d] of [...docs].sort((a, b) => (a[1].at ?? 0) - (b[1].at ?? 0))) if (d.slot >= 1 && d.slot <= SLOTS && !owners.has(d.slot)) owners.set(d.slot, uid);
  mySlot = 0; for (const [s, u] of owners) if (u === me) mySlot = s;
  for (const [sl, uid] of owners) setLand(sl, docs.get(uid)?.land ?? 0);   // widened islands
  const joined = new Set(owners.keys()), bridges = new Map();
  for (const s of joined) for (const n of neighbours(s)) if (n > s && joined.has(n)) {
    const da = docs.get(owners.get(s)), dbb = docs.get(owners.get(n));
    bridges.set(bridgeId(s, n), { a: !!da?.half?.[n], b: !!dbb?.half?.[s] });
  }
  world = makeIsles(joined, bridges);
  const all = allPlots(), taken = new Set(); for (const p of all) for (let i = p.x; i < p.x + PLOT[p.size]; i++) for (let k = p.z; k < p.z + PLOT[p.size]; k++) taken.add(i + ',' + k);
  ground = drawIsles(world, pr, { taken, mine: mySlot });
  // reset the walkers only when the road network changes (an island joined, a bridge finished)
  const sig = [...joined].sort((a, b) => a - b).join(',') + '|' + [...bridges].filter(([, h]) => h.a && h.b).map(([id]) => id).sort().join(',');
  if (sig !== roadSig) { roadSig = sig; sim.setArea({ w: world.w, d: world.d, isRoad: world.isRoad, lots: [] }); } else sim.A = { ...sim.A, isRoad: world.isRoad };
  const built = new Map(); for (const p of all) if (p.b) { const n = normalize(p.b.input), w = PLOT[p.size]; built.set(p.key, { type: n.type, levels: n.levels, owner: p.owner, stock: p.stock ?? START_STOCK, rates: ratesOf(p), watched: watching?.key === p.key, lot: { id: p.key, size: p.size, x: p.x, z: p.z, w, d: w, door: p.door } }); }
  sim.setBuildings(built);

  if (!scrolled) { scrolled = true; zoom = startZoom(mySlot || 1); applyZoom(); setTimeout(() => scrollToSlot(mySlot || 1), 50); }
  if (!current && !mySlot && panel.hidden) showHome();
  else if (mySlot && joinShown) closePanel();   // the join card goes away once my island is known
  if (myDoc && mySlot && !guided) { guided = true; const w = myDoc.wallet, none = !Object.keys(myDoc.plots).length;
    if (w.tut === undefined && none) w.tut = 0;
    if (w.tut >= 2 && w.tut <= 5 && none) w.tut = 1;   // came back in the middle of the first build: start it again from [짓기]
    guide(); }
}
const fxCache = new Map();
function fixturesOf(p) { const k = p.key + ':' + p.b.at; if (!fxCache.has(k)) { let f = []; try { f = buildSection(normalize(p.b.input)).fixtures; } catch {} fxCache.set(k, f); } return fxCache.get(k); }
const fxTotal = (p) => fixturesOf(p).length;
/** Bought fixtures of a plot: a list of indices (older plots kept a count of the first n). */
function ownedOf(p) {
  const d = p.owner === me && myDoc?.plots[p.key] ? myDoc.plots[p.key] : p;
  if (Array.isArray(d.own)) return new Set(d.own);
  if (d.fx === undefined) return new Set(startingFixtures(fixturesOf(p), p.b.input.order));   // never furnished: a counter and a table
  return new Set(Array.from({ length: Math.min(fxTotal(p), d.fx ?? 1) }, (_, i) => i));
}
const helpersOf = (p) => (p.owner === me && myDoc?.plots[p.key] ? myDoc.plots[p.key].helpers : p.helpers) ?? 0;
const levelsOf = (p) => (p.owner === me && myDoc?.plots[p.key] ? (myDoc.plots[p.key].lv ??= {}) : p.lv) ?? {};
const starsInfo = (p) => starsOf(fixturesOf(p), ownedOf(p), levelsOf(p));
const starText = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
const ratesOf = (p) => shopRates(fixturesOf(p), ownedOf(p), BASE_COIN[p.size] ?? 1, helpersOf(p), levelsOf(p));
function allPlots() { const out = []; for (const [s, uid] of owners) { const d = docs.get(uid); for (const [key, p] of Object.entries(d?.plots ?? {})) out.push({ ...p, key, owner: uid, slot: s }); } return out; }
async function save(force) {
  if (!db || !me || !myDoc) return;
  if (!force && (!dirty || now() - lastSave < 5000)) return;
  dirty = false; lastSave = now();
  myDoc.rev = (myDoc.rev ?? 0) + 1;   // each save is numbered, so an older copy never replaces a newer one
  try { await db.doc(COL + '/' + me).set(myDoc); } catch { dirty = true; }
}
setInterval(() => save(false), 2000);
async function resolveNames() { if (!user) return; const ids = [...owners.values()].filter(u => !u.startsWith('seed')); if (!ids.length) return; const ps = await user.profiles(ids); for (const id of ids) names[id] = ps[id]?.name || '친구'; }

// ---------- map ----------
const pr = islesProjection(), map = $('map'); map.width = pr.width; map.height = pr.height;
// native pixels by default (crisp), scrolled to my island; "전체 보기" fits the whole archipelago
let zoom = 1;   // map pixels per canvas pixel; whole steps above 1 keep the pixels even
const zoomSteps = () => { const lo = Math.min(1, Math.max(innerWidth / pr.width, innerHeight / pr.height) * .9); return [...new Set([lo, .5, .75, 1, 2, 3].filter(z => z >= lo - 1e-6))].sort((a, b) => a - b); };
function setZoom(z, at) {   // keep the point under `at` (screen x, y; default the middle of the screen) where it is
  const box = $('mapbox'), [sx, sy] = at ?? [box.clientWidth / 2, box.clientHeight / 2], cx = (box.scrollLeft + sx - map.offsetLeft) / zoom, cy = (box.scrollTop + sy - map.offsetTop) / zoom;
  zoom = z; applyZoom(); box.scrollTo({ left: map.offsetLeft + cx * zoom - sx, top: map.offsetTop + cy * zoom - sy });
}
const applyZoom = () => { map.style.width = pr.width * zoom + 'px'; const st = zoomSteps(); $('zin').disabled = zoom >= st[st.length - 1]; $('zout').disabled = zoom <= st[0] + 1e-6; };
const zoomBy = (d, at) => { const st = zoomSteps(), i = st.findIndex(z => Math.abs(z - zoom) < 1e-6), n = st[Math.max(0, Math.min(st.length - 1, (i < 0 ? st.indexOf(1) : i) + d))]; if (n !== zoom) setZoom(n, at); };
// the wheel zooms the map around the pointer, one step per notch (a burst of wheel events counts once)
let wheelAt = 0, wheelSum = 0;
$('mapbox').addEventListener('wheel', (e) => {
  e.preventDefault(); if (watching?.inPlace || zoomShop) return;
  wheelSum += e.deltaY; const t = performance.now(); if (t - wheelAt < 140 || Math.abs(wheelSum) < 30) return;
  wheelAt = t; const d = wheelSum < 0 ? 1 : -1; wheelSum = 0; zoomBy(d, [e.clientX, e.clientY]);
}, { passive: false });
/** The first view: the biggest whole step at which my island (with room for its land to grow) still fits in most of the screen. */
function startZoom(slot) {
  const [cx, cz] = centerOf(slot), r = Math.sqrt(landSize(slot) / Math.PI) + 1, xs = [[-r, -r], [r, -r], [-r, r], [r, r]].map(([dx, dz]) => pr.P(cx + dx, cz + dz));
  const w = Math.max(...xs.map(p => p[0])) - Math.min(...xs.map(p => p[0])), h = Math.max(...xs.map(p => p[1])) - Math.min(...xs.map(p => p[1]));
  const k = Math.min(innerWidth * .8 / w, (innerHeight - 160) * .85 / h);
  return Math.max(1, Math.min(3, Math.floor(k * Math.SQRT2)));   // the island is round: its outline is the square's corners pulled in by √2
}
function scrollToSlot(s) { const box = $('mapbox'), [cx, cz] = centerOf(s), [px0, py0] = pr.P(cx, cz), px = px0 * zoom, py = py0 * zoom; box.scrollTo({ left: map.offsetLeft + px - box.clientWidth / 2, top: map.offsetTop + py - 80 - box.clientHeight / 2, behavior: 'smooth' }); }
const g = map.getContext('2d'); g.imageSmoothingEnabled = false;
let ground = drawIsles(world, pr), sim = new TownSim(11, { w: WORLD.w, d: WORLD.d, isRoad: () => false, lots: [] }, { base: 0 });   // nobody lives here until someone builds
const sprites = new Map(), pops = [];
let current = null, size = 'S', hover = null, building = null, drawn = [], buildMode = false;
let callReady = 0;   // when the horn can call a boat again (seconds)
let guided = false, watching = null, joinShown = false, boardName = BOARD === 'main' ? '첫 군도' : '';   // the building whose inside is open; the join card is up
const earned = [];           // [time, coins] my shops earned, for coins per minute
function sprite(p) {
  const k = p.key + ':' + p.b.at, s = sprites.get(p.key); if (s && s.k === k) return s;
  try { const { canvas, anchor } = renderView(p.b.input, 'ext'); const n = { canvas, anchor, k, alpha: canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data }; sprites.set(p.key, n); return n; } catch { return null; }
}
let last = performance.now();
function frame(t) {
  const dt = Math.min(.05, (t - last) / 1000); last = t;
  sim.step(dt); stepBoats(dt); stepInside(dt); stepFest(dt);
  for (const e of sim.events.splice(0)) {
    const mine = !!me && e.owner === me;
    if (e.kind === 'empty') { pops.push({ key: e.lot, text: '재료 없음', mine, bad: true, t: 0 }); continue; }
    if (e.kind === 'enter') {   // the guest walks into the shop we are looking inside, and pays at the table there
      if (mine && e.fest) festServed(e);
      if (mine) { countGuest(); const p = myDoc.plots[e.lot]; if (p) p.stock = Math.max(0, (p.stock ?? START_STOCK) - (e.used ?? 1)); dirty = true; }
      if (mine && e.vip) { const p = allPlots().find(q => q.key === e.lot), b = vipBonus(p ? starsInfo(p).stars : 3); myDoc.wallet.coins += b; earned.push([performance.now(), b]); pops.push({ key: e.lot, text: `👑 VIP +${b}`, mine, t: 0 }); }
      if (watching?.key === e.lot) { watching.view.sim.spawn(); const ps = watching.view.sim.people; if (e.vip && ps.length) ps[ps.length - 1].vip = true; watching.ins.push(performance.now()); } continue;
    }
    if (mine && e.vip) { const p = allPlots().find(q => q.key === e.lot), b = vipBonus(p ? starsInfo(p).stars : 3); myDoc.wallet.coins += b; earned.push([performance.now(), b]); pops.push({ key: e.lot, text: `👑 VIP +${b}`, mine, t: -.4 }); }
    if (mine && e.fest) festServed(e);
    if (mine) flyCoin(e.lot);
    if (mine) { tutEvent('coin'); countGuest(); earned.push([performance.now(), e.coins]); myDoc.wallet.coins += e.coins; const p = myDoc.plots[e.lot]; if (p) p.stock = Math.max(0, (p.stock ?? START_STOCK) - (e.used ?? 1)); dirty = true; }
    pops.push({ key: e.lot, text: '+' + e.coins, mine, t: 0 });
  }
  for (const p of pops) p.t += dt; while (pops.length && pops[0].t > 1.4) pops.shift();
  g.clearRect(0, 0, map.width, map.height); if (landAnim) drawLandAnim(dt); else g.drawImage(ground, 0, 0);
  const outline = (x, z, n, color) => { const pts = [pr.P(x, z), pr.P(x + n, z), pr.P(x + n, z + n), pr.P(x, z + n)]; g.strokeStyle = color; g.lineWidth = 2; g.beginPath(); pts.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b))); g.closePath(); g.stroke(); };
  if (hover && !building) outline(hover.x, hover.z, moving ? PLOT[moving.size] : PLOT[size], hover.door || hover.swap ? '#2fbf71' : '#e2432f');
  if (moving) { const mp0 = myDoc.plots[moving.key]; if (mp0) outline(mp0.x, mp0.z, PLOT[mp0.size], 'rgba(255,255,255,.55)'); }
  const all = allPlots();
  if (current?.key) { const p = all.find(x => x.key === current.key); if (p) outline(p.x, p.z, PLOT[p.size], '#ffd166'); }
  const items = [], tops = {};
  if (moving && hover) { const p = all.find(q => q.key === moving.key), sp = p && sprite(p); if (sp) { const n = PLOT[p.size], [px, py] = pr.P(hover.x + n / 2, hover.z + n / 2), lift = 10 + Math.sin(performance.now() / 160) * 2;
    items.push({ d: 1e9, draw: () => { g.globalAlpha = .85; g.drawImage(sp.canvas, Math.round(px - sp.anchor.x), Math.round(py - sp.anchor.y - lift)); g.globalAlpha = 1; } }); } }
  if (zoomShop) { zoomShop.t = Math.max(0, Math.min(1, zoomShop.t + zoomShop.dir * dt / .4)); if (zoomShop.dir < 0 && zoomShop.t === 0) zoomShop = null; }
  for (const p of all) { if (!p.b || (moving && p.key === moving.key)) continue; const s = sprite(p); if (!s) continue;
    if (zoomShop?.key === p.key) { const u = zoomShop.t; if (u >= 1) continue; const n = PLOT[p.size], [px, py] = pr.P(p.x + n / 2, p.z + n / 2), e = u * u;
      items.push({ d: p.x + p.z + n, draw: () => { g.globalAlpha = 1 - e; g.drawImage(s.canvas, Math.round(px - s.anchor.x), Math.round(py - s.anchor.y - e * 60)); g.globalAlpha = 1; } }); continue; } const n = PLOT[p.size], [px, py] = pr.P(p.x + n / 2, p.z + n / 2); tops[p.key] = [px, py - s.anchor.y + 6];
    items.push({ d: p.x + p.z + n, draw: () => g.drawImage(s.canvas, Math.round(px - s.anchor.x), Math.round(py - s.anchor.y)), key: p.key, s, px, py }); }
  if (building) { const n = PLOT[building.size], [px, py] = pr.P(building.x + n / 2, building.z + n / 2), st = building.stage; items.push({ d: building.x + building.z + n, draw: () => g.drawImage(st.canvas, Math.round(px - st.W / 2), Math.round(py - st.H * .82)) }); }
  for (const p of sim.people) items.push({ d: p.x + p.z - .01, draw: () => drawPerson(g, pr, p) });
  for (const b of boats) items.push({ d: b.x + b.z, draw: () => drawBoat(b) });
  if (fest) items.push({ d: fest.x + fest.z, draw: drawFestBoat });
  { const sb = building ?? site.done ?? site.pending; if (sb) { const n = PLOT[sb.size]; site.step(dt);   // the site sorts with the buildings: its back half behind, its front half before
      items.push({ d: sb.x + sb.z - .01, draw: () => drawSite('back') }, { d: sb.x + sb.z + n + .02, draw: () => drawSite('front') }); } else site.parts.length = 0; }
  items.sort((a, b) => a.d - b.d); for (const it of items) it.draw();
  // island labels: owner names, empty slots invite
  g.textAlign = 'center';
  for (let s = 1; s <= SLOTS && !zoomShop; s++) {   // map words would be blown up behind an open shop
    const [cx, cz] = centerOf(s), [lx, ly] = pr.P(cx - 4, cz - 4), uid = owners.get(s);
    const label = uid ? `${s} · ${nameOf(uid)}` : `${s} · 빈 섬`;
    g.font = '400 14px "Jua", "Noto Sans KR", sans-serif'; const w = g.measureText(label).width + 14;
    g.fillStyle = uid === me ? '#e3a72f' : uid ? 'rgba(46,36,26,.85)' : 'rgba(255,255,255,.75)'; g.beginPath(); g.roundRect(lx - w / 2, ly - 30, w, 20, 8); g.fill();
    g.fillStyle = uid && uid !== me ? '#fff7e6' : '#2e241a'; g.fillText(label, lx, ly - 15);
    if (!uid) { g.font = '400 11px "Noto Sans KR", sans-serif'; g.fillStyle = 'rgba(255,255,255,.9)'; const [mx, my] = pr.P(cx + .5, cz + .5); g.fillText('+ 친구 초대', mx, my); }
  }
  g.font = '900 12px "Noto Sans KR", sans-serif';
  for (const p of pops) { const tp = tops[p.key]; if (!tp || zoomShop) continue; const y = tp[1] - p.t * 22; g.globalAlpha = Math.max(0, 1 - p.t / 1.4); g.lineWidth = 3; g.strokeStyle = '#3a2a00'; const em = Object.keys(EMOJI).find(k => p.text.startsWith(k)), txt = em ? p.text.slice(em.length).trim() : p.text, w = em ? 14 : 0;
    if (em) { g.imageSmoothingEnabled = false; g.drawImage(iconCanvas(EMOJI[em]), Math.round(tp[0] - g.measureText(txt).width / 2 - w - 2), Math.round(y - 12), 14, 14); }
    g.strokeText(txt, tp[0] + w / 2, y); g.fillStyle = p.bad ? '#ff8a7a' : p.mine ? '#ffd166' : '#ffffff'; g.fillText(txt, tp[0] + w / 2, y); g.globalAlpha = 1; }
  // the stars of every shop, small and gold, over its roof
  g.font = '900 11px "Noto Sans KR", sans-serif'; g.textAlign = 'center';
  { const si = iconCanvas('star'), so = iconCanvas('star0');
    for (const p of all) { if (zoomShop || !p.b || !tops[p.key] || !roleOf(normalize(p.b.input).type).serves) continue; const n = starsInfo(p).stars, [x, y] = tops[p.key];
      for (let k = 0; k < n; k++) g.drawImage(si, Math.round(x - n * 6 + k * 12), Math.round(y - 26), 12, 12); } }
  g.font = '900 12px "Noto Sans KR", sans-serif';
  // my shops running low on stock show a red mark
  for (const p of all) if (p.owner === me && p.b && (myDoc.plots[p.key]?.stock ?? START_STOCK) === 0 && roleOf(normalize(p.b.input).type).serves && tops[p.key]) { const [x, y] = tops[p.key]; g.fillStyle = '#c0392b'; g.beginPath(); g.arc(x, y - 4, 7, 0, 7); g.fill(); g.fillStyle = '#fff'; g.fillText('!', x, y - 0); }
  // what guests at my pier want and cannot find on the archipelago: thought bubbles over the pier
  if (mySlot && unmet.length && !watching?.inPlace) { const d = dockOf(mySlot), [bx, by] = pr.P(d.pier[0][0] + .5, d.pier[0][1] + .5), n = unmet.length, tt = performance.now() / 1000;
    unmet.forEach(([k, c], i) => { const x = Math.round(bx + (i - (n - 1) / 2) * 30), y = Math.round(by - 34 + Math.sin(tt * 2.2 + i) * 2);
      g.fillStyle = '#fff'; g.strokeStyle = '#2e241a'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 13, 0, 7); g.fill(); g.stroke();
      g.beginPath(); g.arc(x - 4, y + 17, 3, 0, 7); g.fill(); g.stroke();
      g.imageSmoothingEnabled = false; const ic = iconCanvas(NEED_ICON[k]); if (ic) g.drawImage(ic, x - 9, y - 9, 18, 18);
      g.font = '900 10px "Noto Sans KR", sans-serif'; g.textAlign = 'center'; g.lineWidth = 3; g.strokeText(String(c), x + 11, y + 13); g.fillStyle = '#ff8a7a'; g.fillText(String(c), x + 11, y + 13); }); }
  drawSplash(dt);
  drawn = items; lastTops = tops; placeSign();
  if (tutSpot && buildMode && tutOn() && TUT[tutStep()].map === 'spot') { const t = (Math.sin(performance.now() / 180) + 1) / 2; outline(tutSpot.x, tutSpot.z, PLOT[size], `rgba(255,${200 + 55 * t | 0},80,${.6 + .4 * t})`); }
  requestAnimationFrame(frame);
}
// ---------- boats: customers come by sea to islands that have shops ----------
const boats = [], nextBoat = new Map();
function islandShops(slot) { return allPlots().filter(p => p.slot === slot && p.b && roleOf(normalize(p.b.input).type).serves && (p.owner === me ? (myDoc.plots[p.key]?.stock ?? START_STOCK) : (p.stock ?? START_STOCK)) > 0); }
/** How often a boat comes to an island and how many it brings: more shops and fuller shops draw more. */
function boatPlan(slot) { const shops = islandShops(slot); return boatPlanOf(shops.length, shops.reduce((t, p) => t + ownedOf(p).size, 0)); }
function stepBoats(dt) {
  const t = performance.now() / 1000;
  for (const s of world.joined) {
    const shops = islandShops(s); if (!shops.length) { nextBoat.delete(s); continue; }
    if (!nextBoat.has(s)) nextBoat.set(s, t + 3);
    if (t >= nextBoat.get(s) && !boats.some(b => b.slot === s && b.state !== 'out')) {   // a leaving boat does not hold up the next one
      const d = dockOf(s), bp = boatPlan(s); boats.push({ slot: s, x: d.out[0] + .5, z: d.out[1] + .5, to: [d.stop[0] + .5, d.stop[1] + .5], state: 'in', wait: 0, shops, people: bp.people, t: 0 });
      nextBoat.set(s, t + bp.every);
    }
  }
  for (const b of boats) {
    b.t += dt;
    if (b.state === 'wait') { b.wait -= dt; if (b.wait <= 0) { const d = dockOf(b.slot); b.state = 'out'; b.to = [d.out[0] + .5, d.out[1] + .5]; } continue; }
    const dx = b.to[0] - b.x, dz = b.to[1] - b.z, dist = Math.hypot(dx, dz), v = 4 * dt;
    if (dist <= v) {
      b.x = b.to[0]; b.z = b.to[1];
      if (b.state === 'in') {   // unload: most want what this island sells
        const d = dockOf(b.slot), wants = [...new Set(b.shops.map(p => roleOf(normalize(p.b.input).type).serves))];
        for (let k = 0; k < b.people; k++) sim.spawn(d.road, k * .45, Math.random() < .75 ? wants[k % wants.length] : NEED_KEYS[Math.floor(Math.random() * NEED_KEYS.length)], d.road);
        b.state = 'wait'; b.wait = 4;
      } else b.done = true;
    } else { b.x += dx / dist * v; b.z += dz / dist * v; }
  }
  for (let i = boats.length - 1; i >= 0; i--) if (boats[i].done) boats.splice(i, 1);
}
// ---------- the festival boat: now and then a big boat shows on the horizon; a minute later its crowd lands all at once ----------
// what it brings is shown in advance, so the owner can get the shops ready; how many get served is the score
let fest = null, nextFest = performance.now() / 1000 + FEST.first;
/** Who comes: for each kind my shops serve, a little more than those shops can take in the 75 s window (so getting ready pays),
 *  plus a few who want something nobody on my island sells. */
function festNeedsNow() {   // what my shops can take in the window, by kind → who comes
  const can = {};
  for (const p of islandShops(mySlot)) { const n = normalize(p.b.input), need = roleOf(n.type, n.levels).serves; if (need) can[need] = (can[need] ?? 0) + festCapacity(ratesOf(p)); }
  return festNeeds(can, NEED_KEYS);
}
const perMinute = () => { const t = performance.now(); return earned.filter(e => e[0] > t - 60000).reduce((a, e) => a + e[1], 0); };
function stepFest(dt) {
  const t = performance.now() / 1000;
  if (!fest) {
    if (!myDoc || !mySlot || tutOn() || t < nextFest) return;
    const shops = islandShops(mySlot).length; if (!shops) { nextFest = t + 30; return; }
    const needs = festNeedsNow(), total = Object.values(needs).reduce((a, b) => a + b, 0), d = dockOf(mySlot), from = [d.out[0] + .5, d.out[1] + .5 + 10 * Math.sign(d.out[1] - d.stop[1] || 1)];
    fest = { id: Math.floor(t), state: 'coming', t0: t, arrive: t + FEST.warn, total, needs, tip: festTip(perMinute()), people: [], served: 0, tips: 0, x: from[0], z: from[1], from, to: [d.stop[0] + .5, d.stop[1] + .5], bt: 0 };
    return;
  }
  fest.bt += dt;
  if (fest.state === 'coming') {
    const u = Math.min(1, (t - fest.t0) / FEST.warn), e = 1 - (1 - u) ** 2; fest.x = fest.from[0] + (fest.to[0] - fest.from[0]) * e; fest.z = fest.from[1] + (fest.to[1] - fest.from[1]) * e;
    if (t >= fest.arrive) {   // landing: everyone off, a few at a time
      fest.state = 'here'; fest.landed = t; const d = dockOf(mySlot); let k = 0;
      for (const [need, n] of Object.entries(fest.needs)) for (let i = 0; i < n; i++, k++) { const p = sim.spawn(d.road, k * .22, need, d.road); if (p) { p.fest = fest.id; p.patience = FEST.patience; fest.people.push(p); } }
      celebrate('🎉 축제 손님 도착!', `${fest.total}명`);
    }
  } else if (fest.state === 'here') {
    const left = fest.people.filter(p => !p.festServed && !p.gone && p.mood !== 2).length;
    if (!left || t - fest.landed > FEST.window) {   // the result: how many got served, as stars; three stars add half the tips again
      const st = festStars(fest.served, fest.total), bonus = festBonus(st, fest.tips);
      if (bonus) { myDoc.wallet.coins += bonus; earned.push([performance.now(), bonus]); dirty = true; }
      celebrate(`${'★'.repeat(st)}${'☆'.repeat(3 - st)} 축제 ${fest.served}/${fest.total}`, `팁 +${fest.tips + bonus}동전${bonus ? ' (★3 보너스 포함)' : ''}${fest.total - fest.served ? ` · ${fest.total - fest.served}명 돌아감` : ''}`);
      fest.state = 'leave'; fest.left = t;
    }
  } else if (fest.state === 'leave') {
    const u = Math.min(1, (t - fest.left) / 6); fest.x = fest.to[0] + (fest.from[0] - fest.to[0]) * u * u; fest.z = fest.to[1] + (fest.from[1] - fest.to[1]) * u * u;
    if (u >= 1) { fest = null; nextFest = t + FEST.every; }
  }
  festHud();
}
// a coin flies from the shop that earned it up to the coin plate (a few a second at most, so a busy island does not snow coins)
let flyAt = 0;
function flyCoin(key) {
  const t = performance.now(); if (t - flyAt < 140 || document.hidden) return; flyAt = t;
  const tp = lastTops[key], cb = $('coinb').querySelector('.cic'); if (!tp || !cb || $('coinb').hidden) return;
  const r = map.getBoundingClientRect(), x0 = r.left + tp[0] * r.width / map.width, y0 = r.top + tp[1] * r.height / map.height, b = cb.getBoundingClientRect(), x1 = b.left + b.width / 2, y1 = b.top + b.height / 2;
  if (x0 < -40 || y0 < -40 || x0 > innerWidth + 40 || y0 > innerHeight + 40) return;
  const c = iconEl('coin', 20, ''); Object.assign(c.style, { position: 'fixed', left: '0', top: '0', zIndex: 17, pointerEvents: 'none', imageRendering: 'pixelated' }); document.body.append(c);
  const mx = (x0 + x1) / 2 + (Math.random() - .5) * 80, my = Math.min(y0, y1) - 60;
  c.animate([{ transform: `translate(${x0 - 10}px, ${y0 - 10}px) scale(.6)` }, { transform: `translate(${mx - 10}px, ${my - 10}px) scale(1.2)`, offset: .35 }, { transform: `translate(${x1 - 10}px, ${y1 - 10}px) scale(.9)` }], { duration: 650, easing: 'cubic-bezier(.5,0,.6,1)' })
    .onfinish = () => { c.remove(); const k = $('coinb'); k.classList.remove('up'); void k.offsetWidth; k.classList.add('up'); };
}
function festServed(e) { if (!fest || e.fest !== fest.id) return; const tip = fest.tip; fest.served++; fest.tips += tip; myDoc.wallet.coins += tip; earned.push([performance.now(), tip]); pops.push({ key: e.lot, text: `🎉+${tip}`, mine: true, t: -.2 }); flyCoin(e.lot); flyAt = 0; dirty = true; }
let festKey = '';
function festHud() {
  const b = $('festp'); if (!fest || fest.state === 'leave') { b.hidden = true; festKey = ''; return; }
  const t = performance.now() / 1000, cd = Math.max(0, Math.ceil(fest.arrive - t)), key = fest.state + cd + fest.served + fest.people.filter(p => p.mood === 2 && !p.festServed).length;
  if (key === festKey) return; festKey = key; b.hidden = false; b.classList.toggle('soon', fest.state === 'coming' && cd <= 15); b.classList.toggle('here', fest.state === 'here');
  const ic = iconEl('boat', 22, '');
  if (fest.state === 'coming') b.replaceChildren(ic, el('span', { class: 'cd' }, `0:${String(cd).padStart(2, '0')}`), ...Object.entries(fest.needs).sort((a, c) => c[1] - a[1]).map(([k, n]) => el('span', { class: 'nd' }, iconEl(NEED_ICON[k], 22, ''), String(n))));
  else { const lost = fest.people.filter(p => p.mood === 2 && !p.festServed).length;
    b.replaceChildren(ic, el('span', { class: 'cd' }, `${fest.served}/${fest.total}`), el('span', { class: 'bar' }, Object.assign(el('i'), { style: `width:${fest.served / fest.total * 100}%` }), Object.assign(el('i', { class: 'lost' }), { style: `width:${lost / fest.total * 100}%` }))); }
}
$('festp').onclick = () => { if (watching) closeInside(); scrollToSlot(mySlot); };
function drawFestBoat() {   // a big boat with bunting and a deck full of people
  if (!fest) return; const [px, py] = pr.P(fest.x, fest.z), x = Math.round(px), y = Math.round(py + Math.sin(fest.bt * 2) * 2), s = 2;
  g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x - 13 * s, y + 3 * s, 26 * s, 2);
  g.fillStyle = '#6b4026'; g.beginPath(); g.moveTo(x - 14 * s, y - 3 * s); g.lineTo(x + 14 * s, y - 3 * s); g.lineTo(x + 10 * s, y + 3 * s); g.lineTo(x - 10 * s, y + 3 * s); g.closePath(); g.fill();
  g.fillStyle = '#c0392b'; g.fillRect(x - 14 * s, y - 4 * s, 28 * s, 2 * s);
  for (const mx of [-6, 6]) { g.fillStyle = '#3a2418'; g.fillRect(x + mx * s, y - 26 * s, 2, 22 * s); g.fillStyle = '#f4f1ea'; g.beginPath(); g.moveTo(x + mx * s + 2, y - 25 * s); g.lineTo(x + mx * s + 11 * s, y - 9 * s); g.lineTo(x + mx * s + 2, y - 9 * s); g.closePath(); g.fill(); }
  const cols = ['#e2432f', '#ffcf3f', '#4ee0c1', '#b79cff', '#ff8fa3']; for (let k = 0; k < 9; k++) { const u = k / 8, fx = x - 6 * s + u * 12 * s, fy = y - 26 * s + Math.sin(u * Math.PI) * 4 * s; g.fillStyle = cols[k % 5]; g.fillRect(Math.round(fx) - 1, Math.round(fy), 3, 4); }
  if (fest.state === 'coming') { const n = Math.min(14, fest.total); for (let k = 0; k < n; k++) { g.fillStyle = cols[k % 5]; g.fillRect(x - 11 * s + (k % 7) * 3.2 * s, y - 7 * s - Math.floor(k / 7) * 3, 3, 4); } }
}
function drawBoat(b) {
  const [px, py] = pr.P(b.x, b.z), x = Math.round(px), y = Math.round(py + Math.sin(b.t * 3) * 1.5);
  g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x - 12, y + 3, 24, 1);
  g.fillStyle = '#6b4026'; g.beginPath(); g.moveTo(x - 13, y - 3); g.lineTo(x + 13, y - 3); g.lineTo(x + 9, y + 3); g.lineTo(x - 9, y + 3); g.closePath(); g.fill();
  g.fillStyle = '#8a5a34'; g.fillRect(x - 13, y - 4, 26, 2);
  g.fillStyle = '#3a2418'; g.fillRect(x, y - 24, 1, 21);
  g.fillStyle = '#f4f1ea'; g.beginPath(); g.moveTo(x + 1, y - 23); g.lineTo(x + 12, y - 7); g.lineTo(x + 1, y - 7); g.closePath(); g.fill();
  g.fillStyle = '#c0392b'; g.fillRect(x - 1, y - 27, 6, 3);
  if (b.state !== 'out') for (let k = 0; k < Math.min(5, b.people); k++) { g.fillStyle = ['#c0392b', '#2e86ab', '#e3b448', '#5b8a6a', '#8064a2'][k]; g.fillRect(x - 9 + k * 4, y - 7, 2, 3); }
}
requestAnimationFrame(frame);
applyZoom(); $('zin').onclick = () => zoomBy(1); $('zout').onclick = () => zoomBy(-1);
let scrolled = false;
for (const e of document.querySelectorAll('[data-i]')) e.replaceChildren(iconEl(e.dataset.i, 32, ''));
for (const e of document.querySelectorAll('[data-v]')) e.replaceChildren(voxelEl(e.dataset.v, e.closest('.big') ? 6 : 5));   // the dock buttons are voxel dioramas, rendered once
$('coinb').querySelector('.cic').replaceChildren(iconEl('coin', 36, ''));
let shownCoins = null, shownPermits = null;
function hud() {
  const coins = myDoc ? myDoc.wallet.coins : null;
  $('coinb').hidden = coins == null;
  if (coins !== shownCoins) { const cb = $('coinb'); cb.classList.remove('up', 'down'); if (shownCoins != null && coins != null) { void cb.offsetWidth; cb.classList.add(coins > shownCoins ? 'up' : 'down'); setTimeout(() => cb.classList.remove('down'), 400); }
    $('coinb').hidden = coins == null; shownCoins = coins; $('wallet').textContent = coins == null ? '—' : coins.toLocaleString('ko-KR'); }
  const t = performance.now(); while (earned.length && earned[0][0] < t - 60000) earned.shift();
  const per = earned.reduce((a, e) => a + e[1], 0); $('rate').textContent = myDoc && per ? `+${per}/분` : '';
  if (mySlot && myDoc) { const w = G(), lv = levelOf(w.served), p = Math.min(1, (w.served - w.prevAt) / Math.max(1, w.nextAt - w.prevAt));
    const tk = el('span', { class: 'tk' + (shownPermits != null && w.permits > shownPermits ? ' got' : '') }, iconEl('ticket', 24, ''), String(w.permits)); shownPermits = w.permits;
    $('who').replaceChildren(el('span', { class: 'lvr', style: `--p:${p.toFixed(3)}` }, el('b', {}, String(lv + 1))),
      el('span', { class: 'nm' }, (boardName || '한 줄 군도'), el('small', {}, `${mySlot}번 섬 · ${LEVELS[lv].name}`)), tk);
    $('who').title = `다음 허가증까지 손님 ${w.nextAt - w.served}명`;
    const bt = $('d-build'); bt.querySelector('.badge')?.remove(); if (w.permits > 0) bt.append(el('span', { class: 'badge' }, String(w.permits))); bt.classList.toggle('ready', w.permits > 0 && !buildMode);
  } else { $('who').replaceChildren(el('span', { class: 'lvr' }, el('b', {}, '?')), el('span', { class: 'nm' }, boardName || '한 줄 군도', el('small', {}, '섬 고르기'))); }
  const B = $('boat');
  if (mySlot) { const bp = boatPlan(mySlot), nb = (nextBoat.get(mySlot) ?? 0) - t / 1000, docked = boats.find(b => b.slot === mySlot && b.state !== 'out');
    const cd = Math.ceil(callReady - t / 1000), can = bp.shops && !docked && cd <= 0;
    B.hidden = false; B.classList.toggle('callable', !!can); B.classList.toggle('docked', !!docked); B.classList.toggle('idle', !bp.shops);
    $('boatring').style.setProperty('--p', docked || !bp.shops ? 1 : Math.max(0, Math.min(1, 1 - nb / Math.max(1, bp.every))).toFixed(3));
    $('boatn').textContent = docked ? String(docked.people) : bp.shops ? String(bp.people) : '';
    $('boatt').textContent = can ? '부르기!' : docked ? '도착!' : bp.shops ? `${Math.max(0, Math.ceil(nb))}초` : '';
  } else B.hidden = true;
  dockState();
  const dm = sim.demand(); unmet = NEED_KEYS.filter(k => !dm[k].served && dm[k].waiting).map(k => [k, dm[k].waiting]);
}
let unmet = [];
const NEED_ICON = { food: 'food', cafe: 'cafe', shop: 'bag', fun: 'heart', rest: 'bed' };
setInterval(hud, 500); hud();
// furniture comes in by itself: every 3 s, the next piece (of any shop) that raises income most per coin,
// keeping enough for the next batch of supplies. Off when the owner turns it off on the home panel.
setInterval(() => {
  if (!myDoc || !myDoc.wallet.autoInvest || tutOn() || inTutOn()) return;   // off unless the owner turns it on
  let best = null;
  for (const p of allPlots()) {
    if (p.owner !== me || !p.b || !roleOf(normalize(p.b.input).type, normalize(p.b.input).levels).serves) continue;
    const fx = fixturesOf(p), owned = ownedOf(p), order = p.b.input.order, base = BASE_COIN[p.size] ?? 1;
    const kinds = bestNext(fx, owned, base, order, helpersOf(p), levelsOf(p)), up = Object.values(nextUp(fx, owned, undefined, order)); if (!up.length) continue;
    // the piece that raises income most; when none does, the cheapest next piece (every piece still brings boats sooner)
    const i = up.find(j => kinds.includes(fx[j].kind)) ?? up.sort((a, b) => costOf(fx[a].kind) - costOf(fx[b].kind))[0];
    const r0 = shopRates(fx, owned, base, helpersOf(p), levelsOf(p)), r1 = shopRates(fx, new Set([...owned, i]), base, helpersOf(p), levelsOf(p)), cost = costOf(fx[i].kind);
    const value = (Math.max(0, r1.price / r1.interval - r0.price / r0.interval) + 1e-4) / cost;
    if (!best || value > best.value) best = { p, i, cost, value, kind: fx[i].kind };
  }
  if (!best) {   // every shop is full: level up what lifts income most per coin
    for (const p of allPlots()) { if (p.owner !== me || !p.b || !roleOf(normalize(p.b.input).type, normalize(p.b.input).levels).serves) continue;
      const fx = fixturesOf(p), lv = levelsOf(p), base = BASE_COIN[p.size] ?? 1, r0 = shopRates(fx, ownedOf(p), base, helpersOf(p), lv);
      for (const j of ownedOf(p)) { const L = lv[j] ?? 1; if (L >= LV_MAX) continue; const r1 = shopRates(fx, ownedOf(p), base, helpersOf(p), { ...lv, [j]: L + 1 }), cost = upgradeCost(fx[j].kind, L);
        const value = (r1.price / r1.interval - r0.price / r0.interval) / cost; if (value > 0 && (!best || value > best.value)) best = { p, j, cost, value, kind: fx[j].kind, L }; } }
    if (!best || myDoc.wallet.coins - best.cost < RESTOCK.coins) return;
    myDoc.wallet.coins -= best.cost; levelsOf(best.p)[best.j] = best.L + 1;
    pops.push({ key: best.p.key, text: `${FIX_INFO[best.kind]?.[0] ?? best.kind} Lv${best.L + 1} -${best.cost}`, mine: true, t: 0 });
    if (watching?.key === best.p.key) { watching.view.levels[best.j] = best.L + 1; watching.view.sim.setLevels(watching.view.levels); }
    rebuild(); save(true); return;
  }
  if (myDoc.wallet.coins - best.cost < RESTOCK.coins) return;
  const mp = myDoc.plots[best.p.key]; if (!mp) return;
  myDoc.wallet.coins -= best.cost; mp.own = [...new Set([...ownedOf(best.p), best.i])]; mp.fx = mp.own.length;
  pops.push({ key: best.p.key, text: `${FIX_INFO[best.kind]?.[0] ?? best.kind} -${best.cost}`, mine: true, t: 0 });
  if (watching?.key === best.p.key) { watching.view.owned.add(best.i); watching.view.sim.setOwned(watching.view.owned); watching.view.redraw(); watching.view.sim.price = ratesOf(best.p).price; }
  rebuild(); save(true); if (current?.key === best.p.key && !watching) showBuilding(best.p.key);
}, 3000);
// VIP guests: a shop with ★3 or more brings one now and then, wearing a crown; they tip 6 coins a star
const nextVip = new Map();
setInterval(() => {
  if (!myDoc || !mySlot) return; const t = performance.now() / 1000;
  for (const p of allPlots()) {
    if (p.owner !== me || !p.b) continue; const role = roleOf(normalize(p.b.input).type, normalize(p.b.input).levels); if (!role.serves) continue;
    const st = starsInfo(p).stars; if (st < 3) { nextVip.delete(p.key); continue; }
    if (!nextVip.has(p.key)) nextVip.set(p.key, t + 20);
    if (t < nextVip.get(p.key)) continue;
    nextVip.set(p.key, t + 70 - 10 * st);
    const d = dockOf(mySlot); sim.spawn(d.road, 0, role.serves, d.road, true);
    toast(`👑 VIP 손님이 ${normalize(p.b.input).name || '가게'}에 와요!`, 2200);
  }
}, 1000);
// supplies refill themselves: a shop at 2 or fewer buys the next batch when the wallet allows
setInterval(() => {
  if (!myDoc) return; let any = false;
  for (const [key, p] of Object.entries(myDoc.plots)) {
    if (!p.b || !roleOf(normalize(p.b.input).type, normalize(p.b.input).levels).serves) continue;
    if ((p.stock ?? START_STOCK) > 2 || myDoc.wallet.coins < RESTOCK.coins) continue;
    myDoc.wallet.coins -= RESTOCK.coins; p.stock = (p.stock ?? START_STOCK) + RESTOCK.units; any = true;
    pops.push({ key, text: `재료 +${RESTOCK.units} · -${RESTOCK.coins}`, mine: true, t: 0 });
  }
  if (any) { rebuild(); save(true); if (current?.key && myDoc.plots[current.key]) showBuilding(current.key); }
}, 1000);

const mapXY = (e) => { const r = map.getBoundingClientRect(); return [(e.clientX - r.left) * map.width / r.width, (e.clientY - r.top) * map.height / r.height]; };
const takenSet = () => { const t = new Set(); for (const p of allPlots()) for (let i = p.x; i < p.x + PLOT[p.size]; i++) for (let k = p.z; k < p.z + PLOT[p.size]; k++) t.add(i + ',' + k); return t; };
map.addEventListener('pointermove', (e) => {
  if (!mySlot || building || !(buildMode || moving)) { hover = null; return; }
  const [sx, sy] = mapXY(e), [fx, fz] = pr.inv(sx, sy);
  if (moving) { hover = moveTarget(fx, fz); return; }
  const n = PLOT[size], x = Math.round(fx - n / 2), z = Math.round(fz - n / 2);
  hover = slotAt(Math.floor(fx), Math.floor(fz)) === mySlot ? { x, z, door: placePlot(world, mySlot, x, z, n, takenSet()) } : null;
});
map.addEventListener('pointerleave', () => { hover = null; });
/** The building under a pointer (its picture's own pixels, frontmost first), or null. */
function buildingAt(e) { const [sx, sy] = mapXY(e);
  for (const it of [...drawn].reverse()) { if (!it.s) continue; const x = Math.floor(sx - (it.px - it.s.anchor.x)), y = Math.floor(sy - (it.py - it.s.anchor.y));
    if (x >= 0 && y >= 0 && x < it.s.canvas.width && y < it.s.canvas.height && it.s.alpha[(y * it.s.canvas.width + x) * 4 + 3] > 40) return it.key; }
  return null; }
// press and hold one of my buildings to pick it up and move it
let holdT = 0, held = false;
map.addEventListener('pointerdown', (e) => {
  held = false; clearTimeout(holdT); if (building || moving || buildMode) return;
  const key = buildingAt(e), p = key && allPlots().find(q => q.key === key); if (!p || p.owner !== me) return;
  holdT = setTimeout(() => { if (dragged) return; held = true; startMove(key); }, 550);
});
addEventListener('pointerup', () => clearTimeout(holdT)); addEventListener('pointercancel', () => clearTimeout(holdT));
map.addEventListener('click', (e) => {
  if (building || dragged) return;
  if (held) { held = false; return; }   // the press that picked a building up is not also a tap
  const [sx, sy] = mapXY(e);
  if (moving) { const [fx, fz] = pr.inv(sx, sy); return dropMove(moveTarget(fx, fz)); }
  { const k = buildingAt(e); if (k) return openShop(k); }
  const [fx, fz] = pr.inv(sx, sy), s = slotAt(Math.floor(fx), Math.floor(fz));
  if (buildMode) {   // the spot comes from the tap itself (touch screens have no hover)
    const n = PLOT[size], x = Math.round(fx - n / 2), z = Math.round(fz - n / 2), door = s === mySlot ? placePlot(world, mySlot, x, z, n, takenSet()) : null;
    if (door) { setBuildMode(false); return startBuild(x, z, door); }
    return toast(s === mySlot ? '길에 닿은 빈 땅을 고르세요' : '내 섬 땅을 누르세요', 1500); }
  if (s && s !== mySlot) return showIsland(s);
  if (!panel.hidden && current?.kind !== 'build') closePanel();
});

// ---------- game controls: drag to pan, the dock, build mode ----------
let dragged = false;
{ const box = $('mapbox'); let down = null;
  box.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, l: box.scrollLeft, t: box.scrollTop }; dragged = false; });
  addEventListener('pointermove', (e) => { if (!down) return; const dx = e.clientX - down.x, dy = e.clientY - down.y; if (!dragged && Math.hypot(dx, dy) > 6) { dragged = true; box.classList.add('drag'); } if (dragged) { box.scrollLeft = down.l - dx; box.scrollTop = down.t - dy; } });
  addEventListener('pointerup', () => { down = null; box.classList.remove('drag'); setTimeout(() => { dragged = false; }, 0); }); }
let toastT = 0;
function toast(text, ms) { const t = $('toast'); t.textContent = text; t.hidden = !text; clearTimeout(toastT); if (ms) toastT = setTimeout(() => { t.hidden = !buildMode; if (buildMode) t.textContent = buildHint(); }, ms); }
const buildHint = () => `${card?.need ? REQ[card.need].icon + ' ' + REQ[card.need].sub : '✏️ 마음대로'} · ${size}`;
function setBuildMode(on) {
  buildMode = on && !!mySlot; $('d-build').classList.toggle('on', buildMode); { const bb = $('d-build'); bb.querySelector('.lb').textContent = buildMode ? '그만' : '짓기'; } $('sizes').hidden = !buildMode; hover = null;
  if (buildMode) { const lv = levelOf(G().served), open = sizesOpen(lv); if (!open.includes(size)) size = 'S';
    $('sizes').replaceChildren(...Object.keys(PLOT).map(k => { const ok = open.includes(k), b = el('button', { class: k === size ? 'on' : '', on: { click: () => { if (!ok) return toast(`${k} 크기는 ${LEVELS.find(l => l.size === k).name}부터 지을 수 있어요`, 1800); size = k; setBuildMode(true); } } }, ok ? k : `🔒 ${k}`); return b; })); toast(buildHint()); scrollToSlot(mySlot); }
  else toast('');
}
// the horn: call the next boat now, then wait for the horn to come back
$('boat').addEventListener('click', () => {
  if (!mySlot || !$('boat').classList.contains('callable')) return;
  nextBoat.set(mySlot, 0); callReady = performance.now() / 1000 + 25; toast('📣 뿌우— 배를 불렀어요!', 1400); hud();
});
$('d-build').onclick = () => { if (!mySlot) return showHome(); if (buildMode) return setBuildMode(false); openCards(); };
// ---------- the first visit: 끼룩이 walks a new owner through one whole loop, one step at a time ----------
const TUT = [
  { say: '끼룩! 여기가 네 섬이야.\n섬 사람들이 첫 가게를 기다리고 있어!', btn: '좋아!' },
  { say: '허가증 🎫이 한 장 있어.\n아래 [짓기]를 눌러 봐!', el: '#d-build', on: 'cards' },
  { say: '섬 사람들 부탁이야.\n마음에 드는 카드를 하나 골라!', on: 'card' },
  { say: '반짝이는 땅을 눌러!\n거기에 지을 거야.', map: 'spot', on: 'place' },
  { say: '어떤 가게일까?\n한 줄로 쓰거나, 아래 예시를 눌러 봐.', el: '#signcard .chips', on: 'line' },
  { say: 'Claude가 짓는 중이야…\n건물이 올라가는 거 봐! 끼룩', on: 'built' },
  { say: '완공! 🎉\n저기 봐, 배가 손님을 싣고 와!', on: 'coin', boat: true },
  { say: '첫 수입이야! 동전이 쌓였지?\n이제 가게를 눌러 봐. 안이 보여!', map: 'shop', on: 'inside' },
  { say: '잘했어! 손님을 받을수록 🎫 게이지가 차.\n다 차면 또 지을 수 있어. 섬을 키워 보자!', btn: '시작!' },
];
// inside a shop for the first time: how to read the flow and what a fixture buys
const TUT_IN = [
  { say: '여기가 가게 안이야!\n손님이 들어와서 주문하고, 자리에 앉아서 계산해.', btn: '다음' },
  { say: () => watching?.view?.blocked?.size ? '빨간 김이 나는 곳이 막힌 곳이야.\n손님이 거기서 기다리고 있어!' : '지금은 막힌 곳이 없어.\n손님이 몰리면 막히는 곳에서 빨간 김이 나!', btn: '다음', at: 'slow' },
  { say: '오른쪽 맨 위 버튼을 눌러\n가구를 들여 봐!', el: '#shopacts .act.buy', on: 'furnish' },
  { say: '쿵! 가구가 들어왔어.\n가구가 늘면 손님을 더 받고, 손님이 늘면 🎫도 빨리 차!', btn: '알겠어' },
];
const inStep = () => myDoc?.wallet?.tutIn ?? 99;
const inTutOn = () => !!watching?.mine && inStep() < TUT_IN.length;
function tutInNext() { myDoc.wallet.tutIn = inStep() + 1; dirty = true; save(true); guide(); }
function tutInEvent(name) { if (inTutOn() && TUT_IN[inStep()].on === name) tutInNext(); }
const tutStep = () => myDoc?.wallet?.tut ?? 99;
const tutOn = () => !!mySlot && tutStep() < TUT.length;
function guide() {   // show the current step
  const g = $('guide'); document.querySelectorAll('.glow').forEach(e => e.classList.remove('glow'));
  if (inTutOn()) {
    const st = TUT_IN[inStep()]; g.hidden = false; $('gtext').textContent = typeof st.say === 'function' ? st.say() : st.say;
    $('gbtns').replaceChildren(...[st.btn ? el('button', { class: 'gold', on: { click: () => tutInNext() } }, st.btn) : null,
      el('button', { class: 'skip', on: { click: () => { myDoc.wallet.tutIn = 99; dirty = true; save(true); guide(); } } }, '건너뛰기')].filter(Boolean));
    return;
  }
  if (!tutOn()) { g.hidden = true; $('garrow').hidden = true; return; }
  const st = TUT[tutStep()]; g.hidden = false; $('gtext').textContent = st.say;
  $('gbtns').replaceChildren(...[st.btn ? el('button', { class: 'gold', on: { click: () => tutNext() } }, st.btn) : null,
    tutStep() < TUT.length - 1 ? el('button', { class: 'skip', on: { click: () => { myDoc.wallet.tut = 99; dirty = true; save(true); guide(); } } }, '건너뛰기') : null].filter(Boolean));
  if (st.boat && mySlot) nextBoat.set(mySlot, 0);   // the first boat comes at once
  if (st.on === 'info' && current?.kind === 'info') return tutNext();   // the shop's card is already open
}
function tutNext() { myDoc.wallet.tut = tutStep() + 1; dirty = true; save(true); guide(); }
function tutEvent(name) { if (tutOn() && TUT[tutStep()].on === name) tutNext(); }
// where the arrow points: an element on the page, or a spot on the map
let tutSpot = null;
function guideArrow() {
  const a = $('garrow');
  if (inTutOn()) {
    const st = TUT_IN[inStep()]; let pt = null;
    document.querySelectorAll('.glow').forEach(e => e.classList.remove('glow'));
    if (st.at === 'slow') { const v = watching.view, i = [...(v.blocked ?? [])][0], f = i !== undefined && v.fx[i]; if (f && v.onFloor(f.y)) { const [x, y] = v.view.project(f.x, f.y + 1.4, f.z), r = v.top.getBoundingClientRect(); pt = [r.left + x * v.zoom, r.top + y * v.zoom]; } }
    if (st.el) { const e = document.querySelector(st.el); if (e && e.offsetParent) { e.classList.add('glow'); const r = e.getBoundingClientRect(); pt = [r.left + r.width / 2, r.top - 4]; } }
    if (pt) { a.hidden = false; a.style.left = pt[0] + 'px'; a.style.top = pt[1] + 'px'; } else a.hidden = true;
    return;
  }
  if (!tutOn()) { a.hidden = true; return; }
  const st = TUT[tutStep()]; let x = null, y = null;
  if (st.el) { const e = document.querySelector(st.el); if (e && e.offsetParent) { e.classList.add('glow'); const r = e.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top - 4; } }
  if (st.map === 'spot' && buildMode) {
    if (!tutSpot) { const [cx, cz] = centerOf(mySlot), n = PLOT[size], taken = takenSet();
      for (let d = 1; d < 6 && !tutSpot; d++) for (const [dx, dz] of [[1, 1], [-n, 1], [1, -n], [-n, -n]]) { const door = placePlot(world, mySlot, cx + dx * d, cz + dz * d, n, taken); if (door) { tutSpot = { x: cx + dx * d, z: cz + dz * d, door }; break; } } }
    if (tutSpot) { const r = map.getBoundingClientRect(), [px, py] = pr.P(tutSpot.x + PLOT[size] / 2, tutSpot.z + PLOT[size] / 2); x = r.left + px * r.width / map.width; y = r.top + py * r.height / map.height - 10; }
  }
  if (st.map === 'shop') { const p = allPlots().find(q => q.owner === me && q.b), tp = p && lastTops[p.key]; if (tp) { const r = map.getBoundingClientRect(); x = r.left + tp[0] * r.width / map.width; y = r.top + tp[1] * r.height / map.height - 8; } }
  if (x === null) { a.hidden = true; return; }
  a.hidden = false; a.style.left = x + 'px'; a.style.top = y + 'px';
}
let lastTops = {};
setInterval(guideArrow, 120);

// ---------- extension: one more floor on top of a full shop, from one line ----------
const EXT_IDEAS = { food: ['2층에 창가 자리', '루프탑 테라스', '주방 넓히기'], cafe: ['2층 다락 좌석', '루프탑 테라스', '빵 굽는 주방 늘리기'], shop: ['2층 매장 넓히기', '계산대 늘리기', '창고 한 층'], fun: ['2층 관람석', '놀이방 한 층', '휴게실'], rest: ['객실 한 층 더', '루프탑 라운지', '스파 층'] };
function startExtend(key, { inShop = false } = {}) {
  const p = allPlots().find(x => x.key === key); if (!p?.b || p.owner !== me) return;
  if (G().permits <= 0) return toast(`허가증이 있어야 증축해요 · 다음까지 손님 ${G().nextAt - G().served}명`, 2200);
  const n = normalize(p.b.input), role = roleOf(n.type, n.levels), ideas = EXT_IDEAS[role.serves] ?? ['한 층 더 올리기', '루프탑 테라스', '2층 휴게실'];
  const input = el('input', { type: 'text', maxlength: '60', placeholder: '예: ' + ideas[0] }), go = el('button', { class: 'gold' }, `${n.levels + 1}층 올리기 · 🎫1`), err = el('div', { class: 'err' }), log = el('div', { class: 'log' });
  const body = [el('div', { class: 'row' }, input), el('div', { class: 'chips' }, ideas.map(t => el('button', { on: { click: () => { input.value = t; run(); } } }, t))), err, log];
  if (inShop) {   // the form takes the place of the shop's buttons; the cut-away stays open
    const w = watching; if (!w) return; w.extending = true;
    const cancel = () => { w.extending = false; w.actKey = ''; renderActs(w, allPlots().find(x => x.key === key)); };
    $('shopacts').replaceChildren(el('div', { class: 'extcard', on: { click: (e) => e.stopPropagation() } }, el('h3', {}, `${n.levels + 1}층에 무엇을?`), ...body, el('div', { class: 'row' }, go, el('button', { class: 'ghost', on: { click: cancel } }, '취소'))));
    placeActs(); setTimeout(() => input.focus(), 50);
  } else {
    current = { kind: 'build' };
    show(el('h2', {}, `🏗️ ${n.name || TYPE_KO[n.type]} 증축`), ...body, el('div', { class: 'row' }, go, el('button', { class: 'ghost', on: { click: () => showBuilding(key) } }, '취소')));
  }
  const note = (tag, t) => { log.append(el('div', {}, el('b', {}, tag), t)); log.scrollTop = 1e9; };
  async function run() {
    const line = input.value.trim() || ideas[0]; err.textContent = ''; log.replaceChildren();
    if (bad(line)) { err.textContent = '그 표현으로는 지을 수 없어요.'; return; }
    if (!sample) { err.textContent = '이 화면에서는 Claude를 부를 수 없어요.'; return; }
    go.disabled = true; note('…', '설계 중'); const wv = inShop ? watching?.view : null; wv?.construct(.08);
    const steps = [];
    try {
      const rd = lineReader((st) => { steps.push(st); wv?.construct(Math.min(.9, .15 + steps.length * .1)); note({ floor: '층', fixture: '가구', order: '순서' }[st.step] ?? st.step, st.note || st.name || ''); });
      await sample(extendPrompt(line, p.b.input), { modelTier: 'quick', cache: false, onText: ({ delta }) => rd.push(delta) }); rd.end();
      const next = applyExtension(p.b.input, steps); if (!next) throw { code: 'nothing' };
      // keep what was bought: each fixture (and its level) goes to the nearest of its kind on its floor; ones with no place are refunded
      const oldFx = fixturesOf(p), newFx = buildSection(normalize(next)).fixtures, r = remapFixtures(oldFx, newFx, [...ownedOf(p)], levelsOf(p)), own = new Set(r.own), refund = refundOf(r.lost);
      if (refund) { myDoc.wallet.coins += refund; note('정리', `자리가 바뀐 가구 값 ${refund}동전을 돌려받았어요`); }
      const mp = myDoc.plots[key]; mp.b = { ...mp.b, input: next, at: now(), ext: [...(mp.b.ext ?? []), line] }; mp.own = [...own]; mp.fx = own.size; mp.lv = r.lv; mp.lay = LAYOUT;
      wv?.construct(1); G().permits--; rebuild(); await save(true);
      const nn = normalize(next);
      note('완공', `${nn.levels}층 · 새 가구 ${newFx.length - own.size}개`);
      celebrate('🏗️ 증축 완공!', `${nn.name || TYPE_KO[nn.type]} ${nn.levels}층 · 새 자리를 채워 보세요`);
      setTimeout(() => { closePanel(); if (watching) closeInside(true); openShop(key); setTimeout(() => watching?.view?.setFloor(nn.levels - 1), 400); }, 900);   // back in the shop, on the new floor
    } catch (e) { wv?.construct(null); err.textContent = e?.code === 'rate_limited' ? '잠깐 쉬었다가 다시 눌러 주세요.' : '증축하지 못했어요. 다시 눌러 주세요.'; go.disabled = false; }
  }
  go.onclick = run; input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
}

// ---------- request cards: what the island wants, dealt when there is a permit to spend ----------
let card = null;
function openCards() {
  const w = G();
  if (w.permits <= 0) return toast(`손님 ${w.nextAt - w.served}명을 더 받으면 허가증이 나와요 🎫`, 2400);
  if (Object.keys(myDoc.plots).length >= maxPlots()) return toast(`섬에는 ${maxPlots()}채까지 지을 수 있어요`, 2000);
  // the two wants that most need a place: people waiting for it, and more so when my island has none
  const dm = sim.demand(), have = new Set(allPlots().filter(p => p.owner === me && p.b).map(p => roleOf(normalize(p.b.input).type, normalize(p.b.input).levels).serves));
  const score = (k) => dm[k].waiting + (have.has(k) ? 0 : 4) + Math.random() * 2;
  const picks = [...NEED_KEYS].sort((a, b) => score(b) - score(a)).slice(0, 2);
  const box = $('cards');
  const deal = (need, i) => {
    const r = need ? REQ[need] : null, wait = need ? dm[need].waiting : 0;
    const c = el('button', { class: 'rcard' + (need ? '' : ' free'), on: { click: () => { card = { need }; box.hidden = true; setBuildMode(true); tutEvent('card'); } } },
      el('span', { class: 'big' }, r ? r.icon : '✏️'), el('b', {}, r ? `“${r.ko}”` : '마음대로'), el('small', {}, r ? r.sub : '무엇이든 한 줄로'),
      r ? el('span', { class: 'need' }, iconEl('people', 20, ''), wait ? `${wait}명 기다림` : have.has(need) ? '더 원해요' : '섬에 없음') : null,
      r ? el('span', { class: 'prize' }, iconEl('coin', 18, ''), `+${REQ_BONUS} · 손님 무리`) : el('span', { class: 'prize' }, '보너스 없음'));
    c.style.animationDelay = i * 90 + 'ms'; return c;
  };
  box.replaceChildren(el('h2', {}, iconEl('ticket', 36, ''), `${w.permits} · 무엇을 지을까?`), el('div', { class: 'row3' }, ...picks.map(deal), deal(null, 2)),
    el('button', { class: 'ghost', on: { click: () => { box.hidden = true; } } }, '나중에'));
  box.hidden = false; tutEvent('cards');
}
let celebT = 0;
function celebrate(title, sub) {   // words and an icon drop in at the top centre and fade: no plate, no dimming, nothing to press
  document.querySelector('.celebrate')?.remove(); clearTimeout(celebT);
  const c = el('div', { class: 'celebrate', 'data-icon-size': '40' }, el('b', {}, title), sub ? el('span', {}, sub) : null); document.body.append(c); celebT = setTimeout(() => c.remove(), 2400);
}
$('d-home').onclick = () => { setBuildMode(false); if (panel.hidden || current) showHome(); else closePanel(); };   // open my island; a second press closes it
$('d-auto').onclick = () => { if (!myDoc) return; myDoc.wallet.autoInvest = !myDoc.wallet.autoInvest; save(true); dockState(); toast(!myDoc.wallet.autoInvest ? '가구를 직접 들여요' : '가구가 자동으로 들어와요', 1500); };
function dockState() { const auto = !!myDoc && !!myDoc.wallet.autoInvest; $('d-auto').classList.toggle('on', auto); $('d-auto-t').textContent = '자동'; $('d-auto').hidden = !myDoc; }
addEventListener('keydown', (e) => { if (e.key === 'Escape' && buildMode) setBuildMode(false); if (e.key === 'Escape' && moving) cancelMove(); });
// ---------- moving a building: it lifts, follows the pointer, and lands where it fits; landing on another of mine of the same size swaps them ----------
let moving = null;
function startMove(key) {
  const p = myDoc?.plots[key]; if (!p) return;
  if (watching) closeInside(); setBuildMode(false); closePanel();
  moving = { key, size: p.size }; hover = null; toast('↔ 옮길 자리를 눌러요 · 내 건물을 누르면 자리 바꾸기');
}
function cancelMove() { moving = null; hover = null; toast(''); }
function moveTarget(fx, fz) {   // where the moved building would land under the pointer
  const n = PLOT[moving.size], x = Math.round(fx - n / 2), z = Math.round(fz - n / 2);
  if (slotAt(Math.floor(fx), Math.floor(fz)) !== mySlot) return null;
  // the same-sized building of mine under the pointer: swap
  const other = Object.entries(myDoc.plots).find(([k, p]) => k !== moving.key && fx >= p.x && fx < p.x + PLOT[p.size] && fz >= p.z && fz < p.z + PLOT[p.size]);
  if (other) { const sw = swapDoors(moving.key, other[0]); return sw ? { x: other[1].x, z: other[1].z, swap: other[0], ...sw } : { x: other[1].x, z: other[1].z, door: null, why: '크기가 달라 그 두 자리는 서로 맞지 않아요' }; }
  const taken = new Set(); for (const p of allPlots()) if (p.key !== moving.key) for (let i = p.x; i < p.x + PLOT[p.size]; i++) for (let k = p.z; k < p.z + PLOT[p.size]; k++) taken.add(i + ',' + k);
  const door = placePlot(world, mySlot, x, z, n, taken);
  if (door) return { x, z, door };
  // why it does not fit, said in words
  let why = '길에 한 면이 닿아야 해요';
  for (let i = x; i < x + n; i++) for (let k = z; k < z + n; k++) { if (slotAt(i, k) !== mySlot) why = '섬 밖이에요'; else if (world.isRoad(i, k)) why = why === '섬 밖이에요' ? why : '길 위예요'; else if (taken.has(i + ',' + k)) why = why === '섬 밖이에요' || why === '길 위예요' ? why : '다른 건물과 겹쳐요'; }
  return { x, z, door: null, why };
}
// doors for two of my buildings trading places, or null if either does not fit the other's spot
function swapDoors(ka, kb) {
  const a = myDoc.plots[ka], b = myDoc.plots[kb], taken = new Set();
  for (const p of allPlots()) if (p.key !== ka && p.key !== kb) for (let i = p.x; i < p.x + PLOT[p.size]; i++) for (let k = p.z; k < p.z + PLOT[p.size]; k++) taken.add(i + ',' + k);
  const da = placePlot(world, mySlot, b.x, b.z, PLOT[a.size], taken); if (!da) return null;
  const tA = new Set(taken); for (let i = b.x; i < b.x + PLOT[a.size]; i++) for (let k = b.z; k < b.z + PLOT[a.size]; k++) tA.add(i + ',' + k);
  const db = placePlot(world, mySlot, a.x, a.z, PLOT[b.size], tA); return db ? { da, db } : null;
}
function dropMove(t) {
  if (!t || (!t.door && !t.swap)) return toast(`${t?.why ?? '내 섬 땅을 누르세요'} · 내 다른 건물을 누르면 자리를 바꿔요 · Esc 취소`, 2000);
  const a = myDoc.plots[moving.key], plots = { ...myDoc.plots }; delete plots[moving.key];
  const at = (p, x, z, door) => ({ ...p, x, z, door });
  if (t.swap) {   // exchange places; each finds its door again from its new spot
    const b = plots[t.swap]; delete plots[t.swap];
    plots[`${mySlot}_${b.x}_${b.z}`] = at(a, b.x, b.z, t.da); plots[`${mySlot}_${a.x}_${a.z}`] = at(b, a.x, a.z, t.db);
  } else plots[`${mySlot}_${t.x}_${t.z}`] = at(a, t.x, t.z, t.door);
  myDoc.plots = plots;
  // a thump of dust where it lands
  const n = PLOT[a.size], [px, py] = pr.P(t.x + n / 2, t.z + n / 2); for (let i = 0; i < 14; i++) splash.push({ x: px + (Math.random() - .5) * 40, y: py + (Math.random() - .5) * 10, vx: (Math.random() - .5) * 70, vy: -20 - Math.random() * 30, t: 0, dust: true });
  moving = null; hover = null; toast(t.swap ? '⇄ 자리를 바꿨어요' : '쿵! 옮겼어요', 1300); rebuild(); save(true);
}

// ---------- panel ----------
const panel = $('panel');
const xbtn = (fn) => { const b = el('button', { class: 'xb', on: { click: fn } }); b.append(iconEl('close', 22, '')); return b; };
const show = (...kids) => { panel.hidden = false; const list = kids.flat().filter(Boolean), h = list[0]?.tagName === 'H2' ? list.shift() : el('h2', {});   // the title sits on a dark strip with the close button
  panel.replaceChildren(el('div', { class: 'ph' }, h, xbtn(closePanel)), ...list); panel.scrollTop = 0; };
function closePanel() { panel.hidden = true; current = null; joinShown = false; }
function inviteCard() {
  const empty = []; for (let s = 1; s <= SLOTS; s++) if (!owners.has(s)) empty.push(s);
  if (!empty.length) return null;
  return el('div', { class: 'card tile' }, iconEl('people', 40, ''), el('span', { class: 'tt' }, el('b', {}, `빈 섬 ${empty.length}개`), el('small', {}, '공유 메뉴로 친구 초대')));
}
function bridgeCards() {
  if (!mySlot) return [];
  return neighbours(mySlot).map(n => {
    const uid = owners.get(n), id = bridgeId(mySlot, n), h = world.bridges.get(id), mineHalf = mySlot < n ? h?.a : h?.b, theirs = mySlot < n ? h?.b : h?.a;
    if (!uid) return el('span', {}, `${n}번 · 빈 섬`);
    if (mineHalf && theirs) return el('span', { class: 'ok' }, `${n}번 · ${nameOf(uid)} ✓`);
    if (mineHalf) return el('span', {}, `${n}번 · ${nameOf(uid)} · 반쪽`);
    const btn = el('button', { class: 'gold', on: { click: () => halfBridge(n) } }, el('span', { class: 'pr' }, iconEl('coin', 20, ''), String(BRIDGE))); btn.disabled = myDoc.wallet.coins < BRIDGE;
    return el('div', { class: 'card tile' + (theirs ? ' alert' : '') }, iconEl('island', 40, ''), el('span', { class: 'tt' }, el('b', {}, `${n}번 · ${nameOf(uid)}`), el('small', {}, theirs ? '반쪽이 와 있어요' : '다리 반쪽')), btn);
  });
}
function showHome(msg) {
  current = null;
  joinShown = false;
  if (!mySlot) {
    const can = db && me; joinShown = true;
    return show(el('h2', {}, boardName || '한 줄 군도'),
      can ? el('h3', {}, '내 섬 고르기') : el('p', { class: 'note' }, '초대받으면 섬을 고를 수 있어요'),
      can ? el('div', { class: 'slots' }, Array.from({ length: SLOTS }, (_, i) => i + 1).map(s => { const b = el('button', { class: owners.has(s) ? 'ghost' : '', on: { click: () => join(s) } }, String(s)); b.disabled = owners.has(s); return b; })) : null,
      msg ? el('div', { class: 'err' }, msg) : null);
  }
  const mine = Object.keys(myDoc.plots).length, w = G(), lv = levelOf(w.served), bp = boatPlan(mySlot), pct = Math.min(100, (w.served - w.prevAt) / Math.max(1, w.nextAt - w.prevAt) * 100);
  const stat = (ic, big, small) => el('div', { class: 'stat' }, iconEl(ic, 32, ''), el('b', {}, big), el('small', {}, small));
  show(el('h2', {}, `${mySlot}번 섬 `, el('small', {}, `Lv.${lv + 1} ${LEVELS[lv].name}`)),
    el('div', { class: 'card tile' }, iconEl('ticket', 40, ''), el('span', { class: 'tt' }, el('b', {}, `허가증 ${w.permits}`), el('div', { class: 'lvbar' }, Object.assign(el('i'), { style: `width:${pct}%` })), el('small', {}, `손님 ${w.nextAt - w.served}명 더`))),
    el('div', { class: 'stats3' }, stat('people', w.served.toLocaleString('ko-KR'), '받은 손님'), stat('boat', bp.shops ? `${bp.every}초` : '—', bp.shops ? `${bp.people}명씩` : '가게 없음'), stat('door', `${mine}/${maxPlots()}`, '건물')),
    landCard(), msg ? el('div', { class: 'err' }, msg) : null,
    el('h3', {}, '이웃'), el('div', { class: 'nb' }, bridgeCards().filter(x => x.tagName === 'SPAN')), ...bridgeCards().filter(x => x.tagName !== 'SPAN'), inviteCard());
}
async function join(s) {
  if (owners.has(s)) return showHome('그 섬은 이미 주인이 있어요.');
  myDoc = { slot: s, at: now(), gap: GAP, plots: {}, half: {}, wallet: { coins: START_COINS, permits: 1, tut: 0 } };
  docs.set(me, myDoc); rebuild(); await save(true); closePanel(); scrollToSlot(s); guide();
}
async function halfBridge(n) {
  if (myDoc.wallet.coins < BRIDGE) return showHome(`다리 반쪽에는 ${BRIDGE} 동전이 필요해요.`);
  myDoc.wallet.coins -= BRIDGE; myDoc.half = { ...myDoc.half, [n]: now() }; rebuild(); await save(true); showHome();
}
function showIsland(s) {
  const uid = owners.get(s);
  if (!uid) return show(el('h2', {}, `${s}번 섬 · 빈 섬`), inviteCard(), mySlot ? null : el('button', { on: { click: () => join(s) } }, '이 섬에 살기'), el('button', { class: 'ghost', on: { click: () => showHome() } }, '돌아가기'));
  if (s === mySlot) return showHome();
  const ps = allPlots().filter(p => p.slot === s && p.b);
  show(el('h2', {}, `${s}번 섬 · ${nameOf(uid)}`), el('div', { class: 'note' }, `건물 ${ps.length}채`),
    el('div', { class: 'chips' }, ps.map(p => el('button', { on: { click: () => showBuilding(p.key) } }, normalize(p.b.input).name || TYPE_KO[normalize(p.b.input).type]))),
    el('button', { class: 'ghost', on: { click: () => showHome() } }, '돌아가기'));
}
function section(input, owned) {
  const { canvas, labels } = renderView(input, 'section', { owned }); const wrap = el('div', { class: 'secwrap' }, canvas);
  for (const l of labels) { const e = el('span', { class: 'lab' }, l.text); e.style.left = (l.x / canvas.width * 100) + '%'; e.style.top = (l.y / canvas.height * 100) + '%'; if (l.count > 1) e.append(el('b', {}, ' ×' + l.count)); wrap.append(e); }
  return wrap;
}
function showBuilding(key) {
  const p = allPlots().find(x => x.key === key); if (!p?.b) return showHome();
  if (p.owner === me) setTimeout(() => tutEvent('info'), 0);
  current = { kind: 'info', key };
  const n = normalize(p.b.input), role = roleOf(n.type, n.levels), mineP = p.owner === me, st = role.serves ? starsInfo(p).stars : 0;
  show(el('h2', {}, n.name || TYPE_KO[n.type] || '건물', ' ', el('small', {}, `${nameOf(p.owner)} · ${n.levels}층`)),
    st ? el('div', { class: 'stars' }, starText(st)) : null,
    el('div', { class: 'quote' }, `“${p.b.line}”`), el('div', { class: 'pics' }, renderView(p.b.input, 'ext').canvas),
    el('div', { class: 'row' }, el('button', { class: 'gold', id: mineP ? 'go-inside' : null, on: { click: () => { closePanel(); openShop(p.key); } } }, mineP ? '가게 안으로' : '안 구경하기'),
      mineP ? el('button', { class: 'ghost', on: { click: () => startMove(p.key) } }, '↔ 옮기기') : null,
      me && (mineP || isOwner) ? el('button', { class: 'warn', on: { click: () => demolish(p) } }, '철거') : null));
}
// running my shop: stock, and the way inside where the furniture is set up

// ---------- inside a building: its own simulation, guests come from the map's queue ----------
// ---------- a shop opens where it stands: the camera comes close, the roof lifts, the inside is there ----------
let zoomShop = null, camBefore = null;   // { key, t, dir } while the roof lifts or settles
function openShop(key) {
  const p = allPlots().find(x => x.key === key); if (!p?.b) return;
  if (watching) closeInside(true); setBuildMode(false); closePanel();
  { const box = $('mapbox'); camBefore = { zoom, left: box.scrollLeft, top: box.scrollTop }; }   // put the camera back where it was when the shop closes
  if (zoom !== 1) { zoom = 1; applyZoom(); }
  const n = PLOT[p.size], [px, py] = pr.P(p.x + n / 2, p.z + n / 2), box = $('mapbox');
  const lv = normalize(p.b.input).levels;   // taller cut-aways need more room above the building
  box.scrollTo({ left: map.offsetLeft + px - box.clientWidth / 2, top: map.offsetTop + py - box.clientHeight * Math.min(.86, .62 + .12 * (Math.min(lv, 4) - 1)) });
  requestAnimationFrame(() => {
    map.style.transformOrigin = `${px}px ${py}px`; map.style.transform = 'scale(2)';
    const r = map.getBoundingClientRect(), sx = r.left + px * r.width / map.width / 1.7 * 1, sy = r.top + py * r.height / map.height / 1.7;
    // the origin does not move when scaling, so the building's base stays where it was on screen
    const st = $('shopstage'); st.style.left = ((innerWidth - 270) / 2 + 6) + 'px'; st.style.top = (innerHeight / 2) + 'px';   // the cut-away takes the middle of the screen; the building behind it lifts away
    $('shopwrap').style.setProperty('--sx', st.style.left); $('shopwrap').style.setProperty('--sy', st.style.top);
    zoomShop = { key, t: 0, dir: 1 };
    openInside(key);
  });
}
$('shopwrap').addEventListener('click', (e) => { if (e.target === $('shopwrap')) closeInside(); });
function openInside(key) {   // the cut-away in place, over the zoomed map (openShop moves the camera first)
  setTimeout(() => tutEvent('inside'), 0);
  const p = allPlots().find(x => x.key === key); if (!p?.b) return;
  const mineP = p.owner === me && !!myDoc?.plots[key], owned = ownedOf(p), n = normalize(p.b.input);
  const view = new InsideView(p.b.input, owned, {
    every: Infinity, seed: (p.x * 31 + p.z) % 97 + 1, price: shopRates(fixturesOf(p), owned, BASE_COIN[p.size] ?? 1).price,
    maxWidth: innerWidth - 380, tags: true, maxHeight: innerHeight - 70, maxZoom: 4,
    onThud: () => { const st = $('shopstage'); st.classList.remove('thud'); void st.offsetWidth; st.classList.add('thud'); },
    levels: levelsOf(p),
    upgrade: (i, kind, cost, L) => { if (!mineP || myDoc.wallet.coins < cost) return false;
      myDoc.wallet.coins -= cost; levelsOf(p)[i] = L; dirty = true; rebuild(); save(true); view.sim.price = ratesOf(p).price; return true; },
    coins: mineP ? () => myDoc.wallet.coins : undefined,
    buy: (i, kind, cost) => { if (myDoc.wallet.coins < cost) return false;
      setTimeout(() => { tutEvent('furnish'); tutInEvent('furnish'); }, 300); myDoc.wallet.coins -= cost; const mp = myDoc.plots[key]; mp.own = [...new Set([...ownedOf(p), i])]; mp.fx = mp.own.length; rebuild(); save(true); view.sim.price = ratesOf(p).price; return true; },
  });
  view.sim.setHelpers(helpersOf(p), levelsOf(p));
  watching = { key, view, mine: mineP, earned: 0, ins: [], outs: [], losts: [], lost0: 0, inPlace: true };
  if (mineP && myDoc.wallet.tutIn === undefined) myDoc.wallet.tutIn = 0;   // the first time inside a shop of mine: the inside guide
  $('shopstage').replaceChildren(view.el); $('shopwrap').hidden = false; document.body.classList.add('inshop'); watching.actKey = ''; view.onFloorChange = () => placeActs(); placeActs(); rebuild(); guide();   // the first time inside, the guide's inside steps start here
}
function closeInside(quiet) {   // the roof settles back, the camera steps away
  if (!watching) return;
    const w = watching, left = w.view.sim.people.filter(q => q.state !== 'out').length;
    if (w.mine && left) { myDoc.wallet.coins += left * w.view.sim.price; dirty = true; }
    watching = null; $('shopwrap').hidden = true; document.body.classList.remove('inshop'); $('shopstage').replaceChildren(); map.style.transform = ''; if (zoomShop) zoomShop.dir = -1; if (camBefore) { const c = camBefore; camBefore = null; if (c.zoom !== zoom) { map.style.transition = 'none'; requestAnimationFrame(() => requestAnimationFrame(() => { map.style.transition = ''; })); } zoom = c.zoom; applyZoom(); $('mapbox').scrollTo({ left: c.left, top: c.top }); } rebuild(); guide(); return;
}
addEventListener('keydown', (e) => { if (e.key === 'Escape') closeInside(); });   // closes the in-place shop too
// the one thing that unblocks the red step, as a button under the diagram
// ---------- the few big buttons beside an opened shop: the next piece, the best level-up, a helper, one more floor, move, close ----------
function placeActs() {   // to the right of the cut-away, level with its middle
  // from the stage's own place and size, not its on-screen box: that one moves while the stage shakes
  const s0 = $('shopstage'), a = $('shopacts'), cx = parseFloat(s0.style.left) || innerWidth / 2, cy = parseFloat(s0.style.top) || innerHeight / 2;
  a.style.left = Math.min(innerWidth - 240, cx + s0.offsetWidth / 2 + 16) + 'px'; a.style.top = Math.max(150, Math.min(innerHeight - 160, cy)) + 'px';
}
function shopActions(w, p) {
  const fx = fixturesOf(p), own = ownedOf(p), base = BASE_COIN[p.size] ?? 1, lv = levelsOf(p), h = helpersOf(p), coins = myDoc.wallet.coins, out = [];
  const caps = (o, l, hh) => flowCaps(fx, o, base, hh ?? h, l ?? lv), sup = w.supply ?? Infinity, now0 = caps(own);
  const popTxt = (b) => { const d = Math.min(b.gpm, sup) - Math.min(now0.gpm, sup); return d > .05 ? `+${d.toFixed(1)}명/분` : b.price > now0.price ? `+${b.price - now0.price}동전` : ''; };
  const gain = (b) => Math.min(b.gpm, sup) - Math.min(now0.gpm, sup), gainTxt = (b) => { const d = gain(b); return d > .05 ? `받는 손님 +${d.toFixed(1)}/분` : b.price > now0.price ? `한 명 +${b.price - now0.price}동전` : '배가 조금 빨리 와요'; };
  // the next piece: the one that lifts income most
  const kinds = bestNext(fx, own, base, p.b.input.order, h, lv), up = Object.values(nextUp(fx, own, undefined, p.b.input.order));
  const i = up.find(j => kinds.includes(fx[j].kind)) ?? up.sort((a, b) => costOf(fx[a].kind) - costOf(fx[b].kind))[0];
  if (i !== undefined) { const f = fx[i], c = costOf(f.kind), b = caps(new Set([...own, i])); out.push({ icon: 'chair', title: `${FIX_INFO[f.kind]?.[0] ?? f.kind} 들이기`, sub: gainTxt(b), cost: c, ok: coins >= c, hi: i, run: () => { if (w.view.buyIndex(i)) w.view.thud(i, popTxt(b), 'buy'); } }); }
  // the best level-up
  let best = null; for (const j of own) { const L = lv[j] ?? 1; if (L >= LV_MAX) continue; const b = caps(own, { ...lv, [j]: L + 1 }), c = upgradeCost(fx[j].kind, L), v = (Math.max(0, gain(b)) + (b.price - now0.price) * .5 + .01) / c; if (!best || v > best.v) best = { j, L, c, v, b }; }
  if (best) out.push({ icon: 'up', title: `${FIX_INFO[fx[best.j].kind]?.[0] ?? fx[best.j].kind} Lv${best.L + 1}`, sub: gainTxt(best.b), cost: best.c, ok: coins >= best.c, hi: best.j, run: () => { if (w.view.upgradeIndex(best.j)) w.view.thud(best.j, `Lv${best.L + 1}! ${popTxt(best.b)}`, 'up'); } });
  // a helper, when ordering is what holds guests up and the shop is full
  if (i === undefined && now0.order <= now0.seat && h < HELPER_MAX) { const c = helperCost(h); out.push({ icon: 'helper', title: '알바 뽑기', sub: gainTxt(caps(own, lv, h + 1)), cost: c, ok: coins >= c, run: () => { if (myDoc.wallet.coins < c) return; myDoc.wallet.coins -= c; myDoc.plots[p.key].helpers = h + 1; w.view.sim.setHelpers(h + 1); rebuild(); save(true); toast('알바가 왔어요!', 1200); } }); }
  // one more floor, when every piece is in
  if (i === undefined) out.push({ icon: 'extend', title: '한 층 올리기', sub: '새 자리가 생겨요', cost: `🎫1`, ok: G().permits > 0, run: () => startExtend(p.key, { inShop: true }) });
  out.push({ icon: 'move', title: '옮기기', run: () => { const k = p.key; closeInside(); startMove(k); } });
  return out;
}
function renderActs(w, p) {
  if (w.extending) return;   // the extension form is showing
  const acts = w.mine ? shopActions(w, p) : [], key = JSON.stringify(acts.map(a => [a.title, a.sub, a.cost, a.ok]));
  if (key === w.actKey) return; w.actKey = key;
  const box = $('shopacts'), info = w.mine ? null : (() => { const n = normalize(p.b.input), st = roleOf(n.type, n.levels).serves ? starsInfo(p).stars : 0;   // someone else's shop: whose it is, its line, and nothing to buy
    return el('div', { class: 'actinfo' }, el('b', {}, n.name || TYPE_KO[n.type] || '건물'), el('small', {}, `${nameOf(p.owner)}의 가게 · ${n.levels}층`), st ? el('span', { class: 'stars' }, starText(st)) : null, el('q', {}, p.b.line)); })();
  box.replaceChildren(...(info ? [info] : []), ...acts.map(a => { const b = el('button', { class: 'act' + (a.cost !== undefined && a.ok ? ' buy' : '') }, iconEl(a.icon, 32), el('span', {}, a.title, a.sub ? el('small', {}, a.sub) : null),
      a.cost !== undefined ? el('span', { class: 'price' }, typeof a.cost === 'number' ? iconEl('coin', 18) : '', String(a.cost)) : null);
    b.disabled = a.cost !== undefined && !a.ok; b.onclick = (e) => { e.stopPropagation(); a.run(); w.actKey = ''; };
    if (a.hi !== undefined) { b.onmouseenter = () => { w.view.sel = -1; w.view.flash = a.hi; }; b.onmouseleave = () => { w.view.flash = -1; }; }
    return b; }), el('button', { class: 'act close', on: { click: (e) => { e.stopPropagation(); closeInside(); } } }, '✕ 닫기'));
  placeActs();
}
let istatT = 0;
function stepInside(dt) {
  if (!watching) return;
  const paid = watching.view.frame(dt);
  { const w = watching, now0 = performance.now(), keep = (a) => { while (a.length && a[0] < now0 - 60000) a.shift(); };
    for (const e of paid) w.outs.push(now0); const lostNow = w.view.sim.stats.lostLine + w.view.sim.stats.lostSeat; for (let k = w.lost0; k < lostNow; k++) w.losts.push(now0); w.lost0 = lostNow;
    keep(w.ins); keep(w.outs); keep(w.losts);
    const span = Math.max(15, Math.min(60, (now0 - (w.opened ??= now0)) / 1000)), per = (a) => a.length / span * 60;
    { const pp = allPlots().find(x => x.key === w.key), bp = pp ? boatPlan(pp.slot) : null, expect = bp && bp.shops ? bp.people / bp.every * 60 / bp.shops : 0;
      w.supply = (now0 - w.opened) / 1000 > 30 ? Math.max(per(w.ins), .5) : Math.max(expect, per(w.ins)); }
    const p0 = allPlots().find(x => x.key === w.key);
    if (p0) { const fc = flowCaps(fixturesOf(p0), ownedOf(p0), BASE_COIN[p0.size] ?? 1, helpersOf(p0), levelsOf(p0)), isim = w.view.sim, used = isim.seats.filter(x => x.who).length;
      const q = isim.counters.reduce((t, c) => t + c.q.length, 0) + isim.kitchen.length, door = sim.shops.get(w.key)?.queue.length ?? 0;
      // the slow step: guests (0), ordering (1) or seats (2); its owned fixtures steam when guests pile up there
      const slow = w.supply < Math.min(fc.order, fc.seat) ? 0 : fc.slow === 'seat' ? 2 : 1; w.slow = slow;
      if (w.inPlace) renderActs(w, p0);
      { const fx = fixturesOf(p0), roles = slow === 2 ? ['seat'] : slow === 1 ? ['serve', 'cook'] : [];
        w.view.blocked = new Set([...ownedOf(p0)].filter(j => roles.includes(FIX_ROLE(fx[j].kind)) && (q >= 2 || w.losts.length))); }
    } }
  for (const e of paid) { watching.earned += e.n; if (watching.mine) { earned.push([performance.now(), e.n]); myDoc.wallet.coins += e.n; dirty = true; } }
  if ((istatT += dt) < .3) return; istatT = 0;
  const p = allPlots().find(x => x.key === watching.key);
  if (watching.mine && p) watching.view.suggest = new Set(bestNext(fixturesOf(p), ownedOf(p), BASE_COIN[p.size] ?? 1, p.b.input.order, helpersOf(p), levelsOf(p)));   // what raises income most: its price tag bobs
}
async function demolish(p) {
  if (p.owner === me) { const ps = { ...myDoc.plots }; delete ps[p.key]; myDoc.plots = ps; rebuild(); await save(true); return showHome(); }
  try { const ref = db.doc(COL + '/' + p.owner), cur = await ref.get(), data = cur.data() ?? {}; const ps = { ...(data.plots ?? {}) }; delete ps[p.key]; await ref.set({ ...data, plots: ps }); showHome(); } catch { showHome('철거하지 못했어요.'); }
}
function fitToLot(input, n) {
  input.scale = Object.keys(PLOT).find(k => PLOT[k] === n);
  const s = normalize(input), m = s.masses.find(x => x.at === 'main') ?? s.masses[0];
  let w = m.size[0], d = m.size[1];
  for (const x of s.masses) { if (x === m) continue; if (x.at === 'left' || x.at === 'right') w += x.size[0]; if (x.at === 'back' || x.at === 'front') d += x.size[1]; }
  const k = Math.min(1, (n - .4) / w, (n - .7) / d);
  if (k < 1) { input.size = [m.size[0] * k, m.size[1] * k]; for (const x of input.masses ?? []) if (Array.isArray(x.size)) x.size = [x.size[0] * k, x.size[1] * k]; }
}
const SUGGEST = { S: ['24시간 편의점', '작은 2층 단독주택', '붕어빵 노점'], M: ['동네 빵집', '할머니 분식집', '네온사인 PC방'], L: ['12층 아파트', '레트로 볼링장', '작은 기차역'] };
function startBuild(x, z, door) {
  if (Object.keys(myDoc.plots).length >= maxPlots()) return showHome(`내 섬에는 ${maxPlots()}채까지 지을 수 있어요.`);
  if (G().permits <= 0) return toast('허가증이 없어요', 1800);
  const n = PLOT[size], sz = size, req = card?.need ? REQ[card.need] : null, need = card?.need ?? null; current = { kind: 'build' }; tutSpot = null; setTimeout(() => tutEvent('place'), 0);
  const dm = sim.demand(), lack = NEED_KEYS.filter(k => !dm[k].served && dm[k].waiting).map(k => NEEDS[k].ko);
  const ideas = req ? req.ex : SUGGEST[sz], input = el('input', { type: 'text', id: 'line', maxlength: '80', placeholder: '예: ' + ideas[0] });
  const go = el('button', {}, '여기에 짓기'), err = el('div', { class: 'err' }), log = el('div', { class: 'log' });
  // the spot is staked: dust where it lands, a stake with a sign, and the line is written on a signboard right above it
  closePanel(); current = { kind: 'build' }; site.done = { x, z, size: sz, t: 0 }; site.pending = { x, z, size: sz };
  document.querySelector('.signcard')?.remove();
  const cancel = () => { if (building) return; card0.remove(); site.pending = null; current = null; };
  const card0 = el('div', { class: 'signcard', id: 'signcard', on: { pointerdown: (e) => e.stopPropagation(), click: (e) => e.stopPropagation() } },
    el('div', { class: 'row' }, el('b', { class: 'st' }, req ? `${req.icon} ${req.sub}` : '✏️ 마음대로'), el('small', {}, `${sz} ${n}×${n}`), xbtn(cancel)),
    el('div', { class: 'row' }, input, go), el('div', { class: 'chips' }, ideas.map(t => el('button', { on: { click: () => { input.value = t; build(); } } }, t))), err, log);
  card0.dataset.at = JSON.stringify([x + n / 2, z]); document.body.append(card0); placeSign(); setTimeout(() => input.focus(), 60);
  const note = (tag, t) => { log.append(el('div', {}, el('b', {}, tag), t)); log.scrollTop = 1e9; };
  async function build() {
    const line = input.value.trim() || input.placeholder.replace(/^예: /, '');
    err.textContent = ''; log.replaceChildren();
    if (bad(line)) { err.textContent = '그 표현으로는 지을 수 없어요.'; return; }
    if (!sample) { err.textContent = '이 화면에서는 Claude를 부를 수 없어요.'; return; }
    go.disabled = true; tutEvent('line'); card0.classList.add('busy');
    const b = emptyBuilding(), stage = new Stage2({ width: 420, height: 400, lift: .82 }); building = { x, z, size: sz, stage };
    note('…', '구상 중');
    const seen = []; let raw = '', broken = 0;
    const apply = (s) => { if (s.step === 'floor' && s.replace && b.input) b.input.floors = []; const ch = applyStep(b, s); if (!ch) return; seen.push(s);
      if (ch.view === 'ext') { fitToLot(b.input, n); stage.show(b.input, ch.key); } note({ building: '건물', main: '본관', mass: '덩어리', sign: '간판', hero: '대표', prop: '소품', floor: '층', fixture: '가구', order: '순서' }[s.step] ?? s.step, s.note || s.type || ''); };
    try {
      const rd = lineReader(apply, () => broken++);
      await sample(buildPrompt(line, { lot: { size: sz, w: n, d: n }, place: `an island village of friends (island ${mySlot})`, request: need ? { en: req.en, types: typesFor(need) } : null }), { modelTier: 'quick', cache: false, onText: ({ delta }) => { raw += delta; rd.push(delta); } }); rd.end();
      const c = check(b.input, { broken, line }); for (const f of c.fixed) note('수선', f);
      const problems = [...c.ask, ...missingParts(seen).filter(q => q === 'building').map(q => `The "${q}" line is missing.`)];
      if (problems.length) { note('다시', `남은 문제 ${problems.length}개`); let first = true; const rd2 = lineReader(s => { if (s.step === 'floor' && first) { s.replace = true; first = false; } apply(s); });
        await sample(revisePrompt(line, raw, problems), { modelTier: 'quick', cache: false, onText: ({ delta }) => rd2.push(delta) }); rd2.end(); check(b.input, { line }); }
      if (!b.input) throw { code: 'nothing' };
      fitToLot(b.input, n); const s = normalize(b.input);
      if (bad(s.name)) { err.textContent = '그 이름으로는 세울 수 없어요.'; building = null; go.disabled = false; return; }
      const key = `${mySlot}_${x}_${z}`;
      G().permits--;
      const own = startingFixtures(buildSection(normalize(b.input)).fixtures, b.input.order);
      myDoc.plots = { ...myDoc.plots, [key]: { x, z, size: sz, door, stock: START_STOCK, own, fx: own.length, lay: LAYOUT, b: { input: JSON.parse(JSON.stringify(b.input)), line, at: now() } } };
      site.done = { x, z, size: sz, t: 0 }; building = null;
      // a request answered: a bonus, and a crowd that wanted exactly this comes off the next boat
      const answered = need && roleOf(s.type, s.levels).serves === need;
      if (answered) { myDoc.wallet.coins += REQ_BONUS; const d = dockOf(mySlot); for (let k = 0; k < 6; k++) sim.spawn(d.road, 1 + k * .45, need, d.road); setTimeout(() => celebrate('요청 해결!', `+${REQ_BONUS}동전 · 손님들이 몰려와요`), 400); }
      else setTimeout(() => celebrate('완공!', s.name || TYPE_KO[s.type] || '새 건물'), 400);
      card = null; tutEvent('built');
      rebuild(); await save(true);
      const role = roleOf(s.type, s.levels);
      note('완성', `${s.name || TYPE_KO[s.type]} · ${s.levels}층${role.serves ? ' — ' + NEEDS[role.serves].ko + '을(를) 채워요' : ''}${role.source ? ` · 사람 +${role.source}` : ''}`);
      site.pending = null; setTimeout(() => { card0.remove(); if (current?.kind === 'build') current = null; }, 1800);
    } catch (e) { building = null; card0.classList.remove('busy'); err.textContent = e?.code === 'rate_limited' ? '잠깐 쉬었다가 다시 눌러 주세요.' : e?.code === 'not_granted' ? 'Claude 사용을 허락해야 지을 수 있어요.' : '짓지 못했어요. 다시 눌러 주세요.'; }
    go.disabled = false;
  }
  go.onclick = build; input.addEventListener('keydown', e => { if (e.key === 'Enter') build(); });
}

// ---------- the world: every board (ten islands of one group of friends) is a spot on a map ----------
// The map pans and zooms like a map app. Spots close together on screen merge into one bubble with a count;
// tapping a bubble zooms in and lists its boards, so any number of boards stays readable.
const PIX = 3;                     // the land is drawn at 1/3 resolution and scaled up: chunky pixels at every zoom
let wboards = [], placing = null, wv = null, wdrag = null;
function boardShape(entries) {   // owners, joined islands, bridges and plots of one board, from its island docs
  const owners = new Map(); for (const [uid, d] of [...entries].sort((a, b) => (a[1].at ?? 0) - (b[1].at ?? 0))) if (d.slot >= 1 && d.slot <= SLOTS && !owners.has(d.slot)) owners.set(d.slot, uid);
  const docsB = new Map(entries), joined = new Set(owners.keys()), bridges = new Map();
  for (const s of joined) for (const n of neighbours(s)) if (n > s && joined.has(n)) bridges.set(bridgeId(s, n), { a: !!docsB.get(owners.get(s))?.half?.[n], b: !!docsB.get(owners.get(n))?.half?.[s] });
  const taken = new Set(); let buildings = 0;
  for (const uid of owners.values()) for (const p of Object.values(docsB.get(uid)?.plots ?? {})) { buildings++; for (let i = p.x; i < p.x + PLOT[p.size]; i++) for (let k = p.z; k < p.z + PLOT[p.size]; k++) taken.add(i + ',' + k); }
  return { owners, joined, bridges, taken, buildings, mine: [...owners.values()].includes(me) };
}
const colOf = (id) => id === 'main' ? 'i' : 'i-' + id;
async function boardEntries(id) { try { return db ? (await db.collection(colOf(id)).get()).docs.map(d => [d.id, moveWithIsland(d.data())]) : (id === 'main' ? Object.entries(ISLES_SEED) : []); } catch { return []; } }
// every board keeps a small summary (friends, buildings, which users) so the world map never reads every island
async function loadBoards() {
  let meta = [];
  try { meta = db ? (await db.collection('boards').get()).docs.map(d => ({ id: d.id, ...d.data() })) : []; } catch {}
  let main = meta.find(b => b.id === 'main'); if (!main) { main = { id: 'main' }; meta.unshift(main); }
  Object.assign(main, { name: main.name ?? '첫 군도', lat: main.lat ?? 37.5, lng: main.lng ?? 127 });
  for (const b of meta) if (b.n === undefined) { const sh = boardShape(await boardEntries(b.id)); b.n = sh.joined.size; b.bld = sh.buildings; b.users = [...sh.owners.values()]; }
  const demo = +(new URLSearchParams(location.search).get('demo') ?? 0);   // ?demo=N adds N made-up boards (for checks)
  for (let i = 0; i < demo; i++) { const r = (k) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); }, seoul = i % 3 !== 2;
    meta.push({ id: 'demo' + i, name: `예시 군도 ${i + 1}`, lat: seoul ? 35 + r(1) * 3.2 : 20 + r(1) * 40, lng: seoul ? 126.4 + r(2) * 3 : -120 + r(2) * 260, n: Math.floor(r(3) * 11), bld: Math.floor(r(4) * 40), demo: true }); }
  return meta;
}
const mineIn = (b) => (b.users ?? []).includes(me);
function setView(cx, cy, k) {   // view centred on map point (cx, cy) in world units (0..360, 0..180) at k px per unit
  const vw = innerWidth, vh = innerHeight, kMin = Math.max(vw / 360, vh / 140);
  k = Math.max(kMin, Math.min(kMin * 48, k));
  const halfW = vw / 2 / k, halfH = vh / 2 / k; cx = ((cx % 360) + 360) % 360; cy = Math.max(12 + halfH, Math.min(152 - halfH, cy));
  wv = { cx, cy, k, kMin, toPx: (lat, lng) => { let x = (lng + 180) - cx; if (x > 180) x -= 360; if (x < -180) x += 360; return [vw / 2 + x * k, vh / 2 + ((90 - lat) - cy) * k]; },
    toLL: (x, y) => [90 - (cy + (y - vh / 2) / k), ((cx + (x - vw / 2) / k) % 360 + 360) % 360 - 180] };
  drawWorld();
}
function drawWorld() {
  const t0 = performance.now();
  const c = $('wmap'), vw = innerWidth, vh = innerHeight, W = Math.ceil(vw / PIX), H = Math.ceil(vh / PIX);
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  Object.assign(c.style, { left: 0, top: 0, width: W * PIX + 'px', height: H * PIX + 'px' });
  const g = c.getContext('2d'); g.fillStyle = '#3d7fa6'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#4a8db3'; for (let y = 0; y < H; y += 6) for (let x = (y / 6) % 2 ? 3 : 0; x < W; x += 12) g.fillRect(x, y, 2, 1);
  // the world repeats sideways: draw it three times, one world-width apart
  for (const shift of [-360, 0, 360]) drawLand(g, (lng, lat) => [(vw / 2 + ((lng + 180) - wv.cx + shift) * wv.k) / PIX, (vh / 2 + ((90 - lat) - wv.cy) * wv.k) / PIX], W, H);
  window.__drawMs = performance.now() - t0;
  drawSpots();
}
function clusters() {   // merge boards whose spots fall within 64 px of each other on screen
  const R = 64, out = [];
  for (const b of wboards) {
    const [x, y] = wv.toPx(b.lat, b.lng); if (x < -R || y < -R || x > innerWidth + R || y > innerHeight + R) continue;
    const c = out.find(q => Math.hypot(q.x - x, q.y - y) < R);
    if (c) { c.list.push(b); c.x = (c.x * (c.list.length - 1) + x) / c.list.length; c.y = (c.y * (c.list.length - 1) + y) / c.list.length; } else out.push({ x, y, list: [b] });
  }
  return out;
}
function drawSpots() {
  const box = $('spots'), placed = []; box.replaceChildren();
  for (const c of clusters().sort((a, b) => a.x - b.x)) {
    if (c.list.length === 1) {
      const b = c.list[0], btn = el('button', { class: 'spot' + (mineIn(b) ? ' mine' : '') + (b.id === BOARD ? ' here' : ''), on: { click: (e) => { e.stopPropagation(); showBoard(b); } } },
        el('span', { class: 'tag' }, b.name, el('small', {}, `${b.n ?? 0}/10`)), voxelEl(mineIn(b) ? 'isleMine' : 'isle', 3));
      btn.style.left = c.x + 'px'; btn.style.top = c.y + 'px'; box.append(btn);
      // far away, a lone board is a dot (its name shows on hover); close up, or if it is mine or here, it is labelled
      if (wv.k < wv.kMin * 6 && !mineIn(b) && b.id !== BOARD) { btn.classList.add('dot'); continue; }
      const r = { x0: c.x - 60, x1: c.x + 60, y0: c.y - 44, y1: c.y - 18 };
      if (placed.some(q => q.x0 < r.x1 && r.x0 < q.x1 && q.y0 < r.y1 && r.y0 < q.y1)) { btn.style.flexDirection = 'column-reverse'; btn.style.transform = 'translate(-50%, -16px)'; placed.push({ x0: r.x0, x1: r.x1, y0: c.y + 2, y1: c.y + 28 }); } else placed.push(r);
      continue;
    }
    const n = c.list.length, mine = c.list.some(mineIn), here = c.list.some(b => b.id === BOARD), [lat, lng] = wv.toLL(c.x, c.y);
    const where = wv.k < wv.kMin * 4 ? (countryAt(lat, lng)?.ko ?? '바다') : (placeLabel(lat, lng).city?.ko ?? countryAt(lat, lng)?.ko ?? '바다');
    const size = Math.round(34 + Math.min(30, Math.log2(n) * 6));
    const btn = el('button', { class: 'bubble' + (mine ? ' mine' : '') + (here ? ' here' : ''), on: { click: (e) => { e.stopPropagation(); openCluster(c); } } },
      voxelEl('isles', 3), el('b', {}, n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n)), el('span', { class: 'where' }, where));
    Object.assign(btn.style, { left: c.x + 'px', top: c.y + 'px' }); box.append(btn);
  }
  if (placing?.lat !== undefined) { const [x, y] = wv.toPx(placing.lat, placing.lng), s = el('div', { class: 'spot new' }, el('span', { class: 'tag' }, '새 군도'), voxelEl('isleMine', 3)); s.style.left = x + 'px'; s.style.top = y + 'px'; box.append(s); }
  $('wcount').textContent = placing ? '새 군도를 세울 곳을 누르세요' : `군도 ${wboards.length.toLocaleString('ko-KR')}개 · 친구 ${wboards.reduce((t, b) => t + (b.n ?? 0), 0).toLocaleString('ko-KR')}명`;
}
function zoomTo(lat, lng, k, ms = 280) {   // glide the view
  const a = { ...wv }, b = { cx: lng + 180, cy: 90 - lat }; let dx = b.cx - a.cx; if (dx > 180) dx -= 360; if (dx < -180) dx += 360;
  const t0 = performance.now(), step = (t) => { const u = Math.min(1, (t - t0) / ms), e = 1 - (1 - u) ** 3;
    setView(a.cx + dx * e, a.cy + (b.cy - a.cy) * e, a.k * Math.pow(k / a.k, e)); if (u < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function openCluster(c) {
  const [lat, lng] = wv.toLL(c.x, c.y);
  zoomTo(lat, lng, wv.k * 3.2);
  // the list of its boards: free islands first, then the busiest
  const list = [...c.list].sort((a, b) => (mineIn(b) - mineIn(a)) || ((b.n ?? 0) < 10) - ((a.n ?? 0) < 10) || (b.n ?? 0) - (a.n ?? 0) || (b.bld ?? 0) - (a.bld ?? 0));
  const card = $('wcard'); card.hidden = false;
  card.replaceChildren(el('h2', {}, `군도 ${list.length.toLocaleString('ko-KR')}개`), 
    el('div', { class: 'wlist' }, list.slice(0, 60).map(b => el('button', { class: 'wrow' + (mineIn(b) ? ' mine' : ''), on: { click: () => showBoard(b) } }, el('span', {}, b.name), el('small', {}, `${b.n ?? 0}/10 · 건물 ${b.bld ?? 0}`)))),
    list.length > 60 ? el('div', { class: 'note' }, `외 ${list.length - 60}개 — 더 확대해 보세요`) : null,
    el('button', { class: 'ghost', on: { click: () => { card.hidden = true; } } }, '닫기'));
}
async function showBoard(b) {
  const card = $('wcard'); card.hidden = false;
  const go = () => { const q = new URLSearchParams(location.search); if (b.id === 'main') q.delete('board'); else q.set('board', b.id); q.delete('world'); location.search = q.toString(); };
  const sh = b.demo ? { joined: new Set(), bridges: new Map(), taken: new Set(), buildings: 0, owners: new Map(), mine: false } : boardShape(await boardEntries(b.id));
  const mySlotThere = [...(sh.owners ?? [])].find(([, u]) => u === me)?.[0] ?? 0;
  const wd = makeIsles(sh.joined, sh.bridges), g0 = drawIsles(wd, pr, { taken: sh.taken, mine: mySlotThere });
  const th = document.createElement('canvas'); th.width = 560; th.height = Math.round(560 * g0.height / g0.width); const tg = th.getContext('2d'); tg.drawImage(g0, 0, 0, th.width, th.height);
  { const k = th.width / g0.width; tg.textAlign = 'center';   // every island numbered; mine ringed in gold
    for (let sl = 1; sl <= SLOTS; sl++) { const [cx, cz] = centerOf(sl), [px, py] = pr.P(cx, cz), x = px * k, y = py * k, me0 = sl === mySlotThere;
      if (me0) { tg.strokeStyle = '#ffcf3f'; tg.lineWidth = 3; tg.beginPath(); tg.ellipse(x, y, 34, 18, 0, 0, 7); tg.stroke(); }
      tg.font = '400 13px Jua, sans-serif'; tg.lineWidth = 3; tg.strokeStyle = '#2e241a'; const lab = me0 ? '내 섬' : sh.joined.has(sl) ? String(sl) : ''; if (!lab) continue; tg.strokeText(lab, x, y + 5); tg.fillStyle = me0 ? '#ffe08a' : '#fff'; tg.fillText(lab, x, y + 5); } }
  card.replaceChildren(el('div', { class: 'row' }, el('h2', { style: 'flex:1' }, b.name), xbtn(() => { card.hidden = true; })), el('div', { class: 'note' }, placeLabel(b.lat, b.lng).text), el('div', { class: 'nb' }, el('span', {}, `친구 ${sh.joined.size || b.n || 0}/10`), el('span', {}, `건물 ${sh.buildings || b.bld || 0}`), sh.mine ? el('span', { class: 'ok' }, '내 섬') : null), th,
    el('div', { class: 'row' }, b.id === BOARD ? el('button', { on: { click: closeWorld } }, '여기로 돌아가기') : b.demo ? el('span', { class: 'note' }, '예시 군도예요') : el('button', { class: 'gold', on: { click: go } }, sh.mine ? '내 섬으로' : sh.joined.size < 10 ? '섬 고르기' : '구경하기')));
}
async function openWorld() {
  setBuildMode(false); $('world').hidden = false; $('wcard').hidden = true; placing = null;
  wboards = await loadBoards();
  const here = wboards.find(b => b.id === BOARD) ?? wboards[0];
  setView(here.lng + 180, 90 - here.lat, Math.max(innerWidth / 360, innerHeight / 140) * 1.6);
}
function closeWorld() { $('world').hidden = true; placing = null; }
$('wclose').append(iconEl('close', 22, '')); $('wclose').onclick = closeWorld; $('d-world').onclick = openWorld; $('who').onclick = openWorld;
addEventListener('resize', () => { if (!$('world').hidden && wv) setView(wv.cx, wv.cy, wv.k); });
$('wnew').onclick = () => { if (!db || !me) return; placing = {}; $('wcard').hidden = true; drawSpots(); };
$('wplus').onclick = () => zoomTo(90 - wv.cy, wv.cx - 180, wv.k * 2); $('wminus').onclick = () => zoomTo(90 - wv.cy, wv.cx - 180, wv.k / 2);
// pan by dragging, zoom with the wheel or two fingers, around the pointer
{ const box = $('world'), ptrs = new Map(); let moved = false, pinch = null;
  box.addEventListener('pointerdown', (e) => { if (e.target.closest('.wcard, .wtop, .wzoom, .spot, .bubble')) return; ptrs.set(e.pointerId, [e.clientX, e.clientY]); moved = false; wdrag = { x: e.clientX, y: e.clientY, cx: wv.cx, cy: wv.cy };
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k: wv.k }; } });
  box.addEventListener('pointermove', (e) => { if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && ptrs.size === 2) { const [a, b] = [...ptrs.values()]; moved = true; return setView(wv.cx, wv.cy, pinch.k * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d); }
    const dx = e.clientX - wdrag.x, dy = e.clientY - wdrag.y; if (Math.hypot(dx, dy) > 5) moved = true; if (moved) setView(wdrag.cx - dx / wv.k, wdrag.cy - dy / wv.k, wv.k); });
  const up = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; };
  box.addEventListener('pointerup', (e) => { up(e); if (!moved && placing && !e.target.closest('.wcard, .wtop, .wzoom')) placeAt(e.clientX, e.clientY); });
  box.addEventListener('pointercancel', up);
  box.addEventListener('wheel', (e) => { e.preventDefault(); const [lat, lng] = wv.toLL(e.clientX, e.clientY), k = wv.k * Math.exp(-e.deltaY * .0015);
    // keep the point under the pointer still
    setView(lng + 180 - (e.clientX - innerWidth / 2) / Math.max(wv.kMin, Math.min(wv.kMin * 48, k)), 90 - lat - (e.clientY - innerHeight / 2) / Math.max(wv.kMin, Math.min(wv.kMin * 48, k)), k); }, { passive: false }); }
function placeAt(x, y) {
  let [lat, lng] = wv.toLL(x, y);
  // never exactly on top of another board: nudge until there is a little room
  for (let i = 0; i < 20 && wboards.some(b => Math.abs(b.lat - lat) < .02 && Math.abs(b.lng - lng) < .02); i++) { lat += (Math.random() - .5) * .06; lng += (Math.random() - .5) * .06; }
  placing = { lat, lng }; drawSpots();
  const input = el('input', { type: 'text', maxlength: '12', placeholder: '군도 이름 (예: 붕어빵 연합)' }), err = el('div', { class: 'err' });
  const make = async () => {
    const name = input.value.trim(); if (!name) { err.textContent = '이름을 써 주세요'; return; } if (bad(name)) { err.textContent = '그 이름은 쓸 수 없어요'; return; }
    const id = 'b' + Date.now().toString(36); await db.doc('boards/' + id).set({ name, lat, lng, owner: me, at: now(), n: 0, bld: 0, users: [] });
    const q = new URLSearchParams(location.search); q.set('board', id); q.delete('world'); location.search = q.toString();
  };
  $('wcard').hidden = false;
  $('wcard').replaceChildren(el('div', { class: 'row' }, el('h2', { style: 'flex:1' }, '새 군도'), xbtn(() => { placing = null; $('wcard').hidden = true; drawSpots(); })),
    el('div', { class: 'note' }, placeLabel(lat, lng).text), el('div', { class: 'nb' }, el('span', {}, '섬 10개'), el('span', {}, '친구 10명까지')), el('div', { class: 'row' }, input, el('button', { class: 'gold', on: { click: make } }, '세우기')), err);
  input.focus(); input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') make(); });
}
// keep this board's summary on the world map up to date (friends, buildings, who)
let lastSummary = '';
function saveSummary() {
  if (!db || !me) return;
  const users = [...owners.values()], s = { n: owners.size, bld: allPlots().filter(p => p.b).length, users };
  const k = JSON.stringify(s); if (k === lastSummary) return; lastSummary = k;
  db.doc('boards/' + BOARD).update(s).catch(() => {});
}
setInterval(saveSummary, 10000);

// islands moved apart (wider spacing): plots, doors and keys move with their island's centre

// ---------- load ----------
if (db && BOARD !== 'main') db.doc('boards/' + BOARD).get().then(d => { boardName = d.data()?.name ?? ''; }).catch(() => {});
if (db) {
  db.collection(COL).onSnapshot(snap => {
    docs = new Map();
    for (const d of snap.docs) docs.set(d.id, migrateLayout(moveWithIsland(d.data() ?? {})));
    // my own doc: take the stored copy only when it is newer than what this page holds (another tab, or an edit from outside)
    if (me && docs.has(me)) { const remote = docs.get(me);
      if (!myDoc || (remote.rev ?? 0) > (myDoc.rev ?? 0)) myDoc = { slot: remote.slot, at: remote.at, rev: remote.rev ?? 0, land: remote.land ?? 0, gap: remote.gap, plots: remote.plots ?? {}, half: remote.half ?? {}, wallet: { ...(remote.wallet ?? {}), coins: remote.wallet?.coins ?? 0 } };
      if (remote._migrated && myDoc.plots === remote.plots) { myDoc.wallet.coins += remote._refund; dirty = true; save(true); if (remote._refund) setTimeout(() => toast(`가게 안을 넓게 다시 놓았어요 · 자리 없는 가구 값 ${remote._refund}동전 돌려받음`, 3200), 1500); }
      docs.set(me, myDoc); if (remote.gap === GAP && snap.docs.find(x => x.id === me)?.data()?.gap !== GAP) { dirty = true; save(true); } }
    else if (me && myDoc) docs.set(me, myDoc);
    rebuild(); resolveNames();
  }, () => show(el('p', { class: 'err' }, '군도를 불러오지 못했어요.')));
} else { docs = new Map((BOARD === 'main' ? Object.entries(ISLES_SEED) : []).map(([u, d]) => [u, migrateLayout(moveWithIsland(d))])); rebuild(); }
if (!db) showHome();   // without a database there is nothing to wait for
// for checks from the browser console
window.__isles = { screenOf: (k) => { const tp = lastTops[k], r = map.getBoundingClientRect(); return tp && [r.left + tp[0] * r.width / map.width, r.top + (tp[1] + 30) * r.height / map.height]; }, dbgRates: () => JSON.stringify(allPlots().filter(p => p.owner === me && p.b).map(p => { const r = ratesOf(p), sh = sim.shops.get(p.key); return [p.key, roleOf(normalize(p.b.input).type, normalize(p.b.input).levels).serves, +r.interval.toFixed(2), r.cap, sh && [sh.cap, +(sh.interval ?? 0).toFixed(2), sh.stock]]; })), fest: (sec = 3) => { nextFest = performance.now() / 1000; setTimeout(() => { if (fest) { fest.arrive = performance.now() / 1000 + sec; fest.t0 = fest.arrive - FEST.warn; } }, 100); }, get festState() { return fest && { state: fest.state, served: fest.served, total: fest.total, needs: fest.needs }; }, celebrate: (a, b) => celebrate(a, b), site: (x, z, sz, on) => { if (on) building = { x, z, size: sz, stage: { canvas: document.createElement('canvas'), W: 0, H: 0 } }; else { site.done = { x, z, size: sz, t: 0 }; building = null; } }, get watching() { return watching; }, get myDoc() { return myDoc; }, startMove: (k) => startMove(k), tryDrop: (fx, fz) => dropMove(moveTarget(fx, fz)), target: (fx, fz) => moveTarget(fx, fz), cancel: () => cancelMove(), openShop: (k) => openShop(k), close: () => closeInside(), get zoom() { return zoom; }, centerOf };
// ?world=1 opens the world map at once (for checks)
if (new URLSearchParams(location.search).get('world')) setTimeout(openWorld, 600);
// ?open=<plot key> opens a building's inside at once (for checks)
{ const k = new URLSearchParams(location.search).get('open'); if (k) setTimeout(() => openShop(k), 1500); }
