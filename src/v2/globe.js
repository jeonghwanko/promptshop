// A pixel globe: drag to turn it, wheel or buttons to zoom, click to pick a place.
// Built buildings stand on its surface as small sprites; claimed neighbourhoods show as pins.
import * as THREE from 'three';
import { landCanvas } from './geo.js';

const D2R = Math.PI / 180;
/** Unit vector for lat/lng, matching three.js SphereGeometry UVs (u = (lng + 180) / 360, v = (90 - lat) / 180). */
export function latLngToVec(lat, lng, r = 1) {
  const u = (lng + 180) / 360 * Math.PI * 2, v = (90 - lat) / 180 * Math.PI;
  return new THREE.Vector3(-Math.cos(u) * Math.sin(v) * r, Math.cos(v) * r, Math.sin(u) * Math.sin(v) * r);
}
export function vecToLatLng(p) {
  const n = p.clone().normalize(), v = Math.acos(Math.max(-1, Math.min(1, n.y)));
  let u = Math.atan2(n.z, -n.x) / (Math.PI * 2); if (u < 0) u += 1;
  return [90 - v / Math.PI * 180, u * 360 - 180];
}

export class Globe {
  constructor(host, { onPick } = {}) {
    this.host = host; this.onPick = onPick;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    this.renderer.setPixelRatio(.5);              // chunky pixels, like the rest of the town
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.canvas = this.renderer.domElement; this.canvas.style.imageRendering = 'pixelated'; this.canvas.style.width = '100%'; this.canvas.style.display = 'block'; this.canvas.style.touchAction = 'none';
    host.append(this.canvas);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, .01, 100); this.dist = 3.6; this.camera.position.set(0, 0, this.dist);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.6)); const sun = new THREE.DirectionalLight(0xfff4e6, 1.4); sun.position.set(-2, 2, 3); this.scene.add(sun);
    this.world = new THREE.Group(); this.scene.add(this.world);
    const tex = new THREE.CanvasTexture(landCanvas()); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter;
    this.sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.MeshLambertMaterial({ map: tex })); this.world.add(this.sphere);
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.035, 48, 32), new THREE.MeshBasicMaterial({ color: 0x9fd3f0, transparent: true, opacity: .14, side: THREE.BackSide })); this.scene.add(atmo);
    this.pins = new THREE.Group(); this.world.add(this.pins); this.sprites = new THREE.Group(); this.world.add(this.sprites);
    this.marker = new THREE.Mesh(new THREE.ConeGeometry(.012, .05, 8), new THREE.MeshBasicMaterial({ color: 0xe2432f })); this.marker.visible = false; this.world.add(this.marker);
    this.yaw = -2.2; this.pitch = .55; this.goal = null;
    this.bind(); this.resize(); new ResizeObserver(() => this.resize()).observe(host);
    const loop = () => { this.tick(); requestAnimationFrame(loop); }; requestAnimationFrame(loop);
  }
  resize() { const w = this.host.clientWidth || 600, h = Math.max(320, Math.min(640, w * .75)); this.renderer.setSize(w, h, false); this.canvas.style.height = h + 'px'; this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  bind() {
    let down = null, moved = 0;
    this.canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; moved = 0; this.canvas.setPointerCapture(e.pointerId); this.goal = null; });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!down) return; const dx = e.clientX - down[0], dy = e.clientY - down[1]; moved += Math.abs(dx) + Math.abs(dy); down = [e.clientX, e.clientY];
      const k = .005 * (this.dist - 1); this.yaw += dx * k; this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch + dy * k));
    });
    this.canvas.addEventListener('pointerup', (e) => { if (down && moved < 6) this.pick(e); down = null; });
    this.canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom(e.deltaY > 0 ? 1.12 : 1 / 1.12); }, { passive: false });
  }
  zoom(f) { this.dist = Math.max(1.18, Math.min(4.5, 1 + (this.dist - 1) * f)); }
  pick(e) {
    const r = this.canvas.getBoundingClientRect(), m = new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(m, this.camera);
    const hit = ray.intersectObject(this.sphere)[0]; if (!hit) return;
    const [lat, lng] = vecToLatLng(this.world.worldToLocal(hit.point.clone()));
    this.setMarker(lat, lng); this.onPick?.(lat, lng);
  }
  setMarker(lat, lng) { const p = latLngToVec(lat, lng, 1.02); this.marker.position.copy(p); this.marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), p.clone().normalize().negate()); this.marker.visible = true; }
  /** Turn the globe so that lat/lng faces the camera, and zoom to `dist`. */
  focus(lat, lng, dist) {
    const d = latLngToVec(lat, lng), yaw = Math.atan2(-d.x, d.z), r = Math.hypot(d.x, d.z), pitch = Math.atan2(d.y, r);
    let dy = yaw - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.goal = { yaw: this.yaw + dy, pitch, dist: dist ?? this.dist };
  }
  tick() {
    if (this.goal) { const k = .12; this.yaw += (this.goal.yaw - this.yaw) * k; this.pitch += (this.goal.pitch - this.pitch) * k; this.dist += (this.goal.dist - this.dist) * k;
      if (Math.abs(this.goal.yaw - this.yaw) + Math.abs(this.goal.pitch - this.pitch) + Math.abs(this.goal.dist - this.dist) < .001) this.goal = null; }
    this.world.rotation.set(this.pitch, this.yaw, 0, 'XYZ');
    this.camera.position.set(0, 0, this.dist); this.camera.lookAt(0, 0, 0);
    // sprites shrink as you zoom out so they read as dots far away and as buildings up close
    const s = Math.max(.25, Math.min(1.6, (4.6 - this.dist) / 2));
    for (const sp of this.sprites.children) sp.scale.set(sp.userData.w * s, sp.userData.h * s, 1);
    this.renderer.render(this.scene, this.camera);
  }
  /** pins: [{ lat, lng, mine }] for claimed neighbourhoods */
  setPins(pins) {
    this.pins.clear();
    for (const p of pins) { const m = new THREE.Mesh(new THREE.SphereGeometry(p.mine ? .009 : .007, 6, 4), new THREE.MeshBasicMaterial({ color: p.mine ? 0xffd166 : 0xffffff })); m.position.copy(latLngToVec(p.lat, p.lng, 1.004)); this.pins.add(m); }
  }
  /** buildings: [{ lat, lng, canvas }] stand on the surface as sprites */
  setBuildings(list) {
    this.sprites.clear();
    for (const b of list) {
      const t = new THREE.CanvasTexture(b.canvas); t.magFilter = t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
      const w = b.canvas.width * .00022, h = b.canvas.height * .00022; sp.userData = { w, h }; sp.center.set(.5, .12);
      sp.position.copy(latLngToVec(b.lat, b.lng, 1.002)); this.sprites.add(sp);
    }
  }
}
