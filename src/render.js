// Render one spec view to a canvas with the fixed isometric camera.
// Orthographic, yaw 45°, pitch 30° -> floor diamonds are exactly 2:1. One tile = 40 px wide.
import * as THREE from 'three';
import { makeBuilder } from './builder.js';

export const TILE_PX = 40;
const PPU = TILE_PX / Math.SQRT2;

/**
 * @param {object} shop   a shop spec: { ext, int }
 * @param {'ext'|'int'} view
 * @param {{pad?:number}} [opt]  padding in px around the building
 * @returns {HTMLCanvasElement}
 */
export function renderShop(shop, view, opt = {}) {
  const scene = new THREE.Scene();
  const pitch = Math.PI / 6, yaw = Math.PI / 4;
  const dir = new THREE.Vector3(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw));
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  cam.position.copy(dir).multiplyScalar(50); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
  const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);

  // Light from the upper-left back: top faces brightest, left (+z) mid, right (+x) shaded.
  const sun = new THREE.DirectionalLight(0xfff4e6, 1.9);
  sun.position.set(-1.25, 2.2, 0.35).multiplyScalar(20);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 80 });
  sun.shadow.bias = -0.0015;
  scene.add(sun, new THREE.HemisphereLight(0xfff2e4, 0xb89880, 1.6));

  const b = makeBuilder(scene);
  if (view === 'ext') b.exterior(shop.ext); else b.interior(shop.int);

  // Frame the building at a fixed pixel scale: the canvas grows with the building, the tile size never changes.
  const box = new THREE.Box3().setFromObject(scene);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const cx of [box.min.x, box.max.x]) for (const cy of [box.min.y, box.max.y]) for (const cz of [box.min.z, box.max.z]) {
    const p = new THREE.Vector3(cx, cy, cz); const sx = p.dot(right), sy = p.dot(up);
    x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
  }
  const pad = (opt.pad ?? 10) / PPU, shadowPad = view === 'ext' ? 46 / PPU : pad;
  const L = Math.floor((x0 - pad) * PPU) / PPU, R = Math.ceil((x1 + shadowPad) * PPU) / PPU;
  const B = Math.floor((y0 - (view === 'ext' ? 24 / PPU : pad)) * PPU) / PPU, T = Math.ceil((y1 + pad) * PPU) / PPU;
  Object.assign(cam, { left: L, right: R, bottom: B, top: T }); cam.updateProjectionMatrix();
  const W = Math.round((R - L) * PPU), H = Math.round((T - B) * PPU);

  if (view === 'ext') {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.28 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  }
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(W, H); renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.BasicShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.render(scene, cam);
  // Copy to a plain 2D canvas so the WebGL context can be released (browsers cap live contexts).
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  out.getContext('2d').drawImage(renderer.domElement, 0, 0);
  renderer.dispose(); renderer.forceContextLoss?.();
  return out;
}
