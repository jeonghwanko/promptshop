// The game UI skin: pixel frames drawn in code (9-slice border images), the Galmuri pixel font, and component rules.
// Two directions to compare: 'wood' (wooden signboard and parchment) and 'sea' (cream boards with a navy rim).

const THEMES = {
  wood: { out: '#2b1e15', rim: '#7a4e2b', rim2: '#a9733f', hi: '#d7a565', fill: '#f4e4c1', fill2: '#ead3a4', ink: '#3a2716', dim: '#7a5f43', accent: '#3f7a74',
    btn: { gold: ['#f2c12e', '#c48a1a', '#ffe48a'], wood: ['#a9733f', '#6b4526', '#d7a565'], red: ['#d9483b', '#9e2f27', '#f28a7a'], paper: ['#f4e4c1', '#c9ab78', '#fff6dc'], green: ['#5fae4e', '#3d7f36', '#9fd98a'] },
    dock: ['#5a3a22', '#3b2516', '#7a4e2b'], hud: ['#f4e4c1', '#c9ab78', '#fff6dc'] },
  sea: { out: '#1d2a44', rim: '#2f5d8a', rim2: '#4f86b8', hi: '#9fd0f0', fill: '#fbf6ea', fill2: '#eaf2f6', ink: '#1d2a44', dim: '#5b6b85', accent: '#2f8f9a',
    btn: { gold: ['#f2c12e', '#c48a1a', '#ffe48a'], wood: ['#4f86b8', '#2f5d8a', '#9fd0f0'], red: ['#e2685a', '#a8423a', '#f6a89c'], paper: ['#fbf6ea', '#b9c8d6', '#ffffff'], green: ['#4fb39a', '#2f7f6c', '#9fe2cf'] },
    dock: ['#2f5d8a', '#1d2a44', '#4f86b8'], hud: ['#fbf6ea', '#b9c8d6', '#ffffff'] },
};

// a 12×12 frame: notched corners, 1px outline, 2px rim with a lit top edge, then the fill
function frame(t, fill, rimDark, rimLight) {
  const c = document.createElement('canvas'); c.width = 12; c.height = 12; const g = c.getContext('2d');
  const px = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
    const e = Math.min(x, y, 11 - x, 11 - y), corner = (x === 0 || x === 11) && (y === 0 || y === 11);
    if (corner) continue;
    if (e === 0 || ((x === 1 || x === 10) && (y === 1 || y === 10))) px(x, y, t.out);
    else if (e <= 2) px(x, y, y <= 2 && e === y ? rimLight : rimDark);
    else px(x, y, fill);
  }
  return c.toDataURL();
}
// a button face: outline, a lit top line, and a darker lip along the bottom
function button([face, lip, light], out) {
  const c = document.createElement('canvas'); c.width = 12; c.height = 12; const g = c.getContext('2d');
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
    const corner = (x === 0 || x === 11) && (y === 0 || y === 11); if (corner) continue;
    const e = Math.min(x, y, 11 - x);
    g.fillStyle = e === 0 || y === 11 ? out : y >= 9 ? lip : y === 1 ? light : face; g.fillRect(x, y, 1, 1);
  }
  return c.toDataURL();
}

export function applyTheme(name = 'wood') {
  const t = THEMES[name] ?? THEMES.wood;
  document.body.classList.remove('t-wood', 't-sea'); document.body.classList.add('t-game', 't-' + name);
  const v = {
    '--ui-panel': `url(${frame(t, t.fill, t.rim, t.hi)})`, '--ui-card': `url(${frame(t, t.fill2, t.rim2, t.fill)})`,
    '--ui-hud': `url(${frame(t, t.hud[0], t.hud[1], t.hud[2])})`, '--ui-dock': `url(${frame(t, t.dock[0], t.dock[1], t.dock[2])})`,
    '--ui-ink': t.ink, '--ui-dim': t.dim, '--ui-out': t.out, '--ui-accent': t.accent, '--ui-fill': t.fill,
  };
  for (const [k, c] of Object.entries(t.btn)) v[`--ui-btn-${k}`] = `url(${button(c, t.out)})`;
  for (const [k, val] of Object.entries(v)) document.body.style.setProperty(k, val);
  if (!document.getElementById('ui-theme')) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://cdn.jsdelivr.net/npm/galmuri@2.40.3/dist/galmuri.css'; document.head.append(l);
    const st = document.createElement('style'); st.id = 'ui-theme'; st.textContent = CSS; document.head.append(st);
  }
}

