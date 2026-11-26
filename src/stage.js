// A live view that rebuilds a shop after every step and drops the new part in from above.
import * as THREE from 'three';
import { makeBuilder } from './builder.js';
import { TILE_PX } from './render.js';

const PPU = TILE_PX / Math.SQRT2;

export class Stage {
  /** @param {'ext'|'int'} view */
  constructor(view, { width, height, lift } = {}) {
    this.view = view;
    this.W = width ?? (view === 'ext' ? 260 : 300); this.H = height ?? (view === 'ext' ? 250 : 260);
    const LIFT = lift ?? (view === 'ext' ? 0.68 : 0.6);
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1); this.renderer.setSize(this.W, this.H, false);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.canvas = this.renderer.domElement;
    const W = this.W, H = this.H;
    this.cam = new THREE.OrthographicCamera(-W / 2 / PPU, W / 2 / PPU, H / 2 / PPU, -H / 2 / PPU, 0.1, 200);
    const pitch = Math.PI / 6, yaw = Math.PI / 4;
    const dir = new THREE.Vector3(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw));
    this.cam.position.copy(dir).multiplyScalar(50); this.cam.lookAt(0, 0, 0); this.cam.updateMatrixWorld();
    const camUp = new THREE.Vector3().setFromMatrixColumn(this.cam.matrixWorld, 1);
    this.cam.position.addScaledVector(camUp, (LIFT - 0.5) * H / PPU); this.cam.updateMatrixWorld();
    this.drops = [];
    this.clear();
  }

  clear() {
    const scene = new THREE.Scene();
    const sun = new THREE.DirectionalLight(0xfff4e6, 1.9);
    sun.position.set(-1.25, 2.2, 0.35).multiplyScalar(20); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 80 }); sun.shadow.bias = -0.0015;
    scene.add(sun, new THREE.HemisphereLight(0xfff2e4, 0xb89880, 1.6));
    if (this.view === 'ext') {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.28 }));
      g.rotation.x = -Math.PI / 2; g.receiveShadow = true; scene.add(g);
    }
    this.scene?.traverse(o => { o.geometry?.dispose?.(); });
    this.scene = scene; this.drops = [];
    this.renderer.render(scene, this.cam);
  }

  /** Rebuild from the spec; the part named `key` drops in. */
  show(spec, key) {
    this.clear();
    const groups = new Map();
    const b = makeBuilder(this.scene, (k) => { if (!groups.has(k)) { const g = new THREE.Group(); this.scene.add(g); groups.set(k, g); } return groups.get(k); });
    if (this.view === 'ext') b.exterior(spec); else b.interior(spec);
    const g = key && groups.get(key);
    if (g) {
      // the floor-level parts rise out of the ground; everything else drops in from above
      g.userData.grow = key === 'base' || key === 'room'; g.userData.t0 = performance.now();
      if (g.userData.grow) g.scale.y = 0.02; else g.position.y = 1.6;
      this.drops.push(g);
    }
    this.tick();
  }

  tick() {
    const now = performance.now(); let busy = false;
    for (const g of this.drops) {
      const t = Math.min(1, (now - g.userData.t0) / 380);
      const k = 1 - Math.pow(1 - t, 3); // ease-out
      if (g.userData.grow) g.scale.y = 0.02 + 0.98 * k; else g.position.y = 1.6 * (1 - k);
      if (t < 1) busy = true; else { g.position.y = 0; g.scale.y = 1; }
    }
    this.renderer.render(this.scene, this.cam);
    if (busy) requestAnimationFrame(() => this.tick()); else this.drops = [];
  }
}
