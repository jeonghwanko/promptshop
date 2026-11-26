// Building: the request cards, build mode (a size and a spot), the signboard where the line is written,
// Claude streaming the building part by part, and extending a shop by one floor.
import { lineReader } from '../steps.js';
import { Stage2 } from '../v2/stage.js';
import { emptyBuilding, applyStep, buildPrompt, extendPrompt, applyExtension } from '../v2/steps.js';
import { check, missingParts, revisePrompt } from '../v2/check.js';
import { normalize } from '../v2/spec.js';
import { TYPE_KO } from '../v2/catalog.js';
import { PLOT, dockOf } from '../v2/isles.js';
import { buildSection, LAYOUT, remapFixtures } from '../v2/interior.js';
import { NEEDS, NEED_KEYS, roleOf, typesFor } from '../v2/townsim.js';
import { startingFixtures } from '../v2/insideview.js';
import { iconEl } from '../ui/icons.js';
import { START_STOCK, REQ_BONUS, LEVELS, levelOf, sizesOpen, bad } from './rules.js';
import { refundOf } from './migrate.js';
import { $, el, xbtn } from './ui.js';
import { S, me, sample, pr, sim, now } from './state.js';
import { maxPlots, allPlots, fixturesOf, ownedOf, levelsOf, servesOf, G, rebuild } from './model.js';
import { site } from './mapfx.js';
import { save } from './persist.js';
import { scrollToSlot, toScreen } from './camera.js';
import { toast, celebrate } from './hud.js';
import { tutEvent } from './guide.js';
import { show, showHome, closePanel, showBuilding } from './panel.js';
import { openShop, closeInside, renderActs, placeActs } from './shop.js';

// what the island asks for, by kind of guest
const REQ = {
  food: { ko: '배고파요', sub: '식당 · 포장마차', icon: '🍜', en: 'a place to eat', ex: ['할머니 국밥집', '골목 포장마차', '바다 보이는 횟집'] },
  cafe: { ko: '커피 한잔 하고 싶어요', sub: '카페 · 빵집 · 노점', icon: '☕', en: 'coffee and snacks', ex: ['창가 자리 많은 카페', '아침마다 줄 서는 빵집', '붕어빵 노점'] },
  shop: { ko: '살 게 있어요', sub: '가게 · 볼일', icon: '🛍️', en: 'a shop or an errand', ex: ['24시간 편의점', '작은 약국', '바닷가 우체국'] },
  fun: { ko: '놀 데가 없어요', sub: '놀거리 · 구경거리', icon: '🎳', en: 'something fun to do', ex: ['레트로 볼링장', '작은 영화관', '등대 전망대'] },
  rest: { ko: '쉴 곳이 필요해요', sub: '숙소 · 쉼터', icon: '🛏️', en: 'a place to stay and rest', ex: ['바닷가 게스트하우스', '작은 모텔', '조용한 산사'] },
};
const SUGGEST = { S: ['24시간 편의점', '작은 2층 단독주택', '붕어빵 노점'], M: ['동네 빵집', '할머니 분식집', '네온사인 PC방'], L: ['12층 아파트', '레트로 볼링장', '작은 기차역'] };
const EXT_IDEAS = { food: ['2층에 창가 자리', '루프탑 테라스', '주방 넓히기'], cafe: ['2층 다락 좌석', '루프탑 테라스', '빵 굽는 주방 늘리기'], shop: ['2층 매장 넓히기', '계산대 늘리기', '창고 한 층'], fun: ['2층 관람석', '놀이방 한 층', '휴게실'], rest: ['객실 한 층 더', '루프탑 라운지', '스파 층'] };
const STEP_KO = { building: '건물', main: '본관', mass: '덩어리', sign: '간판', hero: '대표', prop: '소품', floor: '층', fixture: '가구', order: '순서' };
const failText = (e, msg) => e?.code === 'rate_limited' ? '잠깐 쉬었다가 다시 눌러 주세요.' : e?.code === 'not_granted' ? 'Claude 사용을 허락해야 지을 수 있어요.' : msg;

