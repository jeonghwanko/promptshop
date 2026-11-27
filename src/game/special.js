// Today's special guest at my pier (2026-11-28, a reason to come back each day): one guest a day for the archipelago, looking
// for a kind of shop. A shop of that kind (or that family) on my island takes them in: a postcard and a quarter hour's takings.
// None: one tap opens the build window with their line written in, so the request becomes my next building.
// Who comes is the server's (one Claude call per archipelago a day, server/special.mjs); without a server, a fixed list (v2/special.js).
import { fixedGuest, servesGuest, typeName, dayOf } from '../v2/special.js';
import { TYPES } from '../v2/catalog.js';
import { normalize } from '../v2/spec.js';
import { iconPixels } from '../v2/icons.js';
import { dockOf, centerOf } from '../v2/isles.js';
import { S, pr, g, canWrite, site, BOARD } from './state.js';
import { G, myPlots } from './model.js';
import { liveRate } from './vault.js';
import { save } from './persist.js';
import { toast, flyCoinNow } from './hud.js';
import { tutOn } from './guide.js';
import { openAt, suggestSpot } from './build.js';
import { $, el } from './ui.js';
import { iconEl } from '../ui/icons.js';

let guest = null, asked = '';
/** Who comes today: asked once a day (the server keeps one per board), the fixed list until it answers or where there is none. */
export async function loadGuest() {
  const day = dayOf(Date.now()); if (asked === day) return; asked = day; guest = fixedGuest(BOARD, day);
  if (!site) return;
  try { const r = await fetch('/api/special?board=' + encodeURIComponent(BOARD)); if (r.ok) { const j = await r.json(); if (j?.type && j.day === day) guest = j; } } catch {}
}
const shown = () => { if (asked !== dayOf(Date.now())) loadGuest(); return !!(guest && S.myDoc && S.mySlot && !tutOn() && myPlots().length && G().special !== guest.day); };
const typeOf = (p) => { try { return normalize(p.b.input).type; } catch { return null; } };
const match = () => myPlots().find(p => typeOf(p) === guest.type) ?? myPlots().find(p => servesGuest(typeOf(p), guest));   // the very kind first, then the same family
const reward = () => Math.max(200, Math.round(liveRate().coins * 15));   // a quarter hour of what the island makes live

// where they stand: beside the vault's chest, one step in from my pier
const spot = () => { const [rx, rz] = dockOf(S.mySlot).road, inward = Math.sign(centerOf(S.mySlot)[1] - rz) || 1, [px, py] = pr.P(rx + .5, rz + inward + .5); return [Math.round(px) - 26, Math.round(py) + 4]; };
let bubble = null, bubbleOf = '';
function bubbleIcon() {   // the shop they look for, as its sign's picture in a speech bubble (map pixels, crisp)
  if (bubbleOf === guest.type && bubble) return bubble; bubbleOf = guest.type;
  const ic = iconPixels(TYPES[guest.type]?.icon ?? 'star', '#ef5a4a', '#fff8ea'), c = document.createElement('canvas'); c.width = 24; c.height = 26; const cg = c.getContext('2d');
  cg.fillStyle = '#2f4a6a'; cg.fillRect(0, 0, 24, 22); cg.fillRect(10, 22, 4, 2); cg.fillStyle = '#fff8ea'; cg.fillRect(2, 2, 20, 18); cg.fillRect(11, 20, 2, 3);
  cg.drawImage(ic, 4, 3); return bubble = c;
}
/** Into the map's list: the guest (a coat and a tall red hat, a case at their feet) with what they look for over them. */
export function drawGuest(items, tops) {
  if (!shown()) return;
  const [rx, rz] = dockOf(S.mySlot).road, [px, py] = spot(), x = Math.round(px / 2) * 2, y = Math.round(py / 2) * 2, bob = Math.sin(performance.now() / 420) > .6 ? 2 : 0;
  tops['@guest'] = [x, y - 30];
  items.push({ d: rx + rz + 1.7, draw: () => {
    g.fillStyle = 'rgba(23,63,120,.25)'; g.fillRect(x - 4, y, 8, 2);
    g.fillStyle = '#3f5f84'; g.fillRect(x - 2, y - 2, 2, 2); g.fillRect(x, y - 2, 2, 2);
    g.fillStyle = '#6fe0c0'; g.fillRect(x - 3, y - 8, 6, 6); g.fillStyle = '#9ff0d8'; g.fillRect(x - 3, y - 8, 6, 2);
    g.fillStyle = '#f5cfa4'; g.fillRect(x - 2, y - 12, 4, 4);
    g.fillStyle = '#e0704a'; g.fillRect(x - 4, y - 14, 8, 2); g.fillRect(x - 2, y - 18, 4, 4);
    g.fillStyle = '#8a5a3c'; g.fillRect(x + 4, y - 4, 4, 4);
    g.imageSmoothingEnabled = false; g.drawImage(bubbleIcon(), x - 12, y - 46 - bob);
  } });
}
/** Is a tap (map pixels) on the guest or their bubble? */
export function guestAt(sx, sy) { if (!shown()) return false; const [px, py] = spot(); return Math.abs(sx - px) < 16 && sy > py - 50 && sy < py + 6; }

