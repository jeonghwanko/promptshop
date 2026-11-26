// Exterior v2: a normalized spec (see spec.js) → a three.js group.
// Visible faces are the front (+z, screen lower-left) and the side (+x, screen lower-right).
import * as THREE from 'three';
import { surface, mat, glow, shade, texMat, tex } from './materials.js';
import { buildRoof } from './roofs.js';
import { iconTexture } from './icons.js';
import { MAX_SHOWN_LEVELS } from './spec.js';

const GH = 1.45, FH = 1.25, PL = 0.12;                    // ground floor, upper floor, default plinth height
const levelY = (n) => (n <= 0 ? 0 : GH + (n - 1) * FH);
const GLASS = 0xbfe3ee;

export function buildExterior(spec, section) {
  const root = new THREE.Group();
  let cur = root;
  const enter = (k) => { cur = (section && section(k)) || root; };
  const add = (o) => { o.traverse?.(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } }); cur.add(o); return o; };
  const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y + h / 2, z); return add(o); };
  const cyl = (r1, r2, h, m, x, y, z, seg = 10) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), m); o.position.set(x, y + h / 2, z); return add(o); };
  const ball = (r, m, x, y, z) => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), m); o.position.set(x, y, z); return add(o); };
  const st = spec.style_, trim = mat(spec.trim), accent = spec.accent;
  const glassM = mat(GLASS, { emissive: spec.night ? 0x6a5020 : 0x22404a });
  const plinthH = st.plinth?.h ?? PL;

  // ---------- place masses ----------
  const placed = {};
  for (const m of spec.masses) {
    const p = placed[m.parent] ?? null;
    let x = 0, z = 0, base = 0, shownBase = 0;
    const [w, d] = m.size;
    if (p) {
      const [pw, pd] = p.size;
      if (m.at === 'left') { x = p.x - pw / 2 - w / 2 + .01; z = p.z + pd / 2 - d / 2; }
      if (m.at === 'right') { x = p.x + pw / 2 + w / 2 - .01; z = p.z + pd / 2 - d / 2; }
      if (m.at === 'back') { x = p.x; z = p.z - pd / 2 - d / 2 + .01; }
      if (m.at === 'front') { x = p.x; z = p.z + pd / 2 + d / 2 - (m.shape === 'canopy' ? -.1 : .25); }
      if (m.at === 'top') { x = p.x; z = p.z - (pd - d) * 0.2; base = p.base + p.levels; shownBase = p.shownBase + p.shown; }
    }
    // Tall buildings are compressed: at most 8 floors are drawn, and a band marks the hidden ones.
    const shown = m.shape === 'canopy' ? 1 : Math.max(Math.min(m.levels, 2), Math.min(m.levels, MAX_SHOWN_LEVELS - shownBase));
    placed[m.id] = { ...m, x, z, base, shownBase, shown, compressed: shown < m.levels };
  }

  for (const m of Object.values(placed)) {
    enter('mass:' + m.id);
    const [w, d] = m.size, y0 = (m.shownBase ? levelY(m.shownBase) : 0) + plinthH, H = levelY(m.shown) - levelY(0) || GH;
    const height = levelY(m.shownBase + m.shown) - levelY(m.shownBase);
    const wm = (sw, sh) => surface('wall', m.wall.material, m.wall.color, sw, sh);
    const wallFaces = [wm(d, height), wm(d, height), mat(shade(m.wall.color, .9)), mat(shade(m.wall.color, .9)), wm(w, height), wm(w, height)];

    if (m.shape === 'canopy') {
      // posts and a flat roof, no walls (fuel canopy, platform shelter)
      const ch = 1.7;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(.12, ch, .12, mat('#d8d8d8'), m.x + sx * (w / 2 - .2), 0, m.z + sz * (d / 2 - .2));
      box(w, .18, d, mat('#f1f1f1'), m.x, ch, m.z); box(w + .02, .1, d + .02, mat(accent), m.x, ch + .04, m.z);
      continue;
    }
    if (!m.shownBase) box(w + .16, plinthH, d + .16, surface('wall', st.plinth?.material ?? 'concrete', st.plinth?.color ?? shade(m.wall.color, .55), w, .3), m.x, 0, m.z);

    if (m.shape === 'round') {
      const r = Math.min(w, d) / 2;
      cyl(r, r, height, wm(r * 6, height), m.x, y0, m.z, 18);
      for (let f = 0; f < m.shown; f++) for (const a of [0.25, 0.75, 1.25]) { const o = new THREE.Mesh(new THREE.BoxGeometry(.04, .4, .22), glassM); o.position.set(m.x + Math.sin(a) * (r + .01), y0 + levelY(f) + .5, m.z + Math.cos(a) * (r + .01)); o.rotation.y = a; add(o); }
      const roof = buildRoof({ ...m.roof, shape: ['dome', 'onion', 'cone', 'flat'].includes(m.roof.shape) ? m.roof.shape : 'cone' }, w, d, { wall: wm(w, 1), wallColor: m.wall.color });
      roof.position.set(m.x, y0 + height, m.z); add(roof);
      continue;
    }

    // body
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, height, d), wallFaces); body.position.set(m.x, y0 + height / 2, m.z); add(body);
    const front = (u, y, ww, hh, dd, mm) => box(ww, hh, dd, mm, m.x + u, y0 + y, m.z + d / 2 + dd / 2 - .005);
    const side = (u, y, ww, hh, dd, mm) => box(dd, hh, ww, mm, m.x + w / 2 + dd / 2 - .005, y0 + y, m.z + u);
    const faces = [{ len: w, put: front, ground: true }, { len: d, put: side, ground: false }];

    // hanok posts at corners and bay lines
    if (st.posts) for (const f of faces) { const n = Math.max(1, Math.round(f.len / 1.1)); for (let k = 0; k <= n; k++) f.put(-f.len / 2 + k * f.len / n, 0, .12, height, .1, trim); }

    // upper floors + side ground floor: window rhythm
    for (let f = 0; f < m.shown; f++) {
      const fy = m.shownBase + f === 0 ? 0 : levelY(m.shownBase + f) - levelY(m.shownBase);
      const fh = m.shownBase + f === 0 ? GH : FH;
      if (f > 0 && m.rhythm !== 'curtain') for (const F of faces) F.put(0, fy - .04, F.len + .04, .08, .06, trim);
      for (const F of faces) {
        if (f === 0 && m.shownBase === 0 && F.ground) continue;    // the front ground floor gets its own treatment
        windows(F, fy, fh, m.rhythm, F.len);
        if (m.balconies && f > 0 && F.ground) balconies(F, fy, F.len);
      }
    }
    if (m.shownBase === 0) ground(faces[0], m, w);

    // compressed floors band
    if (m.compressed) {
      const by = levelY(m.shownBase + Math.floor(m.shown / 2)) - levelY(m.shownBase) - .1;
      for (const F of faces) { F.put(0, by, F.len + .06, .22, .08, mat(shade(spec.trim, .8))); for (const k of [-1, 0, 1]) F.put(k * .18, by + .06, .08, .1, .1, mat('#f4f1ea')); }
    }

    // roof
    const roof = buildRoof(m.roof, w, d, { wall: wm(w, 1), wallColor: m.wall.color });
    roof.position.set(m.x, y0 + height, m.z); add(roof);
    placed[m.id].top = y0 + height + roof.userData.height;
  }

  function windows(F, fy, fh, rhythm, len) {
    const wy = fy + Math.min(.42, fh * .3), wh = Math.min(.62, fh * .5);
    if (rhythm === 'none') return;
    if (rhythm === 'curtain') {
      F.put(0, fy + .03, len - .1, fh - .06, .03, glassM);
      const n = Math.max(2, Math.round(len / .45)); for (let k = 0; k <= n; k++) F.put(-len / 2 + .05 + k * (len - .1) / n, fy, .05, fh, .05, trim);
      F.put(0, fy, len - .06, .05, .05, trim); return;
    }
    if (rhythm === 'bands') { F.put(0, wy, len - .3, wh * .7, .03, glassM); for (let k = 0, n = Math.max(2, Math.round(len / .6)); k <= n; k++) F.put(-(len - .3) / 2 + k * (len - .3) / n, wy, .04, wh * .7, .05, trim); F.put(0, wy - .05, len - .26, .05, .07, trim); return; }
    const bay = rhythm === 'grid' ? .45 : .88, n = Math.max(1, Math.round(len / bay));
    for (let k = 0; k < n; k++) {
      const u = -len / 2 + (k + .5) * len / n;
      if (rhythm === 'grid') { F.put(u, wy, .26, .36, .03, glassM); continue; }
      if (rhythm === 'lattice') {
        const lt = tex(8, 10, (g) => { g.fillStyle = '#f4ecd8'; g.fillRect(0, 0, 8, 10); g.fillStyle = '#6b4026'; for (let i = 0; i < 8; i += 3) g.fillRect(i, 0, 1, 10); for (let j = 0; j < 10; j += 3) g.fillRect(0, j, 8, 1); });
        F.put(u, fy + .25, Math.min(.62, len / n - .2), Math.min(.95, fh - .4), .03, mat(0xffffff, { map: lt })); continue;
      }
      F.put(u, wy, .42, wh, .03, glassM);
      if (rhythm === 'arched') { const a = new THREE.Mesh(new THREE.CircleGeometry(.21, 10, 0, Math.PI), glassM); placeOnFace(F, a, u, wy + wh); }
      if (st.frames) { F.put(u, wy - .04, .5, .05, .05, mat(st.frames)); F.put(u, wy + wh, .5, .05, .05, mat(st.frames)); }
      if (st.lintel) F.put(u, wy + wh, .5, .08, .05, mat('#efe6d6'));
      if (st.shutters) for (const s of [-1, 1]) F.put(u + s * .29, wy, .14, wh, .04, mat(st.shutters));
      else F.put(u, wy - .05, .5, .05, .07, trim);
    }
  }
  function placeOnFace(F, mesh, u, y) {
    if (F.ground) { mesh.position.set(0, 0, 0); const g = new THREE.Group(); g.add(mesh); const anchor = F.put(u, y, .001, .001, .001, trim); anchor.add(g); g.position.set(0, 0, .02); }
    else { const g = new THREE.Group(); g.add(mesh); g.rotation.y = Math.PI / 2; const anchor = F.put(u, y, .001, .001, .001, trim); anchor.add(g); g.position.set(.02, 0, 0); }
  }
  function balconies(F, fy, len) {
    const n = Math.max(1, Math.round(len / .88));
    for (let k = 0; k < n; k++) { const u = -len / 2 + (k + .5) * len / n; F.put(u, fy, .7, .06, .32, mat('#d8d4cc')); F.put(u, fy + .06, .7, .28, .03, mat(shade(spec.trim, 1), { transparent: true, opacity: .85 })); }
  }

  // ---------- ground-floor fronts (12) ----------
  function ground(F, m, w) {
    const put = F.put, h = GH, door = (u, ww = .5, c = shade(spec.trim, 1)) => { put(u, 0, ww, 1.15, .04, mat(c)); put(u, .62, ww * .55, .36, .05, glassM); };
    switch (m.ground) {
      case 'shopfront': {
        put(-w * .14, .3, w * .6, .85, .03, glassM); put(-w * .14, .27, w * .62, .05, .06, trim); put(-w * .14, 1.15, w * .62, .05, .06, trim);
        for (const k of [-.44, -.14, .16]) put(w * k, .3, .04, .85, .05, trim);
        door(w * .33);
        const aw = new THREE.Mesh(new THREE.PlaneGeometry(w * .72, .42), mat(0xffffff, { map: stripes(accent, '#f4efe4'), alphaTest: .5, side: THREE.DoubleSide }));
        aw.rotation.x = -.8; const g = new THREE.Group(); g.add(aw); g.position.set(m.x - w * .1, plinthH + 1.42, m.z + w * 0 + m.size[1] / 2 + .2); add(g);
        break;
      }
      case 'curtain': windows(F, 0, h, 'curtain', w); put(0, 0, .9, 1.1, .05, mat(0x7fa8b4, { emissive: 0x1a2a30 })); break;
      case 'arcade': {
        const n = Math.max(3, Math.round(w / .8));
        put(0, 0, w - .1, 1.2, .02, mat(shade(m.wall.color, .45)));
        for (let k = 0; k <= n; k++) put(-w / 2 + .1 + k * (w - .2) / n, 0, .14, 1.2, .22, surface('wall', m.wall.material, shade(m.wall.color, 1.05), .2, 1.2));
        put(0, 1.15, w, .3, .22, surface('wall', m.wall.material, m.wall.color, w, .3)); break;
      }
      case 'portico': {
        const n = Math.max(3, Math.round(w / .7)), cm = mat('#efe6d6');
        box(w + .2, .14, .8, mat('#d8d0c0'), m.x, plinthH, m.z + m.size[1] / 2 + .4);
        for (let k = 0; k < n; k++) cyl(.08, .09, 1.55, cm, m.x - w / 2 + .15 + k * (w - .3) / (n - 1), plinthH + .14, m.z + m.size[1] / 2 + .62, 10);
        box(w + .24, .16, .9, cm, m.x, plinthH + 1.69, m.z + m.size[1] / 2 + .38);
        const tri = new THREE.Shape(); tri.moveTo(-w / 2 - .1, 0); tri.lineTo(w / 2 + .1, 0); tri.lineTo(0, .45); tri.closePath();
        const ped = new THREE.Mesh(new THREE.ExtrudeGeometry(tri, { depth: .12, bevelEnabled: false }), cm); ped.position.set(m.x, plinthH + 1.85, m.z + m.size[1] / 2 + .7); add(ped);
        door(0, .6, '#4a3a2a'); break;
      }
      case 'canopy': {
        put(0, 0, Math.min(1.6, w * .5), 1.1, .03, glassM); put(0, 0, .05, 1.1, .05, trim);
        box(Math.min(2.2, w * .7), .1, .8, mat(shade(spec.trim, 1.1)), m.x, plinthH + 1.25, m.z + m.size[1] / 2 + .4);
        for (const s of [-1, 1]) cyl(.03, .03, 1.25, mat('#cfcfcf'), m.x + s * Math.min(1, w * .32), plinthH, m.z + m.size[1] / 2 + .74, 6);
        windows(F, 0, h, 'punched', w); break;
      }
      case 'garage': {
        const n = Math.max(1, Math.round(w / 1.2));
        const rt = tex(8, 8, (g) => { g.fillStyle = '#c8ccd2'; g.fillRect(0, 0, 8, 8); g.fillStyle = '#9aa0a8'; for (let y = 1; y < 8; y += 2) g.fillRect(0, y, 8, 1); });
        for (let k = 0; k < n; k++) { const u = -w / 2 + (k + .5) * w / n; put(u, 0, w / n - .25, 1.15, .04, texMat(rt, 2, 3)); put(u, 1.15, w / n - .15, .08, .06, mat(accent)); }
        break;
      }
      case 'dock': {
        box(w * .8, .45, .7, mat('#9a9ea4'), m.x, plinthH, m.z + m.size[1] / 2 + .35);
        const rt = tex(8, 8, (g) => { g.fillStyle = '#b8bcc4'; g.fillRect(0, 0, 8, 8); g.fillStyle = '#8a9098'; for (let y = 1; y < 8; y += 2) g.fillRect(0, y, 8, 1); });
        for (const u of [-w * .2, w * .2]) { put(u, .45, .8, .9, .04, texMat(rt, 2, 2)); put(u, .45, .12, .2, .14, mat('#2b2b2b')); }
        break;
      }
      case 'porch': {
        box(1.3, .12, .7, mat(shade(m.wall.color, .7)), m.x, plinthH, m.z + m.size[1] / 2 + .35);
        for (const s of [-1, 1]) cyl(.04, .04, 1.25, mat(st.frames ?? '#f4f1ea'), m.x + s * .55, plinthH + .12, m.z + m.size[1] / 2 + .62, 6);
        box(1.45, .08, .85, mat(m.roof.color), m.x, plinthH + 1.37, m.z + m.size[1] / 2 + .35);
        door(0); windows(F, 0, h, m.rhythm === 'curtain' ? 'punched' : m.rhythm, w); break;
      }
      case 'marquee': {
        put(0, 0, 1.4, 1.1, .03, glassM);
        const mq = box(Math.min(w * .8, 2.6), .45, .7, mat('#2b2118'), m.x, plinthH + 1.2, m.z + m.size[1] / 2 + .35);
        for (let k = 0; k < 9; k++) ball(.035, glow('#ffe08a'), m.x - Math.min(w * .8, 2.6) / 2 + .1 + k * Math.min(w * .8, 2.6) / 9, plinthH + 1.2, m.z + m.size[1] / 2 + .72);
        box(Math.min(w * .7, 2.3), .26, .02, glow(accent), m.x, plinthH + 1.29, m.z + m.size[1] / 2 + .71);
        for (const s of [-1, 1]) put(s * (w / 2 - .45), .25, .5, .7, .04, mat(accent));
        break;
      }
      case 'gate': {
        // a big wooden double gate under its own small roof (hanok gate, barn door)
        const gw = Math.min(1.3, w * .5);
        put(0, 0, gw, 1.2, .06, surface('wall', 'wood_boards', '#7a4a2a', gw, 1.2)); put(0, 0, .04, 1.2, .08, mat('#3a2418'));
        for (const s of [-1, 1]) put(s * (gw / 2 + .06), 0, .12, 1.35, .14, trim);
        box(gw + .7, .1, .5, mat(m.roof.color), m.x, plinthH + 1.38, m.z + m.size[1] / 2 + .2);
        windows(F, 0, h, m.rhythm, w); break;
      }
      case 'counter': {
        put(0, 0, w, .55, .04, surface('wall', m.wall.material, m.wall.color, w, .5));
        put(0, .55, w * .8, .7, .02, mat('#2a1a12')); put(0, .55, w * .84, .06, .34, mat(shade(m.wall.color, 1.3)));
        break;
      }
      case 'plain': default: door(0); windows(F, 0, h, m.rhythm === 'curtain' ? 'punched' : m.rhythm, w);
    }
  }
  function stripes(a, b) { return tex(48, 16, (g, w, h) => { const n = 6, sw = w / n; for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(i * sw, 0, sw, h - 4); for (let x = 0; x < sw; x++) { const k = (x + .5) / sw * 2 - 1; g.fillRect(i * sw + x, h - 4, 1, Math.round(Math.sqrt(Math.max(0, 1 - k * k)) * 4)); } } }); }

  // ---------- sign ----------
  // signs and props attach to the ground mass; things on the skyline use the highest top
  const main = Object.values(placed).find(m => m.at === 'main') ?? Object.values(placed)[0], [mw, md] = main.size;
  const skyTop = Math.max(...Object.values(placed).map(m => m.top ?? 0));
  const fz = main.z + md / 2, fx = main.x, gy = plinthH + GH;
  enter('sign');
  {
    const it = iconTexture(spec.sign.icon, spec.sign.fg, spec.sign.bg), im = mat(0xffffff, { map: it }), edge = mat(shade(spec.sign.bg, .6));
    const board = (s) => new THREE.Mesh(new THREE.BoxGeometry(s, s, .06), [edge, edge, edge, edge, im, edge]);
    const top = main.top ?? gy + 2;
    if (spec.sign.place === 'front') { const b = board(.5); b.position.set(fx + (main.ground === 'shopfront' ? mw * .33 : 0), gy + (main.shown > 1 ? .22 : -.18), fz + .06); add(b); }
    if (spec.sign.place === 'roof') { const b = board(.7); b.position.set(fx, top + .45, fz - .25); add(b); box(.05, .3, .05, trim, fx, top, fz - .25); }
    if (spec.sign.place === 'blade') { const b = new THREE.Mesh(new THREE.BoxGeometry(.06, .5, .5), [im, edge, edge, edge, edge, edge]); b.position.set(fx + mw / 2 + .3, gy + .35, fz - .3); add(b); box(.3, .04, .04, trim, fx + mw / 2 + .15, gy + .6, fz - .3); }
    if (spec.sign.place === 'pole') { cyl(.06, .06, 2.6, mat('#9aa0a6'), fx + mw / 2 + .6, 0, fz + .5, 6); const b = board(.75); b.position.set(fx + mw / 2 + .6, 2.95, fz + .5); add(b); }
  }

  // ---------- hero prop ----------
  enter('hero');
  hero(spec.hero);
  function hero(kind) {
    const top = Math.max(main.top ?? gy + 1.5, (kind === 'spire' || kind === 'lamp' || kind === 'siren' || kind === 'weathervane') ? skyTop : 0), roofY = plinthH + levelY(main.shown) + (main.shownBase ? levelY(main.shownBase) : 0);
    const a = mat(accent), white = mat('#f4f1ea');
    switch (kind) {
      case 'giant_cup': cyl(.3, .24, .5, white, fx - mw * .2, roofY + .1, main.z, 12); cyl(.28, .28, .04, mat('#6b4026'), fx - mw * .2, roofY + .58, main.z, 12); { const t = new THREE.Mesh(new THREE.TorusGeometry(.12, .04, 6, 10), white); t.position.set(fx - mw * .2 + .32, roofY + .35, main.z); t.rotation.y = Math.PI / 2; add(t); } break;
      case 'giant_bread': { const b = ball(.38, mat('#c98a4b'), fx - mw * .15, roofY + .35, main.z); b.scale.set(1.3, .6, .8); for (const k of [-1, 0, 1]) box(.06, .05, .3, mat('#e8c088'), fx - mw * .15 + k * .2, roofY + .55, main.z); break; }
      case 'big_fork': for (const k of [-1, 0, 1]) box(.06, .5, .06, mat('#d8d8d8'), fx + mw * .3 + k * .1, roofY + .7, main.z); box(.3, .08, .08, mat('#d8d8d8'), fx + mw * .3, roofY + .62, main.z); box(.08, .6, .08, mat('#d8d8d8'), fx + mw * .3, roofY, main.z); break;
      case 'neon_arrow': box(.06, .08, .8, glow(accent), fx + mw / 2 + .05, gy + .9, fz - .5); box(.06, .3, .08, glow(accent), fx + mw / 2 + .05, gy + .75, fz - .1); break;
      case 'pylon_sign': if (spec.sign.place !== 'pole') { cyl(.06, .06, 2.4, mat('#9aa0a6'), fx - mw / 2 - .5, 0, fz + .4, 6); box(.6, .5, .08, a, fx - mw / 2 - .5, 2.4, fz + .4); } break;
      case 'lantern_string': for (let k = 0; k < 5; k++) { const x = fx - mw / 2 + .2 + k * (mw - .4) / 4; ball(.08, glow(k % 2 ? '#ffb347' : '#e2432f'), x, plinthH + GH + .05, fz + .32); } break;
      case 'mannequin': box(.16, .5, .1, mat('#e8e2d6'), fx - mw * .25, plinthH + .4, fz - .1); ball(.07, mat('#e8e2d6'), fx - mw * .25, plinthH + 1, fz - .1); break;
      case 'green_cross': case 'red_cross': { const c = glow(kind === 'green_cross' ? '#2fbf71' : '#e23b3b'); box(.06, .5, .16, c, fx + mw / 2 + .04, roofY - .75, fz - .4); box(.06, .16, .5, c, fx + mw / 2 + .04, roofY - .58, fz - .4); break; }
      case 'clock': { const ct = tex(16, 16, (g) => { g.fillStyle = '#3a2a1e'; g.fillRect(0, 0, 16, 16); g.fillStyle = '#f4f1ea'; g.beginPath(); g.arc(8, 8, 7, 0, 7); g.fill(); g.fillStyle = '#2b2b2b'; g.fillRect(7, 3, 2, 6); g.fillRect(8, 7, 4, 2); });
        const c = new THREE.Mesh(new THREE.BoxGeometry(.6, .6, .05), [trim, trim, trim, trim, mat(0xffffff, { map: ct }), trim]); c.position.set(fx, roofY - .45, fz + .04); add(c); break; }
      case 'flagpoles': for (const k of [-1, 0, 1]) { cyl(.02, .02, 2.2, mat('#d8d8d8'), fx + k * .5, plinthH, fz + .9, 6); box(.02, .3, .45, mat(k ? accent : '#f4f1ea'), fx + k * .5, plinthH + 1.85, fz + .9 + .23); } break;
      case 'siren': box(.3, .12, .14, glow('#e23b3b'), fx - .15, top, main.z); box(.3, .12, .14, glow('#2e86ab'), fx + .15, top, main.z); break;
      case 'postbox': box(.28, .5, .24, mat('#c23b2b'), fx + mw / 2 - .1, plinthH, fz + .5); break;
      case 'slide': { const s = box(.25, .05, 1.1, mat('#e3b448'), fx + mw / 2 + .5, .45, fz - .1); s.rotation.x = -.6; box(.25, .9, .25, mat(accent), fx + mw / 2 + .5, 0, fz - .6); break; }
      case 'banners': { const n = Math.min(4, Math.max(2, Math.round(mw / 1))); for (let k = 0; k < n; k++) box(.3, 1.2, .03, mat(k % 2 ? accent : '#c0392b'), fx - mw / 2 + (k + .5) * mw / n, roofY - 1.5, fz + .06); break; }
      case 'marquee_lights': break;
      case 'dumbbell': box(.8, .08, .08, mat('#5b5b5b'), fx, roofY + .4, main.z); for (const s of [-1, 1]) cyl(.18, .18, .12, mat('#2b2b2b'), fx + s * .35, roofY + .25, main.z, 10).rotation.z = Math.PI / 2; break;
      case 'floodlights': for (const s of [-1, 1]) { cyl(.04, .04, 3.4, mat('#9aa0a6'), fx + s * (mw / 2 + .2), 0, fz + .2, 6); box(.5, .3, .1, glow('#fff7d0'), fx + s * (mw / 2 + .2), 3.4, fz + .2); } break;
      case 'giant_pin': { const p = ball(.22, white, fx, roofY + .55, main.z); p.scale.set(1, 2, 1); box(.3, .05, .3, mat('#c23b2b'), fx, roofY + .7, main.z); break; }
      case 'chimney_stack': cyl(.22, .28, 2.4, surface('wall', 'brick', '#8a4a3a', 1, 2), fx - mw * .35, roofY, main.z - md * .25, 12); for (const k of [0, 1, 2]) ball(.2 + k * .06, mat('#d8d8d8'), fx - mw * .35 + k * .18, roofY + 2.6 + k * .25, main.z - md * .25); break;
      case 'weathervane': cyl(.02, .02, .6, mat('#3a3a3a'), fx, top, main.z, 4); box(.4, .1, .03, mat('#3a3a3a'), fx, top + .55, main.z); break;
      case 'mailbox': cyl(.03, .03, .55, mat('#5b4636'), fx - mw / 2 - .1, 0, fz + .6, 6); box(.2, .14, .26, mat(accent), fx - mw / 2 - .1, .55, fz + .6); break;
      case 'water_tank': for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(.04, .45, .04, mat('#5b4636'), fx + mw * .2 + sx * .2, roofY + .2, main.z + sz * .2); cyl(.3, .3, .5, surface('wall', 'wood_boards', '#8a5a34', 2, .5), fx + mw * .2, roofY + .65, main.z, 12); break;
      case 'chimney': box(.24, .7, .24, surface('wall', 'brick', '#8a4a3a', .3, .7), fx + mw * .25, roofY - .1, main.z - md * .2); break;
      case 'spire': { const s = new THREE.Mesh(new THREE.ConeGeometry(.3, 1.8, 8), mat(main.roof.color)); s.position.set(fx, top + .9, main.z); add(s); break; }
      case 'lamp': box(.4, .35, .4, glow('#fff2b0'), fx, top - .1, main.z); break;
      case 'sails': for (let k = 0; k < 4; k++) { const s = box(.18, 1.3, .03, mat('#f4f1ea'), 0, 0, 0); s.geometry.translate(0, .65, 0); s.position.set(fx, roofY - .6, fz + .12); s.rotation.z = k * Math.PI / 2 + .3; } break;
      default: break;
    }
  }

  // ---------- small props along the front ----------
  spec.props.forEach((p, i) => {
    enter('prop:' + i);
    const x = fx + p.x * (mw / 2 + .4), z = fz + (main.ground === 'portico' || main.ground === 'porch' || main.ground === 'marquee' ? 1.1 : .55);
    switch (p.type) {
      case 'plant': cyl(.14, .1, .24, mat('#b8643c'), x, 0, z, 8); ball(.22, mat('#4f8f46'), x, .4, z); break;
      case 'tree': cyl(.06, .08, .7, mat('#6b4026'), x, 0, z + .2, 6); ball(.42, mat('#4f8f46'), x, 1.0, z + .2); ball(.3, mat('#66a95a'), x + .15, 1.25, z + .25); break;
      case 'bench': box(.9, .06, .3, mat('#a8703e'), x, .36, z); for (const s of [-1, 1]) box(.06, .36, .26, mat('#5b4636'), x + s * .38, 0, z); break;
      case 'stool': cyl(.14, .14, .05, mat('#a8703e'), x, .42, z, 8); cyl(.03, .03, .42, mat('#5b4636'), x, 0, z, 4); break;
      case 'lantern': cyl(.1, .1, .24, glow(p.color), x, plinthH + GH - .35, fz + .25, 8); break;
      case 'flag': cyl(.025, .025, 1.6, mat('#dddddd'), x, 0, z, 6); box(.02, .45, .4, mat(p.color), x, 1.1, z + .2); break;
      case 'crate': box(.4, .36, .4, surface('wall', 'wood_boards', '#b8894e', .4, .36), x, 0, z); break;
      case 'barrel': cyl(.2, .2, .48, surface('wall', 'wood_boards', '#9a6233', 1, .5), x, 0, z, 10); break;
      case 'bike': for (const s of [-1, 1]) { const t = new THREE.Mesh(new THREE.TorusGeometry(.16, .025, 6, 12), mat('#2b2b2b')); t.position.set(x + s * .22, .16, z); add(t); } box(.44, .03, .03, mat(p.color), x, .3, z); break;
      case 'aboard': { const b = box(.4, .6, .05, mat('#2b2b2b'), x, 0, z); b.rotation.x = -.18; break; }
      case 'parasol': cyl(.02, .02, 1.2, mat('#dddddd'), x, 0, z, 4); { const c = new THREE.Mesh(new THREE.ConeGeometry(.55, .25, 8), mat(p.color)); c.position.set(x, 1.25, z); add(c); } cyl(.25, .25, .04, mat('#f4f1ea'), x, .55, z, 10); break;
      case 'bollard': cyl(.06, .06, .4, mat('#5b5b5b'), x, 0, z, 6); break;
      case 'vending': box(.42, .9, .35, mat(p.color), x, 0, z - .1); box(.3, .4, .02, glow('#c8f4ff'), x, .35, z + .08); break;
      case 'car': box(.95, .3, .5, mat(p.color), x, .1, z + .3); box(.55, .22, .46, mat(shade(p.color, .8)), x - .05, .4, z + .3); for (const s of [-1, 1]) for (const t of [-1, 1]) cyl(.1, .1, .08, mat('#222222'), x + s * .3, .02, z + .3 + t * .25, 8); break;
      case 'cat': box(.28, .14, .14, mat('#2a2a2a'), x, 0, z); box(.13, .12, .13, mat('#2a2a2a'), x + .17, .1, z); break;
    }
  });
  root.userData.shownLevels = Object.values(placed).reduce((a, m) => Math.max(a, m.shownBase + m.shown), 0);
  return root;
}
