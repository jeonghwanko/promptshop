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
 * soft: only the outline and big depth jumps (parts in front of others): a round character stays clean, not striped.
 */
function crispen(color, normal, depth, W, H, soft = false, lw = 1) {   // lw: line width in pixels (the render's resolution factor), so lines keep their weight
  const c = color.getContext('2d'), img = c.getImageData(0, 0, W, H), px = img.data;
  const n = normal.getContext('2d').getImageData(0, 0, W, H).data, d = depth.getContext('2d').getImageData(0, 0, W, H).data;
  const solid = (i) => n[i * 4 + 3] > 0, dep = (i) => 1 - d[i * 4] / 255,   /* depth pass writes 1 - z: near is bright */ nv = (i) => [n[i * 4] / 127.5 - 1, n[i * 4 + 1] / 127.5 - 1, n[i * 4 + 2] / 127.5 - 1];
  const src = new Uint8ClampedArray(px), dark = (i, k) => { px[i * 4] = src[i * 4] * k; px[i * 4 + 1] = src[i * 4 + 1] * k; px[i * 4 + 2] = src[i * 4 + 2] * k; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!solid(i)) {   // outside: an outline pixel if it touches the building
      let j = -1; for (let r = 1; r <= lw && j < 0; r++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx * r, yy = y + dy * r; if (xx >= 0 && yy >= 0 && xx < W && yy < H && solid(yy * W + xx)) { j = yy * W + xx; break; } }
      if (j >= 0) { px[i * 4] = src[j * 4] * .28; px[i * 4 + 1] = src[j * 4 + 1] * .26; px[i * 4 + 2] = src[j * 4 + 2] * .3; px[i * 4 + 3] = 255; }
      continue;
    }
    const di = dep(i), ni = nv(i); let k = 1, front = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let r = 1; r <= lw; r++) {
      const xx = x + dx * r, yy = y + dy * r; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const j = yy * W + xx; if (!solid(j)) continue;
      if (dep(j) - di > (soft ? .12 : .02)) k = Math.min(k, .55);                // I am in front of a jump: an inner outline
      if (soft || r > 1) continue;                                               // creases stay one pixel: fine detail inside a part
      const nj = nv(j); if (ni[0] * nj[0] + ni[1] * nj[1] + ni[2] * nj[2] < .5) k = Math.min(k, .82);   // a crease
    }
    if (soft) { if (k < 1) dark(i, k); continue; }
    // an inside corner: I sit behind the line through two opposite neighbours (a flat slanted wall stays on that line)
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) for (const r of [lw, 2 * lw, 3 * lw]) {
      const ax = x + dx * r, ay = y + dy * r, bx = x - dx * r, by = y - dy * r; if (ax < 0 || ay < 0 || bx < 0 || by < 0 || ax >= W || bx >= W || ay >= H || by >= H) continue;
      const a = ay * W + ax, b = by * W + bx; if (solid(a) && solid(b) && di - (dep(a) + dep(b)) / 2 > .006) front++; }
    k *= 1 - Math.min(.25, front * .03);                                           // inside corners and under eaves
    if (k < 1) dark(i, k);
  }
  c.putImageData(img, 0, 0);
}

export function renderBuilding(input, opt = {}) { return renderView(input, 'ext', opt).canvas; }

// ---------- the shared camera and render pipeline (buildings, cut-aways and voxel buttons all go through it) ----------
/** The fixed isometric camera: looking down 30°, turned 45°. */
function isoCamera(dist, far, yaw = Math.PI / 4, pitch = Math.PI / 6) {   // (other angles only for characters off the map)
  const dir = new THREE.Vector3(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw));
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, far);
  cam.position.copy(dir).multiplyScalar(dist); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
  return { cam, right: new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), up: new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1) };
}
const corners = (box) => { const out = []; for (const cx of [box.min.x, box.max.x]) for (const cy of [box.min.y, box.max.y]) for (const cz of [box.min.z, box.max.z]) out.push(new THREE.Vector3(cx, cy, cz)); return out; };
/** Frame a box on whole pixels (ppu pixels per world unit) with a margin in pixels on each side; returns the canvas size. */
function frameBox({ cam, right, up }, box, ppu, pad) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of corners(box)) { const sx = p.dot(right), sy = p.dot(up); x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy); }
  const L = Math.floor((x0 - pad.l / ppu) * ppu) / ppu, R = Math.ceil((x1 + pad.r / ppu) * ppu) / ppu, B = Math.floor((y0 - pad.b / ppu) * ppu) / ppu, T = Math.ceil((y1 + pad.t / ppu) * ppu) / ppu;
  Object.assign(cam, { left: L, right: R, bottom: B, top: T }); cam.updateProjectionMatrix();
  return { W: Math.round((R - L) * ppu), H: Math.round((T - B) * ppu) };
}
/**
 * Render the scene to a W×H canvas; with crisp, add the outline and corner shading from a normal and a depth pass.
 * skip(mesh): meshes left out of those passes (the ground, see-through ghosts).
 */
