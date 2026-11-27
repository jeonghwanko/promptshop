// The first visit: 끼룩이 walks a new owner through one whole loop, one step at a time,
// and through the inside of a shop the first time one is opened. The arrow points at a button or a spot on the map.
import { SLOTS, centerOf, neighbours } from '../v2/isles.js';
import { $, el } from './ui.js';
import { mountGuideGull } from '../ui/gull/guide-gull.js';
import { S, db, me, pr, nextBoat, canWrite, FROM, PICK, SHOWCASE, MAY_JOIN } from './state.js';
import { allPlots, nameOf } from './model.js';
import { save, track } from './persist.js';
import { START_COINS, INVITE_AT, levelOf } from './rules.js';
import { toScreen, scrollToSlot, applyZoom, chooseZoom } from './camera.js';
import { emptyNeighbours, newBoard } from './invite.js';

// The guide only talks: every step moves on when the thing it points at is done (no buttons in the bubble), so there is
// one place to press at a time — the faces and the bar at the bottom, or the map when it points there.
const TUT = [
  { say: '끼룩! 여기가 네 섬이야.\n아래 섬 사람 얼굴을 하나 눌러 봐!', el: '#wants .want', on: 'card' },
  { say: '어떤 가게일까?\n한 줄로 쓰거나 예시를 눌러 봐!', el: () => document.querySelector('#bsub button') ? '#bsub button' : '#wants .want', on: 'line' },
  { say: 'Claude가 짓는 중이야…\n허가증 🎫 한 장이 들어가! 끼룩', on: 'built' },
  { say: () => (S.myDoc?.wallet?.coins ?? 0) > START_COINS ? '완공! 부탁을 들어줘서 동전 +15!\n저기 봐, 배가 손님을 싣고 와!' : '완공! 🎉\n저기 봐, 배가 손님을 싣고 와!', on: 'coin', boat: true },
  { say: '첫 손님이야! 손님을 받을수록 🎫가 차.\n이제 가게를 눌러 봐. 안이 보여!', map: 'shop', on: 'inside' },
];
// inside a shop for the first time: how to read the flow and what a fixture buys. No buttons here either: a step that only
// explains moves on after `wait` ms, the one that asks for something moves on when it is done
const TUT_IN = [
  { say: '여기가 가게 안이야!\n손님이 들어와서 주문하고, 자리에 앉아서 계산해.', wait: 6000 },
  { say: () => S.watching?.view?.blocked?.size ? '빨간 김이 나는 곳이 막힌 곳이야.\n손님이 거기서 기다리고 있어!' : '지금은 막힌 곳이 없어.\n손님이 몰리면 막히는 곳에서 빨간 김이 나!', wait: 7000, at: 'slow' },
  { say: '반짝이는 버튼을 눌러\n가구를 들여 봐!', el: '#shopacts .act.buy', on: 'furnish' },
  { say: '쿵! 가구가 들어왔어.\n손님이 늘면 🎫 눈금이 빨리 차!', wait: 5000 },
];
const inStep = () => S.myDoc?.wallet?.tutIn ?? 99;
export const inTutOn = () => !!S.watching?.mine && inStep() < TUT_IN.length;
const setStep = (field, n) => { if (!canWrite()) return; if (n > (S.myDoc.wallet[field] ?? 0) && n < 99) gull?.cheer(); S.myDoc.wallet[field] = n; S.dirty = true; save(true); if (field === 'tut') track('tut', { step: n, v: 4 }); guide(); };
const say = (v) => typeof v === 'function' ? v() : v;

// before I have an island: choose one on the map. Invited: next to the friend who sent the link.
const inviter = () => FROM && S.owners.get(FROM);
const pickWords = () => { const by = inviter(); return by ? `${nameOf(by)} 옆 섬을 눌러!\n이웃이 되면 다리를 놓을 수 있어.` : '끼룩! 살 섬을 하나 골라 눌러 봐.'; };
export const picking = () => !S.mySlot && PICK === 'map' && !!db && !!me && S.scrolled && !SHOWCASE && MAY_JOIN;
/** The island the guide points at while choosing: one next to the inviter, else one with three neighbours, else any. */
export function pickSpot() {
  const free = (s) => !S.owners.has(s);
  if (S.pick && free(S.pick)) return S.pick;   // the one I tapped
  if (inviter()) { const n = neighbours(FROM).find(free); if (n) return n; }
  for (const s of [3, 8, 2, 4, 7, 9]) if (free(s)) return s;
  for (let s = 1; s <= SLOTS; s++) if (free(s)) return s;
  return 0;
}
export function tutInEvent(name) { if (inTutOn() && TUT_IN[inStep()].on === name) setStep('tutIn', inStep() + 1); }
const tutStep = () => S.myDoc?.wallet?.tut ?? 99;
export const tutOn = () => !!S.mySlot && tutStep() < TUT.length;
export function tutEvent(name) { if (name === 'invite' && S.inviteGuide) endInvite(); if (tutOn() && TUT[tutStep()].on === name) setStep('tut', tutStep() + 1); }
// Calling a friend is not part of the first session: once my island has grown (rules.js INVITE_AT), 끼룩이 points once at
// a free island next door. It goes when the invite card opens or after a while, and never comes back (wallet.invGuide).
let inviteT = 0;
function laterInvite() {
  const w = S.myDoc?.wallet; if (!w || !S.mySlot || w.invGuide || tutOn() || inTutOn() || S.watching || S.building || !canWrite()) return;
  if (levelOf(w.served ?? 0) < INVITE_AT.level || allPlots().filter(p => p.owner === me && p.b).length < INVITE_AT.shops || !emptyNeighbours().length) return;
  w.invGuide = 1; S.dirty = true; save(true); track('invite_guide', { slot: S.mySlot });
  S.inviteGuide = true; guide(); clearTimeout(inviteT); inviteT = setTimeout(endInvite, 25000);
}
function endInvite() { clearTimeout(inviteT); if (!S.inviteGuide) return; S.inviteGuide = false; guide(); }

