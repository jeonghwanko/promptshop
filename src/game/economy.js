// The running economy: what the walkers' events pay, boats bringing guests, the festival boat, VIP guests,
// supplies refilling themselves and furniture coming in by itself.
import { dockOf } from '../v2/isles.js';
import { NEED_KEYS } from '../v2/townsim.js';
import { normalize } from '../v2/spec.js';
import { shopRates, bestNext, FIX_INFO, nextUp, costOf, LV_MAX, upgradeCost } from '../v2/inside.js';
import { START_STOCK, RESTOCK, BASE_COIN, vipBonus, FEST, festNeeds, festCapacity, festTip, festStars, festBonus } from './rules.js';
import { S, me, sim, pops, earned, boats, nextBoat, canWrite } from './state.js';
import { hooks, allPlots, fixturesOf, ownedOf, helpersOf, levelsOf, starsInfo, ratesOf, servesOf, islandShops, boatPlan, countGuest, rebuild } from './model.js';
import { save } from './persist.js';
import { toast, celebrate, flyCoin, flyCoinNow, festHud } from './hud.js';

const earn = (n) => { S.myDoc.wallet.coins += n; earned.push([performance.now(), n]); };
const useStock = (key, n) => { const p = S.myDoc.plots[key]; if (p) p.stock = Math.max(0, (p.stock ?? START_STOCK) - (n ?? 1)); };
function vip(e, t) { const p = allPlots().find(q => q.key === e.lot), b = vipBonus(p ? starsInfo(p).stars : 3); earn(b); pops.push({ key: e.lot, text: `👑 VIP +${b}`, mine: true, t }); }

/** What the map's walkers did since the last frame: payments, guests walking into an open shop, empty shops. */
export function takeEvents() {
  for (const e of sim.events.splice(0)) {
    const mine = !!me && e.owner === me && canWrite();   // only the tab that holds my island counts what it earns
    if (e.kind === 'empty') { pops.push({ key: e.lot, text: '재료 없음', mine, bad: true, t: 0 }); continue; }
    if (e.kind === 'enter') {   // the guest walks into the shop we are looking inside, and pays at the table there
      if (mine && e.fest) festServed(e);
      if (mine) { countGuest(); useStock(e.lot, e.used); S.dirty = true; }
      if (mine && e.vip) vip(e, 0);
      const w = S.watching; if (w?.key === e.lot) { w.view.sim.spawn(); const ps = w.view.sim.people; if (e.vip && ps.length) ps[ps.length - 1].vip = true; w.ins.push(performance.now()); } continue;
    }
    if (mine && e.vip) vip(e, -.4);
    if (mine && e.fest) festServed(e);
    if (mine) flyCoin(e.lot);
    if (mine) { hooks.happened('coin'); countGuest(); earn(e.coins); useStock(e.lot, e.used); S.dirty = true; }
    pops.push({ key: e.lot, text: '+' + e.coins, mine, t: 0 });
  }
}

// ---------- the first guests: before my island has any building, a few wait at my pier for one ----------
// (they are what the faces at the bottom ask for; when the first shop opens, the ones it serves walk in and the rest leave)
const FIRST = ['food', 'food', 'cafe', 'shop'];
function firstGuests() {
  const mine = S.mySlot && S.myDoc && canWrite(), empty = mine && !Object.keys(S.myDoc.plots).length;
  const waiting = sim.people.filter(p => p.first);
  if (!empty) { for (const p of waiting) { p.first = false; p.patience = undefined; p.since = sim.t; } return; }   // a shop now: ordinary guests again
  if (waiting.length || S.building || !sim.roads.length) return;
  const d = dockOf(S.mySlot); FIRST.forEach((need, k) => { const p = sim.spawn(d.road, k * .5, need, d.road); if (p) { p.first = true; p.patience = 1e9; } });
}

