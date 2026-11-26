// An archipelago of ten islands, two rows of five. Each player owns one island; neighbours (left/right, up/down)
// can be joined by a bridge that both owners build half of. Roads are a cross through each island; a finished
// bridge continues the road over the water.

export const SLOTS = 10, COLS = 5, GAP = 16, MARGIN = 3, R = 5.8;
export const WORLD = { w: MARGIN * 2 + GAP * COLS, d: MARGIN * 2 + GAP * 2 };
export const centerOf = (slot) => { const i = slot - 1, c = i % COLS, r = Math.floor(i / COLS); return [MARGIN + c * GAP + GAP / 2 | 0, MARGIN + r * GAP + GAP / 2 | 0]; };
export const neighbours = (slot) => { const i = slot - 1, c = i % COLS, r = Math.floor(i / COLS), out = []; if (c > 0) out.push(slot - 1); if (c < COLS - 1) out.push(slot + 1); if (r > 0) out.push(slot - COLS); if (r < 1) out.push(slot + COLS); return out; };
export const bridgeId = (a, b) => Math.min(a, b) + '-' + Math.max(a, b);

// island shape: a noisy disc, the same for everyone
const SHAPE = new Map();
function islandTiles(slot) {
  if (SHAPE.has(slot)) return SHAPE.get(slot);
  const [cx, cz] = centerOf(slot), set = new Set(); let s = slot * 7919 % 233280;
  const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const bumps = Array.from({ length: 6 }, () => [rnd() * Math.PI * 2, .4 + rnd() * .7]);
  for (let z = cz - 8; z <= cz + 8; z++) for (let x = cx - 8; x <= cx + 8; x++) {
    const a = Math.atan2(z - cz, x - cx), r = R + bumps.reduce((t, [p, k]) => t + Math.cos(a * 2 + p) * k * .35, 0);
    if (Math.hypot(x - cx, z - cz) <= r) set.add(x + ',' + z);
  }
  SHAPE.set(slot, set); return set;
}
export function slotAt(x, z) { for (let s = 1; s <= SLOTS; s++) if (islandTiles(s).has(x + ',' + z)) return s; return 0; }
/** Tiles of the bridge between two neighbours, from a's side to b's side (only the water part). */
export function bridgeTiles(a, b) {
  const [ax, az] = centerOf(a), [bx, bz] = centerOf(b), out = [];
  const n = Math.abs(bx - ax) + Math.abs(bz - az), dx = Math.sign(bx - ax), dz = Math.sign(bz - az);
  for (let k = 1; k < n; k++) { const x = ax + dx * k, z = az + dz * k; if (!slotAt(x, z)) out.push([x, z]); }
  return out;
}

/**
 * The world for a set of joined islands and finished bridges.
 * joined: Set of slot numbers; bridges: Map bridgeId → { a: bool, b: bool } (halves built by the lower / higher slot)
 */
export function makeIsles(joined, bridges) {
  const roads = new Set(), bridgeSet = new Set();
  for (const s of joined) { const [cx, cz] = centerOf(s); for (const t of islandTiles(s)) { const [x, z] = t.split(',').map(Number); if (x === cx || z === cz) roads.add(t); } }
  for (const [id, h] of bridges) if (h.a && h.b) { const [a, b] = id.split('-').map(Number); if (joined.has(a) && joined.has(b)) for (const [x, z] of bridgeTiles(a, b)) { roads.add(x + ',' + z); bridgeSet.add(x + ',' + z); } }
  return {
    w: WORLD.w, d: WORLD.d, joined, bridges,
    isRoad: (x, z) => roads.has(x + ',' + z),
    isBridge: (x, z) => bridgeSet.has(x + ',' + z),
    isLand: (x, z) => slotAt(x, z) > 0,
    slotAt,
  };
}

