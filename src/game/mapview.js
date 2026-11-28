// Drawing the archipelago each frame: the ground (or new land rising), buildings, walkers, boats and the building site
// sorted by depth, then island labels, floating words, stars, empty-stock marks and what my pier's guests cannot find.
import { join } from './panel.js';
import { SLOTS, centerOf, PLOT, dockOf, neighbours, bridgeTiles, placePlot } from '../v2/isles.js';
import { BRIDGE } from './rules.js';
import { renderView, stampSign } from '../v2/render.js';
import { normalize } from '../v2/spec.js';
import { drawWaves } from '../v2/ground.js';
import { drawVault } from './vault.js';
import { drawGuest } from './special.js';
import { drawPerson } from '../v2/townview.js';
import { iconCanvas, EMOJI } from '../ui/icons.js';
import { START_STOCK } from './rules.js';
import { S, me, pr, map, g, sim, pops, boats, splash, FROM } from './state.js';
import { allPlots, starsInfo, servesOf, nameOf, isOff, roadPath, plantTiles, slotUse, slotSupply, useOf, waterOn, takenSet, tilesOf } from './model.js';
import { heldBack } from './utility.js';
import { site, drawSite, drawFestBoat, drawBoat } from './mapfx.js';
import { mapXY, toScreen, tagXY } from './camera.js';
import { NEED_ICON } from './hud.js';
import { picking, pickSpot } from './guide.js';
import { placeLog } from './buildlog.js';
import { placeAsk } from './build.js';

// each building is rendered once into a sprite (with its alpha, for picking by pixel)
// at half resolution, then doubled: the map's chunky pixels (the ground is painted the same way, see ground.js)
function chunky({ canvas: c, anchor, sign }) {
  const o = document.createElement('canvas'); o.width = c.width * 2; o.height = c.height * 2; const og = o.getContext('2d');
  og.imageSmoothingEnabled = false; og.drawImage(c, 0, 0, o.width, o.height); if (sign) stampSign(o, sign, 2);   // the sign's picture in crisp map pixels
  return { canvas: o, anchor: { x: anchor.x * 2, y: anchor.y * 2 } };
}
const sprites = new Map();
function sprite(p) {
  const k = p.key + ':' + p.b.at + ':' + (p.look ?? 0), s = sprites.get(p.key); if (s && s.k === k) return s;
  try { const spec = normalize(p.b.input); spec.look = p.look ?? 0; const { canvas, anchor } = chunky(renderView(spec, 'ext', { res: .5 })), alpha = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    // the roof's top: the first painted row near the building's middle (the picture has room above it, and props stand to the sides)
    const W = canvas.width, x0 = Math.max(0, Math.round(anchor.x - W / 10)), x1 = Math.min(W, Math.round(anchor.x + W / 10)), painted = (y) => { for (let x = x0; x < x1; x++) if (alpha[(y * W + x) * 4 + 3] > 40) return true; return false; };
    let top = 0; while (top < canvas.height - 1 && !painted(top)) top++;
    const n = { canvas, anchor, k, alpha, top }; sprites.set(p.key, n); return n; } catch { return null; }
}
// the unbuilt part of a building is promised as a faint dark silhouette of its own shape (no glow)
const silC = document.createElement('canvas'), silG = silC.getContext('2d');
function silhouette(src, color = '#3a2a1c') {
  const w = src.width, h = src.height; if (silC.width !== w || silC.height !== h) { silC.width = w; silC.height = h; }
  silG.globalCompositeOperation = 'source-over'; silG.clearRect(0, 0, w, h); silG.drawImage(src, 0, 0); silG.globalCompositeOperation = 'source-atop'; silG.fillStyle = color; silG.fillRect(0, 0, w, h); return silC;
}
/** Draw src at (x0, y0) filled up from the ground to `edge` (px from its top): a faint silhouette above, the real thing below a
 *  ragged edge (each 4 px column a little off, like courses being laid). */
function filled(src, x0, y0, edge, w, h) {
  g.save(); g.globalAlpha = .22; g.drawImage(silhouette(src), x0, y0); g.restore();
  g.save(); g.beginPath(); for (let c = 0; c < w; c += 4) { const top = Math.max(0, edge + ((c / 4 * 7) % 3) * 2); g.rect(x0 + c, y0 + top, 4, h - top); } g.clip(); g.drawImage(src, x0, y0); g.restore();
}
// A building in front that covers much of one behind it turns see-through where that one stands (every other chunky pixel), so every shop stays in
// sight: only the covered part, only while it covers. Worked out when the layout changes, not every frame.
const GHOST_MIN = .2, GHOST_A = 1;   // the see-through part is a pixel checker (a blend read as a render fault)
let ghostSig = '', ghosts = new Map();
const SOLID = 200;   // the body only: a sprite's cast shadow is see-through (about 90) and must not count
function bodyOf(sp) { if (sp.body) return sp.body; const c = document.createElement('canvas'); c.width = sp.canvas.width; c.height = sp.canvas.height; const cg = c.getContext('2d'), im = cg.createImageData(c.width, c.height);
  for (let i = 3; i < sp.alpha.length; i += 4) if (sp.alpha[i] > SOLID) im.data[i] = 255; cg.putImageData(im, 0, 0); return sp.body = c; }
