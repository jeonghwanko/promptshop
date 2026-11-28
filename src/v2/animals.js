// The animals who run the shops. Every player is one of these (their nickname's animal); every building they put up
// is run by it: it stands at the door, works the counters inside, and may stand on the roof as the shop's statue.
// One voxel model per animal, drawn by the same renderer as the buildings (render.js renderVoxels, exterior.js).
// Pure data and geometry: no three.js here.

/**
 * shape keys:
 *   body, belly: colours; face: a patch on the lower front of the head (muzzle area) or null
 *   ears: point | flop | round | long | tiny | none      inner: inside of the ears
 *   snout: none | muzzle | beak | wide (capybara)        nose: colour of the nose tip
 *   tail: none | thin | curl | puff | fluffy | big (squirrel) | cone (dino) | flat
 *   arms: paws | flippers | dark (panda, red panda)
 *   extra: mask (panda) | band (raccoon) | shell | spikes | tentacles | wool | eyestop (frog) | tuft | yuzu | rings (tail rings) ...
 * kit: how the animal's shops tend to look, for the prompt (palette, materials, details the existing parts can show).
 */
export const ANIMALS = {
  cat:       { ko: '고양이', en: 'cat', body: '#f3b36b', belly: '#fff4e2', face: '#fff4e2', ears: 'point', inner: '#f7a8a8', snout: 'none', nose: '#e8798a', tail: 'thin', arms: 'paws', extra: ['stripes'],
    kit: 'cosy and warm: cream and orange tones, round windows or arched windows, cushions and plants, a cat curled at the door (prop "cat")' },
  dog:       { ko: '강아지', en: 'dog', body: '#e2b47c', belly: '#fff6ea', face: '#fff6ea', ears: 'flop', inner: '#a8703e', snout: 'muzzle', nose: '#2a1f18', tail: 'curl', arms: 'paws', extra: [],
    kit: 'cheerful and friendly: warm wood, a porch or a fenced front, a bench, bright red or yellow accent' },
  rabbit:    { ko: '토끼', en: 'rabbit', body: '#f7f3ee', belly: '#ffffff', face: null, ears: 'long', inner: '#f7a8b8', snout: 'none', nose: '#f08aa0', tail: 'puff', arms: 'paws', extra: [],
    kit: 'soft pastel: pink and white, a rounded roof, flower boxes, a vegetable garden look (plants)' },
  bear:      { ko: '곰', en: 'bear', body: '#9a6a44', belly: '#d9b48a', face: '#d9b48a', ears: 'round', inner: '#d9b48a', snout: 'muzzle', nose: '#2a1f18', tail: 'puff', arms: 'paws', extra: [],
    kit: 'a forest cabin: log or wood_boards walls, a steep roof, honey-gold accent, barrels and crates' },
  penguin:   { ko: '펭귄', en: 'penguin', body: '#2b3340', belly: '#ffffff', face: '#ffffff', ears: 'none', inner: null, snout: 'beak', nose: '#ff9a2e', tail: 'none', arms: 'flippers', extra: ['feet'],
    kit: 'icy and cool: white and pale blue walls (plaster or marble), a white dome or rounded roof like an igloo, navy accent, frosty glass' },
  hamster:   { ko: '햄스터', en: 'hamster', body: '#f0b866', belly: '#fff6e6', face: '#fff6e6', ears: 'round', inner: '#f7a8a8', snout: 'none', nose: '#e8798a', tail: 'none', arms: 'paws', extra: ['cheeks'],
    kit: 'small and round: a tiny round building, seeds-and-grain colours (gold, beige), a little wheel-like round window' },
  fox:       { ko: '여우', en: 'fox', body: '#e8763a', belly: '#fff6ea', face: '#fff6ea', ears: 'point', inner: '#2a1f18', snout: 'muzzle', nose: '#2a1f18', tail: 'fluffy', arms: 'dark', extra: [],
    kit: 'clever and autumnal: orange and white, dark wood, lanterns, a slightly sly elegant front' },
  capybara:  { ko: '카피바라', en: 'capybara', body: '#a9774d', belly: '#b98a5e', face: null, ears: 'tiny', inner: '#7a5232', snout: 'wide', nose: '#4a3020', tail: 'none', arms: 'paws', extra: ['yuzu'],
    kit: 'calm hot-spring mood: earthy brown, wood, a pool or bath look, an orange yuzu accent, very relaxed' },
  panda:     { ko: '판다', en: 'panda', body: '#ffffff', belly: '#ffffff', face: null, ears: 'round', inner: '#2a2a30', snout: 'none', nose: '#2a2a30', tail: 'puff', arms: 'dark', extra: ['mask', 'darkears', 'darklegs'],
    kit: 'black and white with bamboo green: an East Asian roof with curled eaves, bamboo plants' },
  squirrel:  { ko: '다람쥐', en: 'squirrel', body: '#c0723e', belly: '#fff0dc', face: '#fff0dc', ears: 'point', inner: '#f2b48a', snout: 'none', nose: '#5a3020', tail: 'big', arms: 'paws', extra: ['stripes'],
    kit: 'a tree house: wood, acorn-brown, a round door, leafy trees (prop "tree")' },
  duck:      { ko: '오리', en: 'duck', body: '#ffd84a', belly: '#fff3a8', face: null, ears: 'none', inner: null, snout: 'beak', nose: '#ff8a2e', tail: 'none', arms: 'flippers', extra: ['feet', 'tuft'],
    kit: 'bright and splashy: sunny yellow, a pond or pool look, white and sky-blue trim' },
  otter:     { ko: '수달', en: 'otter', body: '#8a5a3a', belly: '#e9d2b0', face: '#e9d2b0', ears: 'tiny', inner: '#6a4228', snout: 'muzzle', nose: '#2a1f18', tail: 'flat', arms: 'paws', extra: ['whiskers'],
    kit: 'a riverside hut: wood and stone, a little dock, shells and fish details, teal accent' },
  octopus:   { ko: '문어', en: 'octopus', body: '#f07a7a', belly: '#f7a8a0', face: null, ears: 'none', inner: null, snout: 'none', nose: null, tail: 'none', arms: 'none', extra: ['tentacles'],
    kit: 'an undersea mood: coral red and sea blue, round windows like portholes, curvy shapes' },
  frog:      { ko: '개구리', en: 'frog', body: '#7cc35a', belly: '#e8f2b0', face: null, ears: 'none', inner: null, snout: 'none', nose: null, tail: 'none', arms: 'paws', extra: ['eyestop', 'grin'],
    kit: 'a pond-side shop: leaf green, lily-pad round shapes, a pool or water feature, plants everywhere' },
  red_panda: { ko: '레서판다', en: 'red panda', body: '#c8582a', belly: '#3a2420', face: '#fff4ea', ears: 'point', inner: '#fff4ea', snout: 'none', nose: '#2a1f18', tail: 'fluffy', arms: 'dark', extra: ['rings', 'tearmarks'],
    kit: 'a mountain teahouse: rust red and cream, wood, a curled-eave roof, lanterns' },
  raccoon:   { ko: '너구리', en: 'raccoon', body: '#8f8f96', belly: '#d8d8dc', face: '#e8e8ec', ears: 'round', inner: '#4a4a52', snout: 'muzzle', nose: '#2a1f18', tail: 'fluffy', arms: 'dark', extra: ['band', 'rings'],
    kit: 'a cluttered general store: grey and brown, lots of crates and barrels, a hand-made patched look' },
  dino:      { ko: '공룡', en: 'dinosaur', body: '#6cc07a', belly: '#e9f0b0', face: null, ears: 'none', inner: null, snout: 'none', nose: '#3a7a4a', tail: 'cone', arms: 'paws', extra: ['spikes'],
    kit: 'prehistoric and playful: green and orange, stone walls, big ferns and trees, bone-white trim' },
  seal:      { ko: '물개', en: 'seal', body: '#9fb3c4', belly: '#dfe8ef', face: '#dfe8ef', ears: 'none', inner: null, snout: 'muzzle', nose: '#2a2a30', tail: 'none', arms: 'flippers', extra: ['whiskers'],
    kit: 'a harbour shop: grey-blue and white, a lifebuoy and marine details, a striped awning' },
  turtle:    { ko: '거북이', en: 'turtle', body: '#8cc66b', belly: '#f0e6a8', face: null, ears: 'none', inner: null, snout: 'none', nose: null, tail: 'none', arms: 'paws', extra: ['shell'],
    kit: 'slow and sturdy: green and sand, a dome roof like a shell, stone, very steady and old' },
  sheep:     { ko: '양', en: 'sheep', body: '#fbf7ef', belly: '#fbf7ef', face: '#f1d9c0', ears: 'flop', inner: '#f1d9c0', snout: 'none', nose: '#c08a7a', tail: 'puff', arms: 'paws', extra: ['wool'],
    kit: 'fluffy and soft: white and cream, a rounded roof, knitted-warm colours, a farm look' },
};
export const ANIMAL_IDS = Object.keys(ANIMALS);
export const animalKo = (id) => ANIMALS[id]?.ko ?? '';
/** An animal for an id that has none (a player from before animals, a dev account): the same one every time. */
export function animalFor(seed) {
  let h = 2166136261; for (const ch of String(seed ?? '')) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return ANIMAL_IDS[(h >>> 0) % ANIMAL_IDS.length];
}

