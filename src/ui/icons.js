// Pixel icons for the game UI: 14×14 hand-drawn maps, given the same 1px dark outline as the buildings,
// so every icon reads as part of one set. iconCanvas() for canvas drawing, iconURL() for <img>.

const PAL = {
  Y: '#f2c12e', y: '#c48a1a', W: '#fff8e8', R: '#d9483b', r: '#9e2f27', B: '#3f8fc0', b: '#2b6a96', G: '#5fae4e', g: '#3d7f36',
  N: '#a8743f', n: '#6b4526', S: '#c9c3b8', s: '#7d776e', P: '#ef7aa0', O: '#f08a3a', T: '#3f9a8e', C: '#f3dcb0', L: '#a8dcf0', V: '#8e6ac8',
};
const OUT = '#2b1e15';
const I = {
  bolt: ['.......YYYy...', '......YYYy....', '.....YYYy.....', '....YYYy......', '...YYYy.......', '..YYYYYYYYy...', '...yyYYYYy....', '.....YYYy.....', '....YYYy......', '...YYYy.......', '..YYy.........', '.Yy...........', '..............', '..............'],
  drop: ['......B.......', '.....BBB......', '.....BBB......', '....BBBBB.....', '...BBBBBBB....', '...BLBBBBB....', '..BBLBBBBBB...', '..BLBBBBBBB...', '..BLBBBBBBb...', '..BBBBBBBBb...', '...BBBBBBb....', '....bbbbb.....', '..............', '..............'],
  coin: ['....yyyyyy....', '..yyYYYYYYyy..', '.yYYWWYYYYYYy.', '.yYWYYyyyyYYy.', 'yYYWYyYYYYyYYy', 'yYYYyYYYYYYYYy', 'yYYYyYYYYYYYYy', 'yYYYyYYYYYYYYy', 'yYYYyYYYYYyYYy', '.yYYYyyyyyYYy.', '.yYYYYYYYYYYy.', '..yyYYYYYYyy..', '....yyyyyy....', '..............'],
  ticket: ['..............', '..............', 'OOOOOOOOOOOOOO', 'OYYYYYYYYYYYYO', 'OYWWWWWYYsYYYO', '.YYYYYYYYYYYY.', '.YWWWWYYYsYYY.', 'OYYYYYYYYYYYYO', 'OYWWWYYYYsYYYO', 'OYYYYYYYYYYYYO', 'OOOOOOOOOOOOOO', '..............', '..............', '..............'],
  boat: ['......R.......', '......RR......', '......W.......', '.....WWW......', '....WWWWW.....', '...WWWWWWW....', '..WWWWWWWWW...', '......n.......', 'NNNNNNNNNNNNNN', '.NNnnnnnnnnNN.', '..NNNNNNNNNN..', '...LLLLLLLL...', '..L.LL..LL.L..', '..............'],
  horn: ['..............', '...........OO.', '.........OOOO.', '.......OOOOOO.', '.ssOOOOOOOYOO.', '.sWOOOOOOOYOO.', '.sWOOOOOOOYOO.', '.ssOOOOOOOYOO.', '.......OOOOOO.', '.........OOOO.', '...ss......OO.', '...ss.........', '..............', '..............'],
  hammer: ['..............', '...ssssss.....', '..sSSSSSSs....', '..sSSSSSSSss..', '..sSSSSSSs....', '...sssNNs.....', '......NN......', '......NN......', '......NN......', '......NN......', '......NN......', '......NN......', '......nn......', '..............'],
  island: ['....GGG.......', '..GGgGGGG.....', '.GG..NGGGG....', '.....N..GG....', '.....N........', '.....N........', '......N.......', '......N.......', '....CCCCCC....', '..CCCCCCCCCC..', '.LLCCCCCCCCLL.', 'LLLLLLLLLLLLLL', '.BBBBBBBBBBBB.', '..............'],
  gear: ['......ss......', '...s..SS..s...', '..sSs.SS.sSs..', '...sSSSSSSs...', '....SSssSS....', '.ssSSsYYsSSss.', '.SSSSsYYsSSSS.', '..sSSSssSSSs..', '...sSSSSSSs...', '..sSs.SS.sSs..', '...s..SS..s...', '......ss......', '..............', '..............'],
  map: ['..............', '.CCCC.CCCC.CC.', '.CGGCCCBBCCCC.', '.CGGGCCCBCCGC.', '.CCGCCRCCBCGC.', '.CCCCCRRCCBCC.', '.CBBCCCRCCCCC.', '.CCBBCCCCGGCC.', '.CCCBCCCGGGCC.', '.CCCCCCCCCCCC.', '.CC.CCCC.CCCC.', '..............', '..............', '..............'],
  globe: ['....bbbbbb....', '..bbBBGGBBbb..', '.bBBGGGGBBBBb.', '.bBGGGGBBBGGb.', 'bBBBGGBBBGGGBb', 'bBBBBGBBBBGGBb', 'bBBBBBBBBBGBBb', 'bBBGGBBBBBBBBb', 'bBGGGGBBBBBBBb', '.bBGGBBBBGBBb.', '.bBBBBBBGGBBb.', '..bbBBBBBBbb..', '....bbbbbb....', '..............'],
  star: ['......YY......', '......YY......', '.....YYYY.....', '.....YYYY.....', 'YYYYYYWYYYYYYY', '.YYYYWYYYYYYy.', '..YYYYYYYYYy..', '...YYYYYYYy...', '...YYYYYYYy...', '..YYYYyyYYYy..', '..YYYy..yYYy..', '.YYy......yYy.', '.Yy........yy.', '..............'],
  crown: ['..............', '..............', '.P....Y.....P.', '.YY..YYY...YY.', '.YYY.YYY..YYY.', '.YYYYYYYYYYYY.', '.YYYYYYYYYYYY.', '.YRYYYBYYYRYY.', '.YYYYYYYYYYYY.', '.yyyyyyyyyyyy.', '..............', '..............', '..............', '..............'],
  box: ['..............', '...NNNNNNNN...', '..NCCCCCCCCN..', '.NNNNNNNNNNNN.', '.NCCCCNNCCCCN.', '.NCCCCNNCCCCN.', '.NCCCCCCCCCCN.', '.NCCCCCCCCCCN.', '.NnnnnnnnnnnN.', '.NCCCCCCCCCCN.', '.NNNNNNNNNNNN.', '..............', '..............', '..............'],
  chair: ['..............', '...NNNNNNN....', '...NnnnnnN....', '...NnnnnnN....', '...NnnnnnN....', '...NNNNNNN....', '...N.....N....', '..NNNNNNNNN...', '..nnnnnnnnn...', '..N.......N...', '..N.......N...', '..N.......N...', '..n.......n...', '..............'],
  up: ['......GG......', '.....GGGG.....', '....GGGGGG....', '...GGGGGGGG...', '..GGGGGGGGGG..', '.GGGGGGGGGGGG.', '....GGGGGG....', '....GGGGGG....', '....GGGGGG....', '....GGGGGG....', '....gggggg....', '..............', '..............', '..............'],
  extend: ['.....GG.......', '....GGGG......', '...GGGGGG.....', '.....GG.......', '..RRRRRRRRR...', '..CCCCCCCCC...', '..CLLCCCLLC...', '..CCCCCCCCC...', '..sssssssss...', '..CCCCCCCCC...', '..CLLCCCLLC...', '..CCCnnCCCC...', '..CCCnnCCCC...', '..............'],
  move: ['......WW......', '.....WWWW.....', '......WW......', '......WW......', '..W...WW...W..', '.WWWWWWWWWWWW.', '.WWWWWWWWWWWW.', '..W...WW...W..', '......WW......', '......WW......', '.....WWWW.....', '......WW......', '..............', '..............'],
  helper: ['....WWWW......', '...WWWWWW.....', '...WWWWWW.....', '....sssss.....', '....CCCC......', '....CnCn......', '....CCCC......', '...RWWWWR.....', '..RRWWWWRR....', '..CRWWWWRC....', '...RWWWWR.....', '....bb.bb.....', '....bb.bb.....', '..............'],
  sprout: ['..............', '..GG....GG....', '.GGGG..GGGG...', '.GGgGGGGgGG...', '..GGGgGgGG....', '.....gG.......', '......G.......', '......G.......', '...NNNNNNNN...', '..NnNNNNnNNN..', '..NNNNnNNNNN..', '...NNNNNNNN...', '..............', '..............'],
  lock: ['....ssssss....', '...s......s...', '...s......s...', '...s......s...', '..YYYYYYYYYY..', '..YYYYYYYYYY..', '..YYYYnnYYYY..', '..YYYYnnYYYY..', '..YYYYYnYYYY..', '..YYYYYYYYYY..', '..yyyyyyyyyy..', '..............', '..............', '..............'],
  check: ['..............', '...........GG.', '..........GGG.', '.........GGG..', '........GGG...', '.GG....GGG....', '.GGG..GGG.....', '..GGGGGG......', '...GGGG.......', '....GG........', '..............', '..............', '..............', '..............'],
  food: ['...s..s..s....', '..s..s..s.....', '...s..s..s....', '..............', '.WWWWWWWWWWWW.', '.OYYYYOYYYYYO.', '.ROOOOOOOOOOR.', '.RRRRRRRRRRRR.', '..RrRRRRRRrR..', '...RRRRRRRR...', '.....rrrr.....', '..............', '..............', '..............'],
  cafe: ['..s..s........', '...s..s.......', '..s..s........', '..............', '.WWWWWWWW.....', '.WnnnnnnWWWW..', '.WWWWWWWW..W..', '.WWWWWWWW..W..', '.WWWWWWWWWWW..', '..WWWWWW......', '...WWWW.......', '.NNNNNNNNN....', '..............', '..............'],
  bag: ['.....nnnn.....', '....n....n....', '....n....n....', '..BBBBBBBBBB..', '..BBBBBBBBBB..', '..BBWWWWBBBB..', '..BBWBBWBBBB..', '..BBWWWWBBBB..', '..BBBBBBBBBB..', '..BBBBBBBBBB..', '..bbbbbbbbbb..', '..............', '..............', '..............'],
  pin: ['......WW......', '.....WWWW.....', '.....WWWW.....', '......WW......', '......RR......', '.....WWWW.....', '....WWWWWW....', '...WWWWWWWW...', '...WWWWWWWW...', '...WWWWWWWW...', '....WWWWWW....', '.....WWWW.....', '..............', '..............'],
  bed: ['..............', '..............', '.N............', '.NWW..........', '.NWWBBBBBBBBB.', '.NBBBBBBBBBBB.', '.NBBBBBBBBBBB.', '.NNNNNNNNNNNN.', '.N..........N.', '..............', '..............', '..............', '..............', '..............'],
  people: ['..............', '...CC....CC...', '..CCCC..CCCC..', '..CCCC..CCCC..', '...CC....CC...', '..RRRR..BBBB..', '.RRRRRRBBBBBB.', '.RRRRRRBBBBBB.', '.RRRRRRBBBBBB.', '..............', '..............', '..............', '..............', '..............'],
  clock: ['....ssssss....', '..ssWWWWWWss..', '.sWWWWnWWWWWs.', '.sWWWWnWWWWWs.', 'sWWWWWnWWWWWWs', 'sWWWWWnnnnWWWs', 'sWWWWWWWWWWWWs', '.sWWWWWWWWWWs.', '.sWWWWWWWWWWs.', '..ssWWWWWWss..', '....ssssss....', '..............', '..............', '..............'],
  heart: ['..............', '..RRR...RRR...', '.RRWRR.RRRRR..', '.RWRRRRRRRRR..', '.RRRRRRRRRRR..', '..RRRRRRRRR...', '...RRRRRRR....', '....RRRRR.....', '.....RRR......', '......R.......', '..............', '..............', '..............', '..............'],
  door: ['...nnnnnnnn...', '...nNNNNNNn...', '...nNNNNNNn...', '...nNnNNnNn...', '...nNNNNNNn...', '...nNNNNNNn...', '...nNNNNYNn...', '...nNNNNNNn...', '...nNnNNnNn...', '...nNNNNNNn...', '...nNNNNNNn...', '..ssssssssss..', '..............', '..............'],
  receipt: ['...WWWWWWWW...', '...WWWWWWWW...', '...WssssssW...', '...WWWWWWWW...', '...WsssssWW...', '...WWWWWWWW...', '...WssssssW...', '...WWWWWWWW...', '...WWWWsssW...', '...WWWWWWWW...', '...W.WW.WW.W..', '..............', '..............', '..............'],
  moneybag: ['.....nnnn.....', '......nn......', '.....NNNN.....', '....NNNNNN....', '...NNNYYNNN...', '..NNNNYNNNNN..', '..NNNNYYNNNN..', '..NNNNNYNNNN..', '..NNNNYYNNNN..', '...NNNNNNNN...', '....nnnnnn....', '..............', '..............', '..............'],
  swap: ['..............', '.........W....', '.........WW...', '.WWWWWWWWWWW..', '.........WW...', '.........W....', '..............', '....W.........', '...WW.........', '..WWWWWWWWWWW.', '...WW.........', '....W.........', '..............', '..............'],
  gull: ['..............', '.....WWWW.....', '....WWWWWW....', '....WnWWWWO...', '....WWWWWWOO..', '.....WWWW.....', '..sWWWWWWWW...', '.ssWWWWWWWWs..', 'sssWWWWWWWss..', '.ssWWWWWWWs...', '...WWWWWWW....', '....O...O.....', '...OO..OO.....', '..............'],
  warn: ['......OO......', '.....OOOO.....', '.....OnnO.....', '....OOnnOO....', '....OOnnOO....', '...OOOnnOOO...', '...OOOnnOOO...', '..OOOOOOOOOO..', '..OOOOnnOOOO..', '.OOOOOOOOOOOO.', '.OOOOOOOOOOOO.', '..............', '..............', '..............'],
  close: ['..............', '..RR......RR..', '..RRR....RRR..', '...RRR..RRR...', '....RRRRRR....', '.....RRRR.....', '.....RRRR.....', '....RRRRRR....', '...RRR..RRR...', '..RRR....RRR..', '..RR......RR..', '..............', '..............', '..............'],
  star0: ['......ss......', '......ss......', '.....sSSs.....', '.....sSSs.....', 'sssssSSSSsssss', '.sSSSSSSSSSSs.', '..sSSSSSSSSs..', '...sSSSSSSs...', '...sSSSSSSs...', '..sSSSssSSSs..', '..sSs....sSs..', '.ss........ss.', '.s..........s.', '..............'],
  pencil: ['..........rr..', '.........rRRr.', '........YYrRr.', '.......YYYYr..', '......YYYYY...', '.....YYYYY....', '....YYYYY.....', '...YYYYY......', '..CYYYY.......', '..CCYY........', '..sCC.........', '..ss..........', '..............', '..............'],
};
export const ICON_NAMES = Object.keys(I);

