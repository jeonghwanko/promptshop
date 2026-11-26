// Build steps: the model streams one JSON object per line, one part per line.
// Each finished line is applied at once, so the shop assembles while the model is still writing.

const HEX = /^#[0-9a-fA-F]{6}$/;
const color = (v, d) => (typeof v === 'string' && HEX.test(v) ? v : d);
const oneOf = (v, list, d = list[0]) => (list.includes(v) ? v : d);
const num = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const str = (v, n, d = '') => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : d);

export const PROP_TYPES = ['lantern', 'stool', 'plant', 'bench', 'crate', 'bookstand', 'standee', 'menuboard', 'flag', 'barrel', 'cat', 'glove'];
export const ITEM_TYPES = ['pedestal', 'partition', 'frame', 'counter', 'stove', 'stool', 'plant', 'bag', 'case', 'catbed', 'cat', 'chair', 'table', 'sofa', 'rug', 'pendant', 'shelf', 'bookshelf', 'window', 'poster', 'lantern', 'neon'];

export function emptyShop() { return { name: '', ext: { props: [] }, int: { items: [] } }; }

/** Apply one step to the shop in place. Returns { view, key } of the part that changed, or null. */
export function applyStep(shop, step) {
  if (!step || typeof step !== 'object') return null;
  const e = shop.ext, n = shop.int;
  switch (step.step) {
    case 'name': shop.name = str(step.name, 16); return { view: 'ext', key: null };
    case 'base':
      e.size = [num(step.size?.[0], 1, 5, 2.4), num(step.size?.[1], 1, 4, 1.8)];
      e.floors = Math.round(num(step.floors, 1, 4, 1));
      e.wall = { mat: oneOf(step.wall?.mat, ['plank', 'plaster', 'brick']), color: color(step.wall?.color, '#c98a4b') };
      e.trim = color(step.trim, '#3a2a1e'); e.night = !!step.night;
      return { view: 'ext', key: 'base' };
    case 'front':
      e.front = { type: oneOf(step.type, ['counter', 'glass', 'door', 'curtain', 'portico']), door: color(step.door, '#6b4a2a') };
      if (step.noren) e.noren = { color: color(step.noren.color, '#1f3a5a'), text: str(step.noren.text, 3, '') };
      return { view: 'ext', key: 'front' };
    case 'roof':
      e.roof = { type: oneOf(step.type, ['gable', 'hip', 'flat', 'shed', 'barrel', 'sawtooth', 'dome']), color: color(step.color, '#46706c'), curl: !!step.curl };
      return { view: 'ext', key: 'roof' };
    case 'wing': {
      e.wings = e.wings ?? [];
      if (e.wings.length >= 3) return null;
      e.wings.push({ side: oneOf(step.side, ['left', 'right', 'back']), w: num(step.w, .8, 3, 1.4), d: num(step.d, .8, 3, 1.4), floors: Math.round(num(step.floors, 1, 4, 1)),
        roof: oneOf(step.roof, ['flat', 'gable', 'hip']), roofColor: color(step.roofColor, undefined), wall: step.wall ? { mat: oneOf(step.wall.mat, ['plank', 'plaster', 'brick']), color: color(step.wall.color, '#c98a4b') } : undefined });
      return { view: 'ext', key: 'wing:' + (e.wings.length - 1) };
    }
    case 'decor':
      if (step.awning) e.awning = { a: color(step.awning.a, '#4f86c6'), b: color(step.awning.b, '#f2e8d6') };
      if (step.sign) e.sign = { text: str(step.sign.text, 6, '가게'), place: oneOf(step.sign.place, ['front', 'roof', 'blade']), bg: color(step.sign.bg, '#2b2118'), fg: color(step.sign.fg, '#ffe9a8'), glow: !!step.sign.glow };
      if (step.neon) e.neon = color(step.neon, '#4fe3ff');
      e.chimney = !!step.chimney;
      if (Array.isArray(step.banners)) e.banners = step.banners.slice(0, 5).map(c => color(c, '#c0504d'));
      return { view: 'ext', key: 'decor' };
    case 'prop': {
      if (!PROP_TYPES.includes(step.type) || e.props.length >= 10) return null;
      const w = (e.size?.[0] ?? 2.4) / 2 + .7;
      e.props.push({ type: step.type, x: num(step.x, -w, w, 0), z: num(step.z, -1.5, 1.5, 0), color: color(step.color, '#e2432f'), on: oneOf(step.on, ['roof', 'sill']), text: str(step.text, 4, '') });
      return { view: 'ext', key: 'prop:' + (e.props.length - 1) };
    }
    case 'room':
      n.size = [num(step.size?.[0], 2, 7, 4), num(step.size?.[1], 2, 5, 3)];
      n.floor = { type: oneOf(step.floor?.type, ['wood', 'checker']), a: color(step.floor?.a, '#b48a5a'), b: color(step.floor?.b, '#9a744a') };
      n.wall = { mat: oneOf(step.wall?.mat, ['plank', 'plaster', 'brick']), color: color(step.wall?.color, '#efe3cf') };
      return { view: 'int', key: 'room' };
    case 'item': {
      if (!ITEM_TYPES.includes(step.type) || n.items.length >= 16 || !n.size) return null;
      const [W, D] = n.size;
      const it = { type: step.type, color: color(step.color, '#8a6a4a') };
      if (Array.isArray(step.at)) it.at = [num(step.at[0], .2, W - .2, W / 2), num(step.at[1], .2, D - .2, D / 2)];
      else it.at = num(step.at, .2, Math.max(W, D) - .2, 1);
      if (step.wall) it.wall = oneOf(step.wall, ['x', 'z']);
      if (step.len) it.len = num(step.len, .6, 3.6, 1.4);
      if (it.type === 'partition' && !Array.isArray(it.at)) it.at = [W / 2, D / 2];
      if (step.on) it.on = oneOf(step.on, ['bowls', 'coffee', 'register']);
      if (step.goods) it.goods = oneOf(step.goods, ['bowls', 'figures', 'gloves']);
      if (step.size) it.size = [num(step.size[0], .6, 3, 1.6), num(step.size[1], .6, 3, 1.2)];
      if (step.text) it.text = str(step.text, 4);
      if (step.rot === 90) it.rot = 90;
      // wall-only items need a wall; floor items need a point
      if (['bookshelf', 'window', 'poster', 'lantern', 'neon', 'frame'].includes(it.type)) { it.wall = it.wall ?? 'z'; if (Array.isArray(it.at)) it.at = it.at[0]; }
      else if (it.type === 'shelf' && it.wall === 'x') { if (Array.isArray(it.at)) it.at = it.at[1]; }
      else if (!Array.isArray(it.at)) it.at = [W / 2, D / 2];
      if (['shelf', 'counter', 'bookshelf', 'partition'].includes(it.type)) it.len = it.len ?? 1.4;
      n.items.push(it);
      return { view: 'int', key: 'item:' + (n.items.length - 1) };
    }
  }
  return null;
}