// ---------- boats: customers come by sea to islands that have shops ----------
export function stepBoats(dt) {
  const t = performance.now() / 1000; firstGuests();
  for (const s of S.world.joined) {
    const shops = islandShops(s); if (!shops.length) { nextBoat.delete(s); continue; }
    if (!nextBoat.has(s)) nextBoat.set(s, t + 3);
    if (t >= nextBoat.get(s) && !boats.some(b => b.slot === s && b.state !== 'out')) {   // a leaving boat does not hold up the next one
      const d = dockOf(s), bp = boatPlan(s); boats.push({ slot: s, x: d.out[0] + .5, z: d.out[1] + .5, to: [d.stop[0] + .5, d.stop[1] + .5], state: 'in', wait: 0, shops, people: bp.people, t: 0 });
      nextBoat.set(s, t + bp.every);
    }
  }
  for (const b of boats) {
    b.t += dt;
    if (b.state === 'wait') { b.wait -= dt; if (b.wait <= 0) { const d = dockOf(b.slot); b.state = 'out'; b.to = [d.out[0] + .5, d.out[1] + .5]; } continue; }
    const dx = b.to[0] - b.x, dz = b.to[1] - b.z, dist = Math.hypot(dx, dz), v = 4 * dt;
    if (dist <= v) {
      b.x = b.to[0]; b.z = b.to[1];
      if (b.state === 'in') {   // unload: most want what this island sells
        const d = dockOf(b.slot), wants = [...new Set(b.shops.map(servesOf))];
        for (let k = 0; k < b.people; k++) sim.spawn(d.road, k * .45, Math.random() < .75 ? wants[k % wants.length] : NEED_KEYS[Math.floor(Math.random() * NEED_KEYS.length)], d.road);
        b.state = 'wait'; b.wait = 4;
      } else b.done = true;
    } else { b.x += dx / dist * v; b.z += dz / dist * v; }
  }
  for (let i = boats.length - 1; i >= 0; i--) if (boats[i].done) boats.splice(i, 1);
}

