// Power and water on my island, shown on the map rather than in numbers: a power plant whose lamps light one by one as
// buildings and machines use power, and a water tank whose level drops as they use water, both on the shore by the pier.
// Here: what is left by the coins (with what the next building would take), the window on the plant or tank with its one
// "키우기" button (also what opens when something needs more than is left; it then carries on with what was pressed),
// the cable and pipe price of a new building, and — once the island has a few buildings — the bill every minute.
// The numbers live in rules.js; what each building uses is model.js (useOf). Drawing is mapview.js.
import { iconEl } from '../ui/icons.js';
import { UTIL, supplyCost, billOf } from './rules.js';
import { $, el } from './ui.js';
import { S, pr, canWrite, splash } from './state.js';
import { G, myUse, mySupply, myPlots, useOf, shortOf, roadPath, rebuild, plantTiles, waterOn, allPlots, servesOf } from './model.js';
import { dockOf } from '../v2/isles.js';
import { save } from './persist.js';
import { toast } from './hud.js';
import { tutOn, supplyTalk } from './guide.js';
import { toScreen } from './camera.js';

export const PLANT = ['발전기', '물탱크'], ICON = ['bolt', 'drop'];

/** What a building just finished still holds back: its lamp leaves the plant only when the light sets off along the cable. */
export function heldBack(slot) { const c = S.connect; if (!c || performance.now() >= c.t0) return [0, 0]; const p = allPlots().find(q => q.key === c.key); return p && p.slot === slot ? useOf(p) : [0, 0]; }
/** What my island has left: [power, water] — the lit lamps and the water in the tank. */
export function myLeft() { const u = myUse(), s = mySupply(), h = heldBack(S.mySlot); return [s[0] - u[0] + h[0], s[1] - u[1] + h[1]]; }
/** By the coins: power (and, once the tank has come, water) left — the same count as the lit lamps; red at none;
 *  while the bar is open, what the building would leave ("3→2"). */
let meterKey = '';
export function drawMeter() {
  const m = $('pmt'); if (!S.myDoc || !S.mySlot) { m.replaceChildren(); meterKey = ''; return; }
  const left = myLeft(), d = S.preview, kinds = waterOn() ? [0, 1] : [0], key = left.join() + '|' + (d ?? []).join() + kinds.length; if (key === meterKey) return; meterKey = key;
  m.replaceChildren(...kinds.map(k => el('span', { class: 'um' + (left[k] <= 0 || (d && left[k] - d[k] < 0) ? ' full' : '') }, iconEl(ICON[k], 20, ''),
    d && d[k] && left[k] - d[k] >= 0 ? `${left[k]}→${left[k] - d[k]}` : String(left[k]))));   // (not below none: it just shows red)
}

/** Upgrade the power plant (0) or the water tank (1): it grows on the map with a puff of dust. Returns whether it happened. */
export function upgrade(k) {
  const w = G(); if (!canWrite()) return false; mySupply(); const c = supplyCost(w.ups[k]);   // (mySupply gives an old island its supply first)
  if (w.coins < c) return false;
  w.coins -= c; w.ups[k]++; S.dirty = true; save(true); meterKey = '';
  S.plantGrow = { k, t0: performance.now() };
  if (S.supplyGuide) supplyTalk('됐다!\n모자라면 언제든 여기야.', k);
  const [x, z] = plantTiles(S.mySlot)[k], [px, py] = pr.P(x + .5, z + .5);
  for (let i = 0; i < 12; i++) splash.push({ x: px + (Math.random() - .5) * 26, y: py + 4, vx: (Math.random() - .5) * 70, vy: -20 - Math.random() * 40, t: 0, dust: true });
  return true;
}
/** Where the plant or tank of my island is on the screen (null: off screen). */
function plantRect(k) {
  const [x, z] = plantTiles(S.mySlot)[k], [px, py] = pr.P(x + .5, z + .5), [sx, sy] = toScreen(px, py - 34);
  if (sx < 0 || sy < 0 || sx > innerWidth || sy > innerHeight) return null;
  return { left: sx - 24, top: sy - 34, right: sx + 24, bottom: sy + 34, width: 48, height: 68 };
}
/** The window on the plant (0) or tank (1): its lamps or its water as they are, and one button that makes it bigger.
 *  then: what was pressed and could not happen, done once it has grown. */
