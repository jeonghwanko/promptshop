// Example model answers in the v2 step format, used to replay a build without calling a model.
export const STREAMS = {
  hotel: [
    { step: 'building', type: 'hotel', style: 'modern_glass', name: '스카이 호텔', levels: 20, scale: 'L', accent: '#c9a24a', note: '20층 유리 호텔' },
    { step: 'main', roof: { shape: 'flat', color: '#2b2f3a' }, rhythm: 'curtain', note: '통유리 타워' },
    { step: 'mass', shape: 'box', at: 'top', size: [1.2, 1.0], levels: 1, roof: { shape: 'flat' }, rhythm: 'curtain', note: '옥상 라운지' },
    { step: 'sign', icon: 'bed', place: 'roof', bg: '#2b2f3a', fg: '#e8c46a', note: '옥상 간판' },
    { step: 'hero', hero: 'flagpoles', note: '입구 깃발' },
    { step: 'prop', type: 'car', x: -0.7, color: '#1d1f2a', note: '리무진' },
    { step: 'prop', type: 'plant', x: 0.3, note: '화분' },
    { step: 'prop', type: 'plant', x: 0.7, note: '화분' },
    { step: 'floor', range: [1, 1], name: '로비', zones: [{ zone: 'lobby', weight: 2 }, { zone: 'reception', weight: 1 }, { zone: 'lounge', weight: 1 }], note: '로비와 프런트' },
    { step: 'floor', range: [2, 19], name: '객실층', zones: [{ zone: 'guest_rooms', weight: 1 }], note: '객실 18개 층' },
    { step: 'floor', range: [20, 20], name: '스카이 라운지', zones: [{ zone: 'restaurant', weight: 2 }, { zone: 'bar', weight: 1 }], tint: '#e4d6c0', note: '꼭대기 라운지' },
    { step: 'fixture', floor: 2, zone: 'restaurant', kind: 'plant', pattern: 'corner', note: '야자수' },
  ],
  teahouse: [
    { step: 'building', type: 'cafe', style: 'hanok', name: '달빛 찻집', levels: 1, scale: 'M', size: [2.6, 1.8], accent: '#5b8a6a', note: '한옥 찻집' },
    { step: 'main', ground: 'gate', note: '나무 대문' },
    { step: 'mass', shape: 'box', at: 'left', size: [1.4, 1.4], levels: 1, roof: { shape: 'hipped-and-gabled', eave: 'curl' }, note: '사랑채' },
    { step: 'sign', icon: 'cup', place: 'blade', bg: '#5b8a6a', fg: '#f4ecd8', note: '찻잔 간판' },
    { step: 'hero', hero: 'lantern_string', note: '청사초롱' },
    { step: 'prop', type: 'tree', x: -1, note: '소나무' },
    { step: 'prop', type: 'bench', x: 0.6, note: '평상' },
    { step: 'floor', range: [1, 1], name: '대청마루', zones: [{ zone: 'maru', weight: 2 }, { zone: 'counter', weight: 1 }, { zone: 'seating', weight: 1 }], tint: '#d8bf98', note: '마루와 찻상' },
    { step: 'fixture', floor: 0, zone: 'maru', kind: 'lowtable', pattern: 'rows', count: 2, note: '좌식 탁자' },
  ],
};
