// Example specs. In a game, an LLM writes these from a one-line description.
// Unit = 1 tile. Exterior: front (+z) faces screen lower-left, side (+x) faces lower-right.
// Interior: room spans x 0..W, z 0..D; back walls at z=0 (upper-right) and x=0 (upper-left).
export const SPECS = {
  ramen: {
    line: '밤에만 여는 청록 기와 포장마차 라멘집',
    ext: {
      size: [2.6, 1.6], floors: 1,
      wall: { mat: 'plank', color: '#7a4a2a' }, trim: '#3a2416',
      roof: { type: 'gable', color: '#3f7a74', curl: true },
      front: { type: 'counter' },
      noren: { color: '#1f3a5a', text: '라멘' },
      sign: { text: '밤라멘', place: 'front', bg: '#2a1d14', fg: '#ffd27a', glow: true },
      props: [
        { type: 'lantern', x: -1.15, color: '#e2432f' }, { type: 'lantern', x: 1.15, color: '#e2432f' },
        { type: 'stool', x: -0.75 }, { type: 'stool', x: 0 }, { type: 'stool', x: 0.75 },
        { type: 'menuboard', x: 1.75, text: '돈코츠' }, { type: 'barrel', side: true, z: -0.3 },
      ],
    },
    int: {
      size: [4, 3],
      floor: { type: 'wood', a: '#8a5a34', b: '#7a4c2a' },
      wall: { mat: 'plank', color: '#6b4126' },
      items: [
        { type: 'stove', at: [0.7, 0.35] }, { type: 'stove', at: [1.5, 0.35] },
        { type: 'shelf', at: [2.6, 0.2], len: 1.4, goods: 'bowls' },
        { type: 'counter', at: [2.0, 1.25], len: 3.2, color: '#a8703e', on: 'bowls' },
        { type: 'stool', at: [1.0, 1.85] }, { type: 'stool', at: [1.8, 1.85] }, { type: 'stool', at: [2.6, 1.85] }, { type: 'stool', at: [3.4, 1.85] },
        { type: 'pendant', at: [1.3, 1.25], color: '#ffb347' }, { type: 'pendant', at: [2.7, 1.25], color: '#ffb347' },
        { type: 'poster', wall: 'x', at: 1.0, text: '라멘', color: '#e2432f' },
        { type: 'lantern', wall: 'x', at: 2.2, color: '#e2432f' },
        { type: 'plant', at: [3.6, 2.6] },
      ],
    },
  },
  bookcafe: {
    line: '고양이가 주인인 작은 2층 북카페',
    ext: {
      size: [2.2, 2.0], floors: 2,
      wall: { mat: 'plaster', color: '#efe3cf' }, trim: '#5b4636',
      roof: { type: 'hip', color: '#b5533c' },
      front: { type: 'glass', door: '#5b8a6a' },
      awning: { a: '#5b8a6a', b: '#f3ead8' },
      sign: { text: '고양이 서재', place: 'blade', bg: '#5b8a6a', fg: '#fff7e6' },
      chimney: true,
      props: [
        { type: 'plant', x: -0.85 }, { type: 'bench', x: 0.55 }, { type: 'cat', on: 'roof' }, { type: 'cat', on: 'sill' }, { type: 'bookstand', x: 1.25 },
      ],
    },
    int: {
      size: [4, 3],
      floor: { type: 'wood', a: '#d8b583', b: '#c9a372' },
      wall: { mat: 'plaster', color: '#efe3cf' },
      items: [
        { type: 'bookshelf', wall: 'x', at: 1.4, len: 2.4 },
        { type: 'bookshelf', wall: 'z', at: 1.0, len: 1.6 },
        { type: 'window', wall: 'z', at: 2.8 },
        { type: 'counter', at: [3.1, 0.75], len: 1.4, color: '#5b8a6a', on: 'coffee' },
        { type: 'rug', at: [1.8, 1.9], size: [1.8, 1.2], color: '#b5533c' },
        { type: 'sofa', at: [1.0, 2.3], color: '#5b8a6a' },
        { type: 'table', at: [1.9, 1.9], color: '#8a6a4a' },
        { type: 'chair', at: [2.6, 1.9], color: '#8a6a4a' },
        { type: 'catbed', at: [3.3, 2.4] },
        { type: 'cat', at: [2.0, 1.95], on: 'table' },
        { type: 'pendant', at: [1.9, 1.9], color: '#ffe0a0' },
        { type: 'plant', at: [0.4, 2.6] },
      ],
    },
  },
  goods: {
    line: '네온 간판 번쩍이는 격투 굿즈 상점',
    ext: {
      size: [2.4, 1.8], floors: 1,
      wall: { mat: 'brick', color: '#3b3f52' }, trim: '#1d1f2a',
      roof: { type: 'flat', color: '#2a2d3a' },
      front: { type: 'glass', door: '#ff4fa3' },
      sign: { text: 'KO 굿즈', place: 'roof', bg: '#14151f', fg: '#ff4fa3', glow: true },
      neon: '#4fe3ff',
      props: [
        { type: 'flag', x: -1.15, color: '#ff4fa3' }, { type: 'crate', x: 1.2 }, { type: 'glove', on: 'roof', color: '#e23b3b' },
        { type: 'standee', x: -0.6 },
      ],
    },
    int: {
      size: [4, 3],
      floor: { type: 'checker', a: '#2b2e3d', b: '#3a3e52' },
      wall: { mat: 'brick', color: '#3b3f52' },
      items: [
        { type: 'shelf', at: [1.6, 0.2], len: 2.6, goods: 'figures' },
        { type: 'shelf', wall: 'x', at: 1.5, len: 2.2, goods: 'gloves' },
        { type: 'case', at: [2.0, 1.6] },
        { type: 'counter', at: [3.3, 1.0], len: 1.2, color: '#ff4fa3', on: 'register', rot: 90 },
        { type: 'bag', at: [1.0, 2.3] },
        { type: 'poster', wall: 'z', at: 3.3, text: 'KO!', color: '#ff4fa3' },
        { type: 'neon', wall: 'x', at: 2.6, color: '#4fe3ff' },
        { type: 'pendant', at: [2.0, 1.6], color: '#c8f4ff' },
      ],
    },
  },
};
