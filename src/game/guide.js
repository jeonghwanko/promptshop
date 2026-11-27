// The first visit: 끼룩이 walks a new owner through one whole loop, one step at a time,
// and through the inside of a shop the first time one is opened. The arrow points at a button or a spot on the map.
import { SLOTS, centerOf, placePlot, PLOT, neighbours } from '../v2/isles.js';
import { $, el } from './ui.js';
import { mountGuideGull } from '../ui/gull/guide-gull.js';
import { S, db, me, pr, nextBoat, canWrite, FROM, PICK, SHOWCASE, MAY_JOIN } from './state.js';
import { allPlots, takenSet, nameOf } from './model.js';
import { save, track } from './persist.js';
import { toScreen, scrollToSlot, applyZoom } from './camera.js';
import { emptyNeighbours, newBoard } from './invite.js';

const TUT = [
  { say: '끼룩! 여기가 네 섬이야.\n섬 사람들이 첫 가게를 기다리고 있어!', btn: '좋아!' },
  { say: '허가증 🎫이 한 장 있어.\n아래 [짓기]를 눌러 봐!', el: '#d-build', on: 'cards' },
  { say: '섬 사람들 부탁이야.\n마음에 드는 카드를 하나 골라!', el: '#d-build', on: 'card' },   // the arrow shows only while the cards are put away
  { say: '반짝이는 땅을 눌러!\n거기에 지을 거야.', map: 'spot', on: 'place' },
  { say: '어떤 가게일까?\n한 줄로 쓰거나, 아래 예시를 눌러 봐.', el: '#signcard .chips', on: 'line' },
  { say: 'Claude가 짓는 중이야…\n건물이 올라가는 거 봐! 끼룩', on: 'built' },
  { say: '완공! 🎉\n저기 봐, 배가 손님을 싣고 와!', on: 'coin', boat: true },
  { say: '첫 수입이야! 동전이 쌓였지?\n이제 가게를 눌러 봐. 안이 보여!', map: 'shop', on: 'inside' },
  // the last step: a friend next door, so the first session ends on the bridge (the card that opens has the link)
  { say: () => emptyNeighbours().length ? '잘했어! 🎫이 다 차면 또 지을 수 있어.\n옆 섬이 비었네. 친구를 불러 다리를 놓자!' : '잘했어! 손님을 받을수록 🎫 게이지가 차.\n다 차면 또 지을 수 있어. 섬을 키워 보자!',
    btn: () => emptyNeighbours().length ? '나중에' : '시작!', map: 'invite', on: 'invite' },
];
// inside a shop for the first time: how to read the flow and what a fixture buys
const TUT_IN = [
  { say: '여기가 가게 안이야!\n손님이 들어와서 주문하고, 자리에 앉아서 계산해.', btn: '다음' },
  { say: () => S.watching?.view?.blocked?.size ? '빨간 김이 나는 곳이 막힌 곳이야.\n손님이 거기서 기다리고 있어!' : '지금은 막힌 곳이 없어.\n손님이 몰리면 막히는 곳에서 빨간 김이 나!', btn: '다음', at: 'slow' },
  { say: '반짝이는 버튼을 눌러\n가구를 들여 봐!', el: '#shopacts .act.buy', on: 'furnish' },
  { say: '쿵! 가구가 들어왔어.\n가구가 늘면 손님을 더 받고, 손님이 늘면 🎫도 빨리 차!', btn: '알겠어' },
];
const inStep = () => S.myDoc?.wallet?.tutIn ?? 99;
export const inTutOn = () => !!S.watching?.mine && inStep() < TUT_IN.length;
const setStep = (field, n) => { if (!canWrite()) return; if (n > (S.myDoc.wallet[field] ?? 0) && n < 99) gull?.cheer(); S.myDoc.wallet[field] = n; S.dirty = true; save(true); if (field === 'tut') track('tut', { step: n }); guide(); };
const say = (v) => typeof v === 'function' ? v() : v;