function ghostsFor(list) {   // list: [{ key, s, x0, y0, d }]
  const sig = list.map(o => o.key + '@' + o.x0 + ',' + o.y0 + ':' + o.s.k).join('|'); if (sig === ghostSig) return ghosts;
  ghostSig = sig; ghosts = new Map();
  const opaque = (o) => o.n ??= (() => { let n = 0; for (let i = 3; i < o.s.alpha.length; i += 4) if (o.s.alpha[i] > SOLID) n++; return n; })();
  for (const A of list) {
    const behind = [];
    for (const B of list) { if (B === A || B.d >= A.d) continue;
      const aw = A.s.canvas.width, ah = A.s.canvas.height, bw = B.s.canvas.width, bh = B.s.canvas.height;
      const X0 = Math.max(A.x0, B.x0), Y0 = Math.max(A.y0, B.y0), X1 = Math.min(A.x0 + aw, B.x0 + bw), Y1 = Math.min(A.y0 + ah, B.y0 + bh);
      if (X1 <= X0 || Y1 <= Y0) continue;
      let cov = 0; for (let y = Y0; y < Y1; y += 2) for (let x = X0; x < X1; x += 2) if (B.s.alpha[((y - B.y0) * bw + x - B.x0) * 4 + 3] > SOLID && A.s.alpha[((y - A.y0) * aw + x - A.x0) * 4 + 3] > SOLID) cov += 4;
      if (cov / Math.max(1, opaque(B)) >= GHOST_MIN) behind.push(B); }
    if (!behind.length) continue;
    const W = A.s.canvas.width, H = A.s.canvas.height, mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
    const mask = mk(), mg = mask.getContext('2d'); for (const B of behind) mg.drawImage(bodyOf(B.s), B.x0 - A.x0, B.y0 - A.y0);
    const solid = mk(), sg = solid.getContext('2d'); sg.drawImage(A.s.canvas, 0, 0); sg.globalCompositeOperation = 'destination-out'; sg.drawImage(mask, 0, 0);
    const ghost = mk(), gg = ghost.getContext('2d'); gg.drawImage(A.s.canvas, 0, 0); gg.globalCompositeOperation = 'destination-in'; gg.drawImage(mask, 0, 0);
    const through = gg.getImageData(0, 0, W, H).data;   // the whole see-through area (taps there go to the one behind), before the checker
    { const im = gg.getImageData(0, 0, W, H), dd = im.data; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (((x >> 1) + (y >> 1)) & 1) dd[(y * W + x) * 4 + 3] = 0; gg.putImageData(im, 0, 0); }   // a checker of chunky pixels, not a blend
    ghosts.set(A.key, { solid, ghost, through });
  }
  return ghosts;
}
/** A building with no power: its picture with the colour drained out (cached on the sprite). */
function offOf(sp) {
  if (sp.off) return sp.off; const c = document.createElement('canvas'); c.width = sp.canvas.width; c.height = sp.canvas.height; const cg = c.getContext('2d');
  cg.drawImage(sp.canvas, 0, 0); const im = cg.getImageData(0, 0, c.width, c.height), d = im.data;
  for (let i = 0; i < d.length; i += 4) { if (!d[i + 3]) continue; const L = d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11;
    d[i] = (L * .75 + d[i] * .25) * .86 + 6; d[i + 1] = (L * .75 + d[i + 1] * .25) * .86 + 10; d[i + 2] = (L * .75 + d[i + 2] * .25) * .86 + 22; }
  cg.putImageData(im, 0, 0); return sp.off = c;
}
/** Over a roof with no power: a grey bolt, outlined. */
let greyBolt = null;
function offMark(x, y) {
  if (!greyBolt) { const ic = iconCanvas('bolt'); if (!ic) return; const c = document.createElement('canvas'); c.width = ic.width; c.height = ic.height; const cg = c.getContext('2d'); cg.drawImage(ic, 0, 0);
    const im = cg.getImageData(0, 0, c.width, c.height), d = im.data; for (let i = 0; i < d.length; i += 4) { const L = d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11; d[i] = L * .8 + 20; d[i + 1] = L * .8 + 26; d[i + 2] = L * .8 + 40; } cg.putImageData(im, 0, 0); greyBolt = c; }
  g.imageSmoothingEnabled = false; g.drawImage(greyBolt, Math.round(x - 7), Math.round(y - 20), 14, 14);
}
/** The building under a pointer (its picture's own pixels, frontmost first), or null. */
export function buildingAt(e) { const [sx, sy] = mapXY(e);
  for (const it of [...S.drawn].reverse()) { if (!it.s) continue; const x = Math.floor(sx - (it.px - it.s.anchor.x)), y = Math.floor(sy - (it.py - it.s.anchor.y));
    if (x >= 0 && y >= 0 && x < it.s.canvas.width && y < it.s.canvas.height && it.s.alpha[(y * it.s.canvas.width + x) * 4 + 3] > 40 && !(it.gh && it.gh.through[(y * it.s.canvas.width + x) * 4 + 3] > 40)) return it.key; }   // see-through: the one behind takes the tap
  return null; }

