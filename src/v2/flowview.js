import { iconCanvas, EMOJI } from '../ui/icons.js';
// The flow of one shop as a diagram: guests come in, order (counter and kitchen), sit, pay, leave.
// Each step shows how many it can take per minute; the step that takes the fewest is the bottleneck (red),
// and guests who cannot get through drop away in red. Dots move at the speed guests actually move.
// A preview line says what one more fixture would change, before it is bought.

const W = 920, H = 150;
export class FlowView {
  constructor() {
    this.el = document.createElement('div');
    this.c = document.createElement('canvas'); this.c.style.width = '100%'; this.c.style.display = 'block'; this.c.style.maxWidth = W + 'px';
    this.line = document.createElement('div'); Object.assign(this.line.style, { font: '13px system-ui, "Noto Sans KR", sans-serif', minHeight: '20px', marginTop: '4px' });
    this.bar = document.createElement('div'); Object.assign(this.bar.style, { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: '6px', minHeight: '38px' });
    this.el.append(this.c, this.line, this.bar); this.barKey = '';
    const dpr = Math.min(2, devicePixelRatio || 1); this.c.width = W * dpr; this.c.height = H * dpr; this.g = this.c.getContext('2d'); this.g.scale(dpr, dpr);
    this.dots = []; this.acc = 0; this.flash = []; this.data = null; this.previewText = '';
  }
  /** data: { nodes: [{ icon, label, sub, cap, state }], slow: index of the bottleneck node, inRate, outRate, lostRate, coinRate } */
  set(data) { this.data = data; }
  preview(text) { this.previewText = text; }
  /** What fixes the bottleneck: { title, button, onClick, disabled, note } — redrawn only when it changes */
  action(a) {
    const k = JSON.stringify([a?.title, a?.button, a?.disabled, a?.note, a?.button2, a?.disabled2]); if (k === this.barKey) return; this.barKey = k; this.bar.replaceChildren();
    if (!a) return;
    const t = document.createElement('b'); t.textContent = a.title; t.style.color = '#c0392b'; this.bar.append(t);
    if (a.button) { const b = document.createElement('button'); b.textContent = a.button; b.className = 'gold fixbtn'; b.disabled = !!a.disabled; b.onclick = a.onClick; this.bar.append(b); }
    if (a.button2) { const b = document.createElement('button'); b.textContent = a.button2; b.className = 'fixbtn'; b.disabled = !!a.disabled2; b.onclick = a.onClick2; this.bar.append(b); }
    if (a.note) { const n = document.createElement('span'); n.textContent = a.note; n.style.color = '#7a6a55'; n.style.fontSize = '13px'; this.bar.append(n); }
  }
  pop(nodeIndex, text) { this.flash.push({ i: nodeIndex, text, t: 0 }); }
  frame(dt) {
    const d = this.data, g = this.g; if (!d) return;
    const n = d.nodes.length, xs = d.nodes.map((_, i) => 60 + i * (W - 120) / (n - 1)), y = 58;
    g.clearRect(0, 0, W, H);
    // pipes
    g.lineCap = 'round';
    for (let i = 0; i < n - 1; i++) { g.strokeStyle = '#e2d6bd'; g.lineWidth = 10; g.beginPath(); g.moveTo(xs[i] + 40, y); g.lineTo(xs[i + 1] - 40, y); g.stroke(); }
    // dots: born at the guests' arrival rate, slowed to the flow that gets through, lost ones fall at the bottleneck
    this.acc += dt * Math.max(.3, d.inRate) / 60 * 6;
    while (this.acc > 1) { this.acc -= 1; const lost = d.inRate > 0 && Math.random() < d.lostRate / Math.max(d.inRate, .01); this.dots.push({ p: 0, lost, fall: 0 }); }
    const sp = .35;   // pipe lengths per second
    for (const o of this.dots) {
      if (o.lost && o.p >= d.slow - .45 && o.p < d.slow) { o.fall += dt; o.p = d.slow - .45; } else o.p += sp * dt;
    }
    this.dots = this.dots.filter(o => o.p < n - 1 && o.fall < 1.2);
    for (const o of this.dots) {
      const i = Math.floor(o.p), f = o.p - i, x = xs[i] + 40 + f * (xs[i + 1] - xs[i] - 80);
      g.fillStyle = o.fall ? `rgba(226,67,47,${1 - o.fall / 1.2})` : '#3f7a74';
      g.beginPath(); g.arc(x, y + o.fall * 40, 4, 0, 7); g.fill();
    }
    // nodes
    d.nodes.forEach((nd, i) => {
      const x = xs[i], slow = i === d.slow;
      g.fillStyle = slow ? '#fde3dc' : '#fbf6ec'; g.strokeStyle = slow ? '#e2432f' : '#d4c4a6'; g.lineWidth = slow ? 3 : 1.5;
      round(g, x - 44, y - 34, 88, 68, 12); g.fill(); g.stroke();
      g.textAlign = 'center'; g.fillStyle = '#2e241a';
      { const ic = iconCanvas(EMOJI[nd.icon]); if (ic) { g.imageSmoothingEnabled = false; g.drawImage(ic, x - 12, y - 32, 24, 24); } else { g.font = '20px system-ui'; g.fillText(nd.icon, x, y - 10); } }
      g.font = 'bold 13px system-ui, "Noto Sans KR", sans-serif'; g.fillText(nd.label, x, y + 10);
      g.font = '11px system-ui, "Noto Sans KR", sans-serif'; g.fillStyle = '#7a6a55'; g.fillText(nd.sub ?? '', x, y + 25);
      if (nd.cap !== undefined) { g.font = 'bold 12px system-ui, "Noto Sans KR", sans-serif'; g.fillStyle = slow ? '#c0392b' : '#3f7a74'; g.fillText(nd.cap === Infinity ? '제한 없음' : `최대 ${nd.cap.toFixed(1)}명/분`, x, y + 50); }
      if (nd.state) { g.font = '11px system-ui, "Noto Sans KR", sans-serif'; g.fillStyle = '#7a6a55'; g.fillText(nd.state, x, y + 64); }
      if (slow) { g.font = 'bold 11px system-ui, "Noto Sans KR", sans-serif'; g.fillStyle = '#fff'; round(g, x - 26, y - 50, 52, 16, 8); g.fillStyle = '#e2432f'; g.fill(); g.fillStyle = '#fff'; g.fillText('막힘', x, y - 38); }
    });
    // numbers that jump up when a fixture is bought
    for (const f of this.flash) { f.t += dt; const x = xs[f.i]; g.globalAlpha = Math.max(0, 1 - f.t / 1.6); g.font = 'bold 18px system-ui, "Noto Sans KR", sans-serif'; g.fillStyle = '#2fbf71'; g.fillText(f.text, x, y - 44 - f.t * 24); g.globalAlpha = 1; }
    this.flash = this.flash.filter(f => f.t < 1.6);
    // the summary under the diagram
    const s = `들어옴 ${d.inRate.toFixed(1)}명/분 · 받음 ${d.outRate.toFixed(1)}명/분` + (d.lostRate > .05 ? ` · 돌아감 ${d.lostRate.toFixed(1)}명/분` : '') + ` · 수입 ${Math.round(d.coinRate)}동전/분`;
    this.line.textContent = this.previewText ? this.previewText : s;
    this.line.style.color = this.previewText ? '#2f8f5b' : '#2e241a'; this.line.style.fontWeight = this.previewText ? '700' : '400';
  }
}
function round(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
