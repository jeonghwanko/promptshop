// 끼룩이's effects, drawn on the bird's own virtual pixel grid (one texel = one game pixel, snapped, no blur):
// sparkles that twinkle 1 → 3 → 5 px, tumbling voxel bits (2×2 cubes lit from the top-left), and a landing dust puff
// of lumpy clumps that thin out. Colours come from the bird and the game's palette. Fixed pools: no per-frame allocation.

const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const COL = {
  white: hex('#ffffff'), cream: hex('#fff3c4'), gold: hex('#ffcf3f'), goldD: hex('#d99a1c'), sky: hex('#cfe6ff'), skyD: hex('#8fb3d9'),
  pink: hex('#f6b3b5'), pinkD: hex('#d9888c'), navy: hex('#3a5ea8'), navyD: hex('#1f3870'), orange: hex('#f6ad2a'), orangeD: hex('#cf7c12'),
  ink: hex('#2e241a'), dust: hex('#f2ead8'), dustM: hex('#ddd2bc'), dustD: hex('#b9ad96'),
};
// sparkle frames: c = core, b = inner arm, a = arm tip
const SPARK = [
  ['c'],
  ['.a.', 'aca', '.a.'],
  ['..a..', '..b..', 'abcba', '..b..', '..a..'],
  ['...a...', '...b...', '...b...', 'abbcbba', '...b...', '...b...', '...a...'],
];
const SPARK_X = ['a.a', '.c.', 'a.a'];          // the diagonal twinkle frame between two crosses
// dust clumps from big to gone: x = light, m = mid, d = shadow
const DUST = [
  ['.xxm.', 'xxxxm', 'mxxmd', '.mdd.'],
  ['.xm.', 'xxxm', '.mdd'],
  ['xm', 'md'],
  ['x.', '.m'],
  ['m'],
];
const BITS = [['lm', 'md'], ['l', 'm', 'd'], ['lmd']];    // a voxel bit tumbling: square, edge-on tall, edge-on wide
const BIT_COLS = [['white', 'sky', 'skyD'], ['gold', 'gold', 'goldD'], ['pink', 'pink', 'pinkD'], ['navy', 'navy', 'navyD'], ['orange', 'orange', 'orangeD'], ['cream', 'gold', 'goldD']];

