// The first visit: 끼룩이 walks a new owner through one whole loop, one step at a time,
// and through the inside of a shop the first time one is opened. The arrow points at a button or a spot on the map.
import { centerOf, placePlot, PLOT } from '../v2/isles.js';
import { $, el } from './ui.js';
import { S, me, pr, nextBoat } from './state.js';
import { allPlots, takenSet } from './model.js';
import { save } from './persist.js';
import { toScreen } from './camera.js';

export const TUT = [
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
  { say: () => S.watching?.view?.blocked?.size ? '빨간 김이 나는 곳이 막힌 곳이야.\n손님이 거기서 기다리고 있어!' : '지금은 막힌 곳이 없어.\n손님이 몰리면 막히는 곳에서 빨간 김이 나!', btn: '다음', at: 'slow' },
  { say: '오른쪽 맨 위 버튼을 눌러\n가구를 들여 봐!', el: '#shopacts .act.buy', on: 'furnish' },
  { say: '쿵! 가구가 들어왔어.\n가구가 늘면 손님을 더 받고, 손님이 늘면 🎫도 빨리 차!', btn: '알겠어' },
];
const inStep = () => S.myDoc?.wallet?.tutIn ?? 99;
export const inTutOn = () => !!S.watching?.mine && inStep() < TUT_IN.length;
const setStep = (field, n) => { S.myDoc.wallet[field] = n; S.dirty = true; save(true); guide(); };
export function tutInEvent(name) { if (inTutOn() && TUT_IN[inStep()].on === name) setStep('tutIn', inStep() + 1); }
export const tutStep = () => S.myDoc?.wallet?.tut ?? 99;
export const tutOn = () => !!S.mySlot && tutStep() < TUT.length;
export function tutEvent(name) { if (tutOn() && TUT[tutStep()].on === name) setStep('tut', tutStep() + 1); }

/** Show the current step. */
export function guide() {
  const g = $('guide'); document.querySelectorAll('.glow').forEach(e => e.classList.remove('glow'));
  if (inTutOn()) {
    const st = TUT_IN[inStep()]; g.hidden = false; $('gtext').textContent = typeof st.say === 'function' ? st.say() : st.say;
    $('gbtns').replaceChildren(...[st.btn ? el('button', { class: 'gold', on: { click: () => setStep('tutIn', inStep() + 1) } }, st.btn) : null,
      el('button', { class: 'skip', on: { click: () => setStep('tutIn', 99) } }, '건너뛰기')].filter(Boolean));
    return;
  }
  if (!tutOn()) { g.hidden = true; $('garrow').hidden = true; return; }
  const st = TUT[tutStep()]; g.hidden = false; $('gtext').textContent = st.say;
  $('gbtns').replaceChildren(...[st.btn ? el('button', { class: 'gold', on: { click: () => setStep('tut', tutStep() + 1) } }, st.btn) : null,
    tutStep() < TUT.length - 1 ? el('button', { class: 'skip', on: { click: () => setStep('tut', 99) } }, '건너뛰기') : null].filter(Boolean));
  if (st.boat && S.mySlot) nextBoat.set(S.mySlot, 0);   // the first boat comes at once
}

// where the arrow points: an element on the page, or a spot on the map
function guideArrow() {
  const a = $('garrow');
  const atEl = (sel) => { const e = sel && document.querySelector(sel); if (!e || !e.offsetParent) return null; e.classList.add('glow'); const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top - 4]; };
  let pt = null;
  if (inTutOn()) {
    const st = TUT_IN[inStep()];
    document.querySelectorAll('.glow').forEach(e => e.classList.remove('glow'));
    if (st.at === 'slow') { const v = S.watching.view, i = [...(v.blocked ?? [])][0], f = i !== undefined && v.fx[i]; if (f && v.onFloor(f.y)) { const [x, y] = v.view.project(f.x, f.y + 1.4, f.z), r = v.top.getBoundingClientRect(); pt = [r.left + x * v.zoom, r.top + y * v.zoom]; } }
    pt = atEl(st.el) ?? pt;
  } else if (tutOn()) {
    const st = TUT[tutStep()], n = PLOT[S.size];
    pt = atEl(st.el);
    if (st.map === 'spot' && S.buildMode) {
      if (!S.tutSpot) { const [cx, cz] = centerOf(S.mySlot), taken = takenSet();
        for (let d = 1; d < 6 && !S.tutSpot; d++) for (const [dx, dz] of [[1, 1], [-n, 1], [1, -n], [-n, -n]]) { const door = placePlot(S.world, S.mySlot, cx + dx * d, cz + dz * d, n, taken); if (door) { S.tutSpot = { x: cx + dx * d, z: cz + dz * d, door }; break; } } }
      if (S.tutSpot) { const [x, y] = toScreen(...pr.P(S.tutSpot.x + n / 2, S.tutSpot.z + n / 2)); pt = [x, y - 10]; }
    }
    if (st.map === 'shop') { const p = allPlots().find(q => q.owner === me && q.b), tp = p && S.lastTops[p.key]; if (tp) { const [x, y] = toScreen(tp[0], tp[1]); pt = [x, y - 8]; } }
  }
  if (!pt) { a.hidden = true; return; }
  a.hidden = false; a.style.left = pt[0] + 'px'; a.style.top = pt[1] + 'px';
}
/** The spot the guide makes glow on the map while it asks for a place to build. */
export const tutGlowSpot = () => S.tutSpot && S.buildMode && tutOn() && TUT[tutStep()].map === 'spot' ? S.tutSpot : null;
export function initGuide() { setInterval(guideArrow, 120); }
