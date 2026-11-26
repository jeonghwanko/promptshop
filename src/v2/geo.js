// The world as a grid of neighbourhoods: each cell is 0.05° of longitude by 0.05° of latitude (about 5 km),
// numbered X (west → east) and Y (north → south). The same place is always the same neighbourhood.
import { COUNTRIES } from './world-data.js';
import { CITIES } from './cities.js';

export const CELL = 0.05, XN = Math.round(360 / CELL), YN = Math.round(180 / CELL);
export const toXY = (lat, lng) => [Math.floor((((lng + 180) % 360) + 360) % 360 / CELL), Math.min(YN - 1, Math.max(0, Math.floor((90 - lat) / CELL)))];
export const cellCenter = (X, Y) => [90 - (Y + .5) * CELL, X * CELL - 180 + CELL / 2];          // [lat, lng]
/** A point inside cell (X, Y): u, v in 0..1 from the north-west corner. */
export const cellPoint = (X, Y, u, v) => [90 - (Y + v) * CELL, X * CELL - 180 + u * CELL];

// country polygons with bounding boxes, in degrees
const POLYS = COUNTRIES.map(c => ({ n: c.n, ko: c.ko, rings: c.p.map(r => { const pts = []; for (let i = 0; i < r.length; i += 2) pts.push([r[i] / 10, r[i + 1] / 10]); return pts; }) }))
  .map(c => ({ ...c, bb: c.rings.flat().reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [999, 999, -999, -999]) }));
function inRing(lng, lat, r) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** The country at a point, or null for sea. */
export function countryAt(lat, lng) {
  for (const c of POLYS) {
    if (lng < c.bb[0] || lng > c.bb[2] || lat < c.bb[1] || lat > c.bb[3]) continue;
    for (const r of c.rings) if (inRing(lng, lat, r)) return c;
  }
  return null;
}
const rad = Math.PI / 180;
export function distanceKm(a, b) { const dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad; const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); }
export function nearestCity(lat, lng) {
  let best = null, bd = Infinity;
  for (const c of CITIES) { const d = distanceKm([lat, lng], [c[2], c[3]]); if (d < bd) { bd = d; best = c; } }
  return { ko: best[0], en: best[1], km: bd };
}
/** A human label for a place: "대한민국 · 서울 근처". */
// cities where the coarse outlines give the wrong (or no) country
const CITY_COUNTRY = { 싱가포르: '싱가포르', 홍콩: '홍콩', 제주: '대한민국', 서귀포: '대한민국', 발리: '인도네시아', 오키나와: '일본', 괌: '미국', 사이판: '미국', 호놀룰루: '미국', 산토리니: '그리스' };
export function placeLabel(lat, lng) {
  const city = nearestCity(lat, lng), fix = city.km < 40 ? CITY_COUNTRY[city.ko] : null;
  const c = fix ? { ko: fix, n: fix } : countryAt(lat, lng);
  const near = city.km < 15 ? `${city.ko}` : city.km < 150 ? `${city.ko} 근처` : null;
  return { country: c?.ko ?? null, countryEn: c?.n ?? null, city: city.km < 150 ? city : null, text: [c?.ko ?? '바다', near].filter(Boolean).join(' · ') };
}

/** Search: a city, a country, "X, Y" or "lat, lng". Returns { lat, lng, label } or null. */
export function search(q) {
  q = q.trim(); if (!q) return null;
  const m = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (m) {
    const a = +m[1], b = +m[2];
    if (Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b >= 0 && a < XN && b < YN && (a > 180 || b > 90)) { const [lat, lng] = cellCenter(a, b); return { lat, lng, label: `X ${a} · Y ${b}` }; }
    if (Math.abs(a) <= 90 && Math.abs(b) <= 180) return { lat: a, lng: b, label: `${a}, ${b}` };
  }
  const low = q.toLowerCase();
  const city = CITIES.find(c => c[0] === q || c[1].toLowerCase() === low) ?? CITIES.find(c => c[0].includes(q) || c[1].toLowerCase().includes(low));
  if (city) return { lat: city[2], lng: city[3], label: city[0] };
  const country = POLYS.find(c => c.ko === q || c.n.toLowerCase() === low) ?? POLYS.find(c => c.ko.includes(q) || c.n.toLowerCase().includes(low));
  if (country) {
    // the centre of its largest ring
    const big = country.rings.reduce((a, r) => (r.length > a.length ? r : a), []);
    const lng = big.reduce((s, p) => s + p[0], 0) / big.length, lat = big.reduce((s, p) => s + p[1], 0) / big.length;
    return { lat, lng, label: country.ko, zoomOut: true };
  }
  return null;
}
export const suggestions = (q) => { if (!q) return []; const low = q.toLowerCase(); return [...CITIES.filter(c => c[0].includes(q) || c[1].toLowerCase().includes(low)).map(c => c[0]), ...POLYS.filter(c => c.ko.includes(q) || c.n.toLowerCase().includes(low)).map(c => c.ko)].slice(0, 8); };

/** An equirectangular land map for the globe: sea, land, borders. */
/** Draw land into any view: P(lng, lat) → [x, y] in canvas pixels; polygons outside [0, w] × [0, h] are skipped. */
export function drawLand(g, P, w, h, { land = '#8cbf6a', ice = '#e8eef2', coast = '#79ad5a' } = {}) {
  const pieces = (r) => { const out = [[]]; r.forEach(([lng, lat], i) => { if (i && Math.abs(lng - r[i - 1][0]) > 180) out.push([]); out[out.length - 1].push([lng, lat]); }); return out; };
  for (const c of POLYS) {
    const [ax, ay] = P(c.bb[0], c.bb[3]), [bx, by] = P(c.bb[2], c.bb[1]);
    if (bx < 0 || ax > w || by < 0 || ay > h) continue;
    for (const r of c.rings) for (const p of pieces(r)) {
      if (p.length < 3) continue;
      g.beginPath(); p.forEach(([lng, lat], i) => { const [x, y] = P(lng, lat); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath();
      g.fillStyle = c.n === 'Antarctica' ? ice : land; g.fill(); g.strokeStyle = coast; g.lineWidth = 1; g.stroke();
    }
  }
}
export function landCanvas(w = 2048, h = 1024, { borders = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = '#3d7fa6'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#4a8db3'; for (let y = 0; y < h; y += 8) for (let x = (y / 8) % 2 ? 4 : 0; x < w; x += 16) g.fillRect(x, y, 2, 1);
  const X = (lng) => (lng + 180) / 360 * w, Y = (lat) => (90 - lat) / 180 * h;
  // rings that cross the date line are drawn in two pieces, each closed on its own side (no strip across the map)
  const pieces = (r) => { const out = [[]]; r.forEach(([lng, lat], i) => { if (i && Math.abs(lng - r[i - 1][0]) > 180) out.push([]); out[out.length - 1].push([lng, lat]); }); return out; };
  for (const c2 of POLYS) for (const r of c2.rings) for (const p of pieces(r)) {
    if (p.length < 3) continue;
    g.beginPath(); p.forEach(([lng, lat], i) => (i ? g.lineTo(X(lng), Y(lat)) : g.moveTo(X(lng), Y(lat)))); g.closePath();
    g.fillStyle = c2.n === 'Antarctica' ? '#e8eef2' : '#8cbf6a'; g.fill();
    if (borders) { g.strokeStyle = '#6f9e55'; g.lineWidth = 1; g.stroke(); }
  }
  return c;
}
