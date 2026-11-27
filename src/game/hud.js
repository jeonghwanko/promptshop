// The HUD: coins and income, my level and permits, the boat horn, the dock buttons, the festival plate,
// and the short messages (toast, celebrate, a coin flying up to the coin plate).
import { iconEl } from '../ui/icons.js';
import { voxelEl } from '../ui/voxelui.js';
import { NEED_KEYS } from '../v2/townsim.js';
import { LEVELS, levelOf } from './rules.js';
import { $, el } from './ui.js';
import { S, sim, earned, boats, nextBoat, canWrite } from './state.js';
import { G, boatPlan } from './model.js';
import { save } from './persist.js';
import { toScreen, scrollToSlot } from './camera.js';
import { showHome, closePanel } from './panel.js';
import { setBuildMode, buildHint, openCards } from './build.js';
import { closeInside } from './shop.js';

/** The pixel icon for each kind of guest. */
export const NEED_ICON = { food: 'food', cafe: 'cafe', shop: 'bag', fun: 'heart', rest: 'bed' };

let toastT = 0;
/** A line at the bottom; in build mode it goes back to the build hint after `ms`. */
export function toast(text, ms) { const t = $('toast'); t.textContent = text; t.hidden = !text; clearTimeout(toastT); if (ms) toastT = setTimeout(() => { t.hidden = !S.buildMode; if (S.buildMode) t.textContent = buildHint(); }, ms); }
let celebT = 0;
/** Words and an icon drop in at the top centre and fade: no plate, no dimming, nothing to press. */
export function celebrate(title, sub) {
  document.querySelector('.celebrate')?.remove(); clearTimeout(celebT);
  const c = el('div', { class: 'celebrate', 'data-icon-size': '40' }, el('b', {}, title), sub ? el('span', {}, sub) : null); document.body.append(c); celebT = setTimeout(() => c.remove(), 2400);
}
// a coin flies from the shop that earned it up to the coin plate (a few a second at most, so a busy island does not snow coins)
let flyAt = 0;
export function flyCoin(key) {
  const t = performance.now(); if (t - flyAt < 140 || document.hidden) return; flyAt = t;
  const tp = S.lastTops[key], cb = $('coinb').querySelector('.cic'); if (!tp || !cb || $('coinb').hidden) return;
  const [x0, y0] = toScreen(tp[0], tp[1]), b = cb.getBoundingClientRect(), x1 = b.left + b.width / 2, y1 = b.top + b.height / 2;
  if (x0 < -40 || y0 < -40 || x0 > innerWidth + 40 || y0 > innerHeight + 40) return;
  const c = iconEl('coin', 20, ''); Object.assign(c.style, { position: 'fixed', left: '0', top: '0', zIndex: 17, pointerEvents: 'none', imageRendering: 'pixelated' }); document.body.append(c);
  const mx = (x0 + x1) / 2 + (Math.random() - .5) * 80, my = Math.min(y0, y1) - 60;
  c.animate([{ transform: `translate(${x0 - 10}px, ${y0 - 10}px) scale(.6)` }, { transform: `translate(${mx - 10}px, ${my - 10}px) scale(1.2)`, offset: .35 }, { transform: `translate(${x1 - 10}px, ${y1 - 10}px) scale(.9)` }], { duration: 650, easing: 'cubic-bezier(.5,0,.6,1)' })
    .onfinish = () => { c.remove(); const k = $('coinb'); k.classList.remove('up'); void k.offsetWidth; k.classList.add('up'); };
}
/** A coin now, and the next one need not wait either (festival tips). */
export function flyCoinNow(key) { flyCoin(key); flyAt = 0; }
// the festival plate: a countdown and who is coming, then served / total
let festKey = '';
export function festHud() {
  const fest = S.fest, b = $('festp'); if (!fest || fest.state === 'leave') { b.hidden = true; festKey = ''; return; }
  const t = performance.now() / 1000, cd = Math.max(0, Math.ceil(fest.arrive - t)), key = fest.state + cd + fest.served + fest.people.filter(p => p.mood === 2 && !p.festServed).length;
  if (key === festKey) return; festKey = key; b.hidden = false; b.classList.toggle('soon', fest.state === 'coming' && cd <= 15); b.classList.toggle('here', fest.state === 'here');
  const ic = iconEl('boat', 22, '');
  if (fest.state === 'coming') b.replaceChildren(ic, el('span', { class: 'cd' }, `0:${String(cd).padStart(2, '0')}`), ...Object.entries(fest.needs).sort((a, c) => c[1] - a[1]).map(([k, n]) => el('span', { class: 'nd' }, iconEl(NEED_ICON[k], 22, ''), String(n))));
  else { const lost = fest.people.filter(p => p.mood === 2 && !p.festServed).length;
    b.replaceChildren(ic, el('span', { class: 'cd' }, `${fest.served}/${fest.total}`), el('span', { class: 'bar' }, Object.assign(el('i'), { style: `width:${fest.served / fest.total * 100}%` }), Object.assign(el('i', { class: 'lost' }), { style: `width:${lost / fest.total * 100}%` }))); }
}
/** A small mark on 내 섬: something new there (a friend moved in next door). Gone when it is opened. */
/** Something I pressed cannot happen yet: a small window on what I pressed, showing why (a gauge of what is missing)
 *  and the one button that helps, if there is one. A tap anywhere else closes it. No shake, no one-line tip.
 *  o: { icon, title, gauge: [now, of] , note, btn, run } */
