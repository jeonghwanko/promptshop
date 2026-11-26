// The map camera: whole zoom steps (pixels stay even), the wheel, scrolling to an island, screen ↔ map points.
import { centerOf, landSize } from '../v2/isles.js';
import { $ } from './ui.js';
import { S, pr, map } from './state.js';

const zoomSteps = () => { const lo = Math.min(1, Math.max(innerWidth / pr.width, innerHeight / pr.height) * .9); return [...new Set([lo, .5, .75, 1, 2, 3].filter(z => z >= lo - 1e-6))].sort((a, b) => a - b); };
/** Zoom to z, keeping the point under `at` (screen x, y; default the middle of the screen) where it is. */
function setZoom(z, at) {
  const box = $('mapbox'), [sx, sy] = at ?? [box.clientWidth / 2, box.clientHeight / 2], cx = (box.scrollLeft + sx - map.offsetLeft) / S.zoom, cy = (box.scrollTop + sy - map.offsetTop) / S.zoom;
  S.zoom = z; applyZoom(); box.scrollTo({ left: map.offsetLeft + cx * S.zoom - sx, top: map.offsetTop + cy * S.zoom - sy });
}
export const applyZoom = () => { map.style.width = pr.width * S.zoom + 'px'; const st = zoomSteps(); $('zin').disabled = S.zoom >= st[st.length - 1]; $('zout').disabled = S.zoom <= st[0] + 1e-6; };
const zoomBy = (d, at) => { const st = zoomSteps(), i = st.findIndex(z => Math.abs(z - S.zoom) < 1e-6), n = st[Math.max(0, Math.min(st.length - 1, (i < 0 ? st.indexOf(1) : i) + d))]; if (n !== S.zoom) setZoom(n, at); };
/** The first view: the biggest whole step at which my island (with room for its land to grow) still fits in most of the screen. */
export function startZoom(slot) {
  const [cx, cz] = centerOf(slot), r = Math.sqrt(landSize(slot) / Math.PI) + 1, xs = [[-r, -r], [r, -r], [-r, r], [r, r]].map(([dx, dz]) => pr.P(cx + dx, cz + dz));
  const w = Math.max(...xs.map(p => p[0])) - Math.min(...xs.map(p => p[0])), h = Math.max(...xs.map(p => p[1])) - Math.min(...xs.map(p => p[1]));
  const k = Math.min(innerWidth * .8 / w, (innerHeight - 160) * .85 / h);
  return Math.max(1, Math.min(3, Math.floor(k * Math.SQRT2)));   // the island is round: its outline is the square's corners pulled in by √2
}
/** Bring island s to the middle of the screen; smooth = false jumps (the first view, where there is nothing to glide from). */
export function scrollToSlot(s, smooth = true) { const box = $('mapbox'), [cx, cz] = centerOf(s), [px0, py0] = pr.P(cx, cz), px = px0 * S.zoom, py = py0 * S.zoom; box.scrollTo({ left: map.offsetLeft + px - box.clientWidth / 2, top: map.offsetTop + py - 80 - box.clientHeight / 2, behavior: smooth ? 'smooth' : 'instant' }); }
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