// ---------- the festival boat: now and then a big boat shows on the horizon; a minute later its crowd lands all at once ----------
// what it brings is shown in advance, so the owner can get the shops ready; how many get served is the score
/** Who comes: for each kind my shops serve, a little more than those shops can take in the window, plus a few nobody serves. */
function festNeedsNow() {
  const can = {};
  for (const p of islandShops(S.mySlot)) { const need = servesOf(p); if (need) can[need] = (can[need] ?? 0) + festCapacity(ratesOf(p)); }
  return festNeeds(can, NEED_KEYS);
}
const perMinute = () => { const t = performance.now(); return earned.filter(e => e[0] > t - 60000).reduce((a, e) => a + e[1], 0); };
export function stepFest(dt) {
  const t = performance.now() / 1000, { mySlot } = S;
  let fest = S.fest;
  if (!fest) {
    if (!S.myDoc || !mySlot || !canWrite() || hooks.guiding(false) || t < S.nextFest) return;
    const shops = islandShops(mySlot).length; if (!shops) { S.nextFest = t + 30; return; }
    const needs = festNeedsNow(), total = Object.values(needs).reduce((a, b) => a + b, 0), d = dockOf(mySlot), from = [d.out[0] + .5, d.out[1] + .5 + 10 * Math.sign(d.out[1] - d.stop[1] || 1)];
    S.fest = { id: Math.floor(t), state: 'coming', t0: t, arrive: t + FEST.warn, total, needs, tip: festTip(perMinute()), people: [], served: 0, tips: 0, x: from[0], z: from[1], from, to: [d.stop[0] + .5, d.stop[1] + .5], bt: 0 };
    return;
  }
  fest.bt += dt;
  if (fest.state === 'coming') {
    const u = Math.min(1, (t - fest.t0) / FEST.warn), e = 1 - (1 - u) ** 2; fest.x = fest.from[0] + (fest.to[0] - fest.from[0]) * e; fest.z = fest.from[1] + (fest.to[1] - fest.from[1]) * e;
    if (t >= fest.arrive) {   // landing: everyone off, a few at a time
      fest.state = 'here'; fest.landed = t; const d = dockOf(mySlot); let k = 0;
      for (const [need, n] of Object.entries(fest.needs)) for (let i = 0; i < n; i++, k++) { const p = sim.spawn(d.road, k * .22, need, d.road); if (p) { p.fest = fest.id; p.patience = FEST.patience; fest.people.push(p); } }
      celebrate('🎉 축제 손님 도착!', `${fest.total}명`);
    }
  } else if (fest.state === 'here') {
    const left = fest.people.filter(p => !p.festServed && !p.gone && p.mood !== 2).length;
    if (!left || t - fest.landed > FEST.window) {   // the result: how many got served, as stars; three stars add half the tips again
      const st = festStars(fest.served, fest.total), bonus = festBonus(st, fest.tips);
      if (bonus && canWrite()) { earn(bonus); S.dirty = true; }
      celebrate(`${'★'.repeat(st)}${'☆'.repeat(3 - st)} 축제 ${fest.served}/${fest.total}`, `팁 +${fest.tips + bonus}동전${bonus ? ' (★3 보너스 포함)' : ''}${fest.total - fest.served ? ` · ${fest.total - fest.served}명 돌아감` : ''}`);
      fest.state = 'leave'; fest.left = t;
    }
  } else if (fest.state === 'leave') {
    const u = Math.min(1, (t - fest.left) / 6); fest.x = fest.to[0] + (fest.from[0] - fest.to[0]) * u * u; fest.z = fest.to[1] + (fest.from[1] - fest.to[1]) * u * u;
    if (u >= 1) { S.fest = null; S.nextFest = t + FEST.every; }
  }
  festHud();
}
function festServed(e) { const fest = S.fest; if (!fest || e.fest !== fest.id) return; const tip = fest.tip; fest.served++; fest.tips += tip; earn(tip); pops.push({ key: e.lot, text: `🎉+${tip}`, mine: true, t: -.2 }); flyCoinNow(e.lot); S.dirty = true; }
/** For checks: the festival boat comes now and lands in `sec` seconds. */
export function festSoon(sec = 3) {
  S.nextFest = performance.now() / 1000;
  const t = setInterval(() => { const f = S.fest; if (!f) return; clearInterval(t); f.arrive = performance.now() / 1000 + sec; f.t0 = f.arrive - FEST.warn; }, 50);   // once the boat exists
  setTimeout(() => clearInterval(t), 5000);
}

