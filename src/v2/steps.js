// Build steps for spec v2. The model streams one JSON object per line:
// the first line picks a type and a style (a complete default building appears at once),
// later lines override parts, and each override drops into place.
import { TYPES, STYLES, TYPE_KO, STYLE_KO } from './catalog.js';
import { GROUNDS, RHYTHMS, ICONS, HEROES, PROPS, MASS_SHAPES } from './spec.js';
import { ROOF_SHAPES } from './roofs.js';
import { WALL_MATERIALS, ROOF_MATERIALS } from './materials.js';
import { ZONE_NAMES, FIXTURE_NAMES } from './interior.js';

export function emptyBuilding() { return { input: null }; }

const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]));

/** Apply one step in place. Returns { view: 'ext'|'int', key } for the part that changed, or null. */
export function applyStep(b, step) {
  if (!step || typeof step !== 'object') return null;
  const s = step.step;
  if (s === 'building') {
    b.input = { ...pick(step, ['type', 'style', 'name', 'levels', 'scale', 'size', 'trim', 'accent', 'night']) };
    return { view: 'ext', key: 'all' };
  }
  if (!b.input) return null;
  const i = b.input;
  switch (s) {
    case 'main':
      Object.assign(i, pick(step, ['wall', 'roof', 'ground', 'rhythm', 'balconies', 'shape', 'taper', 'crenel', 'bands']));
      return { view: 'ext', key: 'mass:main' };
    case 'mass': {
      i.masses = i.masses ?? [];
      if (i.masses.length >= 4) return null;
      i.masses.push({ ...pick(step, ['shape', 'at', 'size', 'levels', 'roof', 'wall', 'rhythm', 'ground', 'balconies', 'taper', 'crenel', 'bands']), id: 'm' + i.masses.length });
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
    case 'floor': {
      i.floors = i.floors ?? [];
      if (i.floors.length >= 8) return null;
      i.floors.push({ ...pick(step, ['range', 'name', 'zones', 'tint']), fixtures: [] });
      return { view: 'int', key: 'floor:' + (i.floors.length - 1) };
    }
    case 'fixture': {
      const f = i.floors?.[step.floor ?? i.floors.length - 1];
      if (!f || f.fixtures.length >= 8) return null;
      f.fixtures.push(pick(step, ['zone', 'kind', 'pattern', 'count', 'color']));
      return { view: 'int', key: 'fixture' };
    }
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
2. Optional {"step":"main", override the main block: "shape":"${list(MASS_SHAPES)}","taper":<0.4-1, round towers narrow toward the top>,"crenel":<bool, battlements>,"bands":"#rrggbb" (stripes on a round tower), "wall":{"material":"${list(WALL_MATERIALS)}","color":"#rrggbb"},"roof":{"shape":"${list(ROOF_SHAPES)}","material":"${list(ROOF_MATERIALS)}","color":"#rrggbb","pitch":0.15-1.4,"overhang":0-0.6,"eave":"straight|curl"},"ground":"${list(GROUNDS)}","rhythm":"${list(RHYTHMS)}","balconies":<bool>,"note":"..."}
3. 0-4 lines {"step":"mass","shape":"${list(MASS_SHAPES)}","at":"left|right|back|front|top","size":[w,d],"levels":<n>,"roof":{...},"wall":{...},"rhythm":"...","note":"..."} for wings, towers, a tower on top, a canopy. Writing any mass line replaces the type's default extra blocks.
4. {"step":"sign","icon":"${list(ICONS)}","place":"front|roof|blade|pole","bg":"#rrggbb","fg":"#rrggbb","note":"..."}
5. {"step":"hero","hero":"${list(HEROES)}","note":"..."}  one oversized prop that tells what this building is.
6. 0-6 lines {"step":"prop","type":"${list(PROPS)}","x":<-1..1 along the front>,"color":"#rrggbb","note":"..."}
7. Inside, written once per KIND of floor (the engine draws a stacked cross-section, repeated floors merge into one, a lift core is added automatically):
   1-5 lines {"step":"floor","range":[from,to],"name":"<e.g. 로비, 객실층, 스카이 라운지>","zones":[{"zone":"<zone>","weight":<area weight 0.3-5>}, ...],"tint":"#rrggbb" (optional),"note":"..."}
   Ranges must cover every level from 1 to the building's levels without overlap, e.g. a 20-floor hotel: [1,1] lobby, [2,19] guest floors, [20,20] sky lounge. A 1-floor shop has one floor line.
   Zones (each already comes with its recognisable furniture): ${ZONE_NAMES.join(' ')}
8. Optional 0-6 lines {"step":"fixture","floor":<index of the floor line, 0-based>,"zone":"<a zone on that floor>","kind":"<fixture>","pattern":"back|left|rows|center|corner|front|cells","count":<n>,"color":"#rrggbb","note":"..."} to add something special.
   Fixtures: ${FIXTURE_NAMES.join(' ')}

Make it recognisable at a glance. Rules that help:
- Landmarks need their silhouette: lighthouse = main shape "round" with taper and bands + hero "lamp"; windmill = "round" with taper + hero "sails"; castle = "crenel": true + round towers (mass shape "round", roof "cone"); stadium or ballpark = main shape "bowl"; UFO or spaceship = main shape "saucer"; mosque = roof "dome" + a tall "round" mass with roof "onion" as minaret; market = hero "stall_row".
- Small shops need one loud cue: pharmacy = hero "green_cross", post office = hero "postbox", boxing or martial arts gym = hero "giant_glove" and an inside zone "ring", street-food stall = hero "food_cart", anything underground = ground "stairs_down".
- Words about age and mood change the materials: old, retro, traditional = brick, wood or stone, warm "night": true lights, punched or arched windows; modern, new, minimal = style "modern_glass" or white concrete, rhythm "curtain" or "bands"; luxurious = more floors, a canopy, gold accent; cute or kids = bright accent, rounded props.
- Pick the inside zones for the actual activity (a boxing gym has "ring", a ballpark has "diamond" and "stands", a library has "stacks" and "reading").

Write every "note" in the same language as the description, under 20 characters, saying what that line builds.`;
}
