// The first visit: 끼룩이 walks a new owner through one whole loop, one step at a time,
// and through the inside of a shop the first time one is opened. The arrow points at a button or a spot on the map.
import { SLOTS, centerOf, neighbours, PLOT } from '../v2/isles.js';
import { suggestSpot } from './build.js';
import { $, el } from './ui.js';
import { mountThumbGull } from '../ui/gull/thumb.js';
import { S, db, me, pr, nextBoat, canWrite, FROM, PICK, SHOWCASE, MAY_JOIN } from './state.js';
import { allPlots, nameOf, plantTiles } from './model.js';
import { save, track } from './persist.js';
import { INVITE_AT, levelOf } from './rules.js';
import { toScreen, scrollToSlot, applyZoom, chooseZoom } from './camera.js';
import { emptyNeighbours, newBoard, myBoards, goBoard, boardLabel } from './invite.js';

// The guide only talks: every step moves on when the thing it points at is done (no buttons in the bubble), so there is
// one place to press at a time — the faces and the bar at the bottom, or the map when it points there.
// the guest's wish, said back when the bar opens for it
const WISH = { food: '배고프대! 어떤 밥집일까?', cafe: '커피 마시고 싶대! 어떤 카페일까?', shop: '살 게 있대! 어떤 가게일까?', fun: '놀 데가 없대! 어떤 놀거리일까?', rest: '쉴 곳이 필요하대! 어떤 숙소일까?' };
const TUT = [
  { say: '끼룩! 여기가 네 섬이야.\n섬 사람 얼굴을 하나 눌러 봐!', el: '#wants .want', spot: '#wants', on: 'card' },
  // a face picked: first where (the glowing land, 끼룩이's pick lit), then the line in the window that opens there
  { say: () => S.buildMode ? `${WISH[S.card?.need] ?? '어떤 가게일까?'}\n한 줄 써 봐. 골라도 돼!` : '어디에 지을까?\n빛나는 땅을 눌러 봐!', el: () => S.buildMode ? '#bsub button' : null, spot: () => S.buildMode ? '#bar' : null, map: () => S.buildMode ? null : 'lot', on: 'line' },
  { say: 'Claude가 짓는 중이야…\n뭐가 나올까? 끼룩!', on: 'built', mood: 'think' },
  { say: '불 들어왔다! 🎉\n전등 하나가 이 집으로 갔어.', map: 'plant', on: 'coin', boat: true },
  { say: '첫 손님이야!\n가게를 눌러 봐. 안이 보여!', map: 'shop', on: 'inside' },
  // the last step hands the island over (running out of lamps is taught when it happens); it ends by itself
  { say: '이제 네 섬이야!\n손님이 원하는 걸 지어 봐.', wait: 7000, onMap: true },   // (said on the map: inside a shop it waits for the shop to close)
];
// inside a shop for the first time: how to read the flow and what a fixture buys. No buttons here either: a step that only
// explains moves on after `wait` ms, the one that asks for something moves on when it is done
const TUT_IN = [
  { say: '여기가 가게 안이야!\n손님이 들어와서 주문하고, 자리에 앉아서 계산해.', wait: 6000 },
  { say: () => S.watching?.view?.blocked?.size ? '빨간 김이 나는 곳이 막힌 곳이야.\n손님이 거기서 기다리고 있어!' : '지금은 막힌 곳이 없어.\n손님이 몰리면 막히는 곳에서 빨간 김이 나!', wait: 7000, at: 'slow' },
  { say: '반짝이는 버튼을 눌러\n가구를 들여 봐!', el: '#shopacts .act.buy', on: 'furnish' },
  { say: '쿵! 가구가 들어왔어.\n기계는 전기 · 물을 조금 더 써!', wait: 5000 },
];
const inStep = () => S.myDoc?.wallet?.tutIn ?? 99;
export const inTutOn = () => !!S.watching?.mine && inStep() < TUT_IN.length;
const setStep = (field, n) => { if (!canWrite()) return; if (field === 'tut') { S.stepAt = performance.now(); document.getElementById('why')?.remove(); S.showPipe = false; }   // a new step: nothing from the last one left open to press
 if (n > (S.myDoc.wallet[field] ?? 0) && n < 99) gull?.cheer(); S.myDoc.wallet[field] = n; S.dirty = true; save(true); if (field === 'tut') track('tut', { step: n, v: 5 }); guide(); };
