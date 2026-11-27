// The map camera: whole zoom steps (pixels stay even), the wheel, scrolling to an island, screen ↔ map points.
import { centerOf, landSize, neighbours } from '../v2/isles.js';
import { $ } from './ui.js';
import { S, pr, map } from './state.js';

// Zoom steps. From one map pixel per device pixel up, whole device pixels (crisp pixel art at any screen scaling, e.g.
// Windows at 125%); below it, halves and three quarters, drawn smooth instead (see applyZoom).
const dpr = () => window.devicePixelRatio || 1;
const zoomSteps = () => { const d = dpr(), lo = Math.min(1 / d, Math.max(innerWidth / pr.width, innerHeight / pr.height) * .9);
  return [...new Set([lo, .5 / d, .75 / d, 1 / d, 2 / d, 3 / d, 4 / d].map(z => +z.toFixed(4)).filter(z => z >= lo - 1e-6 && z <= 3.01))].sort((a, b) => a - b); };
/** The biggest step at which a w×h box (map pixels at zoom 1) takes at most fx of the screen's width and fy of its free height. */
function fitZoom(w, h, fx, fy) { const k = Math.min(innerWidth * fx / w, (innerHeight - 200) * fy / h), st = zoomSteps(); return st.filter(z => z <= k + 1e-6).pop() ?? st[0]; }
/** Zoom to z, keeping the point under `at` (screen x, y; default the middle of the screen) where it is. */
function setZoom(z, at) {
  const box = $('mapbox'), [sx, sy] = at ?? [box.clientWidth / 2, box.clientHeight / 2], cx = (box.scrollLeft + sx - map.offsetLeft) / S.zoom, cy = (box.scrollTop + sy - map.offsetTop) / S.zoom;
  S.zoom = z; applyZoom(); box.scrollTo({ left: map.offsetLeft + cx * S.zoom - sx, top: map.offsetTop + cy * S.zoom - sy });
}
export const applyZoom = () => { map.style.width = pr.width * S.zoom + 'px'; map.style.imageRendering = S.zoom * dpr() < .999 ? 'auto' : 'pixelated'; const st = zoomSteps(); $('zin').disabled = S.zoom >= st[st.length - 1]; $('zout').disabled = S.zoom <= st[0] + 1e-6; };
const zoomBy = (d, at) => { const st = zoomSteps(), i = st.findIndex(z => Math.abs(z - S.zoom) < 1e-6), n = st[Math.max(0, Math.min(st.length - 1, (i < 0 ? st.indexOf(1) : i) + d))]; if (n !== S.zoom) setZoom(n, at); };
/** The first view: the biggest whole step at which my island (with room for its land to grow) still fits in most of the screen. */
export function startZoom(slot) {
  const [cx, cz] = centerOf(slot), r = (Math.sqrt(landSize(slot) / Math.PI) + 1) / Math.SQRT2, xs = [[-r, -r], [r, -r], [-r, r], [r, r]].map(([dx, dz]) => pr.P(cx + dx, cz + dz));   // round: the square's corners pulled in by √2
  const w = Math.max(...xs.map(p => p[0])) - Math.min(...xs.map(p => p[0])), h = Math.max(...xs.map(p => p[1])) - Math.min(...xs.map(p => p[1]));
  return fitZoom(w, h, .4, .55);   // my island about two fifths of the screen: the sea and the neighbours around it stay in view
}
/** Choosing an island: the one pointed at and its neighbours, a step further out than they need — room to look around,
 *  names still readable (the whole archipelago at once makes them too small to read). */
export function chooseZoom(slot) {
  const pts = [slot, ...neighbours(slot)].map(s => pr.P(...centerOf(s))), pad = pr.P(8, 8)[0] - pr.P(0, 0)[0];
  const w = Math.max(...pts.map(p => p[0])) - Math.min(...pts.map(p => p[0])) + Math.abs(pad) * 2, h = Math.max(...pts.map(p => p[1])) - Math.min(...pts.map(p => p[1])) + Math.abs(pad);
  const z = fitZoom(w, h, .95, .95), st = zoomSteps(); return st[Math.max(0, st.indexOf(z) - 1)] ?? z;
}
/** The part of the screen no UI covers: below the top HUD, above the dock, and left of (PC) or above (phone) an open panel.
 *  The camera puts what it shows in the middle of this, so UI never has to dodge the map. */
export function safeRect() {
  let l = 0, t = 96, r = innerWidth, b = innerHeight - 124;
  // on a phone, 끼룩이's open bubble covers the lower part too
  const gd = $('guide'); if (innerWidth <= 760 && gd && !gd.hidden && !gd.classList.contains('min')) { const q = gd.getBoundingClientRect(); if (q.height && q.top > innerHeight / 2) b = Math.min(b, q.top - 8); }
  const p = $('panel'); if (p && !p.hidden) { const q = p.getBoundingClientRect(); if (q.width < innerWidth * .6) r = Math.min(r, q.left - 8); else b = Math.min(b, q.top - 8); }
  return { l, t, r, b, cx: (l + r) / 2, cy: (t + b) / 2 };
}
/** Bring map point (px, py) (map canvas pixels at zoom 1) to the middle of the safe rect. */
export function scrollToPoint(px0, py0, smooth = true) { const box = $('mapbox'), sr = safeRect(); box.scrollTo({ left: map.offsetLeft + px0 * S.zoom - sr.cx, top: map.offsetTop + py0 * S.zoom - sr.cy, behavior: smooth ? 'smooth' : 'instant' }); }
/** Is map point (px, py) on screen inside the safe rect (with a margin)? */
export function inSafe(px0, py0, m = 40) { const [x, y] = toScreen(px0, py0), sr = safeRect(); return x > sr.l + m && x < sr.r - m && y > sr.t + m && y < sr.b - m; }
/** Bring island s to the middle of the safe rect; smooth = false jumps (the first view, where there is nothing to glide from). */
export function scrollToSlot(s, smooth = true) { const [cx, cz] = centerOf(s); scrollToPoint(...pr.P(cx, cz), smooth); }
/** A pointer event → a point on the map canvas. */
export const mapXY = (e) => { const r = map.getBoundingClientRect(); return [(e.clientX - r.left) * map.width / r.width, (e.clientY - r.top) * map.height / r.height]; };
/** A point on the map canvas → the screen. */
export const toScreen = (px, py) => { const r = map.getBoundingClientRect(); return [r.left + px * r.width / map.width, r.top + py * r.height / map.height]; };

export function initCamera() {
  // the wheel zooms the map around the pointer, one step per notch (a burst of wheel events counts once)
  let wheelAt = 0, wheelSum = 0;
  $('mapbox').addEventListener('wheel', (e) => {
    e.preventDefault(); if (S.watching?.inPlace || S.zoomShop) return;
    wheelSum += e.deltaY; const t = performance.now(); if (t - wheelAt < 140 || Math.abs(wheelSum) < 30) return;
    wheelAt = t; const d = wheelSum < 0 ? 1 : -1; wheelSum = 0; zoomBy(d, [e.clientX, e.clientY]);
  }, { passive: false });
  applyZoom(); $('zin').onclick = () => zoomBy(1); $('zout').onclick = () => zoomBy(-1);
}
