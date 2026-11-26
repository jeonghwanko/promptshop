// Building types and style presets. The model picks a type and a style; these supply every default,
// and the model overrides only what the description needs.

// ---------- styles ----------
// A style changes the look of any type: walls, roof, window rhythm, trim and ornament.
export const STYLES = {
  plain: { wall: { material: 'plaster', color: '#e9dcc4' }, roof: { material: 'roof_tiles', color: '#a8553f', pitch: 0.55 }, rhythm: 'punched', trim: '#5b4636', accent: '#3f7a74' },
  hanok: { wall: { material: 'plaster', color: '#efe6d2' }, roof: { shape: 'hipped-and-gabled', material: 'roof_tiles', color: '#4a4f55', pitch: 0.55, overhang: 0.36, eave: 'curl' },
    rhythm: 'lattice', trim: '#6b4026', accent: '#c23b2b', posts: true, plinth: { h: 0.32, material: 'stone', color: '#b7b0a4' } },
  modern_glass: { wall: { material: 'concrete', color: '#c9ccd1' }, roof: { shape: 'flat', material: 'gravel', color: '#8c9096' }, rhythm: 'curtain', trim: '#3b4150', accent: '#2e86ab' },
  brick: { wall: { material: 'brick', color: '#a8553f' }, roof: { material: 'slate', color: '#4a4f58', pitch: 0.6 }, rhythm: 'punched', trim: '#efe6d6', accent: '#2e5d8a', lintel: true },
  mediterranean: { wall: { material: 'plaster', color: '#f6f1e6' }, roof: { shape: 'hipped', material: 'roof_tiles', color: '#c4643a', pitch: 0.35, overhang: 0.14 },
    rhythm: 'arched', trim: '#c4643a', accent: '#2e7da6', shutters: '#2e7da6' },
  nordic_wood: { wall: { material: 'wood_boards', color: '#9e3328' }, roof: { shape: 'gabled', material: 'metal_sheet', color: '#2e3236', pitch: 1.0, overhang: 0.14 },
    rhythm: 'punched', trim: '#f4f1ea', accent: '#e3b448', frames: '#f4f1ea' },
};
export const STYLE_NAMES = Object.keys(STYLES);

// ---------- scales ----------
// Footprint of the main mass, in tiles.
export const SCALE = { S: [1.4, 1.2], M: [2.4, 1.9], L: [3.6, 2.6], XL: [4.6, 3.3] };

