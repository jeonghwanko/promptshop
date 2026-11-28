// Building: a tap on free land of my island picks the spot and opens the build window there (over the lot on a PC, from the
// bottom on a phone): the guests' wants as faces to pick from, and the bar where the line is written,
// Claude streaming the building part by part, and extending a shop by one floor.
import { lineReader } from '../steps.js';
import { Stage2 } from '../v2/stage.js';
import { emptyBuilding, applyStep, buildPrompt, extendPrompt, applyExtension } from '../v2/steps.js';
import { check, missingParts, revisePrompt } from '../v2/check.js';
import { normalize } from '../v2/spec.js';
import { TYPE_KO } from '../v2/catalog.js';
import { PLOT, dockOf, centerOf, placePlot } from '../v2/isles.js';
import { buildSection, LAYOUT, remapFixtures } from '../v2/interior.js';
import { NEED_KEYS, roleOf, typesFor } from '../v2/townsim.js';
import { LV_MAX } from '../v2/inside.js';
import { startingFixtures } from '../v2/insideview.js';
import { iconEl } from '../ui/icons.js';
import { faceEl } from '../ui/faces.js';
import { START_STOCK, REQ_BONUS, UTIL, levelOf, sizesOpen, bad } from './rules.js';
import { refundOf } from './migrate.js';
import { $, el } from './ui.js';
import { S, me, sample, pr, sim, now, canWrite, splash, nextBoat } from './state.js';
import { maxPlots, allPlots, fixturesOf, ownedOf, levelsOf, servesOf, G, rebuild, takenSet, tilesOf, shortOf, myPlots, isOff } from './model.js';
import { noSupply, pipeCost } from './utility.js';
import { stakeSite, dustSite, hookDrop } from './mapfx.js';
import { save, track } from './persist.js';
import { scrollToSlot, scrollToPoint, toScreen } from './camera.js';
import { logOpen, logStep, logNote, logDone, logFail, logDrop } from './buildlog.js';
import { opened } from './reveal.js';
import { celebrate, why } from './hud.js';
import { tutEvent, tutOn } from './guide.js';
import { show, showHome, closePanel, showBuilding } from './panel.js';
import { openShop, closeInside, renderActs, placeActs } from './shop.js';
import { loadDia, openDiaShop } from './dia.js';

// what the island asks for, by kind of guest
const REQ = {
  food: { short: '배고파요', ko: '배고파요', sub: '식당 · 포장마차', icon: '🍜', en: 'a place to eat', ex: ['할머니 국밥집', '골목 포장마차', '바다 보이는 횟집'] },
  cafe: { short: '커피', ko: '커피 한잔 하고 싶어요', sub: '카페 · 빵집 · 노점', icon: '☕', en: 'coffee and snacks', ex: ['창가 자리 많은 카페', '바다 보이는 루프탑 카페', '원두 볶는 로스터리 카페'] },
  shop: { short: '살 거', ko: '살 게 있어요', sub: '가게 · 볼일', icon: '🛍️', en: 'a shop or an errand', ex: ['24시간 편의점', '작은 약국', '바닷가 우체국'] },
  fun: { short: '놀 데', ko: '놀 데가 없어요', sub: '놀거리 · 구경거리', icon: '🎳', en: 'something fun to do', ex: ['레트로 볼링장', '작은 영화관', '등대 전망대'] },
  rest: { short: '쉴 곳', ko: '쉴 곳이 필요해요', sub: '숙소 · 쉼터', icon: '🛏️', en: 'a place to stay and rest', ex: ['바닷가 게스트하우스', '작은 모텔', '조용한 산사'] },
};
const SUGGEST = { S: ['24시간 편의점', '작은 2층 단독주택', '붕어빵 노점'], M: ['동네 빵집', '할머니 분식집', '네온사인 PC방'], L: ['12층 아파트', '레트로 볼링장', '작은 기차역'] };
const EXT_IDEAS = { food: ['2층에 창가 자리', '루프탑 테라스', '주방 넓히기'], cafe: ['2층 다락 좌석', '루프탑 테라스', '빵 굽는 주방 늘리기'], shop: ['2층 매장 넓히기', '계산대 늘리기', '창고 한 층'], fun: ['2층 관람석', '놀이방 한 층', '휴게실'], rest: ['객실 한 층 더', '루프탑 라운지', '스파 층'] };
// the parts a building arrives in, stamped one by one on the sign while Claude writes (no bar, no percent)
const STAMPS = [['building', '건물'], ['main', '본관'], ['sign', '간판'], ['hero', '대표'], ['prop', '소품'], ['floor', '층'], ['fixture', '가구']];
/** A part landed on the site: the crane's load drops and square dust kicks up from the lot's front foot (the camera stays still). */
function thud(x, z, n) {
  const [px, py] = pr.P(x + n / 2, z + n / 2); hookDrop();
  for (let i = 0; i < 8; i++) splash.push({ x: px + (Math.random() - .5) * n * 22, y: py + n * 6, vx: (Math.random() - .5) * 60, vy: -15 - Math.random() * 35, t: 0, dust: true });
}
const STEP_KO = { building: '건물', main: '본관', mass: '덩어리', sign: '간판', hero: '대표', prop: '소품', floor: '층', fixture: '가구', order: '순서' };
const failText = (e, msg) => e?.code === 'daily_limit' ? '오늘 Claude와 지을 수 있는 횟수를 다 썼어요. 내일 또 와요!' : e?.code === 'rate_limited' ? '잠깐 쉬었다가 다시 눌러 주세요.' : e?.code === 'not_granted' ? 'Claude 사용을 허락해야 지을 수 있어요.' : msg;