export const buildHint = () => `${S.card?.need ? REQ[S.card.need].icon + ' ' + REQ[S.card.need].sub : '✏️ 마음대로'} · ${S.size}`;
export function setBuildMode(on) {
  S.buildMode = on && !!S.mySlot; $('d-build').classList.toggle('on', S.buildMode); $('d-build').querySelector('.lb').textContent = S.buildMode ? '그만' : '짓기'; $('sizes').hidden = !S.buildMode; S.hover = null;
  if (S.buildMode) { const open = sizesOpen(levelOf(G().served)); if (!open.includes(S.size)) S.size = 'S';
    $('sizes').replaceChildren(...Object.keys(PLOT).map(k => { const ok = open.includes(k); return el('button', { class: k === S.size ? 'on' : '', on: { click: () => { if (!ok) return toast(`${k} 크기는 ${LEVELS.find(l => l.size === k).name}부터 지을 수 있어요`, 1800); S.size = k; setBuildMode(true); } } }, ok ? k : `🔒 ${k}`); })); toast(buildHint()); scrollToSlot(S.mySlot); }
  else toast('');
}

// ---------- request cards: what the island wants, dealt when there is a permit to spend ----------
export function openCards() {
  const w = G();
  if (w.permits <= 0) return toast(`손님 ${w.nextAt - w.served}명을 더 받으면 허가증이 나와요 🎫`, 2400);
  if (Object.keys(S.myDoc.plots).length >= maxPlots()) return toast(`섬에는 ${maxPlots()}채까지 지을 수 있어요`, 2000);
  // the two wants that most need a place: people waiting for it, and more so when my island has none
  const dm = sim.demand(), have = new Set(allPlots().filter(p => p.owner === me && p.b).map(servesOf));
  const score = (k) => dm[k].waiting + (have.has(k) ? 0 : 4) + Math.random() * 2;
  const picks = [...NEED_KEYS].sort((a, b) => score(b) - score(a)).slice(0, 2);
  const box = $('cards');
  const deal = (need, i) => {
    const r = need ? REQ[need] : null, wait = need ? dm[need].waiting : 0;
    const c = el('button', { class: 'rcard' + (need ? '' : ' free'), on: { click: () => { S.card = { need }; box.hidden = true; setBuildMode(true); tutEvent('card'); } } },
      el('span', { class: 'big' }, r ? r.icon : '✏️'), el('b', {}, r ? `“${r.ko}”` : '마음대로'), el('small', {}, r ? r.sub : '무엇이든 한 줄로'),
      r ? el('span', { class: 'need' }, iconEl('people', 20, ''), wait ? `${wait}명 기다림` : have.has(need) ? '더 원해요' : '섬에 없음') : null,
      r ? el('span', { class: 'prize' }, iconEl('coin', 18, ''), `+${REQ_BONUS} · 손님 무리`) : el('span', { class: 'prize' }, '보너스 없음'));
    c.style.animationDelay = i * 90 + 'ms'; return c;
  };
  box.replaceChildren(el('h2', {}, iconEl('ticket', 36, ''), `${w.permits} · 무엇을 지을까?`), el('div', { class: 'row3' }, ...picks.map(deal), deal(null, 2)),
    el('button', { class: 'ghost', on: { click: () => { box.hidden = true; } } }, '나중에'));
  box.hidden = false; tutEvent('cards');
}

