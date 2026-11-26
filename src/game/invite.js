// Inviting friends: the link (this board, and the island that invites), a card with a picture of the archipelago
// and one button that shares or copies it. A friend who opens the link lands next to the inviter (see guide.js).
import { SLOTS, neighbours } from '../v2/isles.js';
import { $, el } from './ui.js';
import { S, BOARD } from './state.js';
import { track } from './persist.js';
import { toast } from './hud.js';
import { hooks } from './model.js';

/** The link a friend opens: this board, and my island so they land next to it. */
export function inviteLink() {
  const u = new URL(location.origin + location.pathname);
  if (BOARD !== 'main') u.searchParams.set('board', BOARD);
  if (S.mySlot) u.searchParams.set('from', String(S.mySlot));
  return u.toString();
}
/** Empty islands next to mine, nearest first in number order. */
export const emptyNeighbours = (slot = S.mySlot) => slot ? neighbours(slot).filter(n => !S.owners.has(n)) : [];

/** Share the link (the phone's share sheet) or copy it; when neither works, show it to copy by hand. */
export async function shareInvite() {
  const url = inviteLink(), title = `${S.boardName || '한 줄 군도'} · 빈 섬 ${SLOTS - S.owners.size}개`;
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
