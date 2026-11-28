// Inviting friends: the link (this board, and the island that invites), a card with a picture of the archipelago
// and one button that shares or copies it. A friend who opens the link lands next to the inviter (see guide.js).
import { SLOTS, neighbours, centerOf } from '../v2/isles.js';
import { $, el } from './ui.js';
import { S, BOARD, site, db, me, map, pr } from './state.js';
import { track } from './persist.js';
import { toast } from './hud.js';
import { supplyTalk } from './guide.js';
import { hooks } from './model.js';
import { BRAND } from '../brand.js';

/** The link a friend opens: this board, and my island so they land next to it; on the hosted game also a token
 *  that lets them move in (boards are private: 14 days, 9 friends). */
export function inviteLink(token) {
  const u = new URL(location.origin + location.pathname);
  if (BOARD !== 'main') u.searchParams.set('board', BOARD);
  if (S.mySlot) u.searchParams.set('from', String(S.mySlot));
  if (token) u.searchParams.set('k', token);
  return u.toString();
}
let token = null;   // one token per page is enough: it lets in 9 friends
/** The picture link previews show (KakaoTalk, messengers): the archipelago as it is now, sent once per page. */
let thumbSent = false;
function sendThumb() {
  if (!site || thumbSent || !S.ground) return; thumbSent = true;
  // the live map (the shops built, the guests on the roads), cut around my island so the friend sees what I made
  const c = document.createElement('canvas'), src = map, w = 800, h = 420; c.width = w; c.height = h;
  const g = c.getContext('2d'); g.fillStyle = '#3f7fb0'; g.fillRect(0, 0, w, h);
  const [cx, cy] = S.mySlot ? pr.P(...centerOf(S.mySlot)) : [src.width / 2, src.height / 2], cw = Math.min(src.width, 760), ch = cw * h / w;
  g.imageSmoothingEnabled = false; g.drawImage(src, Math.max(0, Math.min(src.width - cw, cx - cw / 2)), Math.max(0, Math.min(src.height - ch, cy - ch / 2 - 40)), cw, ch, 0, 0, w, h);
  c.toBlob((b) => { if (b) site.thumb(BOARD, b).catch(() => {}); }, 'image/png');
}
/** Empty islands next to mine, nearest first in number order. */
export const emptyNeighbours = (slot = S.mySlot) => slot ? neighbours(slot).filter(n => !S.owners.has(n)) : [];

/** Share the link (the phone's share sheet) or copy it; when neither works, show it to copy by hand. */
export async function shareInvite() {
  if (site) { try { token ??= await site.invite(BOARD); } catch { return toast('초대 링크를 만들지 못했어요', 1800); } sendThumb(); }
  const url = inviteLink(token), title = `${S.boardName || BRAND.name} · 빈 섬 ${SLOTS - S.owners.size}개`;
  track('invite_copy', { slot: S.mySlot });
  hooks.happened('invite');
  if (navigator.share && matchMedia('(pointer: coarse)').matches) { try { await navigator.share({ title, url }); return; } catch (e) { if (e?.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(url); toast('🔗 링크를 복사했어요', 1600); supplyTalk('친구에게 링크를 보내 봐!\n이사 오면 다리로 이어져.'); }
  catch {   // no clipboard (a page without https): the link in one box to copy by hand, the same box on every press
    const card = document.querySelector('.invitecard'); let i = card?.querySelector('input.link'); if (card && !i) { i = el('input', { type: 'text', readonly: '', class: 'link' }); card.append(i); }
    if (i) { i.value = url; i.select(); } }
}
/** The archipelago as it is now, small: what a friend will see. */
function preview() {
  const c = el('canvas', { class: 'invpic' }), src = map, w = 280, h = Math.round(w * src.height / src.width);   // the live map, shops and all
  c.width = w; c.height = h; const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.drawImage(src, 0, 0, w, h); return c;
}
/** The invite card: a picture, how many islands are free, one button. Null when the archipelago is full. */
export function inviteCard() {
  const free = SLOTS - S.owners.size; if (!free || !S.mySlot) return null;
  track('invite_open', { slot: S.mySlot }); hooks.happened('invite');   // the guide's last step is done once the card is open
  return el('div', { class: 'card invitecard' }, preview(),
    el('button', { class: 'gold', on: { click: () => shareInvite() } }, '친구 초대 링크 복사'));   // (what it is, on the button: a bridge needs a friend living there first)
}

/** A new archipelago of my own, named after me, somewhere near Korea on the world map; then go there. */
export async function newBoard() {
  if (!db || !me) return;
  const who = site ? (await site.me()).name : '나', id = 'b' + Date.now().toString(36) + Math.floor(Math.random() * 36 ** 2).toString(36);
  try { await db.doc('boards/' + id).set({ name: `${who}의 팝업섬`.slice(0, 24), lat: 34.5 + Math.random() * 3.5, lng: 126.3 + Math.random() * 3, owner: me, at: Date.now(), n: 0, bld: 0, users: [] }); }
  catch (e) { const m = e?.message ?? ''; toast(m.startsWith('too many boards today') ? '오늘은 팝업섬을 더 만들 수 없어요 · 내 팝업섬으로 가 보세요' : m.startsWith('too many boards') ? '팝업섬은 열 개까지 만들 수 있어요 · 내 팝업섬으로 가 보세요' : '팝업섬을 만들지 못했어요. 다시 눌러 주세요', 2600); return false; }
  track('board_new', { id });
  goBoard(id); return true;
}
/** Open a board of mine. */
export function goBoard(id) { const u = new URL(location.href); u.searchParams.set('board', id); for (const k of ['from', 'k', 'world']) u.searchParams.delete(k); location.href = u.toString(); }
/** One of my boards on a button: its name, then its shops (one I live on) or the day I made it (still empty). */
export function boardLabel(b) { const d = new Date(b.at ?? 0); return `${b.name} · ${Array.isArray(b.users) && b.users.includes(me) ? `가게 ${b.bld ?? 0}` : `빈 섬 ${d.getMonth() + 1}/${d.getDate()}`}`; }
/** The boards I made or live on: the ones I live on first (most buildings), then the empty ones I made (newest). Read once a page. */
let mineP = null;
export function myBoards() {
  return mineP ??= (async () => {
    if (!db || !me) return [];
    try {
      const lives = (b) => Array.isArray(b.users) && b.users.includes(me);
      return (await db.collection('boards').get()).docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(b => b.id !== 'main' && (b.owner === me || lives(b)))
        .sort((a, b) => (+lives(b) - +lives(a)) || (b.bld ?? 0) - (a.bld ?? 0) || (b.at ?? 0) - (a.at ?? 0));
    } catch { return []; }
  })();
}