export function plantWindow(k, then, anchor) {
  document.getElementById('why')?.remove(); S.showPipe = k === 1;
  const w = G(), left = myLeft()[k], s = mySupply()[k], c = supplyCost((w.ups ?? [0, 0])[k]);
  // the same picture as on the map: lit lamps (or water) are what is left; the dashed ones are what growing adds
  const cells = el('div', { class: 'cells ' + (k ? 'water' : 'lamps') }, ...Array.from({ length: s }, (_, i) => el('i', { class: i < left ? 'on' : '' })), ...Array.from({ length: UTIL.step[k] }, () => el('i', { class: 'add' })));
  const btn = el('button', { class: 'gold', on: { click: () => { if (!upgrade(k)) return; close(); if (then) setTimeout(then, 350); else setTimeout(() => plantWindow(k, null, anchor), 450); } } }, '키우기 · ', iconEl('coin', 18, ''), String(c));
  btn.disabled = w.coins < c || !canWrite();   // (el() would write disabled="false", which still disables)
  const box = el('div', { class: 'why plant', id: 'why', on: { pointerdown: (e) => e.stopPropagation() } }, el('div', { class: 'row' }, iconEl(ICON[k], 26, ''), el('b', {}, PLANT[k])), cells, btn,
    w.coins < c ? el('div', { class: 'wg' }, el('i', { style: `width:${Math.min(100, w.coins / c * 100).toFixed(1)}%` }), el('span', {}, `${Math.floor(w.coins)} / ${c}`)) : null);
  document.body.append(box);
  const r = plantRect(k) ?? anchor?.getBoundingClientRect?.() ?? $('pmt').getBoundingClientRect(), W = box.offsetWidth, H = box.offsetHeight;
  const x = Math.max(8, Math.min(innerWidth - W - 8, r.left + r.width / 2 - W / 2)), above = r.top - H - 12 > 8;
  box.style.left = x + 'px'; box.style.top = (above ? r.top - H - 12 : r.bottom + 12) + 'px'; box.classList.toggle('below', !above);
  box.style.setProperty('--tail', Math.max(20, Math.min(W - 20, r.left + r.width / 2 - x)) + 'px');
  const close = (e) => { if (e && box.contains(e.target)) return; box.remove(); S.showPipe = false; removeEventListener('pointerdown', close, true); };   // (a press inside is not a press elsewhere)
  setTimeout(() => addEventListener('pointerdown', close, true), 0);
}
/** Something needs `d` more than is left: the window on whichever runs short, carrying on with `then` once it has grown.
 *  The first time, 끼룩이 says what this is. Returns whether it was short. */
export function noSupply(anchor, d, then) {
  const k = shortOf(d); if (k < 0) return false;
  const w = G(); if (!(w.supTalk ?? 0)) { w.supTalk = 1; S.dirty = true; supplyTalk(k ? '물이 다 떨어졌어.\n물탱크를 키우자!' : '전등이 다 떨어졌어.\n발전기를 키우자!', k); }
  plantWindow(k, then, anchor); return true;
}
/** A tap on the map at (sx, sy), in map pixels: my plant (0) or tank (1) under it, or -1. */
export function plantAt(sx, sy) {
  if (!S.mySlot) return -1;
  for (const k of waterOn() ? [0, 1] : [0]) { const [x, z] = plantTiles(S.mySlot)[k], [px, py] = pr.P(x + .5, z + .5); if (Math.abs(sx - px) < 24 && sy > py - 80 && sy < py + 10) return k; }
  return -1;
}

/** Laying cable and pipe from my pier to a door along the road: its price (free while 끼룩이 shows the first build). */
export function pipeCost(door) {
  if (tutOn() || !door) return 0;
  const path = roadPath(dockOf(S.mySlot).road, door); return path ? Math.max(0, path.length - 1) * UTIL.pipe : 0;
}

// ---------- the bill: once an island has a few buildings, every building pays for its power and water each minute ----------
// Coins fly from each building to the power plant. What the wallet cannot cover closes the newest buildings until a minute when it can;
// the oldest one always stays open (closed shops earn nothing, so closing them all would never end).
let billT = 0;
function bill() {
  const myDoc = S.myDoc; if (!myDoc || !S.mySlot || !canWrite() || tutOn() || S.building) { billT = 0; return; }
  const plots = myPlots();
  if (plots.length < UTIL.billFrom) { if ((myDoc.wallet.off ?? []).length) { myDoc.wallet.off = []; S.dirty = true; rebuild(); save(true); } billT = 0; return; }   // no bills yet: nothing closed
  const t = performance.now(); if (!billT) billT = t; if (t - billT < 60000) return; billT = t;
  const w = myDoc.wallet, off = [], paidBy = []; let paid = 0;
  const keep = (plots.find(p => servesOf(p)) ?? plots[0])?.key;   // the oldest shop that takes guests: it earns, so the island can recover
  plots.forEach((p) => { const b = billOf(useOf(p));
    if (p.key === keep) { paid += Math.min(b, Math.max(0, w.coins)); paidBy.push(p.key); }   // the oldest: what the wallet has, and it stays open
    else if (!off.length && w.coins - paid >= b) { paid += b; paidBy.push(p.key); } else off.push(p.key); });
  w.coins -= paid; const was = (w.off ?? []).join(); w.off = off; S.dirty = true;
  S.billFly = paidBy.map((key, i) => ({ key, t: -i * .08 }));
  if (off.join() !== was) { rebuild(); if (!off.length) toast('다시 문을 열었어요', 1400); }
  save(true);
}
/** The water tank comes by boat when the island reaches 동네: with water to spare for what is already there, and a word from 끼룩이. */
function waterArrives() {
  const w = S.myDoc?.wallet; if (!w || !S.mySlot || !canWrite() || w.water || !waterOn() || tutOn() || S.building) return;
  mySupply(); w.water = 1; const u = myUse(); while (mySupply()[1] - u[1] < 2) w.ups[1]++;
  S.dirty = true; save(true); meterKey = ''; S.plantGrow = { k: 1, t0: performance.now() };
  supplyTalk('물탱크가 왔어!\n이제 물도 같이 써.', 1);
}
export function initUtility() {
  setInterval(bill, 1000);
  setInterval(waterArrives, 1000);
  $('pmt').addEventListener('click', (e) => { e.stopPropagation(); if (!S.myDoc || !S.mySlot || tutOn()) return; const l = myLeft(); plantWindow(waterOn() && l[1] < l[0] ? 1 : 0, null, $('pmt')); });   // not while 끼룩이 points elsewhere
}