export function why(anchor, o) {
  document.getElementById('why')?.remove();
  const r = anchor.getBoundingClientRect(), w = el('div', { class: 'why', id: 'why', on: { pointerdown: (e) => e.stopPropagation() } },
    el('div', { class: 'row' }, o.icon ? iconEl(o.icon, 28, '') : null, el('b', {}, o.title)),
    o.gauge ? el('div', { class: 'wg' }, el('i', { style: `width:${Math.min(100, o.gauge[0] / Math.max(1, o.gauge[1]) * 100).toFixed(1)}%` }), el('span', {}, `${Math.max(0, Math.floor(o.gauge[0]))} / ${o.gauge[1]}`)) : null,
    o.note ? el('small', {}, o.note) : null,
    o.btn ? el('button', { class: 'gold', on: { click: () => { close(); o.run(); } } }, o.btn) : null);
  document.body.append(w);
  const W = w.offsetWidth, H = w.offsetHeight, x = Math.max(8, Math.min(innerWidth - W - 8, r.left + r.width / 2 - W / 2)), above = r.top - H - 12 > 8;
  w.style.left = x + 'px'; w.style.top = (above ? r.top - H - 12 : r.bottom + 12) + 'px';
  const close = () => { w.remove(); removeEventListener('pointerdown', close, true); };
  setTimeout(() => addEventListener('pointerdown', close, true), 0);
}
/** Call my boat now, if it can come (also the button in the why window). */
export function callBoat() {
  if (!S.mySlot || !$('boat').classList.contains('callable')) return false;
  nextBoat.set(S.mySlot, 0); S.callReady = performance.now() / 1000 + 25; toast('📣 뿌우— 배를 불렀어요!', 1400); hud(); return true;
}
/** An icon flies in an arc from a screen point to an element, which bounces when it lands: cause to effect, without words. */
export function flyIcon(name, [x0, y0], target, size = 32) {
  const to = target?.getBoundingClientRect(); if (!to || !to.width) return;
  const f = iconEl(name, size, ''); f.classList.add('flyer'); document.body.append(f);
  const x1 = to.left + to.width / 2 - size / 2, y1 = to.top + to.height / 2 - size / 2;
  f.animate([{ transform: `translate(${x0 - size / 2}px,${y0 - size / 2}px) scale(.7)` }, { transform: `translate(${(x0 + x1) / 2}px,${Math.min(y0, y1) - 80}px) scale(1.5) rotate(-12deg)`, offset: .45 }, { transform: `translate(${x1}px,${y1}px) scale(.8)` }], { duration: 750, easing: 'cubic-bezier(.4,0,.6,1)' })
    .finished.then(() => { f.remove(); target.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.25) rotate(-4deg)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'cubic-bezier(.2,1.6,.4,1)' }); });
}
/** A new 🎫 flies from the ticket chip into the 짓기 button: that is where it is spent. */
function flyTicket() { const r = document.querySelector('#who .tk')?.getBoundingClientRect(); if (r?.width) flyIcon('ticket', [r.left + 16, r.top + 16], $('d-build')); }
export function markHome() { const b = $('d-home'); if (!b.querySelector('.badge')) b.append(el('span', { class: 'badge' }, '!')); }
function dockState() { const auto = !!S.myDoc && !!S.myDoc.wallet.autoInvest; $('d-auto').classList.toggle('on', auto); $('d-auto-t').textContent = '자동'; $('d-auto').hidden = !S.myDoc; }