let panned = -1, inAutoT = 0, inAutoK = -1;
/** Show the current step. */
export function guide() {
  const g = $('guide'); document.querySelectorAll('.glow').forEach(e => e.classList.remove('glow'));
  if (inTutOn()) {
    const st = TUT_IN[inStep()]; g.hidden = false; speak(typeof st.say === 'function' ? st.say() : st.say);
    $('gbtns').replaceChildren();
    if (st.wait && inAutoK !== inStep()) { const k = inAutoK = inStep(); clearTimeout(inAutoT); inAutoT = setTimeout(() => { if (inTutOn() && inStep() === k) setStep('tutIn', k + 1); }, st.wait); }
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
  if (S.inviteGuide) {   // the later moment: a friend next door (no buttons either; the island is what to press)
    g.hidden = false; speak('섬이 제법 커졌네!\n옆 빈 섬을 눌러 친구를 불러 봐. 다리를 놓을 수 있어!'); $('gbtns').replaceChildren();
    if (panned !== 'invite') { panned = 'invite'; const n = emptyNeighbours()[0]; if (n) setTimeout(() => { const z = chooseZoom(n); if (S.zoom > z) { S.zoom = z; applyZoom(); } scrollToSlot(n); }, 300); }
    return;
  }
  if (!tutOn()) { g.hidden = true; $('garrow').hidden = true; return; }
  const st = TUT[tutStep()]; g.hidden = false; speak(say(st.say));
  $('gbtns').replaceChildren();   // no buttons: the step moves on when its thing is done
  if (st.boat && S.mySlot) nextBoat.set(S.mySlot, 0);   // the first boat comes at once
}

// where the arrow points: an element on the page, or a spot on the map
let atElPt = null;
function guideArrow() {
  const a = $('garrow'); atElPt = null;
  // visible = has a box (offsetParent is null for fixed elements, like the island's button)
  const atEl = (sel) => { if (typeof sel === 'function') sel = sel(); const e = sel && document.querySelector(sel); if (!e || !e.getClientRects().length) return null; e.classList.add('glow'); const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top - 4]; };
  let pt = null;
  if (inTutOn()) {
    const st = TUT_IN[inStep()];
    document.querySelectorAll('.glow').forEach(e => e.classList.remove('glow'));
    if (st.at === 'slow') { const v = S.watching.view, i = [...(v.blocked ?? [])][0], f = i !== undefined && v.fx[i]; if (f && v.onFloor(f.y)) { const [x, y] = v.view.project(f.x, f.y + 1.4, f.z), r = v.top.getBoundingClientRect(); pt = [r.left + x * v.zoom, r.top + y * v.zoom]; } }
    pt = atEl(st.el) ?? pt;
  } else if (picking()) {   // the island to choose: over its name on the map (the words follow the inviter's name as it arrives)
    speak(pickWords());
    pt = atElPt = atEl('#joinbtn:not([hidden])'); pt ??= (() => { const s = pickSpot(); if (!s) return null; const [cx, cz] = centerOf(s), [x, y] = toScreen(...pr.P(cx - 4, cz - 4)); return [x, y - 34]; })();   // over the island's own 'live here' button
  } else if (S.inviteGuide) {   // the free island next door
    const n = emptyNeighbours()[0]; if (n) { const [cx, cz] = centerOf(n), [x, y] = toScreen(...pr.P(cx + .5, cz + .5)); pt = [x, y - 16]; }
  } else if (tutOn()) {
    const st = TUT[tutStep()];
    pt = atElPt = atEl(st.el);
    if (st.map === 'shop') { const p = allPlots().find(q => q.owner === me && q.b), tp = p && S.lastTops[p.key]; if (tp) { const [x, y] = toScreen(tp[0], tp[1]); pt = [x, y - 8]; } }
  }
  // a spot on the map that UI now covers (a panel, the cards): no arrow pointing at the panel instead
  if (pt && !inTutOn() && pt !== atElPt) { const hit = document.elementFromPoint(pt[0], Math.min(innerHeight - 1, pt[1] + 24)); if (hit && hit.id !== 'map' && !hit.closest('#mapbox')) pt = null; }
  // 끼룩이 holds a wing toward what the arrow points at — only when it is above its head: lower to the right the wing
  // would cover its own speech bubble, so there it just talks
  { const b = document.querySelector('#guide .gbird')?.getBoundingClientRect(); gull?.point(pt && b && pt[1] < b.top + b.height * .2 ? pt : null); }
  if (!pt) { a.hidden = true; return; }
  a.hidden = false; a.style.left = pt[0] + 'px'; a.style.top = pt[1] + 'px';
}
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
  setInterval(guideArrow, 120); setInterval(laterInvite, 2000);
}
