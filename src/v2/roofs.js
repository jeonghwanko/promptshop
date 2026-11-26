// Roofs on a rectangular mass. Local frame: the mass is centred at the origin, `w` along x, `d` along z,
// and the roof sits on y = 0. The ridge runs along x; `orientation: across` turns the roof 90°.
import * as THREE from 'three';
import { surface, mat, shade } from './materials.js';

export const ROOF_SHAPES = ['flat', 'gabled', 'hipped', 'half-hipped', 'hipped-and-gabled', 'skillion', 'saltbox', 'gambrel', 'mansard', 'pyramidal', 'sawtooth', 'dome', 'onion', 'cone', 'round'];

// Flat-shaded triangles with planar UVs (u along x, v along the slope), double-sided so eaves show their underside.
function tris(points, material) {
  const pos = [], uv = [];
  for (const [x, y, z] of points) { pos.push(x, y, z); uv.push(x, y + Math.abs(z)); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, material); m.castShadow = m.receiveShadow = true; return m;
}
const quad = (a, b, c, d) => [a, b, c, a, c, d];

/**
 * Build a roof. Returns a Group whose origin is the centre of the mass top.
 * @param {{shape:string,color:string,material?:string,pitch?:number,overhang?:number,eave?:string,orientation?:string}} r
 * @param {number} w  mass width (x)
 * @param {number} d  mass depth (z)
 * @param {{wall:THREE.Material, trim:string}} ctx  material for gable ends, trim colour
 */