// ---------- the ask: faces of guests who want something, over the bar at the bottom where a building is written ----------
// The bar is always there. A face (or the bar itself) opens it: the map picks a free spot (a tap on my island moves it),
// the button says what it costs, and while Claude builds the bar is locked.

/** The wants to show, three faces that stay where they are (a face that keeps moving cannot be read): only their counts change.
 *  A face leaves its place when a shop for it has been built, or when nobody has waited for it for 10 s although my island
 *  already serves it; the face most wanted then (more so one my island has none of) comes into that same place.
 *  Nothing changes while the bar is open or a building goes up. */
const WANT_SLOTS = 3; let slots = [];
function wantsNow() {
  const dm = sim.demand(), have = new Set(allPlots().filter(p => p.owner === me && p.b).map(servesOf)), t = performance.now();
  if (!S.buildMode && !S.building) {
    slots = slots.map(sl => { if (!sl) return null; const w = dm[sl.need].waiting; if (w > 0) sl.zeroAt = 0; else sl.zeroAt ||= t;
      const built = !sl.had && have.has(sl.need), idle = have.has(sl.need) && sl.zeroAt && t - sl.zeroAt > 10000;
      return built || idle ? null : sl; });
    const score = (k) => dm[k].waiting + (have.has(k) ? 0 : 4);
    for (let i = 0; i < WANT_SLOTS; i++) { if (slots[i]) continue;
      const k = NEED_KEYS.filter(k => !slots.some(sl => sl?.need === k) && (dm[k].waiting > 0 || !have.has(k))).sort((a, b) => score(b) - score(a) || NEED_KEYS.indexOf(a) - NEED_KEYS.indexOf(b))[0];
      slots[i] = k ? { need: k, had: have.has(k), zeroAt: 0, at: t } : null; }
  }
  moreWants = NEED_KEYS.filter(k => !slots.some(sl => sl?.need === k) && dm[k].waiting > 0).map(k => ({ need: k, waiting: dm[k].waiting })).sort((a, b) => b.waiting - a.waiting);
  return slots.filter(Boolean).map(sl => ({ need: sl.need, waiting: dm[sl.need].waiting, fresh: t - sl.at < 700 }));
}
/** The other kinds of guest waiting, behind the +N chip (they do not push into the three places). */
let moreWants = [];
/** The +N chip's list, above it: every other kind waiting, with its count; picking one opens the bar for it. */
function moreList(anchor) {
  document.getElementById('why')?.remove();
  const box = el('div', { class: 'why wantlist', id: 'why', on: { pointerdown: (e) => e.stopPropagation() } }, ...moreWants.map(x => el('button', { class: 'wrow', on: { click: () => { box.remove(); pickWant(x.need); } } },
    faceEl(x.need), el('b', {}, REQ[x.need].ko), el('span', { class: 'cnt' }, String(x.waiting)), servedKinds().has(x.need) ? el('small', { class: 'rw grow', title: '가게 키우기', 'aria-label': '가게 키우기' }, iconEl('up', 16, '')) : el('small', { class: 'rw' }, iconEl('coin', 16, ''), `+${REQ_BONUS}`))));
  document.body.append(box);
  const r = anchor.getBoundingClientRect(), W = box.offsetWidth, H = box.offsetHeight; box.style.left = Math.max(8, Math.min(innerWidth - W - 8, r.left + r.width / 2 - W / 2)) + 'px'; box.style.top = Math.max(8, r.top - H - 10) + 'px';
  const close = (e) => { if (e && box.contains(e.target)) return; box.remove(); removeEventListener('pointerdown', close, true); };   // (a press inside is not a press elsewhere) setTimeout(() => addEventListener('pointerdown', close, true), 0);
}
/** The free spot for a building of this size nearest my island's centre (null: none fits). */
function autoSpot() {
  // near the middle, but a little apart from what stands already (always the nearest lot packed the island's one side and left the rest bare)
  const n = PLOT[S.size], taken = takenSet(), [cx, cz] = centerOf(S.mySlot), mine = allPlots().filter(p => p.slot === S.mySlot && p.b);
  const apart = (x, z) => mine.length ? Math.min(4, ...mine.map(p => Math.hypot(x + n / 2 - p.x - PLOT[p.size] / 2, z + n / 2 - p.z - PLOT[p.size] / 2) - (n + PLOT[p.size]) / 2)) : 0;
  let best = null, bd = 1e9;
  for (const [x, z] of tilesOf(S.mySlot)) { const d = Math.hypot(x + n / 2 - cx, z + n / 2 - cz) - .9 * apart(x, z); if (d >= bd) continue; const door = placePlot(S.world, S.mySlot, x, z, n, taken); if (door) { best = { x, z, door }; bd = d; } }
  return best;
}
const spotFits = (s) => s && !!placePlot(S.world, S.mySlot, s.x, s.z, PLOT[S.size], takenSet());
const askShown = () => !!S.mySlot && !!S.myDoc && canWrite() && !S.watching && $('world').hidden && ($('panel').hidden || S.buildMode) && !S.building;   // the faces; the bar only once a spot is picked
const ideasOf = () => S.card?.need ? REQ[S.card.need].ex : SUGGEST[S.size];

