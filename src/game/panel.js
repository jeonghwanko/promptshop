// The side panel: my island (permits, stats, land, neighbours), joining a slot, someone else's island,
// a building's card; also widening my island, half bridges and demolishing.
import { SLOTS, centerOf, neighbours, bridgeId, setLand, landSize, LAND_MAX, GAP } from '../v2/isles.js';
import { normalize } from '../v2/spec.js';
import { TYPE_KO } from '../v2/catalog.js';
import { roleOf } from '../v2/townsim.js';
import { renderView } from '../v2/render.js';
import { iconEl } from '../ui/icons.js';
import { START_COINS, BRIDGE, PLOTS_PER_LAND, LAND_COST, LAND_LEVEL, LEVELS, levelOf } from './rules.js';
import { $, el, xbtn } from './ui.js';
import { S, db, me, isOwner, COL, now } from './state.js';
import { nameOf, maxPlots, allPlots, starsInfo, starText, tilesOf, boatPlan, G, rebuild } from './model.js';
import { save } from './persist.js';
import { scrollToSlot } from './camera.js';
import { toast, celebrate } from './hud.js';
import { guide } from './guide.js';
import { openShop } from './shop.js';
import { startMove } from './move.js';

const panel = () => $('panel');
/** Fill the panel: the first child, when it is an h2, is the title on the dark strip with the close button. */
export const show = (...kids) => { const p = panel(); p.hidden = false; const list = kids.flat().filter(Boolean), h = list[0]?.tagName === 'H2' ? list.shift() : el('h2', {});
  p.replaceChildren(el('div', { class: 'ph' }, h, xbtn(closePanel)), ...list); p.scrollTop = 0; };
export function closePanel() { panel().hidden = true; S.current = null; S.joinShown = false; }
export const panelOpen = () => !panel().hidden;