function grid() {
  const m = new Map();
  const put = (x, y, z, c) => { if (c) m.set(`${x},${y},${z}`, [x, y, z, c]); else m.delete(`${x},${y},${z}`); };
  const ball = (cx, cy, cz, rx, ry, rz, c) => { for (let x = Math.floor(cx - rx); x <= cx + rx; x++) for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let z = Math.floor(cz - rz); z <= cz + rz; z++)
    if (((x + .5 - cx) / rx) ** 2 + ((y + .5 - cy) / ry) ** 2 + ((z + .5 - cz) / rz) ** 2 <= 1) put(x, y, z, typeof c === 'function' ? c(x, y, z) : c); };
  const box = (x0, y0, z0, x1, y1, z1, c) => { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) put(x, y, z, c); };
  const get = (x, y, z) => m.get(`${x},${y},${z}`)?.[3];
  return { put, ball, box, get, has: (x, y, z) => m.has(`${x},${y},${z}`), list: () => [...m.values()] };
}
const dark = (hex, k) => { const n = parseInt(hex.slice(1), 16), f = (v) => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, '0'); return '#' + f(n >> 16) + f(n >> 8 & 255) + f(n & 255); };
const INK = '#1f1a1c', GLINT = '#ffffff', CHEEK = '#ffa8a0';

