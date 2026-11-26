// Drawing the archipelago each frame: the ground (or new land rising), buildings, walkers, boats and the building site
// sorted by depth, then island labels, floating words, stars, empty-stock marks and what my pier's guests cannot find.
import { SLOTS, centerOf, PLOT, dockOf } from '../v2/isles.js';
import { renderView } from '../v2/render.js';
import { drawPerson } from '../v2/townview.js';
import { iconCanvas, EMOJI } from '../ui/icons.js';
import { START_STOCK } from './rules.js';
import { S, me, pr, map, g, sim, pops, boats, splash } from './state.js';
import { allPlots, starsInfo, servesOf, nameOf } from './model.js';
import { site, drawSite, drawFestBoat, drawBoat } from './mapfx.js';
import { mapXY } from './camera.js';
import { NEED_ICON } from './hud.js';
import { placeSign } from './build.js';
import { tutGlowSpot } from './guide.js';

// each building is rendered once into a sprite (with its alpha, for picking by pixel)
const sprites = new Map();
function sprite(p) {
  const k = p.key + ':' + p.b.at, s = sprites.get(p.key); if (s && s.k === k) return s;
  try { const { canvas, anchor } = renderView(p.b.input, 'ext'), alpha = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    // the roof's top: the first painted row near the building's middle (the picture has room above it, and props stand to the sides)
    const W = canvas.width, x0 = Math.max(0, Math.round(anchor.x - W / 10)), x1 = Math.min(W, Math.round(anchor.x + W / 10)), painted = (y) => { for (let x = x0; x < x1; x++) if (alpha[(y * W + x) * 4 + 3] > 40) return true; return false; };
    let top = 0; while (top < canvas.height - 1 && !painted(top)) top++;
    const n = { canvas, anchor, k, alpha, top }; sprites.set(p.key, n); return n; } catch { return null; }
}
/** The building under a pointer (its picture's own pixels, frontmost first), or null. */
export function buildingAt(e) { const [sx, sy] = mapXY(e);
  for (const it of [...S.drawn].reverse()) { if (!it.s) continue; const x = Math.floor(sx - (it.px - it.s.anchor.x)), y = Math.floor(sy - (it.py - it.s.anchor.y));
    if (x >= 0 && y >= 0 && x < it.s.canvas.width && y < it.s.canvas.height && it.s.alpha[(y * it.s.canvas.width + x) * 4 + 3] > 40) return it.key; }
  return null; }

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
function drawSplash(dt) {
  for (const p of splash) { p.t += dt; p.vy += 160 * dt; p.x += p.vx * dt; p.y += p.vy * dt; g.globalAlpha = Math.max(0, 1 - p.t / .7); g.fillStyle = p.dust ? (p.t < .25 ? '#e8d8b0' : '#b89a6a') : p.t < .25 ? '#ffffff' : '#bfe3f2'; g.fillRect(Math.round(p.x), Math.round(p.y), 3, 3); }
  g.globalAlpha = 1; for (let i = splash.length - 1; i >= 0; i--) if (splash[i].t > .7) splash.splice(i, 1);
}
const outline = (x, z, n, color) => { const pts = [pr.P(x, z), pr.P(x + n, z), pr.P(x + n, z + n), pr.P(x, z + n)]; g.strokeStyle = color; g.lineWidth = 2; g.beginPath(); pts.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b))); g.closePath(); g.stroke(); };