/** New land rises from the sea, from `center` outward like a wave going round; `old` is the ground as it was. Returns when it ends (s). */
export function riseLand(old, tiles, [cx, cz]) {
  if (!tiles.length) return 0;
  const d0 = Math.min(...tiles.map(([x, z]) => Math.hypot(x - cx, z - cz)));
  const a = S.landAnim = { old, t: 0, tiles: tiles.map(([x, z]) => ({ x, z, at: (Math.hypot(x - cx, z - cz) - d0) * .35 + ((Math.atan2(z - cz, x - cx) + Math.PI) / (2 * Math.PI)) * .9 + Math.random() * .08, splashed: false })) };
  return a.end = Math.max(...a.tiles.map(t => t.at)) + .5;
}
function drawLandAnim(dt) {   // old coast, then each new tile rising into place, with spray
  const a = S.landAnim; a.t += dt;
  g.drawImage(a.old, 0, 0);
  for (const tl of a.tiles) {
    const u = Math.max(0, Math.min(1, (a.t - tl.at) / .45)); if (u <= 0) continue;
    if (!tl.splashed) { tl.splashed = true; const [px, py] = pr.P(tl.x + .5, tl.z + .5); for (let i = 0; i < 6; i++) splash.push({ x: px + (Math.random() - .5) * 18, y: py, vx: (Math.random() - .5) * 50, vy: -50 - Math.random() * 60, t: 0 }); }
    const e = 1 - (1 - u) ** 3, dy = (1 - e) * 14 - Math.sin(u * Math.PI) * 3;   // comes up from below, overshoots a little
    const c = [pr.P(tl.x, tl.z), pr.P(tl.x + 1, tl.z), pr.P(tl.x + 1, tl.z + 1), pr.P(tl.x, tl.z + 1)];
    g.save(); g.beginPath(); c.forEach(([x, y], i) => i ? g.lineTo(x, y + dy) : g.moveTo(x, y + dy)); g.closePath(); g.clip();
    g.globalAlpha = .35 + .65 * e; g.drawImage(S.ground, 0, dy);
    g.globalAlpha = (1 - u) * .7; g.fillStyle = '#fff6c8'; g.fill(); g.restore();   // a flash as it surfaces
  }
  if (a.t > a.end) S.landAnim = null;
}
/** Wood chips over a bridge's planks: my half just laid (half) or the whole bridge done. */
export function planks(a, b, half) {
  const t = bridgeTiles(a, b), part = half ? t.slice(0, Math.ceil(t.length / 2)) : t;
  part.forEach(([x, z], i) => setTimeout(() => { const [px, py] = pr.P(x + .5, z + .5); for (let k = 0; k < 5; k++) splash.push({ x: px + (Math.random() - .5) * 14, y: py - 2, vx: (Math.random() - .5) * 50, vy: -30 - Math.random() * 40, t: 0, wood: true }); }, i * 70));
}
function drawSplash(dt) {
  for (const p of splash) { p.t += dt; p.vy += 160 * dt; p.x += p.vx * dt; p.y += p.vy * dt; g.globalAlpha = Math.max(0, 1 - p.t / .7); g.fillStyle = p.spark ? (p.t < .25 ? '#fff6c8' : '#ffd166') : p.wood ? (p.t < .25 ? '#e0a868' : '#8a5a32') : p.dust ? (p.t < .25 ? '#e8d8b0' : '#b89a6a') : p.t < .25 ? '#ffffff' : '#bfe3f2'; g.fillRect(Math.round(p.x), Math.round(p.y), 3, 3); }
  g.globalAlpha = 1; for (let i = splash.length - 1; i >= 0; i--) if (splash[i].t > .7) splash.splice(i, 1);
}
const outline = (x, z, n, color) => { const pts = [pr.P(x, z), pr.P(x + n, z), pr.P(x + n, z + n), pr.P(x, z + n)]; g.strokeStyle = color; g.lineWidth = 2; g.beginPath(); pts.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b))); g.closePath(); g.stroke(); };

