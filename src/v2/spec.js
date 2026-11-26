// Spec v2: the model writes a type, a style and only the overrides it needs.
// normalize() fills every default from the catalogue and clamps every value, so the renderer never sees a bad spec.
import { TYPES, STYLES, SCALE, FAMILY_LOOK, TYPE_LOOK } from './catalog.js';
import { ROOF_SHAPES } from './roofs.js';
import { WALL_MATERIALS, ROOF_MATERIALS } from './materials.js';
import { ZONE_NAMES, FIXTURE_NAMES, defaultFloors } from './interior.js';

const HEX = /^#[0-9a-fA-F]{6}$/;
const color = (v, d) => (typeof v === 'string' && HEX.test(v) ? v : d);
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
const num = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const str = (v, n, d = '') => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : d);

export const GROUNDS = ['stairs_down', 'shopfront', 'arcade', 'portico', 'canopy', 'garage', 'dock', 'porch', 'marquee', 'gate', 'counter', 'plain', 'curtain'];
export const RHYTHMS = ['punched', 'bands', 'grid', 'curtain', 'lattice', 'arched', 'none'];
export const MASS_SHAPES = ['box', 'round', 'canopy', 'bowl', 'saucer'];
export const SIDES = ['main', 'left', 'right', 'back', 'front', 'top'];
export const HEROES = ['none', 'sculpture', 'outdoor_pool', 'giant_glove', 'stall_row', 'food_cart', 'giant_cup', 'giant_bread', 'big_fork', 'neon_arrow', 'pylon_sign', 'lantern_string', 'mannequin', 'green_cross', 'red_cross', 'clock', 'flagpoles', 'siren',
  'postbox', 'slide', 'banners', 'marquee_lights', 'dumbbell', 'floodlights', 'giant_pin', 'chimney_stack', 'weathervane', 'mailbox', 'water_tank', 'chimney', 'spire', 'minaret', 'lamp', 'sails'];
export const ICONS = ['fish', 'fork', 'cup', 'bread', 'glass', 'burger', 'noodle', 'cart', 'bag', 'pill', 'news', 'pc', 'bed', 'flag', 'badge', 'fire', 'mail', 'book', 'star', 'cap', 'cross',
  'column', 'frame', 'mask', 'film', 'music', 'dumbbell', 'wave', 'ball', 'train', 'bus', 'fuel', 'car', 'gear', 'box', 'wrench', 'wheat', 'house', 'tree', 'cross_r', 'lotus', 'moon', 'clock', 'crown'];
export const PROPS = ['plant', 'bench', 'stool', 'lantern', 'flag', 'crate', 'barrel', 'bike', 'aboard', 'parasol', 'bollard', 'tree', 'vending', 'car', 'cat'];
export const MAX_SHOWN_LEVELS = 8;

function roofOf(input, type, style) {
  const special = ['sawtooth', 'round', 'dome', 'gambrel', 'cone', 'mansard', 'skillion', 'pyramidal', 'onion'].includes(type.roof);
  const shape = oneOf(input?.shape, ROOF_SHAPES, undefined) ?? (special ? type.roof : style.roof.shape ?? type.roof);
  return {
    shape,
    material: oneOf(input?.material, ROOF_MATERIALS, style.roof.material ?? 'roof_tiles'),
    color: color(input?.color, style.roof.color),
    pitch: num(input?.pitch, 0.15, 1.4, style.roof.pitch ?? 0.55),
    overhang: num(input?.overhang, 0, 0.6, style.roof.overhang ?? 0.18),
    orientation: oneOf(input?.orientation, ['along', 'across'], undefined),
    eave: oneOf(input?.eave, ['straight', 'curl'], style.roof.eave ?? 'straight'),
  };
}
const wallOf = (input, style) => ({ material: oneOf(input?.material, WALL_MATERIALS, style.wall.material), color: color(input?.color, style.wall.color) });

// Extra masses a type brings by default ("wing:left", "tower:top", ...), sized from the main mass.
function defaultMasses(extra, main, levels, style) {
  const [w, d] = main.size, out = [];
  for (const e of extra) {
    const [kind, at] = e.split(':');
    if (kind === 'wing') out.push({ shape: 'box', at, size: [w * 0.5, d * 0.85], levels: Math.max(1, levels - 1) });
    if (kind === 'tower') out.push(at === 'top' ? { shape: 'box', at: 'top', size: [w * 0.4, d * 0.4], levels: 2, roof: { shape: 'pyramidal' } }
      : { shape: 'box', at, size: [0.95, 0.95], levels: levels + 2, roof: { shape: style.roof.shape === 'flat' ? 'flat' : 'pyramidal' } });
    if (kind === 'canopy') out.push({ shape: 'canopy', at, size: [w * 1.05, 1.3], levels: 1 });
    if (kind === 'turret') out.push({ shape: 'round', at, size: [1.0, 1.0], levels: levels + 1, roof: { shape: 'cone' } });
    if (kind === 'spire') out.push({ shape: 'round', at, size: [0.6, 0.6], levels: levels + 4, roof: { shape: 'cone' } });
  }
  return out;
}

