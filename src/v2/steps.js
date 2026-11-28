// Build steps for spec v2. The model streams one JSON object per line:
// the first line picks a type and a style (a complete default building appears at once),
// later lines override parts, and each override drops into place.
import { TYPES, STYLES, TYPE_KO, STYLE_KO } from './catalog.js';
import { GROUNDS, RHYTHMS, ICONS, HEROES, PROPS, MASS_SHAPES, normalize } from './spec.js';
import { ROOF_SHAPES } from './roofs.js';
import { WALL_MATERIALS, ROOF_MATERIALS } from './materials.js';
import { ZONE_NAMES, FIXTURE_NAMES, zoneFixtures } from './interior.js';
import { ANIMALS } from './animals.js';

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
    case 'guests': {   // who loves this place and what they say about it (2026-11-28: the line I wrote comes back as my guests' words)
      const t = (v, n) => (typeof v === 'string' ? Array.from(v.replace(/\s+/g, ' ').trim()).slice(0, n).join('') : '');   // by characters, so an emoji is never cut in half
      const reviews = (Array.isArray(step.reviews) ? step.reviews : []).map(r => t(r, 32)).filter(Boolean).slice(0, 4);
      if (!reviews.length) return null;
      i.guests = { who: t(step.who, 16), reviews };
      return { view: 'int', key: 'guests' };
    }
    case 'order': {   // the order the owner furnishes the shop as it grows: fixture kinds, first = first bought
      const kinds = (Array.isArray(step.kinds) ? step.kinds : []).filter(k => typeof k === 'string' && FIXTURE_NAMES.includes(k));
      if (!kinds.length) return null;
      i.order = [...new Set(kinds)].slice(0, 16);
      return { view: 'int', key: 'order' };
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

export function buildPrompt(line, { lot, place, request, owner } = {}) {
  // a request card: the island asked for a kind of place; the type must be one that serves it
  const requestRule = request ? `\nThe islanders asked for ${request.en}. The building must be one of these types: ${request.types.join(', ')} (pick the one that fits the description best).` : '';
  const placeRule = place ? `\nThe building stands in ${place}. When the description does not say otherwise, let the local architecture, materials and climate of that place shape it.` : '';
  const lotRule = lot ? `\nThe building stands on a lot of size ${lot.size} (${lot.w} x ${lot.d} tiles). Use "scale":"${lot.size}" and keep the footprint, wings included, within ${(lot.w - .6).toFixed(1)} x ${(lot.d - .8).toFixed(1)} tiles; leave the front edge for props.` : '';
  // the owner: the builder's animal runs every shop they build (2026-11-28); the engine draws it, the model makes the building its own
  const an = ANIMALS[owner], ownerRule = an ? `\nThis shop is run by its owner, a ${an.en} (${an.ko}). The engine already draws the ${an.en} standing at the door and working behind every counter, so you do not need to. Make the building itself unmistakably a ${an.en}'s place too, through what you choose: ${an.kit}. Use hero "owner_statue" (a big painted ${an.en} figure by the door) unless the description needs another hero to be recognisable. Let the name, the notes and the guests' reviews play with the ${an.en} running it.` : '';
  return `You design one building for an isometric pixel-art town, outside and inside, from this one-line description:
"${line}"${placeRule}${lotRule}${requestRule}${ownerRule}

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
   Zones, each with the furniture it already comes with: ${ZONE_NAMES.map(z => `${z}(${zoneFixtures(z).join(',')})`).join(' ')}
8. Optional 0-6 lines {"step":"fixture","floor":<index of the floor line, 0-based>,"zone":"<a zone on that floor>","kind":"<fixture>","pattern":"back|left|rows|center|corner|front|cells","count":<n>,"color":"#rrggbb","note":"..."} to add something special.
   Fixtures: ${FIXTURE_NAMES.join(' ')}
9. One line {"step":"order","kinds":["<fixture>", ...],"note":"..."}: the order in which the owner furnishes this place as it grows, using the furniture of your zones and fixture lines. The shop opens with almost nothing; list 5-12 kinds, first bought first: what this place cannot open without (where guests pay or are served), then what lets more guests in (seats, displays, cooking that makes it faster), then comfort and decoration. Think like the owner of THIS place: a 붕어빵 stall starts with its counter and its cooking, a reading cafe gets seats early, a gallery its pedestals.

Make it recognisable at a glance. Rules that help:
- Landmarks need their silhouette: lighthouse = main shape "round" with taper and bands + hero "lamp"; windmill = "round" with taper + hero "sails"; castle = "crenel": true + round towers (mass shape "round", roof "cone"); stadium or ballpark = main shape "bowl"; UFO or spaceship = main shape "saucer"; mosque = roof "dome" + a tall "round" mass with roof "onion" as minaret; market = hero "stall_row".
- Materials named in the description win over any style default: stone/돌 = wall "stone", wood/나무/통나무 = "wood_boards", brick/벽돌 = "brick", glass/유리 = "glass" or rhythm "curtain", concrete/콘크리트 = "concrete", marble/대리석 = "marble". Put them in the "main" line.
- Art gallery or museum of modern art = white walls (plaster or concrete), few big windows or "curtain", hero "sculpture"; a house or villa with a pool = hero "outdoor_pool"; fish-shaped bread (붕어빵) = icon "fish".
- Small shops need one loud cue: pharmacy = hero "green_cross", post office = hero "postbox", boxing or martial arts gym = hero "giant_glove" and an inside zone "ring", street-food stall = hero "food_cart", anything underground = ground "stairs_down".
- Words about age and mood change the materials: old, retro, traditional = brick, wood or stone, warm "night": true lights, punched or arched windows; modern, new, minimal = style "modern_glass" or white concrete, rhythm "curtain" or "bands"; luxurious = more floors, a canopy, gold accent; cute or kids = bright accent, rounded props.
- Pick the inside zones for the actual activity (a boxing gym has "ring", a ballpark has "diamond" and "stands", a library has "stacks" and "reading").

10. Last, one line {"step":"guests","who":"<who loves this place most, a kind of person, max 14 chars>","reviews":["<a guest's review>", "<another>", "<another>"]}: three short reviews (each under 26 characters, spoken like a real guest, casual) that react to the SPECIFIC things in the description and in what you built — the cat, the sea view, the window seats, the grandmother's cooking — never generic praise like "맛있어요" alone. Make at least one of them funny or warm.

Write every "note", "who" and review in the same language as the description; every "note" under 20 characters, saying what that line builds.`;
}

// ---------- extending a building: one more floor on top, from one line ----------
/** The prompt for an extension: the model writes only the new floor, its special fixtures and the order to furnish it. */
export function extendPrompt(request, input, floorCount) {
  const lv = input.levels ?? 1, floors = input.floors?.length ? input.floors : normalize(input).floors;
  return `You extend an existing building in an isometric pixel-art game by adding ONE new floor on top.
The building: ${JSON.stringify({ name: input.name, type: input.type, levels: lv, floors: floors.map(f => ({ range: f.range, name: f.name, zones: f.zones })) })}
The owner asks for: "${request}"

Output ONLY JSON Lines, one JSON object per line, no other text, no code fences:
1. {"step":"floor","range":[${lv + 1},${lv + 1}],"name":"<short floor name, same language as the request>","zones":[{"zone":"<zone>","weight":<0.3-5>}, ...],"note":"..."}
   Pick zones for what the owner asked (more seats = seating/dining/lounge, a terrace = seating or lounge, more kitchen = kitchen and counter, rooms = guest_rooms).
   Zones, each with the furniture it already comes with: ${ZONE_NAMES.map(z => `${z}(${zoneFixtures(z).join(',')})`).join(' ')}
2. Optional 0-3 lines {"step":"fixture","floor":${floors.length},"zone":"<a zone on the new floor>","kind":"<fixture>","pattern":"back|left|rows|center|corner|front|cells","count":<n>,"note":"..."}
   Fixtures: ${FIXTURE_NAMES.join(' ')}
3. One line {"step":"order","kinds":["<fixture>", ...],"note":"..."}: the order in which the owner furnishes the NEW floor, using the furniture of its zones, most useful first.
Write every "note" in the same language as the request, under 20 characters.`;
}
/** Apply extension lines to a copy of the input. Returns the new input, or null if no floor came. */
export function applyExtension(input, steps) {
  const out = JSON.parse(JSON.stringify(input)), lv = out.levels ?? 1;
  // a building that kept the type's default floors gets them written out, so the new one can go on top
  if (!out.floors?.length) out.floors = normalize(input).floors.map(f => ({ range: f.range, name: f.name, zones: f.zones, fixtures: f.fixtures ?? [] }));
  { const top = Math.max(...out.floors.map(f => f.range[1])); if (top < lv) out.floors[out.floors.length - 1].range[1] = lv; }
  let added = null; const newKinds = [];
  for (const s of steps) {
    if (s?.step === 'floor' && !added && out.floors.length < 8 && Array.isArray(s.zones) && s.zones.length) {
      added = { range: [lv + 1, lv + 1], name: typeof s.name === 'string' ? s.name.slice(0, 12) : `${lv + 1}층`, zones: s.zones.filter(z => ZONE_NAMES.includes(z?.zone ?? z)).slice(0, 5), fixtures: [] };
      if (!added.zones.length) added = null; else out.floors.push(added);
    } else if (s?.step === 'fixture' && added && FIXTURE_NAMES.includes(s.kind) && added.fixtures.length < 3) {
      added.fixtures.push({ zone: added.zones.some(z => (z.zone ?? z) === s.zone) ? s.zone : (added.zones[0].zone ?? added.zones[0]), kind: s.kind, pattern: s.pattern ?? 'rows', count: Math.min(6, +s.count || 2) });
    } else if (s?.step === 'order' && Array.isArray(s.kinds)) newKinds.push(...s.kinds.filter(k => FIXTURE_NAMES.includes(k)));
  }
  if (!added) return null;
  out.levels = lv + 1;
  out.order = [...new Set([...(out.order ?? []), ...newKinds])];
  return out;
}
