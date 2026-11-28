// The live cross-section of one building: the section render, an overlay canvas with the people of an InsideSim,
// see-through fixtures that can be tapped to buy, and coins and losses that rise over the spot where they happen.
import { renderView, renderVoxels } from './render.js';
import { animalModel } from './animals.js';
import { InsideSim, FIX_INFO, FIX_ROLE, costOf, trackOrder, nextUp, LV_MAX, upgradeCost } from './inside.js';

const SHIRTS = ['#e2432f', '#2e86ab', '#e3b448', '#5b8a6a', '#8064a2', '#d97a3a'];
let tipEl = null;
function tip() {
  if (tipEl) return tipEl;
  tipEl = document.createElement('div');
  Object.assign(tipEl.style, { position: 'fixed', zIndex: 99, pointerEvents: 'none', background: '#2e241a', color: '#fbf6ea', borderRadius: '6px', padding: '5px 8px', font: '12px system-ui, "Noto Sans KR", sans-serif', display: 'none' });
  document.body.append(tipEl); return tipEl;
}

/** Which fixtures a fresh building starts with: its first counter and its first table (or seat, or shelf). */
export function startingFixtures(fixtures, order) {
  if (order?.length) {   // the building's own order: it opens with the first kind on its list, and a place to sit if it has one
    const present = order.filter(k => fixtures.some(f => f.kind === k)), first = present[0];
    const seat = present.find(k => FIX_ROLE(k) === 'seat' && k !== first) ?? (fixtures.find(f => FIX_ROLE(f.kind) === 'seat' && f.kind !== first)?.kind);
    const kinds = [first, seat ?? present[1]].filter(Boolean), out = kinds.map(k => fixtures.findIndex(f => f.kind === k)).filter(i => i >= 0);
    if (out.length) return out;
  }
  const tr = trackOrder(fixtures), out = [];
  if (tr.order.length && fixtures[tr.order[0]].kind === 'counter') out.push(tr.order[0]);
  if (tr.seat.length) out.push(tr.seat[0]); else if (tr.browse.length) out.push(tr.browse[0]);
  if (!out.length && tr.order.length) out.push(tr.order[0]);
  return out;
}