/** Feed streamed text; calls onStep(step) for every complete line that parses. */
export function lineReader(onStep) {
  let buf = '';
  const flush = (line) => { line = line.trim().replace(/^```\w*$/, ''); if (!line.startsWith('{')) return; try { onStep(JSON.parse(line)); } catch { /* skip a broken line */ } };
  return {
    push(delta) { buf += delta; let i; while ((i = buf.indexOf('\n')) >= 0) { flush(buf.slice(0, i)); buf = buf.slice(i + 1); } },
    end() { flush(buf); buf = ''; },
  };
}

/** Turn a finished shop spec back into steps (to replay an example without a model). */
export function specToSteps(shop) {
  const e = shop.ext, n = shop.int, out = [];
  out.push({ step: 'name', name: shop.name || shop.line || '' });
  out.push({ step: 'base', size: e.size, floors: e.floors, wall: e.wall, trim: e.trim, night: e.night, note: `${e.wall.mat} 벽 ${e.size[0]}×${e.size[1]}칸` });
  if (e.front) out.push({ step: 'front', ...e.front, noren: e.noren, note: `정면: ${e.front.type}` });
  if (e.roof) out.push({ step: 'roof', ...e.roof, note: `지붕: ${e.roof.type}` });
  for (const w of e.wings ?? []) out.push({ step: 'wing', ...w, note: `날개동: ${w.side}` });
  out.push({ step: 'decor', awning: e.awning, sign: e.sign, neon: e.neon, chimney: e.chimney, banners: e.banners, note: e.sign ? `간판: ${e.sign.text}` : '장식' });
  for (const p of e.props ?? []) out.push({ step: 'prop', ...p, note: `소품: ${p.type}` });
  out.push({ step: 'room', size: n.size, floor: n.floor, wall: n.wall, note: `안: ${n.size[0]}×${n.size[1]}칸` });
  for (const it of n.items ?? []) out.push({ step: 'item', ...it, note: `가구: ${it.type}` });
  return out;
}

/** The instruction an LLM needs. Keep it stable so answers can be cached. */
export function buildPrompt(line) {
  return `You design one building for an isometric pixel-art town, outside and inside, from this one-line description:
"${line}"

First decide what kind of building this is and how big it should be. Size must follow the description, and different buildings must look different:
- street stall, kiosk, cart: footprint about 1-1.6 x 1-1.2, 1 floor, front "counter"
- small shop, café, house: about 1.8-2.6 x 1.4-2, 1-2 floors
- big store, restaurant, hall, gym: about 3-4 x 2-3, 1-3 floors; add wings if it is a complex
- exhibition hall, museum, station, market hall, factory: wide and low, about 4-5 x 3-4, 1-2 floors, front "curtain" or "portico", roof "barrel", "sawtooth", "flat" or "dome", banners, wings
- tower, department store, hotel, office: footprint 2-3 x 2-3, 3-4 floors, wings with different heights
Pick the roof, front and props that make this building recognisable at a glance.

Output ONLY JSON Lines: one JSON object per line, no other text, no code fences. Write the lines in this order, because each line is built on screen the moment it arrives:

{"step":"name","name":"<building name, max 10 chars, same language as the description>"}
{"step":"base","size":[w,d],"floors":<1-4>,"wall":{"mat":"plank|plaster|brick","color":"#rrggbb"},"trim":"#rrggbb","night":<bool>,"note":"..."}
{"step":"front","type":"counter|glass|door|curtain|portico","door":"#rrggbb (door, or column color for portico)","noren":{"color":"#rrggbb","text":"<1-3 chars>"} (only for counter),"note":"..."}
{"step":"roof","type":"gable|hip|flat|shed|barrel|sawtooth|dome","color":"#rrggbb","curl":<bool, upturned eaves for gable>,"note":"..."}
then 0-3 lines of {"step":"wing","side":"left|right|back","w":<0.8-3>,"d":<0.8-3>,"floors":<1-4>,"roof":"flat|gable|hip","roofColor":"#rrggbb","note":"..."}
{"step":"decor","awning":{"a":"#rrggbb","b":"#rrggbb"} (optional),"sign":{"text":"<max 5 chars>","place":"front|roof|blade","bg":"#rrggbb","fg":"#rrggbb","glow":<bool>},"neon":"#rrggbb" (optional),"banners":["#rrggbb",...] (optional, 2-5 tall banners),"chimney":<bool>,"note":"..."}
then 2-7 lines of {"step":"prop","type":"<prop>","x":<offset along the front, -w/2-0.5 .. w/2+0.5>,"color":"#rrggbb","on":"roof|sill","text":"<max 3 chars>","note":"..."} (only the fields that prop uses)
{"step":"room","size":[w,d],"floor":{"type":"wood|checker","a":"#rrggbb","b":"#rrggbb"},"wall":{"mat":"plank|plaster|brick","color":"#rrggbb"},"note":"..."}
then 6-14 lines of {"step":"item","type":"<item>", placement, extra fields, "note":"..."}

Units are tiles. The room is the main ground-floor space: a stall gets about 2 x 2, a shop 3-4 x 3, a hall 6-7 x 4-5. Room x runs 0..w and z 0..d; back walls stand at z=0 and x=0; the front walls are cut away.
Props: lantern(x,color) stool(x) plant(x) bench(x) crate(x) bookstand(x) standee(x) menuboard(x,text) flag(x,color) barrel(z, beside the side wall) cat(on:roof|sill) glove(on:roof,color).
Items on the floor use "at":[x,z]: pedestal(color, an exhibit on a plinth) partition(len,color,rot:0|90, a free-standing display wall) counter(len,color,on:bowls|coffee|register,rot:0|90) stove stool plant bag case catbed cat chair(color) table(color) sofa(color) rug(size:[w,d],color) pendant(color = the light).
shelf: "at":[x,z] against the z=0 wall, or "wall":"x","at":<z> against the x=0 wall; len; goods:bowls|figures|gloves.
Items on a wall use "wall":"x"|"z","at":<distance along it>: frame(color, a framed artwork) bookshelf(len) window poster(text,color) lantern(color) neon(color).
Keep the inside's colors and materials consistent with the outside. Leave about 0.6 tiles between floor items. Keep stools and chairs on the open side of counters.
Write every "note" in the same language as the description, under 20 characters, saying what this line builds.`;
}
