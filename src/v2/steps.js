// Build steps for spec v2. The model streams one JSON object per line:
// the first line picks a type and a style (a complete default building appears at once),
// later lines override parts, and each override drops into place.
import { TYPES, STYLES, TYPE_KO, STYLE_KO } from './catalog.js';
import { GROUNDS, RHYTHMS, ICONS, HEROES, PROPS, MASS_SHAPES } from './spec.js';
import { ROOF_SHAPES } from './roofs.js';
import { WALL_MATERIALS, ROOF_MATERIALS } from './materials.js';
import { applyStep as applyInteriorStep, emptyShop } from '../steps.js';

export function emptyBuilding() { return { input: null, int: emptyShop().int }; }

const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]));

/** Apply one step in place. Returns { view: 'ext'|'int', key } for the part that changed, or null. */
export function applyStep(b, step) {
  if (!step || typeof step !== 'object') return null;
  const s = step.step;
  if (s === 'building') {
    b.input = { ...pick(step, ['type', 'style', 'name', 'levels', 'scale', 'size', 'trim', 'accent', 'night']) };
    return { view: 'ext', key: 'all' };
  }
  if (!b.input) return ['room', 'item'].includes(s) ? applyInteriorStep({ int: b.int, ext: {} }, step) : null;
  const i = b.input;
  switch (s) {
    case 'main':
      Object.assign(i, pick(step, ['wall', 'roof', 'ground', 'rhythm', 'balconies', 'shape']));
      return { view: 'ext', key: 'mass:main' };
    case 'mass': {
      i.masses = i.masses ?? [];
      if (i.masses.length >= 4) return null;
      i.masses.push({ ...pick(step, ['shape', 'at', 'size', 'levels', 'roof', 'wall', 'rhythm', 'ground', 'balconies']), id: 'm' + i.masses.length });
      return { view: 'ext', key: 'mass:m' + (i.masses.length - 1) };
    }
    case 'sign': i.sign = pick(step, ['icon', 'place', 'bg', 'fg']); return { view: 'ext', key: 'sign' };
    case 'hero': i.hero = step.hero; return { view: 'ext', key: 'hero' };
    case 'prop': {
      i.props = i.props ?? [];
      if (i.props.length >= 8) return null;
      i.props.push(pick(step, ['type', 'x', 'color']));
      return { view: 'ext', key: 'prop:' + (i.props.length - 1) };
    }
    case 'room': case 'item': return applyInteriorStep({ int: b.int, ext: {} }, step);
  }
  return null;
}

const list = (a) => a.join('|');
const TYPE_LIST = Object.keys(TYPES).map(t => `${t}(${TYPE_KO[t] ?? t})`).join(' ');
const STYLE_LIST = Object.keys(STYLES).map(t => `${t}(${STYLE_KO[t] ?? t})`).join(' ');

export function buildPrompt(line) {
  return `You design one building for an isometric pixel-art town, outside and inside, from this one-line description:
"${line}"

How it works: you pick the closest building TYPE and a STYLE, and the engine already knows good defaults for both (size, floors, roof, front, sign, hero prop). Then you override only what this description needs, so the building is recognisably THIS building. If no type fits exactly, pick the closest one and override its parts.

Types: ${TYPE_LIST}
Styles: ${STYLE_LIST}. Leave "style" out to use the type's own look.

Output ONLY JSON Lines, one JSON object per line, no other text, no code fences, in this order. Each line is built on screen the moment it arrives:

1. {"step":"building","type":"<type>","style":"<style>","name":"<name, max 10 chars, same language as the description>","levels":<floors, 1-60, the real count; tall buildings are drawn shortened>,"scale":"S|M|L|XL","size":[w,d] (optional, tiles, w 0.9-6, d 0.9-5),"accent":"#rrggbb","night":<bool>,"note":"..."}
2. Optional {"step":"main", override the main block: "wall":{"material":"${list(WALL_MATERIALS)}","color":"#rrggbb"},"roof":{"shape":"${list(ROOF_SHAPES)}","material":"${list(ROOF_MATERIALS)}","color":"#rrggbb","pitch":0.15-1.4,"overhang":0-0.6,"eave":"straight|curl"},"ground":"${list(GROUNDS)}","rhythm":"${list(RHYTHMS)}","balconies":<bool>,"note":"..."}
3. 0-4 lines {"step":"mass","shape":"${list(MASS_SHAPES)}","at":"left|right|back|front|top","size":[w,d],"levels":<n>,"roof":{...},"wall":{...},"rhythm":"...","note":"..."} for wings, towers, a tower on top, a canopy. Writing any mass line replaces the type's default extra blocks.
4. {"step":"sign","icon":"${list(ICONS)}","place":"front|roof|blade|pole","bg":"#rrggbb","fg":"#rrggbb","note":"..."}
5. {"step":"hero","hero":"${list(HEROES)}","note":"..."}  one oversized prop that tells what this building is.
6. 0-6 lines {"step":"prop","type":"${list(PROPS)}","x":<-1..1 along the front>,"color":"#rrggbb","note":"..."}
7. {"step":"room","size":[w,d],"floor":{"type":"wood|checker","a":"#rrggbb","b":"#rrggbb"},"wall":{"mat":"plank|plaster|brick","color":"#rrggbb"},"note":"..."}  the main ground-floor space: a stall about 2x2, a shop 3-4x3, a hall 6-7x4-5. Room x runs 0..w and z 0..d; back walls at z=0 and x=0.
8. 6-14 lines {"step":"item","type":"<item>", placement, extra fields, "note":"..."}:
   floor items use "at":[x,z]: pedestal(color) partition(len,color,rot:0|90) counter(len,color,on:bowls|coffee|register,rot:0|90) stove stool plant bag case catbed cat chair(color) table(color) sofa(color) rug(size:[w,d],color) pendant(color = the light);
   shelf: "at":[x,z] against the z=0 wall, or "wall":"x","at":<z>; len; goods:bowls|figures|gloves;
   wall items use "wall":"x"|"z","at":<distance>: frame(color) bookshelf(len) window poster(text,color) lantern(color) neon(color).
   Keep the inside's colours consistent with the outside. Leave about 0.6 tiles between floor items.

Write every "note" in the same language as the description, under 20 characters, saying what that line builds.`;
}