export class InsideView {
  /**
   * @param input   building spec
   * @param owned   Set of bought fixture indices (shared with the caller)
   * @param opts.coins  () => coins the viewer can spend (omit to make the view read-only)
   * @param opts.buy    (index, kind, cost) => true if bought
   * @param opts.every  seconds between walk-ins (Infinity: the caller calls sim.spawn())
   * @param opts.maxWidth  CSS pixels available
   */
  constructor(input, owned, { coins, buy, upgrade, levels = {}, every = 2.1, seed = 3, maxWidth = 900, price, onHover, tags = false, onThud, maxHeight = Infinity, maxZoom = 3, res = 1, look } = {}) {
    this.res = res; this.look = look; this.maxHeight = maxHeight; this.maxZoom = maxZoom; this.floor = 0;
    this.tags = tags; this.onThud = onThud; this.sel = -1; this.blocked = new Set(); this.onHover = onHover; this.upgradeFn = upgrade; this.levels = levels; this.input = input; this.owned = owned; this.coins = coins; this.buyFn = buy; this.maxWidth = maxWidth;
    this.el = document.createElement('div'); Object.assign(this.el.style, { position: 'relative', maxWidth: '100%' });
    this.floats = []; this.hot = -1;
    this.top = document.createElement('canvas'); Object.assign(this.top.style, { position: 'absolute', left: 0, top: 0, imageRendering: 'pixelated', cursor: coins ? 'pointer' : 'default' });
    this.g = this.top.getContext('2d');
    // words go on their own canvas at screen resolution: the pixel layers are blown up, and text drawn there breaks into blocks
    this.txt = document.createElement('canvas'); Object.assign(this.txt.style, { position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }); this.tg = this.txt.getContext('2d');
    this.redraw();
    this.sim = new InsideSim(this.view.plan, this.fx, owned, { seed, every, price }); this.sim.setLevels(levels);
    if (coins) {
      this.top.addEventListener('mousemove', (e) => this.hover(e));
      this.top.addEventListener('mouseleave', () => { tip().style.display = 'none'; if (this.hot >= 0) this.onHover?.(-1); this.hot = -1; });
      this.top.addEventListener('click', (e) => this.tryBuy(e));
    }
  }
  redraw() {
    // res draws the picture with more pixels; everything else (people, tags, taps, callers' project × zoom) stays in map pixels
    const v0 = renderView(this.input, 'section', { owned: this.owned, floor: this.floor, res: this.res, look: this.look }), R = v0.res ?? 1;
    const v = R === 1 ? v0 : { ...v0, project: (x, y, z) => { const [a, b] = v0.project(x, y, z); return [a / R, b / R]; }, labels: v0.labels.map(l => ({ ...l, x: l.x / R, y: l.y / R })) };
    this.view = v; this.fx = v.fixtures; this.R = R;
    // bought fixtures as screen boxes, to hide the part of a person they stand in front of
    this.occ = []; v.fixtures.forEach((f, i) => { if (!owned(this.owned, i) || !(f.h > .25) || !f.body) return;
      this.occ.push({ fi: f.fi, stand: f.kind === 'counter', x0: f.x + f.body[0], x1: f.x + f.body[1], z0: f.z + f.body[2], z1: f.z + f.body[3], y: f.y + f.h }); });
    const W = v.canvas.width / R, H = v.canvas.height / R, fit = Math.min(this.maxZoom ?? 3, this.maxWidth / W, this.maxHeight / H), z = Math.max(1, fit >= 2 ? Math.floor(fit) : Math.floor(fit * 8) / 8);   // whole steps when there is room, eighths on a phone or for tall buildings
    // the zoom and the box are fixed at the first drawing: changing floor or buying must not resize the view (it jumps and shakes)
    const zz = this.lockZ ?? (this.lockZ = z); this.zoom = zz; this.top.width = v.canvas.width; this.top.height = v.canvas.height;
    { const z = zz;
    // device pixels per picture pixel: blown up whole (or by 2 and more, where uneven steps don't show) it stays sharp; less, it is smoothed (a phone at 1.25 × 3 / 2)
    const k = z * (devicePixelRatio || 1) / R, sharp = k >= 2 || (k >= 1 && Math.abs(k - Math.round(k)) < .01) ? 'pixelated' : 'auto';
    for (const c of [v.canvas, this.top]) { c.style.width = W * z + 'px'; c.style.height = H * z + 'px'; c.style.imageRendering = sharp; c.style.display = 'block'; }
    { const d = Math.min(3, devicePixelRatio || 1); this.ts = z * d; this.txt.width = Math.round(W * this.ts); this.txt.height = Math.round(H * this.ts); this.txt.style.width = W * z + 'px'; this.txt.style.height = H * z + 'px'; }
    // the picture sits in an inner layer placed so the floor's centre stays on the same spot whichever floor is shown
    const fy = v.plan?.floors?.[this.floor]?.y ?? 0, [axp, ayp] = v.project(0, fy, 0);
    if (!this.box) this.box = { w: W * z, h: H * z, ax: axp * z, ay: ayp * z };
    const pic = document.createElement('div'); Object.assign(pic.style, { position: 'absolute', left: (this.box.ax - axp * z) + 'px', top: (this.box.ay - ayp * z) + 'px', width: W * z + 'px', height: H * z + 'px' });
    for (const c of [v.canvas, this.top, this.txt]) { c.style.position = c === v.canvas ? 'static' : 'absolute'; if (c !== v.canvas) { c.style.left = '0'; c.style.top = '0'; } }
    pic.append(v.canvas, this.top, this.txt); this.el.replaceChildren(pic); this.pic = pic;
    // building work: its own canvas reaching above the picture, where a new floor goes up
    this.EXT = 70; this.wk = document.createElement('canvas'); this.wk.width = Math.round(W * this.ts); this.wk.height = Math.round((H + this.EXT) * this.ts);
    Object.assign(this.wk.style, { position: 'absolute', left: '0', top: (-this.EXT * z) + 'px', width: W * z + 'px', height: (H + this.EXT) * z + 'px', pointerEvents: 'none' }); pic.append(this.wk); this.wg = this.wk.getContext('2d');
    Object.assign(this.el.style, { width: this.box.w + 'px', height: this.box.h + 'px' });
    for (const l of v.labels) {
      const e = document.createElement('div'); e.textContent = l.text;
      Object.assign(e.style, { position: 'absolute', left: (l.x * z + 4) + 'px', top: l.y * z + 'px', transform: 'translate(0,-50%)', background: '#2e241a', color: '#fbf6ea', padding: '0 6px', borderRadius: '5px', font: '12px system-ui, "Noto Sans KR", sans-serif', pointerEvents: 'none', whiteSpace: 'nowrap' });
      pic.append(e);
    }
    }
    this.floorTabs();
  }
  /** Show building work on top of the top floor: p is how far along (0..1), null to stop. */
  construct(p) { if (p === null) { this.work = null; return; } if (!this.work) { this.work = { p: 0, shown: 0, t: 0, parts: [] }; const n = this.view.plan?.floors?.length ?? 1; if (n > 1) this.setFloor(n - 1); } this.work.p = p; }
  drawWork(dt) {
    const w = this.work, g = this.wg; if (!this.wk) return; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, this.wk.width, this.wk.height); if (!w) return;
    g.setTransform(this.ts, 0, 0, this.ts, 0, this.EXT * this.ts);
    w.t += dt; w.shown += (w.p - w.shown) * Math.min(1, dt * 2.5);
    const P = this.view.project, pl = this.view.plan, fy = pl.floors[this.floor]?.y ?? 0, y0 = fy + (pl.wallH ?? 1.3) + .05, Hh = 1.5, X = pl.W / 2, Z = pl.D / 2;
    const C = [[-X, -Z], [X, -Z], [X, Z], [-X, Z]], at = (c, y) => P(c[0], y, c[1]);
    const poly = (pts, fill) => { g.beginPath(); pts.forEach(([x, y], k) => k ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fillStyle = fill; g.fill(); };
    // the new floor filling in, as a pale block rising with the work
    const top = y0 + Hh * Math.max(.05, w.shown);
    // only the two back walls rise (the front is open in a cut-away; a block there would hide the room)
    poly([at(C[0], y0), at(C[1], y0), at(C[1], top), at(C[0], top)], 'rgba(226,206,170,.9)');
    poly([at(C[0], y0), at(C[3], y0), at(C[3], top), at(C[0], top)], 'rgba(205,184,148,.9)');
    for (const [a, b] of [[C[0], C[1]], [C[0], C[3]]]) { for (let yy = y0 + .25; yy < top; yy += .25) { const p0 = at(a, yy), p1 = at(b, yy); g.strokeStyle = 'rgba(160,130,95,.35)'; g.lineWidth = .6; g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke(); } }
    // scaffolding: poles, planks at two heights, braces on the back faces
    g.lineCap = 'round'; const line = (a, b, c, wdt) => { g.strokeStyle = c; g.lineWidth = wdt; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); };
    for (const c of [C[0], C[1], C[3]]) { line(at(c, y0 - .1), at(c, y0 + Hh + .2), '#3a2a1c', 2.6); line(at(c, y0 - .1), at(c, y0 + Hh + .2), '#c9cfd6', 1.4); }
    for (const yy of [y0 + Hh * .5, y0 + Hh]) for (const [a, b] of [[C[0], C[1]], [C[0], C[3]]]) { line(at(a, yy), at(b, yy), '#3a2a1c', 3); line(at(a, yy), at(b, yy), '#c08a4a', 1.8); }
    line(at(C[0], y0), at(C[1], y0 + Hh * .5), '#c9cfd6', 1); line(at(C[0], y0 + Hh * .5), at(C[3], y0 + Hh), '#c9cfd6', 1);
    // hazard tape along the top of the old back walls
    for (const [a0, b0] of [[C[1], C[0]], [C[0], C[3]]]) { const a = at(a0, y0 + .05), b = at(b0, y0 + .05), n = 12; for (let k = 0; k < n; k++) { const u0 = k / n, u1 = (k + 1) / n; line([a[0] + (b[0] - a[0]) * u0, a[1] + (b[1] - a[1]) * u0], [a[0] + (b[0] - a[0]) * u1, a[1] + (b[1] - a[1]) * u1], k % 2 ? '#2e241a' : '#ffcf3f', 2.2); } }
    // sparks where something is being fixed, and dust at the foot
    if (Math.random() < dt * 9) { const [c0, c1] = Math.random() < .5 ? [C[0], C[1]] : [C[0], C[3]], u = Math.random(), yy = y0 + Hh * (.3 + Math.random() * .7) * Math.max(.3, w.shown);
      const [sx, sy] = P(c0[0] + (c1[0] - c0[0]) * u, yy, c0[1] + (c1[1] - c0[1]) * u); for (let k = 0; k < 6; k++) w.parts.push({ x: sx, y: sy, vx: (Math.random() - .5) * 40, vy: -20 - Math.random() * 30, t: 0, spark: true }); }
    if (Math.random() < dt * 3) { const c = [C[0], C[1], C[3]][Math.floor(Math.random() * 3)], [sx, sy] = at(c, y0); w.parts.push({ x: sx, y: sy, vx: (Math.random() - .5) * 10, vy: -6, t: 0 }); }
    for (const q of w.parts) { q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt; if (q.spark) q.vy += 90 * dt; }
    w.parts = w.parts.filter(q => q.t < (q.spark ? .45 : 1.1));
    for (const q of w.parts) { if (q.spark) { g.fillStyle = `rgba(255,${200 + Math.random() * 55 | 0},90,${1 - q.t / .45})`; g.fillRect(q.x - .6, q.y - .6, 1.4, 1.4); } else { g.fillStyle = `rgba(215,200,170,${.55 * (1 - q.t / 1.1)})`; g.beginPath(); g.arc(q.x, q.y, 2 + q.t * 5, 0, 7); g.fill(); } }
  }
  /**
   * Where a person standing at (px, pz) on floor fi is cut off by the bought fixtures in front of them: a fixture hides them
   * when the line from their feet toward the camera (+x, +z) passes through its body (or they stand in a counter, a clerk).
   * Returns the screen y above which they show (the highest such top), or null.
   */
  cutAt(px, pz, fi) {
    if (this.R < 2) return null;   // the small old figures are drawn over everything, as before
    let cut = null;
    for (const o of this.occ) { if (o.fi !== fi) continue;
      const t0 = Math.max(0, o.x0 - px, o.z0 - pz), t1 = Math.min(o.x1 - px, o.z1 - pz);   // where the line is inside the body on both axes
      if (t1 <= .02 || t1 < t0) continue;
      if (Math.max(o.x0 - px, o.z0 - pz) < 0 && !o.stand) continue;   // standing in it is sitting on it (a stool, a sofa, a bed); only a counter has someone standing inside
      const top = this.view.project(px + t0, o.y, pz + t0)[1];   // its top edge where the line goes in: the far edge, the highest on screen
      cut = cut === null ? top : Math.min(cut, top); }
    return cut;
  }
  /** Is a point at height y on the floor being shown? (one-floor buildings: always) */
  onFloor(y) { const n = this.view.plan?.floors?.length ?? 1; if (n < 2) return true; const g = this.view.plan.gap; return Math.floor((y + .01) / g) === this.floor; }
  setFloor(k) { if (k === this.floor) return; this.floor = k; this.floats = []; this.burst = null; this.dust = null; this.redraw(); this.onFloorChange?.(k); }
  /** Floor buttons beside the cut-away, top floor first, with how many guests are on each. */
  floorTabs() {
    const n = this.view.plan?.floors?.length ?? 1; this.tabs = null; if (n < 2) return;
    const bar = document.createElement('div'); bar.className = 'floortabs'; this.tabs = [];
    for (let k = n - 1; k >= 0; k--) { const b = document.createElement('button'); b.className = 'ftab' + (k === this.floor ? ' on' : ''); b.innerHTML = `<b>${k + 1}F</b><small></small>`;
      b.onclick = (e) => { e.stopPropagation(); this.setFloor(k); }; bar.append(b); this.tabs[k] = b; }
    this.el.append(bar);
  }
  ghostAt(e) {
    const r = this.top.getBoundingClientRect(), mx = (e.clientX - r.left) / this.zoom, my = (e.clientY - r.top) / this.zoom;
    let best = -1, bd = 16;
    const can = this.buyable();
    this.fx.forEach((f, i) => { if (!can.has(i) || f.fi !== this.floor && this.tabs) return; for (const h of this.tags ? [.3, 1.05] : [.3]) { const [x, y] = this.view.project(f.x, f.y + h, f.z), d = Math.hypot(x - mx, y - my); if (d < bd) { bd = d; best = i; } } });
    return best;
  }
  ownedAt(e) {
    const r = this.top.getBoundingClientRect(), mx = (e.clientX - r.left) / this.zoom, my = (e.clientY - r.top) / this.zoom;
    let best = -1, bd = 14;
    this.fx.forEach((f, i) => { if (!this.owned.has(i) || f.fi !== this.floor && this.tabs) return; const [x, y] = this.view.project(f.x, f.y + .3, f.z), d = Math.hypot(x - mx, y - my); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  /** A thump where a fixture lands: dust, and the caller shakes the view. */
  thud(i, text, kind = 'buy') { const f = this.fx[i]; if (this.tabs && f.fi !== this.floor) this.setFloor(f.fi); this.floats = this.floats.filter(o => !(o.t === 0 && !o.big && o.x === f.x && o.z === f.z));   // the small word pushed by the same press would sit under the big one
    this.floats.push({ text: text || (kind === 'up' ? '레벨업!' : '쿵!'), x: f.x, y: f.y + 1, z: f.z, t: 0, big: true }); this.dust = { i, t: 0 }; this.burst = { i, t: 0, kind }; this.onThud?.(i); }
  /** Raise an owned fixture one level. */
  upgradeIndex(i) {
    const f = this.fx[i], L = this.levels[i] ?? 1; if (L >= LV_MAX) return false;
    const c = upgradeCost(f.kind, L);
    if (!this.upgradeFn || this.coins() < c || !this.upgradeFn(i, f.kind, c, L + 1)) { this.floats.push({ text: '동전 모자람', x: f.x, y: f.y + 1, z: f.z, t: 0, bad: true }); return false; }
    this.levels[i] = L + 1; this.sim.setLevels(this.levels);
    this.floats.push({ text: `⬆ Lv${L + 1}`, x: f.x, y: f.y + 1, z: f.z, t: 0 });
    return true;
  }
  /** Screen point of a fixture that can be bought now, preferring the suggested ones (for the guide's arrow). */
  ghostPoint() {
    const can = [...this.buyable()].filter(j => !this.tabs || this.fx[j].fi === this.floor), i = can.find(j => this.suggest?.has(this.fx[j].kind)) ?? can[0]; if (i === undefined) return null;
    const f = this.fx[i], [x, y] = this.view.project(f.x, f.y + .55, f.z), r = this.top.getBoundingClientRect();
    return [r.left + x * this.zoom, r.top + y * this.zoom - 6];
  }
  /** Fixtures that can be bought now: the next of each track. */
  buyable() { return new Set(Object.values(nextUp(this.fx, this.owned, undefined, this.input.order))); }
  hover(e) {
    if (this.tags) { tip().style.display = 'none'; const i = this.ghostAt(e); if (i !== this.hot) { this.hot = i; this.onHover?.(i); } this.top.style.cursor = i >= 0 || this.ownedAt(e) >= 0 ? 'pointer' : 'default'; return; }
    const i = this.ghostAt(e), t = tip(); if (i !== this.hot) this.onHover?.(i); this.hot = i;
    if (i < 0) {
      const o = this.upgradeFn ? this.ownedAt(e) : -1;
      if (o !== this.hotUp) { this.hotUp = o; this.onHover?.(o, 'up'); }
      if (o < 0) { t.style.display = 'none'; return; }
      const f = this.fx[o], L = this.levels[o] ?? 1, name = FIX_INFO[f.kind]?.[0] ?? f.kind;
      t.textContent = L >= LV_MAX ? `${name} Lv${L} · 최고 레벨` : `${name} Lv${L} → Lv${L + 1} · ${upgradeCost(f.kind, L)}동전 · 누르면 올려요`;
      t.style.display = 'block'; t.style.left = e.clientX + 12 + 'px'; t.style.top = e.clientY + 12 + 'px'; return;
    }
    const f = this.fx[i], [name, what] = FIX_INFO[f.kind] ?? [f.kind, '꾸밈'], c = costOf(f.kind);
    t.textContent = `${name} · ${what} · ${c}동전${this.coins() < c ? ' (모자람)' : ''}`;
    t.style.display = 'block'; t.style.left = e.clientX + 12 + 'px'; t.style.top = e.clientY + 12 + 'px';
  }
  tryBuy(e) { const i = this.ghostAt(e); if (i >= 0) { if (this.buyIndex(i)) this.thud(i); this.sel = -1; this.hover(e); return; } const o = this.upgradeFn ? this.ownedAt(e) : -1;
    if (this.tags) { if (o < 0) { this.sel = -1; return; } if (this.sel !== o) { this.sel = o; return; } if (this.upgradeIndex(o)) this.thud(o); return; }
    if (o >= 0) { this.upgradeIndex(o); this.hotUp = -2; this.hover(e); } }
  /** Buy fixture i (also used by the flow diagram's fix button). */
  buyIndex(i) {
    const f = this.fx[i], c = costOf(f.kind);
    if (this.coins() < c || !this.buyFn(i, f.kind, c)) { this.floats.push({ text: '동전 모자람', x: f.x, y: f.y + 1, z: f.z, t: 0, bad: true }); return; }
    this.owned.add(i); this.sim.setOwned(this.owned); this.redraw();
    this.floats.push({ text: (FIX_INFO[f.kind]?.[0] ?? f.kind) + '!', x: f.x, y: f.y + 1, z: f.z, t: 0 });
    return true;
  }
  /** Step the sim and draw. Returns the coin events of this step ({n, tip}). */
  frame(dt) {
    this.sim.step(dt); this.drawWork(dt);
    const { g, view, sim } = this, P = view.project, paid = [];
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, this.top.width, this.top.height); g.setTransform(this.R, 0, 0, this.R, 0, 0);
    const tg = this.tg; tg.setTransform(1, 0, 0, 1, 0, 0); tg.clearRect(0, 0, this.txt.width, this.txt.height); tg.setTransform(this.ts, 0, 0, this.ts, 0, 0);
    const can = this.coins ? this.buyable() : new Set();
    if (this.coins && this.tags) {
      const tag = (x, y, text, ok, big) => { g.font = 'bold 7px system-ui'; const w = Math.ceil(g.measureText(text).width) + 9, bx = Math.round(x - w / 2), by = Math.round(y - 10 - (big ? Math.abs(Math.sin(performance.now() / 200)) * 2 : 0));
        g.fillStyle = '#2b1e15'; g.fillRect(bx - 1, by - 1, w + 2, 10); g.fillStyle = ok ? '#f2c12e' : '#b8ad98'; g.fillRect(bx, by, w, 8);
        g.fillStyle = ok ? '#c48a1a' : '#8f8573'; g.fillRect(bx, by + 7, w, 1); g.fillStyle = '#2b1e15'; g.fillRect(Math.round(x), by + 8, 1, 2);
        if (this.R >= 2) dots(g, bx + 1.5, by + 1, COIN, { o: '#c48a1a', y: '#ffd25a' }, null); else { g.fillStyle = '#c48a1a'; g.fillRect(bx + 2, by + 2, 3, 4); } tg.font = 'bold 7px system-ui, "Noto Sans KR", sans-serif'; tg.fillStyle = '#2b1e15'; tg.textAlign = 'left'; tg.fillText(text, bx + 7, by + 6.6); };
      const few = new Set([...can].filter(i => this.onFloor(this.fx[i].y)).sort((a, b) => costOf(this.fx[a].kind) - costOf(this.fx[b].kind)).slice(0, 2)); if (this.hot >= 0) few.add(this.hot); if (this.flash >= 0 && can.has(this.flash)) few.add(this.flash);
      this.fx.forEach((f, i) => { if (!few.has(i) || !this.onFloor(f.y)) return; const [x, y] = P(f.x, f.y + .9, f.z); tag(x, y, String(costOf(f.kind)), this.coins() >= costOf(f.kind), this.suggest?.has(f.kind)); });
      if (this.sel >= 0 && this.owned.has(this.sel) && this.onFloor(this.fx[this.sel].y)) { const f = this.fx[this.sel], L = this.levels[this.sel] ?? 1; const [x, y] = P(f.x, f.y + 1.1, f.z);
        if (L < 5) tag(x, y, `Lv${L + 1} · ${upgradeCost(f.kind, L)}`, this.coins() >= upgradeCost(f.kind, L), true); }
      g.textAlign = 'center';
    }
    if (this.flash >= 0 && this.fx[this.flash] && this.onFloor(this.fx[this.flash].y)) { const f = this.fx[this.flash], [x, y] = P(f.x, f.y + .3, f.z), pul = 6 + Math.sin(performance.now() / 120) * 2;
      g.strokeStyle = '#ffd23a'; g.lineWidth = 2; g.beginPath(); g.ellipse(Math.round(x), Math.round(y), pul + 6, pul * .55 + 3, 0, 0, 7); g.stroke(); }
    // the step that holds guests up steams red
    for (const i of this.blocked) { const f = this.fx[i]; if (!f || !this.onFloor(f.y)) continue; for (let k = 0; k < 3; k++) { const ph = (performance.now() / 900 + k / 3) % 1, [x, y] = P(f.x + (k - 1) * .12, f.y + .7 + ph * .9, f.z);
      g.globalAlpha = (1 - ph) * .75; g.fillStyle = k === 1 ? '#e2685a' : '#f0a090'; g.beginPath(); g.arc(Math.round(x), Math.round(y), 2 + ph * 3, 0, 7); g.fill(); } g.globalAlpha = 1; }
    if (this.burst) { const b = this.burst; b.t += dt; const f = this.fx[b.i]; if (f && b.t < .9) { const [x, y] = P(f.x, f.y + .2, f.z), r = 4 + b.t * 40;
        g.strokeStyle = `rgba(255,210,58,${1 - b.t / .9})`; g.lineWidth = 2; g.beginPath(); g.ellipse(Math.round(x), Math.round(y), r, r * .5, 0, 0, 7); g.stroke();
        if (b.kind === 'up') for (let k = 0; k < 7; k++) { const a = k / 7 * 6.28 + b.t * 3, rr = 6 + b.t * 22; g.fillStyle = `rgba(255,230,120,${1 - b.t / .9})`; g.fillRect(Math.round(x + Math.cos(a) * rr), Math.round(y - b.t * 30 + Math.sin(a) * rr * .5), 2, 2); }
        g.fillStyle = `rgba(255,250,220,${.5 * (1 - b.t / .9)})`; g.beginPath(); g.ellipse(Math.round(x), Math.round(y) - 4, 9, 7, 0, 0, 7); g.fill(); } else this.burst = null; }
    if (this.dust) { this.dust.t += dt; const f = this.fx[this.dust.i]; if (f && this.dust.t < .5) { const [x, y] = P(f.x, f.y, f.z); g.fillStyle = `rgba(200,180,140,${.8 - this.dust.t * 1.6})`; for (let k = 0; k < 8; k++) { const a = k / 8 * 6.28, r = 4 + this.dust.t * 26; g.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r * .5), 2, 2); } } else this.dust = null; }
    if (this.coins && !this.tags) this.fx.forEach((f, i) => {
      if (!can.has(i) || !this.onFloor(f.y)) return; const [x, y] = P(f.x, f.y + .55, f.z), cx = Math.round(x), cy = Math.round(y), ok = this.coins() >= costOf(f.kind);
      // suggested fixtures blink larger
      const big = this.suggest?.has(f.kind) && Math.sin(performance.now() / 160) > -.3, r = big ? 4 : 2;
      g.fillStyle = i === this.hot ? '#ffffff' : ok ? (big ? '#ffd23a' : '#e3b448') : 'rgba(160,150,130,.7)'; g.fillRect(cx - r, cy - r, r * 2 + 1, r * 2 + 1);
      g.fillStyle = '#2e241a'; g.fillRect(cx, cy - r + 1, 1, r * 2 - 1); g.fillRect(cx - r + 1, cy, r * 2 - 1, 1);
    });
    // levels above 1: a small gold badge over the fixture
    g.font = 'bold 9px system-ui'; g.textAlign = 'center';
    for (const [i, L] of Object.entries(this.levels)) { if (L <= 1 || !this.owned.has(+i) || this.tags && +i !== this.sel && +i !== this.flash && +i !== this.burst?.i) continue; const f = this.fx[i]; if (!f || !this.onFloor(f.y)) continue; const [x, y] = P(f.x, f.y + .5, f.z);
      const bx = Math.round(x) - (L - 1) * 2, by = Math.round(y) - 6; g.fillStyle = '#2e241a'; g.fillRect(bx - 1, by - 1, (L - 1) * 4 + 1, 4); g.fillStyle = '#ffd25a'; for (let k = 0; k < L - 1; k++) g.fillRect(bx + k * 4, by, 3, 2); }   // one gold pip per level above 1
    const list = [];
    for (const s of sim.staff) { if (!this.onFloor(sim.floorY(s.f))) continue; const fy = sim.floorY(s.f), [x, y] = P(s.x, fy, s.z);
      list.push({ x, y, s, cut: this.cutAt(s.x, s.z, s.f) }); }   // a clerk stands in the counter: only what rises above its top shows
    for (const p of sim.people) { p.moving = p.moves.length > 0; if (!this.onFloor(p.y)) continue; const [x, y] = P(p.x, p.y, p.z); list.push({ x, y, p, cut: this.cutAt(p.x, p.z, p.f) });
      const m = p.moves[0]; if (m) { const [nx] = P(m.x, p.y, m.z); if (Math.abs(nx - x) > .3) p.dir = nx > x ? 1 : -1; } }   // which way they face: where they walk next
    if (this.tabs) { const cnt = this.tabs.map(() => 0), g0 = this.view.plan.gap; for (const p of sim.people) { const k = Math.max(0, Math.min(cnt.length - 1, Math.floor((p.y + .01) / g0))); cnt[k]++; }
      this.tabs.forEach((b, k) => { const t = cnt[k] ? String(cnt[k]) : ''; const sm = b.lastChild; if (sm.textContent !== t) sm.textContent = t; }); }
    list.sort((a, b) => a.y - b.y);
    const draw = this.R >= 2 ? personHD : person;   // finer pixels get finer people
    list.forEach((o, k) => { if (o.cut != null) { g.save(); g.beginPath(); g.rect(o.x - 30, o.cut - 90, 60, 90); g.clip(); }
      o.s ? (this.input.owner ? ownerStaff(g, o.x, o.y, this.input.owner, o.s.kind, this.R >= 2, k) : draw(g, o.x, o.y, { t: 0, id: k * 7 + 3, dir: -1 }, o.s.kind)) : draw(g, o.x, o.y, o.p); if (o.cut != null) g.restore(); });
    for (const e of sim.events.splice(0)) {
      if (e.kind === 'coin') paid.push(e);
      this.floats.push({ text: e.kind === 'coin' ? `+${e.n}` : e.why, x: e.x, y: sim.floorY(e.f) + 1.1, z: e.z, t: 0, bad: e.kind === 'lost', tip: e.tip });
    }
    g.font = 'bold 10px system-ui'; g.textAlign = 'center';
    tg.textAlign = 'center'; tg.lineJoin = 'round';
    for (const f of this.floats) {
      f.t += dt * (f.big ? .7 : 1); if (!this.onFloor(f.y - .9)) continue; const [x, y] = P(f.x, f.y, f.z), yy = y - f.t * 14;
      tg.font = f.big ? '900 12px "Noto Sans KR", system-ui, sans-serif' : '800 9px "Noto Sans KR", system-ui, sans-serif';
      tg.globalAlpha = Math.max(0, 1 - f.t / 1.4); tg.lineWidth = f.big ? 3 : 2.4; tg.strokeStyle = '#2e241a'; tg.strokeText(f.text, x, yy);
      tg.fillStyle = f.bad ? '#ff8a7a' : f.tip ? '#f9a8c8' : '#ffd25a'; tg.fillText(f.text, x, yy);
    }
    tg.globalAlpha = 1;
    g.globalAlpha = 1; this.floats = this.floats.filter(f => f.t < 1.4);
    return paid;
  }
}

