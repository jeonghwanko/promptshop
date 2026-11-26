// The shared town: a fixed street grid with lots of four sizes. Buildings are rendered once each as sprites
// (same camera and tile size as everything else) and composited on a 2D canvas with walkers on the roads.
// One tile is 40 px wide: +x goes 20 px right and 10 px down on screen, +z goes 20 px left and 10 px down.

export const LOT_SIZES = { S: 2, M: 3, L: 4, XL: 5 };
export const GRID = { w: 24, d: 14 };
const ROAD_X = [7, 14, 21], ROAD_Z = [6, 13];
const L = (id, size, x, z) => ({ id, size, x, z, w: LOT_SIZES[size], d: LOT_SIZES[size] });
// Every lot fronts a road (its +z edge touches a road row).
export const LOTS = [
  L('A1', 'L', 0, 2), L('A2', 'M', 4, 3), L('B1', 'M', 8, 3), L('B2', 'S', 11, 4), L('C1', 'XL', 15, 1), L('D1', 'S', 22, 4),
  L('E1', 'XL', 0, 8), L('E2', 'S', 5, 11), L('F1', 'L', 8, 9), L('F2', 'S', 12, 11), L('G1', 'M', 15, 10), L('G2', 'M', 18, 10), L('H1', 'S', 22, 11),
];
export const isRoad = (x, z) => ROAD_X.includes(x) || ROAD_Z.includes(z);

export function makeProjection(top = 300, left = 24) {
  const ox = left + GRID.d * 20, oy = top;
  return {
    ox, oy, width: ox + GRID.w * 20 + left, height: oy + (GRID.w + GRID.d) * 10 + 40,
    P: (x, z) => [ox + (x - z) * 20, oy + (x + z) * 10],
    inv: (sx, sy) => { const a = (sx - ox) / 20, b = (sy - oy) / 10; return [(a + b) / 2, (b - a) / 2]; },
  };
}

/** Ground: grass, roads with lane marks, and lot pads. Drawn once to an offscreen canvas. */
export function drawGround(pr, occupied = new Set()) {
  const c = document.createElement('canvas'); c.width = pr.width; c.height = pr.height;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  const lotAt = new Map(); for (const l of LOTS) for (let x = l.x; x < l.x + l.w; x++) for (let z = l.z; z < l.z + l.d; z++) lotAt.set(x + ',' + z, l);
  const tile = (x, z, fill, edge) => {
    const [ax, ay] = pr.P(x, z), [bx, by] = pr.P(x + 1, z), [cx, cy] = pr.P(x + 1, z + 1), [dx, dy] = pr.P(x, z + 1);
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.lineTo(cx, cy); g.lineTo(dx, dy); g.closePath(); g.fillStyle = fill; g.fill();
    if (edge) { g.strokeStyle = edge; g.lineWidth = 1; g.stroke(); }
  };
  for (let z = 0; z < GRID.d; z++) for (let x = 0; x < GRID.w; x++) {
    const lot = lotAt.get(x + ',' + z);
    if (isRoad(x, z)) tile(x, z, '#8d8f93', '#7d7f83');
    else if (lot) tile(x, z, occupied.has(lot.id) ? '#cfc6ae' : '#d9cfb4', '#c4b99c');
    else tile(x, z, (x * 7 + z * 3) % 5 ? '#86b56a' : '#7fae63', '#78a75d');
  }
  // lane marks
  g.fillStyle = '#e8e2cf';
  for (const rz of ROAD_Z) for (let x = 0; x < GRID.w; x += 1) if (!ROAD_X.includes(x)) { const [px, py] = pr.P(x + .5, rz + .5); g.fillRect(Math.round(px) - 3, Math.round(py), 6, 1); }
  for (const rx of ROAD_X) for (let z = 0; z < GRID.d; z += 1) if (!ROAD_Z.includes(z)) { const [px, py] = pr.P(rx + .5, z + .5); g.fillRect(Math.round(px) - 3, Math.round(py), 6, 1); }
  // empty lots: a dashed outline, a plus and the size
  for (const l of LOTS) {
    if (occupied.has(l.id)) continue;
    const pts = [pr.P(l.x + .15, l.z + .15), pr.P(l.x + l.w - .15, l.z + .15), pr.P(l.x + l.w - .15, l.z + l.d - .15), pr.P(l.x + .15, l.z + l.d - .15)];
    g.setLineDash([3, 3]); g.strokeStyle = '#8a7d62'; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.stroke(); g.setLineDash([]);
    const [cx, cy] = pr.P(l.x + l.w / 2, l.z + l.d / 2);
    g.fillStyle = '#6f6350'; g.fillRect(Math.round(cx) - 4, Math.round(cy), 9, 1); g.fillRect(Math.round(cx), Math.round(cy) - 4, 1, 9);
    g.font = '9px sans-serif'; g.textAlign = 'center'; g.fillText(l.size, cx, cy + 14);
  }
  return c;
}