export function setBuildMode(on) {
  S.buildMode = on && !!S.mySlot && !S.building; if (!on) S.choosing = false; document.body.classList.toggle('buildmode', S.buildMode); S.hover = null;
  if (S.buildMode) { if (!sizesOpen(levelOf(G().served)).includes(S.size)) S.size = 'S'; if (!spotFits(S.spot)) S.spot = autoSpot(); }
  else if (!S.building) { S.spot = null; S.card = null; }
  drawAsk(true);
}
/** A face. With the window closed: the land where a building fits lights up, to pick where (the window opens there with
 *  this face chosen); a second tap lets go. In the window: build for that want (a second tap: anything I like). */
function pickWant(need) {
  if (S.building) return;
  // my island has that kind already: those guests were turned away at a full shop, so the face opens it to grow it inside (2026-11-28)
  if (!S.buildMode && !S.choosing && !tutOn()) { const k = shopFor(need); if (k) { document.getElementById('why')?.remove(); track('want_shop', { need }); openShop(k); return; } }
  if (!S.buildMode && !(S.choosing && S.card?.need === need) && noSupply($('wants'), UTIL.base[S.size], () => pickWant(need))) return;   // no power or water for one more: grow first, then carry on
  if (!S.buildMode) { const again = S.choosing && S.card?.need === need; S.card = again ? null : { need }; S.choosing = !again; S.choiceAt = performance.now(); drawAsk(true); if (!again) { scrollToSlot(S.mySlot); tutEvent('card'); } return; }
  S.card = S.card?.need === need ? null : { need };
  $('line').placeholder = '예: ' + ideasOf()[0]; drawAsk(true); tutEvent('card');
  if (matchMedia('(pointer: fine)').matches) $('line').focus();
}
/** A shop that can still take more guests from inside: a piece not bought yet, or one below the top level. */
const canGrow = (p) => { const fx = fixturesOf(p), own = ownedOf(p), lv = levelsOf(p); return own.size < fx.length || [...own].some(j => (lv[j] ?? 1) < LV_MAX); };
/** My shop of a kind with the longest line that can still grow (the one to grow first). Null when my island has none of
 *  that kind, or every one is full grown: then the face builds, as for a kind I do not have. */
