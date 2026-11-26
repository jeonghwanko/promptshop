// Quality loop for spec v2: repair what can be repaired, report what cannot.
// Cheap repairs first (nearest known name, fill floor gaps); only the leftovers go back to the model, once.
import { TYPES, STYLES, TYPE_KO, STYLE_KO } from './catalog.js';
import { GROUNDS, RHYTHMS, ICONS, HEROES, PROPS } from './spec.js';
import { ROOF_SHAPES } from './roofs.js';
import { ZONE_NAMES, FIXTURE_NAMES } from './interior.js';

function lev(a, b) {
  a = a.toLowerCase(); b = b.toLowerCase();
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
// Some common words the model may use instead of our keys.
const ALIAS = {
  airport: 'train_station', terminal: 'bus_terminal', station: 'train_station', mall: 'supermarket', department_store: 'supermarket', shop: 'boutique', store: 'convenience_store',
  office: 'town_hall', office_building: 'apartment', tower: 'clock_tower', skyscraper: 'apartment', apartment_block: 'apartment', house_korean: 'hanok_house', hanok: 'hanok_house',
  coffee: 'cafe', coffee_shop: 'cafe', teahouse: 'cafe', tea_house: 'cafe', pub: 'bar', diner: 'restaurant', noodle: 'restaurant', ramen: 'restaurant', inn: 'guesthouse', hostel: 'guesthouse',
  arcade: 'pc_bang', gaming: 'pc_bang', school_building: 'school', college: 'university', hospital_building: 'hospital', shrine: 'temple', pagoda: 'temple', cathedral: 'church', chapel: 'church',
  arena: 'stadium', gymnasium: 'gym', pool: 'swimming_pool', theatre: 'theater', movie_theater: 'cinema', museum_hall: 'museum', art_gallery: 'gallery', storehouse: 'warehouse', plant: 'factory', farm: 'barn',
  coffee: 'cup', tea: 'cup', bread: 'bread', hamburger: 'burger', medicine: 'pill', hospital_cross: 'cross', bed_icon: 'bed',
  lobby: 'lobby', bedroom: 'guest_rooms', rooms: 'guest_rooms', classroom: 'classroom', office_space: 'offices', dining_room: 'dining', cafe_zone: 'seating', storage: 'stockroom',
};
/** The closest name in `list`, or null when nothing is close. */
export function nearest(name, list) {
  if (typeof name !== 'string' || !name) return null;
  const k = name.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (list.includes(k)) return k;
  if (ALIAS[k] && list.includes(ALIAS[k])) return ALIAS[k];
  for (const [en, ko] of Object.entries({ ...TYPE_KO, ...STYLE_KO })) if (ko === name.trim() && list.includes(en)) return en;
  let best = null, bd = Infinity;
  for (const c of list) { const d = lev(k, c); if (d < bd) { bd = d; best = c; } }
  if (bd <= Math.max(2, Math.floor(k.length / 3))) return best;
  // shared word: "big_cup" → "giant_cup", "neon_sign" → "neon_arrow"
  const words = k.split('_').filter(w => w.length > 2);
  let pick = null, score = 0;
  for (const c of list) { const cw = c.split('_'); const sc = words.filter(w => cw.includes(w)).length; if (sc > score) { score = sc; pick = c; } }
  return pick ?? (list.find(c => c.includes(k) || k.includes(c)) ?? null);
}

/**
 * Repair a raw v2 input in place and report.
 * @returns {{fixed: string[], ask: string[]}} fixed = repaired here; ask = needs the model
 */
export function check(input, { broken = 0, line } = {}) {
  const fixed = [], ask = [];
  if (!input) { ask.push('The "building" line is missing. Start with {"step":"building", ...}.'); return { fixed, ask }; }
  const fix = (obj, key, list, label) => {
    if (obj[key] === undefined || list.includes(obj[key])) return;
    const n = nearest(obj[key], list);
    fixed.push(`${label} "${obj[key]}" → ${n ?? 'default'}`);
    if (n) obj[key] = n; else delete obj[key];
  };
  fix(input, 'type', Object.keys(TYPES), 'type');
  fix(input, 'style', Object.keys(STYLES), 'style');
  if (input.roof) fix(input.roof, 'shape', ROOF_SHAPES, 'roof');
  fix(input, 'ground', GROUNDS, 'ground');
  fix(input, 'rhythm', RHYTHMS, 'rhythm');
  if (input.sign) fix(input.sign, 'icon', ICONS, 'icon');
  if (input.hero) fix(input, 'hero', HEROES, 'hero');
  for (const p of input.props ?? []) fix(p, 'type', PROPS, 'prop');
  for (const m of input.masses ?? []) if (m.roof) fix(m.roof, 'shape', ROOF_SHAPES, 'roof');
  if (!input.name) { if (line) { input.name = line.slice(0, 10); fixed.push(`name → "${input.name}"`); } else ask.push('The building has no "name". Add it to the building line.'); }
  const levels = Math.max(1, Math.round(+input.levels || 1));

  // floors: known zones, ranges that cover 1..levels without gaps
  if (Array.isArray(input.floors) && input.floors.length) {
    for (const [i, f] of input.floors.entries()) {
      const zs = (Array.isArray(f.zones) ? f.zones : []).map(z => (typeof z === 'string' ? { zone: z, weight: 1 } : z));
      for (const z of zs) { if (!ZONE_NAMES.includes(z.zone)) { const n = nearest(z.zone, ZONE_NAMES); fixed.push(`zone "${z.zone}" → ${n ?? 'dropped'}`); z.zone = n; } }
      f.zones = zs.filter(z => z.zone);
      if (!f.zones.length) ask.push(`Floor line ${i} ("${f.name ?? ''}") has no known zone. Use zones from the list.`);
      for (const x of f.fixtures ?? []) if (!FIXTURE_NAMES.includes(x.kind)) { const n = nearest(x.kind, FIXTURE_NAMES); fixed.push(`fixture "${x.kind}" → ${n ?? 'dropped'}`); x.kind = n; }
      f.fixtures = (f.fixtures ?? []).filter(x => x.kind);
    }
    const fl = input.floors.filter(f => Array.isArray(f.range)).sort((a, b) => a.range[0] - b.range[0]);
    let next = 1;
    for (const f of fl) {
      if (f.range[0] > next) { fixed.push(`floors ${next}-${f.range[0] - 1} were missing → joined to "${f.name ?? ''}"`); f.range[0] = next; }
      next = Math.max(next, f.range[1] + 1);
    }
    if (fl.length && next <= levels) { fixed.push(`floors ${next}-${levels} were missing → joined to the top floor`); fl[fl.length - 1].range[1] = levels; }
  }
  if (broken > 0) ask.push(`${broken} line(s) were not valid JSON and were skipped.`);
  return { fixed, ask };
}

/** Which parts a finished answer is missing (the stream may stop early). */
export function missingParts(steps) {
  const has = new Set(steps.map(s => s.step));
  return ['building', 'sign', 'hero', 'floor'].filter(k => !has.has(k));
}

/** One short follow-up that asks only for the lines that fix the remaining problems. */
export function revisePrompt(line, linesText, problems) {
  return `You wrote these JSON Lines for a building described as "${line}":

${linesText.slice(0, 6000)}

Problems:
${problems.map(p => '- ' + p).join('\n')}

Reply with ONLY the corrected or missing JSON Lines, one per line, same format as before. If you send any "floor" lines, send all floor lines again (they replace the old ones). Do not repeat lines that were fine.`;
}