const owned = (set, i) => set === undefined || (typeof set === 'number' ? i < set : set.has(i));
function person(g, x, y, p, staff) {
  x = Math.round(x); y = Math.round(y);
  const sit = p.state === 'sit' || p.state === 'food', bob = !sit && p.moving ? (Math.sin(p.t * 12) > 0 ? 1 : 0) : 0;
  g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(x - 3, y, 7, 1);
  const by = sit ? y - 3 : y - 4;
  if (!sit) { g.fillStyle = '#3b3f52'; g.fillRect(x - 2, y - 4, 2, 4); g.fillRect(x + 1, y - 4, 2, 4); }
  g.fillStyle = staff ? '#f4f1ea' : SHIRTS[p.shirt]; g.fillRect(x - 2, by - 6 - bob, 5, 6);
  if (staff) { g.fillStyle = staff === 'cook' ? '#e2432f' : '#2e5d8a'; g.fillRect(x - 2, by - 6 - bob, 5, 2); }
  g.fillStyle = '#f1c9a0'; g.fillRect(x - 2, by - 10 - bob, 4, 4);
  g.fillStyle = staff === 'cook' ? '#ffffff' : '#4a3424'; g.fillRect(x - 2, by - (staff === 'cook' ? 13 : 11) - bob, 4, staff === 'cook' ? 3 : 1);
  if (p.vip) { g.fillStyle = '#ffd23a'; g.fillRect(x - 2, by - 12 - bob, 5, 2); g.fillRect(x - 2, by - 14 - bob, 1, 2); g.fillRect(x, by - 14 - bob, 1, 2); g.fillRect(x + 2, by - 14 - bob, 1, 2); }
  if (!staff && p.mood && p.mood !== 'ok') bubble(g, x, by - 14 - bob, p.mood);
}
// ---------- the owner animal behind the counters (the building's owner runs it; every clerk and cook is that animal) ----------
const STAFF_SPRITES = new Map();
function ownerSprite(id, kind) {
  const key = id + ':' + kind; let c = STAFF_SPRITES.get(key);
  if (!c) { c = renderVoxels(animalModel(id, { apron: kind === 'cook' ? '#f4f1ea' : '#2e5d8a' }), { k: 2, yaw: .38, pitch: .32, character: true }); STAFF_SPRITES.set(key, c); }
  return c;
}
function ownerStaff(g, x, y, id, kind, hd, k) {
  const c = ownerSprite(id, kind), h = hd ? 25 : 15, w = c.width / c.height * h;
  const bob = Math.sin(performance.now() / 260 + k * 1.7) > .6 ? (hd ? .5 : 1) : 0;   // a little hop now and then: alive, not walking
  if (kind === 'clerk') y -= hd ? 6 : 3;   // on a step behind the counter: an animal's head is most of it, so its face must clear the top
  g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(x - w * .3, y - .5, w * .6, 1.5);
  const sm = g.imageSmoothingEnabled; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(c, x - w / 2, y - h - bob, w, h); g.imageSmoothingEnabled = sm;
}
// ---------- people on half-pixels (when the cut-away is drawn at res 2 or more) ----------
const SKIN = ['#f3cfa6', '#e6b68c', '#c99066', '#9a6440'], HAIR = ['#3a2a20', '#1d1a19', '#6b4226', '#b9792f', '#8a8f99', '#9c3a2a', '#e0c070'];
const PANTS = ['#3b3f52', '#2f4a6b', '#5a4a3a', '#2b2b2b', '#6b6f78'], INK = '#2a1f18';
const dim = (hex, k) => { const n = parseInt(hex.slice(1), 16); return `rgb(${(n >> 16) * k | 0},${(n >> 8 & 255) * k | 0},${(n & 255) * k | 0})`; };
/**
 * A small figure: head with hair, eyes and cheeks, a shirt with arms and hands, legs and shoes; an ink outline around it.
 * Drawn on a half-pixel grid of the map (f = .5), about 26 map pixels tall, feet at (x, y).
 * p.dir: 1 faces right, -1 left. Walking swings the legs and arms; sitting folds the legs.
 */