const say = (v) => typeof v === 'function' ? v() : v;

// before I have an island: choose one on the map. Invited: next to the friend who sent the link.
const inviter = () => FROM && S.owners.get(FROM);
const pickWords = () => { const by = inviter(); return by ? `${nameOf(by)} 옆 섬을 눌러!\n이웃이 되면 다리를 놓을 수 있어.` : '끼룩! 이 섬 어때?\n마음에 들면 눌러 봐!'; };
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
// power or water running short (utility.js): 끼룩이 says a line by the plant or tank, then goes again
let supT = 0;
export function supplyTalk(text, k = 0) { S.supplyGuide = { text, k }; guide(); clearTimeout(supT); supT = setTimeout(() => { S.supplyGuide = null; guide(); }, 7000); }
/** My power plant (0) or water tank (1) on the screen, for 끼룩이 to stand by. */
// (both of them, whichever is asked: 끼룩이 then stands clear of the pair)
function plantRect() { if (!S.mySlot) return null; const pts = plantTiles(S.mySlot).map(([x, z]) => { const [px, py] = pr.P(x + .5, z + .5); return toScreen(px, py); });
  const l = Math.min(...pts.map(p => p[0])) - 26, r = Math.max(...pts.map(p => p[0])) + 26, t = Math.min(...pts.map(p => p[1])) - 80, b = Math.max(...pts.map(p => p[1])) + 8;
  return r < 0 || b < 0 || l > innerWidth || t > innerHeight ? null : { left: l, top: t, right: r, bottom: b, width: r - l, height: b - t }; }

// On a board that is not mine: 끼룩이 sends me to my own (made or moved into before), or has me make one.
// One button; with several boards it opens the list of them in the same place.
let mine = null, listMine = false;
function showcaseTalk() {
  const here = SHOWCASE ? '끼룩! 여기는 구경하는 팝업섬이야.' : '끼룩! 여긴 초대받은 친구들의 팝업섬이야.';
  if (!mine) { myBoards().then(l => { mine = l; if (l.length) guide(); }); }
  const make = () => el('button', { class: 'gold', on: { click: async (e) => { const b = e.currentTarget; b.disabled = true; if (await newBoard()) return; b.disabled = false; if (mine?.length) { listMine = true; guide(); } } } }, '내 팝업섬 세우기');
  if (!mine?.length) { speak(here + '\n내 팝업섬을 세우고 친구들을 불러 봐!'); $('gbtns').replaceChildren(make()); return; }
  if (!listMine) {
    speak(here + (mine.length === 1 ? `\n네 팝업섬은 ‘${mine[0].name}’이야. 가서 키워 봐!` : `\n네 팝업섬이 ${mine.length}개 있어. 가서 키워 봐!`));
    $('gbtns').replaceChildren(el('button', { class: 'gold', on: { click: () => { if (mine.length === 1) goBoard(mine[0].id); else { listMine = true; guide(); } } } }, '내 팝업섬으로'));
    return;
  }
  speak('어느 팝업섬으로 갈까?');
  $('gbtns').replaceChildren(el('div', { class: 'gmine' }, ...mine.map(b => el('button', { class: 'gold', on: { click: () => goBoard(b.id) } }, boardLabel(b)))));
}