/** Draw one frame of the map. */
export function drawMap(dt) {
  const { hover, moving, building, myDoc, mySlot } = S;
  for (const p of pops) p.t += dt; while (pops.length && pops[0].t > 1.4) pops.shift();
  g.clearRect(0, 0, map.width, map.height); if (S.landAnim) drawLandAnim(dt); else g.drawImage(S.ground, 0, 0);
  if (hover && !building) outline(hover.x, hover.z, moving ? PLOT[moving.size] : PLOT[S.size], hover.door || hover.swap ? '#2fbf71' : '#e2432f');
  if (moving) { const mp0 = myDoc.plots[moving.key]; if (mp0) outline(mp0.x, mp0.z, PLOT[mp0.size], 'rgba(255,255,255,.55)'); }
  const all = allPlots();
  if (S.current?.key) { const p = all.find(x => x.key === S.current.key); if (p) outline(p.x, p.z, PLOT[p.size], '#ffd166'); }
  const items = [], tops = {};
  if (moving && hover) { const p = all.find(q => q.key === moving.key), sp = p && sprite(p); if (sp) { const n = PLOT[p.size], [px, py] = pr.P(hover.x + n / 2, hover.z + n / 2), lift = 10 + Math.sin(performance.now() / 160) * 2;
    items.push({ d: 1e9, draw: () => { g.globalAlpha = .85; g.drawImage(sp.canvas, Math.round(px - sp.anchor.x), Math.round(py - sp.anchor.y - lift)); g.globalAlpha = 1; } }); } }
  const zs = S.zoomShop; if (zs) { zs.t = Math.max(0, Math.min(1, zs.t + zs.dir * dt / .4)); if (zs.dir < 0 && zs.t === 0) S.zoomShop = null; }
  const zoomShop = S.zoomShop;
  for (const p of all) { if (!p.b || (moving && p.key === moving.key)) continue; const s = sprite(p); if (!s) continue;
    const n = PLOT[p.size], [px, py] = pr.P(p.x + n / 2, p.z + n / 2);
    if (zoomShop?.key === p.key) { const u = zoomShop.t; if (u >= 1) continue; const e = u * u;   // the roof lifts away from an opened shop
      items.push({ d: p.x + p.z + n, draw: () => { g.globalAlpha = 1 - e; g.drawImage(s.canvas, Math.round(px - s.anchor.x), Math.round(py - s.anchor.y - e * 60)); g.globalAlpha = 1; } }); continue; }
    tops[p.key] = [px, py - s.anchor.y + s.top + 6];   // just over the roof
    items.push({ d: p.x + p.z + n, draw: () => g.drawImage(s.canvas, Math.round(px - s.anchor.x), Math.round(py - s.anchor.y)), key: p.key, s, px, py }); }
  if (building) { const n = PLOT[building.size], [px, py] = pr.P(building.x + n / 2, building.z + n / 2), st = building.stage; items.push({ d: building.x + building.z + n, draw: () => g.drawImage(st.canvas, Math.round(px - st.W / 2), Math.round(py - st.H * .82)) }); }
  for (const p of sim.people) items.push({ d: p.x + p.z - .01, draw: () => drawPerson(g, pr, p) });
  for (const b of boats) items.push({ d: b.x + b.z, draw: () => drawBoat(g, pr, b) });
  const fest = S.fest; if (fest) items.push({ d: fest.x + fest.z, draw: () => drawFestBoat(g, pr, fest) });
  { const sb = building ?? site.done ?? site.pending; if (sb) { const n = PLOT[sb.size]; site.step(dt);   // the site sorts with the buildings: its back half behind, its front half before
      items.push({ d: sb.x + sb.z - .01, draw: () => drawSite(g, pr, 'back', building) }, { d: sb.x + sb.z + n + .02, draw: () => drawSite(g, pr, 'front', building) }); } else site.parts.length = 0; }
  items.sort((a, b) => a.d - b.d); for (const it of items) it.draw();
  // island labels: owner names, empty slots invite (map words would be blown up behind an open shop)
  g.textAlign = 'center';
  for (let s = 1; s <= SLOTS && !zoomShop; s++) {
    const [cx, cz] = centerOf(s), [lx, ly] = pr.P(cx - 4, cz - 4), uid = S.owners.get(s);
    const label = uid ? `${s} · ${nameOf(uid)}` : `${s} · 빈 섬`;
    g.font = '400 14px "Jua", "Noto Sans KR", sans-serif'; const w = g.measureText(label).width + 14;
    g.fillStyle = uid === me ? '#e3a72f' : uid ? 'rgba(46,36,26,.85)' : 'rgba(255,255,255,.75)'; g.beginPath(); g.roundRect(lx - w / 2, ly - 30, w, 20, 8); g.fill();
    g.fillStyle = uid && uid !== me ? '#fff7e6' : '#2e241a'; g.fillText(label, lx, ly - 15);
    if (!uid) { g.font = '400 11px "Noto Sans KR", sans-serif'; g.fillStyle = 'rgba(255,255,255,.9)'; const [mx, my] = pr.P(cx + .5, cz + .5); g.fillText('+ 친구 초대', mx, my); }
  }
  g.font = '900 12px "Noto Sans KR", sans-serif';
  for (const p of pops) { const tp = tops[p.key]; if (!tp || zoomShop) continue; const y = tp[1] - p.t * 22; g.globalAlpha = Math.max(0, 1 - p.t / 1.4); g.lineWidth = 3; g.strokeStyle = '#3a2a00'; const em = Object.keys(EMOJI).find(k => p.text.startsWith(k)), txt = em ? p.text.slice(em.length).trim() : p.text, w = em ? 14 : 0;
    if (em) { g.imageSmoothingEnabled = false; g.drawImage(iconCanvas(EMOJI[em]), Math.round(tp[0] - g.measureText(txt).width / 2 - w - 2), Math.round(y - 12), 14, 14); }
    g.strokeText(txt, tp[0] + w / 2, y); g.fillStyle = p.bad ? '#ff8a7a' : p.mine ? '#ffd166' : '#ffffff'; g.fillText(txt, tp[0] + w / 2, y); g.globalAlpha = 1; }
  // the stars of every shop, small and gold, over its roof
  g.font = '900 11px "Noto Sans KR", sans-serif'; g.textAlign = 'center';
  { const si = iconCanvas('star');
    for (const p of all) { if (zoomShop || !p.b || !tops[p.key] || !servesOf(p)) continue; const n = starsInfo(p).stars, [x, y] = tops[p.key];
      for (let k = 0; k < n; k++) g.drawImage(si, Math.round(x - n * 6 + k * 12), Math.round(y - 26), 12, 12); } }
  g.font = '900 12px "Noto Sans KR", sans-serif';
  // my shops running low on stock show a red mark
  for (const p of all) if (p.owner === me && p.b && (myDoc.plots[p.key]?.stock ?? START_STOCK) === 0 && servesOf(p) && tops[p.key]) { const [x, y] = tops[p.key]; g.fillStyle = '#c0392b'; g.beginPath(); g.arc(x, y - 4, 7, 0, 7); g.fill(); g.fillStyle = '#fff'; g.fillText('!', x, y - 0); }
  // what guests at my pier want and cannot find on the archipelago: thought bubbles over the pier
  const unmet = S.unmet;
  if (mySlot && unmet.length && !S.watching?.inPlace) { const d = dockOf(mySlot), [bx, by] = pr.P(d.pier[0][0] + .5, d.pier[0][1] + .5), n = unmet.length, tt = performance.now() / 1000;
    unmet.forEach(([k, c], i) => { const x = Math.round(bx + (i - (n - 1) / 2) * 30), y = Math.round(by - 34 + Math.sin(tt * 2.2 + i) * 2);
      g.fillStyle = '#fff'; g.strokeStyle = '#2e241a'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 13, 0, 7); g.fill(); g.stroke();
      g.beginPath(); g.arc(x - 4, y + 17, 3, 0, 7); g.fill(); g.stroke();
      g.imageSmoothingEnabled = false; const ic = iconCanvas(NEED_ICON[k]); if (ic) g.drawImage(ic, x - 9, y - 9, 18, 18);
      g.font = '900 10px "Noto Sans KR", sans-serif'; g.textAlign = 'center'; g.lineWidth = 3; g.strokeText(String(c), x + 11, y + 13); g.fillStyle = '#ff8a7a'; g.fillText(String(c), x + 11, y + 13); }); }
  drawSplash(dt);
  S.drawn = items; S.lastTops = tops; placeSign();
  const ts = tutGlowSpot(); if (ts) { const t = (Math.sin(performance.now() / 180) + 1) / 2; outline(ts.x, ts.z, PLOT[S.size], `rgba(255,${200 + 55 * t | 0},80,${.6 + .4 * t})`); }
}