function personHD(g, x, y, p, staff) {
  const f = .5; x = Math.round(x / f) * f; y = Math.round(y / f) * f;
  const id = p.id ?? 0, dir = p.dir ?? 1, sit = p.state === 'sit' || p.state === 'food', walk = !sit && p.moving, ph = walk ? (Math.sin(p.t * 12) > 0 ? 1 : -1) : 0;
  const skin = SKIN[(id * 5 + 1) % SKIN.length], hair = HAIR[(id * 3) % HAIR.length], pants = staff ? '#33343c' : PANTS[(id * 7) % PANTS.length];
  const shirt = staff ? '#f4f1ea' : SHIRTS[p.shirt ?? 0], shoe = '#2a2420';
  const parts = [], R = (xf, yf, wf, hf, c, ink = true) => parts.push([dir > 0 ? xf : -xf - wf, yf, wf, hf, c, ink]);   // mirrored for facing left
  // about 26 map pixels tall: a head and a half above a counter, so a clerk behind one still shows head and shoulders
  const T = sit ? -21 : -31 + (walk && ph > 0 ? 1 : 0), sw = walk ? ph : 0;   // the top of the shirt; a step lifts the body a half-pixel
  if (!sit) { const la = ph > 0 ? 1 : 0, lb = ph < 0 ? 1 : 0;   // the lifted leg is a half-pixel shorter
    R(-6, -16, 5, 14 - la, pants); R(1, -16, 5, 14 - lb, pants); R(-6, -2 - la, 5, 2, shoe); R(1, -2 - lb, 6, 2, shoe); }
  R(-10, T + 1 + sw, 3, 10, dim(shirt, .82)); R(-10, T + 11 + sw, 3, 3, skin);   // arms, then the shirt over their inner edge
  R(7, T + 1 - sw, 3, 10, dim(shirt, .72)); R(7, T + 11 - sw, 3, 3, dim(skin, .9));
  R(-7, T, 14, 15, shirt); R(4, T, 3, 15, dim(shirt, .84), false);   // the side away from the sun
  if (staff === 'cook') { R(-7, T, 14, 2, '#e2432f', false); R(-1, T + 2, 3, 2, '#e2432f', false); }
  if (staff === 'clerk') { R(-6, T + 6, 12, 9, '#2e5d8a', false); R(-5, T, 2, 6, '#2e5d8a', false); R(3, T, 2, 6, '#2e5d8a', false); }
  if (sit) { R(-7, -9, 14, 4, pants); R(-7, -5, 5, 2, shoe); R(2, -5, 5, 2, shoe); }   // thighs forward over the seat
  const H = T - 15;   // head
  R(-6, H, 12, 14, skin); R(-7, H + 1, 14, 12, skin); R(5, H + 1, 2, 12, dim(skin, .88), false);
  if (staff === 'cook') { R(-6, H - 7, 12, 7, '#ffffff'); R(-7, H - 10, 14, 4, '#ffffff'); R(-7, H, 14, 2, '#e8e4dc'); }
  else { R(-6, H - 1, 12, 4, hair); R(-7, H, 14, 4, hair); R(-7, H + 4, 2, 6, hair, false); R(2, H + 4, 4, 1, hair, false); }   // a cap of hair, the back of the head, a fringe
  R(0, H + 6, 1, 3, INK, false); R(4, H + 6, 1, 3, INK, false);   // eyes toward the way they face
  R(-1, H + 10, 2, 1, '#ec9a8e', false); R(5, H + 10, 1, 1, '#ec9a8e', false); R(2, H + 11, 2, 1, '#9a4a3a', false);   // cheeks and a mouth
  if (p.vip) { R(-6, H - 4, 12, 2, '#ffd23a'); R(-6, H - 6, 2, 2, '#ffd23a'); R(-1, H - 7, 2, 3, '#ffd23a'); R(4, H - 6, 2, 2, '#ffd23a'); }
  // shadow, ink outline (every part one half-pixel larger), then the colours
  g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(x - 5, y - .5, 10, 1.5); g.fillRect(x - 4, y - 1, 8, .5);
  g.fillStyle = INK; for (const [a, b, w, h, , ink] of parts) if (ink) g.fillRect(x + (a - 1) * f, y + (b - 1) * f, (w + 2) * f, (h + 2) * f);
  for (const [a, b, w, h, c] of parts) { g.fillStyle = c; g.fillRect(x + a * f, y + b * f, w * f, h * f); }
  if (!staff && p.mood && p.mood !== 'ok') bubbleHD(g, x, y + (H - 2) * f, p.mood);
}
/** A small picture on the half-pixel grid: rows of characters, pal maps a character to a colour ('.' is empty); ink outlines it. */
function dots(g, x, y, rows, pal, ink = INK) {
  const f = .5, on = (r, c) => r >= 0 && r < rows.length && c >= 0 && c < rows[r].length && rows[r][c] !== '.';
  if (ink) { g.fillStyle = ink; rows.forEach((row, r) => { for (let c = 0; c < row.length; c++) if (on(r, c)) for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!on(r + dr, c + dc)) g.fillRect(x + (c + dc) * f, y + (r + dr) * f, f, f); }); }
  rows.forEach((row, r) => { for (let c = 0; c < row.length; c++) { const k = row[c]; if (k !== '.') { g.fillStyle = pal[k]; g.fillRect(x + c * f, y + r * f, f, f); } } });
}
const HEART = ['.##...##.', '#w##.####', '#########', '#########', '.#######.', '..#####..', '...###...', '....#....'];
const BUBBLE = ['.#############.', ...Array(8).fill('###############'), '.#############.', '....##.........', '....#..........'];
const MOOD_MARK = {
  wait: [[3, 4, 'a'], [7, 4, 'a'], [11, 4, 'a']].flatMap(([c, r, k]) => [[c, r, k], [c + 1, r, k], [c, r + 1, k], [c + 1, r + 1, k]]),
  'seat?': [[5, 1], [5, 2], [5, 3], [5, 4], [5, 5], [5, 6], [5, 7], [6, 4], [7, 4], [8, 4], [9, 4], [9, 5], [9, 6], [9, 7], [6, 5], [7, 5], [8, 5]].map(([c, r]) => [c, r, 'b']),
  angry: [0, 1, 2, 3, 4, 5].flatMap(k => [[5 + k, 2 + k, 'c'], [6 + k, 2 + k, 'c'], [10 - k, 2 + k, 'c'], [11 - k, 2 + k, 'c']]),
};
/** The mood over a guest's head on the half-pixel grid, its tail at (x, y). */
function bubbleHD(g, x, y, mood) {
  x = Math.round(x * 2) / 2; y = Math.round(y * 2) / 2;
  if (mood === 'heart') return dots(g, x - 2, y - 4, HEART, { '#': '#e2557a', w: '#ffd0dc' });
  const rows = BUBBLE.map(r => r.replace(/#/g, 'o').split('')), mark = MOOD_MARK[mood] ?? [];
  for (const [c, r, k] of mark) if (rows[r]?.[c] === 'o') rows[r][c] = k;
  dots(g, x - 2.25, y - 6, rows.map(r => r.join('')), { o: '#ffffff', a: '#8b9a9c', b: '#8a6a4a', c: '#c2402e' });
}
const COIN = ['.oooo.', 'oyyyyo', 'oyyoyo', 'oyyoyo', 'oyyyyo', '.oooo.'];
function bubble(g, x, y, mood) {
  if (mood === 'heart') { g.fillStyle = '#e2557a'; for (const [a, b] of [[-2, 0], [-1, -1], [1, -1], [2, 0], [-2, 1], [-1, 1], [0, 1], [1, 1], [2, 1], [-1, 2], [0, 2], [1, 2], [0, 3], [0, 0], [-1, 0], [1, 0]]) g.fillRect(x + a, y - 4 + b, 1, 1); return; }
  g.fillStyle = '#ffffff'; g.fillRect(x - 4, y - 8, 9, 8); g.fillRect(x - 1, y, 2, 2);
  if (mood === 'wait') { g.fillStyle = '#8b9a9c'; for (const a of [-2, 0, 2]) g.fillRect(x + a, y - 4, 1, 1); }
  else if (mood === 'seat?') { g.fillStyle = '#8a6a4a'; g.fillRect(x - 2, y - 4, 4, 1); g.fillRect(x - 2, y - 7, 1, 6); g.fillRect(x + 1, y - 4, 1, 3); }
  else if (mood === 'angry') { g.fillStyle = '#c2402e'; for (let k = 0; k < 5; k++) { g.fillRect(x - 2 + k, y - 6 + k, 1, 1); g.fillRect(x + 2 - k, y - 6 + k, 1, 1); } }
}
