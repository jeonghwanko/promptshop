// Today's special guest of an archipelago: who comes, what shop they are looking for, the postcard they leave.
// Shared by the server (one Claude call per archipelago a day, server/special.mjs) and the page (a fixed list where there is no server).
// Pure: no DOM, no clock, no randomness of its own.
import { TYPES, TYPE_KO } from './catalog.js';

/** The families whose shops take guests in: what a special guest may be looking for. */
export const SPECIAL_FAMILIES = ['food', 'retail', 'leisure', 'hospitality', 'culture', 'sport'];
export const SPECIAL_TYPES = Object.keys(TYPES).filter(k => SPECIAL_FAMILIES.includes(TYPES[k].family));

/** The day as Korea counts it (the guest changes at midnight there). */
export const dayOf = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);

// a guest for days with no Claude: a looked-for shop in a line, and the postcard
const FIXED = [
  { type: 'pojangmacha', name: '밤바다 여행자', line: '바다 보이는 포장마차', card: '파도 소리 들리는 포장마차 엽서' },
  { type: 'cafe', name: '책 읽는 고양이', line: '창가 자리 많은 조용한 카페', card: '햇살 드는 창가 엽서' },
  { type: 'bakery', name: '아침 산책 할머니', line: '아침마다 줄 서는 빵집', card: '갓 구운 식빵 엽서' },
  { type: 'boutique', name: '패션 유튜버', line: '빈티지 옷이 가득한 옷가게', card: '알록달록 옷걸이 엽서' },
  { type: 'restaurant', name: '배고픈 등산객', line: '푸짐한 백반집', card: '김 나는 밥상 엽서' },
  { type: 'cinema', name: '영화 덕후', line: '옛날 영화 틀어 주는 작은 극장', card: '필름 한 칸 엽서' },
  { type: 'guesthouse', name: '배낭 여행자', line: '바다 보이는 게스트하우스', card: '노을 지는 창문 엽서' },
  { type: 'gym', name: '마라톤 선수', line: '새벽에도 여는 체육관', card: '땀방울 메달 엽서' },
  { type: 'bar', name: '재즈 연주자', line: '피아노 있는 작은 바', card: '건반 위 달빛 엽서' },
  { type: 'convenience_store', name: '야근한 개발자', line: '밤새 불 켜진 편의점', card: '컵라면 김 엽서' },
  { type: 'pc_bang', name: '게임 대회 선수', line: '모니터 큰 PC방', card: '승리 화면 엽서' },
  { type: 'gallery', name: '그림 그리는 학생', line: '바닷가 작은 미술관', card: '수채화 섬 엽서' },
];
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
/** The guest of a board on a day without Claude: always the same for everyone on that board that day. */
export function fixedGuest(board, day) { return { ...FIXED[hash(board + ':' + day) % FIXED.length], day, by: 'fixed' }; }

/** Claude's answer, checked: a guest with a known type and short lines, or null. */
export function checkGuest(o, day) {
  const type = typeof o?.type === 'string' ? o.type.replace(/[\s(（].*$/, '').trim() : '';   // "cafe(카페)" → cafe
  if (!o || typeof o !== 'object' || !SPECIAL_TYPES.includes(type)) return null;
  const s = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  const name = s(o.name, 12), line = s(o.line, 24), card = s(o.card, 24);
  return name && line ? { type, name, line, card: card || `${line} 엽서`, day, by: 'claude' } : null;
}

/** What to ask Claude: one guest for this archipelago today, as one JSON line. */
export function guestPrompt(day) {
  const kinds = SPECIAL_TYPES.map(k => `${k} = ${TYPE_KO[k] ?? k}`).join(', ');
  return `A cosy island-building game. Every day one special guest arrives by boat at a small archipelago, looking for one kind of shop.
Invent today's guest (${day}). Answer with ONE line of JSON and nothing else:
{"type":"<the English key only, one of: ${kinds}>","name":"<who they are, Korean, at most 10 characters, a role or a nickname, no real person>","line":"<the shop they are looking for in one Korean phrase, at most 18 characters, concrete and a little charming, e.g. 바다 보이는 국숫집>","card":"<the postcard they leave, Korean, at most 18 characters>"}
Keep it warm and everyday; nothing scary, adult or political. Vary the kind of shop from day to day.`;
}

/** Does a building of this type serve the guest? The same type, or the same family (a 바 for someone after a 식당 is close enough). */
export function servesGuest(type, guest) {
  if (!guest || !TYPES[type] || !TYPES[guest.type]) return false;
  return type === guest.type || TYPES[type].family === TYPES[guest.type].family;
}
export const typeName = (t) => TYPE_KO[t] ?? t;