let panned = -1, inAutoT = 0, inAutoK = -1, waitT = 0, waitK = -1;
/** Show the current step. */
export function guide() {
  gull?.mood();   // talking, unless the step below says otherwise
  const g = $('guide'); document.querySelectorAll('.glow').forEach(e => e.classList.remove('glow'));
  if (inTutOn()) {
    const st = TUT_IN[inStep()]; g.hidden = false; speak(typeof st.say === 'function' ? st.say() : st.say);
    $('gbtns').replaceChildren();
    if (st.wait && inAutoK !== inStep()) { const k = inAutoK = inStep(); clearTimeout(inAutoT); inAutoT = setTimeout(() => { if (inTutOn() && inStep() === k) setStep('tutIn', k + 1); }, st.wait); }
    return;
  }
  if (SHOWCASE || (!S.mySlot && !MAY_JOIN && S.scrolled)) {   // the showcase, or a private board I was not invited to: look around, then make my own
    g.hidden = false; showcaseTalk();
    return;
  }
  if (picking()) {
    g.hidden = !pickSpot(); speak(pickWords()); $('gbtns').replaceChildren();
    return;
  }
  if (S.inviteGuide) {   // the later moment: a friend next door (no buttons either; the island is what to press)
    g.hidden = false; speak('섬이 제법 커졌네!\n옆 빈 섬에 친구를 불러 볼까?'); $('gbtns').replaceChildren();   // (a bridge comes later, once a friend lives there: said after the link is copied)
    if (panned !== 'invite') { panned = 'invite'; const n = emptyNeighbours()[0]; if (n) setTimeout(() => { const z = chooseZoom(n); if (S.zoom > z) { S.zoom = z; applyZoom(); } scrollToSlot(n); }, 300); }
    return;
  }
  if (S.supplyGuide && !tutOn()) { g.hidden = false; speak(S.supplyGuide.text); $('gbtns').replaceChildren(); return; }
  if (!tutOn()) { g.hidden = true; $('garrow').hidden = true; return; }
  const st = TUT[tutStep()];
  if (st.onMap && S.watching) { g.hidden = true; $('garrow').hidden = true; return; }
  g.hidden = false; gull?.mood(st.mood); speak(say(st.say));
  $('gbtns').replaceChildren();   // no buttons: the step moves on when its thing is done (or, with nothing to do, after `wait`)
  if (st.wait && waitK !== tutStep()) { const k = waitK = tutStep(); clearTimeout(waitT); waitT = setTimeout(() => { if (tutStep() === k) setStep('tut', k + 1); }, st.wait); }
  if (st.boat && S.mySlot) nextBoat.set(S.mySlot, 0);   // the first boat comes at once
}