/** Choosing an island: its 'live here' button sits on the island itself (no window), and moves to the one tapped. */
function placeJoin() {
  let b = document.getElementById('joinbtn'); const s = picking() && !S.fest ? pickSpot() : 0;
  if (!s) { if (b) b.hidden = true; return; }
  if (!b) { b = document.createElement('button'); b.id = 'joinbtn'; b.className = 'gold joinb'; b.textContent = '이 섬에 살기'; b.onclick = (e) => { e.stopPropagation(); b.disabled = true; join(+b.dataset.s).finally(() => { b.disabled = false; }); }; document.body.append(b); }
  const [cx, cz] = centerOf(s), [x, y] = toScreen(...pr.P(cx, cz)); b.hidden = false; b.dataset.s = s;
  b.style.left = Math.round(x - b.offsetWidth / 2) + 'px'; b.style.top = Math.round(y - b.offsetHeight / 2) + 'px';
}
// ---------- power and water on the map ----------
// Every island has a power plant (a post of lamps: one lit per unit used) and a water tank (its level drops as water is used)
// on the shore by its pier. Power poles carry a sagging cable along the road to each building; the water pipe stays under
// the road, shown only while a building is being connected or the tank is open. A new building is dark until power reaches it.
let lineWorld = null; const lineCache = new Map();
function pathsOf(p) {
  if (lineWorld !== S.world) { lineWorld = S.world; lineCache.clear(); }
  const k = p.key + ':' + p.door; if (!lineCache.has(k)) { const pt = plantTiles(p.slot), r = p.door && roadPath(dockOf(p.slot).road, p.door); lineCache.set(k, r ? { power: [pt[0], ...r], water: [pt[1], ...r] } : null); }
  return lineCache.get(k);
}
const poleAt = ([x, z]) => { const [px, py] = pr.P(x + .5, z + .5); return [Math.round(px - 9), Math.round(py - 2)]; };   // beside the road, not on it
/** Poles every other tile along the cables, each pole and each span drawn once however many cables share it. */
function drawPoles(all) {
  const poles = new Map(), spans = new Map();
  for (const p of all) { if (!p.b) continue; const ps = pathsOf(p)?.power; if (!ps) continue;
    const keep = ps.filter((t, i) => i === 0 || i === ps.length - 1 || i % 2 === 0); let prev = null;
    for (const t of keep.slice(1)) { const k = t.join(); poles.set(k, t); if (prev) spans.set(prev.join() + '|' + k, [prev, t]); prev = t; }
    if (keep.length > 1) spans.set('plant' + p.slot + '|' + keep[1].join(), [null, keep[1], p.slot]); }
  g.save(); g.lineWidth = 1; g.strokeStyle = 'rgba(46,36,26,.75)';
  for (const [a, b, slot] of spans.values()) { const [x0, y0] = a ? poleAt(a) : plantTop(slot), [x1, y1] = poleAt(b), y0t = a ? y0 - 14 : y0, sag = 4;
    g.beginPath(); g.moveTo(x0, y0t); g.quadraticCurveTo((x0 + x1) / 2, Math.max(y0t, y1 - 14) + sag, x1, y1 - 14); g.stroke(); }
  for (const t of poles.values()) { const [x, y] = poleAt(t); g.fillStyle = '#6b4a2a'; g.fillRect(x, y - 15, 2, 15); g.fillStyle = '#4a3220'; g.fillRect(x - 3, y - 15, 8, 2); }
  g.restore();
}
/** The water pipe of a building (or of all of them) at road level. */
function drawPipe(p, upto = 1) {
  const ws = pathsOf(p)?.water; if (!ws) return; const n = Math.max(2, Math.ceil(ws.length * upto));
  g.save(); g.strokeStyle = 'rgba(95,182,224,.9)'; g.lineWidth = 2; g.beginPath(); ws.slice(0, n).forEach(([x, z], i) => { const [px, py] = pr.P(x + .5, z + .5); i ? g.lineTo(px + 6, py + 2) : g.moveTo(px, py); }); g.stroke(); g.restore();
}
/** Where the cable leaves the plant: the top of its lamp post. */
function plantTop(slot) { const [x, z] = plantTiles(slot)[0], [px, py] = pr.P(x + .5, z + .5), cap = slotSupply(slot)[0]; const per = Math.min(6, Math.ceil(cap / 2)); return [Math.round(px), Math.round(py - 16 - Math.ceil(cap / per) * 7)]; }   // (the board stands 6 px up on its posts)
/** A building being connected: how far along (0–1), or null. */
function connectU(key) { const c = S.connect; if (!c || c.key !== key) return null; const u = (performance.now() - c.t0) / c.dur; if (u > 1.4) { S.connect = null; return null; } return u; }
function drawPlants(items) {
  const t = performance.now(), blink = Math.floor(t / 280) % 2 === 0;
  for (const slot of S.owners.keys()) { const tiles = plantTiles(slot), use = slotUse(slot), sup = slotSupply(slot), hold = heldBack(slot), mine = slot === S.mySlot, d = mine ? S.preview : null;
    const left = [sup[0] - use[0] + hold[0], sup[1] - use[1] + hold[1]], grow = mine && S.plantGrow && t - S.plantGrow.t0 < 500 ? S.plantGrow : null;
    const squash = (k) => grow?.k === k ? 1 - .15 * Math.sin(Math.min(1, (t - grow.t0) / 500) * Math.PI) : 1;
    // the power plant: a low cabinet with its lamps on top, lit = power left (all lit at first; each building takes one away)
    { const [x, z] = tiles[0], [px, py] = pr.P(x + .5, z + .5), cap = sup[0], per = Math.min(6, Math.ceil(cap / 2)), rows = Math.ceil(cap / per), k = squash(0);
      items.push({ d: x + z + .5, draw: () => { g.save(); g.translate(Math.round(px), Math.round(py)); g.scale(1, k);
        g.fillStyle = 'rgba(23,63,120,.28)'; g.beginPath(); g.ellipse(0, 1, 15, 6, 0, 0, 7); g.fill();
        // a wooden lamp board on two posts (a thing in the world, not a panel): lit lamps = power left
        const W = Math.max(22, per * 7 + 6) + 2 & ~1, H = 10 + rows * 7 + 1 & ~1, lift = 6;
        g.fillStyle = '#7a5238'; g.fillRect(-W / 2 + 2, -lift - 2, 2, lift + 2); g.fillRect(W / 2 - 4, -lift - 2, 2, lift + 2);
        g.fillStyle = '#7a5238'; g.fillRect(-W / 2, -H - lift, W, H); g.fillStyle = '#c98a4e'; g.fillRect(-W / 2 + 2, -H - lift + 2, W - 4, H - 4);
        g.fillStyle = '#e8b27a'; g.fillRect(-W / 2, -H - lift, W, 2); g.fillStyle = '#a8703e'; for (let y = -H - lift + 6; y < -lift - 2; y += 4) g.fillRect(-W / 2 + 2, y, W - 4, 1);
        for (let i = 0; i < cap; i++) { const r = Math.floor(i / per), c = i % per, lx = Math.round(-per * 3.5 + c * 7), ly = -H - lift + 4 + r * 7;
          const lit = i < left[0], going = d && lit && i >= left[0] - d[0];
          if (lit && !(going && !blink)) { g.fillStyle = 'rgba(255,214,102,.35)'; g.fillRect(lx - 1, ly - 1, 7, 7); }
          g.fillStyle = lit ? (going && !blink ? '#b0905a' : '#ffd166') : '#6b4630'; g.fillRect(lx, ly, 5, 5); }
        g.restore();
        if (mine && left[0] <= 0) warnMark(Math.round(px), Math.round(py - H - lift - 16));   // no lamp left: it asks to be grown before anything is built
      } });
    }
    // the water tank (from 동네 on): a wooden barrel with a glass strip, its water the water left
    if (waterOn(slot)) { const [x, z] = tiles[1], [px, py] = pr.P(x + .5, z + .5), cap = sup[1], k = squash(1), H = 24, f = Math.max(0, left[1]) / cap, fd = d ? Math.max(0, left[1] - d[1]) / cap : f;
      items.push({ d: x + z + .5, draw: () => { g.save(); g.translate(Math.round(px), Math.round(py)); g.scale(1, k);
        g.fillStyle = 'rgba(23,63,120,.28)'; g.beginPath(); g.ellipse(0, 1, 13, 5, 0, 0, 7); g.fill();
        g.fillStyle = '#8a5a32'; g.fillRect(-10, -H, 20, H); g.fillStyle = '#a8703e'; g.fillRect(-10, -H, 20, 3); g.fillStyle = '#5a3a1e'; g.fillRect(-10, -H + 7, 20, 2); g.fillRect(-10, -6, 20, 2);
        g.fillStyle = '#2f4a6a'; g.fillRect(-3, -H + 3, 6, H - 5);
        const wh = Math.round((H - 5) * (blink ? fd : f)); g.fillStyle = '#5fb6e0'; g.fillRect(-2, -2 - wh, 4, wh); g.fillStyle = '#bfe6f7'; g.fillRect(-2, -2 - wh, 4, 1);
        g.restore(); if (mine && left[1] <= 0) warnMark(Math.round(px), Math.round(py - H - 16)); } });
    }
  }
}
/** A small red mark that bobs over the plant or tank of mine that has nothing left. */
function warnMark(x, y) { const b = Math.round(Math.sin(performance.now() / 220) * 2); u.fillStyle = '#c0392b'; u.beginPath(); u.arc(x, y + b, 8, 0, 7); u.fill(); u.strokeStyle = '#2e241a'; u.lineWidth = 2; u.stroke(); u.fillStyle = '#fff'; u.font = '900 11px "Noto Sans KR", sans-serif'; u.textAlign = 'center'; u.fillText('!', x, y + b + 4); }
/** A point a fraction u along a polyline of tiles, at cable height (dy) or road level. */
function along(tiles, u, dy, start) {
  const pts = tiles.map((t, i) => i === 0 && start ? start : (() => { const [x, y] = dy ? poleAt(t) : pr.P(t[0] + .5, t[1] + .5); return [x, y - dy]; })());
  const len = []; let L = 0; for (let i = 1; i < pts.length; i++) { L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); len.push(L); }
  const want = Math.max(0, Math.min(1, u)) * L; let i = len.findIndex(l => l >= want); if (i < 0) i = len.length - 1;
  const l0 = i ? len[i - 1] : 0, f = (want - l0) / Math.max(1, len[i] - l0), a = pts[i], b = pts[i + 1] ?? a; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}
