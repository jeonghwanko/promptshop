// The live cross-section of one building: the section render, an overlay canvas with the people of an InsideSim,
// see-through fixtures that can be tapped to buy, and coins and losses that rise over the spot where they happen.
import { renderView } from './render.js';
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
  constructor(input, owned, { coins, buy, upgrade, levels = {}, every = 2.1, seed = 3, maxWidth = 900, price, onHover, tags = false, onThud, maxHeight = Infinity, maxZoom = 3 } = {}) {
    this.maxHeight = maxHeight; this.maxZoom = maxZoom; this.floor = 0;
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
    const v = renderView(this.input, 'section', { owned: this.owned, floor: this.floor });
    this.view = v; this.fx = v.fixtures;
    const W = v.canvas.width, H = v.canvas.height, fit = Math.min(this.maxZoom ?? 3, this.maxWidth / W, this.maxHeight / H), z = Math.max(1, fit >= 2 ? Math.floor(fit) : Math.floor(fit * 4) / 4);   // whole steps when there is room, quarter steps for tall buildings
    this.zoom = z; this.top.width = W; this.top.height = H;
    for (const c of [v.canvas, this.top]) { c.style.width = W * z + 'px'; c.style.height = H * z + 'px'; c.style.imageRendering = 'pixelated'; c.style.display = 'block'; }
    { const d = Math.min(3, devicePixelRatio || 1); this.ts = z * d; this.txt.width = Math.round(W * this.ts); this.txt.height = Math.round(H * this.ts); this.txt.style.width = W * z + 'px'; this.txt.style.height = H * z + 'px'; }
    this.el.replaceChildren(v.canvas, this.top, this.txt);
    Object.assign(this.el.style, { width: W * z + 'px', height: H * z + 'px' });
    for (const l of v.labels) {
      const e = document.createElement('div'); e.textContent = l.text;
      Object.assign(e.style, { position: 'absolute', left: (l.x * z + 4) + 'px', top: l.y * z + 'px', transform: 'translate(0,-50%)', background: '#2e241a', color: '#fbf6ea', padding: '0 6px', borderRadius: '5px', font: '12px system-ui, "Noto Sans KR", sans-serif', pointerEvents: 'none', whiteSpace: 'nowrap' });
      this.el.append(e);
    }
    this.floorTabs();
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
    this.sim.step(dt);
    const { g, view, sim } = this, P = view.project, paid = [];
    g.clearRect(0, 0, this.top.width, this.top.height);
    const tg = this.tg; tg.setTransform(1, 0, 0, 1, 0, 0); tg.clearRect(0, 0, this.txt.width, this.txt.height); tg.setTransform(this.ts, 0, 0, this.ts, 0, 0);
    const can = this.coins ? this.buyable() : new Set();
    if (this.coins && this.tags) {
      const tag = (x, y, text, ok, big) => { g.font = 'bold 7px system-ui'; const w = Math.ceil(g.measureText(text).width) + 9, bx = Math.round(x - w / 2), by = Math.round(y - 10 - (big ? Math.abs(Math.sin(performance.now() / 200)) * 2 : 0));
        g.fillStyle = '#2b1e15'; g.fillRect(bx - 1, by - 1, w + 2, 10); g.fillStyle = ok ? '#f2c12e' : '#b8ad98'; g.fillRect(bx, by, w, 8);
        g.fillStyle = ok ? '#c48a1a' : '#8f8573'; g.fillRect(bx, by + 7, w, 1); g.fillStyle = '#2b1e15'; g.fillRect(Math.round(x), by + 8, 1, 2);
        g.fillStyle = '#c48a1a'; g.fillRect(bx + 2, by + 2, 3, 4); tg.font = 'bold 7px system-ui, "Noto Sans KR", sans-serif'; tg.fillStyle = '#2b1e15'; tg.textAlign = 'left'; tg.fillText(text, bx + 7, by + 6.6); };
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
    for (const s of sim.staff) { if (!this.onFloor(sim.floorY(s.f))) continue; const [x, y] = P(s.x, sim.floorY(s.f), s.z); list.push({ x, y, s }); }
    for (const p of sim.people) { p.moving = p.moves.length > 0; if (!this.onFloor(p.y)) continue; const [x, y] = P(p.x, p.y, p.z); list.push({ x, y, p }); }
    if (this.tabs) { const cnt = this.tabs.map(() => 0), g0 = this.view.plan.gap; for (const p of sim.people) { const k = Math.max(0, Math.min(cnt.length - 1, Math.floor((p.y + .01) / g0))); cnt[k]++; }
      this.tabs.forEach((b, k) => { const t = cnt[k] ? String(cnt[k]) : ''; const sm = b.lastChild; if (sm.textContent !== t) sm.textContent = t; }); }
    list.sort((a, b) => a.y - b.y);
    for (const o of list) o.s ? person(g, o.x, o.y, { t: 0 }, o.s.kind) : person(g, o.x, o.y, o.p);
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
function bubble(g, x, y, mood) {
  if (mood === 'heart') { g.fillStyle = '#e2557a'; for (const [a, b] of [[-2, 0], [-1, -1], [1, -1], [2, 0], [-2, 1], [-1, 1], [0, 1], [1, 1], [2, 1], [-1, 2], [0, 2], [1, 2], [0, 3], [0, 0], [-1, 0], [1, 0]]) g.fillRect(x + a, y - 4 + b, 1, 1); return; }
  g.fillStyle = '#ffffff'; g.fillRect(x - 4, y - 8, 9, 8); g.fillRect(x - 1, y, 2, 2);
  if (mood === 'wait') { g.fillStyle = '#8b9a9c'; for (const a of [-2, 0, 2]) g.fillRect(x + a, y - 4, 1, 1); }
  else if (mood === 'seat?') { g.fillStyle = '#8a6a4a'; g.fillRect(x - 2, y - 4, 4, 1); g.fillRect(x - 2, y - 7, 1, 6); g.fillRect(x + 1, y - 4, 1, 3); }
  else if (mood === 'angry') { g.fillStyle = '#c2402e'; for (let k = 0; k < 5; k++) { g.fillRect(x - 2 + k, y - 6 + k, 1, 1); g.fillRect(x + 2 - k, y - 6 + k, 1, 1); } }
}