/** The guest's window: who they are, what they look for, and one button (take them in, or build it). */
export function openGuest() {
  if (!shown()) return false; document.getElementById('why')?.remove();
  const m = match(), c = reward();
  const btn = m
    ? el('button', { class: 'gold', on: { click: () => { welcome(m, c); close(); } } }, '맞이하기 · 엽서 + ', iconEl('coin', 18, ''), c.toLocaleString('ko-KR'))
    : el('button', { class: 'gold', on: { click: () => { close(); openAt(suggestSpot()); setTimeout(() => { const i = $('line'); if (i) i.value = guest.line; }, 60); } } }, '지으러 가기');
  btn.disabled = !canWrite();
  const box = el('div', { class: 'why plant', id: 'why', on: { pointerdown: (e) => e.stopPropagation() } },
    el('div', { class: 'row' }, iconEl('star', 22, ''), el('b', {}, `오늘의 손님 · ${guest.name}`)),
    el('div', {}, `“${guest.line}” 찾아왔어요.`),
    el('div', {}, m ? `${normalize(m.b.input).name || typeName(normalize(m.b.input).type)}에 모시면 돼요.` : `섬에 ${typeName(guest.type)} 같은 가게가 아직 없어요.`), btn);
  document.body.append(box);
  const [mx, my] = spot(), r = map.getBoundingClientRect(), z = r.width / map.width, sx = r.left + mx * z, sy = r.top + (my - 46) * z, W = box.offsetWidth, H = box.offsetHeight;
  const x = Math.max(8, Math.min(innerWidth - W - 8, sx - W / 2)), above = sy - H - 12 > 8;
  box.style.left = x + 'px'; box.style.top = (above ? sy - H - 12 : sy + 60) + 'px'; box.classList.toggle('below', !above);
  box.style.setProperty('--tail', Math.max(20, Math.min(W - 20, sx - x)) + 'px');
  const close = (e) => { if (e && box.contains(e.target)) return; box.remove(); removeEventListener('pointerdown', close, true); };
  setTimeout(() => addEventListener('pointerdown', close, true), 0);
  return true;
}
function welcome(p, c) {
  if (!canWrite()) return; const w = G();
  w.coins += c; w.special = guest.day; w.cards = [...(w.cards ?? []), { day: guest.day, name: guest.name, card: guest.card, type: guest.type, shop: p.key }].slice(-60);
  S.dirty = true; save(true);
  for (let i = 0; i < 7; i++) setTimeout(() => flyCoinNow('@guest'), i * 80);
  toast(`${guest.name} · ‘${guest.card}’ 두고 갔어요 · +${c.toLocaleString('ko-KR')}동전`, 4500);
}
const map = document.getElementById('map');