function drawConnect() {
  const c = S.connect; if (!c) return; const p = allPlots().find(q => q.key === c.key); const u = connectU(c.key); if (!p || u == null || u < 0 || u > 1) return; const ps = pathsOf(p); if (!ps) return;
  if (waterOn(p.slot)) drawPipe(p, u);
  // the light leaves the plant along the cable: the cable it has passed glows and each pole head it reaches lights up
  const tiles = ps.power, keep = tiles.filter((t, i) => i === 0 || i === tiles.length - 1 || i % 2 === 0), pts = [plantTop(p.slot), ...keep.slice(1).map(t => { const [x, y] = poleAt(t); return [x, y - 14]; })];
  const len = [0]; for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const want = u * len[len.length - 1];
  g.save(); g.globalCompositeOperation = 'lighter';
  for (const [w, col] of [[5, 'rgba(255,200,90,.25)'], [2, 'rgba(255,230,150,.9)']]) { g.lineWidth = w; g.strokeStyle = col; g.beginPath(); g.moveTo(...pts[0]);
    for (let i = 1; i < pts.length; i++) { if (len[i] <= want) { g.lineTo(...pts[i]); continue; } const f = (want - len[i - 1]) / (len[i] - len[i - 1]); g.lineTo(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f); break; } g.stroke(); }
  for (let i = 1; i < pts.length; i++) if (len[i] <= want) { g.fillStyle = 'rgba(255,214,102,.5)'; g.fillRect(pts[i][0] - 3, pts[i][1] - 3, 7, 7); g.fillStyle = '#fff1b8'; g.fillRect(pts[i][0] - 1, pts[i][1] - 1, 3, 3); }
  g.restore();
}
/** Coins flying from each building to its power plant when the bill is paid. */
function drawBillFly(dt, tops) {
  const f = S.billFly; if (!f?.length || !S.mySlot) return; const [gx, gy] = plantTop(S.mySlot), ci = iconCanvas('coin');
  for (const c of f) { c.t += dt; if (c.t < 0) continue; const tp = tops[c.key]; if (!tp) { c.t = 9; continue; } const u = Math.min(1, c.t / .7), x = tp[0] + (gx - tp[0]) * u, y = tp[1] + (gy - tp[1]) * u - Math.sin(u * Math.PI) * 40;
    lab.getContext('2d').globalAlpha = u < .9 ? 1 : (1 - u) * 10; lab.getContext('2d').drawImage(ci, Math.round(x - 6), Math.round(y - 6), 12, 12); lab.getContext('2d').globalAlpha = 1; }
  S.billFly = f.filter(c => c.t < .7);
}
/** The moment power reaches a building: a burst of light specks from its front, once. */
function lightUp(p, px, py) { const c = S.connect; if (!c || c.key !== p.key || c.lit) return; c.lit = true; for (let i = 0; i < 14; i++) splash.push({ x: px + (Math.random() - .5) * 30, y: py - 10 - Math.random() * 30, vx: (Math.random() - .5) * 80, vy: -30 - Math.random() * 50, t: 0, spark: true }); }
/** Dark: a building being connected (before the light reaches it) or cut off for an unpaid bill. */
const isDark = (p) => { const u = connectU(p.key); return (u != null && u < 1) || isOff(p); };
// a face picked with the window closed: every spot on my island where a building of the size fits glows, softly breathing,
// until one is tapped (then the window opens there)
let choice = { k: '', spots: [] };
function choiceSpots() {
  const k = S.choiceAt + ':' + S.size + ':' + Object.keys(S.myDoc?.plots ?? {}).length; if (choice.k === k) return choice.spots;
  const n = PLOT[S.size], taken = takenSet(), spots = [], seen = new Set();
  for (const [x, z] of tilesOf(S.mySlot)) { if (seen.has(x + ',' + z)) continue; if (placePlot(S.world, S.mySlot, x, z, n, taken)) { spots.push({ x, z }); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) seen.add((x + i) + ',' + (z + j)); } }
  choice = { k, spots }; return spots;
}
function drawChoice() {
  if (!S.choosing || !S.mySlot || S.buildMode) return; const n = PLOT[S.size], a = .45 + .35 * Math.sin((performance.now() - S.choiceAt) / 260);
  g.save(); g.globalAlpha = Math.max(.15, a); for (const s of choiceSpots()) { const pts = [pr.P(s.x, s.z), pr.P(s.x + n, s.z), pr.P(s.x + n, s.z + n), pr.P(s.x, s.z + n)];
    g.fillStyle = 'rgba(255,209,102,.18)'; g.strokeStyle = '#ffd166'; g.lineWidth = 2; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); g.stroke(); }
  g.restore();
}
// Words and marks over the map (names, stars, coin pops, bridge tags) on a layer at the screen's own resolution, in map
// coordinates: the map canvas is pixel art scaled up with the zoom, and text drawn into it blurs and breaks when zoomed in.
const lab = document.createElement('canvas'), u = lab.getContext('2d'); lab.className = 'maplabels'; map.after(lab);
function labelLayer() {
  const d = window.devicePixelRatio || 1, W = Math.round(innerWidth * d), H = Math.round(innerHeight * d);
  if (lab.width !== W || lab.height !== H) { lab.width = W; lab.height = H; }
  u.setTransform(1, 0, 0, 1, 0, 0); u.clearRect(0, 0, W, H);
  const r = map.getBoundingClientRect(), k = r.width / map.width; u.setTransform(d * k, 0, 0, d * k, d * r.left, d * r.top); u.imageSmoothingEnabled = false;
}
/** Draw one frame of the map. */
export function drawMap(dt) {
  labelLayer();
  const { hover, moving, building, myDoc, mySlot } = S;
  for (const p of pops) p.t += dt; while (pops.length && pops[0].t > 1.4) pops.shift();
  g.clearRect(0, 0, map.width, map.height); if (S.landAnim) drawLandAnim(dt); else g.drawImage(S.ground, 0, 0);
  { const box = map.parentElement, z = S.zoom || 1, x0 = (box.scrollLeft - map.offsetLeft) / z, y0 = (box.scrollTop - map.offsetTop) / z;   // only what is on screen
    drawWaves(g, S.ground.waves, performance.now() / 1000, [x0, y0, x0 + box.clientWidth / z, y0 + box.clientHeight / z]); }
  drawChoice();
  S.mapGround?.(g);   // a toy's marks on the ground (the ledger toy's wet roads and routes): under every building
  if (hover && !building) outline(hover.x, hover.z, moving ? PLOT[moving.size] : PLOT[S.size], hover.idle ? 'rgba(255,255,255,.7)' : hover.door || hover.swap ? '#2fbf71' : '#e2432f');
  if (moving) { const mp0 = myDoc.plots[moving.key]; if (mp0) outline(mp0.x, mp0.z, PLOT[mp0.size], 'rgba(255,255,255,.55)'); }
  const all = allPlots(); if (!S.zoomShop) { drawPoles(all); if (S.showPipe) for (const p of all) if (p.slot === mySlot && p.b) drawPipe(p); drawConnect(); }
  if (S.current?.key) { const p = all.find(x => x.key === S.current.key); if (p) outline(p.x, p.z, PLOT[p.size], '#ffd166'); }
  const items = [], tops = {};
  if (moving && hover) { const p = all.find(q => q.key === moving.key), sp = p && sprite(p); if (sp) { const n = PLOT[p.size], [px, py] = pr.P(hover.x + n / 2, hover.z + n / 2), lift = 10 + Math.sin(performance.now() / 160) * 2;
    items.push({ d: 1e9, draw: () => { g.globalAlpha = .85; g.drawImage(sp.canvas, Math.round(px - sp.anchor.x), Math.round(py - sp.anchor.y - lift)); g.globalAlpha = 1; } }); } }
  const zs = S.zoomShop; if (zs) { zs.t = Math.max(0, Math.min(1, zs.t + zs.dir * dt / .4)); if (zs.dir < 0 && zs.t === 0) S.zoomShop = null; }
  const zoomShop = S.zoomShop;
  const ghostMap = zoomShop || moving ? new Map() : ghostsFor(all.filter(p => p.b && S.landing?.key !== p.key).map(p => { const s = sprite(p); if (!s) return null; const n = PLOT[p.size], [px, py] = pr.P(p.x + n / 2, p.z + n / 2);
    return { key: p.key, s, x0: Math.round(px - s.anchor.x), y0: Math.round(py - s.anchor.y), d: p.x + p.z + n }; }).filter(Boolean));
  for (const p of all) { if (!p.b || (moving && p.key === moving.key)) continue; const s = sprite(p); if (!s) continue;
    const n = PLOT[p.size], [px, py] = pr.P(p.x + n / 2, p.z + n / 2);
    if (zoomShop?.key === p.key) { const u = zoomShop.t; if (u >= 1) continue; const e = u * u;   // the roof lifts away from an opened shop
      items.push({ d: p.x + p.z + n, draw: () => { g.globalAlpha = 1 - e; g.drawImage(s.canvas, Math.round(px - s.anchor.x), Math.round(py - s.anchor.y - e * 60)); g.globalAlpha = 1; } }); continue; }
    tops[p.key] = [px, py - s.anchor.y + s.top + 6];   // just over the roof
    const lt = S.landing?.key === p.key ? performance.now() - S.landing.t0 : 1e9;
    if (lt < 450) {   // just finished: the rest fills in, it lights up for an instant, one squash beat (the foot stays put)
      const r0 = S.landing.rev0 ?? 1, fillU = Math.min(1, lt / 120), rev = r0 + (1 - r0) * (1 - (1 - fillU) ** 3), b = lt - 120;
      const [sx, sy] = b < 0 ? [1, 1] : b < 80 ? [1.04, .93] : b < 200 ? [.985, 1.03] : b < 320 ? [.985 + .015 * (b - 200) / 120, 1.03 - .03 * (b - 200) / 120] : [1, 1];
      const lit = b >= 0 && b < 33 ? .3 : b >= 33 && b < 66 ? .15 : 0;
      items.push({ d: p.x + p.z + n, draw: () => { g.save(); g.translate(Math.round(px), Math.round(py)); g.scale(sx, sy);
        if (rev < 1) filled(s.canvas, -s.anchor.x, -s.anchor.y, Math.round(s.anchor.y - rev * s.anchor.y), s.canvas.width, s.canvas.height); else g.drawImage(s.canvas, -s.anchor.x, -s.anchor.y);
        if (isDark(p)) g.drawImage(offOf(s), -s.anchor.x, -s.anchor.y);   // dark until power reaches it
        g.restore(); }, key: p.key, s, px, py }); continue; }
    const gh = ghostMap.get(p.key);
    items.push({ gh, d: p.x + p.z + n, draw: () => { const x0 = Math.round(px - s.anchor.x), y0 = Math.round(py - s.anchor.y); if (gh) { g.drawImage(gh.solid, x0, y0); g.globalAlpha = GHOST_A; g.drawImage(gh.ghost, x0, y0); g.globalAlpha = 1; } else g.drawImage(s.canvas, x0, y0);
      if (isDark(p)) { g.drawImage(offOf(s), x0, y0); offMark(px, py - s.anchor.y + s.top); }   // no power: the colour drains out and a grey bolt shows why (not a dark blot)
      const u = connectU(p.key); if (u != null && u >= 1) { lightUp(p, px, py); const f = Math.max(0, 1 - (u - 1) / .3); if (f > 0) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = .45 * f; g.drawImage(s.canvas, x0, y0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; } } }, key: p.key, s, px, py }); }
  if (!S.zoomShop) { drawPlants(items); drawVault(items, tops); drawGuest(items, tops); }
  if (building) { const n = PLOT[building.size], [px, py] = pr.P(building.x + n / 2, building.z + n / 2), st = building.stage; tops['@site'] = [px, py - Math.max(40, st.H * .6)]; items.push({ d: building.x + building.z + n, draw: () => {
      // a part just landed: squashed down a little, then a little tall (a few frames, the foot stays put)
      const u = building.bumpAt ? (performance.now() - building.bumpAt) / 260 : 1, k = u < 1 ? Math.sin(u * Math.PI * 2) * (1 - u) * .1 : 0;
      // it fills up from the ground as the parts come (eased), and only the building's own pixels at the rising edge are lit
      const goal = Math.min(1, .14 + (building.parts ?? 0) * .1); building.rev = (building.rev ?? .05) + (goal - (building.rev ?? .05)) * .06;
      const foot = st.H * .82, edge = Math.round(foot - building.rev * foot), x0 = Math.round(-st.W / 2), y0 = Math.round(-foot);
      g.save(); g.translate(Math.round(px), Math.round(py)); g.scale(1 + k * .6, 1 - k); filled(st.canvas, x0, y0, edge, st.W, st.H); g.restore(); } }); }
  for (const p of sim.people) items.push({ d: p.x + p.z - .01, draw: () => drawPerson(g, pr, p) });
  for (const b of boats) items.push({ d: b.x + b.z, draw: () => drawBoat(g, pr, b) });
  const fest = S.fest; if (fest) items.push({ d: fest.x + fest.z, draw: () => drawFestBoat(g, pr, fest) });
  { const sb = building ?? site.done ?? site.pending; if (sb) { const n = PLOT[sb.size]; site.step(dt);   // the site sorts with the buildings: its back half behind, its front half before
      items.push({ d: sb.x + sb.z - .01, draw: () => drawSite(g, pr, 'back', building) }, { d: sb.x + sb.z + n + .02, draw: () => drawSite(g, pr, 'front', building) }); } else site.parts.length = 0; }
  items.sort((a, b) => a.d - b.d); for (const it of items) it.draw();
  // island labels under each island's front shore (never over a roof): owner names; empty islands invite a friend (mine known) or ask to be chosen (no island yet: the
  // ones next to the friend who sent the link glow, else every free one does, softly)
  u.textAlign = 'center';
  const pulse = (Math.sin(performance.now() / 260) + 1) / 2, near = FROM && S.owners.has(FROM) ? neighbours(FROM) : null;
  const quietFree = !!mySlot && !myDoc?.wallet?.invGuide;   // empty islands say nothing until 끼룩이 first suggests calling a friend
  for (let s = 1; s <= SLOTS && !zoomShop; s++) {
    const [cx, cz] = centerOf(s), [lx, ly] = tagXY(s), uid = S.owners.get(s);
    if (!uid && quietFree) continue;
    if (uid && uid === me) continue;   // the camera lives on my island: no tag over my own roofs
    const label = uid ? nameOf(uid) : `${s} · 빈 섬`, choose = !uid && !mySlot && S.scrolled && (!near || near.includes(s));
    u.font = '400 14px "Jua", "Noto Sans KR", sans-serif'; const w = u.measureText(label).width + 14;
    u.fillStyle = uid ? 'rgba(46,36,26,.85)' : choose ? `rgba(255,${205 + 30 * pulse | 0},${110 + 60 * pulse | 0},${near ? .95 : .55 + .35 * pulse})` : 'rgba(255,255,255,.75)'; u.beginPath(); u.roundRect(lx - w / 2, ly - 30, w, 20, 8); u.fill();
    u.fillStyle = uid ? '#fff7e6' : '#2e241a'; u.fillText(label, lx, ly - 15);
    if (!uid && mySlot) {   // tap it: the invite card
      const [mx, my] = pr.P(cx + .5, cz + .5); u.font = '400 13px "Jua", "Noto Sans KR", sans-serif'; const t = '+ 친구 초대', tw = u.measureText(t).width + 18;
      u.fillStyle = 'rgba(46,36,26,.78)'; u.beginPath(); u.roundRect(mx - tw / 2, my - 15, tw, 22, 11); u.fill(); u.fillStyle = '#fff7e6'; u.fillText(t, mx, my + 1);
    }
  }
  // my half missing toward a friend next door: a plank tag over the gap — its price — and a tap lays it (input.js)
  S.bridgeTags = [];
  if (mySlot && myDoc && !zoomShop && !S.buildMode && (myDoc.wallet?.invGuide || myDoc.wallet?.freeHalf)) for (const n of neighbours(mySlot)) {   // a friend feature: once calling friends has come up
    if (!S.owners.has(n) || myDoc.half?.[n]) continue; const t = bridgeTiles(mySlot, n); if (!t.length) continue;
    const [mx, mz] = t[Math.floor((t.length - 1) / 2)], [x, y] = pr.P(mx + .5, mz + .5), free = myDoc.wallet?.freeHalf === n, bob = Math.sin(performance.now() / 300 + n) * 2;
    const txt = free ? '다리 · 무료' : `다리 · ${BRIDGE}`; u.font = '400 14px "Jua", "Noto Sans KR", sans-serif'; const w = u.measureText(txt).width + (free ? 18 : 34), h = 24, X = Math.round(x - w / 2), Y = Math.round(y - 30 + bob);
    u.fillStyle = '#2e241a'; u.beginPath(); u.roundRect(X - 2, Y - 2, w + 4, h + 6, 7); u.fill();
    u.fillStyle = '#c98a4e'; u.beginPath(); u.roundRect(X, Y, w, h, 5); u.fill(); u.fillStyle = '#a8703e'; u.fillRect(X + 3, Y + h - 6, w - 6, 3);   // a plank: wood with a darker grain at its foot
    if (!free) { u.imageSmoothingEnabled = false; const ic = iconCanvas('coin'); if (ic) u.drawImage(ic, X + w - 22, Y + 4, 16, 16); }
    u.fillStyle = '#fff7e6'; u.textAlign = 'left'; u.fillText(txt, X + 8, Y + 17);
    S.bridgeTags.push({ n, x: X - 2, y: Y - 2, w: w + 4, h: h + 6 });
  }
  u.textAlign = 'center';
  u.font = '900 12px "Noto Sans KR", sans-serif';
  for (const p of pops) { const tp = tops[p.key]; if (!tp || zoomShop) continue; const y = tp[1] - p.t * 22; u.globalAlpha = Math.max(0, 1 - p.t / 1.4); u.lineWidth = 3; u.strokeStyle = '#3a2a00'; const em = Object.keys(EMOJI).find(k => p.text.startsWith(k)), txt = em ? p.text.slice(em.length).trim() : p.text, w = em ? 14 : 0;
    if (em) { u.imageSmoothingEnabled = false; u.drawImage(iconCanvas(EMOJI[em]), Math.round(tp[0] - u.measureText(txt).width / 2 - w - 2), Math.round(y - 12), 14, 14); }
    u.strokeText(txt, tp[0] + w / 2, y); u.fillStyle = p.bad ? '#ff8a7a' : p.mine ? '#ffd166' : '#ffffff'; u.fillText(txt, tp[0] + w / 2, y); u.globalAlpha = 1; }
  // a new building's name plate: my line over its roof for 3 s, rising in and fading out
  { const L = S.landing, tp = L && tops[L.key], age = L ? (performance.now() - (L.nameAt ?? L.t0)) / 1000 : 9;   // it rises when the lights come on
    if (L && age > 3.4) S.landing = null;
    else if (tp && !zoomShop && age >= 0) { const a = Math.min(1, age * 4, (3.4 - age) * 2.5), y = tp[1] - 18 - Math.min(1, age * 3) * 10, t = `“${L.line}”`;
      u.globalAlpha = a; u.font = '400 18px "Jua", "Noto Sans KR", sans-serif'; u.textAlign = 'center'; u.lineWidth = 5; u.strokeStyle = '#2e241a'; u.strokeText(t, tp[0], y); u.fillStyle = '#ffd166'; u.fillText(t, tp[0], y); u.globalAlpha = 1; } }
  // the stars of every shop, small and gold, over its roof
  u.font = '900 11px "Noto Sans KR", sans-serif'; u.textAlign = 'center';
  { const si = iconCanvas('star');
    for (const p of all) { if (zoomShop || !p.b || !tops[p.key] || !servesOf(p) || isDark(p)) continue; const n = starsInfo(p).stars, [x, y] = tops[p.key];   // (they come with the light)
      if (!n) continue;   // one star and its count (a row of stars overlapped the next roof's): outlined, no plate over the picture
      const X = Math.round(x - 8), Y = Math.round(y - 26); u.drawImage(si, X - 4, Y, 12, 12);
      u.textAlign = 'left'; u.lineWidth = 3; u.strokeStyle = '#1f3a5c'; u.strokeText(String(n), X + 9, Y + 10); u.fillStyle = '#ffd166'; u.fillText(String(n), X + 9, Y + 10); u.textAlign = 'center'; } }
  u.font = '900 12px "Noto Sans KR", sans-serif';
  // cut off for an unpaid bill: a coin with a red mark over the roof
  { const ci = iconCanvas('coin'); for (const p of all) if (p.b && tops[p.key] && isOff(p) && !zoomShop) { const [x, y] = tops[p.key]; u.drawImage(ci, Math.round(x - 8), Math.round(y - 30), 16, 16); u.fillStyle = '#c0392b'; u.beginPath(); u.arc(x + 9, y - 28, 5, 0, 7); u.fill(); u.fillStyle = '#fff'; u.font = '900 9px "Noto Sans KR", sans-serif'; u.textAlign = 'center'; u.fillText('!', x + 9, y - 25); } }
  drawBillFly(dt, tops);
  // my shops running low on stock show a red mark
  for (const p of all) if (p.owner === me && p.b && (myDoc.plots[p.key]?.stock ?? START_STOCK) === 0 && servesOf(p) && tops[p.key]) { const [x, y] = tops[p.key]; u.fillStyle = '#c0392b'; u.beginPath(); u.arc(x, y - 4, 7, 0, 7); u.fill(); u.fillStyle = '#fff'; u.textAlign = 'center'; u.font = '900 12px "Noto Sans KR", sans-serif'; u.fillText('!', x, y - 0); }
  // (what guests at my pier want is told by the face chips' counts alone: no thought bubbles over the pier)
  drawSplash(dt);
  S.drawn = items; S.lastTops = tops; placeJoin(); placeLog(); placeAsk();
  { const sb = S.spotBlink, a = sb ? (performance.now() - sb.t0) / 1400 : 1; if (a >= 1) S.spotBlink = null;   // where a building of this size fits: three blinks
    else for (const q of sb.spots) outline(q.x, q.z, sb.n, `rgba(255,224,120,${(Math.sin(a * Math.PI * 6 - Math.PI / 2) + 1) / 2 * .9})`); }
  // where the next building goes while the bar is open: a quiet yellow lot, no tag and no pulse, so it reads as a place,
  // not a button (the button is the bar's; a tap elsewhere on my island still moves the lot)
  { const sp = S.buildMode && !S.building && S.spot; if (sp) { const n = PLOT[S.size], pts = [pr.P(sp.x, sp.z), pr.P(sp.x + n, sp.z), pr.P(sp.x + n, sp.z + n), pr.P(sp.x, sp.z + n)];
    g.fillStyle = 'rgba(255,214,102,.3)'; g.beginPath(); pts.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b))); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,214,102,.9)'; g.lineWidth = 2.5; g.lineJoin = 'round'; g.stroke(); } }
}