/** Can a plot stand here on this island? Dry land of the island, not a road, not taken, touching a road on some side. Returns the door tile or null. */
export function placePlot(world, slot, x, z, n, taken) {
  const tiles = islandTiles(slot);
  for (let i = x; i < x + n; i++) for (let k = z; k < z + n; k++) if (!tiles.has(i + ',' + k) || world.isRoad(i, k) || taken.has(i + ',' + k)) return null;
  // prefer a door on the front (+z), then the sides
  for (const [i, k] of [...Array.from({ length: n }, (_, t) => [x + t, z + n]), ...Array.from({ length: n }, (_, t) => [x + n, z + t]), ...Array.from({ length: n }, (_, t) => [x - 1, z + t]), ...Array.from({ length: n }, (_, t) => [x + t, z - 1])])
    if (world.isRoad(i, k)) return [i, k];
  return null;
}
export const PLOT = { S: 2, M: 3, L: 4 };

export function islesProjection(top = 200, left = 24) {
  const ox = left + WORLD.d * 20, oy = top;
  return { ox, oy, width: ox + WORLD.w * 20 + left, height: oy + (WORLD.w + WORLD.d) * 10 + 30,
    P: (x, z) => [ox + (x - z) * 20, oy + (x + z) * 10], inv: (sx, sy) => { const a = (sx - ox) / 20, b = (sy - oy) / 10; return [(a + b) / 2, (b - a) / 2]; } };
}

/** Ground: sea, islands (joined ones green, empty ones misty), roads, bridges and half-bridges, plot pads. */
export function drawIsles(world, pr, { taken = new Set(), mine = 0 } = {}) {
  const c = document.createElement('canvas'); c.width = pr.width; c.height = pr.height;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  const tile = (x, z, fill, edge) => {
    const [ax, ay] = pr.P(x, z), [bx, by] = pr.P(x + 1, z), [cx, cy] = pr.P(x + 1, z + 1), [dx, dy] = pr.P(x, z + 1);
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.lineTo(cx, cy); g.lineTo(dx, dy); g.closePath(); g.fillStyle = fill; g.fill(); if (edge) { g.strokeStyle = edge; g.lineWidth = 1; g.stroke(); }
  };
  for (let z = 0; z < world.d; z++) for (let x = 0; x < world.w; x++) {
    const s = slotAt(x, z);
    if (!s) {
      const near = slotAt(x + 1, z) || slotAt(x - 1, z) || slotAt(x, z + 1) || slotAt(x, z - 1);
      if (world.isBridge(x, z)) { tile(x, z, '#a8703e', '#7a4a2a'); continue; }
      tile(x, z, near ? '#5aa0c4' : ((x + z) % 7 ? '#3d7fa6' : '#4387ad'), near ? '#7fb8d4' : null); continue;
    }
    const joined = world.joined.has(s), shore = !slotAt(x + 1, z) || !slotAt(x - 1, z) || !slotAt(x, z + 1) || !slotAt(x, z - 1);
    if (!joined) { tile(x, z, shore ? '#cfd8d4' : '#bfcac6', '#b2bdb9'); continue; }
    if (world.isRoad(x, z)) tile(x, z, '#8d8f93', '#7d7f83');
    else if (taken.has(x + ',' + z)) tile(x, z, '#cfc6ae', '#c4b99c');
    else if (shore) tile(x, z, '#e6d6a8', '#d8c79a');
    else tile(x, z, s === mine ? ((x * 7 + z * 3) % 5 ? '#8fc070' : '#88b968') : ((x * 7 + z * 3) % 5 ? '#86b56a' : '#7fae63'), '#78a75d');
  }
  // half bridges: planks from the builder's side to the middle
  for (const [id, h] of world.bridges) {
    if (h.a && h.b) continue; const [a, b] = id.split('-').map(Number); const t = bridgeTiles(a, b), half = Math.ceil(t.length / 2);
    const part = h.a ? t.slice(0, half) : h.b ? t.slice(t.length - half) : [];
    for (const [x, z] of part) tile(x, z, '#b8834e', '#7a4a2a');
  }
  // bridge planks
  g.fillStyle = 'rgba(60,35,20,.5)';
  for (let z = 0; z < world.d; z++) for (let x = 0; x < world.w; x++) if (world.isBridge(x, z)) { const [px, py] = pr.P(x + .5, z + .5); g.fillRect(Math.round(px) - 6, Math.round(py), 12, 1); }
  return c;
}
