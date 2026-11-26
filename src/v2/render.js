// Render a v2 building to a canvas at a fixed pixel scale (one tile = 40 px wide); the canvas grows with the building.
import * as THREE from 'three';
import { buildExterior } from './exterior.js';
import { buildSection } from './interior.js';
import { normalize } from './spec.js';

const PPU = 40 / Math.SQRT2;

// ---------- the crisp look (borrowed from hybrid-voxel-sprite's T3 renderer): cel bands, contact shading and 1px outlines ----------
// Off by setCrisp(false) or opt.crisp === false, for comparing.
let CRISP = true;
export const setCrisp = (on) => { CRISP = !!on; };
let gradient = null;
function celRamp() {   // light bands, sampled with NEAREST so the steps stay hard
  if (gradient) return gradient;
  const steps = [150, 196, 232, 255], d = new Uint8Array(steps.flatMap(v => [v, v, v, 255]));   // four bands, kept bright so lit and shaded faces still read apart
  gradient = new THREE.DataTexture(d, steps.length, 1, THREE.RGBAFormat); gradient.minFilter = gradient.magFilter = THREE.NearestFilter; gradient.needsUpdate = true;
  return gradient;
}
function toCel(root) {
  root.traverse(o => { if (!o.isMesh || !o.material?.isMeshLambertMaterial) return; const m = o.material;
    o.material = new THREE.MeshToonMaterial({ color: m.color, map: m.map, transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite, emissive: m.emissive, gradientMap: celRamp() }); });
}
/**
 * Post-process on the pixel grid, from a normal pass and a depth pass:
 * - a dark 1px outline outside the silhouette (tinted from the pixel it borders),
 * - inner lines where depth jumps (the nearer side darkens) and softer lines at sharp creases,
 * - contact shading: pixels with nearer neighbours around them (inside corners) darken a little.
 */
function crispen(color, normal, depth, W, H) {
  const c = color.getContext('2d'), img = c.getImageData(0, 0, W, H), px = img.data;
  const n = normal.getContext('2d').getImageData(0, 0, W, H).data, d = depth.getContext('2d').getImageData(0, 0, W, H).data;
  const solid = (i) => n[i * 4 + 3] > 0, dep = (i) => 1 - d[i * 4] / 255,   /* depth pass writes 1 - z: near is bright */ nv = (i) => [n[i * 4] / 127.5 - 1, n[i * 4 + 1] / 127.5 - 1, n[i * 4 + 2] / 127.5 - 1];
  const src = new Uint8ClampedArray(px), dark = (i, k) => { px[i * 4] = src[i * 4] * k; px[i * 4 + 1] = src[i * 4 + 1] * k; px[i * 4 + 2] = src[i * 4 + 2] * k; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!solid(i)) {   // outside: an outline pixel if it touches the building
      let j = -1; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H && solid(yy * W + xx)) { j = yy * W + xx; break; } }
      if (j >= 0) { px[i * 4] = src[j * 4] * .28; px[i * 4 + 1] = src[j * 4 + 1] * .26; px[i * 4 + 2] = src[j * 4 + 2] * .3; px[i * 4 + 3] = 255; }
      continue;
    }
    const di = dep(i), ni = nv(i); let k = 1, front = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const j = yy * W + xx; if (!solid(j)) continue;
      if (dep(j) - di > .02) k = Math.min(k, .55);                              // I am in front of a jump: an inner outline
      const nj = nv(j); if (ni[0] * nj[0] + ni[1] * nj[1] + ni[2] * nj[2] < .5) k = Math.min(k, .82);   // a crease
    }
    // an inside corner: I sit behind the line through two opposite neighbours (a flat slanted wall stays on that line)
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) for (const r of [1, 2, 3]) {
      const ax = x + dx * r, ay = y + dy * r, bx = x - dx * r, by = y - dy * r; if (ax < 0 || ay < 0 || bx < 0 || by < 0 || ax >= W || bx >= W || ay >= H || by >= H) continue;
      const a = ay * W + ax, b = by * W + bx; if (solid(a) && solid(b) && di - (dep(a) + dep(b)) / 2 > .006) front++; }
    k *= 1 - Math.min(.25, front * .03);                                           // inside corners and under eaves
    if (k < 1) dark(i, k);
  }
  c.putImageData(img, 0, 0);
}

export function renderBuilding(input, opt = {}) { return renderView(input, 'ext', opt).canvas; }