let shownCoins = null, shownPermits = null;
export function hud() {
  const { myDoc, mySlot } = S, coins = myDoc ? myDoc.wallet.coins : null;
  $('coinb').hidden = coins == null;
  if (coins !== shownCoins) { const cb = $('coinb'); cb.classList.remove('up', 'down'); if (shownCoins != null && coins != null) { void cb.offsetWidth; cb.classList.add(coins > shownCoins ? 'up' : 'down'); setTimeout(() => cb.classList.remove('down'), 400); }
    shownCoins = coins; $('wallet').textContent = coins == null ? '—' : coins.toLocaleString('ko-KR'); }
  const t = performance.now(); while (earned.length && earned[0][0] < t - 60000) earned.shift();
  const per = earned.reduce((a, e) => a + e[1], 0); $('rate').textContent = myDoc && per ? `+${per}/분` : '';
  if (mySlot && myDoc) { const w = G(), lv = levelOf(w.served), p = Math.min(1, (w.served - w.prevAt) / Math.max(1, w.nextAt - w.prevAt));
    // the ticket fills where it is shown: one notch a guest, up to the next 🎫 (the level ring is just the level)
    const need = Math.max(1, w.nextAt - w.prevAt), notches = Math.min(need, 12), lit = Math.floor(p * notches + 1e-6), got = shownPermits != null && w.permits > shownPermits;
    const tk = el('span', { class: 'tk' + (got ? ' got' : '') }, iconEl('ticket', 24, ''), String(w.permits),
      el('span', { class: 'notch' }, Array.from({ length: notches }, (_, i) => el('i', { class: i < lit ? 'on' : '' }))));
    shownPermits = w.permits; if (got) setTimeout(() => flyTicket(), 50);
    $('who').replaceChildren(el('span', { class: 'lvr', style: '--p:1' }, el('b', {}, String(lv + 1))),
      el('span', { class: 'nm' }, (S.boardName || '한 줄 군도'), el('small', {}, `${mySlot}번 섬 · ${LEVELS[lv].name}`)), tk);
    $('who').title = `다음 허가증까지 손님 ${w.nextAt - w.served}명`;
    const bt = $('d-build'); bt.querySelector('.badge')?.remove(); if (w.permits > 0) bt.append(el('span', { class: 'badge' }, String(w.permits))); bt.classList.toggle('ready', w.permits > 0 && !S.buildMode);
  } else { $('who').replaceChildren(el('span', { class: 'lvr' }, el('b', {}, '?')), el('span', { class: 'nm' }, S.boardName || '한 줄 군도', el('small', {}, '섬 고르기'))); }
  const B = $('boat');
  if (mySlot) { const bp = boatPlan(mySlot), nb = (nextBoat.get(mySlot) ?? 0) - t / 1000, docked = boats.find(b => b.slot === mySlot && b.state !== 'out');
    const cd = Math.ceil(S.callReady - t / 1000), can = bp.shops && !docked && cd <= 0;
    B.hidden = false; B.classList.toggle('callable', !!can); B.classList.toggle('docked', !!docked); B.classList.toggle('idle', !bp.shops);
    $('boatring').style.setProperty('--p', docked || !bp.shops ? 1 : Math.max(0, Math.min(1, 1 - nb / Math.max(1, bp.every))).toFixed(3));
    $('boatn').textContent = docked ? String(docked.people) : bp.shops ? String(bp.people) : '';
    $('boatt').textContent = can ? '부르기!' : docked ? '도착!' : bp.shops ? `${Math.max(0, Math.ceil(nb))}초` : '';
  } else B.hidden = true;
  dockState();
  const dm = sim.demand(); S.unmet = NEED_KEYS.filter(k => !dm[k].served && dm[k].waiting).map(k => [k, dm[k].waiting]);
}

export function initHud() {
  for (const e of document.querySelectorAll('[data-i]')) e.replaceChildren(iconEl(e.dataset.i, 32, ''));
  for (const e of document.querySelectorAll('[data-v]')) e.replaceChildren(voxelEl(e.dataset.v, e.closest('.big') ? 6 : 5));   // the dock buttons are voxel dioramas, rendered once
  $('coinb').querySelector('.cic').replaceChildren(iconEl('coin', 36, ''));
  setInterval(hud, 500); hud();
  // the horn: call the next boat now, then wait for the horn to come back
  $('boat').addEventListener('click', () => {
    if (!callBoat()) return;
  });
  $('d-build').onclick = () => { if (!S.mySlot) return showHome(); if (S.buildMode) return setBuildMode(false); openCards(); };
  $('d-home').onclick = () => { $('d-home').querySelector('.badge')?.remove(); setBuildMode(false); if ($('panel').hidden || S.current) showHome(); else closePanel(); };   // open my island; a second press closes it
  $('d-auto').onclick = () => { if (!S.myDoc || !canWrite()) return; S.myDoc.wallet.autoInvest = !S.myDoc.wallet.autoInvest; save(true); dockState(); toast(!S.myDoc.wallet.autoInvest ? '가구를 직접 들여요' : '가구가 자동으로 들어와요', 1500); };
  $('festp').onclick = () => { if (S.watching) closeInside(); scrollToSlot(S.mySlot); };
}
