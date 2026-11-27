// A shop opens where it stands: the camera comes close, the roof lifts, and the cut-away runs its own simulation.
// Beside it, a few big buttons: the next piece, the best level-up, a helper, one more floor, move, close.
import { PLOT } from '../v2/isles.js';
import { normalize } from '../v2/spec.js';
import { TYPE_KO } from '../v2/catalog.js';
import { roleOf } from '../v2/townsim.js';
import { InsideView } from '../v2/insideview.js';
import { shopRates, bestNext, FIX_INFO, FIX_ROLE, nextUp, costOf, flowCaps, LV_MAX, upgradeCost } from '../v2/inside.js';
import { iconEl } from '../ui/icons.js';
import { BASE_COIN, HELPER_MAX, helperCost, UTIL, fixUse, LOOKS, lookCost } from './rules.js';
import { $, el } from './ui.js';
import { S, me, pr, map, earned, canWrite } from './state.js';
import { allPlots, fixturesOf, ownedOf, helpersOf, levelsOf, starsInfo, starText, ratesOf, boatPlan, nameOf, rebuild, shortOf } from './model.js';
import { noSupply } from './utility.js';
import { save } from './persist.js';
import { applyZoom } from './camera.js';
import { toast, why, flyIcon } from './hud.js';
import { guide, tutEvent, tutInEvent } from './guide.js';
import { closePanel } from './panel.js';
import { setBuildMode, startExtend } from './build.js';
import { startMove } from './move.js';

