// The guests who ask for something: one simple pixel face per kind of guest (food, cafe, shop, fun, rest),
// 10×10 pixels drawn as an inline SVG on a tile of its own colour. A view: it draws what it is given.

const KIND = {
  food: { bg: '#f6c9a8', hair: '#3b2a20', shirt: '#d9573f' },
  cafe: { bg: '#e9d6b9', hair: '#7a4a2a', shirt: '#8a5a36' },
  shop: { bg: '#bfdcef', hair: '#1f1f2a', shirt: '#3d7fa6' },
  fun: { bg: '#f2b8c6', hair: '#e0a33a', shirt: '#7a4fb0' },
  rest: { bg: '#cfe6bf', hair: '#9a9a9a', shirt: '#3f7a74' },
};

const svg = (k) => `<svg viewBox="0 0 10 10" shape-rendering="crispEdges" aria-hidden="true">`
  + `<rect x="2" y="0" width="6" height="2" fill="${k.hair}"/><rect x="1" y="1" width="1" height="3" fill="${k.hair}"/><rect x="8" y="1" width="1" height="3" fill="${k.hair}"/>`
  + `<rect x="2" y="2" width="6" height="4" fill="#f6d2b8"/><rect x="3" y="3" width="1" height="1" fill="#2e241a"/><rect x="6" y="3" width="1" height="1" fill="#2e241a"/>`
  + `<rect x="4" y="5" width="2" height="1" fill="#c0392b"/><rect x="2" y="6" width="6" height="4" fill="${k.shirt}"/></svg>`;

/** A face tile for a kind of guest; null (or an unknown kind) gives the pencil tile for "anything I like". */
export function faceEl(need) {
  const e = document.createElement('span'), k = KIND[need];
  e.className = 'face' + (k ? '' : ' free');
  if (k) { e.style.background = k.bg; e.innerHTML = svg(k); }
  else e.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19l1-5L16 4l4 4L10 18z" fill="#ffd166" stroke="#2e241a" stroke-width="2" stroke-linejoin="round"/><path d="M5 19l5-1" stroke="#2e241a" stroke-width="2"/></svg>';
  return e;
}