// ---------- types ----------
// family, scale, levels [default, max], ground-floor front, roof shape (unless the style sets one),
// hero prop, sign icon, extra masses, and the interior zones used later by the cross-section.
const T = (family, scale, levels, ground, roof, hero, icon, extra = [], zones = []) => ({ family, scale, levels, ground, roof, hero, icon, extra, zones });
export const TYPES = {
  // food & retail
  restaurant:        T('food', 'M', [1, 2], 'shopfront', 'gabled', 'big_fork', 'fork', [], ['dining', 'kitchen', 'wc']),
  cafe:              T('food', 'S', [1, 2], 'shopfront', 'gabled', 'giant_cup', 'cup', [], ['counter', 'seating']),
  bakery:            T('food', 'S', [1, 2], 'shopfront', 'gabled', 'giant_bread', 'bread', [], ['counter', 'kitchen']),
  bar:               T('food', 'S', [1, 2], 'plain', 'flat', 'neon_arrow', 'glass', [], ['bar', 'seating']),
  fast_food:         T('food', 'M', [1, 1], 'shopfront', 'flat', 'pylon_sign', 'burger', [], ['counter', 'seating', 'kitchen']),
  pojangmacha:       T('food', 'S', [1, 1], 'counter', 'skillion', 'lantern_string', 'noodle', [], ['counter']),
  convenience_store: T('retail', 'S', [1, 2], 'shopfront', 'flat', 'pylon_sign', 'cart', [], ['aisles', 'checkout', 'stockroom']),
  supermarket:       T('retail', 'L', [1, 1], 'shopfront', 'flat', 'pylon_sign', 'cart', ['canopy:front'], ['aisles', 'checkout', 'stockroom']),
  boutique:          T('retail', 'S', [1, 2], 'shopfront', 'mansard', 'mannequin', 'bag', [], ['sales', 'fitting']),
  pharmacy:          T('retail', 'S', [1, 2], 'shopfront', 'flat', 'green_cross', 'pill', [], ['sales', 'counter']),
  market_hall:       T('retail', 'XL', [1, 1], 'arcade', 'round', 'stall_row', 'cart', [], ['stalls']),
  kiosk:             T('retail', 'S', [1, 1], 'counter', 'pyramidal', 'none', 'news', [], ['counter']),
  pc_bang:           T('leisure', 'M', [2, 3], 'plain', 'flat', 'neon_arrow', 'pc', [], ['seating', 'counter']),
  // hospitality
  hotel:             T('hospitality', 'L', [8, 30], 'canopy', 'flat', 'flagpoles', 'bed', ['podium:base'], ['lobby', 'reception', 'guest_rooms', 'restaurant']),
  motel:             T('hospitality', 'M', [2, 3], 'canopy', 'hipped', 'pylon_sign', 'bed', [], ['lobby', 'guest_rooms']),
  guesthouse:        T('hospitality', 'M', [1, 2], 'porch', 'hipped-and-gabled', 'none', 'bed', [], ['lobby', 'guest_rooms']),
  // civic
  town_hall:         T('civic', 'L', [2, 3], 'portico', 'hipped', 'clock', 'flag', [], ['hall', 'offices']),
  police:            T('civic', 'M', [2, 2], 'canopy', 'flat', 'siren', 'badge', [], ['counter', 'offices', 'cells']),
  fire_station:      T('civic', 'M', [2, 2], 'garage', 'flat', 'siren', 'fire', ['tower:right'], ['bays', 'offices']),
  post_office:       T('civic', 'M', [1, 2], 'shopfront', 'gabled', 'postbox', 'mail', [], ['counter', 'sorting']),
  library:           T('civic', 'L', [2, 3], 'portico', 'hipped', 'none', 'book', [], ['stacks', 'reading']),
  // education
  kindergarten:      T('education', 'M', [1, 2], 'porch', 'gabled', 'slide', 'star', [], ['classroom', 'play']),
  school:            T('education', 'L', [3, 4], 'canopy', 'flat', 'clock', 'book', ['wing:left'], ['classroom', 'corridor', 'gym', 'canteen']),
  university:        T('education', 'XL', [3, 5], 'portico', 'hipped', 'clock', 'cap', ['tower:top'], ['lecture', 'library', 'offices']),
  // health
  clinic:            T('health', 'M', [2, 3], 'canopy', 'flat', 'green_cross', 'cross', [], ['waiting', 'consult']),
  hospital:          T('health', 'XL', [6, 12], 'canopy', 'flat', 'red_cross', 'cross', ['wing:right'], ['waiting', 'ward', 'nurse', 'or']),
  // culture
  museum:            T('culture', 'L', [2, 3], 'portico', 'flat', 'banners', 'column', [], ['foyer', 'gallery', 'shop']),
  gallery:           T('culture', 'M', [1, 2], 'curtain', 'flat', 'banners', 'frame', [], ['gallery']),
  theater:           T('culture', 'L', [2, 3], 'marquee', 'flat', 'marquee_lights', 'mask', ['tower:back'], ['foyer', 'auditorium', 'stage']),
  cinema:            T('culture', 'L', [2, 2], 'marquee', 'flat', 'marquee_lights', 'film', [], ['foyer', 'auditorium']),
  concert_hall:      T('culture', 'XL', [2, 3], 'curtain', 'round', 'none', 'music', [], ['foyer', 'auditorium', 'stage']),
  // sport & leisure
  gym:               T('sport', 'M', [1, 3], 'shopfront', 'flat', 'dumbbell', 'dumbbell', [], ['reception', 'cardio', 'weights', 'lockers']),
  swimming_pool:     T('sport', 'L', [1, 1], 'curtain', 'round', 'none', 'wave', [], ['pool', 'lockers']),
  stadium:           T('sport', 'XL', [2, 3], 'arcade', 'flat', 'none', 'ball', [], ['diamond', 'stands']),
  bowling_alley:     T('sport', 'L', [1, 1], 'marquee', 'flat', 'giant_pin', 'ball', [], ['lanes', 'counter']),
  // transport
  train_station:     T('transport', 'XL', [1, 2], 'arcade', 'round', 'clock', 'train', ['canopy:back'], ['concourse', 'tickets', 'platforms']),
  bus_terminal:      T('transport', 'L', [1, 2], 'canopy', 'flat', 'clock', 'bus', ['canopy:front'], ['concourse', 'waiting']),
  gas_station:       T('transport', 'M', [1, 1], 'shopfront', 'flat', 'pylon_sign', 'fuel', ['canopy:front'], ['shop', 'checkout']),
  parking_garage:    T('transport', 'L', [3, 6], 'garage', 'flat', 'none', 'car', [], ['parking']),
  // industry & storage
  factory:           T('industry', 'XL', [1, 2], 'dock', 'sawtooth', 'chimney_stack', 'gear', ['wing:left'], ['production', 'loading', 'office']),
  warehouse:         T('industry', 'L', [1, 1], 'garage', 'round', 'none', 'box', [], ['racks', 'loading']),
  workshop:          T('industry', 'M', [1, 1], 'garage', 'gabled', 'none', 'wrench', [], ['workshop']),
  barn:              T('industry', 'M', [1, 2], 'gate', 'gambrel', 'weathervane', 'wheat', [], ['stalls', 'loft']),
  // residential
  house:             T('residential', 'M', [1, 2], 'porch', 'gabled', 'mailbox', 'house', [], ['living', 'kitchen', 'bedroom', 'bath']),
  hanok_house:       T('residential', 'M', [1, 1], 'gate', 'hipped-and-gabled', 'none', 'house', ['wing:left'], ['maru', 'room', 'kitchen']),
  sangga:            T('residential', 'M', [3, 5], 'shopfront', 'flat', 'none', 'house', [], ['shop', 'living']),
  apartment:         T('residential', 'L', [5, 25], 'canopy', 'flat', 'water_tank', 'house', [], ['lobby', 'core', 'units']),
  villa:             T('residential', 'L', [2, 2], 'porch', 'hipped', 'none', 'house', ['wing:right'], ['living', 'bedroom']),
  cabin:             T('residential', 'S', [1, 1], 'porch', 'gabled', 'chimney', 'tree', [], ['living']),
  // religious
  church:            T('religious', 'L', [1, 1], 'portico', 'gabled', 'spire', 'cross_r', ['tower:front'], ['nave', 'altar']),
  temple:            T('religious', 'L', [1, 1], 'gate', 'hipped-and-gabled', 'none', 'lotus', [], ['hall']),
  mosque:            T('religious', 'L', [1, 1], 'arcade', 'dome', 'minaret', 'moon', ['spire:right'], ['prayer_hall']),
  // landmarks
  clock_tower:       T('landmark', 'S', [5, 8], 'plain', 'pyramidal', 'clock', 'clock', [], []),
  lighthouse:        T('landmark', 'S', [5, 8], 'plain', 'flat', 'lamp', 'star', [], []),
  windmill:          T('landmark', 'S', [3, 4], 'plain', 'cone', 'sails', 'wheat', [], []),
  castle:            T('landmark', 'XL', [2, 3], 'gate', 'flat', 'flagpoles', 'crown', ['turret:left', 'turret:right'], ['hall']),
};
export const TYPE_NAMES = Object.keys(TYPES);

