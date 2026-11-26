// Inviting friends: the link (this board, and the island that invites), a card with a picture of the archipelago
// and one button that shares or copies it. A friend who opens the link lands next to the inviter (see guide.js).
import { SLOTS, neighbours } from '../v2/isles.js';
import { $, el } from './ui.js';
import { S, BOARD, site, db, me } from './state.js';
import { track } from './persist.js';
import { toast } from './hud.js';
import { hooks } from './model.js';

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
  const c = document.createElement('canvas'), src = S.ground, w = 800, h = 420, k = Math.max(w / src.width, h / src.height);
  c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = '#3f7fb0'; g.fillRect(0, 0, w, h); g.drawImage(src, (w - src.width * k) / 2, (h - src.height * k) / 2, src.width * k, src.height * k);
  c.toBlob((b) => { if (b) site.thumb(BOARD, b).catch(() => {}); }, 'image/png');
}
/** Empty islands next to mine, nearest first in number order. */
export const emptyNeighbours = (slot = S.mySlot) => slot ? neighbours(slot).filter(n => !S.owners.has(n)) : [];

/** Share the link (the phone's share sheet) or copy it; when neither works, show it to copy by hand. */
export async function shareInvite() {
  if (site) { try { token ??= await site.invite(BOARD); } catch { return toast('초대 링크를 만들지 못했어요', 1800); } sendThumb(); }
  const url = inviteLink(token), title = `${S.boardName || '한 줄 군도'} · 빈 섬 ${SLOTS - S.owners.size}개`;
  track('invite_copy', { slot: S.mySlot });
  hooks.happened('invite');
  if (navigator.share && matchMedia('(pointer: coarse)').matches) { try { await navigator.share({ title, url }); return; } catch (e) { if (e?.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(url); toast('🔗 링크를 복사했어요', 1600); }
  catch { const i = el('input', { type: 'text', readonly: '', value: url }); document.querySelector('.invitecard')?.append(i); i.select(); }
}
/** The archipelago as it is now, small: what a friend will see. */
function preview() {
  const c = el('canvas', { class: 'invpic' }), src = S.ground, w = 280, h = Math.round(w * src.height / src.width);
  c.width = w; c.height = h; const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.drawImage(src, 0, 0, w, h); return c;
}
/** The invite card: a picture, how many islands are free, one button. Null when the archipelago is full. */
export function inviteCard() {
  const free = SLOTS - S.owners.size; if (!free || !S.mySlot) return null;
  track('invite_open', { slot: S.mySlot });
  return el('div', { class: 'card invitecard' }, preview(), el('b', {}, `빈 섬 ${free}개`),
    el('button', { class: 'gold', on: { click: () => shareInvite() } }, '초대 링크 복사'));
}

/** A new archipelago of my own, named after me, somewhere near Korea on the world map; then go there. */
export async function newBoard() {
  if (!db || !me) return;
  const who = site ? (await site.me()).name : '나', id = 'b' + Date.now().toString(36) + Math.floor(Math.random() * 36 ** 2).toString(36);
  try { await db.doc('boards/' + id).set({ name: `${who}의 군도`.slice(0, 24), lat: 34.5 + Math.random() * 3.5, lng: 126.3 + Math.random() * 3, owner: me, at: Date.now(), n: 0, bld: 0, users: [] }); }
  catch { return toast('군도를 만들지 못했어요. 다시 눌러 주세요', 2000); }
  track('board_new', { id });
  const u = new URL(location.href); u.searchParams.set('board', id); for (const k of ['from', 'k', 'world']) u.searchParams.delete(k); location.href = u.toString();
}
