// Example buildings that open the shared town (author "seed"). Same format a player's building is stored in.
export const SEED = {
  C1: { line: '20층 럭셔리 호텔', input: { type: 'hotel', style: 'modern_glass', name: '스카이 호텔', levels: 20, scale: 'XL', accent: '#c9a24a', sign: { icon: 'bed', place: 'roof', bg: '#2b2f3a', fg: '#e8c46a' }, hero: 'flagpoles',
    floors: [{ range: [1, 1], name: '로비', zones: [{ zone: 'lobby', weight: 2 }, { zone: 'reception', weight: 1 }, { zone: 'lounge', weight: 1 }] }, { range: [2, 19], name: '객실층', zones: ['guest_rooms'] }, { range: [20, 20], name: '스카이 라운지', zones: [{ zone: 'restaurant', weight: 2 }, { zone: 'bar', weight: 1 }] }] } },
  A2: { line: '달빛 아래 한옥 찻집', input: { type: 'cafe', style: 'hanok', name: '달빛 찻집', levels: 1, scale: 'M', size: [2.2, 1.7], accent: '#5b8a6a', ground: 'gate', sign: { icon: 'cup', place: 'blade', bg: '#5b8a6a', fg: '#f4ecd8' }, hero: 'lantern_string',
    props: [{ type: 'tree', x: -1 }, { type: 'bench', x: .6 }], floors: [{ range: [1, 1], name: '대청마루', zones: [{ zone: 'maru', weight: 2 }, { zone: 'counter', weight: 1 }, { zone: 'seating', weight: 1 }] }] } },
  B2: { line: '겨울 골목의 작은 붕어빵 노점', input: { type: 'kiosk', name: '붕어빵', levels: 1, scale: 'S', hero: 'food_cart', accent: '#c23b2b', sign: { icon: 'fish', place: 'front', bg: '#c23b2b', fg: '#fff7e6' } } },
  F1: { line: '붉은 벽돌 기차역', input: { type: 'train_station', style: 'brick', name: '붉은 기차역', levels: 1, scale: 'L' } },
  G2: { line: '시골 읍내 약국', input: { type: 'pharmacy', name: '온누리 약국', levels: 2, scale: 'M' } },
  E1: { line: '야간 경기가 있는 야구장', input: { type: 'stadium', name: '한줄 야구장', levels: 2, scale: 'XL', accent: '#2e5d8a' } },
  H1: { line: '항구의 하얀 등대', input: { type: 'lighthouse', name: '하얀 등대', levels: 6, scale: 'S' } },
};