function shoot(scene, cam, box, W, H, { crisp, shadows = false, skip = () => false, soft = false, lw = 1 }) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(W, H); renderer.setClearColor(0x000000, 0);
  if (shadows) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.BasicShadowMap; }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.render(scene, cam);
  const out = document.createElement('canvas'); out.width = W; out.height = H; out.getContext('2d').drawImage(renderer.domElement, 0, 0);
  if (crisp) {
    const hidden = []; scene.traverse(o => { if (o.isMesh && skip(o)) { hidden.push(o); o.visible = false; } });
    const pass = (material, near, far) => { scene.overrideMaterial = material; if (near !== undefined) { cam.near = near; cam.far = far; cam.updateProjectionMatrix(); }
      renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, cam); const cv = document.createElement('canvas'); cv.width = W; cv.height = H; cv.getContext('2d').drawImage(renderer.domElement, 0, 0); return cv; };
    renderer.shadowMap.enabled = false; renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    const nCan = pass(new THREE.MeshNormalMaterial());
    // a tight near/far around the subject gives the 8-bit depth enough steps
    let dn = Infinity, df = -Infinity; const camDir = new THREE.Vector3(); cam.getWorldDirection(camDir);
    for (const p of corners(box)) { const dd = p.sub(cam.position).dot(camDir); dn = Math.min(dn, dd); df = Math.max(df, dd); }
    const dCan = pass(new THREE.MeshDepthMaterial(), Math.max(.1, dn - 1), df + 1);
    scene.overrideMaterial = null; for (const o of hidden) o.visible = true;
    crispen(out, nCan, dCan, W, H, soft, lw);
  }
  renderer.dispose(); renderer.forceContextLoss?.();
  return out;
}
/** The warm sun (with or without shadows) and the sky light every render uses. */
function addLights(scene, shadows, mapSize = 2048) {
  const sun = new THREE.DirectionalLight(0xfff4e6, 1.9); sun.position.set(-1.25, 2.2, 0.35).multiplyScalar(30);
  if (shadows) { sun.castShadow = true; sun.shadow.mapSize.set(mapSize, mapSize); Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 120 }); sun.shadow.bias = -0.0015; }
  scene.add(sun, new THREE.HemisphereLight(0xfff2e4, 0xb89880, 1.6));
}

/**
 * Render the exterior ('ext') or the stacked cross-section ('section'). Returns { canvas, labels: [{x, y, text, count}] } in canvas pixels.
 * opt.res: pixels per map pixel (1 = the map's 40 px tile; 2 draws the same picture with twice the detail, lines kept as thick). The result carries res.
 * opt.look: how a cut-away is drawn (see buildSection).
 */
export function renderView(input, view = 'ext', opt = {}) {
  const spec = input.style_ ? input : normalize(input);   // normalized specs carry style_
  const res = Math.max(1, Math.round(opt.res ?? 1));
  const scene = new THREE.Scene(), iso = isoCamera(100, 400), cam = iso.cam;
  addLights(scene, true, res > 1 ? 4096 : 2048);   // finer pixels need a finer shadow map, or the shadows go blocky
  let labels = [], fixtures = [], plan = null;
  if (view === 'section') { const sec = buildSection(spec, { owned: opt.owned, floor: opt.floor, look: opt.look }); scene.add(sec.group); labels = sec.labels; fixtures = sec.fixtures; plan = sec.plan; } else scene.add(buildExterior(spec));
  const crisp = opt.crisp ?? CRISP;
  if (crisp && opt.cel) toCel(scene);   // cel bands dull the walls here, so they are off unless asked for
  const box = new THREE.Box3().setFromObject(scene), { W, H } = frameBox(iso, box, PPU * res, { l: 10 * res, r: 56 * res, b: 26 * res, t: 10 * res });   // room on the right and below for the shadow
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.28 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const out = shoot(scene, cam, box, W, H, { crisp, lw: res, shadows: true, skip: (o) => o === ground || (o.material?.transparent && o.material.opacity < .6) });   // outlines on solid parts only
  out.dataset.levels = spec.levels;
  const v = new THREE.Vector3(), project = (x, y, z) => { v.set(x, y, z).project(cam); return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H]; };
  const [ax, ay] = project(0, 0, 0), anchor = { x: ax, y: ay };   // where the ground origin lands in the canvas
  const px = labels.map(l => { const [x, y] = project(l.pos.x, l.pos.y, l.pos.z); return { x, y, text: l.text, count: l.count }; });
  return { canvas: out, labels: px, anchor, fixtures, plan, project, res };
}

/**
 * Render a small voxel model the way buildings are rendered (same camera angle, light, outline and corner shading).
 * voxels: [[x, y, z, '#rrggbb'], ...] with y up; k: screen pixels per voxel unit. Returns a canvas.
 */
/** bounds: [[x0, y0, z0], [x1, y1, z1]] to frame several pictures alike (an animation's frames); else the voxels' own box. */
export function renderVoxels(voxels, { k = 3, crisp = true, bounds = null, yaw, pitch, character = false } = {}) {
  // character: a figure off the map (the guide): its own angle, a light from the front and a clean outline
  const scene = new THREE.Scene(), iso = isoCamera(300, 1000, yaw, pitch);
  if (character) { const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(-.6, 1.2, 1.4).multiplyScalar(30); scene.add(key, new THREE.HemisphereLight(0xffffff, 0xa9b8c8, 1.9)); } else addLights(scene, false);
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), voxels.length);
  const m = new THREE.Matrix4(), col = new THREE.Color(), box = new THREE.Box3();
  voxels.forEach(([x, y, z, c], i) => { m.makeTranslation(x + .5, y + .5, z + .5); mesh.setMatrixAt(i, m); mesh.setColorAt(i, col.set(c)); box.expandByPoint(new THREE.Vector3(x, y, z)); box.expandByPoint(new THREE.Vector3(x + 1, y + 1, z + 1)); });
  if (bounds) { box.makeEmpty(); box.expandByPoint(new THREE.Vector3(...bounds[0])); box.expandByPoint(new THREE.Vector3(bounds[1][0] + 1, bounds[1][1] + 1, bounds[1][2] + 1)); }
  scene.add(mesh);
  const { W, H } = frameBox(iso, box, k, { l: 2, r: 2, b: 2, t: 2 });
  return shoot(scene, iso.cam, box, W, H, { crisp, soft: character });
}