function shopFor(need) {
  const mine = myPlots().filter(p => servesOf(p) === need && !isOff(p) && canGrow(p)); if (!mine.length) return null;
  const line = (p) => sim.shops.get(p.key)?.queue?.length ?? 0;
  return mine.sort((a, b) => line(b) - line(a))[0].key;
}
const servedKinds = () => new Set(NEED_KEYS.filter(k => shopFor(k)));   // the kinds whose face grows a shop
/** The one way to build: a spot on my island (null: the free one nearest the middle) — the window opens there. */
export function openAt(spot) {
  if (S.building || !S.mySlot) return;
  if (noSupply($('pmt'), UTIL.base[S.size], () => openAt(spot))) return;   // no power or water for one more: grow first, then the window
  if (!S.choosing) S.card = null; S.choosing = false; S.spot = spot ?? null; setBuildMode(true); if (!S.buildMode || !S.spot) return;   // a face picked before keeps
  $('line').placeholder = '예: ' + ideasOf()[0]; tutEvent('card');
  if (narrow()) { const n = PLOT[S.size]; scrollToPoint(...pr.P(S.spot.x + n / 2, S.spot.z + n / 2 + 2)); }   // a phone: the lot stays in sight above the window
  else if (matchMedia('(pointer: fine)').matches) $('line').focus();
}
/** The spot 끼룩이 suggests on a first visit (the free one nearest the middle). */
export const suggestSpot = () => (S.mySlot && S.world ? autoSpot() : null);
const narrow = () => innerWidth <= 760;   // the same line as the CSS's max-width:760px
/** The window stands over its lot on a PC (above it, or below when there is no room), following the camera; on a phone it
 *  is a sheet at the bottom. Called every frame by the map. */
export function placeAsk() {
  const box = $('ask'), on = !box.hidden && S.buildMode && S.spot && !narrow(); box.classList.toggle('float', !!on); box.classList.toggle('card', !box.hidden && S.buildMode);   // one card: over the lot, or a sheet at the bottom
  if (!on) { box.style.left = box.style.top = ''; return; }
  const n = PLOT[S.size], [px, py] = pr.P(S.spot.x + n / 2, S.spot.z + n / 2), [sx, sy] = toScreen(px, py - n * 10), W = box.offsetWidth, H = box.offsetHeight;
  const above = sy - H - 18 >= 64, top = above ? sy - H - 18 : Math.min(innerHeight - H - 8, sy + n * 20 + 18), left = Math.max(8, Math.min(innerWidth - W - 8, sx - W / 2));
  box.style.left = Math.round(left) + 'px'; box.style.top = Math.round(top) + 'px'; box.classList.toggle('below', !above);
  box.style.setProperty('--tail', Math.max(24, Math.min(W - 24, sx - left)) + 'px');
}
/** A tap on my island while the bar is open: the building goes there, if it fits. */
export function setSpot(x, z, door) { S.spot = { x, z, door }; drawAsk(true); }