function inviteCard() {
  const empty = []; for (let s = 1; s <= SLOTS; s++) if (!S.owners.has(s)) empty.push(s);
  if (!empty.length) return null;
  return el('div', { class: 'card tile' }, iconEl('people', 40, ''), el('span', { class: 'tt' }, el('b', {}, `빈 섬 ${empty.length}개`), el('small', {}, '공유 메뉴로 친구 초대')));
}
function bridgeCards() {
  const { mySlot } = S; if (!mySlot) return [];
  return neighbours(mySlot).map(n => {
    const uid = S.owners.get(n), id = bridgeId(mySlot, n), h = S.world.bridges.get(id), mineHalf = mySlot < n ? h?.a : h?.b, theirs = mySlot < n ? h?.b : h?.a;
    if (!uid) return el('span', {}, `${n}번 · 빈 섬`);
    if (mineHalf && theirs) return el('span', { class: 'ok' }, `${n}번 · ${nameOf(uid)} ✓`);
    if (mineHalf) return el('span', {}, `${n}번 · ${nameOf(uid)} · 반쪽`);
    const btn = el('button', { class: 'gold', on: { click: () => halfBridge(n) } }, el('span', { class: 'pr' }, iconEl('coin', 20, ''), String(BRIDGE))); btn.disabled = S.myDoc.wallet.coins < BRIDGE;
    return el('div', { class: 'card tile' + (theirs ? ' alert' : '') }, iconEl('island', 40, ''), el('span', { class: 'tt' }, el('b', {}, `${n}번 · ${nameOf(uid)}`), el('small', {}, theirs ? '반쪽이 와 있어요' : '다리 반쪽')), btn);
  });
}
// widening my island: one ring of land a step, more buildings allowed
function landCard() {
  const { myDoc, mySlot } = S, k = myDoc.land ?? 0;
  if (k >= LAND_MAX) return el('div', { class: 'card tile' }, iconEl('sprout', 40, ''), el('span', { class: 'tt' }, el('b', {}, `땅 ${k}/${LAND_MAX}`), el('small', {}, '끝까지 넓혔어요')));
  const lv = levelOf(G().served), need = LAND_LEVEL[k], cost = LAND_COST[k], locked = lv < need;
  setLand(mySlot, k); const now0 = landSize(mySlot); setLand(mySlot, k + 1); const gain = landSize(mySlot) - now0; setLand(mySlot, k);
  const b = el('button', { class: 'gold', on: { click: () => widen() } }, el('span', { class: 'pr' }, locked ? iconEl('lock', 20, '') : iconEl('coin', 20, ''), locked ? `Lv.${need + 1}` : String(cost)));
  b.disabled = locked || myDoc.wallet.coins < cost;
  return el('div', { class: 'card tile' + (!b.disabled ? ' alert' : '') }, iconEl('sprout', 40, ''), el('span', { class: 'tt' }, el('b', {}, `땅 넓히기 ${k}/${LAND_MAX}`), el('small', {}, `+${gain}칸 · 건물 +${PLOTS_PER_LAND}`)), b);
}
async function widen() {
  const { myDoc, mySlot } = S, k = myDoc.land ?? 0, cost = LAND_COST[k]; if (k >= LAND_MAX || myDoc.wallet.coins < cost) return;
  setLand(mySlot, k); const was = new Set(tilesOf(mySlot).map(t => t + ''));
  const old = S.ground;   // the coast as it was, shown while the new ring rises
  myDoc.wallet.coins -= cost; myDoc.land = k + 1; rebuild(); save(true);
  const [cx, cz] = centerOf(mySlot), fresh = tilesOf(mySlot).filter(t => !was.has(t + ''));
  // new land rises from the sea, from the old coast outward, like a wave going round the island
  const d0 = Math.min(...fresh.map(([x, z]) => Math.hypot(x - cx, z - cz)));
  const a = S.landAnim = { old, t: 0, tiles: fresh.map(([x, z]) => ({ x, z, at: (Math.hypot(x - cx, z - cz) - d0) * .35 + ((Math.atan2(z - cz, x - cx) + Math.PI) / (2 * Math.PI)) * .9 + Math.random() * .08, splashed: false })) };
  a.end = Math.max(...a.tiles.map(t => t.at)) + .5;
  closePanel(); scrollToSlot(mySlot); toast('🌱 땅이 솟아올라요…', 1600);
  setTimeout(() => { celebrate('🌱 땅이 넓어졌어요!', `땅 +${fresh.length}칸 · 이제 건물 ${maxPlots()}채까지`); }, a.end * 1000 + 100);
}

