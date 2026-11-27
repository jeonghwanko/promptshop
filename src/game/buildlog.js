// The build log beside the lot while Claude builds. While it thinks, the log writes down what it might be considering —
// guesses drawn from the guest's wish and the line, plainly marked as guesses — and each part Claude actually sends;
// when the building is done the whole log is replaced, at once, by what was built, tidied into a few rows.
import { TYPE_KO, STYLE_KO } from '../v2/catalog.js';
import { $, el } from './ui.js';
import { S, pr } from './state.js';
import { tilesOf } from './model.js';
import { toScreen } from './camera.js';

// what a builder might weigh, by part: shared ones, and ones for each kind of guest the building is for
const IDEAS = {
  벽: ['나무 판자', '붉은 벽돌', '하얀 회벽', '통유리', '돌벽', '함석판', '타일'],
  지붕: ['기와', '함석 지붕', '평평한 옥상', '뾰족한 박공', '둥근 지붕', '천막 차양'],
  입구: ['미닫이 문', '줄무늬 차양', '계단 두 칸', '넓은 유리문', '나무 문'],
  소품: ['화분', '벤치', '처마 등불', '자전거', '고양이', '파라솔', '나무 상자', '입간판'],
  크기: ['1층으로 낮게', '2층으로 올릴까', '작게 아담하게', '옆에 날개동'],
};
const BY_NEED = {
  food: { 구역: ['주방 + 홀', '좌식 상 자리', '바 자리', '포장 창구'], 대표: ['큰 숟가락', '가마솥', '포장마차 수레', '김 나는 냄비'], 가구: ['화구 두 개', '4인 테이블', '조리대', '냉장고'] },
  cafe: { 구역: ['카운터 + 창가 자리', '다락 좌석', '빵 굽는 주방'], 대표: ['큰 커피잔', '큰 빵', '테라스 파라솔'], 가구: ['커피 머신', '2인 테이블', '빵 진열대', '소파'] },
  shop: { 구역: ['진열대 줄', '계산대 앞 통로', '창고 한 칸'], 대표: ['큰 장바구니', '세로 간판', '자판기'], 가구: ['진열대', '계산대', '냉장 진열장'] },
  fun: { 구역: ['무대 + 관람석', '게임기 줄', '휴게실'], 대표: ['네온 화살표', '큰 볼링 핀', '깃발 줄'], 가구: ['좌석 줄', 'TV', '소파'] },
  rest: { 구역: ['로비 + 객실층', '프런트', '라운지'], 대표: ['등불 줄', '정원 나무', '현관 차양'], 가구: ['침대', '로비 소파', '러그'] },
  any: { 구역: ['1층 홀', '안쪽 방', '카운터'], 대표: ['큰 간판', '등불 줄', '조각상'], 가구: ['카운터', '테이블', '화분'] },
};
const STEP_KO = { building: '건물', main: '본관', mass: '덩어리', sign: '간판', hero: '대표', prop: '소품', floor: '층', fixture: '가구', order: '순서' };
const pick = (a, rnd) => a[Math.floor(rnd() * a.length)];

let think = 0;   // the guessing timer (one log at a time)
/** Open the log for a building on lot [x, z, n]: line = what was written, need = the guest's wish (null: anything). */
export function logOpen(x, z, n, line, need) {
  clearInterval(think); document.querySelector('.buildlog')?.remove();
  const box = el('div', { class: 'buildlog', id: 'buildlog', 'aria-live': 'polite' }); box.dataset.lot = JSON.stringify([x, z, n]);
  // the island's right edge (the log stands in the sea past it) and its bottom corner (on a narrow screen, just under it)
  let ex = -1e9, ey = 0, bx = 0, by = -1e9; for (const [tx, tz] of tilesOf(S.mySlot)) { const [px, py] = pr.P(tx + 1, tz), [qx, qy] = pr.P(tx + 1, tz + 1); if (px > ex) { ex = px; ey = py; } if (qy > by) { bx = qx; by = qy; } }
  box.dataset.edge = JSON.stringify([ex, ey]); box.dataset.bottom = JSON.stringify([bx, by]);
  box.append(el('div', { class: 'ln head' }, el('b', {}, '구상 중'), el('span', {}, `“${line}”`), el('span', { class: 'dots' }, el('i', {}, '.'), el('i', {}, '.'), el('i', {}, '.'))));
  document.body.append(box); placeLog();
  // the guesses: a part and two options it might be, every second or so, no two alike, until the building is done
  const pool = { ...IDEAS, ...BY_NEED[need ?? 'any'], 간판: [`“${line}” 큰 글씨`, '그림 간판', '세로 간판', '지붕 위 간판'] }, seen = new Set(); let last = '';
  think = setInterval(() => {
    for (let k = 0; k < 12; k++) { const part = pick(Object.keys(pool), Math.random), a = pick(pool[part], Math.random), b = pick(pool[part], Math.random);
      const text = a === b ? `${a}?` : `${a}? ${b}?`; if (part === last || seen.has(text)) continue; seen.add(text); last = part; add(part, text, 'idea'); return; }
  }, 1100);
}
function add(tag, text, kind) {
  const box = $('buildlog'); if (!box) return;
  box.append(el('div', { class: 'ln' + (kind ? ' ' + kind : '') }, el('b', {}, tag), text ? el('span', {}, text) : null));
  const lines = box.querySelectorAll('.ln:not(.head)'); for (let i = 0; i < lines.length - 3; i++) lines[i].remove();
  placeLog();
}
/** A part Claude sent: written in the log as decided (its own short words). */
export function logStep(s) {
  const text = s.step === 'building' ? [s.name || TYPE_KO[s.type], s.levels ? `${s.levels}층` : ''].filter(Boolean).join(' · ') : s.note || '';
  if (text) add(STEP_KO[s.step] ?? s.step, text, 'got');
}
/** A note of the build's own (finishing touches). */
export const logNote = (tag, text) => add(tag, text, 'got');
/** Done: the log becomes, at once, the building as built — name and floors, the look, sign, centrepiece, props, floors, furniture.
 *  steps: the lines Claude sent (with their words); s: the finished building, normalized. */
