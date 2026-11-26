// The world map: every board (ten islands of one group of friends) is a spot on a map of the earth.
import { $, el, xbtn } from './ui.js';
import { iconEl } from '../ui/icons.js';
import { voxelEl } from '../ui/voxelui.js';
import { drawLand, countryAt, placeLabel } from '../v2/geo.js';
import { SLOTS, neighbours, bridgeId, PLOT, makeIsles, drawIsles, centerOf } from '../v2/isles.js';
import { moveWithIsland } from './migrate.js';
import { ISLES_SEED } from '../../examples/isles-seed.js';
import { db, me, BOARD, pr } from './state.js';
import { setBuildMode } from './build.js';
import { bad } from './rules.js';


// ---------- the world: every board (ten islands of one group of friends) is a spot on a map ----------
// The map pans and zooms like a map app. Spots close together on screen merge into one bubble with a count;
// tapping a bubble zooms in and lists its boards, so any number of boards stays readable.
const PIX = 3;                     // the land is drawn at 1/3 resolution and scaled up: chunky pixels at every zoom
let wboards = [], placing = null, wv = null, wdrag = null;
function boardShape(entries) {   // owners, joined islands, bridges and plots of one board, from its island docs
  const owners = new Map(); for (const [uid, d] of [...entries].sort((a, b) => (a[1].at ?? 0) - (b[1].at ?? 0))) if (d.slot >= 1 && d.slot <= SLOTS && !owners.has(d.slot)) owners.set(d.slot, uid);
  const docsB = new Map(entries), joined = new Set(owners.keys()), bridges = new Map();
  for (const s of joined) for (const n of neighbours(s)) if (n > s && joined.has(n)) bridges.set(bridgeId(s, n), { a: !!docsB.get(owners.get(s))?.half?.[n], b: !!docsB.get(owners.get(n))?.half?.[s] });
  const taken = new Set(); let buildings = 0;
  for (const uid of owners.values()) for (const p of Object.values(docsB.get(uid)?.plots ?? {})) { buildings++; for (let i = p.x; i < p.x + PLOT[p.size]; i++) for (let k = p.z; k < p.z + PLOT[p.size]; k++) taken.add(i + ',' + k); }
  return { owners, joined, bridges, taken, buildings, mine: [...owners.values()].includes(me) };
}
const colOf = (id) => id === 'main' ? 'i' : 'i-' + id;
async function boardEntries(id) { try { return db ? (await db.collection(colOf(id)).get()).docs.map(d => [d.id, moveWithIsland(d.data())]) : (id === 'main' ? Object.entries(ISLES_SEED) : []); } catch { return []; } }
// every board keeps a small summary (friends, buildings, which users) so the world map never reads every island
async function loadBoards() {
  let meta = [];
  try { meta = db ? (await db.collection('boards').get()).docs.map(d => ({ id: d.id, ...d.data() })) : []; } catch {}
  let main = meta.find(b => b.id === 'main'); if (!main) { main = { id: 'main' }; meta.unshift(main); }
  Object.assign(main, { name: main.name ?? '첫 군도', lat: main.lat ?? 37.5, lng: main.lng ?? 127 });
  for (const b of meta) if (b.n === undefined) { const sh = boardShape(await boardEntries(b.id)); b.n = sh.joined.size; b.bld = sh.buildings; b.users = [...sh.owners.values()]; }
  const demo = +(new URLSearchParams(location.search).get('demo') ?? 0);   // ?demo=N adds N made-up boards (for checks)
  for (let i = 0; i < demo; i++) { const r = (k) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); }, seoul = i % 3 !== 2;
    meta.push({ id: 'demo' + i, name: `예시 군도 ${i + 1}`, lat: seoul ? 35 + r(1) * 3.2 : 20 + r(1) * 40, lng: seoul ? 126.4 + r(2) * 3 : -120 + r(2) * 260, n: Math.floor(r(3) * 11), bld: Math.floor(r(4) * 40), demo: true }); }
  return meta;
}
const mineIn = (b) => (b.users ?? []).includes(me);
function setView(cx, cy, k) {   // view centred on map point (cx, cy) in world units (0..360, 0..180) at k px per unit
  const vw = innerWidth, vh = innerHeight, kMin = Math.max(vw / 360, vh / 140);
  k = Math.max(kMin, Math.min(kMin * 48, k));
  const halfW = vw / 2 / k, halfH = vh / 2 / k; cx = ((cx % 360) + 360) % 360; cy = Math.max(12 + halfH, Math.min(152 - halfH, cy));
  wv = { cx, cy, k, kMin, toPx: (lat, lng) => { let x = (lng + 180) - cx; if (x > 180) x -= 360; if (x < -180) x += 360; return [vw / 2 + x * k, vh / 2 + ((90 - lat) - cy) * k]; },
    toLL: (x, y) => [90 - (cy + (y - vh / 2) / k), ((cx + (x - vw / 2) / k) % 360 + 360) % 360 - 180] };
  drawWorld();
}
function drawWorld() {
  const t0 = performance.now();
  const c = $('wmap'), vw = innerWidth, vh = innerHeight, W = Math.ceil(vw / PIX), H = Math.ceil(vh / PIX);
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  Object.assign(c.style, { left: 0, top: 0, width: W * PIX + 'px', height: H * PIX + 'px' });
  const g = c.getContext('2d'); g.fillStyle = '#3d7fa6'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#4a8db3'; for (let y = 0; y < H; y += 6) for (let x = (y / 6) % 2 ? 3 : 0; x < W; x += 12) g.fillRect(x, y, 2, 1);
  // the world repeats sideways: draw it three times, one world-width apart
  for (const shift of [-360, 0, 360]) drawLand(g, (lng, lat) => [(vw / 2 + ((lng + 180) - wv.cx + shift) * wv.k) / PIX, (vh / 2 + ((90 - lat) - wv.cy) * wv.k) / PIX], W, H);
  window.__drawMs = performance.now() - t0;
  drawSpots();
}
function clusters() {   // merge boards whose spots fall within 64 px of each other on screen
  const R = 64, out = [];
  for (const b of wboards) {
    const [x, y] = wv.toPx(b.lat, b.lng); if (x < -R || y < -R || x > innerWidth + R || y > innerHeight + R) continue;
    const c = out.find(q => Math.hypot(q.x - x, q.y - y) < R);
    if (c) { c.list.push(b); c.x = (c.x * (c.list.length - 1) + x) / c.list.length; c.y = (c.y * (c.list.length - 1) + y) / c.list.length; } else out.push({ x, y, list: [b] });
  }
  return out;
}
function drawSpots() {
  const box = $('spots'), placed = []; box.replaceChildren();
  for (const c of clusters().sort((a, b) => a.x - b.x)) {
    if (c.list.length === 1) {
      const b = c.list[0], btn = el('button', { class: 'spot' + (mineIn(b) ? ' mine' : '') + (b.id === BOARD ? ' here' : ''), on: { click: (e) => { e.stopPropagation(); showBoard(b); } } },
        el('span', { class: 'tag' }, b.name, el('small', {}, `${b.n ?? 0}/10`)), voxelEl(mineIn(b) ? 'isleMine' : 'isle', 3));
      btn.style.left = c.x + 'px'; btn.style.top = c.y + 'px'; box.append(btn);
      // far away, a lone board is a dot (its name shows on hover); close up, or if it is mine or here, it is labelled
      if (wv.k < wv.kMin * 6 && !mineIn(b) && b.id !== BOARD) { btn.classList.add('dot'); continue; }
      const r = { x0: c.x - 60, x1: c.x + 60, y0: c.y - 44, y1: c.y - 18 };
      if (placed.some(q => q.x0 < r.x1 && r.x0 < q.x1 && q.y0 < r.y1 && r.y0 < q.y1)) { btn.style.flexDirection = 'column-reverse'; btn.style.transform = 'translate(-50%, -16px)'; placed.push({ x0: r.x0, x1: r.x1, y0: c.y + 2, y1: c.y + 28 }); } else placed.push(r);
      continue;
    }
    const n = c.list.length, mine = c.list.some(mineIn), here = c.list.some(b => b.id === BOARD), [lat, lng] = wv.toLL(c.x, c.y);
    const where = wv.k < wv.kMin * 4 ? (countryAt(lat, lng)?.ko ?? '바다') : (placeLabel(lat, lng).city?.ko ?? countryAt(lat, lng)?.ko ?? '바다');
    const size = Math.round(34 + Math.min(30, Math.log2(n) * 6));
    const btn = el('button', { class: 'bubble' + (mine ? ' mine' : '') + (here ? ' here' : ''), on: { click: (e) => { e.stopPropagation(); openCluster(c); } } },
      voxelEl('isles', 3), el('b', {}, n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n)), el('span', { class: 'where' }, where));
    Object.assign(btn.style, { left: c.x + 'px', top: c.y + 'px' }); box.append(btn);
  }
  if (placing?.lat !== undefined) { const [x, y] = wv.toPx(placing.lat, placing.lng), s = el('div', { class: 'spot new' }, el('span', { class: 'tag' }, '새 군도'), voxelEl('isleMine', 3)); s.style.left = x + 'px'; s.style.top = y + 'px'; box.append(s); }
  $('wcount').textContent = placing ? '새 군도를 세울 곳을 누르세요' : `군도 ${wboards.length.toLocaleString('ko-KR')}개 · 친구 ${wboards.reduce((t, b) => t + (b.n ?? 0), 0).toLocaleString('ko-KR')}명`;
}
function zoomTo(lat, lng, k, ms = 280) {   // glide the view
  const a = { ...wv }, b = { cx: lng + 180, cy: 90 - lat }; let dx = b.cx - a.cx; if (dx > 180) dx -= 360; if (dx < -180) dx += 360;
  const t0 = performance.now(), step = (t) => { const u = Math.min(1, (t - t0) / ms), e = 1 - (1 - u) ** 3;
    setView(a.cx + dx * e, a.cy + (b.cy - a.cy) * e, a.k * Math.pow(k / a.k, e)); if (u < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function openCluster(c) {
  const [lat, lng] = wv.toLL(c.x, c.y);
  zoomTo(lat, lng, wv.k * 3.2);
  // the list of its boards: free islands first, then the busiest
  const list = [...c.list].sort((a, b) => (mineIn(b) - mineIn(a)) || ((b.n ?? 0) < 10) - ((a.n ?? 0) < 10) || (b.n ?? 0) - (a.n ?? 0) || (b.bld ?? 0) - (a.bld ?? 0));
  const card = $('wcard'); card.hidden = false;
  card.replaceChildren(el('h2', {}, `군도 ${list.length.toLocaleString('ko-KR')}개`), 
    el('div', { class: 'wlist' }, list.slice(0, 60).map(b => el('button', { class: 'wrow' + (mineIn(b) ? ' mine' : ''), on: { click: () => showBoard(b) } }, el('span', {}, b.name), el('small', {}, `${b.n ?? 0}/10 · 건물 ${b.bld ?? 0}`)))),
    list.length > 60 ? el('div', { class: 'note' }, `외 ${list.length - 60}개 — 더 확대해 보세요`) : null,
    el('button', { class: 'ghost', on: { click: () => { card.hidden = true; } } }, '닫기'));
}
async function showBoard(b) {
  const card = $('wcard'); card.hidden = false;
  const go = () => { const q = new URLSearchParams(location.search); if (b.id === 'main') q.delete('board'); else q.set('board', b.id); q.delete('world'); location.search = q.toString(); };
  const sh = b.demo ? { joined: new Set(), bridges: new Map(), taken: new Set(), buildings: 0, owners: new Map(), mine: false } : boardShape(await boardEntries(b.id));
  const mySlotThere = [...(sh.owners ?? [])].find(([, u]) => u === me)?.[0] ?? 0;
  const wd = makeIsles(sh.joined, sh.bridges), g0 = drawIsles(wd, pr, { taken: sh.taken, mine: mySlotThere });
  const th = document.createElement('canvas'); th.width = 560; th.height = Math.round(560 * g0.height / g0.width); const tg = th.getContext('2d'); tg.drawImage(g0, 0, 0, th.width, th.height);
  { const k = th.width / g0.width; tg.textAlign = 'center';   // every island numbered; mine ringed in gold
    for (let sl = 1; sl <= SLOTS; sl++) { const [cx, cz] = centerOf(sl), [px, py] = pr.P(cx, cz), x = px * k, y = py * k, me0 = sl === mySlotThere;
      if (me0) { tg.strokeStyle = '#ffcf3f'; tg.lineWidth = 3; tg.beginPath(); tg.ellipse(x, y, 34, 18, 0, 0, 7); tg.stroke(); }
      tg.font = '400 13px Jua, sans-serif'; tg.lineWidth = 3; tg.strokeStyle = '#2e241a'; const lab = me0 ? '내 섬' : sh.joined.has(sl) ? String(sl) : ''; if (!lab) continue; tg.strokeText(lab, x, y + 5); tg.fillStyle = me0 ? '#ffe08a' : '#fff'; tg.fillText(lab, x, y + 5); } }
  card.replaceChildren(el('div', { class: 'row' }, el('h2', { style: 'flex:1' }, b.name), xbtn(() => { card.hidden = true; })), el('div', { class: 'note' }, placeLabel(b.lat, b.lng).text), el('div', { class: 'nb' }, el('span', {}, `친구 ${sh.joined.size || b.n || 0}/10`), el('span', {}, `건물 ${sh.buildings || b.bld || 0}`), sh.mine ? el('span', { class: 'ok' }, '내 섬') : null), th,
    el('div', { class: 'row' }, b.id === BOARD ? el('button', { on: { click: closeWorld } }, '여기로 돌아가기') : b.demo ? el('span', { class: 'note' }, '예시 군도예요') : el('button', { class: 'gold', on: { click: go } }, sh.mine ? '내 섬으로' : sh.joined.size < 10 ? '섬 고르기' : '구경하기')));
}
export async function openWorld() {
  setBuildMode(false); $('world').hidden = false; $('wcard').hidden = true; placing = null;
  wboards = await loadBoards();
  const here = wboards.find(b => b.id === BOARD) ?? wboards[0];
  setView(here.lng + 180, 90 - here.lat, Math.max(innerWidth / 360, innerHeight / 140) * 1.6);
}
export function initWorld() {
  $('wclose').append(iconEl('close', 22, '')); $('wclose').onclick = closeWorld; $('d-world').onclick = openWorld; $('who').onclick = openWorld;
  addEventListener('resize', () => { if (!$('world').hidden && wv) setView(wv.cx, wv.cy, wv.k); });
  $('wnew').onclick = () => { if (!db || !me) return; placing = {}; $('wcard').hidden = true; drawSpots(); };
  $('wplus').onclick = () => zoomTo(90 - wv.cy, wv.cx - 180, wv.k * 2); $('wminus').onclick = () => zoomTo(90 - wv.cy, wv.cx - 180, wv.k / 2);
  // pan by dragging, zoom with the wheel or two fingers, around the pointer
  { const box = $('world'), ptrs = new Map(); let moved = false, pinch = null;
    box.addEventListener('pointerdown', (e) => { if (e.target.closest('.wcard, .wtop, .wzoom, .spot, .bubble')) return; ptrs.set(e.pointerId, [e.clientX, e.clientY]); moved = false; wdrag = { x: e.clientX, y: e.clientY, cx: wv.cx, cy: wv.cy };
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k: wv.k }; } });
    box.addEventListener('pointermove', (e) => { if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (pinch && ptrs.size === 2) { const [a, b] = [...ptrs.values()]; moved = true; return setView(wv.cx, wv.cy, pinch.k * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d); }
      const dx = e.clientX - wdrag.x, dy = e.clientY - wdrag.y; if (Math.hypot(dx, dy) > 5) moved = true; if (moved) setView(wdrag.cx - dx / wv.k, wdrag.cy - dy / wv.k, wv.k); });
    const up = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; };
    box.addEventListener('pointerup', (e) => { up(e); if (!moved && placing && !e.target.closest('.wcard, .wtop, .wzoom')) placeAt(e.clientX, e.clientY); });
    box.addEventListener('pointercancel', up);
    box.addEventListener('wheel', (e) => { e.preventDefault(); const [lat, lng] = wv.toLL(e.clientX, e.clientY), k = wv.k * Math.exp(-e.deltaY * .0015);
      // keep the point under the pointer still
      setView(lng + 180 - (e.clientX - innerWidth / 2) / Math.max(wv.kMin, Math.min(wv.kMin * 48, k)), 90 - lat - (e.clientY - innerHeight / 2) / Math.max(wv.kMin, Math.min(wv.kMin * 48, k)), k); }, { passive: false }); }
}
function closeWorld() { $('world').hidden = true; placing = null; }
function placeAt(x, y) {
  let [lat, lng] = wv.toLL(x, y);
  // never exactly on top of another board: nudge until there is a little room
  for (let i = 0; i < 20 && wboards.some(b => Math.abs(b.lat - lat) < .02 && Math.abs(b.lng - lng) < .02); i++) { lat += (Math.random() - .5) * .06; lng += (Math.random() - .5) * .06; }
  placing = { lat, lng }; drawSpots();
  const input = el('input', { type: 'text', maxlength: '12', placeholder: '군도 이름 (예: 붕어빵 연합)' }), err = el('div', { class: 'err' });
  const make = async () => {
    const name = input.value.trim(); if (!name) { err.textContent = '이름을 써 주세요'; return; } if (bad(name)) { err.textContent = '그 이름은 쓸 수 없어요'; return; }
    const id = 'b' + Date.now().toString(36); await db.doc('boards/' + id).set({ name, lat, lng, owner: me, at: Date.now(), n: 0, bld: 0, users: [] });
    const q = new URLSearchParams(location.search); q.set('board', id); q.delete('world'); location.search = q.toString();
  };
  $('wcard').hidden = false;
  $('wcard').replaceChildren(el('div', { class: 'row' }, el('h2', { style: 'flex:1' }, '새 군도'), xbtn(() => { placing = null; $('wcard').hidden = true; drawSpots(); })),
    el('div', { class: 'note' }, placeLabel(lat, lng).text), el('div', { class: 'nb' }, el('span', {}, '섬 10개'), el('span', {}, '친구 10명까지')), el('div', { class: 'row' }, input, el('button', { class: 'gold', on: { click: make } }, '세우기')), err);
  input.focus(); input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') make(); });
}