export function showHome(msg) {
  S.current = null; S.joinShown = false;
  const { myDoc, mySlot } = S;
  if (!mySlot) {
    const can = db && me; S.joinShown = true;
    return show(el('h2', {}, S.boardName || '한 줄 군도'),
      can ? el('h3', {}, '내 섬 고르기') : el('p', { class: 'note' }, '초대받으면 섬을 고를 수 있어요'),
      can ? el('div', { class: 'slots' }, Array.from({ length: SLOTS }, (_, i) => i + 1).map(s => { const b = el('button', { class: S.owners.has(s) ? 'ghost' : '', on: { click: () => join(s) } }, String(s)); b.disabled = S.owners.has(s); return b; })) : null,
      msg ? el('div', { class: 'err' }, msg) : null);
  }
  const mine = Object.keys(myDoc.plots).length, w = G(), lv = levelOf(w.served), bp = boatPlan(mySlot), pct = Math.min(100, (w.served - w.prevAt) / Math.max(1, w.nextAt - w.prevAt) * 100);
  const stat = (ic, big, small) => el('div', { class: 'stat' }, iconEl(ic, 32, ''), el('b', {}, big), el('small', {}, small));
  const bridges = bridgeCards();
  show(el('h2', {}, `${mySlot}번 섬 `, el('small', {}, `Lv.${lv + 1} ${LEVELS[lv].name}`)),
    el('div', { class: 'card tile' }, iconEl('ticket', 40, ''), el('span', { class: 'tt' }, el('b', {}, `허가증 ${w.permits}`), el('div', { class: 'lvbar' }, Object.assign(el('i'), { style: `width:${pct}%` })), el('small', {}, `손님 ${w.nextAt - w.served}명 더`))),
    el('div', { class: 'stats3' }, stat('people', w.served.toLocaleString('ko-KR'), '받은 손님'), stat('boat', bp.shops ? `${bp.every}초` : '—', bp.shops ? `${bp.people}명씩` : '가게 없음'), stat('door', `${mine}/${maxPlots()}`, '건물')),
    landCard(), msg ? el('div', { class: 'err' }, msg) : null,
    el('h3', {}, '이웃'), el('div', { class: 'nb' }, bridges.filter(x => x.tagName === 'SPAN')), ...bridges.filter(x => x.tagName !== 'SPAN'), inviteCard());
}
async function join(s) {
  if (S.owners.has(s)) return showHome('그 섬은 이미 주인이 있어요.');
  S.myDoc = { slot: s, at: now(), gap: GAP, plots: {}, half: {}, wallet: { coins: START_COINS, permits: 1, tut: 0 } };
  S.docs.set(me, S.myDoc); rebuild(); await save(true); closePanel(); scrollToSlot(s); guide();
}
async function halfBridge(n) {
  const { myDoc } = S;
  if (myDoc.wallet.coins < BRIDGE) return showHome(`다리 반쪽에는 ${BRIDGE} 동전이 필요해요.`);
  myDoc.wallet.coins -= BRIDGE; myDoc.half = { ...myDoc.half, [n]: now() }; rebuild(); await save(true); showHome();
}
export function showIsland(s) {
  const uid = S.owners.get(s);
  if (!uid) return show(el('h2', {}, `${s}번 섬 · 빈 섬`), inviteCard(), S.mySlot ? null : el('button', { on: { click: () => join(s) } }, '이 섬에 살기'), el('button', { class: 'ghost', on: { click: () => showHome() } }, '돌아가기'));
  if (s === S.mySlot) return showHome();
  const ps = allPlots().filter(p => p.slot === s && p.b);
  show(el('h2', {}, `${s}번 섬 · ${nameOf(uid)}`), el('div', { class: 'note' }, `건물 ${ps.length}채`),
    el('div', { class: 'chips' }, ps.map(p => el('button', { on: { click: () => showBuilding(p.key) } }, normalize(p.b.input).name || TYPE_KO[normalize(p.b.input).type]))),
    el('button', { class: 'ghost', on: { click: () => showHome() } }, '돌아가기'));
}
export function showBuilding(key) {
  const p = allPlots().find(x => x.key === key); if (!p?.b) return showHome();
  S.current = { kind: 'info', key };
  const n = normalize(p.b.input), role = roleOf(n.type, n.levels), mineP = p.owner === me, st = role.serves ? starsInfo(p).stars : 0;
  show(el('h2', {}, n.name || TYPE_KO[n.type] || '건물', ' ', el('small', {}, `${nameOf(p.owner)} · ${n.levels}층`)),
    st ? el('div', { class: 'stars' }, starText(st)) : null,
    el('div', { class: 'quote' }, `“${p.b.line}”`), el('div', { class: 'pics' }, renderView(p.b.input, 'ext').canvas),
    el('div', { class: 'row' }, el('button', { class: 'gold', id: mineP ? 'go-inside' : null, on: { click: () => { closePanel(); openShop(p.key); } } }, mineP ? '가게 안으로' : '안 구경하기'),
      mineP ? el('button', { class: 'ghost', on: { click: () => startMove(p.key) } }, '↔ 옮기기') : null,
      me && (mineP || isOwner) ? el('button', { class: 'warn', on: { click: () => demolish(p) } }, '철거') : null));
}
async function demolish(p) {
  if (p.owner === me) { const ps = { ...S.myDoc.plots }; delete ps[p.key]; S.myDoc.plots = ps; rebuild(); await save(true); return showHome(); }
  try { const ref = db.doc(COL + '/' + p.owner), cur = await ref.get(), data = cur.data() ?? {}; const ps = { ...(data.plots ?? {}) }; delete ps[p.key]; await ref.set({ ...data, plots: ps }); showHome(); } catch { showHome('철거하지 못했어요.'); }
}
