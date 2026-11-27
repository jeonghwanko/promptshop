// Exterior v2: a normalized spec (see spec.js) → a three.js group.
// Visible faces are the front (+z, screen lower-left) and the side (+x, screen lower-right).
import * as THREE from 'three';
import { surface, mat, glow, shade, texMat, tex } from './materials.js';
import { buildRoof } from './roofs.js';
import { MAX_SHOWN_LEVELS } from './spec.js';

const GH = 1.45, FH = 1.25, PL = 0.12;                    // ground floor, upper floor, default plinth height
const levelY = (n) => (n <= 0 ? 0 : GH + (n - 1) * FH);
const GLASS = 0xbfe3ee;
let GLINT = null;

export function buildExterior(spec, section) {
  const root = new THREE.Group();
  let cur = root;
  const enter = (k) => { cur = (section && section(k)) || root; };
  const add = (o) => { o.traverse?.(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } }); cur.add(o); return o; };
  const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y + h / 2, z); return add(o); };
  const cyl = (r1, r2, h, m, x, y, z, seg = 10) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), m); o.position.set(x, y + h / 2, z); return add(o); };
  const ball = (r, m, x, y, z) => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), m); o.position.set(x, y, z); return add(o); };
  const st = spec.style_, trim = mat(spec.trim), accent = spec.accent;
  // daylight glass: sky blue with a lighter lower band and one diagonal glint per pane (the map is a sunny day)
  const glassM = mat(0xffffff, { map: GLINT ??= tex(8, 8, (g) => { g.fillStyle = '#8fd8ee'; g.fillRect(0, 0, 8, 8); g.fillStyle = '#6cc0e0'; g.fillRect(0, 5, 8, 3); g.fillStyle = '#eafcff'; for (let q = 0; q < 5; q++) g.fillRect(5 - q, q, 1, 1); }), emissive: 0x2a6f84 });
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
    if (!m.shownBase && m.shape !== 'bowl') box(w + .16, plinthH, d + .16, surface('wall', st.plinth?.material ?? 'concrete', st.plinth?.color ?? shade(m.wall.color, .55), w, .3), m.x, 0, m.z);

    if (m.shape === 'bowl') {
      // stadium: tiered stands on an ellipse around an open field
      const rx = w / 2, rz = d / 2, seg = 28, tiers = Math.max(2, Math.min(4, m.shown + 1));
      const field = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, .06, 28), mat('#5f9e4f')); field.scale.set(rx * .62, 1, rz * .62); field.position.set(m.x, .03, m.z); add(field);
      const dia = new THREE.Mesh(new THREE.BoxGeometry(rx * .35, .07, rx * .35), mat('#c98a4b')); dia.rotation.y = Math.PI / 4; dia.position.set(m.x, .04, m.z + rz * .1); add(dia);
      for (let t = 0; t < tiers; t++) for (let k = 0; k < seg; k++) {
        const a = k / seg * Math.PI * 2, sc = .7 + t * .1, x = m.x + Math.cos(a) * rx * sc, z = m.z + Math.sin(a) * rz * sc;
        const b = new THREE.Mesh(new THREE.BoxGeometry(rx * 2 * Math.PI / seg * sc * 1.05, .45 + t * .45, .32), t % 2 ? mat(shade(accent, .85)) : mat('#d8d4cc'));
        b.position.set(x, (.45 + t * .45) / 2, z); b.rotation.y = -a + Math.PI / 2; add(b);
      }
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { cyl(.05, .05, 3.6, mat('#9aa0a6'), m.x + sx * rx * .95, 0, m.z + sz * rz * .95, 6); box(.6, .35, .1, glow('#fff7d0'), m.x + sx * rx * .95, 3.6, m.z + sz * rz * .95); }
      placed[m.id].top = 3.9; continue;
    }
    if (m.shape === 'saucer') {
      // flying saucer: a flattened disc on a stem, a glass dome, a ring of lights
      const r = Math.min(w, d) / 2;
      cyl(r * .25, r * .3, 1.0, wm(2, 1), m.x, y0, m.z, 12);
      const disc = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 12), mat(m.wall.color)); disc.scale.y = .28; disc.position.set(m.x, y0 + 1.25, m.z); add(disc);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(r * .45, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(GLASS, { emissive: 0x2a5a6a })); dome.position.set(m.x, y0 + 1.42, m.z); add(dome);
      for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; ball(.07, glow(k % 2 ? accent : '#fff2b0'), m.x + Math.cos(a) * r * .97, y0 + 1.25, m.z + Math.sin(a) * r * .97); }
      placed[m.id].top = y0 + 1.42 + r * .45; continue;
    }
    if (m.shape === 'round') {
      const r = Math.min(w, d) / 2, rt = r * (m.taper ?? 1);
      cyl(rt, r, height, wm(r * 6, height), m.x, y0, m.z, 18);
      if (m.bands) for (let f = 1; f < m.shown; f += 2) { const t = (levelY(f) - levelY(0)) / height, rr = r + (rt - r) * t; cyl(rr + .01, rr + .01, Math.min(.6, FH * .5), mat(m.bands), m.x, y0 + levelY(f) - levelY(0), m.z, 18); }
      for (let f = 0; f < m.shown; f++) for (const a of [0.25, 0.75, 1.25]) { const o = new THREE.Mesh(new THREE.BoxGeometry(.04, .4, .22), glassM); o.position.set(m.x + Math.sin(a) * (r + .01), y0 + levelY(f) + .5, m.z + Math.cos(a) * (r + .01)); o.rotation.y = a; add(o); }
      const rs = m.taper ?? 1;
      let roof;
      if (m.roof.shape === 'flat') { roof = new THREE.Group(); const deck = new THREE.Mesh(new THREE.CylinderGeometry(rt + .06, rt + .06, .12, 18), mat(shade(m.wall.color, .8))); deck.position.y = .06; roof.add(deck); roof.userData.height = .12; }
      else roof = buildRoof({ ...m.roof, shape: ['dome', 'onion', 'cone'].includes(m.roof.shape) ? m.roof.shape : 'cone' }, w * rs, d * rs, { wall: wm(w, 1), wallColor: m.wall.color });
      roof.position.set(m.x, y0 + height, m.z); add(roof);
      if (m.crenel) crenels(m.x, m.z, rt * 2, rt * 2, y0 + height, m.wall, true);
      placed[m.id].top = y0 + height + roof.userData.height; placed[m.id].radiusTop = rt;
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
    if (m.crenel) crenels(m.x, m.z, w, d, y0 + height, m.wall, false);
    placed[m.id].top = y0 + height + roof.userData.height;
  }

  // battlements: merlons along the top edges
  function crenels(cx, cz, w, d, y, wall, round) {
    const mm = surface('wall', wall.material, shade(wall.color, .95), .3, .3);
    if (round) { const r = w / 2, n = Math.max(8, Math.round(r * 9)); for (let k = 0; k < n; k += 2) { const a = k / n * Math.PI * 2; box(.2, .28, .2, mm, cx + Math.cos(a) * r, y, cz + Math.sin(a) * r); } return; }
    box(w + .1, .14, d + .1, mm, cx, y, cz);
    for (const [len, put] of [[w, (u) => [cx + u, cz + d / 2]], [w, (u) => [cx + u, cz - d / 2]], [d, (u) => [cx + w / 2, cz + u]], [d, (u) => [cx - w / 2, cz + u]]]) {
      const n = Math.max(2, Math.round(len / .32)); for (let k = 0; k <= n; k += 2) { const [x, z] = put(-len / 2 + k * len / n); box(.18, .26, .18, mm, x, y + .14, z); }
    }
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
      case 'stairs_down': {
        // a basement entrance: steps going down into a dark doorway, lit from above
        box(1.0, .02, 1.1, mat('#2b2420'), m.x + w * .2, plinthH + .001, m.z + m.size[1] / 2 + .55);
        for (let k = 0; k < 4; k++) box(.9, .06, .2, mat('#8a8078'), m.x + w * .2, plinthH - k * .1, m.z + m.size[1] / 2 + .95 - k * .2);
        for (const s of [-1, 1]) box(.05, .5, 1.1, mat('#3a3a3a'), m.x + w * .2 + s * .5, plinthH, m.z + m.size[1] / 2 + .55);
        put(w * .2, 0, .7, .9, .04, mat('#1d1d1d')); box(.9, .12, .04, glow(accent), m.x + w * .2, plinthH + 1.0, m.z + m.size[1] / 2 + .04);
        windows(F, 0, h, m.rhythm, w); break;
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
    // the board carries only its colour: the picture is stamped on afterwards in crisp pixels (render.js stampSign), where root.userData.sign says
    const im = mat(spec.sign.bg), edge = mat(shade(spec.sign.bg, .6)), mark = (x, y, z, face) => { root.userData.sign = { x, y, z, face, icon: spec.sign.icon, fg: spec.sign.fg, bg: spec.sign.bg }; };
    // signs are drawn big (×1.85) with a light frame, so the picture reads at the map's chunky pixel size
    const SB = 1.85, frame = mat(shade(spec.sign.bg, 1.35)), board = (s) => { const g = new THREE.Group(), b = new THREE.Mesh(new THREE.BoxGeometry(s * SB, s * SB, .06), [edge, edge, edge, edge, im, edge]); g.add(b);
      const f = new THREE.Mesh(new THREE.BoxGeometry(s * SB + .1, s * SB + .1, .04), frame); f.position.z = -.02; g.add(f); return g; };
    const top = main.top ?? gy + 2;
    if (spec.sign.place === 'front') { const b = board(.72); b.position.set(fx + (main.ground === 'shopfront' ? mw * .33 : 0), gy + (main.shown > 1 ? .22 : -.18) + .38, fz + .12); add(b); mark(b.position.x, b.position.y, fz + .16, 'front'); }
    if (spec.sign.place === 'roof') { const b = board(.7); b.position.set(fx, top + .8, fz - .25); add(b); mark(fx, top + .8, fz - .21, 'front'); box(.05, .2, .05, trim, fx, top, fz - .25); }
    if (spec.sign.place === 'blade') { const b = new THREE.Mesh(new THREE.BoxGeometry(.06, .72 * SB, .72 * SB), [im, edge, edge, edge, edge, edge]); b.position.set(fx + mw / 2 + .42, gy + .35, fz - .4); add(b); mark(fx + mw / 2 + .46, gy + .35, fz - .4, 'side'); box(.3, .04, .04, trim, fx + mw / 2 + .15, gy + .6, fz - .3); }
    if (spec.sign.place === 'pole') { cyl(.06, .06, 2.6, mat('#9aa0a6'), fx + mw / 2 + .6, 0, fz + .5, 6); const b = board(.75); b.position.set(fx + mw / 2 + .6, 2.95, fz + .5); add(b); mark(fx + mw / 2 + .6, 2.95, fz + .54, 'front'); }
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
      case 'green_cross': case 'red_cross': { const c = glow(kind === 'green_cross' ? '#2fbf71' : '#e23b3b'), x = fx + mw / 2 + .08, y = roofY + .1;
        cyl(.03, .03, .4, mat('#9aa0a6'), x - .1, roofY - .05, fz - .45, 4);
        box(.12, .9, .3, c, x, y, fz - .45); box(.12, .3, .9, c, x, y + .3, fz - .45); break; }
      case 'clock': { const ct = tex(16, 16, (g) => { g.fillStyle = '#3a2a1e'; g.fillRect(0, 0, 16, 16); g.fillStyle = '#f4f1ea'; g.beginPath(); g.arc(8, 8, 7, 0, 7); g.fill(); g.fillStyle = '#2b2b2b'; g.fillRect(7, 3, 2, 6); g.fillRect(8, 7, 4, 2); });
        const c = new THREE.Mesh(new THREE.BoxGeometry(.6, .6, .05), [trim, trim, trim, trim, mat(0xffffff, { map: ct }), trim]); c.position.set(fx, roofY - .45, fz + .04); add(c); break; }
      case 'flagpoles': for (const k of [-1, 0, 1]) { cyl(.02, .02, 2.2, mat('#d8d8d8'), fx + k * .5, plinthH, fz + .9, 6); box(.02, .3, .45, mat(k ? accent : '#f4f1ea'), fx + k * .5, plinthH + 1.85, fz + .9 + .23); } break;
      case 'siren': box(.3, .12, .14, glow('#e23b3b'), fx - .15, top, main.z); box(.3, .12, .14, glow('#2e86ab'), fx + .15, top, main.z); break;
      case 'postbox': { const red = mat('#d6332a'); box(.42, .8, .36, red, fx + mw / 2 - .2, 0, fz + .6); box(.46, .06, .4, mat('#a82820'), fx + mw / 2 - .2, .8, fz + .6); box(.26, .04, .02, mat('#2b2b2b'), fx + mw / 2 - .2, .6, fz + .79);
        box(mw * .9, .14, .04, red, fx, gy - .05, fz + .07); break; }
      case 'sculpture': { // abstract sculptures on plinths in front of a gallery
        for (const [k, dx] of [[0, -.5], [1, .5]]) { box(.5, .3, .5, mat('#f4f1ea'), fx + dx * mw * .5, 0, fz + 1.0); const c = mat(k ? accent : '#2b2b2b');
          if (k) { const t = new THREE.Mesh(new THREE.TorusGeometry(.32, .09, 8, 16), c); t.position.set(fx + dx * mw * .5, .72, fz + 1.0); t.rotation.y = .6; add(t); }
          else { const b2 = box(.22, .9, .22, c, fx + dx * mw * .5, .3, fz + 1.0); b2.rotation.y = .5; b2.rotation.z = .25; } }
        break; }
      case 'outdoor_pool': { // a pool with loungers beside the house
        const px = fx + mw / 2 + 1.1, pz = fz - md * .35;
        box(1.7, .1, 2.2, mat('#e8eef2'), px, 0, pz); box(1.45, .12, 1.95, mat('#4fb3d9', { emissive: 0x0a3040 }), px, .01, pz);
        for (const dz of [-.6, .1]) { const l = box(.35, .08, .8, mat('#f4f1ea'), px + 1.15, .2, pz + dz); l.rotation.x = -.15; }
        const pr = new THREE.Mesh(new THREE.ConeGeometry(.45, .2, 8), mat(accent)); pr.position.set(px + 1.15, 1.2, pz + .9); add(pr); cyl(.02, .02, 1.1, mat('#dddddd'), px + 1.15, 0, pz + .9, 4); break; }
      case 'giant_glove': { const g = ball(.42, mat(accent === '#e2432f' ? accent : '#d6332a'), fx - mw * .2, roofY + .55, main.z); g.scale.set(1.15, 1, .9); ball(.18, mat('#d6332a'), fx - mw * .2 + .36, roofY + .55, main.z + .18); box(.5, .28, .42, mat('#f4f1ea'), fx - mw * .2 - .05, roofY + .02, main.z); break; }
      case 'stall_row': { const n = Math.max(3, Math.round(mw / .8)); for (let k = 0; k < n; k++) { const x = fx - mw / 2 + (k + .5) * mw / n, z = fz + 1.0, c = k % 2 ? accent : '#e2432f';
        box(.6, .45, .4, mat('#a8703e'), x, 0, z); for (let j = 0; j < 3; j++) ball(.08, mat(['#e2432f', '#e3b448', '#5b8a6a'][j]), x - .15 + j * .15, .52, z);
        for (const s of [-1, 1]) cyl(.02, .02, 1.0, mat('#cfcfcf'), x + s * .28, 0, z + .18, 4); const aw = box(.7, .05, .55, mat(c), x, 1.0, z); aw.rotation.x = -.25; } break; }
      case 'food_cart': { const x = fx + mw * .1, z = fz + .8; box(1.0, .5, .55, mat(accent), x, .25, z); for (const s of [-1, 1]) { const t = new THREE.Mesh(new THREE.TorusGeometry(.16, .05, 6, 12), mat('#2b2b2b')); t.position.set(x + s * .3, .17, z + .3); add(t); }
        for (const s of [-1, 1]) cyl(.02, .02, .9, mat('#cfcfcf'), x + s * .45, .75, z, 4); const aw = new THREE.Mesh(new THREE.PlaneGeometry(1.2, .7), mat(0xffffff, { map: stripes(accent, '#f4efe4'), side: THREE.DoubleSide, alphaTest: .5 })); aw.rotation.x = -Math.PI / 2 + .25; aw.position.set(x, 1.68, z); add(aw);
        box(.5, .1, .3, mat('#3a3d42'), x - .15, .75, z); for (let j = 0; j < 3; j++) { const b = ball(.07, mat('#c98a4b'), x - .25 + j * .1, .88, z); b.scale.set(1.4, .6, 1); } break; }
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
      case 'lamp': { // lighthouse lantern room: gallery, glass lantern, cap
        const tm = Object.values(placed).reduce((a, m) => ((m.top ?? 0) > (a.top ?? 0) ? m : a), main), r = (tm.radiusTop ?? Math.min(...tm.size) / 2), y = (tm.top ?? top) - (tm.roof?.shape === 'flat' ? .22 : 0);
        cyl(r + .2, r + .2, .08, mat('#3a3d42'), tm.x, y, tm.z, 16); for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; cyl(.015, .015, .3, mat('#3a3d42'), tm.x + Math.cos(a) * (r + .18), y + .08, tm.z + Math.sin(a) * (r + .18), 4); }
        cyl(r * .7, r * .7, .55, glow('#fff2b0'), tm.x, y + .08, tm.z, 12); const cap = new THREE.Mesh(new THREE.SphereGeometry(r * .78, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(accent)); cap.position.set(tm.x, y + .63, tm.z); add(cap);
        const beam = new THREE.Mesh(new THREE.ConeGeometry(.35, 2.4, 8, 1, true), mat('#fff6c8', { transparent: true, opacity: .35, depthWrite: false })); beam.rotation.z = Math.PI / 2; beam.position.set(tm.x + 1.4, y + .35, tm.z + .3); add(beam); break; }
      case 'sails': { // big windmill sails on the front, at the top of the tower
        const tm = Object.values(placed).reduce((a, m) => ((m.top ?? 0) > (a.top ?? 0) ? m : a), main), hub = (tm.top ?? top) - .9, zf = tm.z + (tm.radiusTop ?? tm.size[1] / 2) + .35;
        box(.14, .14, .5, mat('#4a3a2a'), tm.x, hub - .07, zf - .2);
        for (let k = 0; k < 4; k++) { const g = new THREE.Group(); g.position.set(tm.x, hub, zf); g.rotation.z = k * Math.PI / 2 + .4; cur.add(g);
          const arm = new THREE.Mesh(new THREE.BoxGeometry(.08, 2.3, .06), mat('#4a3a2a')); arm.position.y = 1.15; g.add(arm);
          const sail = new THREE.Mesh(new THREE.BoxGeometry(.42, 1.8, .03), mat('#f4efe4')); sail.position.set(.24, 1.35, .02); g.add(sail);
          g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); }
        break; }
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