/** Fill a partial spec from the catalogue. Accepts what the model wrote, returns what the renderer draws. */
export function normalize(input = {}) {
  const typeName = TYPES[input.type] ? input.type : 'house';
  const type = TYPES[typeName], look = TYPE_LOOK[typeName] ?? {};
  const styleName = STYLES[input.style] ? input.style : (look.style ?? 'plain');
  let style = STYLES[styleName];
  if (styleName === 'plain') {
    // no style chosen: colour by family, and the type's own wall if it has one
    const f = FAMILY_LOOK[type.family] ?? {};
    style = { ...style, wall: look.wall ?? { ...style.wall, color: f.wall ?? style.wall.color }, roof: { ...style.roof, color: f.roof ?? style.roof.color }, accent: f.accent ?? style.accent };
  } else if (look.wall && !input.style) style = { ...style, wall: look.wall };
  const levels = Math.round(num(input.levels, 1, 60, type.levels[0]));
  const base = SCALE[oneOf(input.scale, Object.keys(SCALE), type.scale)];
  const size = [num(input.size?.[0], 0.9, 6, base[0]), num(input.size?.[1], 0.9, 5, base[1])];
  const trim = color(input.trim, style.trim), accent = color(input.accent, look.accent ?? style.accent);
  const main = { id: 'main', shape: oneOf(input.shape, MASS_SHAPES, look.shape ?? 'box'), at: 'main', size, levels,
    taper: num(input.taper, 0.4, 1, look.taper ?? 1), crenel: input.crenel ?? look.crenel ?? false, bands: color(input.bands, look.bands),
    wall: wallOf(input.wall, style), roof: roofOf(input.roof, type, style),
    ground: oneOf(input.ground, GROUNDS, type.ground), rhythm: oneOf(input.rhythm, RHYTHMS, style.rhythm), balconies: !!input.balconies };

  // podium + tower types (hotel): the main mass becomes a tall tower on a two-floor base
  let masses = [main];
  if (type.extra.includes('podium:base') && !input.masses && levels > 4) {
    const podium = { ...main, id: 'podium', size: [size[0] * 1.25, size[1] * 1.2], levels: 2, roof: { ...main.roof, shape: 'flat' }, rhythm: 'curtain' };
    const tower = { ...main, id: 'main', at: 'top', parent: 'podium', levels: levels - 2, ground: 'plain', size: [size[0] * 0.8, size[1] * 0.75] };
    podium.at = 'main'; masses = [podium, tower];
  }
  const extra = Array.isArray(input.masses) ? input.masses : defaultMasses(type.extra.filter(e => e !== 'podium:base'), main, levels, style);
  extra.slice(0, 4).forEach((m, i) => {
    masses.push({ id: str(m.id, 12, 'm' + i), shape: oneOf(m.shape, MASS_SHAPES, 'box'), at: oneOf(m.at, SIDES.slice(1), 'left'), parent: masses[0].id,
      size: [num(m.size?.[0], 0.5, 5, size[0] * 0.5), num(m.size?.[1], 0.5, 5, size[1] * 0.7)], levels: Math.round(num(m.levels, 1, 60, 1)),
      wall: m.wall ? wallOf(m.wall, style) : main.wall, roof: roofOf({ ...m.roof, color: m.roof?.color ?? main.roof.color }, type, style),
      ground: oneOf(m.ground, GROUNDS, 'plain'), rhythm: oneOf(m.rhythm, RHYTHMS, main.rhythm), balconies: !!m.balconies,
      taper: num(m.taper, 0.4, 1, 1), crenel: !!m.crenel, bands: color(m.bands, undefined) });
  });
  // floors: each kind written once over a range of levels; ranges are clamped, sorted and made to cover level 1
  let floors = Array.isArray(input.floors) && input.floors.length ? input.floors.slice(0, 8).map(f => {
    const a = Math.round(num(f.range?.[0], 1, levels, 1)), b2 = Math.round(num(f.range?.[1], a, levels, a));
    const zones = (Array.isArray(f.zones) ? f.zones : []).slice(0, 6).map(z => typeof z === 'string' ? { zone: z, weight: 1 } : { zone: z?.zone, weight: num(z?.weight, .3, 5, 1) }).filter(z => ZONE_NAMES.includes(z.zone));
    const fixtures = (Array.isArray(f.fixtures) ? f.fixtures : []).slice(0, 8).filter(x => FIXTURE_NAMES.includes(x?.kind)).map(x => ({ zone: x.zone, kind: x.kind, pattern: oneOf(x.pattern, ['back', 'left', 'rows', 'center', 'corner', 'front', 'cells'], 'rows'), count: Math.round(num(x.count, 1, 12, 0)) || undefined, color: color(x.color, undefined) }));
    return { range: [a, b2], name: str(f.name, 14, a === b2 ? `${a}층` : `${a}~${b2}층`), zones: zones.length ? zones : [{ zone: 'hall', weight: 1 }], tint: color(f.tint, undefined), fixtures };
  }).sort((x, y) => x.range[0] - y.range[0]) : defaultFloors(typeName, levels);
  floors = floors.filter((f, i, a) => i === 0 || f.range[0] > a[i - 1].range[1]);
  if (floors[0].range[0] !== 1) floors[0].range[0] = 1;
  return {
    floors,
    type: typeName, style: styleName, family: type.family, name: str(input.name, 16, ''), levels,
    trim, accent, style_: style, masses,
    sign: { icon: oneOf(input.sign?.icon, ICONS, type.icon), place: oneOf(input.sign?.place, ['front', 'roof', 'blade', 'pole'], type.hero === 'pylon_sign' ? 'pole' : 'front'),
      bg: color(input.sign?.bg, accent), fg: color(input.sign?.fg, '#fff7e6') },
    hero: oneOf(input.hero, HEROES, type.hero),
    props: (Array.isArray(input.props) ? input.props : [{ type: 'plant', x: -0.4 }, { type: 'plant', x: 0.4 }]).slice(0, 8)
      .filter(p => PROPS.includes(p?.type)).map(p => ({ type: p.type, x: num(p.x, -4, 4, 0), color: color(p.color, accent) })),
    night: !!input.night,
  };
}