let askKey = '';
/** Draw the wants and the bar for what is going on now (cheap to call often: it redraws only when something changed). */
export function drawAsk(force) {
  const box = $('ask'), on = askShown(); box.hidden = !on; if (!on) { S.preview = null; return; }
  const w = G(), wants = wantsNow(), open = sizesOpen(levelOf(w.served)), busy = !!S.building;
  const need = UTIL.base[S.size], short = shortOf(need), pipe = S.buildMode ? pipeCost(S.spot?.door) : 0;
  S.preview = S.buildMode && !busy ? need : null;   // the plant's lamps it would take blink, and the meter says 3→2
  const have = servedKinds(), key = JSON.stringify([wants, moreWants, [...have], S.card, S.buildMode, S.choosing, busy, short, pipe, Math.floor(w.coins) >= pipe, S.size, open.length, Object.keys(S.myDoc.plots).length, opened('util')]);
  if (!force && key === askKey) return; askKey = key;
  box.classList.toggle('open', S.buildMode); box.classList.toggle('busy', busy); box.classList.toggle('choosing', !!S.choosing);
  const chip = (need, waiting, fresh) => { const r = need ? REQ[need] : null, on = S.card?.need === need;
    const b = el('button', { class: 'want' + (on ? ' on' : '') + (need ? '' : ' free') + (fresh ? ' fresh' : ''), 'data-need': need ?? '', on: { click: () => pickWant(need) } },
      waiting ? el('span', { class: 'cnt' }, String(waiting)) : null, faceEl(need),
      el('span', { class: 'wt' }, el('b', { class: 'lg' }, r ? r.ko : '마음대로'), el('b', { class: 'sh' }, r ? r.short : '마음대로')),
      r ? (have.has(need) && !S.buildMode ? el('small', { class: 'rw grow', title: '가게 키우기', 'aria-label': '가게 키우기' }, iconEl('up', 16, '')) : el('small', { class: 'rw' }, iconEl('coin', 16, ''), `+${REQ_BONUS}`)) : null);   // a kind I serve: grow that shop (pickWant); else what building it pays
    b.disabled = busy; return b; };
  // with the bar open, the last chip closes it (Esc does too; the key is shown where there is a keyboard)
  const cancel = (S.buildMode || S.choosing) && !busy ? el('button', { class: 'want cancel', on: { click: () => cancelBuild() } }, iconEl('close', 22, ''), el('span', { class: 'wt' }, el('b', {}, '취소')), matchMedia('(pointer: fine)').matches ? el('kbd', {}, 'Esc') : null) : null;
  // more kinds waiting than the three places: one chip with their faces and how many in all; a tap lists them
  const total = moreWants.reduce((a, x) => a + x.waiting, 0), more = moreWants.length ? el('button', { class: 'want more', on: { click: (e) => moreList(e.currentTarget) } },
    el('span', { class: 'faces' }, ...moreWants.slice(0, 3).map(x => faceEl(x.need))), el('span', { class: 'wt' }, el('b', {}, `+${total}`))) : null;
  if (more) more.disabled = busy;
  $('wants').replaceChildren(...wants.map(x => chip(x.need, x.waiting, x.fresh)), ...(more ? [more] : []), ...(cancel ? [cancel] : [])); wantsEdge();   // (no face picked: anything I like)
  $('bwho').replaceChildren(S.buildMode || busy ? faceEl(S.card?.need ?? null) : iconEl('hammer', 28, ''));
  const input = $('line'); input.disabled = busy; if (!busy && !S.buildMode) input.placeholder = '무엇을 지을까?';
  $('bx').hidden = true;   // (closing is the 취소 chip over the bar)
  const go = $('bgo'); go.hidden = !S.buildMode && !busy; go.disabled = busy;
  const full = Object.keys(S.myDoc.plots).length >= maxPlots();
  go.classList.toggle('off', busy || full || short >= 0 || w.coins < pipe);
  // one price on the button: the cable and pipe to the spot (what it uses in power and water the plant and the meter show)
  go.replaceChildren(...(busy ? ['짓는 중'] : full ? ['자리 없음'] : [...(pipe ? [iconEl('coin', 22, ''), String(pipe)] : []), el('span', { class: 'gw' }, '짓기')]));
  const sz = $('bsize'); sz.hidden = !S.buildMode || open.length < 2;
  const pickSize = (k) => { S.size = k; if (!spotFits(S.spot)) S.spot = autoSpot(); $('line').placeholder = '예: ' + ideasOf()[0]; drawAsk(true); };
  if (!sz.hidden) sz.replaceChildren(...open.map(k => el('button', { class: (k === S.size ? 'on' : '') + (shortOf(UTIL.base[k]) >= 0 ? ' short' : ''), on: { click: (e) => { if (!noSupply(e.currentTarget, UTIL.base[k], () => pickSize(k))) pickSize(k); } } }, k)));
  if (!busy) $('bsub').replaceChildren(...(S.buildMode ? ideasOf().map(t => el('button', { on: { click: () => { input.value = t; build(); } } }, t)) : []));
}
/** More faces than fit (a phone): the side that has more fades out, so it reads as something to slide; none when all fit. */
function wantsEdge() { const w = $('wants'), end = w.scrollWidth - w.clientWidth; w.classList.toggle('more-r', end > 2 && w.scrollLeft < end - 2); w.classList.toggle('more-l', end > 2 && w.scrollLeft > 2); }
const say = (t) => { const e = $('berr'); e.textContent = t; e.hidden = !t; };
/** Close the bar without building. */
export function cancelBuild() { $('line').value = ''; say(''); document.getElementById('why')?.remove(); S.choosing = false; setBuildMode(false); }