/** Lot under a map pixel, or null. */
export function lotAtPixel(pr, sx, sy) {
  const [x, z] = pr.inv(sx, sy);
  return LOTS.find(l => x >= l.x && x < l.x + l.w && z >= l.z && z < l.z + l.d) ?? null;
}

// ---------- walkers ----------
const SHIRTS = ['#c0392b', '#2e86ab', '#e3b448', '#5b8a6a', '#8064a2', '#e2743b', '#f4f1ea', '#2b2f3a'];
export function makeWalkers(n = 26, seed = 3) {
  let s = seed; const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const ws = [];
  for (let i = 0; i < n; i++) {
    const onX = r() < .5, line = onX ? ROAD_Z[Math.floor(r() * ROAD_Z.length)] : ROAD_X[Math.floor(r() * ROAD_X.length)];
    const pos = r() * (onX ? GRID.w : GRID.d);
    ws.push({ x: onX ? pos : line + .5, z: onX ? line + .5 : pos, dx: onX ? (r() < .5 ? 1 : -1) : 0, dz: onX ? 0 : (r() < .5 ? 1 : -1), shirt: SHIRTS[i % SHIRTS.length], wait: 0, speed: .6 + r() * .5, side: (r() - .5) * .5, t: r() * 10 });
  }
  return ws;
}
/** Move walkers along roads; at a crossing they may turn; in front of a building they sometimes stop like a customer. */
export function stepWalkers(ws, dt, doors = []) {
  for (const w of ws) {
    w.t += dt;
    if (w.wait > 0) { w.wait -= dt; continue; }
    w.x += w.dx * w.speed * dt; w.z += w.dz * w.speed * dt;
    if (w.x < 0 || w.x > GRID.w) w.dx *= -1;
    if (w.z < 0 || w.z > GRID.d) w.dz *= -1;
    const cx = Math.floor(w.x), cz = Math.floor(w.z);
    if (ROAD_X.includes(cx) && ROAD_Z.includes(cz) && Math.abs(w.x - cx - .5) < .05 && Math.abs(w.z - cz - .5) < .05 && Math.random() < .5) {
      if (w.dx) { w.dz = Math.random() < .5 ? 1 : -1; w.dx = 0; w.x = cx + .5; } else { w.dx = Math.random() < .5 ? 1 : -1; w.dz = 0; w.z = cz + .5; }
    }
    for (const d of doors) if (Math.abs(w.x - d.x) < .08 && Math.abs(w.z - d.z) < .5 && Math.random() < .02) w.wait = 2 + Math.random() * 3;
  }
}
export function drawWalker(g, pr, w) {
  const [px, py] = pr.P(w.x + (w.dz ? w.side : 0), w.z + (w.dx ? w.side : 0));
  const x = Math.round(px), y = Math.round(py), bob = w.wait > 0 ? 0 : Math.round(Math.sin(w.t * 10)) ;
  g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x - 2, y, 5, 1);
  g.fillStyle = '#3b3f52'; g.fillRect(x - 1, y - 3, 1, 3 + (bob > 0 ? 0 : 0)); g.fillRect(x + 1, y - 3, 1, 3);
  g.fillStyle = w.shirt; g.fillRect(x - 1, y - 7 - bob, 3, 4);
  g.fillStyle = '#f1c9a0'; g.fillRect(x - 1, y - 9 - bob, 3, 2);
}
