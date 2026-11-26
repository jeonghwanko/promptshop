// The live cross-section of one building: the section render, an overlay canvas with the people of an InsideSim,
// see-through fixtures that can be tapped to buy, and coins and losses that rise over the spot where they happen.
import { renderView } from './render.js';
import { InsideSim, FIX_INFO, FIX_ROLE, costOf, trackOrder, nextUp } from './inside.js';

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
  if (order?.length) {   // the building's own order: it opens with the first two kinds on its list
    const out = [];
    for (const k of order) { const i = fixtures.findIndex(f => f.kind === k); if (i >= 0) out.push(i); if (out.length === 2) break; }
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
  constructor(input, owned, { coins, buy, every = 2.1, seed = 3, maxWidth = 900, price } = {}) {
    this.input = input; this.owned = owned; this.coins = coins; this.buyFn = buy; this.maxWidth = maxWidth;
    this.el = document.createElement('div'); Object.assign(this.el.style, { position: 'relative', maxWidth: '100%' });
    this.floats = []; this.hot = -1;
    this.top = document.createElement('canvas'); Object.assign(this.top.style, { position: 'absolute', left: 0, top: 0, imageRendering: 'pixelated', cursor: coins ? 'pointer' : 'default' });
    this.g = this.top.getContext('2d');
    this.redraw();
    this.sim = new InsideSim(this.view.plan, this.fx, owned, { seed, every, price });
    if (coins) {
      this.top.addEventListener('mousemove', (e) => this.hover(e));
      this.top.addEventListener('mouseleave', () => { tip().style.display = 'none'; this.hot = -1; });
      this.top.addEventListener('click', (e) => this.tryBuy(e));
    }
  }
  redraw() {
    const v = renderView(this.input, 'section', { owned: this.owned });
    this.view = v; this.fx = v.fixtures;
    const W = v.canvas.width, H = v.canvas.height, z = Math.max(1, Math.min(3, Math.floor(this.maxWidth / W)));
    this.zoom = z; this.top.width = W; this.top.height = H;
    for (const c of [v.canvas, this.top]) { c.style.width = W * z + 'px'; c.style.height = H * z + 'px'; c.style.imageRendering = 'pixelated'; c.style.display = 'block'; }
    this.el.replaceChildren(v.canvas, this.top);
    Object.assign(this.el.style, { width: W * z + 'px', height: H * z + 'px' });
    for (const l of v.labels) {
      const e = document.createElement('div'); e.textContent = l.text;
      Object.assign(e.style, { position: 'absolute', left: (l.x * z + 4) + 'px', top: l.y * z + 'px', transform: 'translate(0,-50%)', background: '#2e241a', color: '#fbf6ea', padding: '0 6px', borderRadius: '5px', font: '12px system-ui, "Noto Sans KR", sans-serif', pointerEvents: 'none', whiteSpace: 'nowrap' });
      this.el.append(e);
    }
  }
  ghostAt(e) {
    const r = this.top.getBoundingClientRect(), mx = (e.clientX - r.left) / this.zoom, my = (e.clientY - r.top) / this.zoom;
    let best = -1, bd = 16;
    const can = this.buyable();
    this.fx.forEach((f, i) => { if (!can.has(i)) return; const [x, y] = this.view.project(f.x, f.y + .3, f.z), d = Math.hypot(x - mx, y - my); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  /** Fixtures that can be bought now: the next of each track. */
  buyable() { return new Set(Object.values(nextUp(this.fx, this.owned, undefined, this.input.order))); }
  hover(e) {
    const i = this.ghostAt(e), t = tip(); this.hot = i;
    if (i < 0) { t.style.display = 'none'; return; }
    const f = this.fx[i], [name, what] = FIX_INFO[f.kind] ?? [f.kind, '꾸밈'], c = costOf(f.kind);
    t.textContent = `${name} · ${what} · ${c}동전${this.coins() < c ? ' (모자람)' : ''}`;
    t.style.display = 'block'; t.style.left = e.clientX + 12 + 'px'; t.style.top = e.clientY + 12 + 'px';
  }
  tryBuy(e) {
    const i = this.ghostAt(e); if (i < 0) return;
    const f = this.fx[i], c = costOf(f.kind);
    if (this.coins() < c || !this.buyFn(i, f.kind, c)) { this.floats.push({ text: '동전 모자람', x: f.x, y: f.y + 1, z: f.z, t: 0, bad: true }); return; }
    this.owned.add(i); this.sim.setOwned(this.owned); this.redraw();
    this.floats.push({ text: (FIX_INFO[f.kind]?.[0] ?? f.kind) + '!', x: f.x, y: f.y + 1, z: f.z, t: 0 });
    this.hover(e);
  }
  /** Step the sim and draw. Returns the coin events of this step ({n, tip}). */
  frame(dt) {
    this.sim.step(dt);
    const { g, view, sim } = this, P = view.project, paid = [];
    g.clearRect(0, 0, this.top.width, this.top.height);
    const can = this.coins ? this.buyable() : new Set();
    if (this.coins) this.fx.forEach((f, i) => {
      if (!can.has(i)) return; const [x, y] = P(f.x, f.y + .55, f.z), cx = Math.round(x), cy = Math.round(y), ok = this.coins() >= costOf(f.kind);
      // suggested fixtures blink larger
      const big = this.suggest?.has(f.kind) && Math.sin(performance.now() / 160) > -.3, r = big ? 4 : 2;
      g.fillStyle = i === this.hot ? '#ffffff' : ok ? (big ? '#ffd23a' : '#e3b448') : 'rgba(160,150,130,.7)'; g.fillRect(cx - r, cy - r, r * 2 + 1, r * 2 + 1);
      g.fillStyle = '#2e241a'; g.fillRect(cx, cy - r + 1, 1, r * 2 - 1); g.fillRect(cx - r + 1, cy, r * 2 - 1, 1);
    });
    const list = [];
    for (const s of sim.staff) { const [x, y] = P(s.x, sim.floorY(s.f), s.z); list.push({ x, y, s }); }
    for (const p of sim.people) { p.moving = p.moves.length > 0; const [x, y] = P(p.x, p.y, p.z); list.push({ x, y, p }); }
    list.sort((a, b) => a.y - b.y);
    for (const o of list) o.s ? person(g, o.x, o.y, { t: 0 }, o.s.kind) : person(g, o.x, o.y, o.p);
    for (const e of sim.events.splice(0)) {
      if (e.kind === 'coin') paid.push(e);
      this.floats.push({ text: e.kind === 'coin' ? `+${e.n}` : e.why, x: e.x, y: sim.floorY(e.f) + 1.1, z: e.z, t: 0, bad: e.kind === 'lost', tip: e.tip });
    }
    g.font = 'bold 10px system-ui'; g.textAlign = 'center';
    for (const f of this.floats) {
      f.t += dt; const [x, y] = P(f.x, f.y, f.z);
      g.globalAlpha = Math.max(0, 1 - f.t / 1.4); g.fillStyle = '#2e241a'; g.fillText(f.text, Math.round(x) + 1, Math.round(y - f.t * 14) + 1);
      g.fillStyle = f.bad ? '#e2685a' : f.tip ? '#f08ab0' : '#ffd25a'; g.fillText(f.text, Math.round(x), Math.round(y - f.t * 14));
    }
    g.globalAlpha = 1; this.floats = this.floats.filter(f => f.t < 1.4);
    return paid;
  }
}

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
  if (!staff && p.mood && p.mood !== 'ok') bubble(g, x, by - 14 - bob, p.mood);
}
function bubble(g, x, y, mood) {
  if (mood === 'heart') { g.fillStyle = '#e2557a'; for (const [a, b] of [[-2, 0], [-1, -1], [1, -1], [2, 0], [-2, 1], [-1, 1], [0, 1], [1, 1], [2, 1], [-1, 2], [0, 2], [1, 2], [0, 3], [0, 0], [-1, 0], [1, 0]]) g.fillRect(x + a, y - 4 + b, 1, 1); return; }
  g.fillStyle = '#ffffff'; g.fillRect(x - 4, y - 8, 9, 8); g.fillRect(x - 1, y, 2, 2);
  if (mood === 'wait') { g.fillStyle = '#8b9a9c'; for (const a of [-2, 0, 2]) g.fillRect(x + a, y - 4, 1, 1); }
  else if (mood === 'seat?') { g.fillStyle = '#8a6a4a'; g.fillRect(x - 2, y - 4, 4, 1); g.fillRect(x - 2, y - 7, 1, 6); g.fillRect(x + 1, y - 4, 1, 3); }
  else if (mood === 'angry') { g.fillStyle = '#c2402e'; for (let k = 0; k < 5; k++) { g.fillRect(x - 2 + k, y - 6 + k, 1, 1); g.fillRect(x + 2 - k, y - 6 + k, 1, 1); } }
}