// before I have an island: choose one on the map. Invited: next to the friend who sent the link.
const inviter = () => FROM && S.owners.get(FROM);
const pickWords = () => { const by = inviter(); return by ? `${nameOf(by)} 옆 섬을 눌러!\n이웃이 되면 다리를 놓을 수 있어.` : '끼룩! 살 섬을 하나 골라 눌러 봐.'; };
export const picking = () => !S.mySlot && PICK === 'map' && !!db && !!me && S.scrolled && !SHOWCASE && MAY_JOIN;
/** The island the guide points at while choosing: one next to the inviter, else one with three neighbours, else any. */
export function pickSpot() {
  const free = (s) => !S.owners.has(s);
  if (inviter()) { const n = neighbours(FROM).find(free); if (n) return n; }
  for (const s of [3, 8, 2, 4, 7, 9]) if (free(s)) return s;
  for (let s = 1; s <= SLOTS; s++) if (free(s)) return s;
  return 0;
}
export function tutInEvent(name) { if (inTutOn() && TUT_IN[inStep()].on === name) setStep('tutIn', inStep() + 1); }
const tutStep = () => S.myDoc?.wallet?.tut ?? 99;
export const tutOn = () => !!S.mySlot && tutStep() < TUT.length;
export function tutEvent(name) { if (tutOn() && TUT[tutStep()].on === name) setStep('tut', tutStep() + 1); }

let panned = -1;
/** Show the current step. */
export function guide() {
  const g = $('guide'); document.querySelectorAll('.glow').forEach(e => e.classList.remove('glow'));
  if (inTutOn()) {
    const st = TUT_IN[inStep()]; g.hidden = false; speak(typeof st.say === 'function' ? st.say() : st.say);
    $('gbtns').replaceChildren(...[st.btn ? el('button', { class: 'gold', on: { click: () => setStep('tutIn', inStep() + 1) } }, st.btn) : null,
      el('button', { class: 'skip', on: { click: () => setStep('tutIn', 99) } }, '건너뛰기')].filter(Boolean));
    return;
  }
  if (SHOWCASE || (!S.mySlot && !MAY_JOIN && S.scrolled)) {   // the showcase, or a private board I was not invited to: look around, then make my own
    g.hidden = false; speak(SHOWCASE ? '끼룩! 여기는 구경하는 군도야.\n내 군도를 세우고 친구들을 불러 봐!' : '끼룩! 여긴 초대받은 친구들의 군도야.\n내 군도를 세우고 친구들을 불러 봐!');
    $('gbtns').replaceChildren(el('button', { class: 'gold', on: { click: (e) => { e.currentTarget.disabled = true; newBoard(); } } }, '내 군도 세우기'));
    return;
  }
  if (picking()) {
    g.hidden = !pickSpot(); speak(pickWords()); $('gbtns').replaceChildren();
    return;
  }
  if (!tutOn()) { g.hidden = true; $('garrow').hidden = true; return; }
  const st = TUT[tutStep()]; g.hidden = false; speak(say(st.say));
  if (st.map === 'invite' && panned !== tutStep()) { panned = tutStep(); const n = emptyNeighbours()[0]; if (n) setTimeout(() => { if (S.zoom > 1) { S.zoom = 1; applyZoom(); } scrollToSlot(n); }, 300); }   // once, as the step starts; near enough to see my island too
  $('gbtns').replaceChildren(...[st.btn ? el('button', { class: 'gold', on: { click: () => setStep('tut', tutStep() + 1) } }, say(st.btn)) : null,
    tutStep() < TUT.length - 1 ? el('button', { class: 'skip', on: { click: () => setStep('tut', 99) } }, '건너뛰기') : null].filter(Boolean));
  if (st.boat && S.mySlot) nextBoat.set(S.mySlot, 0);   // the first boat comes at once
}