const F = '"Galmuri11", "Noto Sans KR", sans-serif';
const frameRule = (v, w = 9) => `border:${w}px solid transparent; border-image:${v} 4 fill / ${w}px / 0 stretch; image-rendering:pixelated; background:none; border-radius:0;`;
const CSS = `
.t-game { --f-disp:${F}; }
.t-game .pxi { image-rendering:pixelated; vertical-align:middle; }
.t-game .pxi.inl { margin:0 2px; position:relative; top:-1px; }
/* boards and cards */
.t-game .panel, .t-game .ibox, .t-game .world .wcard, .t-game .cards .rcard { ${frameRule('var(--ui-panel)', 12)} box-shadow:none; color:var(--ui-ink); }
.t-game .panel { top:112px; padding:4px 6px; filter:drop-shadow(0 6px 0 rgba(0,0,0,.25)); }
.t-game .ibox { padding:4px 8px; filter:drop-shadow(0 8px 0 rgba(0,0,0,.3)); }
.t-game .card { ${frameRule('var(--ui-card)', 9)} box-shadow:none; padding:4px 6px; }
.t-game .card.alert { filter:drop-shadow(0 0 0 var(--ui-accent)); outline:2px dashed var(--ui-accent); outline-offset:1px; }
.t-game h2, .t-game h3, .t-game .panel h2, .t-game .ibox h2, .t-game .world .wcard h2 { font-family:${F}; font-weight:400; letter-spacing:-.5px; color:var(--ui-ink); }
.t-game .note { color:var(--ui-dim); }
/* HUD */
.t-game .pill { ${frameRule('var(--ui-hud)', 9)} box-shadow:none; padding:0 6px; font-family:${F}; filter:drop-shadow(0 4px 0 rgba(0,0,0,.25)); }
.t-game .isle { font-size:16px; } .t-game .coins { font-family:${F}; font-size:22px; color:#9a6a10; } .t-game .coins i { background:none; box-shadow:none; width:auto; height:auto; } .t-game .coins i .pxi { width:24px; height:24px; }
.t-game .lv { font-family:${F}; font-weight:400; border-radius:0; box-shadow:0 0 0 2px var(--ui-out); background:var(--ui-accent); }
.t-game .gauge { border-radius:0; box-shadow:0 0 0 2px var(--ui-out); background:#d9c49a; height:8px; } .t-game .gauge i { border-radius:0; }
.t-game .want { border-radius:0; box-shadow:0 0 0 2px var(--ui-out); font-family:${F}; font-size:12px; } .t-game .want.none { box-shadow:0 0 0 2px #c0392b; }
.t-game .want .dot { border-radius:0; box-shadow:0 0 0 1px var(--ui-out); width:12px; height:12px; }
/* buttons */
.t-game button:not(.spot):not(.bubble):not(.wrow) { font-family:${F}; font-weight:400; color:var(--ui-ink); box-shadow:none; border-radius:0; ${frameRule('var(--ui-btn-paper)', 6)} padding:2px 8px 6px; }
.t-game button.gold, .t-game .fixbtn.gold { border-image-source:var(--ui-btn-gold) !important; color:#3a2400; }
.t-game button:not(.ghost):not(.gold):not(.warn):not(.on) { }
.t-game button.warn { border-image-source:var(--ui-btn-red) !important; color:#fff; }
.t-game button.ghost { border-image-source:var(--ui-btn-paper); color:var(--ui-ink); }
.t-game button.on { border-image-source:var(--ui-btn-wood) !important; color:#fff; }
.t-game .panel > button:not(.ghost):not(.gold):not(.warn), .t-game .row > button:not(.ghost):not(.gold):not(.warn), .t-game .slots button:not(.ghost) { border-image-source:var(--ui-btn-green); color:#fff; }
.t-game button:active:not(:disabled) { transform:translateY(2px); }
.t-game button:disabled { opacity:.5; filter:grayscale(.6); }
.t-game .panel .x { padding:0 6px 4px; }
.t-game .chips button { font-size:12px; padding:0 6px 4px; }
.t-game input[type=text] { border-radius:0; border:none; box-shadow:0 0 0 2px var(--ui-out), inset 0 2px 0 rgba(0,0,0,.12); background:#fffaf0; font-family:"Noto Sans KR", sans-serif; }
/* dock */
.t-game .dock { ${frameRule('var(--ui-dock)', 12)} box-shadow:none; padding:0 4px; filter:drop-shadow(0 6px 0 rgba(0,0,0,.3)); border-radius:0; }
.t-game .dock button { border:none; border-image:none; background:none; color:#fbeed2; font-size:12px; padding:4px 8px; min-width:66px; }
.t-game .dock button .ic { font-size:0; line-height:0; } .t-game .dock button .pxi { width:32px; height:32px; }
.t-game .dock button.on { border-image-source:var(--ui-btn-gold) !important; color:#3a2400; }
.t-game .dock button .badge { border-radius:0; box-shadow:0 0 0 2px var(--ui-out); font-family:${F}; font-weight:400; }
.t-game .dock .sizes button { border:6px solid transparent; border-image:var(--ui-btn-paper) 4 fill / 6px / 0 stretch; color:var(--ui-ink); min-width:52px; padding:0 6px 4px; }
.t-game .dock .sizes button.on { border-image-source:var(--ui-btn-gold); }
/* toast, celebration, cards, guide */
.t-game .toast { border-radius:0; ${frameRule('var(--ui-dock)', 9)} color:#fbeed2; font-family:${F}; padding:0 8px; }
.t-game .celebrate { ${frameRule('var(--ui-btn-gold)', 12)} box-shadow:none; filter:drop-shadow(0 8px 0 rgba(0,0,0,.3)); font-family:${F}; padding:4px 18px 10px; }
.t-game .celebrate b { font-family:${F}; font-size:28px; }
.t-game .cards h2 { font-family:${F}; }
.t-game .rcard { width:210px; gap:4px; padding:6px 8px; } .t-game .rcard b { font-family:${F}; font-weight:400; } .t-game .rcard .big .pxi { width:48px; height:48px; }
.t-game .rcard .prize { border-radius:0; box-shadow:0 0 0 2px var(--ui-out); font-family:${F}; font-weight:400; }
.t-game .rcard.free { filter:saturate(.6); }
.t-game .gbub { ${frameRule('var(--ui-hud)', 9)} box-shadow:none; filter:drop-shadow(0 5px 0 rgba(0,0,0,.25)); padding:2px 8px; }
.t-game .gbub::before { display:none; } .t-game .gname { font-family:${F}; }
.t-game .gbird { font-size:0; } .t-game .gbird .pxi { width:64px; height:64px; }
.t-game .garrow { font-size:0; } .t-game .garrow::before { content:''; display:block; width:0; height:0; border:14px solid transparent; border-top:18px solid #f2c12e; filter:drop-shadow(0 0 0 #2b1e15) drop-shadow(0 3px 0 #2b1e15); }
/* inside, world */
.t-game .istats, .t-game .ihint { font-family:${F}; }
.t-game .stars { font-size:0; } .t-game .stars .pxi { width:18px; height:18px; margin:0 -1px; }
.t-game .checks span { border-radius:0; box-shadow:0 0 0 1px var(--ui-out); }
.t-game .wzoom button { padding:0 8px 4px; }
.t-game .bubble { border-radius:0; border:none; box-shadow:0 0 0 3px var(--ui-out), 0 4px 0 3px rgba(0,0,0,.3); font-family:${F}; }
.t-game .bubble.mine { box-shadow:0 0 0 3px var(--ui-out), 0 4px 0 3px rgba(0,0,0,.3); }
.t-game .bubble .where, .t-game .spot .tag { border-radius:0; box-shadow:0 0 0 2px var(--ui-out); font-family:${F}; }
.t-game .spot .pin { border-radius:0; box-shadow:0 0 0 2px var(--ui-out); border:2px solid #fff; animation:none; }
.t-game .wrow { border:none; border-image:none; background:#fffaf0; box-shadow:0 0 0 2px var(--ui-out); padding:4px 8px; font-family:"Noto Sans KR", sans-serif; }
.t-game .wrow.mine { background:#f6e2b0; }
`;