// ---------- furniture comes in by itself (when the owner turns it on) ----------
// every 3 s, the next piece (of any shop) that raises income most per coin, keeping enough for the next batch of supplies
function autoInvest() {
  const myDoc = S.myDoc;
  if (!myDoc || !canWrite() || !myDoc.wallet.autoInvest || hooks.guiding(true)) return;
  const mineServing = allPlots().filter(p => p.owner === me && p.b && servesOf(p));
  let best = null;
  for (const p of mineServing) {
    const fx = fixturesOf(p), owned = ownedOf(p), order = p.b.input.order, base = BASE_COIN[p.size] ?? 1;
    const kinds = bestNext(fx, owned, base, order, helpersOf(p), levelsOf(p)), up = Object.values(nextUp(fx, owned, undefined, order)); if (!up.length) continue;
    // the piece that raises income most; when none does, the cheapest next piece (every piece still brings boats sooner)
    const i = up.find(j => kinds.includes(fx[j].kind)) ?? up.sort((a, b) => costOf(fx[a].kind) - costOf(fx[b].kind))[0];
    const r0 = shopRates(fx, owned, base, helpersOf(p), levelsOf(p)), r1 = shopRates(fx, new Set([...owned, i]), base, helpersOf(p), levelsOf(p)), cost = costOf(fx[i].kind);
    const value = (Math.max(0, r1.price / r1.interval - r0.price / r0.interval) + 1e-4) / cost;
    if (!best || value > best.value) best = { p, i, cost, value, kind: fx[i].kind };
  }
  const w = S.watching;
  if (!best) {   // every shop is full: level up what lifts income most per coin
    for (const p of mineServing) {
      const fx = fixturesOf(p), lv = levelsOf(p), base = BASE_COIN[p.size] ?? 1, r0 = shopRates(fx, ownedOf(p), base, helpersOf(p), lv);
      for (const j of ownedOf(p)) { const L = lv[j] ?? 1; if (L >= LV_MAX) continue; const r1 = shopRates(fx, ownedOf(p), base, helpersOf(p), { ...lv, [j]: L + 1 }), cost = upgradeCost(fx[j].kind, L);
        const value = (r1.price / r1.interval - r0.price / r0.interval) / cost; if (value > 0 && (!best || value > best.value)) best = { p, j, cost, value, kind: fx[j].kind, L }; } }
    if (!best || myDoc.wallet.coins - best.cost < RESTOCK.coins) return;
    myDoc.wallet.coins -= best.cost; levelsOf(best.p)[best.j] = best.L + 1;
    pops.push({ key: best.p.key, text: `${FIX_INFO[best.kind]?.[0] ?? best.kind} Lv${best.L + 1} -${best.cost}`, mine: true, t: 0 });
    if (w?.key === best.p.key) { w.view.levels[best.j] = best.L + 1; w.view.sim.setLevels(w.view.levels); }
    rebuild(); save(true); return;
  }
  if (myDoc.wallet.coins - best.cost < RESTOCK.coins) return;
  const mp = myDoc.plots[best.p.key]; if (!mp) return;
  myDoc.wallet.coins -= best.cost; mp.own = [...new Set([...ownedOf(best.p), best.i])]; mp.fx = mp.own.length;
  pops.push({ key: best.p.key, text: `${FIX_INFO[best.kind]?.[0] ?? best.kind} -${best.cost}`, mine: true, t: 0 });
  if (w?.key === best.p.key) { w.view.owned.add(best.i); w.view.sim.setOwned(w.view.owned); w.view.redraw(); w.view.sim.price = ratesOf(best.p).price; }
  rebuild(); save(true); hooks.plotChanged(best.p.key);
}
// VIP guests: a shop with ★3 or more brings one now and then, wearing a crown; they tip 6 coins a star
const nextVip = new Map();
function vipGuests() {
  if (!S.myDoc || !S.mySlot || !canWrite()) return; const t = performance.now() / 1000;
  for (const p of allPlots()) {
    if (p.owner !== me || !p.b) continue; const need = servesOf(p); if (!need) continue;
    const st = starsInfo(p).stars; if (st < 3) { nextVip.delete(p.key); continue; }
    if (!nextVip.has(p.key)) nextVip.set(p.key, t + 20);
    if (t < nextVip.get(p.key)) continue;
    nextVip.set(p.key, t + 70 - 10 * st);
    const d = dockOf(S.mySlot); sim.spawn(d.road, 0, need, d.road, true);
    if (!document.querySelector('#guide:not([hidden]):not(.min)')) toast(`👑 VIP 손님이 ${normalize(p.b.input).name || '가게'}에 와요!`, 2200);   // not over 끼룩이 while it explains
  }
}
// supplies refill themselves: a shop at 2 or fewer buys the next batch when the wallet allows
function restock() {
  const myDoc = S.myDoc; if (!myDoc || !canWrite()) return; let any = false;
  for (const [key, p] of Object.entries(myDoc.plots)) {
    if (!p.b || !servesOf(p)) continue;
    if ((p.stock ?? START_STOCK) > 2 || myDoc.wallet.coins < RESTOCK.coins) continue;
    myDoc.wallet.coins -= RESTOCK.coins; p.stock = (p.stock ?? START_STOCK) + RESTOCK.units; any = true;
    pops.push({ key, text: `재료 +${RESTOCK.units} · -${RESTOCK.coins}`, mine: true, t: 0 });
  }
  if (any) { rebuild(); save(true); if (S.current?.key && myDoc.plots[S.current.key]) hooks.plotChanged(S.current.key); }
}
export function initEconomy() { setInterval(autoInvest, 3000); setInterval(vipGuests, 1000); setInterval(restock, 1000); }