// where the arrow points: an element on the page, or a spot on the map
let atElPt = null;
function guideArrow() {
  const a = $('garrow'); atElPt = null;
  const atEl = (sel) => { const e = sel && document.querySelector(sel); if (!e || !e.offsetParent) return null; e.classList.add('glow'); const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top - 4]; };
  let pt = null;
  if (inTutOn()) {
    const st = TUT_IN[inStep()];
    document.querySelectorAll('.glow').forEach(e => e.classList.remove('glow'));
    if (st.at === 'slow') { const v = S.watching.view, i = [...(v.blocked ?? [])][0], f = i !== undefined && v.fx[i]; if (f && v.onFloor(f.y)) { const [x, y] = v.view.project(f.x, f.y + 1.4, f.z), r = v.top.getBoundingClientRect(); pt = [r.left + x * v.zoom, r.top + y * v.zoom]; } }
    pt = atEl(st.el) ?? pt;
  } else if (picking()) {   // the island to choose: over its name on the map (the words follow the inviter's name as it arrives)
    speak(pickWords());
    const s = pickSpot(); if (s) { const [cx, cz] = centerOf(s), [x, y] = toScreen(...pr.P(cx - 4, cz - 4)); pt = [x, y - 34]; }
  } else if (tutOn()) {
    const st = TUT[tutStep()], n = PLOT[S.size];
    pt = atElPt = atEl(st.el);
    if (st.map === 'spot' && S.buildMode) {
      if (!S.tutSpot) { const [cx, cz] = centerOf(S.mySlot), taken = takenSet();
        for (let d = 1; d < 6 && !S.tutSpot; d++) for (const [dx, dz] of [[1, 1], [-n, 1], [1, -n], [-n, -n]]) { const door = placePlot(S.world, S.mySlot, cx + dx * d, cz + dz * d, n, taken); if (door) { S.tutSpot = { x: cx + dx * d, z: cz + dz * d, door }; break; } } }
      if (S.tutSpot) { const [x, y] = toScreen(...pr.P(S.tutSpot.x + n / 2, S.tutSpot.z + n / 2)); pt = [x, y - 10]; }
    }
    if (st.map === 'invite') { const n = emptyNeighbours()[0]; if (n) { const [cx, cz] = centerOf(n), [x, y] = toScreen(...pr.P(cx + .5, cz + .5)); pt = [x, y - 16]; } }
    if (st.map === 'shop') { const p = allPlots().find(q => q.owner === me && q.b), tp = p && S.lastTops[p.key]; if (tp) { const [x, y] = toScreen(tp[0], tp[1]); pt = [x, y - 8]; } }
  }
  // a spot on the map that UI now covers (a panel, the cards): no arrow pointing at the panel instead
  if (pt && !inTutOn() && !(tutOn() && TUT[tutStep()].el && pt === atElPt)) { const hit = document.elementFromPoint(pt[0], Math.min(innerHeight - 1, pt[1] + 24)); if (hit && hit.id !== 'map' && !hit.closest('#mapbox')) pt = null; }
  // 끼룩이 holds a wing toward what the arrow points at — only when it is above its head: lower to the right the wing
  // would cover its own speech bubble, so there it just talks
  { const b = document.querySelector('#guide .gbird')?.getBoundingClientRect(); gull?.point(pt && b && pt[1] < b.top + b.height * .2 ? pt : null); }
  if (!pt) { a.hidden = true; return; }
  a.hidden = false; a.style.left = pt[0] + 'px'; a.style.top = pt[1] + 'px';
}
/** The spot the guide makes glow on the map while it asks for a place to build. */
export const tutGlowSpot = () => S.tutSpot && S.buildMode && tutOn() && TUT[tutStep()].map === 'spot' ? S.tutSpot : null;
// ---------- 끼룩이 and its words: the line types itself out while the beak moves; a tap on the bubble shows it all ----------
let gull = null, spoken = null, typing = null;
let foldT = 0;
/** Fold the bubble to just the gull (and the arrow) once the words have been read, on a step that waits for something done on the map.
 *  A tap on the gull, or the next step, opens it again. */
function fold(on) { clearTimeout(foldT); $('guide').classList.toggle('min', on); }
function speak(text) {
  if (text === spoken) return; spoken = text; fold(false);
  const box = $('gtext'), btns = $('gbtns'); clearInterval(typing);
  box.textContent = text; btns.classList.add('wait');
  const bub = box.closest('.gbub'); bub.classList.remove('bump'); void bub.offsetWidth; bub.classList.add('bump');
  setTimeout(() => {   // after the emoji have turned into pixel icons: every letter and icon becomes a piece shown in turn
    if (spoken !== text) return;
    const parts = [];
    for (const n of [...box.childNodes]) {
      if (n.nodeType === 3) { const frag = document.createDocumentFragment(); for (const ch of n.data) { const sp = document.createElement('span'); sp.textContent = ch; sp.className = 'tw'; frag.append(sp); if (ch.trim()) parts.push(sp); else sp.classList.add('on'); } n.replaceWith(frag); }
      else { n.classList?.add('tw'); parts.push(n); }
    }
    let i = 0; gull?.talk(true);
    const done = () => { clearInterval(typing); typing = null; for (const q of parts) q.classList.add('on'); gull?.talk(false); btns.classList.remove('wait');
      if (!btns.querySelector('.gold')) { clearTimeout(foldT); foldT = setTimeout(() => { if (spoken === text) fold(true); }, 6000); } };
    typing = setInterval(() => { if (i >= parts.length) return done(); parts[i++].classList.add('on'); }, 34);
    bub.onclick = (e) => { if (typing && !e.target.closest('button')) done(); };
  }, 0);
}
export function initGuide() {
  gull = mountGuideGull(document.querySelector('#guide .gbird'));
  document.querySelector('#guide .gbird').addEventListener('click', () => fold(false));
  setInterval(guideArrow, 120);
}