const cache = new Map();
/** A 16×16 canvas of the icon with its outline (or null for an unknown name). */
export function iconCanvas(name) {
  if (cache.has(name)) return cache.get(name);
  const rows = I[name]; if (!rows) return null;
  const c = document.createElement('canvas'); c.width = 16; c.height = 16; const g = c.getContext('2d');
  const at = (x, y) => (rows[y - 1] ?? '')[x - 1] ?? '.';
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const ch = at(x, y);
    if (ch !== '.' && ch !== undefined && PAL[ch]) { g.fillStyle = PAL[ch]; g.fillRect(x, y, 1, 1); continue; }
    // outline: an empty pixel next to a filled one
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const k = at(x + dx, y + dy); return k !== '.' && k !== undefined && PAL[k]; })) { g.fillStyle = OUT; g.fillRect(x, y, 1, 1); }
  }
  cache.set(name, c); return c;
}
const urls = new Map();
export function iconURL(name) { if (!urls.has(name)) { const c = iconCanvas(name); urls.set(name, c ? c.toDataURL() : ''); } return urls.get(name); }
/** An <img> of the icon, `px` CSS pixels tall (a multiple of 16 stays crisp). */
export function iconEl(name, px = 32, cls = 'pxi') {
  const im = document.createElement('img'); im.src = iconURL(name); im.className = cls; im.alt = ''; im.width = px; im.height = px; im.draggable = false; return im;
}

