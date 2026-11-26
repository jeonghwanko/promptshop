// Spec (JSON) -> three.js scene. The renderer fixes camera, grid and light; a spec only chooses shape, color and props.
import * as THREE from 'three';

const shade = (hex, k) => { const c = new THREE.Color(hex); c.multiplyScalar(k); return '#' + c.getHexString(); };
const tex = (w, h, draw) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.imageSmoothingEnabled = false; draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
};
const mat = (color, o = {}) => new THREE.MeshLambertMaterial({ color, ...o });
const texMat = (t, rx = 1, ry = 1, o = {}) => { const tt = t.clone(); tt.needsUpdate = true; tt.repeat.set(rx, ry); return mat(0xffffff, { map: tt, ...o }); };
const glowMat = (color) => new THREE.MeshBasicMaterial({ color });

// ---------- material textures ----------
const T = {
  plank: (base) => tex(32, 32, (g, w, h) => { g.fillStyle = base; g.fillRect(0, 0, w, h); g.fillStyle = shade(base, .78); for (let i = 1; i < 6; i++) g.fillRect(Math.round(i * w / 6), 0, 1, h); }),
  plankH: (base) => tex(32, 32, (g, w, h) => { g.fillStyle = base; g.fillRect(0, 0, w, h); g.fillStyle = shade(base, .8); for (let i = 1; i < 6; i++) g.fillRect(0, Math.round(i * h / 6), w, 1); }),
  plaster: (base) => tex(32, 32, (g, w, h) => { g.fillStyle = base; g.fillRect(0, 0, w, h); let s = 7; const r = () => (s = (s * 9301 + 49297) % 233280) / 233280; g.fillStyle = shade(base, .93); for (let i = 0; i < 26; i++) g.fillRect(Math.floor(r() * w), Math.floor(r() * h), 1, 1); }),
  brick: (base) => tex(32, 16, (g, w, h) => { g.fillStyle = base; g.fillRect(0, 0, w, h); g.fillStyle = shade(base, .72);
    for (let y = 0; y < h; y += 4) { g.fillRect(0, y, w, 1); for (let x = (y / 4) % 2 ? 4 : 0; x < w; x += 8) g.fillRect(x, y, 1, 4); }
    g.fillStyle = shade(base, 1.15); for (let y = 1; y < h; y += 4) for (let x = (y % 8 < 4 ? 1 : 5); x < w; x += 8) g.fillRect(x, y, 3, 1); }),
  roofTile: (base) => tex(24, 24, (g, w, h) => { g.fillStyle = base; g.fillRect(0, 0, w, h); g.fillStyle = shade(base, .78);
    for (let y = 5; y < h; y += 6) g.fillRect(0, y, w, 1); for (let y = 0; y < h; y += 6) for (let x = (y / 6) % 2 ? 3 : 0; x < w; x += 6) g.fillRect(x, y, 1, 5);
    g.fillStyle = shade(base, 1.18); for (let y = 0; y < h; y += 6) g.fillRect(0, y, w, 1); }),
  shingle: (base) => tex(24, 24, (g, w, h) => { g.fillStyle = base; g.fillRect(0, 0, w, h); g.fillStyle = shade(base, .8);
    for (let y = 0; y < h; y += 4) { g.fillRect(0, y + 3, w, 1); for (let x = (y / 4) % 2 ? 2 : 0; x < w; x += 4) g.fillRect(x, y, 1, 3); } }),
  stripes: (a, b) => tex(48, 16, (g, w, h) => { const n = 6, sw = w / n; for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(i * sw, 0, sw, h - 4);
    for (let x = 0; x < sw; x++) { const k = (x + .5) / sw * 2 - 1; const d = Math.round(Math.sqrt(Math.max(0, 1 - k * k)) * 4); g.fillRect(i * sw + x, h - 4, 1, d); } } }),
  checker: (a, b) => tex(16, 16, (g, w, h) => { g.fillStyle = a; g.fillRect(0, 0, w, h); g.fillStyle = b; g.fillRect(0, 0, 8, 8); g.fillRect(8, 8, 8, 8); }),
  text: (text, bg, fg, w = 96, h = 28, font = 18) => tex(w, h, (g) => { g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.font = `900 ${font}px "Noto Sans CJK KR", "Noto Sans KR", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    // pixel text: snap every pixel to fg or bg (no anti-aliasing)
    g.fillStyle = fg; g.fillText(text, w / 2, h / 2 + 1);
    const d = g.getImageData(0, 0, w, h), f = new THREE.Color(fg), bc = new THREE.Color(bg);
    for (let i = 0; i < d.data.length; i += 4) { const r = d.data[i] / 255, gg = d.data[i + 1] / 255, b = d.data[i + 2] / 255;
      const df = Math.abs(r - f.r) + Math.abs(gg - f.g) + Math.abs(b - f.b), db = Math.abs(r - bc.r) + Math.abs(gg - bc.g) + Math.abs(b - bc.b);
      const c = df < db ? f : bc; d.data[i] = c.r * 255; d.data[i + 1] = c.g * 255; d.data[i + 2] = c.b * 255; d.data[i + 3] = 255; }
    g.putImageData(d, 0, 0); }),
};

// `section(key)` returns the Group that the following meshes go into, so a caller can animate one part at a time.
export function makeBuilder(scene, section) {
  let cur = scene;
  const enter = (key) => { cur = (section && section(key)) || scene; };
  const add = (o, parent) => { o.castShadow = true; o.receiveShadow = true; (parent ?? cur).add(o); return o; };
  const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y + h / 2, z); return add(o); };
  const cyl = (r1, r2, h, m, x, y, z, seg = 10) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), m); o.position.set(x, y + h / 2, z); return add(o); };
  const ball = (r, m, x, y, z) => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), m); o.position.set(x, y, z); return add(o); };
  const wallMat = (w, rx, ry) => texMat(w.mat === 'brick' ? T.brick(w.color) : w.mat === 'plaster' ? T.plaster(w.color) : T.plank(w.color), rx, ry);

  // ---------- small props (shared by exterior and interior) ----------
  const P = {
    lantern(x, y, z, color) { cyl(.005, .005, .14, mat(0x222222), x, y, z, 4); const l = cyl(.11, .11, .26, glowMat(color), x, y - .27, z, 8); cyl(.12, .12, .03, mat(0x2a1a10), x, y - .02, z, 8); cyl(.12, .12, .03, mat(0x2a1a10), x, y - .3, z, 8); return l; },
    stool(x, y, z, c = '#a8703e') { cyl(.15, .15, .05, mat(c), x, y + .42, z, 10); for (const [dx, dz] of [[-.08, -.08], [.08, -.08], [-.08, .08], [.08, .08]]) box(.03, .42, .03, mat(shade(c, .7)), x + dx, y, z + dz); },
    chair(x, y, z, c, face = 1) { box(.34, .05, .34, mat(c), x, y + .4, z); box(.34, .42, .05, mat(c), x, y + .45, z - .15 * face); for (const [dx, dz] of [[-.14, -.14], [.14, -.14], [-.14, .14], [.14, .14]]) box(.04, .4, .04, mat(shade(c, .7)), x + dx, y, z + dz); },
    plant(x, y, z, s = 1) { cyl(.16 * s, .12 * s, .26 * s, mat(0xb8643c), x, y, z, 8); ball(.24 * s, mat(0x4f8f46), x, y + .42 * s, z); ball(.17 * s, mat(0x66a95a), x + .08 * s, y + .58 * s, z + .05 * s); },
    barrel(x, y, z) { cyl(.22, .22, .5, texMat(T.plank('#9a6233'), 2, 1), x, y, z, 10); for (const yy of [.08, .4]) cyl(.225, .225, .04, mat(0x444444), x, y + yy, z, 10); },
    bench(x, y, z) { box(.9, .06, .3, texMat(T.plankH('#a8703e')), x, y + .36, z); for (const dx of [-.38, .38]) box(.06, .36, .26, mat(0x5b4636), x + dx, y, z); },
    crate(x, y, z, c = '#b8894e') { box(.42, .38, .42, texMat(T.plankH(c)), x, y, z); },
    cat(x, y, z, c = '#2a2a2a', rot = 0) { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rot;
      const m = mat(c); const b = new THREE.Mesh(new THREE.BoxGeometry(.3, .16, .16), m); b.position.set(0, .1, 0); g.add(b);
      const hd = new THREE.Mesh(new THREE.BoxGeometry(.14, .13, .14), m); hd.position.set(.17, .2, 0); g.add(hd);
      for (const dz of [-.04, .04]) { const e = new THREE.Mesh(new THREE.ConeGeometry(.03, .07, 4), m); e.position.set(.17, .3, dz); g.add(e); }
      const tl = new THREE.Mesh(new THREE.BoxGeometry(.04, .2, .04), m); tl.position.set(-.16, .22, 0); tl.rotation.z = -.4; g.add(tl);
      for (const dz of [-.035, .035]) { const ey = new THREE.Mesh(new THREE.BoxGeometry(.02, .025, .025), glowMat('#ffd84a')); ey.position.set(.245, .22, dz); g.add(ey); }
      g.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; }); cur.add(g); return g; },
    pendant(x, y, z, color) { cyl(.006, .006, .5, mat(0x222222), x, y - .5, z, 4); cyl(.05, .18, .14, mat(0x2b2b2b), x, y - .64, z, 10); ball(.06, glowMat(color), x, y - .64, z); },
  };

  // ---------- exterior ----------
  function exterior(s) {
    if (!s || !Array.isArray(s.size) || !s.wall) return;
    const floors = s.floors === 2 ? 2 : 1;
    const [W, D] = s.size, hw = W / 2, hd = D / 2, FH = 1.55, H = FH * floors, base = .12;
    enter('base');
    const trim = mat(s.trim ?? '#3a2a1e');
    box(W + .14, base, D + .14, mat(shade(s.wall.color, .55)), 0, 0, 0);
    const front = s.front ?? {};
    // body: the front face is built separately so the entrance can open
    box(W, H, D - .1, wallMat(s.wall, W * 1.4, H * .9), 0, base, -.05);
    enter('front');
    const openW = front.type === 'counter' ? W * .78 : 0, openH = front.type === 'counter' ? 1.0 : 0;
    if (front.type === 'counter') {
      box(W, .5, .1, wallMat(s.wall, W * 1.4, .3), 0, base, hd - .05);                       // lower wall
      box(W, H - .5 - openH, .1, wallMat(s.wall, W * 1.4, .4), 0, base + .5 + openH, hd - .05);  // upper wall
      for (const sx of [-1, 1]) box((W - openW) / 2, openH, .1, wallMat(s.wall, .6, .6), sx * (hw - (W - openW) / 4), base + .5, hd - .05);
      box(openW, openH, .02, mat(0x2a1a12), 0, base + .5, hd - .42);                          // dark inside
      box(openW + .1, .06, .34, mat(shade(s.wall.color, 1.3)), 0, base + .5, hd + .06);         // counter board
      // steaming pot inside
      cyl(.16, .14, .2, mat(0xb0b4b8), -.4, base + .56, hd - .25, 10); cyl(.15, .15, .02, mat(0xf0e2c0), -.4, base + .76, hd - .25, 10);
    } else {
      box(W, H, .1, wallMat(s.wall, W * 1.4, H * .9), 0, base, hd - .05);
    }
    if (front.type === 'glass') {
      // display window + door
      box(W * .5, .95, .03, mat(0xbfe3ee, { emissive: 0x2a4a55 }), -W * .16, base + .35, hd + .01);
      for (const fx of [-W * .41, -W * .16, W * .09]) box(.05, .95, .05, trim, fx, base + .35, hd + .02);
      box(W * .52, .06, .06, trim, -W * .16, base + 1.3, hd + .02); box(W * .52, .06, .06, trim, -W * .16, base + .32, hd + .02);
      box(.5, 1.2, .04, mat(front.door ?? '#6b4a2a'), W * .32, base, hd + .01); box(.3, .4, .02, mat(0xbfe3ee), W * .32, base + .62, hd + .035);
      box(.04, .04, .04, mat(0xe8c060), W * .32 + .17, base + .55, hd + .05);
    }
    if (front.type === 'door') { box(.5, 1.2, .04, mat(front.door ?? '#6b4a2a'), 0, base, hd + .01); }
    // side windows
    enter('base');
    for (let f = 0; f < floors; f++) {
      const y = base + f * FH + .55;
      for (const zz of (D > 1.7 ? [-hd * .45, hd * .35] : [0])) {
        box(.03, .5, .42, mat(0xbfe3ee, { emissive: s.night ? 0x6a4a20 : 0x203a44 }), hw + .01, y, zz);
        box(.05, .06, .5, trim, hw + .02, y - .03, zz); box(.05, .06, .5, trim, hw + .02, y + .5, zz); box(.05, .5, .05, trim, hw + .02, y, zz);
      }
      if (f > 0) { box(W + .08, .08, D + .08, trim, 0, base + f * FH - .04, 0); for (const xx of [-hw * .5, hw * .5]) { box(.42, .5, .03, mat(0xbfe3ee, { emissive: 0x203a44 }), xx, y, hd + .01); box(.5, .06, .05, trim, xx, y - .03, hd + .02); } }
    }
    // roof
    enter('roof');
    const top = base + H, r = s.roof ?? { type: 'none' }, rc = r.color ?? '#666666';
    if (r.type === 'gable') {
      const span = hd + .22, rise = .62, slope = Math.hypot(span, rise), ang = Math.atan2(rise, span), rm = texMat(T.roofTile(rc), W * 1.3, 1.1);
      for (const sg of [1, -1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(W + .44, .09, slope), rm); m.position.set(0, top + rise / 2, sg * span / 2); m.rotation.x = sg * ang; add(m); }
      box(W + .52, .12, .14, mat(shade(rc, .7)), 0, top + rise - .04, 0);
      const tri = new THREE.Shape(); tri.moveTo(-hd, 0); tri.lineTo(hd, 0); tri.lineTo(0, rise - .02); tri.closePath();
      for (const x of [hw - .03, -hw + .03]) { const m = new THREE.Mesh(new THREE.ExtrudeGeometry(tri, { depth: .04, bevelEnabled: false }), wallMat(s.wall, 1, .5)); m.rotation.y = Math.PI / 2; m.position.set(x - .02, top, 0); add(m); }
      if (r.curl) for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const c = box(.14, .12, .14, mat(shade(rc, .7)), sx * (hw + .22), top - .04, sz * (span - .02)); c.rotation.y = .3 * sx; }
      if (r.curl) for (const sx of [-1, 1]) box(.12, .2, .16, mat(shade(rc, .7)), sx * (hw + .24), top + rise - .06, 0);
    } else if (r.type === 'hip') {
      const m = new THREE.Mesh(new THREE.ConeGeometry(.5 * Math.SQRT2, .9, 4, 1), texMat(T.shingle(rc), 4, 2)); m.rotation.y = Math.PI / 4; m.scale.set(W + .4, 1, D + .4); m.position.set(0, top + .45, 0); add(m);
      box(W + .36, .08, D + .36, mat(shade(rc, .7)), 0, top - .04, 0);
    } else if (r.type === 'flat') {
      box(W + .1, .3, D + .1, mat(rc), 0, top, 0); box(W + .2, .06, D + .2, mat(shade(rc, 1.4)), 0, top + .3, 0);
    } else if (r.type === 'shed') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(W + .4, .09, D + .4), texMat(T.roofTile(rc), W, 1)); m.rotation.x = .25; m.position.set(0, top + .2, 0); add(m);
    }
    enter('decor');
    if (s.chimney) { box(.28, .7, .28, texMat(T.brick('#8a4a3a'), .6, 1), hw * .45, top + .1, -hd * .3); }
    if (s.neon) { const n = glowMat(s.neon); box(W + .02, .04, .04, n, 0, top - .12, hd + .04); box(.04, .04, D, n, hw + .04, top - .12, 0); }
    // awning
    if (s.awning) { const aw = new THREE.Mesh(new THREE.PlaneGeometry(W * .62, .42), mat(0xffffff, { map: T.stripes(s.awning.a, s.awning.b), alphaTest: .5, side: THREE.DoubleSide }));
      aw.position.set(-W * .16, base + 1.45, hd + .2); aw.rotation.x = -.8; add(aw); }
    // noren (entrance curtain)
    if (s.noren) { const nt = tex(48, 24, (g, w, h) => { g.fillStyle = s.noren.color; for (let i = 0; i < 4; i++) g.fillRect(i * 12, 0, 11, h); g.fillStyle = '#f4ead8'; g.font = '900 13px "Noto Sans CJK KR", "Noto Sans KR", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s.noren.text, w / 2, h / 2); });
      const nm = new THREE.Mesh(new THREE.PlaneGeometry(openW || W * .6, .4), mat(0xffffff, { map: nt, side: THREE.DoubleSide })); nm.position.set(0, base + .5 + openH - .2, hd + .02); add(nm); }
    // sign
    if (s.sign) { const sg = s.sign, len = Math.max(2, [...sg.text].length), sw = Math.min(W * .9, .3 * len + .3);
      const sm = sg.glow ? new THREE.MeshBasicMaterial({ map: T.text(sg.text, sg.bg, sg.fg, 24 * len, 26, 18) }) : mat(0xffffff, { map: T.text(sg.text, sg.bg, sg.fg, 24 * len, 26, 18) });
      if (sg.place === 'front') { const b = new THREE.Mesh(new THREE.BoxGeometry(sw, .34, .06), [trim, trim, trim, trim, sm, trim]); b.position.set(0, base + H - .26, hd + .05); add(b); }
      if (sg.place === 'roof') { const b = new THREE.Mesh(new THREE.BoxGeometry(sw + .2, .46, .08), [trim, trim, trim, trim, sm, trim]); b.position.set(0, top + .55, hd - .3); add(b); for (const sx of [-1, 1]) box(.05, .35, .05, trim, sx * sw * .35, top + .3, hd - .3); }
      if (sg.place === 'blade') { const bt = T.text(sg.text, sg.bg, sg.fg, 26, 22 * len, 16); const vt = tex(26, 22 * len, (g, w, h) => { g.fillStyle = sg.bg; g.fillRect(0, 0, w, h); g.fillStyle = sg.fg; g.font = '900 16px "Noto Sans CJK KR", "Noto Sans KR", sans-serif'; g.textAlign = 'center'; [...sg.text].forEach((ch, i) => g.fillText(ch, w / 2, 18 + i * 22)); });
        const b = new THREE.Mesh(new THREE.BoxGeometry(.06, .2 * len + .1, .3), [mat(0xffffff, { map: vt }), trim, trim, trim, trim, trim]); b.position.set(hw + .22, base + 1.1 + .1 * len, hd - .25); add(b); box(.24, .04, .04, trim, hw + .1, base + 1.25 + .2 * len, hd - .25); } }
    // props
    (s.props ?? []).forEach((p, i) => {
      enter('prop:' + i);
      const fx = p.x ?? 0, fz = hd + .45;
      if (p.type === 'lantern') P.lantern(fx, base + H - .05, hd + .3, p.color);
      if (p.type === 'stool') P.stool(fx, 0, fz);
      if (p.type === 'plant') P.plant(fx, 0, fz);
      if (p.type === 'bench') P.bench(fx, 0, fz);
      if (p.type === 'crate') { P.crate(fx, 0, fz); P.crate(fx + .05, .38, fz - .05, '#c99a5e'); }
      if (p.type === 'barrel') P.barrel(hw + .35, 0, p.z ?? 0);
      if (p.type === 'menuboard') { box(.5, .7, .05, mat(0x2b2b2b), fx, .1, fz - .1).rotation.x = -.15; const t = new THREE.Mesh(new THREE.PlaneGeometry(.4, .2), mat(0xffffff, { map: T.text(p.text, '#2b2b2b', '#f4ead8', 64, 26, 15) })); t.position.set(fx, .62, fz - .06); t.rotation.x = -.15; add(t); }
      if (p.type === 'bookstand') { box(.5, .5, .3, texMat(T.plankH('#8a6a4a')), fx, 0, fz); for (let i = 0; i < 5; i++) box(.06, .2, .2, mat(['#c0504d', '#4f81bd', '#e3b448', '#5b8a6a', '#8064a2'][i]), fx - .18 + i * .08, .5, fz); }
      if (p.type === 'flag') { cyl(.025, .025, 1.6, mat(0xdddddd), fx, 0, fz, 6); const f = box(.02, .5, .4, glowMat(p.color), fx, 1.05, fz + .2); }
      if (p.type === 'standee') { box(.36, .9, .04, mat(0xf2d0a0), fx, 0, fz + .1); box(.36, .25, .045, mat(0xe23b3b), fx, .45, fz + .1); box(.22, .22, .046, mat(0x2b2b2b), fx, .68, fz + .1); }
      if (p.type === 'cat' && p.on === 'roof') P.cat(-hw * .3, top + (r.type === 'hip' ? .25 : .3), hd * .2, '#2a2a2a', -.4);
      if (p.type === 'cat' && p.on === 'sill') P.cat(hw + .12, base + .52, -hd * .45, '#e8a04a', Math.PI / 2);
      if (p.type === 'glove' && p.on === 'roof') { const g = ball(.3, mat(p.color), -hw * .55, top + .62, -hd * .1); g.scale.set(1.1, 1, .9); ball(.13, mat(p.color), -hw * .55 + .25, top + .62, -hd * .1 + .12); box(.36, .2, .3, mat(0xf4f4f4), -hw * .55 - .05, top + .2, -hd * .1); }
    });
  }

  // ---------- interior ----------
  function interior(s) {
    if (!s || !Array.isArray(s.size)) return;
    enter('room');
    s = { floor: { type: 'wood', a: '#b48a5a' }, wall: { mat: 'plaster', color: '#efe3cf' }, items: [], ...s };
    const [W, D] = s.size, ox = -W / 2, oz = -D / 2, WH = 2.0;   // back corner of the room = (ox, oz)
    const at = (x, z) => [ox + x, oz + z];
    const fm = s.floor.type === 'checker' ? texMat(T.checker(s.floor.a, s.floor.b), W, D) : texMat(T.plankH(s.floor.a), W, D);
    box(W, .1, D, fm, 0, -.1, 0);
    box(W + .12, WH, .12, wallMat(s.wall, W * 1.3, 1.2), -.06 + 0, 0, oz - .06);      // back wall (z)
    box(.12, WH, D, wallMat(s.wall, D * 1.3, 1.2), ox - .06, 0, 0);                  // back wall (x)
    box(W, .12, .06, mat(shade(s.wall.color, .55)), 0, 0, oz + .03); box(.06, .12, D, mat(shade(s.wall.color, .55)), ox + .03, 0, 0);
    box(W + .12, .14, .1, mat(shade(s.wall.color, .55)), 0, 0, -oz + .05); box(.1, .14, D, mat(shade(s.wall.color, .55)), -ox + .05, 0, 0); // cut-away front wall stubs
    const onWall = (wall, a) => wall === 'z' ? { x: ox + a, z: oz + .08, rx: 0 } : { x: ox + .08, z: oz + a, rx: Math.PI / 2 };
    s.items.forEach((it, i) => {
      enter('item:' + i);
      const [x, z] = it.at && Array.isArray(it.at) ? at(...it.at) : [0, 0];
      switch (it.type) {
        case 'stove': box(.7, .8, .55, mat(0x7c8288), x, 0, z); box(.72, .05, .57, mat(0x3a3d42), x, .8, z); cyl(.2, .18, .3, mat(0xc0c4c8), x, .85, z, 10); cyl(.19, .19, .02, mat(0xf3e2b8), x, 1.13, z, 10); break;
        case 'counter': { const L = it.len, rot = it.rot === 90; const g = new THREE.Group(); cur.add(g); g.position.set(x, 0, z); if (rot) g.rotation.y = Math.PI / 2;
          const m1 = new THREE.Mesh(new THREE.BoxGeometry(L, .95, .5), texMat(T.plank(it.color), L * 1.5, 1)); m1.position.y = .475; g.add(m1);
          const m2 = new THREE.Mesh(new THREE.BoxGeometry(L + .08, .06, .6), mat(shade(it.color, 1.25))); m2.position.y = .98; g.add(m2);
          if (it.on === 'bowls') for (let i = 0; i < Math.floor(L / .5); i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(.1, .07, .08, 8), mat(0xf4efe6)); b.position.set(-L / 2 + .3 + i * .5, 1.05, .05); g.add(b); const n = new THREE.Mesh(new THREE.CylinderGeometry(.085, .085, .02, 8), mat(0xe8b86a)); n.position.set(-L / 2 + .3 + i * .5, 1.09, .05); g.add(n); }
          if (it.on === 'coffee') { const c = new THREE.Mesh(new THREE.BoxGeometry(.4, .4, .35), mat(0x2e2e2e)); c.position.set(-.3, 1.21, 0); g.add(c); const cu = new THREE.Mesh(new THREE.CylinderGeometry(.05, .04, .08, 8), mat(0xffffff)); cu.position.set(.2, 1.05, .1); g.add(cu); }
          if (it.on === 'register') { const c = new THREE.Mesh(new THREE.BoxGeometry(.35, .2, .3), mat(0x2e2e2e)); c.position.set(0, 1.11, 0); g.add(c); const sc = new THREE.Mesh(new THREE.BoxGeometry(.25, .15, .03), glowMat('#4fe3ff')); sc.position.set(0, 1.3, .05); g.add(sc); }
          g.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; }); break; }
        case 'stool': P.stool(x, 0, z); break;
        case 'chair': P.chair(x, 0, z, it.color, -1); break;
        case 'plant': P.plant(x, 0, z, 1.1); break;
        case 'pendant': P.pendant(x, WH + .2, z, it.color); break;
        case 'table': cyl(.32, .32, .05, mat(it.color), x, .65, z, 12); cyl(.04, .04, .65, mat(shade(it.color, .7)), x, 0, z, 6); cyl(.04, .04, .06, mat(0xffffff), x + .1, .7, z, 8); break;
        case 'sofa': box(1.3, .4, .55, mat(it.color), x, 0, z); box(1.3, .45, .15, mat(shade(it.color, .85)), x, .4, z + .2); for (const sx of [-1, 1]) box(.15, .55, .55, mat(shade(it.color, .85)), x + sx * .65, 0, z); break;
        case 'rug': box(it.size[0], .02, it.size[1], mat(it.color), x, 0, z); box(it.size[0] - .2, .025, it.size[1] - .2, mat(shade(it.color, 1.25)), x, 0, z); break;
        case 'catbed': cyl(.3, .26, .12, mat(0xc0504d), x, 0, z, 12); cyl(.22, .22, .13, mat(0xf4e0c8), x, 0, z, 12); P.cat(x, .1, z, '#e8a04a', -.6); break;
        case 'cat': P.cat(x, .7, z, '#2a2a2a', .8); break;
        case 'bag': cyl(.005, .005, .5, mat(0x333333), x, WH - .5, z, 4); cyl(.2, .2, .9, mat(0xc23a3a), x, .7, z, 10); cyl(.21, .21, .06, mat(0x2b2b2b), x, 1.55, z, 10); cyl(.21, .21, .06, mat(0x2b2b2b), x, .72, z, 10); break;
        case 'case': box(1.2, .6, .6, mat(0x2b2e3d), x, 0, z); box(1.2, .5, .6, mat(0xc8f0ff, { transparent: true, opacity: .35 }), x, .6, z);
          box(.2, .12, .2, mat(0xe8c040), x - .35, .6, z); cyl(.06, .06, .3, mat(0xff4fa3), x, .6, z, 6); box(.3, .14, .14, mat(0xc23a3a), x + .35, .6, z); break;
        case 'shelf': { const L = it.len; const w = it.wall === 'x'; const [sx, sz] = w ? [ox + .2, oz + it.at] : [x, oz + .2];
          const g = new THREE.Group(); g.position.set(sx, 0, sz); if (w) g.rotation.y = Math.PI / 2; cur.add(g);
          const back = new THREE.Mesh(new THREE.BoxGeometry(L, 1.6, .06), mat(0x5b4636)); back.position.set(0, .8, -.15); g.add(back);
          for (const y of [.35, .8, 1.25]) { const sh = new THREE.Mesh(new THREE.BoxGeometry(L, .05, .34), texMat(T.plankH('#8a6a4a'), L, 1)); sh.position.set(0, y, 0); g.add(sh);
            const n = Math.floor(L / .22); for (let i = 0; i < n; i++) { const xx = -L / 2 + .15 + i * .22;
              if (it.goods === 'bowls') { const b = new THREE.Mesh(new THREE.CylinderGeometry(.09, .06, .07, 8), mat(i % 3 ? 0xf4efe6 : 0x3f7a74)); b.position.set(xx, y + .06, 0); g.add(b); }
              if (it.goods === 'figures') { const c = ['#ff4fa3', '#4fe3ff', '#ffd166', '#e23b3b', '#8a6aff'][i % 5]; const b = new THREE.Mesh(new THREE.BoxGeometry(.14, .26, .14), mat(c)); b.position.set(xx, y + .155, 0); g.add(b); }
              if (it.goods === 'gloves') { const b = new THREE.Mesh(new THREE.SphereGeometry(.09, 8, 6), mat(['#e23b3b', '#3a6ee8', '#2b2b2b'][i % 3])); b.position.set(xx, y + .1, 0); g.add(b); } } }
          g.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; }); break; }
        case 'bookshelf': { const L = it.len; const w = it.wall === 'x'; const g = new THREE.Group(); g.position.set(w ? ox + .2 : ox + it.at, 0, w ? oz + it.at : oz + .2); if (w) g.rotation.y = Math.PI / 2; cur.add(g);
          const fr = new THREE.Mesh(new THREE.BoxGeometry(L, 1.8, .36), texMat(T.plank('#6b4a2a'), L, 1)); fr.position.set(0, .9, 0); g.add(fr);
          const cols = ['#c0504d', '#4f81bd', '#e3b448', '#5b8a6a', '#8064a2', '#d98c4a', '#3a3a3a'];
          for (const y of [.12, .55, 1.0, 1.42]) { let xx = -L / 2 + .06; let i = Math.floor(y * 10); while (xx < L / 2 - .1) { const bw = .05 + ((i * 7) % 4) * .015, bh = .28 + ((i * 3) % 3) * .05; const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, .26), mat(cols[i % cols.length])); b.position.set(xx + bw / 2, y + bh / 2, .06); g.add(b); xx += bw + .01; i++; } }
          g.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; }); break; }
        case 'window': { const p = onWall(it.wall, it.at); const m = new THREE.Mesh(new THREE.BoxGeometry(.9, .8, .04), mat(0xbfe3ee, { emissive: 0x405a60 })); m.position.set(p.x, 1.25, p.z); m.rotation.y = p.rx; add(m);
          const f = new THREE.Mesh(new THREE.BoxGeometry(1.0, .06, .1), mat(0x5b4636)); f.position.set(p.x, .82, p.z + .02); f.rotation.y = p.rx; add(f); P.cat(p.x - .1, .85, p.z + .08, '#2a2a2a', .2); break; }
        case 'poster': { const p = onWall(it.wall, it.at); const m = new THREE.Mesh(new THREE.BoxGeometry(.6, .8, .02), [0, 0, 0, 0, 0, 0].map((_, i) => i === 4 ? mat(0xffffff, { map: T.text(it.text, it.color, '#fff7e6', 40, 56, 16) }) : mat(0x222222)));
          m.position.set(p.x + (it.wall === 'x' ? .02 : 0), 1.25, p.z + (it.wall === 'z' ? .02 : 0)); m.rotation.y = p.rx; add(m); break; }
        case 'lantern': { const p = onWall(it.wall, it.at); P.lantern(p.x + .15, 1.9, p.z + .15, it.color); break; }
        case 'neon': { const p = onWall(it.wall, it.at); const m = new THREE.Mesh(new THREE.TorusGeometry(.28, .03, 6, 16), glowMat(it.color)); m.position.set(p.x + .03, 1.35, p.z); m.rotation.y = p.rx; add(m);
          const m2 = new THREE.Mesh(new THREE.BoxGeometry(.03, .03, .5), glowMat('#ff4fa3')); m2.position.set(p.x + .03, 1.35, p.z); add(m2); break; }
      }
    });
  }
  return { exterior, interior };
}