// One colour scheme per family, used when no style is chosen, so families read apart at a glance
// (research: roof colour by family is one of the strongest recognisability cues).
export const FAMILY_LOOK = {
  food:        { wall: '#f1e2c6', roof: '#c0392b', accent: '#e3b448' },
  retail:      { wall: '#e9eef2', roof: '#2e86ab', accent: '#2e86ab' },
  leisure:     { wall: '#3b3f52', roof: '#1d1f2a', accent: '#ff4fa3' },
  hospitality: { wall: '#e8e0d2', roof: '#3b4150', accent: '#b88a3a' },
  civic:       { wall: '#e6e0d4', roof: '#5a6b7a', accent: '#2e5d8a' },
  education:   { wall: '#e8d6b0', roof: '#7a4a3a', accent: '#3f7a74' },
  health:      { wall: '#f4f6f8', roof: '#9fb4c4', accent: '#2fbf71' },
  culture:     { wall: '#efe9df', roof: '#4a4f58', accent: '#8064a2' },
  sport:       { wall: '#dfe6ea', roof: '#7f8fa3', accent: '#e2432f' },
  transport:   { wall: '#e2ddd2', roof: '#46706c', accent: '#e3b448' },
  industry:    { wall: '#b9b2a6', roof: '#6f7780', accent: '#e3b448' },
  residential: { wall: '#efe3cf', roof: '#a8553f', accent: '#5b8a6a' },
  religious:   { wall: '#efe9df', roof: '#5a5f68', accent: '#c9a24a' },
  landmark:    { wall: '#e4dccb', roof: '#7a4a3a', accent: '#c23b2b' },
};