// what the guide is about: an element on the page, or a spot on the map
function guideArrow() {
  // One thing to do at a time (spotlight): the rest of the screen dims and what to press stays lit, and 끼룩이 stands right
  // beside it — no bouncing arrow (players press the arrow instead of learning the button). Steps with nothing to press
  // dim nothing; the guide then stands beside what just opened (near), or in its own corner.
  $('garrow').hidden = true;
  const rectOf = (sel) => { if (typeof sel === 'function') sel = sel(); const e = sel && document.querySelector(sel); return e && e.getClientRects().length ? e.getBoundingClientRect() : null; };
  const glow = (sel) => { if (typeof sel === 'function') sel = sel(); const e = sel && document.querySelector(sel); if (e && e.getClientRects().length) e.classList.add('glow'); };
  const circle = (x, y, r) => ({ left: x - r, top: y - r, right: x + r, bottom: y + r, width: r * 2, height: r * 2, round: true });
  const onMap = (c) => { if (!c) return null; const hit = document.elementFromPoint(c.left + c.width / 2, Math.min(innerHeight - 1, c.top + c.height / 2)); return hit && (hit.id === 'map' || hit.closest('#mapbox')) ? c : null; };   // a map spot that UI covers: none
  let focus = null, dim = false, near = null;
  if (inTutOn()) {
    const st = TUT_IN[inStep()];
    document.querySelectorAll('.glow').forEach(e => e.classList.remove('glow'));
    if (st.at === 'slow') { const v = S.watching.view, i = [...(v.blocked ?? [])][0], f = i !== undefined && v.fx[i]; if (f && v.onFloor(f.y)) { const [x, y] = v.view.project(f.x, f.y + 1.4, f.z), r = v.top.getBoundingClientRect(); near = circle(r.left + x * v.zoom, r.top + y * v.zoom, 40); } }
    if (st.el) { glow(st.el); focus = rectOf(st.el); dim = !!(focus && st.on); }
  } else if (picking()) {   // the island to choose: its 'live here' button on the map, or the island itself
    speak(pickWords());
    focus = rectOf('#joinbtn:not([hidden])') ?? onMap((() => { const s = pickSpot(); if (!s) return null; const [cx, cz] = centerOf(s), [x, y] = toScreen(...pr.P(cx, cz)); return circle(x, y, 90); })()); dim = !!focus;
  } else if (S.supplyGuide && !tutOn()) {   // (in its corner: standing by the plant it covered the land to build on)
  } else if (S.inviteGuide) {   // the free island next door
    const n = emptyNeighbours()[0]; if (n) { const [cx, cz] = centerOf(n), [x, y] = toScreen(...pr.P(cx + .5, cz + .5)); focus = onMap(circle(x, y, 90)); }
  } else if (tutOn()) {
    const st = TUT[tutStep()];
    if (spoken !== say(st.say) && !S.watching) guide();   // back from a shop: the step's own words (and its timer)
    if (st.el) glow(st.el);
    if (st.spot) focus = rectOf(st.spot);
    const mp = typeof st.map === 'function' ? st.map() : st.map;
    if (mp === 'plant' && performance.now() - (S.stepAt ?? 0) < 2600) focus = plantRect();   // the plant, dimmed around for a moment (nothing to press)
    if (mp === 'lot') { const sp = suggestSpot(); if (sp) { const n = PLOT[S.size], [x, y] = toScreen(...pr.P(sp.x + n / 2, sp.z + n / 2)); focus = onMap(circle(x, y, 46)); } }   // 끼룩이's pick among the glowing land
    if (mp === 'shop') { const p = allPlots().find(q => q.owner === me && q.b), tp = p && S.lastTops[p.key]; if (tp) { const [x, y] = toScreen(tp[0], tp[1]); focus = onMap(circle(x, y + 30, 64)); } }
    if (st.near) near = st.near.startsWith?.('plant') ? plantRect(+st.near.slice(5)) : rectOf(st.near);
    dim = !!focus && !S.building;
  }
  placeSpot(dim ? focus : null); placeGuide(near ?? (tutOn() && (TUT[tutStep()]?.map === 'plant' || (tutStep() === 1 && S.buildMode && innerWidth > 760)) ? null : focus));   // by the plant, or with the window over its lot: 끼룩이 stays in its corner (not over the lot)   // by the plant: 끼룩이 stays in its corner
  S.guideAt = focus ? [focus.left + focus.width / 2, focus.top + focus.height / 2] : null;   // what to press, for the checks
  // 끼룩이 holds a wing toward what it talks about — only when that is above its head
  { const b = document.querySelector('#guide .gbird')?.getBoundingClientRect(), t = near ?? focus, pt = t && [t.left + t.width / 2, t.top + t.height / 2]; gull?.point(pt && b && pt[1] < b.top + b.height * .2 ? pt : null); }
}
/** The dim with a lit hole over r (null: no dim). */
function placeSpot(r) {
  const s = $('gspot'); if (!r) { s.hidden = true; return; }
  const pad = r.round ? 0 : 8; s.hidden = false; s.classList.toggle('round', !!r.round);
  Object.assign(s.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
}
/** 끼룩이 right above r (below it when there is no room above); null: back to its own corner. */
function placeGuide(r) {
  const g = $('guide'); if (!r || g.hidden) { g.classList.remove('anchored', 'below'); g.style.left = g.style.top = g.style.bottom = ''; return; }
  const w = g.offsetWidth, h = g.offsetHeight, x = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2));
  const above = r.top - h - 14 >= 64, top = above ? r.top - h - 14 : Math.min(innerHeight - h - 8, r.bottom + 14);
  g.classList.add('anchored'); g.classList.toggle('below', !above);   // the card's tail points down at it, or up from below
  { const b = g.querySelector('.gbub').getBoundingClientRect(); g.style.setProperty('--tail', Math.max(24, Math.min(b.width - 24, r.left + r.width / 2 - b.left)) + 'px'); } g.style.left = x + 'px'; g.style.top = top + 'px'; g.style.bottom = 'auto';
}
// ---------- 끼룩이 and its words: the line types itself out while the beak moves; a tap on the bubble shows it all ----------
let gull = null, spoken = null, typing = null;
let foldT = 0;
/** Fold the bubble to just the gull once the words have been read, on a step that waits for something done on the map —
 *  never while it stands beside what to press (anchored): there it is the instruction.
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
      if (!btns.querySelector('.gold')) { clearTimeout(foldT); foldT = setTimeout(() => { if (spoken === text && !$('guide').classList.contains('anchored')) fold(true); }, 6000); } };
    typing = setInterval(() => { if (i >= parts.length) return done(); parts[i++].classList.add('on'); }, 34);
    bub.onclick = (e) => { if (typing && !e.target.closest('button')) done(); };
  }, 0);
}
export function initGuide() {
  gull = mountThumbGull(document.querySelector('#guide .gbird'));
  document.querySelector('#guide .gbird').addEventListener('click', () => fold(false));
  setInterval(guideArrow, 120); setInterval(laterInvite, 2000);
}