/** Render the exterior ('ext') or the stacked cross-section ('section'). Returns { canvas, labels: [{x, y, text, count}] } in canvas pixels. */
export function renderView(input, view = 'ext', opt = {}) {
  const spec = input.style_ ? input : normalize(input);   // normalized specs carry style_
  const scene = new THREE.Scene();
  const pitch = Math.PI / 6, yaw = Math.PI / 4;
  const dir = new THREE.Vector3(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw));
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
  cam.position.copy(dir).multiplyScalar(100); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
  const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
  const sun = new THREE.DirectionalLight(0xfff4e6, 1.9);
  sun.position.set(-1.25, 2.2, 0.35).multiplyScalar(30);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 120 });
  sun.shadow.bias = -0.0015;
  scene.add(sun, new THREE.HemisphereLight(0xfff2e4, 0xb89880, 1.6));
  let labels = [];
  let fixtures = [], plan = null;
  if (view === 'section') { const sec = buildSection(spec, { owned: opt.owned }); scene.add(sec.group); labels = sec.labels; fixtures = sec.fixtures; plan = sec.plan; } else scene.add(buildExterior(spec));
  const crisp = opt.crisp ?? CRISP;
  if (crisp && opt.cel) toCel(scene);   // cel bands dull the walls here, so they are off unless asked for

  const box = new THREE.Box3().setFromObject(scene);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const cx of [box.min.x, box.max.x]) for (const cy of [box.min.y, box.max.y]) for (const cz of [box.min.z, box.max.z]) {
    const p = new THREE.Vector3(cx, cy, cz); const sx = p.dot(right), sy = p.dot(up);
    x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
  }
  const pad = 10 / PPU;
  const L = Math.floor((x0 - pad) * PPU) / PPU, R = Math.ceil((x1 + 56 / PPU) * PPU) / PPU;
  const B = Math.floor((y0 - 26 / PPU) * PPU) / PPU, T = Math.ceil((y1 + pad) * PPU) / PPU;
  Object.assign(cam, { left: L, right: R, bottom: B, top: T }); cam.updateProjectionMatrix();
  const W = Math.round((R - L) * PPU), H = Math.round((T - B) * PPU);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.28 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(W, H); renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.BasicShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.render(scene, cam);
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  out.getContext('2d').drawImage(renderer.domElement, 0, 0);
  if (crisp) {
    // normals and depth of the solid parts only (no ground, no see-through ghosts)
    const hidden = []; scene.traverse(o => { if (o.isMesh && (o === ground || (o.material?.transparent && o.material.opacity < .6))) { hidden.push(o); o.visible = false; } });
    const pass = (material, near, far) => { scene.overrideMaterial = material; if (near !== undefined) { cam.near = near; cam.far = far; cam.updateProjectionMatrix(); }
      renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, cam); const cv = document.createElement('canvas'); cv.width = W; cv.height = H; cv.getContext('2d').drawImage(renderer.domElement, 0, 0); return cv; };
    renderer.shadowMap.enabled = false; renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    const nCan = pass(new THREE.MeshNormalMaterial());
    // a tight near/far around the building gives the 8-bit depth enough steps
    let dn = Infinity, df = -Infinity; const dv = new THREE.Vector3(); const camDir = new THREE.Vector3(); cam.getWorldDirection(camDir);
    for (const cx of [box.min.x, box.max.x]) for (const cy of [box.min.y, box.max.y]) for (const cz of [box.min.z, box.max.z]) { const dd = dv.set(cx, cy, cz).sub(cam.position).dot(camDir); dn = Math.min(dn, dd); df = Math.max(df, dd); }
    const dCan = pass(new THREE.MeshDepthMaterial(), Math.max(.1, dn - 1), df + 1);
    scene.overrideMaterial = null; for (const o of hidden) o.visible = true;
    crispen(out, nCan, dCan, W, H);
  }
  renderer.dispose(); renderer.forceContextLoss?.();
  out.dataset.levels = spec.levels;
  const o = new THREE.Vector3(0, 0, 0).project(cam), anchor = { x: (o.x + 1) / 2 * W, y: (1 - o.y) / 2 * H };   // where the ground origin lands in the canvas
  const px = labels.map(l => { const v = l.pos.clone().project(cam); return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H, text: l.text, count: l.count }; });
  const v = new THREE.Vector3(), project = (x, y, z) => { v.set(x, y, z).project(cam); return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H]; };
  return { canvas: out, labels: px, anchor, fixtures, plan, project };
}