export function buildRoof(r, w, d, ctx) {
  const g = new THREE.Group();
  const across = r.orientation === 'across' || (r.orientation !== 'along' && d > w * 1.15);
  if (across) { g.rotation.y = Math.PI / 2; [w, d] = [d, w]; }
  const ov = r.overhang ?? 0.18, X = w / 2 + ov, Z = d / 2 + ov;
  const pitch = r.pitch ?? 0.6;                       // rise per unit of half-depth
  const h = Math.max(0.25, Math.min(2.2, pitch * Z));
  const color = r.color ?? '#7a4a3a';
  const rm = surface('roof', r.material ?? 'roof_tiles', color, w + 2 * ov, Z * 1.2);
  rm.side = THREE.DoubleSide;
  const drop = h * ov / Z;                             // eaves hang below the wall top
  const add = (m) => { g.add(m); return m; };
  const ridgeCap = (len, y, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.1, 0.12), mat(shade(color, 0.7))); m.position.set(0, y, z); m.castShadow = true; add(m); };
  const gableEnds = (y0, apex, zc = 0, half = d / 2) => {
    for (const sx of [1, -1]) add(tris([[sx * w / 2, y0, half], [sx * w / 2, y0, -half], [sx * w / 2, apex, zc]], ctx.wall));
  };
  const slope = (rx, rz, top) => {
    // two long slopes + two end faces between the eave rectangle and a ridge segment
    const A = [-X, -drop, Z], B = [X, -drop, Z], C = [X, -drop, -Z], D = [-X, -drop, -Z], R1 = [-rx, top, rz], R2 = [rx, top, rz];
    add(tris([...quad(A, B, R2, R1), ...quad(C, D, R1, R2)], rm));
    if (rx < X - 1e-3) add(tris([B, C, R2, D, A, R1], rm));
  };

  switch (r.shape) {
    case 'flat': default: {
      const p = mat(shade(ctx.wallColor ?? '#bbbbbb', 0.85));
      const top = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, 0.06, d - 0.1), surface('roof', r.material ?? 'gravel', color, w, d)); top.position.y = 0.03; add(top);
      for (const [sx, sz, lx, lz] of [[0, d / 2, w + .1, .1], [0, -d / 2, w + .1, .1], [w / 2, 0, .1, d], [-w / 2, 0, .1, d]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(lx, .22, lz), p); m.position.set(sx, .11, sz); m.castShadow = true; add(m); }
      break;
    }
    case 'gabled': slope(X, 0, h - drop); gableEnds(0, h - drop); ridgeCap(2 * X + .08, h - drop); break;
    case 'saltbox': { const rz = -d * 0.22; slope(X, rz, h - drop); gableEnds(0, h - drop, rz); ridgeCap(2 * X + .08, h - drop, rz); break; }
    case 'hipped': { const rx = Math.max(0, X - Z); slope(rx, 0, h - drop); if (rx > 0.05) ridgeCap(2 * rx + .1, h - drop); break; }
    case 'pyramidal': slope(0, 0, h * 1.2 - drop); break;
    case 'half-hipped': {
      // gable walls up to 60% of the height, a small hip above
      const rx = X - Z * 0.45; slope(rx, 0, h - drop);
      const y1 = (h - drop) * 0.55, zt = d / 2 * 0.45;
      for (const sx of [1, -1]) add(tris([[sx * w / 2, 0, d / 2], [sx * w / 2, 0, -d / 2], [sx * w / 2, y1, -zt], [sx * w / 2, 0, d / 2], [sx * w / 2, y1, -zt], [sx * w / 2, y1, zt]], ctx.wall));
      ridgeCap(2 * rx + .08, h - drop); break;
    }
    case 'hipped-and-gabled': {
      // East Asian hip-and-gable (팔작지붕): hips below, a small upright gable at each end of the ridge
      const rx = Math.max(0.1, X - Z * 0.75), top = h - drop;
      slope(rx, 0, top);
      for (const sx of [1, -1]) add(tris([[sx * rx, top * 0.5, Z * 0.32], [sx * rx, top * 0.5, -Z * 0.32], [sx * rx, top, 0]], ctx.wall));
      ridgeCap(2 * rx + .3, top);
      break;
    }
    case 'skillion': {
      const A = [-X, -drop, Z], B = [X, -drop, Z], C = [X, h * 0.7, -Z], D = [-X, h * 0.7, -Z];
      add(tris(quad(A, B, C, D), rm));
      for (const sx of [1, -1]) add(tris([[sx * w / 2, 0, d / 2], [sx * w / 2, 0, -d / 2], [sx * w / 2, h * 0.7 * (d / 2 + Z) / (2 * Z), -d / 2]], ctx.wall));
      break;
    }
    case 'gambrel': {
      // barn roof: steep lower slopes, shallow upper slopes
      const t = h * 1.15, prof = [[-Z, -drop], [-Z * 0.62, t * 0.62], [0, t], [Z * 0.62, t * 0.62], [Z, -drop]];
      const pts = [];
      for (let i = 0; i < prof.length - 1; i++) { const [z0, y0] = prof[i], [z1, y1] = prof[i + 1]; pts.push(...quad([-X, y0, z0], [X, y0, z0], [X, y1, z1], [-X, y1, z1])); }
      add(tris(pts, rm));
      for (const sx of [1, -1]) { const e = prof.map(([z, y]) => [sx * w / 2, Math.max(0, y), Math.max(-d / 2, Math.min(d / 2, z))]); const fan = []; for (let i = 1; i < e.length - 1; i++) fan.push(e[0], e[i], e[i + 1]); add(tris(fan, ctx.wall)); }
      ridgeCap(2 * X + .06, t); break;
    }
    case 'mansard': {
      // steep lower slopes on all four sides with dormers, flat top
      const i = Math.min(X, Z) * 0.38, t = Math.min(1.4, h * 1.1);
      const A = [-X, -drop, Z], B = [X, -drop, Z], C = [X, -drop, -Z], D = [-X, -drop, -Z];
      const a = [-X + i, t, Z - i], b = [X - i, t, Z - i], c = [X - i, t, -Z + i], dd = [-X + i, t, -Z + i];
      add(tris([...quad(A, B, b, a), ...quad(B, C, c, b), ...quad(C, D, dd, c), ...quad(D, A, a, dd)], rm));
      add(tris(quad(a, b, c, dd), mat(shade(color, 0.85))));
      for (let k = 0, n = Math.max(1, Math.round(w / 0.9)); k < n; k++) { const x = -w / 2 + (k + .5) * w / n; const dm = new THREE.Mesh(new THREE.BoxGeometry(.3, .32, .2), ctx.wall); dm.position.set(x, t * 0.45, Z - i * 0.55); add(dm); const gl = new THREE.Mesh(new THREE.BoxGeometry(.2, .2, .02), mat(0xbfe3ee)); gl.position.set(x, t * 0.45, Z - i * 0.55 + .11); add(gl); }
      break;
    }
    case 'sawtooth': {
      const n = Math.max(2, Math.round(w / 1.1)), tw = w / n, rise = 0.55;
      for (let k = 0; k < n; k++) {
        const x0 = -w / 2 + k * tw, x1 = x0 + tw;
        add(tris([...quad([x0, 0, d / 2], [x0, 0, -d / 2], [x1, rise, -d / 2], [x1, rise, d / 2]), [x0, 0, d / 2], [x1, 0, d / 2], [x1, rise, d / 2], [x0, 0, -d / 2], [x1, rise, -d / 2], [x1, 0, -d / 2]], rm));
        const gl = new THREE.Mesh(new THREE.BoxGeometry(.03, rise - .08, d - .1), mat(0xbfe3ee, { emissive: 0x2a4a55 })); gl.position.set(x1 + .02, rise / 2, 0); add(gl);
      }
      break;
    }
    case 'dome': case 'onion': case 'cone': {
      const rr = Math.min(w, d) * (r.shape === 'dome' ? 0.47 : 0.42);
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(rr * .95, rr * .95, .3, 20), ctx.wall); drum.position.y = .15; add(drum);
      let m;
      if (r.shape === 'dome') m = new THREE.Mesh(new THREE.SphereGeometry(rr, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), rm);
      else if (r.shape === 'cone') m = new THREE.Mesh(new THREE.ConeGeometry(rr * 1.05, rr * 2.2, 16), rm);
      else { const p = []; for (let k = 0; k <= 12; k++) { const t = k / 12; p.push(new THREE.Vector2(rr * (Math.sin(t * Math.PI) * 1.05 + 0.25 * Math.sin(t * Math.PI * 0.9)) * (1 - t * 0.9) + 0.01, t * rr * 2.1)); } m = new THREE.Mesh(new THREE.LatheGeometry(p, 16), rm); }
      m.position.y = r.shape === 'cone' ? .3 + rr * 1.1 : .3; m.castShadow = m.receiveShadow = true; add(m);
      const fin = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .3, 6), mat(0xe8c060)); fin.position.y = .3 + (r.shape === 'dome' ? rr : rr * 2.15) + .1; add(fin);
      // a flat deck around the drum
      const deck = new THREE.Mesh(new THREE.BoxGeometry(w + .06, .1, d + .06), mat(shade(color, .8))); deck.position.y = .05; add(deck);
      break;
    }
    case 'round': {
      // barrel vault along x: the top half of a cylinder, flattened
      const holder = new THREE.Group(); holder.scale.y = 0.6 * Math.max(0.6, pitch) / 0.6; add(holder);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(Z, Z, 2 * X, 20, 1, false, 0, Math.PI), rm);
      m.rotation.z = Math.PI / 2; m.castShadow = m.receiveShadow = true; holder.add(m);
      for (const sx of [1, -1]) { const cap = new THREE.Mesh(new THREE.CircleGeometry(d / 2, 20, 0, Math.PI), ctx.wall); cap.rotation.y = sx * Math.PI / 2; cap.position.x = sx * w / 2; holder.add(cap); }
      break;
    }
  }
  // Upturned eave corners (East Asian roofs)
  if (r.eave === 'curl' && ['gabled', 'hipped', 'hipped-and-gabled', 'half-hipped'].includes(r.shape)) {
    for (const sx of [1, -1]) for (const sz of [1, -1]) { const c = new THREE.Mesh(new THREE.BoxGeometry(.24, .1, .14), mat(shade(color, .7))); c.position.set(sx * (X - .02), -drop + .1, sz * (Z - .02)); c.rotation.set(sz * .5, sx * .4, -sx * .35); c.castShadow = true; add(c); }
  }
  g.userData.height = r.shape === 'flat' ? .22 : h;
  return g;
}