/** Shrink a building's masses until they fit an n×n plot. */
function fitToLot(input, n) {
  input.scale = Object.keys(PLOT).find(k => PLOT[k] === n);
  const s = normalize(input), m = s.masses.find(x => x.at === 'main') ?? s.masses[0];
  let w = m.size[0], d = m.size[1];
  for (const x of s.masses) { if (x === m) continue; if (x.at === 'left' || x.at === 'right') w += x.size[0]; if (x.at === 'back' || x.at === 'front') d += x.size[1]; }
  const k = Math.min(1, (n - .4) / w, (n - .7) / d);
  if (k < 1) { input.size = [m.size[0] * k, m.size[1] * k]; for (const x of input.masses ?? []) if (Array.isArray(x.size)) x.size = [x.size[0] * k, x.size[1] * k]; }
}
/** The line in the bar becomes a building on the spot: stake it, let Claude build there, the bar locked meanwhile. */
async function build() {
  if (S.building || !canWrite()) return;
  if (!S.buildMode) return;
  const input = $('line'), go = $('bgo'); say('');
  if (Object.keys(S.myDoc.plots).length >= maxPlots()) return why(go, { icon: 'door', title: `섬에 ${maxPlots()}채가 다 찼어요`, btn: '땅 넓히기', run: () => showHome() });
  if (noSupply(go, UTIL.base[S.size], build)) return;   // not enough power or water for one more building: grow the plant, then build
  if (!spotFits(S.spot)) S.spot = autoSpot();
  if (!S.spot) return say('이 크기가 들어갈 빈 땅이 없어요.');
  const pipe = pipeCost(S.spot.door);
  if (G().coins < pipe) return why(go, { icon: 'coin', title: `전선 · 수도관 값 동전 ${pipe}개`, gauge: [G().coins, pipe], note: '선착장에서 길을 따라 이어요' });
  const line = input.value.trim() || ideasOf()[0];
  if (bad(line)) return say('그 표현으로는 지을 수 없어요.');
  if (!sample) return say('이 화면에서는 Claude를 부를 수 없어요.');
  const { x, z, door } = S.spot, sz = S.size, n = PLOT[sz], need = S.card?.need ?? null, req = need ? REQ[need] : null;
  // the show: the bar carries my line, the parts get stamped under it as they arrive, and the camera faces the lot
  closePanel(); S.current = { kind: 'build' }; dustSite({ x, z, size: sz }); stakeSite({ x, z, size: sz });
  const box = $('mapbox'), camWas = { left: box.scrollLeft, top: box.scrollTop, zoom: S.zoom };
  const b = emptyBuilding(), stage = new Stage2({ width: 420, height: 400, lift: .82 }); S.building = { x, z, size: sz, stage, t0: performance.now(), parts: 0, bumpAt: 0 };   // parts and bumpAt drive the site's show
  rebuild();   // the ground under the site turns to a cleared lot
  S.buildMode = false; document.body.classList.remove('buildmode'); input.value = `“${line}”`; drawAsk(true); tutEvent('line');
  scrollToPoint(...pr.P(x + n / 2, z + n / 2 - 1));
  const stamps = el('span', { class: 'stamps' }, STAMPS.map(([k, ko]) => el('i', { 'data-k': k }, ko)));
  $('bsub').replaceChildren(stamps); logOpen(x, z, n, line, need);
  const note = (tag, t) => logNote(tag, t);
  const done = (msg) => { if (msg) logFail(msg); S.building = null; input.value = msg === undefined ? '' : line; S.current?.kind === 'build' && (S.current = null); if (msg) say(msg); stakeSite(null); setBuildMode(msg !== undefined); };
  const seen = []; let raw = '', broken = 0;
  const apply = (s) => { if (s.step === 'floor' && s.replace && b.input) b.input.floors = []; const ch = applyStep(b, s); if (!ch) return; seen.push(s);
    if (ch.view === 'ext') { fitToLot(b.input, n); stage.show(b.input, ch.key); } logStep(s);
    const st = stamps.querySelector(`[data-k="${s.step}"]:not(.on)`); if (st) st.classList.add('on');
    if (ch.view === 'ext' || st) { thud(x, z, n); if (S.building) { S.building.parts++; S.building.bumpAt = performance.now(); } }
  };
  try {
    const rd = lineReader(apply, () => broken++);
    await sample(buildPrompt(line, { lot: { size: sz, w: n, d: n }, place: `an island village of friends (island ${S.mySlot})`, request: need ? { en: req.en, types: typesFor(need) } : null }), { purpose: 'build', modelTier: 'quick', cache: false, onText: ({ delta }) => { raw += delta; rd.push(delta); } }); rd.end();
    const c = check(b.input, { broken, line });
    const problems = [...c.ask, ...missingParts(seen).filter(q => q === 'building').map(q => `The "${q}" line is missing.`)];
    if (problems.length) { note('다듬기', '빠진 곳을 채우는 중'); let first = true; const rd2 = lineReader(s => { if (s.step === 'floor' && first) { s.replace = true; first = false; } apply(s); });
      // the fix is a bonus: if it fails (the line, a timeout), the building from the first answer still stands
      try { await sample(revisePrompt(line, raw, problems), { purpose: 'revise', modelTier: 'quick', cache: false, onText: ({ delta }) => rd2.push(delta) }); rd2.end(); } catch { note('다듬기', '이대로 지을게요'); }
      check(b.input, { line }); }
    if (!b.input) throw { code: 'nothing' };
    fitToLot(b.input, n); const s = normalize(b.input);
    if (bad(s.name)) return done('그 이름으로는 세울 수 없어요.');
    // the world may have moved on while Claude wrote: another tab took the island, the power or coins spent elsewhere, the island full, the spot taken
    if (!canWrite()) { S.building = null; stakeSite(null); logDrop(); return; }
    if (shortOf(UTIL.base[sz]) >= 0) return done('전기나 물이 모자라요. 접속점이나 정수장을 키워 주세요.');
    const pipe2 = pipeCost(door); if (G().coins < pipe2) return done(`전선 · 수도관 값 동전 ${pipe2}개가 모자라요.`);
    if (Object.keys(S.myDoc.plots).length >= maxPlots()) return done(`섬에는 ${maxPlots()}채까지 지을 수 있어요.`);
    if (!placePlot(S.world, S.mySlot, x, z, n, takenSet())) return done('그 자리에 다른 건물이 섰어요. 다시 눌러 주세요.');
    const key = `${S.mySlot}_${x}_${z}`;
    G().coins -= pipe2;
    const own = startingFixtures(buildSection(normalize(b.input)).fixtures, b.input.order);
    S.myDoc.plots = { ...S.myDoc.plots, [key]: { x, z, size: sz, door, stock: START_STOCK, own, fx: own.length, lay: LAYOUT, b: { input: JSON.parse(JSON.stringify(b.input)), line, at: now() } } };
    const rev0 = S.building?.rev ?? 1; dustSite({ x, z, size: sz }, { finish: true }); S.building = null;
    // finished: the building lands with a squash, my line rises over its roof, the first boat leaves now, and the camera
    // stays a moment before going back to where it was
    S.landing = { key, t0: performance.now(), line, rev0 }; nextBoat.set(S.mySlot, 0);   // rev0: how much of it had filled in
    // then it is dark until power reaches it: a light runs along the cable from the plant and its windows come on (shorter after the first)
    // one thing after another: the scaffold comes down, then the light sets off, then the name and stars rise as it lights up,
    // then 끼룩이 speaks, and last the 요청 해결 / 완공 words
    const cdur = Object.keys(S.myDoc.plots).length <= 1 ? 1100 : 450, lit = 750 + cdur;
    S.connect = { key, t0: performance.now() + 750, dur: cdur }; S.landing.nameAt = performance.now() + lit;
    // (only if nothing else has taken the camera since: a new zoom, or the guide showing the way)
    setTimeout(() => { if (!S.building && !S.watching && !S.current?.key && S.zoom === camWas.zoom && !tutOn()) box.scrollTo({ left: camWas.left, top: camWas.top, behavior: 'smooth' }); }, 2600);
    // a request answered: a bonus, and a crowd that wanted exactly this comes off the next boat
    const role = roleOf(s.type, s.levels), answered = need && role.serves === need;
    if (answered) { S.myDoc.wallet.coins += REQ_BONUS; const d = dockOf(S.mySlot); for (let k = 0; k < 6; k++) sim.spawn(d.road, 1 + k * .45, need, d.road); setTimeout(() => celebrate('요청 해결!'), lit + 3400); }
    else setTimeout(() => celebrate('완공!', s.name || TYPE_KO[s.type] || '새 건물'), lit + 3400);
    logDone(seen, s, tutOn()); loadDia();   // a paid build took a ticket or diamonds
    track('build', { type: s.type, size: S.myDoc.plots[key]?.size, n: Object.values(S.myDoc.plots).filter(q => q.b).length, answered: !!answered });
    done(); setTimeout(() => tutEvent('built'), lit + 600);
    rebuild(); await save(true);
  } catch (e) { logFail(failText(e, '짓지 못했어요')); S.building = null; stakeSite(null); S.current?.kind === 'build' && (S.current = null); input.value = line; setBuildMode(true); if (e?.code === 'daily_limit') openDiaShop('limit').then(open => { if (!open) say(failText(e)); }); else say(failText(e, '짓지 못했어요. 다시 눌러 주세요.')); }
}

