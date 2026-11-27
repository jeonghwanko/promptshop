// Live view for spec v2: rebuild after every step; the part that changed drops in (or rises, for the whole building).
import * as THREE from 'three';
import { buildExterior } from './exterior.js';
import { normalize } from './spec.js';
import { setTexel } from './materials.js';

const PPU = 40 / Math.SQRT2;

export class Stage2 {
  constructor({ width = 520, height = 500, lift = 0.84 } = {}) {
    this.W = width; this.H = height;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true });
    // drawn at half size and shown doubled with a coloured outline, like the finished building on the map (render.js, mapview chunky())
    this.renderer.setPixelRatio(1); this.renderer.setSize(width / 2, height / 2, false); this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.small = document.createElement('canvas'); this.small.width = width / 2; this.small.height = height / 2;
    this.canvas = document.createElement('canvas'); this.canvas.width = width; this.canvas.height = height;
    this.cam = new THREE.OrthographicCamera(-width / 2 / PPU, width / 2 / PPU, height / 2 / PPU, -height / 2 / PPU, 0.1, 400);
    const pitch = Math.PI / 6, yaw = Math.PI / 4;
    const dir = new THREE.Vector3(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw));
    this.cam.position.copy(dir).multiplyScalar(100); this.cam.lookAt(0, 0, 0); this.cam.updateMatrixWorld();
    const up = new THREE.Vector3().setFromMatrixColumn(this.cam.matrixWorld, 1);
    this.cam.position.addScaledVector(up, (lift - 0.5) * height / PPU); this.cam.updateMatrixWorld();
    this.drops = [];
    this.clear();
  }
  clear() {
    this.scene?.traverse(o => o.geometry?.dispose?.());
    const scene = new THREE.Scene();
    const sun = new THREE.DirectionalLight(0xfff4dc, 1.75);   // the same light as render.js
    sun.position.set(-1.0, 3.4, 0.3).multiplyScalar(30); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 120 }); sun.shadow.bias = -0.0015;
    scene.add(sun, new THREE.HemisphereLight(0xb8ecff, 0xe6d7a8, 2.25));
    const g = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.36, color: 0x173f78 }));
    g.rotation.x = -Math.PI / 2; g.receiveShadow = true; scene.add(g);
    this.scene = scene; this.drops = [];
    this.renderer.render(scene, this.cam); this.blit();
  }
  /** @param input raw v2 input (type, style, overrides) @param key part that changed: 'all', 'mass:<id>', 'sign', 'hero', 'prop:<i>' */
  show(input, key) {
    this.clear();
    const groups = new Map();
    setTexel(2.4);   // half-size picture: patterns drawn bigger (materials.js)
    const root = buildExterior(normalize(input), (k) => { if (!groups.has(k)) groups.set(k, new THREE.Group()); return groups.get(k); });
    setTexel(1);
    for (const g of groups.values()) root.add(g);
    this.scene.add(root);
    const target = key === 'all' ? root : groups.get(key);
    if (target) {
      target.userData.grow = key === 'all' || key === 'mass:main'; target.userData.t0 = performance.now();
      if (target.userData.grow) target.scale.y = 0.02; else target.position.y = 2;
      this.drops.push(target);
    }
    this.tick();
  }
  tick() {
    const now = performance.now(); let busy = false;
    for (const g of this.drops) {
      const t = Math.min(1, (now - g.userData.t0) / 420), k = 1 - Math.pow(1 - t, 3);
      if (g.userData.grow) g.scale.y = 0.02 + 0.98 * k; else g.position.y = 2 * (1 - k);
      if (t < 1) busy = true;
    }
    this.renderer.render(this.scene, this.cam); this.blit();
    if (busy) requestAnimationFrame(() => this.tick()); else this.drops = [];
  }
  /** The half-size picture, outlined (the colour it borders, darkened toward deep blue) and doubled onto .canvas. */
  blit() {
    const sw = this.small.width, sh = this.small.height, sg = this.small.getContext('2d', { willReadFrequently: true });
    sg.clearRect(0, 0, sw, sh); sg.drawImage(this.renderer.domElement, 0, 0);
    const im = sg.getImageData(0, 0, sw, sh), px = im.data, src = new Uint8ClampedArray(px), solid = (i) => src[i * 4 + 3] > 200;
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) { const i = y * sw + x; if (solid(i)) continue;
      const j = x + 1 < sw && solid(i + 1) ? i + 1 : x > 0 && solid(i - 1) ? i - 1 : y + 1 < sh && solid(i + sw) ? i + sw : y > 0 && solid(i - sw) ? i - sw : -1;
      if (j >= 0) { px[i * 4] = src[j * 4] * .42 + 8; px[i * 4 + 1] = src[j * 4 + 1] * .46 + 26; px[i * 4 + 2] = src[j * 4 + 2] * .5 + 62; px[i * 4 + 3] = 255; } }
    sg.putImageData(im, 0, 0);
    const g = this.canvas.getContext('2d'); g.imageSmoothingEnabled = false; g.clearRect(0, 0, this.W, this.H); g.drawImage(this.small, 0, 0, this.W, this.H);
  }
}