// Per-type look: a default style, or a wall that defines the type (a castle is stone, a warehouse is metal).
export const TYPE_LOOK = {
  hanok_house: { style: 'hanok' }, temple: { style: 'hanok' }, guesthouse: { style: 'hanok' }, pojangmacha: { wall: { material: 'metal_sheet', color: '#e8743b' } },
  cabin: { style: 'nordic_wood' }, barn: { style: 'nordic_wood' },
  factory: { style: 'brick' }, university: { style: 'brick' }, library: { style: 'brick' }, school: { wall: { material: 'brick', color: '#b8735a' } },
  gallery: { style: 'modern_glass' }, concert_hall: { style: 'modern_glass' }, swimming_pool: { style: 'modern_glass' }, hotel: { style: 'modern_glass' },
  church: { wall: { material: 'stone', color: '#cfc6b6' } }, castle: { wall: { material: 'stone', color: '#bdb5a6' }, crenel: true }, town_hall: { wall: { material: 'stone', color: '#ddd5c4' } },
  museum: { wall: { material: 'marble', color: '#efece6' } }, mosque: { wall: { material: 'plaster', color: '#f4efe6' } },
  hospital: { wall: { material: 'concrete', color: '#eef1f3' } }, clinic: { wall: { material: 'plaster', color: '#f4f6f8' } },
  warehouse: { wall: { material: 'metal_sheet', color: '#9aa4ad' } }, workshop: { wall: { material: 'metal_sheet', color: '#7f8b94' } },
  parking_garage: { wall: { material: 'concrete', color: '#b8bcc2' } }, apartment: { wall: { material: 'concrete', color: '#e4e2dc' } },
  lighthouse: { wall: { material: 'plaster', color: '#f4f1ea' }, shape: 'round', taper: 0.68, bands: '#d6332a', accent: '#d6332a' },
  windmill: { wall: { material: 'wood_boards', color: '#d8c8a8' }, shape: 'round', taper: 0.72 },
  stadium: { shape: 'bowl' }, post_office: { accent: '#d6332a' }, market_hall: { accent: '#e3b448' },
  pc_bang: { wall: { material: 'concrete', color: '#3b3f52' } }, bar: { wall: { material: 'brick', color: '#5a3a32' } },
};
export const FAMILIES = [...new Set(Object.values(TYPES).map(t => t.family))];

// Korean labels for the gallery and the build log.
export const TYPE_KO = {
  restaurant: '식당', cafe: '카페', bakery: '빵집', bar: '바', fast_food: '패스트푸드', pojangmacha: '포장마차', convenience_store: '편의점', supermarket: '마트', boutique: '옷가게', pharmacy: '약국',
  market_hall: '시장 홀', kiosk: '가판대', pc_bang: 'PC방', hotel: '호텔', motel: '모텔', guesthouse: '게스트하우스', town_hall: '시청', police: '경찰서', fire_station: '소방서', post_office: '우체국',
  library: '도서관', kindergarten: '유치원', school: '학교', university: '대학', clinic: '의원', hospital: '병원', museum: '박물관', gallery: '미술관', theater: '극장', cinema: '영화관',
  concert_hall: '공연장', gym: '체육관', swimming_pool: '수영장', stadium: '경기장', bowling_alley: '볼링장', train_station: '기차역', bus_terminal: '버스터미널', gas_station: '주유소', parking_garage: '주차빌딩',
  factory: '공장', warehouse: '창고', workshop: '공방', barn: '헛간', house: '주택', hanok_house: '한옥', sangga: '상가주택', apartment: '아파트', villa: '저택', cabin: '오두막', church: '교회',
  temple: '절', mosque: '모스크', clock_tower: '시계탑', lighthouse: '등대', windmill: '풍차', castle: '성',
};
export const STYLE_KO = { plain: '기본', hanok: '한옥', modern_glass: '모던 유리', brick: '벽돌', mediterranean: '지중해', nordic_wood: '북유럽 목조' };