const PAL_SPARK = [{ c: COL.white, b: COL.white, a: COL.sky }, { c: COL.white, b: COL.cream, a: COL.gold }];
const PAL_DUST = { x: COL.dust, m: COL.dustM, d: COL.dustD };
const PAL_BITS = BIT_COLS.map((cs) => ({ l: COL[cs[0]], m: COL[cs[1]], d: COL[cs[2]] }));
const N = 64;
export class PixelFx {
  constructor(canvas) {
    this.canvas = canvas; this.g = canvas.getContext('2d'); this.w = 0; this.h = 0; this.img = null;
    // one pool: kind 0 sparkle, 1 bit, 2 dust
    this.kind = new Uint8Array(N); this.x = new Float32Array(N); this.y = new Float32Array(N); this.vx = new Float32Array(N); this.vy = new Float32Array(N);
    this.age = new Float32Array(N); this.life = new Float32Array(N); this.grav = new Float32Array(N); this.drag = new Float32Array(N);
    this.col = new Uint8Array(N); this.ph = new Float32Array(N); this.size = new Uint8Array(N); this.delay = new Float32Array(N); this.live = new Uint8Array(N);
    this.seed = 12345; this.dirty = true; this.count = 0;
  }
  rnd() { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 4294967296; }
  resize(w, h) { if (w === this.w && h === this.h) return; this.w = w; this.h = h; this.canvas.width = w; this.canvas.height = h; this.img = this.g.createImageData(w, h); this.dirty = true; }
  spawn(kind, x, y, vx, vy, life, opts = {}) {
    let i = 0; while (i < N && this.live[i]) i++; if (i === N) return -1;
    this.live[i] = 1; this.kind[i] = kind; this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy; this.age[i] = 0; this.life[i] = life;
    this.grav[i] = opts.grav ?? 0; this.drag[i] = opts.drag ?? 0; this.col[i] = opts.col ?? 0; this.ph[i] = opts.ph ?? 0; this.size[i] = opts.size ?? 2; this.delay[i] = opts.delay ?? 0;
    return i;
  }
  /** Twinkling stars around a point, drifting up and out. */
  sparkles(x, y, n = 6, spread = 14, delay = 0) {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + this.rnd() * 0.9, r = spread * (0.45 + this.rnd() * 0.6);
      this.spawn(0, x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8, Math.cos(a) * (6 + this.rnd() * 8), -10 - this.rnd() * 14, 0.5 + this.rnd() * 0.35,
        { drag: 2.5, size: this.rnd() < 0.35 ? 3 : 2, ph: this.rnd(), delay: delay + k * 0.035 + this.rnd() * 0.05, col: this.rnd() < 0.5 ? 0 : 1 });
    }
  }
  /** A small celebratory burst: voxel bits thrown up and out on uneven arcs, plus a few sparkles. */
  burst(x, y, n = 12) {
    for (let k = 0; k < n; k++) {
      const a = -Math.PI / 2 + (this.rnd() - 0.5) * 2.6, s = 34 + this.rnd() * 34;
      this.spawn(1, x + (this.rnd() - 0.5) * 6, y + (this.rnd() - 0.5) * 4, Math.cos(a) * s, Math.sin(a) * s - 10, 0.75 + this.rnd() * 0.4,
        { grav: 120, drag: 0.8, col: Math.floor(this.rnd() * BIT_COLS.length), ph: this.rnd() * 3, delay: this.rnd() * 0.06 });
    }
    this.sparkles(x, y - 4, 5, 18, 0.05);
  }
  /** Landing dust: lumpy clumps sliding out along the ground both ways, slowing and thinning. */
  dust(x, y, halfW = 8) {
    for (const side of [-1, 1]) for (let k = 0; k < 3; k++) {
      this.spawn(2, x + side * (halfW * 0.5 + k * 3 + this.rnd() * 2), y - this.rnd() * 2, side * (20 + k * 10 + this.rnd() * 8), -4 - this.rnd() * 6, 0.38 + k * 0.05 + this.rnd() * 0.08,
        { drag: 5, size: k === 0 ? 0 : k === 1 ? 1 : 1, grav: 6, delay: k * 0.02 });
    }
  }
  get active() { for (let i = 0; i < N; i++) if (this.live[i]) return true; return false; }
  update(dt) {
    for (let i = 0; i < N; i++) {
      if (!this.live[i]) continue;
      if (this.delay[i] > 0) { this.delay[i] -= dt; continue; }
      this.age[i] += dt; if (this.age[i] >= this.life[i]) { this.live[i] = 0; continue; }
      const dr = Math.exp(-this.drag[i] * dt);
      this.vx[i] *= dr; this.vy[i] = this.vy[i] * dr + this.grav[i] * dt;
      this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt;
    }
  }
  put(x, y, c) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const d = this.img.data, i = (y * this.w + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
  }
  sprite(rows, x, y, pal) {
    const h = rows.length, w = rows[0].length, x0 = Math.round(x) - (w >> 1), y0 = Math.round(y) - (h >> 1);
    for (let r = 0; r < h; r++) { const row = rows[r]; for (let c = 0; c < w; c++) { const ch = row[c]; if (ch !== '.') this.put(x0 + c, y0 + r, pal[ch]); } }
  }
  draw() {
    const any = this.active;
    if (!any && !this.dirty) return;
    this.img.data.fill(0);
    for (let i = 0; i < N; i++) {
      if (!this.live[i] || this.delay[i] > 0) continue;
      const u = this.age[i] / this.life[i];
      if (this.kind[i] === 0) {           // sparkle: grows, twinkles once through the diagonal frame, shrinks
        const big = this.size[i], seq = u < 0.12 ? 0 : u < 0.28 ? 1 : u < 0.5 ? big : u < 0.58 ? -1 : u < 0.78 ? big - 1 : u < 0.9 ? 1 : 0;
        this.sprite(seq < 0 ? SPARK_X : SPARK[Math.max(0, seq)], this.x[i], this.y[i], PAL_SPARK[this.col[i]]);
      } else if (this.kind[i] === 1) {    // voxel bit: tumbles through three faces, blinks out at the end
        if (u > 0.85 && Math.floor(this.age[i] * 30) % 2) continue;
        this.sprite(BITS[Math.floor(this.ph[i] + this.age[i] * 9) % 3], this.x[i], this.y[i], PAL_BITS[this.col[i]]);
      } else {                            // dust: clumps step down in size as they slow
        const k = Math.min(DUST.length - 1, this.size[i] + Math.floor(u * (DUST.length - this.size[i])));
        this.sprite(DUST[k], this.x[i], this.y[i], PAL_DUST);
      }
    }
    this.g.putImageData(this.img, 0, 0); this.dirty = any;
  }
}