export function logDone(steps, s, short = false) {
  clearInterval(think); const box = $('buildlog'); if (!box) return;
  const notes = (k) => steps.filter(x => x.step === k && x.note).map(x => x.note.trim());
  const rows = [
    ['외관', [STYLE_KO[s.style], ...notes('main'), ...notes('mass')].filter(Boolean).slice(0, 3).join(' · ')],
    ['간판', notes('sign')[0]], ['대표', notes('hero')[0]], ['소품', notes('prop').slice(0, 3).join(', ')],
    ...floorsOf(steps).slice(0, 3).map(f => [Array.isArray(f.range) && f.range[0] !== f.range[1] ? `${f.range[0]}~${f.range[1]}층` : `${f.range?.[0] ?? 1}층`, [f.name, f.note].filter(Boolean).join(' · ')]),
    ['가구', notes('fixture').slice(0, 3).join(', ')],
  ].filter(r => r[1] && (!short || ['간판', '대표', '가구'].includes(r[0])));   // the first building: three rows, read at a glance
  box.classList.add('sum');
  box.replaceChildren(el('div', { class: 'ln done' }, el('b', {}, '완성'), el('span', {}, [s.name || TYPE_KO[s.type], `${s.levels}층`, TYPE_KO[s.type]].filter(Boolean).join(' · '))),
    ...rows.map(([k, v]) => el('div', { class: 'ln kv' }, el('b', {}, k), el('span', {}, v))));
  placeLog(); close(6500);
}
/** The floors as finally laid out: a second pass that redoes them starts with a floor line marked replace. */
function floorsOf(steps) { const fl = steps.filter(x => x.step === 'floor'), i = fl.map(f => !!f.replace).lastIndexOf(true); return fl.slice(Math.max(0, i)); }
/** Stopped (a refusal, a failure): one red line, then the log goes. */
export function logFail(msg) { clearInterval(think); add('멈춤', msg, 'err'); close(3200); }
/** Gone without a word (another tab took the island). */
export function logDrop() { clearInterval(think); close(0); }
function close(ms) { const box = $('buildlog'); if (!box) return; box.id = ''; setTimeout(() => { box.classList.add('out'); setTimeout(() => box.remove(), 450); }, ms); }

/** The log stands in the sea right of my island (or right or left of the lot when that does not fit), from the lot's top
 *  down; on a narrow screen, just under the island (CSS keeps the last lines there). Every frame. */
export function placeLog() {
  const box = document.querySelector('.buildlog'); if (!box || !box.dataset.lot) return;
  const [x, z, n] = JSON.parse(box.dataset.lot), pts = [[x, z], [x + n, z], [x, z + n], [x + n, z + n]].map(p => toScreen(...pr.P(...p)));
  const right = Math.max(...pts.map(p => p[0])), left = Math.min(...pts.map(p => p[0])), top = Math.min(...pts.map(p => p[1])), w = box.offsetWidth, h = box.offsetHeight;
  const room = (px) => px >= 8 && px + w <= innerWidth - 8, edge = toScreen(...JSON.parse(box.dataset.edge))[0];
  const at = room(edge + 20) ? edge + 20 : room(right + 24) ? right + 24 : room(left - 24 - w) ? left - 24 - w : null;
  if (at === null) { const by = toScreen(...JSON.parse(box.dataset.bottom))[1];
    box.style.left = Math.max(8, (innerWidth - w) / 2) + 'px'; box.style.top = Math.max(120, Math.min(innerHeight - h - 230, by + 12)) + 'px'; return; }
  box.style.left = at + 'px'; box.style.top = Math.max(70, Math.min(innerHeight - h - 200, top - 40)) + 'px';
}