// Emoji the game already writes in its text, and the icon that replaces each one on screen.
export const EMOJI = {
  '🎫': 'ticket', '⛵': 'boat', '📣': 'horn', '👑': 'crown', '🌱': 'sprout', '🏗️': 'hammer', '🏗': 'hammer', '⬆': 'up', '↔': 'move', '⇄': 'swap',
  '🍜': 'food', '☕': 'cafe', '🛍️': 'bag', '🛍': 'bag', '🎳': 'pin', '🛏️': 'bed', '🛏': 'bed', '✏️': 'pencil', '✏': 'pencil', '🧑‍🍳': 'helper', '🐦': 'gull',
  '🚪': 'door', '🧾': 'receipt', '🪑': 'chair', '💰': 'moneybag', '🎉': 'star', '🏝️': 'island', '🏝': 'island', '🛋️': 'gear', '🛋': 'gear', '🗺️': 'map', '🗺': 'map',
  '🌏': 'globe', '★': 'star', '☆': 'star0', '✓': 'check', '🔒': 'lock', '✕': 'close', '¢': 'coin', '⚡': 'bolt', '💧': 'drop',
};
const EMOJI_SRC = Object.keys(EMOJI).sort((a, b) => b.length - a.length).map(e => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
const EMOJI_RE = new RegExp(EMOJI_SRC, 'g'), EMOJI_HAS = new RegExp(EMOJI_SRC);
/** Replace emoji in the text nodes under `root` with pixel icons, now and whenever the DOM changes. */
export function pixelIcons(root = document.body, size = 18) {
  const swap = (node) => {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, { acceptNode: (t) => EMOJI_HAS.test(t.data) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
    const list = []; for (let t = walker.nextNode(); t; t = walker.nextNode()) list.push(t);
    for (const t of list) {
      if (t.parentElement?.closest('script, style, input, textarea, [data-noicons]')) continue;
      const frag = document.createDocumentFragment(); let last = 0; EMOJI_RE.lastIndex = 0;
      for (const m of t.data.matchAll(EMOJI_RE)) { frag.append(t.data.slice(last, m.index)); const big = t.parentElement?.closest('[data-icon-size]')?.dataset.iconSize; frag.append(iconEl(EMOJI[m[0]], +(big ?? size), 'pxi inl')); last = m.index + m[0].length; }
      frag.append(t.data.slice(last)); t.replaceWith(frag);
    }
  };
  swap(root);
  new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) swap(n); else if (n.nodeType === 3 && n.parentNode) swap(n.parentNode); }).observe(root, { childList: true, subtree: true, characterData: false });
}
