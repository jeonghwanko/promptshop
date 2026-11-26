// A neighbourhood: one world cell drawn as a 20×20 isometric grid. Roads come from a seed of (X, Y), so every
// visitor sees the same streets; sea follows the real coastline (each tile is tested against the country outlines).
import { cellPoint, countryAt, cellCenter, placeLabel, nearestCity } from './geo.js';

export const AREA_SIZE = 20;
export const PLOT = { S: 2, M: 3, L: 4, XL: 5 };

export function makeArea(X, Y) {
  let s = (X * 73856093) ^ (Y * 19349663); s = Math.abs(s) % 233280 || 7;
  const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const W = AREA_SIZE, D = AREA_SIZE;
  const rows = [5, 11, 17].map(z => z + Math.floor(r() * 2)), cols = [4, 10, 16].filter(() => r() > .15).map(x => x + Math.floor(r() * 3) - 1);
  if (!cols.length) cols.push(10);
  // the 1:110m outlines drop small islands (Jeju, Bali...): a listed city within 30 km makes the whole cell land
  const [clat, clng] = cellCenter(X, Y), cityLand = nearestCity(clat, clng).km < 30;
  const water = new Uint8Array(W * D);
  for (let z = 0; z < D && !cityLand; z++) for (let x = 0; x < W; x++) { const [lat, lng] = cellPoint(X, Y, (x + .5) / W, (z + .5) / D); water[z * W + x] = countryAt(lat, lng) ? 0 : 1; }
  const isWater = (x, z) => x < 0 || z < 0 || x >= W || z >= D || water[z * W + x] === 1;
  const isRoad = (x, z) => !isWater(x, z) && (rows.includes(z) || cols.includes(x));
  const [lat, lng] = cellCenter(X, Y), place = placeLabel(lat, lng);
  const land = water.reduce((a, v) => a + (v ? 0 : 1), 0);
  return { X, Y, w: W, d: D, rows, cols, isRoad, isWater, lat, lng, place, land, key: X + '_' + Y };
}

/** Can a plot of this size stand at (x, z)? It must be on dry, free land and its front edge (+z) must touch a road. */
export function canPlace(area, x, z, size, taken) {
  const n = PLOT[size];
  if (x < 0 || z < 0 || x + n > area.w || z + n > area.d) return false;
  for (let i = x; i < x + n; i++) for (let k = z; k < z + n; k++) if (area.isWater(i, k) || area.isRoad(i, k) || taken.has(i + ',' + k)) return false;
  for (let i = x; i < x + n; i++) if (area.isRoad(i, z + n)) return true;
  return false;
}
export const takenTiles = (plots) => { const t = new Set(); for (const p of plots) { const n = PLOT[p.size]; for (let i = p.x; i < p.x + n; i++) for (let k = p.z; k < p.z + n; k++) t.add(i + ',' + k); } return t; };

export function areaProjection(area, top = 230, left = 24) {
  const ox = left + area.d * 20, oy = top;
  return { ox, oy, width: ox + area.w * 20 + left, height: oy + (area.w + area.d) * 10 + 40,
    P: (x, z) => [ox + (x - z) * 20, oy + (x + z) * 10], inv: (sx, sy) => { const a = (sx - ox) / 20, b = (sy - oy) / 10; return [(a + b) / 2, (b - a) / 2]; } };
}

/** Ground: grass, sea with a beach edge, roads with lane marks, claimed plot pads. */
export function drawArea(area, pr, plots = []) {
  const c = document.createElement('canvas'); c.width = pr.width; c.height = pr.height;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  const taken = takenTiles(plots);
  const tile = (x, z, fill, edge) => {
    const [ax, ay] = pr.P(x, z), [bx, by] = pr.P(x + 1, z), [cx, cy] = pr.P(x + 1, z + 1), [dx, dy] = pr.P(x, z + 1);
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.lineTo(cx, cy); g.lineTo(dx, dy); g.closePath(); g.fillStyle = fill; g.fill();
    if (edge) { g.strokeStyle = edge; g.lineWidth = 1; g.stroke(); }
  };
  for (let z = 0; z < area.d; z++) for (let x = 0; x < area.w; x++) {
    if (area.isWater(x, z)) { const shore = !area.isWater(x - 1, z) || !area.isWater(x + 1, z) || !area.isWater(x, z - 1) || !area.isWater(x, z + 1); tile(x, z, shore ? '#5aa0c4' : '#3d7fa6', shore ? '#7fb8d4' : '#36749a'); continue; }
    const wet = (i, k) => i >= 0 && k >= 0 && i < area.w && k < area.d && area.isWater(i, k);   // the edge of the map is not the sea
    const beach = wet(x - 1, z) || wet(x + 1, z) || wet(x, z - 1) || wet(x, z + 1);
    if (area.isRoad(x, z)) tile(x, z, '#8d8f93', '#7d7f83');
    else if (taken.has(x + ',' + z)) tile(x, z, '#cfc6ae', '#c4b99c');
    else if (beach) tile(x, z, '#e6d6a8', '#d8c79a');
    else tile(x, z, (x * 7 + z * 3) % 5 ? '#86b56a' : '#7fae63', '#78a75d');
  }
  g.fillStyle = '#e8e2cf';
  for (let z = 0; z < area.d; z++) for (let x = 0; x < area.w; x++) {
    if (!area.isRoad(x, z)) continue;
    const h = area.rows.includes(z), v = area.cols.includes(x);
    if (h && !v) { const [px, py] = pr.P(x + .5, z + .5); g.fillRect(Math.round(px) - 3, Math.round(py), 6, 1); }
    if (v && !h) { const [px, py] = pr.P(x + .5, z + .5); g.fillRect(Math.round(px) - 3, Math.round(py), 6, 1); }
  }
  return c;
}
