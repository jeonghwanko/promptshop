// Render one spec view to a canvas with the fixed isometric camera.
// Orthographic, yaw 45°, pitch 30° -> floor diamonds are exactly 2:1. One tile = 40 px wide.
import * as THREE from 'three';
import { makeBuilder } from './builder.js';

export const TILE_PX = 40;
const PPU = TILE_PX / Math.SQRT2;

/**
 * @param {object} shop   a shop spec: { ext, int }
 * @param {'ext'|'int'} view
 * @param {{width?:number,height?:number,lift?:number}} [opt]  lift = where the floor origin sits (0 top, 1 bottom)
 * @returns {HTMLCanvasElement}
 */
export function renderShop(shop, view, opt = {}) {
  const W = opt.width ?? (view === 'ext' ? 260 : 300), H = opt.height ?? (view === 'ext' ? 250 : 260);
  const LIFT = opt.lift ?? (view === 'ext' ? 0.68 : 0.6);
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(W, H); renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.BasicShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-W / 2 / PPU, W / 2 / PPU, H / 2 / PPU, -H / 2 / PPU, 0.1, 200);
  const pitch = Math.PI / 6, yaw = Math.PI / 4;
  const dir = new THREE.Vector3(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw));
  cam.position.copy(dir).multiplyScalar(50); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
  const camUp = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
  cam.position.addScaledVector(camUp, (LIFT - 0.5) * H / PPU); cam.updateMatrixWorld();

  // Light from the upper-left back: top faces brightest, left (+z) mid, right (+x) shaded.
  const sun = new THREE.DirectionalLight(0xfff4e6, 1.9);
  sun.position.set(-1.25, 2.2, 0.35).multiplyScalar(20);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 80 });
  sun.shadow.bias = -0.0015;
  scene.add(sun, new THREE.HemisphereLight(0xfff2e4, 0xb89880, 1.6));

  const b = makeBuilder(scene);
  if (view === 'ext') {
    b.exterior(shop.ext);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.28 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  } else {
    b.interior(shop.int);
  }
  renderer.render(scene, cam);
  // Copy to a plain 2D canvas so the WebGL context can be released (browsers cap live contexts).
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  out.getContext('2d').drawImage(renderer.domElement, 0, 0);
  renderer.dispose(); renderer.forceContextLoss?.();
  return out;
}