/** Phones: the cut-away takes the screen's width above a tray of actions at the bottom (side by side there is no room). */
const narrow = () => innerWidth <= 760;   // the same line as the CSS's max-width:760px
export function openShop(key) {
  const p = allPlots().find(x => x.key === key); if (!p?.b) return; S.choosing = false;
  if (S.watching) closeInside(); setBuildMode(false); closePanel();
  const box = $('mapbox'); S.camBefore = { zoom: S.zoom, left: box.scrollLeft, top: box.scrollTop };   // put the camera back where it was when the shop closes
  if (S.zoom !== 1) { S.zoom = 1; applyZoom(); }
  const n = PLOT[p.size], [px, py] = pr.P(p.x + n / 2, p.z + n / 2);
  const lv = normalize(p.b.input).levels;   // taller cut-aways need more room above the building
  box.scrollTo({ left: map.offsetLeft + px - box.clientWidth / 2, top: map.offsetTop + py - box.clientHeight * Math.min(.86, .62 + .12 * (Math.min(lv, 4) - 1)) });
  requestAnimationFrame(() => {
    // the origin does not move when scaling, so the building's base stays where it was on screen
    map.style.transformOrigin = `${px}px ${py}px`; map.style.transform = 'scale(2)';
    const st = $('shopstage'); st.style.left = (narrow() ? innerWidth / 2 : (innerWidth - 270) / 2 + 6) + 'px'; st.style.top = (narrow() ? (innerHeight - 200) / 2 + 40 : innerHeight / 2) + 'px';   // the cut-away takes the middle of the screen; the building behind it lifts away
    $('shopwrap').style.setProperty('--sx', st.style.left); $('shopwrap').style.setProperty('--sy', st.style.top);
    S.zoomShop = { key, t: 0, dir: 1 };
    openInside(key);
  });
}
// how the cut-away is drawn: twice the map's pixels (finer furniture and people, still pixel art) with low plain back walls and a darker floor
const INSIDE = { res: 2, look: { wallH: .45, floor: .78, plainWall: true } };
function openInside(key) {   // the cut-away in place, over the zoomed map (openShop moves the camera first)
  setTimeout(() => tutEvent('inside'), 0);
  const p = allPlots().find(x => x.key === key); if (!p?.b) return;
  const myDoc = S.myDoc, mineP = p.owner === me && !!myDoc?.plots[key] && canWrite(), owned = ownedOf(p);
  const view = new InsideView(p.b.input, owned, {
    every: Infinity, seed: (p.x * 31 + p.z) % 97 + 1, price: shopRates(fixturesOf(p), owned, BASE_COIN[p.size] ?? 1).price,
    maxWidth: narrow() ? innerWidth - 16 : innerWidth - 380, tags: true, maxHeight: narrow() ? innerHeight - 270 : innerHeight - 70, maxZoom: 4, ...INSIDE,
    onThud: () => { const st = $('shopstage'); st.classList.remove('thud'); void st.offsetWidth; st.classList.add('thud'); },
    levels: levelsOf(p),
    upgrade: (i, kind, cost, L) => { if (!mineP || S.myDoc.wallet.coins < cost) return false; { const a = fixUse(kind, L - 1), b = fixUse(kind, L); if (noSupply($('shopacts'), [b[0] - a[0], b[1] - a[1]])) return false; }   // power and water first
      S.myDoc.wallet.coins -= cost; levelsOf(p)[i] = L; S.dirty = true; rebuild(); save(true); view.sim.price = ratesOf(p).price; return true; },
    coins: mineP ? () => S.myDoc.wallet.coins : undefined,
    buy: (i, kind, cost) => { if (S.myDoc.wallet.coins < cost || noSupply($('shopacts'), fixUse(kind))) return false;   // power and water first
      setTimeout(() => { tutEvent('furnish'); tutInEvent('furnish'); }, 300); S.myDoc.wallet.coins -= cost;
      // the new piece means more guests, and guests fill the 🎫: a guest flies from it to the next-🎫 line under my island's name
      setTimeout(() => { const f = view.fx?.[i], r = view.top?.getBoundingClientRect(), tk = document.querySelector('#who small'); if (!f || !r || !tk?.offsetParent || +getComputedStyle(tk.closest('.hud')).opacity < .5) return;
        const [x, y] = view.view.project(f.x, f.y + 1.4, f.z); flyIcon('people', [r.left + x * view.zoom, r.top + y * view.zoom], tk, 28); }, 250); const mp = S.myDoc.plots[key]; mp.own = [...new Set([...ownedOf(p), i])]; mp.fx = mp.own.length; rebuild(); save(true); view.sim.price = ratesOf(p).price; return true; },
  });
  view.sim.setHelpers(helpersOf(p), levelsOf(p));
  S.watching = { key, view, mine: mineP, earned: 0, ins: [], outs: [], losts: [], lost0: 0, inPlace: true, actKey: '' };
  if (mineP && myDoc.wallet.tutIn === undefined) myDoc.wallet.tutIn = 0;   // the first time inside a shop of mine: the inside guide
  $('shopstage').replaceChildren(view.el); $('shopwrap').hidden = false; document.body.classList.add('inshop');
  { const nn = normalize(p.b.input); $('sname').textContent = nn.name || TYPE_KO[nn.type] || '건물'; $('ssub').textContent = `${p.owner === me ? '' : nameOf(p.owner) + '의 가게 · '}${nn.levels}층 · ${TYPE_KO[nn.type] ?? ''}`; $('shophead').hidden = false; }   // top left: back, and which building this is
  view.onFloorChange = () => placeActs(); placeActs(); rebuild(); guide();   // the first time inside, the guide's inside steps start here
}
/** The roof settles back, the camera steps away. Guests still inside pay on the way out. */
export function closeInside() {
  const w = S.watching; if (!w) return;
  const left = w.view.sim.people.filter(q => q.state !== 'out').length;
  if (w.mine && left) { S.myDoc.wallet.coins += left * w.view.sim.price; S.dirty = true; }
  S.watching = null; $('shopwrap').hidden = true; $('shophead').hidden = true; document.body.classList.remove('inshop'); $('shopstage').replaceChildren(); map.style.transform = '';
  if (S.zoomShop) S.zoomShop.dir = -1;
  if (S.camBefore) { const c = S.camBefore; S.camBefore = null;
    if (c.zoom !== S.zoom) { map.style.transition = 'none'; requestAnimationFrame(() => requestAnimationFrame(() => { map.style.transition = ''; })); }
    S.zoom = c.zoom; applyZoom(); $('mapbox').scrollTo({ left: c.left, top: c.top }); }
  rebuild(); guide();
}
/** To the right of the cut-away, level with its middle; from the stage's own place and size, not its on-screen box (that one moves while the stage shakes). */
export function placeActs() {
  if (narrow()) { const a = $('shopacts'); a.style.left = a.style.top = ''; return; }   // the bottom tray (CSS)
  const s0 = $('shopstage'), a = $('shopacts'), cx = parseFloat(s0.style.left) || innerWidth / 2, cy = parseFloat(s0.style.top) || innerHeight / 2;
  a.style.left = Math.min(innerWidth - 240, cx + s0.offsetWidth / 2 + 16) + 'px'; a.style.top = Math.max(150, Math.min(innerHeight - 160, cy)) + 'px';
}
function shopActions(w, p) {
  const fx = fixturesOf(p), own = ownedOf(p), base = (BASE_COIN[p.size] ?? 1) + (p.look ?? 0), lv = levelsOf(p), h = helpersOf(p), coins = S.myDoc.wallet.coins, out = [];
  const caps = (o, l, hh) => flowCaps(fx, o, base, hh ?? h, l ?? lv), sup = w.supply ?? Infinity, now0 = caps(own);
  const gain = (b) => Math.min(b.gpm, sup) - Math.min(now0.gpm, sup);
  const popTxt = (b) => { const d = gain(b); return d > .05 ? `+${d.toFixed(1)}명/분` : b.price > now0.price ? `+${b.price - now0.price}동전` : ''; };
  const gainTxt = (b, idle = '배가 더 자주 와요') => { const d = gain(b); return d > .05 ? `손님 +${d >= 1 ? Math.round(d) : d.toFixed(1)}명/분` : b.price > now0.price ? `한 명 +${b.price - now0.price}동전` : idle; };   // (a new piece brings boats sooner — rules.js boatPlanOf; a level-up only helps once guests queue)
  // what a piece adds to the island's power and water, said after what it brings
  const lvUse = (k, L) => { const a = fixUse(k, L), b = fixUse(k, L + 1); return [b[0] - a[0], b[1] - a[1]]; };
  // the next piece: the one that lifts income most
  const kinds = bestNext(fx, own, base, p.b.input.order, h, lv), up = Object.values(nextUp(fx, own, undefined, p.b.input.order));
  const i = up.find(j => kinds.includes(fx[j].kind)) ?? up.sort((a, b) => costOf(fx[a].kind) - costOf(fx[b].kind))[0];
  if (i !== undefined) { const f = fx[i], c = costOf(f.kind), b = caps(new Set([...own, i])); out.push({ icon: 'chair', title: `${FIX_INFO[f.kind]?.[0] ?? f.kind} 들이기`, sub: gainTxt(b), use: fixUse(f.kind), cost: c, ok: coins >= c, hi: i, run: () => { if (w.view.buyIndex(i)) w.view.thud(i, popTxt(b), 'buy'); } }); }
  // the best level-up
  let best = null; for (const j of own) { const L = lv[j] ?? 1; if (L >= LV_MAX) continue; const b = caps(own, { ...lv, [j]: L + 1 }), c = upgradeCost(fx[j].kind, L), v = (Math.max(0, gain(b)) + (b.price - now0.price) * .5 + .01) / c; if (!best || v > best.v) best = { j, L, c, v, b }; }
  if (best) out.push({ icon: 'up', title: `${FIX_INFO[fx[best.j].kind]?.[0] ?? fx[best.j].kind} Lv${best.L + 1}`, sub: gainTxt(best.b, '손님이 줄 설 때 빨라져요'), use: lvUse(fx[best.j].kind, best.L), cost: best.c, ok: coins >= best.c, hi: best.j, run: () => { if (w.view.upgradeIndex(best.j)) w.view.thud(best.j, `Lv${best.L + 1}! ${popTxt(best.b)}`, 'up'); } });
  // the shop's front, one tier at a time: seen on the map, a coin more a guest
  { const look = S.myDoc.plots[p.key]?.look ?? 0;
    if (look < LOOKS.length) { const c = lookCost(p.size, look); out.push({ icon: 'star', title: `꾸미기 · ${LOOKS[look]}`, sub: '한 명 +1동전 · 지도에서 보여요', cost: c, ok: coins >= c, run: () => {
      if (S.myDoc.wallet.coins < c || !canWrite()) return; S.myDoc.wallet.coins -= c; S.myDoc.plots[p.key].look = look + 1; S.dirty = true; rebuild(); save(true); w.actKey = ''; toast(`${LOOKS[look]} 완료 · 지도에서 보여요`, 2500); } }); } }
  // a helper, when ordering is what holds guests up and the shop is full
  if (i === undefined && now0.order <= now0.seat && h < HELPER_MAX) { const c = helperCost(h); out.push({ icon: 'helper', title: '알바 뽑기', sub: gainTxt(caps(own, lv, h + 1)), cost: c, ok: coins >= c, run: () => { if (S.myDoc.wallet.coins < c) return; S.myDoc.wallet.coins -= c; S.myDoc.plots[p.key].helpers = h + 1; w.view.sim.setHelpers(h + 1); rebuild(); save(true); toast('알바가 왔어요!', 1200); } }); }
  // one more floor, when every piece is in
  if (i === undefined) out.push({ icon: 'extend', title: '한 층 올리기', sub: '새 자리가 생겨요', use: UTIL.floor, run: () => startExtend(p.key, { inShop: true }) });
  out.push({ icon: 'move', title: '옮기기', run: () => { const k = p.key; closeInside(); startMove(k); } });
  return out;
}
export function renderActs(w, p) {
  if (w.extending) return;   // the extension form is showing
  // a price I cannot pay yet fills up as coins come in (in tenths, so the buttons are not rebuilt every coin)
  const coins = S.myDoc?.wallet?.coins ?? 0, fill = (a) => typeof a.cost === 'number' && !a.ok ? Math.min(.9, Math.floor(coins / a.cost * 10) / 10) : null;
  const lacks = (a) => !!a.use && shortOf(a.use) >= 0;   // it needs more power or water than the island supplies
  const acts = w.mine ? shopActions(w, p) : [], key = JSON.stringify(acts.map(a => [a.title, a.sub, a.cost, a.ok, fill(a), lacks(a)]));
  if (key === w.actKey) return; w.actKey = key;
  const box = $('shopacts'), info = w.mine ? null : (() => { const n = normalize(p.b.input), st = roleOf(n.type, n.levels).serves ? starsInfo(p).stars : 0;   // someone else's shop: whose it is, its line, and nothing to buy
    return el('div', { class: 'actinfo' }, el('b', {}, n.name || TYPE_KO[n.type] || '건물'), el('small', {}, `${nameOf(p.owner)}의 가게 · ${n.levels}층`), st ? el('span', { class: 'stars' }, starText(st)) : null, el('q', {}, p.b.line)); })();
  box.replaceChildren(...(info ? [info] : []), ...acts.map(a => { const b = el('button', { class: 'act' + (a.cost !== undefined && a.ok && !lacks(a) ? ' buy' : '') }, iconEl(a.icon, 32), el('span', {}, a.title, a.sub ? el('small', {}, a.sub) : null),
      a.cost !== undefined || a.use?.some(Boolean) ? el('span', { class: 'price' }, ...(a.cost !== undefined ? [typeof a.cost === 'number' ? iconEl('coin', 18) : '', String(a.cost)] : []),
        ...(a.use?.[0] ? [el('span', { class: 'pu' }, iconEl('bolt', 16), String(a.use[0]))] : []), ...(a.use?.[1] ? [el('span', { class: 'pu' }, iconEl('drop', 16), String(a.use[1]))] : [])) : null);   // beside the price: what it uses
    const f = fill(a);
    if (lacks(a)) {   // the island's power or water first: the window says which, and upgrades it
      b.classList.add('short'); b.style.setProperty('--fill', 0); b.onclick = (e) => { e.stopPropagation(); noSupply(b, a.use, () => { w.actKey = ''; a.run(); }); w.actKey = ''; };
    } else if (f !== null) {   // not enough coins: still pressable — it says how far
      b.classList.add('short'); b.style.setProperty('--fill', f);
      b.onclick = (e) => { e.stopPropagation(); why(b, { icon: 'coin', title: `동전 ${(a.cost - coins).toLocaleString('ko-KR')}개 더`, gauge: [coins, a.cost] }); };   // (it fills as coins come in; no other button here)
    } else { b.disabled = a.cost !== undefined && !a.ok; b.onclick = (e) => { e.stopPropagation(); a.run(); w.actKey = ''; }; }
    if (a.hi !== undefined) { b.onmouseenter = () => { w.view.sel = -1; w.view.flash = a.hi; }; b.onmouseleave = () => { w.view.flash = -1; }; }
    return b; }));   // (closing is the back button at the top left, or Esc)
  placeActs();
}
/** Run the open shop for one frame: its guests, who pays, where it is slow, and the buttons beside it. */
let istatT = 0;
export function stepInside(dt) {
  const w = S.watching; if (!w) return;
  const paid = w.view.frame(dt), t = performance.now(), keep = (a) => { while (a.length && a[0] < t - 60000) a.shift(); };
  for (const e of paid) w.outs.push(t);
  const lostNow = w.view.sim.stats.lostLine + w.view.sim.stats.lostSeat; for (let k = w.lost0; k < lostNow; k++) w.losts.push(t); w.lost0 = lostNow;
  keep(w.ins); keep(w.outs); keep(w.losts);
  const span = Math.max(15, Math.min(60, (t - (w.opened ??= t)) / 1000)), per = (a) => a.length / span * 60;
  const p = allPlots().find(x => x.key === w.key);
  { const bp = p ? boatPlan(p.slot) : null, expect = bp && bp.shops ? bp.people / bp.every * 60 / bp.shops : 0;
    w.supply = (t - w.opened) / 1000 > 30 ? Math.max(per(w.ins), .5) : Math.max(expect, per(w.ins)); }
  if (p) { const fx = fixturesOf(p), fc = flowCaps(fx, ownedOf(p), BASE_COIN[p.size] ?? 1, helpersOf(p), levelsOf(p)), isim = w.view.sim;
    const q = isim.counters.reduce((n, c) => n + c.q.length, 0) + isim.kitchen.length;
    // the slow step: guests (0), ordering (1) or seats (2); its owned fixtures steam when guests pile up there
    const slow = w.supply < Math.min(fc.order, fc.seat) ? 0 : fc.slow === 'seat' ? 2 : 1; w.slow = slow;
    if (w.inPlace) renderActs(w, p);
    const roles = slow === 2 ? ['seat'] : slow === 1 ? ['serve', 'cook'] : [];
    w.view.blocked = new Set([...ownedOf(p)].filter(j => roles.includes(FIX_ROLE(fx[j].kind)) && (q >= 2 || w.losts.length))); }
  for (const e of paid) { w.earned += e.n; if (w.mine) { earned.push([performance.now(), e.n]); S.myDoc.wallet.coins += e.n; S.dirty = true; } }
  if ((istatT += dt) < .3) return; istatT = 0;
  if (w.mine && p) w.view.suggest = new Set(bestNext(fixturesOf(p), ownedOf(p), BASE_COIN[p.size] ?? 1, p.b.input.order, helpersOf(p), levelsOf(p)));   // what raises income most: its price tag bobs
}
export function initShop() {
  $('sback').replaceChildren(iconEl('back', 28, '')); $('sback').onclick = (e) => { e.stopPropagation(); closeInside(); };
  $('shopwrap').addEventListener('click', (e) => { if (e.target === $('shopwrap')) closeInside(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') closeInside(); });
  // the phone turned (portrait ↔ landscape): the cut-away was sized for the other shape, so it opens again for this one.
  // Only a turn: a phone's toolbars and keyboard change the height as a finger lands, and reopening then looked like a reload.
  let t = 0, wide0 = innerWidth > innerHeight;
  addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => {
    const wide = innerWidth > innerHeight; if (wide === wide0) return; wide0 = wide;
    const k = S.watching?.key; if (!k || S.watching.extending || document.activeElement?.tagName === 'INPUT') return;
    closeInside(); setTimeout(() => openShop(k), 450); }, 250); });
}