export function initAsk() {
  const input = $('line');
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') build(); if (e.key === 'Escape') { input.blur(); cancelBuild(); } });
  $('bgo').onclick = build; $('wants').addEventListener('scroll', wantsEdge, { passive: true }); addEventListener('resize', wantsEdge);
  $('bx').onclick = cancelBuild;
  setInterval(() => drawAsk(), 500);
}

// ---------- extension: one more floor on top of a full shop, from one line ----------
/** inShop: the form takes the place of the open shop's buttons; otherwise it opens in the panel. */
export function startExtend(key, { inShop = false } = {}) {
  const p = allPlots().find(x => x.key === key); if (!p?.b || p.owner !== me || !canWrite()) return;
  if (noSupply(document.activeElement?.closest?.('button') ?? $('pmt'), UTIL.floor, () => startExtend(key, { inShop }))) return;   // a floor uses power and water too
  const n = normalize(p.b.input), ideas = EXT_IDEAS[servesOf(p)] ?? ['한 층 더 올리기', '루프탑 테라스', '2층 휴게실'];
  const input = el('input', { type: 'text', maxlength: '60', placeholder: '예: ' + ideas[0] }), go = el('button', { class: 'gold' }, `${n.levels + 1}층 올리기 · ⚡${UTIL.floor[0]} 💧${UTIL.floor[1]}`), err = el('div', { class: 'err' }), log = el('div', { class: 'log' });
  const body = [el('div', { class: 'row' }, input), el('div', { class: 'chips' }, ideas.map(t => el('button', { on: { click: () => { input.value = t; run(); } } }, t))), err, log];
  if (inShop) {   // the cut-away stays open
    const w = S.watching; if (!w) return; w.extending = true;
    const cancel = () => { w.extending = false; w.actKey = ''; renderActs(w, allPlots().find(x => x.key === key)); };
    $('shopacts').replaceChildren(el('div', { class: 'extcard', on: { click: (e) => e.stopPropagation() } }, el('h3', {}, `${n.levels + 1}층에 무엇을?`), ...body, el('div', { class: 'row' }, go, el('button', { class: 'ghost', on: { click: cancel } }, '취소'))));
    placeActs(); setTimeout(() => input.focus(), 50);
  } else {
    S.current = { kind: 'build' };
    show(el('h2', {}, `🏗️ ${n.name || TYPE_KO[n.type]} 증축`), ...body, el('div', { class: 'row' }, go, el('button', { class: 'ghost', on: { click: () => showBuilding(key) } }, '취소')));
  }
  const note = (tag, t) => { log.append(el('div', {}, el('b', {}, tag), t)); log.scrollTop = 1e9; };
  async function run() {
    const line = input.value.trim() || ideas[0]; err.textContent = ''; log.replaceChildren();
    if (bad(line)) { err.textContent = '그 표현으로는 지을 수 없어요.'; return; }
    if (!sample) { err.textContent = '이 화면에서는 Claude를 부를 수 없어요.'; return; }
    go.disabled = true; note('…', '설계 중'); const wv = inShop ? S.watching?.view : null; wv?.construct(.08);
    const steps = [];
    try {
      const rd = lineReader((st) => { steps.push(st); wv?.construct(Math.min(.9, .15 + steps.length * .1)); note(STEP_KO[st.step] ?? st.step, st.note || st.name || ''); });
      await sample(extendPrompt(line, p.b.input), { purpose: 'extend', modelTier: 'quick', cache: false, onText: ({ delta }) => rd.push(delta) }); rd.end();
      const next = applyExtension(p.b.input, steps); if (!next) throw { code: 'nothing' };
      // the shop as it is now (it may have moved, or the power gone elsewhere, while Claude wrote)
      const p1 = allPlots().find(x => x.key === key), mp = S.myDoc.plots[key];
      if (!p1?.b || !mp || !canWrite()) throw { code: 'gone' };
      if (shortOf(UTIL.floor) >= 0) throw { code: 'no_supply' };
      // keep what was bought: each fixture (and its level) goes to the nearest of its kind on its floor; ones with no place are refunded
      const newFx = buildSection(normalize(next)).fixtures, r = remapFixtures(fixturesOf(p1), newFx, [...ownedOf(p1)], levelsOf(p1)), own = new Set(r.own), refund = refundOf(r.lost);
      mp.b = { ...mp.b, at0: mp.b.at0 ?? mp.b.at, input: next, at: now(), ext: [...(mp.b.ext ?? []), line] }; mp.own = [...own]; mp.fx = own.size; mp.lv = r.lv; mp.lay = LAYOUT;
      if (refund) { S.myDoc.wallet.coins += refund; note('정리', `자리가 바뀐 가구 값 ${refund}동전을 돌려받았어요`); }
      wv?.construct(1); rebuild(); await save(true);
      const nn = normalize(next);
      note('완공', `${nn.levels}층 · 새 가구 ${newFx.length - own.size}개`);
      celebrate('🏗️ 증축 완공!', `${nn.name || TYPE_KO[nn.type]} ${nn.levels}층 · 새 자리를 채워 보세요`);
      setTimeout(() => { closePanel(); if (S.watching) closeInside(); openShop(key); setTimeout(() => S.watching?.view?.setFloor(nn.levels - 1), 400); }, 900);   // back in the shop, on the new floor
    } catch (e) { wv?.construct(null); if (e?.code === 'daily_limit') openDiaShop('limit'); err.textContent = e?.code === 'gone' ? '건물이 옮겨졌어요. 가게를 다시 열어 주세요.' : e?.code === 'no_supply' ? '전기나 물이 모자라요.' : failText(e, '증축하지 못했어요. 다시 눌러 주세요.'); go.disabled = false; }
  }
  go.onclick = run; input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
}