/**
 * One animal, standing, facing the viewer (+z): a chibi figure about 20 wide and 28-34 tall in voxels, feet at y = 0.
 * opts.apron: a colour → it wears a shop apron (staff inside); opts.statue: a colour → the whole figure in one stone tone, eyes kept.
 */
export function animalModel(id, { apron = null, statue = null } = {}) {
  const a = ANIMALS[id] ?? ANIMALS.cat, v = grid(), ex = new Set(a.extra);
  const body = a.body, belly = a.belly, limb = ex.has('darklegs') || a.arms === 'dark' ? (id === 'panda' ? '#2a2a30' : dark(body, .45)) : dark(body, .85);
  // ---- feet / legs ----
  if (ex.has('tentacles')) {   // six curling tentacles in a ring
    for (let k = 0; k < 6; k++) { const ang = k / 6 * Math.PI * 2 + .3, cx = 10 + Math.cos(ang) * 4.6, cz = 9 + Math.sin(ang) * 3.6, ox = Math.cos(ang), oz = Math.sin(ang);
      v.ball(cx, 4, cz, 1.8, 3.6, 1.8, body); v.ball(cx + ox * 1.6, 1, cz + oz * 1.6, 1.4, 1.2, 1.4, body); v.put(Math.round(cx + ox * 2.6), 1, Math.round(cz + oz * 2.6), a.belly); }
  } else if (ex.has('feet')) { for (const fx of [6, 12]) v.box(fx, 0, 8, fx + 2, 0, 13, a.nose); }   // webbed feet, beak-coloured
  else for (const fx of [6, 12]) { v.box(fx, 0, 8, fx + 2, 2, 11, limb); v.box(fx, 0, 12, fx + 2, 0, 12, limb); }
  // ---- body ----
  const by = ex.has('tentacles') ? 5 : 8;
  if (ex.has('shell')) {   // the shell over the back, a pale plate in front
    v.ball(10, by, 9, 6, 6.2, 5.6, (x, y, z) => z > 10 ? belly : body);
    v.ball(10, by + 2.5, 6, 8.6, 8.8, 5.8, (x, y, z) => ((x + y + z) % 5 === 0 || (x * 3 + z) % 7 === 0) ? '#a8cf78' : '#5e8a3e');
    v.box(1, by - 3, 2, 19, by - 3, 9, '#4a6e30');   // the rim
  } else if (!ex.has('tentacles')) v.ball(10, by, 9, 6, 6.6, 5.6, (x, y, z) => z > 11 && Math.abs(x + .5 - 10) < 4.2 && y < by + 4 ? belly : body);
  if (ex.has('wool')) for (const [cx, cy, cz] of [[5, 9, 8], [15, 9, 8], [10, 12, 6], [7, 4, 10], [13, 4, 10], [10, 6, 13], [6, 12, 11], [14, 12, 11], [10, 3, 6]]) v.ball(cx, cy, cz, 2.6, 2.6, 2.6, (x, y) => (x + y) % 3 ? body : '#ece4d4');
  // apron: a coloured bib and skirt on the front, with ties
  if (apron) { for (let x = 6; x <= 14; x++) for (let y = by - 4; y <= by + 4; y++) { let z = 16; while (z > 9 && !v.has(x, y, z)) z--; if (v.has(x, y, z)) v.put(x, y, z + 1, y === by + 4 || x === 6 || x === 14 ? dark(apron, .8) : apron); }
    v.put(10, by + 1, 16, '#fff3c4'); }   // a little pocket
  // ---- arms ----
  if (a.arms === 'flippers') for (const s of [-1, 1]) { const x = s < 0 ? 3 : 16; v.box(x, by - 4, 8, x + 1, by + 3, 11, dark(body, .9)); v.box(s < 0 ? 2 : 18, by - 4, 9, s < 0 ? 2 : 18, by - 1, 10, dark(body, .9)); }
  else if (a.arms !== 'none') for (const s of [-1, 1]) v.ball(s < 0 ? 3.6 : 16.4, by + .5, 11, 1.8, 2.6, 1.8, limb);
  // ---- tail (behind) ----
  const t = a.tail, tc = ex.has('rings') ? (x, y) => ((y + 40) % 4 < 2 ? body : dark(body, .5)) : () => body;
  if (t === 'thin') { v.box(10, by - 2, 2, 10, by - 2, 4, body); v.box(10, by - 1, 1, 10, by + 6, 1, (x, y) => (y % 3 ? body : dark(body, .78))); v.box(11, by + 6, 1, 12, by + 6, 1, body); }
  if (t === 'curl') { v.ball(10, by + 3, 2, 1.6, 2.4, 1.6, body); v.ball(11, by + 5.5, 2.5, 1.5, 1.4, 1.5, belly); }
  if (t === 'puff') v.ball(10, by - 2, 2.5, 2.2, 2.2, 2, belly === body ? dark(body, .95) : (id === 'panda' ? '#ffffff' : belly));
  if (t === 'fluffy') { v.ball(13, by - 1, 2.5, 2.6, 3, 2.6, tc); v.ball(15, by + 2, 1.8, 2.2, 2.6, 2.2, (x, y) => (id === 'fox' && y > by + 3 ? '#ffffff' : tc(x, y))); }
  if (t === 'big') { v.ball(10, by + 2, 1.5, 3.2, 6, 2.6, body); v.ball(10, by + 9, 2.5, 3.6, 3.2, 3, (x, y) => (y > by + 10 ? belly : body)); }
  if (t === 'cone') for (let k = 0; k < 6; k++) v.ball(10 + k * .9, by - 3 + k * .2, 3 - k * 1.1, 2.6 - k * .38, 2.4 - k * .35, 2.4 - k * .35, body);
  if (t === 'flat') v.box(8, 1, 0, 12, 2, 4, dark(body, .8));
  // ---- head ----
  const hy = (ex.has('tentacles') ? 13 : 19), hz = 10, hr = ex.has('tentacles') ? [7.2, 7.6, 6.8] : [7, 6.2, 6.2];
  v.ball(10, hy, hz, ...hr, (x, y, z) => {
    if (ex.has('tentacles')) return (x * 7 + y * 3 + z * 5) % 11 === 0 ? a.belly : body;
    if (a.face && z > hz + 2 && y < hy - 1 && Math.abs(x + .5 - 10) < 4.6) return a.face;
    if (id === 'penguin' && z > hz + 1 && y < hy + 3 && Math.abs(x + .5 - 10) < 5) return '#ffffff';
    if (ex.has('stripes') && z < hz + 3 && y > hy + 3 && (x === 8 || x === 10 || x === 12)) return dark(body, .78);
    return body;
  });
  if (ex.has('wool')) for (const [cx, cz] of [[6, 9], [10, 7], [14, 9], [8, 12], [12, 12]]) v.ball(cx, hy + 5, cz, 2.4, 2, 2.4, (x, y) => (x + y) % 3 ? '#fbf7ef' : '#ece4d4');
  if (ex.has('yuzu')) { v.ball(10, hy + 7.5, hz - 1, 2.2, 1.9, 2.2, '#ffb52e'); v.put(10, hy + 9, hz - 1, '#4f8f46'); v.put(11, hy + 9, hz - 1, '#4f8f46'); }
  if (ex.has('tuft')) { v.box(10, hy + 6, hz, 10, hy + 8, hz, body); v.put(11, hy + 8, hz, body); v.put(9, hy + 7, hz, body); }
  if (ex.has('spikes')) for (let k = 0; k < 6; k++) { const z = Math.round(hz + 1 - k * 2.2), y = Math.round(hy + 5.6 - k * k * .55); v.box(9, y, z, 11, y + 1, z, '#ff9a3e'); v.box(10, y + 2, z, 10, y + 3, z, '#ffb86a'); }
  const front = (x, y) => { for (let z = hz + 9; z > hz - 9; z--) if (v.has(x, y, z)) return z; return null; };
  const onFace = (x, y, c, out = 0) => { const z = front(x, y); if (z !== null) v.put(x, y, z + out, c); };
  // ---- ears ----
  const ec = ex.has('darkears') ? '#2a2a30' : body;
  for (const s of [-1, 1]) {
    const ox = s < 0 ? 0 : 1, at = (x) => (s < 0 ? x : 20 - x);   // mirror around the head's middle
    if (a.ears === 'point') for (let k = 0; k < 5; k++) { const w = 3 - Math.floor(k * .7); for (let i = 0; i < w; i++) { const x = at(5 + i + Math.floor(k * .4)) - ox; v.put(x, hy + 5 + k, hz, k === 4 && id === 'fox' ? INK : ec); if (k < 3 && i > 0 && i < w) v.put(x, hy + 5 + k, hz + 1, a.inner); } }
    if (a.ears === 'round') { v.ball(at(4.5) - ox * 0 + (s < 0 ? 0 : 0), hy + 5, hz, 2.2, 2.2, 1.4, ec); onFace(at(5) - ox, hy + 5, a.inner); }
    if (a.ears === 'tiny') v.ball(s < 0 ? 5 : 15, hy + 5, hz - 1, 1.3, 1.3, 1.2, ec);
    if (a.ears === 'long') { const x0 = s < 0 ? 6 : 12; v.box(x0, hy + 5, hz - 1, x0 + 2, hy + 14, hz + 1, ec); v.box(x0 + 1, hy + 6, hz + 2, x0 + 1, hy + 13, hz + 2, a.inner); }
    if (a.ears === 'flop') { const x0 = s < 0 ? 2 : 17; v.box(x0, hy - 3, hz - 1, x0 + 1, hy + 4, hz + 3, a.inner); v.box(s < 0 ? 3 : 16, hy + 4, hz - 1, s < 0 ? 4 : 17, hy + 5, hz + 2, a.inner); }
  }
  // ---- face ----
  const ey = hy + (ex.has('tentacles') ? 0 : 1);
  if (ex.has('mask')) for (const e of [7, 13]) for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [-1, 2], [0, 2], [1, 1]]) onFace(e + dx, ey + dy, '#2a2a30');
  if (ex.has('band')) for (let x = 4; x <= 16; x++) for (const dy of [0, 1]) onFace(x, ey + dy, '#3a3a42');
  if (ex.has('tearmarks')) for (const e of [7, 13]) for (const dy of [-1, -2, -3]) onFace(e, ey + dy, '#a8401c');
  if (ex.has('eyestop')) for (const e of [6, 14]) { v.ball(e, hy + 5.5, hz + 2, 2.2, 2.2, 2.2, body); v.box(e - 1, hy + 5, hz + 4, e, hy + 6, hz + 4, INK); v.put(e - 1, hy + 6, hz + 4, GLINT); }
  else for (const e of [7, 13]) { for (const [dx, dy] of [[-1, 0], [0, 0], [-1, 1], [0, 1]]) onFace(e + dx, ey + dy, INK, ex.has('mask') ? 1 : 0); onFace(e - 1, ey + 1, GLINT, ex.has('mask') ? 1 : 0); }
  if (!ex.has('mask') && !ex.has('tentacles')) for (const cx of [4, 16]) onFace(cx, hy - 2, ex.has('cheeks') ? CHEEK : CHEEK);
  if (ex.has('cheeks')) for (const s of [-1, 1]) v.ball(s < 0 ? 4.5 : 15.5, hy - 2, hz + 3, 2.2, 1.8, 1.8, a.face);
  if (ex.has('tentacles')) for (const cx of [5, 15]) onFace(cx, hy - 2, '#ff9aa8');
  const sz = front(10, hy - 2) ?? hz + 6;
  if (a.snout === 'muzzle') { v.box(8, hy - 4, sz, 12, hy - 1, sz + 1, a.face ?? dark(body, 1.15)); v.box(9, hy - 1, sz + 2, 11, hy - 1, sz + 2, a.nose); v.put(10, hy - 2, sz + 2, a.nose); v.box(9, hy - 4, sz + 2, 11, hy - 4, sz + 2, dark(a.face ?? body, .7)); }
  if (a.snout === 'wide') { v.box(7, hy - 5, sz - 1, 13, hy - 1, sz + 2, dark(body, .9)); v.put(8, hy - 2, sz + 3, a.nose); v.put(12, hy - 2, sz + 3, a.nose); v.box(9, hy - 4, sz + 3, 11, hy - 4, sz + 3, dark(body, .6)); }
  if (a.snout === 'beak') { v.box(8, hy - 3, sz, 12, hy - 2, sz + 2, a.nose); v.box(9, hy - 3, sz + 3, 11, hy - 2, sz + 3, a.nose); v.box(9, hy - 3, sz + 1, 11, hy - 3, sz + 3, dark(a.nose, .8)); }
  if (a.snout === 'none' && a.nose && !ex.has('grin')) { onFace(10, hy - 1, a.nose); onFace(9, hy - 3, INK); onFace(11, hy - 3, INK); onFace(10, hy - 2, dark(a.face ?? body, .7)); }
  if (ex.has('grin')) for (let x = 6; x <= 14; x++) onFace(x, x === 6 || x === 14 ? hy - 1 : hy - 2, INK);
  if (ex.has('tentacles')) { for (let x = 9; x <= 11; x++) onFace(x, hy - 3, '#b84a50'); onFace(10, hy - 4, '#b84a50'); }
  if (ex.has('whiskers')) for (const s of [-1, 1]) for (const dy of [0, -2]) v.put(s < 0 ? 6 : 14, hy - 2 + dy, sz + 1, INK);
  let out = v.list();
  if (statue) out = out.map(([x, y, z, c]) => [x, y, z, c === INK || c === GLINT ? c : tone(statue, c)]);
  return out;
}
/** A stone or bronze statue keeps the figure's light and dark, in one hue. */
function tone(base, c) {
  const n = parseInt(c.slice(1), 16), l = ((n >> 16) * .3 + (n >> 8 & 255) * .55 + (n & 255) * .15) / 255;
  return dark(base, .62 + l * .55);
}
