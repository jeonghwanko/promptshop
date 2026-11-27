// The vault at my pier: while nobody plays, the island keeps trading at a twentieth of its live pace (net of the bill),
// for up to eight hours, and the takings wait in a chest by the pier. Tapping it pours them into the wallet.
// (2026-11-28, a reason to come back: the week's economy is in rules.js; the numbers were checked against a 7-day simulation.)
import { VAULT, UTIL, billOf, LEVELS, levelOf } from './rules.js';
import { renderVoxels } from '../v2/render.js';
import { dockOf, centerOf } from '../v2/isles.js';
import { S, pr, g, canWrite } from './state.js';
import { hooks, G, islandShops, ratesOf, boatPlan, myUse, myPlots } from './model.js';
import { save, track } from './persist.js';
import { toast, flyCoinNow } from './hud.js';

/** What my island makes in a minute when played: guests that come and get served, their coins, the bill. */
export function liveRate() {
  const shops = islandShops(S.mySlot); if (!shops.length) return { coins: 0, served: 0, bill: 0 };
  const bp = boatPlan(S.mySlot), arrive = bp.people * 60 / bp.every * .9, rates = shops.map(ratesOf);
  const cap = rates.reduce((a, r) => a + 60 / r.interval, 0), served = Math.min(arrive, cap);
  const price = rates.reduce((a, r) => a + r.price / r.interval, 0) / rates.reduce((a, r) => a + 1 / r.interval, 0);
  return { coins: served * price, served, bill: myPlots().length >= UTIL.billFrom ? billOf(myUse()) : 0 };
}

/** When this tab takes my island: fill the vault for the time it was away (wallet.seenAt is stamped by every save, persist.js). */
export function fillVault() {
  if (!S.myDoc || !S.mySlot || !canWrite()) return;
  const w = G(), now = Date.now(), seen = w.seenAt;
  if (!seen) return;   // a new island, or one from before the vault: it starts counting from its next save
  const min = Math.min((now - seen) / 60000, VAULT.hours * 60); if (min < VAULT.minMinutes) return;
  const r = liveRate(), per = Math.max(0, r.coins - r.bill) * VAULT.share, cap = per * VAULT.hours * 60;
  const coins = Math.floor(per * min), served = Math.floor(r.served * VAULT.share * min); if (coins <= 0) return;
  const v = w.vault ?? { coins: 0, served: 0, min: 0 };
  w.vault = { coins: Math.min(Math.floor(cap), v.coins + coins), served: v.served + served, min: Math.min(VAULT.hours * 60, v.min + Math.round(min)) };
  w.seenAt = now; S.dirty = true;
}

// ---------- the chest on my pier ----------
let chest = null;
function chestSprite() {   // a voxel chest, lid open, full of coins: drawn like the buildings (same light, outline), doubled into chunky pixels
  if (chest) return chest;
  const V = [], put = (x, y, z, c) => V.push([x, y, z, c]), W = 8, D = 6, H = 4;
  for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) for (let y = 0; y < H; y++) {
    if (!(x === 0 || x === W - 1 || z === 0 || z === D - 1) && y > 0) continue;
    put(x, y, z, y === 2 || x === 0 || x === W - 1 ? '#c8864e' : '#f0b272');
  }
  for (const [x, y] of [[3, 1], [4, 1], [3, 2], [4, 2]]) put(x, y, D - 1, '#ffd84a');   // the lock
  for (let x = 1; x < W - 1; x++) for (let z = 1; z < D - 1; z++) { put(x, 1, z, '#ffe27a'); put(x, 2, z, '#ffe27a'); put(x, 3, z, (x + z) % 2 ? '#ffd84a' : '#fff0a8'); if ((x * 3 + z) % 5 === 0) put(x, 4, z, '#fff6cc'); }
  for (let x = 0; x < W; x++) for (let y = H; y < H + 4; y++) put(x, y, -1, y === H + 3 || x === 0 || x === W - 1 ? '#c8864e' : '#e09c5e');   // the lid, open behind
  const c = renderVoxels(V, { k: 3 }), o = document.createElement('canvas'); o.width = c.width * 2; o.height = c.height * 2;
  const og = o.getContext('2d'); og.imageSmoothingEnabled = false; og.drawImage(c, 0, 0, o.width, o.height);
  return chest = o;
}
// one step in from the road's end at my pier: in front of the power board and the water tank, which stand either side of that end
const tile = () => { const [rx, rz] = dockOf(S.mySlot).road, inward = Math.sign(centerOf(S.mySlot)[1] - rz) || 1; return [rx, rz + inward]; };
const spot = () => { const [x, z] = tile(), [px, py] = pr.P(x + .5, z + .5); return [Math.round(px), Math.round(py)]; };
const hasVault = () => !!(S.myDoc && S.mySlot && S.myDoc.wallet?.vault?.coins > 0);

/** Into the map's depth-sorted list: the chest, bobbing a little, its takings over it in outlined figures. */
export function drawVault(items, tops) {
  if (!hasVault()) return;
  const [x, z] = tile(), [px, py] = spot(), c = chestSprite(), bob = Math.round(Math.sin(performance.now() / 300)) * 2;
  tops['@vault'] = [px, py - c.height + 10];
  items.push({ d: x + z + .6, draw: () => {
    g.imageSmoothingEnabled = false; g.drawImage(c, Math.round(px - c.width / 2), Math.round(py - c.height + 14 + bob));
    const t = '+' + S.myDoc.wallet.vault.coins.toLocaleString('ko-KR');
    g.font = '400 16px "Jua", "Noto Sans KR", sans-serif'; g.textAlign = 'center'; g.lineWidth = 4; g.strokeStyle = '#1f3a5c';
    g.strokeText(t, px, py - c.height + 6 + bob); g.fillStyle = '#ffd166'; g.fillText(t, px, py - c.height + 6 + bob);
  } });
}
/** Is a tap (map pixels) on the chest? */
export function vaultAt(sx, sy) { if (!hasVault()) return false; const [px, py] = spot(), c = chestSprite(); return Math.abs(sx - px) < c.width / 2 + 6 && sy > py - c.height - 14 && sy < py + 14; }

/** Pour the vault into the wallet: coins fly to the purse, the guests count toward the next level, one line says what happened. */
export function openVault() {
  if (!hasVault() || !canWrite()) return false;
  const w = G(), v = w.vault, lv0 = levelOf(w.served ?? 0);
  w.coins += v.coins; w.served = (w.served ?? 0) + v.served; delete w.vault; S.dirty = true; save(true);
  for (let i = 0; i < 9; i++) setTimeout(() => flyCoinNow('@vault'), i * 70);
  track('vault_open', { coins: v.coins, min: v.min, served: v.served });
  const h = v.min >= 60 ? `${Math.round(v.min / 60)}시간` : `${v.min}분`;
  toast(`자리 비운 ${h} 동안 손님 ${v.served.toLocaleString('ko-KR')}명 · +${v.coins.toLocaleString('ko-KR')}동전`, 4000);
  const lv = levelOf(w.served); if (lv > lv0) track('level', { lv, by: 'vault' }); if (lv > lv0) setTimeout(() => hooks.celebrate(`${LEVELS[lv].name}로 성장!`, lv < 3 ? `이제 ${LEVELS[lv].size} 크기 건물을 지을 수 있어요` : `섬이 ${LEVELS[lv].name}가 됐어요`), 1200);
  return true;
}
