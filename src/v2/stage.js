// Live view for spec v2: rebuild after every step; the part that changed drops in (or rises, for the whole building).
import * as THREE from 'three';
import { buildExterior } from './exterior.js';
import { normalize } from './spec.js';

const PPU = 40 / Math.SQRT2;

export class Stage2 {
  constructor({ width = 520, height = 500, lift = 0.84 } = {}) {
    this.W = width; this.H = height;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1); this.renderer.setSize(width, height, false); this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.canvas = this.renderer.domElement;
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
    sun.position.set(-1.25, 2.2, 0.35).multiplyScalar(30); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 120 }); sun.shadow.bias = -0.0015;
    scene.add(sun, new THREE.HemisphereLight(0xb8ecff, 0xe6d7a8, 2.25));
    const g = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.36, color: 0x173f78 }));
    g.rotation.x = -Math.PI / 2; g.receiveShadow = true; scene.add(g);
    this.scene = scene; this.drops = [];
    this.renderer.render(scene, this.cam);
  }
  /** @param input raw v2 input (type, style, overrides) @param key part that changed: 'all', 'mass:<id>', 'sign', 'hero', 'prop:<i>' */
  show(input, key) {
    this.clear();
    const groups = new Map();
    const root = buildExterior(normalize(input), (k) => { if (!groups.has(k)) groups.set(k, new THREE.Group()); return groups.get(k); });
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
    this.renderer.render(this.scene, this.cam);
    if (busy) requestAnimationFrame(() => this.tick()); else this.drops = [];
  }
}