/** The signboard sits above its spot, wherever the map is scrolled. */
export function placeSign() {
  const c = document.querySelector('.signcard'); if (!c) return; const [x, z] = JSON.parse(c.dataset.at), [sx, sy] = toScreen(...pr.P(x, z)), w = c.offsetWidth, h = c.offsetHeight;
  c.style.left = Math.max(8, Math.min(innerWidth - w - 8, sx - w / 2)) + 'px'; c.style.top = Math.max(70, Math.min(innerHeight - h - 120, sy - h - 70)) + 'px';
}
/** Shrink a building's masses until they fit an n×n plot. */
function fitToLot(input, n) {
  input.scale = Object.keys(PLOT).find(k => PLOT[k] === n);
  const s = normalize(input), m = s.masses.find(x => x.at === 'main') ?? s.masses[0];
  let w = m.size[0], d = m.size[1];
  for (const x of s.masses) { if (x === m) continue; if (x.at === 'left' || x.at === 'right') w += x.size[0]; if (x.at === 'back' || x.at === 'front') d += x.size[1]; }
  const k = Math.min(1, (n - .4) / w, (n - .7) / d);
  if (k < 1) { input.size = [m.size[0] * k, m.size[1] * k]; for (const x of input.masses ?? []) if (Array.isArray(x.size)) x.size = [x.size[0] * k, x.size[1] * k]; }
}
/** Stake the spot, ask for the line on a signboard above it, and let Claude build there. */
export function startBuild(x, z, door) {
  const { myDoc, mySlot } = S;
  if (Object.keys(myDoc.plots).length >= maxPlots()) return showHome(`내 섬에는 ${maxPlots()}채까지 지을 수 있어요.`);
  if (G().permits <= 0) return toast('허가증이 없어요', 1800);
  const sz = S.size, n = PLOT[sz], need = S.card?.need ?? null, req = need ? REQ[need] : null; S.tutSpot = null; setTimeout(() => tutEvent('place'), 0);
  const ideas = req ? req.ex : SUGGEST[sz], input = el('input', { type: 'text', id: 'line', maxlength: '80', placeholder: '예: ' + ideas[0] });
  const go = el('button', {}, '여기에 짓기'), err = el('div', { class: 'err' }), log = el('div', { class: 'log' });
  // the spot is staked: dust where it lands, a stake with a sign, and the line is written on a signboard right above it
  closePanel(); S.current = { kind: 'build' }; site.done = { x, z, size: sz, t: 0 }; site.pending = { x, z, size: sz };
  document.querySelector('.signcard')?.remove();
  const cancel = () => { if (S.building) return; card0.remove(); site.pending = null; S.current = null; };
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
    const b = emptyBuilding(), stage = new Stage2({ width: 420, height: 400, lift: .82 }); S.building = { x, z, size: sz, stage };
    note('…', '구상 중');
    const seen = []; let raw = '', broken = 0;
    const apply = (s) => { if (s.step === 'floor' && s.replace && b.input) b.input.floors = []; const ch = applyStep(b, s); if (!ch) return; seen.push(s);
      if (ch.view === 'ext') { fitToLot(b.input, n); stage.show(b.input, ch.key); } note(STEP_KO[s.step] ?? s.step, s.note || s.type || ''); };
    try {
      const rd = lineReader(apply, () => broken++);
      await sample(buildPrompt(line, { lot: { size: sz, w: n, d: n }, place: `an island village of friends (island ${mySlot})`, request: need ? { en: req.en, types: typesFor(need) } : null }), { modelTier: 'quick', cache: false, onText: ({ delta }) => { raw += delta; rd.push(delta); } }); rd.end();
      const c = check(b.input, { broken, line }); for (const f of c.fixed) note('수선', f);
      const problems = [...c.ask, ...missingParts(seen).filter(q => q === 'building').map(q => `The "${q}" line is missing.`)];
      if (problems.length) { note('다시', `남은 문제 ${problems.length}개`); let first = true; const rd2 = lineReader(s => { if (s.step === 'floor' && first) { s.replace = true; first = false; } apply(s); });
        await sample(revisePrompt(line, raw, problems), { modelTier: 'quick', cache: false, onText: ({ delta }) => rd2.push(delta) }); rd2.end(); check(b.input, { line }); }
      if (!b.input) throw { code: 'nothing' };
      fitToLot(b.input, n); const s = normalize(b.input);
      if (bad(s.name)) { err.textContent = '그 이름으로는 세울 수 없어요.'; S.building = null; go.disabled = false; return; }
      const key = `${mySlot}_${x}_${z}`;
      G().permits--;
      const own = startingFixtures(buildSection(normalize(b.input)).fixtures, b.input.order);
      S.myDoc.plots = { ...S.myDoc.plots, [key]: { x, z, size: sz, door, stock: START_STOCK, own, fx: own.length, lay: LAYOUT, b: { input: JSON.parse(JSON.stringify(b.input)), line, at: now() } } };
      site.done = { x, z, size: sz, t: 0 }; S.building = null;
      // a request answered: a bonus, and a crowd that wanted exactly this comes off the next boat
      const role = roleOf(s.type, s.levels), answered = need && role.serves === need;
      if (answered) { S.myDoc.wallet.coins += REQ_BONUS; const d = dockOf(mySlot); for (let k = 0; k < 6; k++) sim.spawn(d.road, 1 + k * .45, need, d.road); setTimeout(() => celebrate('요청 해결!', `+${REQ_BONUS}동전 · 손님들이 몰려와요`), 400); }
      else setTimeout(() => celebrate('완공!', s.name || TYPE_KO[s.type] || '새 건물'), 400);
      S.card = null; tutEvent('built');
      rebuild(); await save(true);
      note('완성', `${s.name || TYPE_KO[s.type]} · ${s.levels}층${role.serves ? ' — ' + NEEDS[role.serves].ko + '을(를) 채워요' : ''}${role.source ? ` · 사람 +${role.source}` : ''}`);
      site.pending = null; setTimeout(() => { card0.remove(); if (S.current?.kind === 'build') S.current = null; }, 1800);
    } catch (e) { S.building = null; card0.classList.remove('busy'); err.textContent = failText(e, '짓지 못했어요. 다시 눌러 주세요.'); }
    go.disabled = false;
  }
  go.onclick = build; input.addEventListener('keydown', e => { if (e.key === 'Enter') build(); });
}

// ---------- extension: one more floor on top of a full shop, from one line ----------
/** inShop: the form takes the place of the open shop's buttons; otherwise it opens in the panel. */
export function startExtend(key, { inShop = false } = {}) {
  const p = allPlots().find(x => x.key === key); if (!p?.b || p.owner !== me) return;
  if (G().permits <= 0) return toast(`허가증이 있어야 증축해요 · 다음까지 손님 ${G().nextAt - G().served}명`, 2200);
  const n = normalize(p.b.input), ideas = EXT_IDEAS[servesOf(p)] ?? ['한 층 더 올리기', '루프탑 테라스', '2층 휴게실'];
  const input = el('input', { type: 'text', maxlength: '60', placeholder: '예: ' + ideas[0] }), go = el('button', { class: 'gold' }, `${n.levels + 1}층 올리기 · 🎫1`), err = el('div', { class: 'err' }), log = el('div', { class: 'log' });
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
      await sample(extendPrompt(line, p.b.input), { modelTier: 'quick', cache: false, onText: ({ delta }) => rd.push(delta) }); rd.end();
      const next = applyExtension(p.b.input, steps); if (!next) throw { code: 'nothing' };
      // keep what was bought: each fixture (and its level) goes to the nearest of its kind on its floor; ones with no place are refunded
      const newFx = buildSection(normalize(next)).fixtures, r = remapFixtures(fixturesOf(p), newFx, [...ownedOf(p)], levelsOf(p)), own = new Set(r.own), refund = refundOf(r.lost);
      if (refund) { S.myDoc.wallet.coins += refund; note('정리', `자리가 바뀐 가구 값 ${refund}동전을 돌려받았어요`); }
      const mp = S.myDoc.plots[key]; mp.b = { ...mp.b, input: next, at: now(), ext: [...(mp.b.ext ?? []), line] }; mp.own = [...own]; mp.fx = own.size; mp.lv = r.lv; mp.lay = LAYOUT;
      wv?.construct(1); G().permits--; rebuild(); await save(true);
      const nn = normalize(next);
      note('완공', `${nn.levels}층 · 새 가구 ${newFx.length - own.size}개`);
      celebrate('🏗️ 증축 완공!', `${nn.name || TYPE_KO[nn.type]} ${nn.levels}층 · 새 자리를 채워 보세요`);
      setTimeout(() => { closePanel(); if (S.watching) closeInside(); openShop(key); setTimeout(() => S.watching?.view?.setFloor(nn.levels - 1), 400); }, 900);   // back in the shop, on the new floor
    } catch (e) { wv?.construct(null); err.textContent = failText(e, '증축하지 못했어요. 다시 눌러 주세요.'); go.disabled = false; }
  }
  go.onclick = run; input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
}
