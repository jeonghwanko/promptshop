// 끼룩이 as a live, articulated voxel character: the SVOX rig (src/ui/gull/gulldata.js, from art/gull/sculpt.py) posed
// every frame and drawn by the T3 raymarcher (t3.js), with pixel effects on top (fx.js).
//   clips: idle (always: breathing, blinks, tilts, glances, cap and tail springs), talk (while text types),
//          cheer (one shot: happy eyes, flaps, a squash-and-stretch jump, landing), point (a wing aimed at the arrow).
// mountGull3D(host) → { talk(on), cheer(), point([x, y] | null), destroy() } — the same API as the flat gull, plus point.
import { RIG, VOX } from './gulldata.js';
import { CH, NCH, makeRig, makePose, clearPose, addClip, solvePose, unpackVolumes, Spring3, makeCamera, setCamera, m4, m4Mul, m4Ident, m4Point, m4Rot, m4Invert, deformPoint } from './svox.js';
import { T3, defaultLight } from './t3.js';
import { PixelFx } from './fx.js';

/** The fixed view: three-quarter, facing screen right (toward the speech bubble), a low pitch like the turnaround. */
export const VIEW = { yaw: -0.52, pitch: 0.30, cssPerTexel: 2, birdCss: 150, margin: { l: 10, r: 26, t: 22, b: 6 } };

let shared = null;
/** Rig + volumes, once per page. */
export async function loadGull() {
  if (shared) return shared;
  const rig = makeRig(RIG), vols = await unpackVolumes(RIG, VOX);
  const solid = rig.parts.map((p, i) => {     // the solid voxels' box in pivot-relative coordinates
    const [sx, sy, sz] = p.size, a = vols[i].albedo; let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
    for (let z = 0; z < sz; z++) for (let y = 0; y < sy; y++) for (let x = 0; x < sx; x++) if (a[((z * sy + y) * sx + x) * 4 + 3] > 127) {
      if (x < x0) x0 = x; if (y < y0) y0 = y; if (z < z0) z0 = z; if (x + 1 > x1) x1 = x + 1; if (y + 1 > y1) y1 = y + 1; if (z + 1 > z1) z1 = z + 1; }
    return [x0 - p.pivot[0], y0 - p.pivot[1], z0 - p.pivot[2], x1 - p.pivot[0], y1 - p.pivot[1], z1 - p.pivot[2]];
  });
  shared = { rig, vols, solid };
  return shared;
}

const smooth01 = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const approach = (v, target, rate, dt) => v + (target - v) * (1 - Math.exp(-rate * dt));

/** The character: clips layered with procedural life and springs into one solved pose. No DOM. */
export class GullCharacter {
  constructor(sh, { seed = 7 } = {}) {
    const rig = this.rig = sh.rig; this.sh = sh;
    const I = this.I = Object.fromEntries(rig.parts.map((p, i) => [p.name, i]));
    this.pose = makePose(rig); this.n = rig.parts.length;
    this.clips = rig.clips;
    // the point clip without the other wing's channels, one per side
    const pc = rig.clips.point, only = (side) => ({ ...pc, chans: pc.chans.filter((c) => c.part < 0 || !/^wing/.test(rig.parts[c.part].name) || rig.parts[c.part].name.endsWith(side)) });
    this.pointClip = { R: only('R'), L: only('L') };
    this.t = 0; this.tIdle = 0; this.tTalk = 0; this.wTalk = 0; this.talking = false;
    this.tCheer = -1; this.tPoint = 0; this.wPoint = 0; this.pointOn = false; this.side = 1;
    this.dir = new Float64Array([1, 0, 0]); this.view = new Float64Array([0, -1, 0]);
    this.aim = { R: m4(), L: m4() }; this.basisBuf = new Float64Array(18);
    this.seed = seed;
    this.glance = new Float64Array(3); this.glanceT = new Float64Array(3); this.nextGlance = 1.2;
    this.blinkT = -1; this.nextBlink = 2.2;
    this.springs = { cap: new Spring3(110, 9), tail: new Spring3(80, 8), tipR: new Spring3(140, 12), tipL: new Spring3(140, 12) };
    this.useSprings = true; this.procedural = true;
    this.featherIdx = I.feather;
    this.feathers = [0, 1].map(() => ({ on: false, age: 0, life: 1.3, p: new Float64Array(3), v: new Float64Array(3), r: new Float64Array(3), w: new Float64Array(3), M: m4(), inv: m4(), d: new Float64Array([0, 0, 0, 1, 0, 0, 0, 0]) }));
    this.events = []; this.fired = new Set();
    // render items: one per part (the feather part is drawn only as the effect feathers)
    const noShadow = new Set(['eyeR', 'eyeL', 'happyR', 'happyL', 'beakU', 'beakL']);
    this.partItems = rig.parts.map((p, i) => ({ part: i, M: this.pose.M[i], inv: this.pose.inv[i], d: this.pose.d[i], slot: i, shadow: !noShadow.has(p.name), emissive: p.emissive }));
    this.featherItems = this.feathers.map((f, k) => ({ part: I.feather, M: f.M, inv: f.inv, d: f.d, slot: this.n + k, shadow: true, emissive: 0 }));
    this.items = [];
    // the wing's rest direction (shoulder → joint) and its flat face (outward), for aiming
    const jr = rig.parts[I.wingTipR].restOffset, l = Math.hypot(...jr);
    this.wingAxis = [jr[0] / l, jr[1] / l, jr[2] / l];
    this.tmp = new Float64Array(3); this.tmp2 = new Float64Array(3); this.MT = m4(); this.lags = [0, 1, 2, 3].map(() => new Float64Array(3));
  }
  rnd() { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 4294967296; }
  talk(on) { this.talking = !!on; }
  cheer() { this.tCheer = 0; this.fired.clear(); this.events.push('start'); }
  /** World-space unit direction to point along (from the shoulder), or null. `view` = unit vector toward the camera. */
  point(dir, view) {
    if (!dir) { this.pointOn = false; return; }
    this.pointOn = true; this.dir.set(dir); if (view) this.view.set(view);
    const side = dir[0] < -0.25 ? -1 : dir[0] > 0.05 ? 1 : this.side;     // a little hysteresis around straight up
    if (side !== this.side && this.wPoint > 0.05) { this.wPoint = 0; }      // switch wings: the new one starts from rest
    this.side = side;
  }
  /** Rotation that takes the wing from rest to point along `d`, its flat face toward the camera (B1 · B0ᵀ). */
  aimMatrix(out, side, d) {
    const s = side, B = this.basisBuf;
    // aim a little outward (more when pointing up) so the wing clears the head and body; its face turns toward the viewer
    let x = d[0] + s * (0.3 + 0.25 * Math.max(0, d[2])), y = d[1], z = d[2]; const dl = Math.hypot(x, y, z); x /= dl; y /= dl; z /= dl;
    const v = this.view, w = this.wingAxis;
    GullCharacter.basis(B, 0, w[0] * s, w[1], w[2], s, 0, 0);
    GullCharacter.basis(B, 9, x, y, z, v[0] * 0.8 + s * 0.45, v[1] * 0.8, v[2] * 0.8 + 0.2);
    m4Ident(out);   // R = B1 · B0ᵀ
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out[c * 4 + r] = B[9 + r] * B[c] + B[12 + r] * B[3 + c] + B[15 + r] * B[6 + c];
    return out;
  }
  /** Orthonormal [a, n, a×n] into B[o..o+9]: a = axis, n = pref made perpendicular to a. */
  static basis(B, o, ax, ay, az, px, py, pz) {
    const k = px * ax + py * ay + pz * az; let nx = px - ax * k, ny = py - ay * k, nz = pz - az * k; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    B[o] = ax; B[o + 1] = ay; B[o + 2] = az; B[o + 3] = nx; B[o + 4] = ny; B[o + 5] = nz;
    B[o + 6] = ay * nz - az * ny; B[o + 7] = az * nx - ax * nz; B[o + 8] = ax * ny - ay * nx;
  }
  /** Scale a rotation matrix's angle by w (axis-angle), in place. */
  static partial(m, w) {
    const tr = m[0] + m[5] + m[10], ang = Math.acos(Math.min(1, Math.max(-1, (tr - 1) / 2)));
    if (ang < 1e-5 || w >= 0.9999) return m;
    let x = m[6] - m[9], y = m[8] - m[2], z = m[1] - m[4]; const l = Math.hypot(x, y, z);
    if (l < 1e-9) return m;           // ~180°: leave it (never happens for these aims)
    x /= l; y /= l; z /= l; const a = ang * w, c = Math.cos(a), s = Math.sin(a), t = 1 - c;
    m[0] = t * x * x + c; m[1] = t * x * y + s * z; m[2] = t * x * z - s * y;
    m[4] = t * x * y - s * z; m[5] = t * y * y + c; m[6] = t * y * z + s * x;
    m[8] = t * x * z + s * y; m[9] = t * y * z - s * x; m[10] = t * z * z + c;
    return m;
  }
  add(part, ch, v) { this.pose.vals[this.I[part] * NCH + CH[ch]] += v; }
  /** Pose at the current state, without advancing time (used by update and by the framing sweep). */
  compose(dtSprings) {
    const P = this.pose, I = this.I, cheerOn = this.tCheer >= 0, ct = this.tCheer;
    const cheerEnv = cheerOn ? smooth01(ct / 0.1) * (1 - smooth01((ct - 1.0) / 0.2)) : 0;
    clearPose(P);
    addClip(P, this.clips.idle, this.tIdle, 1 - 0.65 * cheerEnv);
    if (this.wTalk > 0) addClip(P, this.clips.talk, this.tTalk, this.wTalk * (1 - cheerEnv));
    if (cheerOn) addClip(P, this.clips.cheer, ct, 1);
    const side = this.side > 0 ? 'R' : 'L';
    if (this.wPoint > 0.001) {
      const w = smooth01(this.wPoint), d = this.dir;
      addClip(P, this.pointClip[side], this.tPoint, w);
      P.aim[this.side > 0 ? I.wingR : I.wingL] = GullCharacter.partial(this.aimMatrix(this.aim[side], this.side, d), w);
      // the head looks along the arm, the body leans a little toward it
      this.add('head', 'rotZ', 0.34 * d[0] * w); this.add('head', 'rotX', -0.28 * d[2] * w); this.add('body', 'rotY', 0.05 * d[0] * w);
    }
    if (this.procedural) {
      const gw = 1 - cheerEnv;
      this.add('head', 'rotZ', this.glance[0] * gw * (1 - 0.7 * smooth01(this.wPoint))); this.add('head', 'rotX', this.glance[1] * gw); this.add('head', 'rotY', this.glance[2] * gw);
      if (this.blinkT >= 0 && !cheerOn) {          // a quick blink: shut in 0.05 s, hold 0.04 s, open in 0.07 s
        const b = this.blinkT, k = b < 0.05 ? b / 0.05 : b < 0.09 ? 1 : Math.max(0, 1 - (b - 0.09) / 0.07);
        for (const e of ['eyeR', 'eyeL']) { this.add(e, 'squashZ', -0.65 * k); this.add(e, 'scale', -0.41 * k); }
      }
    }
    solvePose(this.rig, P);
    if (this.useSprings && dtSprings !== undefined) this.springStep(dtSprings);
  }
  /** Follow-through: the cap, the tail and the wing tips lag behind the motion and settle. */
  springStep(dt) {
    const P = this.pose, I = this.I, t = this.tmp, S = this.springs;
    const L = this.lags, lag = (k, spring, part, lx, ly, lz) => { m4Point(t, P.M[I[part]], lx, ly, lz); const x = spring.step(t, dt), o = L[k]; o[0] = x[0] - t[0]; o[1] = x[1] - t[1]; o[2] = x[2] - t[2]; return o; };
    const cap = lag(0, S.cap, 'head', 0, -0.5, 14), tail = lag(1, S.tail, 'body', 0, 12, 4);
    const tr = lag(2, S.tipR, 'wingTipR', 0, 0, 0), tl = lag(3, S.tipL, 'wingTipL', 0, 0, 0);
    const cl = (v, a) => Math.max(-a, Math.min(a, v));
    this.add('cap', 'rotY', cl(0.10 * cap[0], 0.35)); this.add('cap', 'rotX', cl(-0.10 * cap[1], 0.3)); this.add('cap', 'posZ', cl(0.45 * cap[2], 1.6));
    this.add('tail', 'rotZ', cl(-0.10 * tail[0], 0.4)); this.add('tail', 'rotX', cl(0.10 * tail[2], 0.45));
    this.add('wingTipR', 'rotY', cl(-0.10 * tr[0] + 0.06 * tr[2], 0.5)); this.add('wingTipL', 'rotY', cl(-0.10 * tl[0] - 0.06 * tl[2], 0.5));
    solvePose(this.rig, P);
  }
  update(dt) {
    dt = Math.min(dt, 0.1); this.t += dt; this.tIdle = (this.tIdle + dt) % this.clips.idle.duration;
    this.wTalk = Math.max(0, Math.min(1, this.wTalk + (this.talking ? dt / 0.12 : -dt / 0.18)));
    this.tTalk = this.wTalk > 0 ? (this.tTalk + dt) % this.clips.talk.duration : 0;
    const cheerOn = this.tCheer >= 0;
    this.wPoint = Math.max(0, Math.min(1, this.wPoint + (this.pointOn && !cheerOn ? dt / 0.28 : -dt / (cheerOn ? 0.1 : 0.22))));
    this.tPoint = (this.tPoint + dt) % this.clips.point.duration;
    if (cheerOn) {
      const ct = this.tCheer += dt;
      for (const [name, at] of [['launch', 0.14], ['flap', 0.3], ['land', 0.7]]) if (ct >= at && !this.fired.has(name)) { this.fired.add(name); this.events.push(name); if (name === 'flap') this.dropFeathers(); }
      if (ct >= this.clips.cheer.duration) this.tCheer = -1;
    }
    // idle life: glances every couple of seconds (toward the bubble more often while talking), random blinks
    if (this.procedural) {
      if (this.t >= this.nextGlance) {
        const r = this.rnd(), talkBias = this.talking ? 0.18 : 0;
        this.glanceT[0] = r < 0.3 ? 0 : (this.rnd() - 0.45) * 0.7 + talkBias; this.glanceT[1] = (this.rnd() - 0.4) * 0.16; this.glanceT[2] = (this.rnd() - 0.5) * 0.24;
        this.nextGlance = this.t + 1.4 + this.rnd() * 2.6;
      }
      for (let k = 0; k < 3; k++) this.glance[k] = approach(this.glance[k], this.glanceT[k], 7, dt);
      if (this.blinkT >= 0) { this.blinkT += dt; if (this.blinkT > 0.16) this.blinkT = -1; }
      else if (this.t >= this.nextBlink) { this.blinkT = 0; this.nextBlink = this.t + (this.rnd() < 0.2 ? 0.22 : 2.0 + this.rnd() * 3.2); }
    }
    this.compose(dt);
    this.featherStep(dt);
    this.collectItems();
  }
  dropFeathers() {
    const P = this.pose, I = this.I;
    this.feathers.forEach((f, k) => {
      const s = k ? -1 : 1; m4Point(f.p, P.M[I[s > 0 ? 'wingTipR' : 'wingTipL']], 0, 2, -1);
      f.on = true; f.age = 0; f.life = 1.15 + this.rnd() * 0.3;
      f.v[0] = s * (7 + this.rnd() * 4) + this.view[0] * 3; f.v[1] = this.view[1] * 3; f.v[2] = 7 + this.rnd() * 3;
      f.r[0] = this.rnd() * 6; f.r[1] = this.rnd() * 6; f.r[2] = this.rnd() * 6;
      f.w[0] = (this.rnd() - 0.5) * 9; f.w[1] = (this.rnd() - 0.5) * 6; f.w[2] = s * (3 + this.rnd() * 4);
    });
  }
  featherStep(dt) {
    const MT = this.MT;
    for (const f of this.feathers) {
      if (!f.on) continue;
      f.age += dt; if (f.age >= f.life) { f.on = false; continue; }
      const drag = Math.exp(-2.6 * dt);
      f.v[0] *= drag; f.v[1] *= drag; f.v[2] = f.v[2] * drag - 14 * dt;
      f.p[0] += (f.v[0] + Math.sin(f.age * 7) * 4) * dt; f.p[1] += f.v[1] * dt; f.p[2] = Math.max(0.6, f.p[2] + f.v[2] * dt);
      for (let k = 0; k < 3; k++) f.r[k] += f.w[k] * dt;
      const sc = 0.75 * (1 - smooth01((f.age - (f.life - 0.3)) / 0.3) * 0.6);
      m4Ident(f.M); f.M[12] = f.p[0]; f.M[13] = f.p[1]; f.M[14] = f.p[2];
      m4Mul(f.M, f.M, m4Rot(MT, 2, f.r[2])); m4Mul(f.M, f.M, m4Rot(MT, 0, f.r[0])); m4Mul(f.M, f.M, m4Rot(MT, 1, f.r[1]));
      MT.fill(0); MT[0] = MT[5] = MT[10] = sc; MT[15] = 1; m4Mul(f.M, f.M, MT); m4Invert(f.inv, f.M);
    }
  }
  collectItems() {
    const it = this.items, V = this.pose.vals, I = this.I; it.length = 0;
    const hidden = (name, dir, depth) => V[I[name] * NCH + CH.posY] * dir >= depth - 0.01;
    for (let i = 0; i < this.n; i++) {
      if (i === this.featherIdx) continue;
      const name = this.rig.parts[i].name;
      if (name.startsWith('happy') && !(V[i * NCH + CH.posY] < -0.01)) continue;    // still inside the head
      if (name.startsWith('eye') && hidden(name, 1, 3)) continue;
      it.push(this.partItems[i]);
    }
    for (let k = 0; k < 2; k++) if (this.feathers[k].on) it.push(this.featherItems[k]);
  }
  /** World points for the effects. */
  anchor(name, out) {
    const P = this.pose, I = this.I;
    if (name === 'head') return m4Point(out, P.M[I.head], 0, -1, 8);
    if (name === 'feet') { out[0] = P.root[0]; out[1] = -2; out[2] = 0; return out; }
    if (name === 'shoulder') return m4Point(out, P.M[I[this.side > 0 ? 'wingR' : 'wingL']], 0, 0, 0);
    if (name === 'top') return m4Point(out, P.M[I.cap], 0, 0, 5);
    return out;
  }
}

/** A screen direction (a right, b up; unit) → the world direction the wing aims along: in the camera plane, a little toward the viewer. */
export function screenDir(cam, a, b, out = new Float64Array(3)) {
  const R = cam.right, U = cam.up, F = cam.fwd;
  for (let k = 0; k < 3; k++) out[k] = R[k] * a + U[k] * b - F[k] * 0.3;
  const l = Math.hypot(out[0], out[1], out[2]); out[0] /= l; out[1] /= l; out[2] /= l; return out;
}

/** Sweep every clip and the point poses (springs and random life off) for the camera framing: [rmin, rmax, umin, umax] of the union, and of the rest pose. */
export function framing(ch, cam) {
  const { rig, sh } = ch, P = ch.pose, box = sh.solid, t = new Float64Array(3), dp = new Float64Array(3);
  const acc = () => [Infinity, -Infinity, Infinity, -Infinity];
  const take = (b) => {
    for (let i = 0; i < ch.n; i++) {
      if (i === ch.featherIdx) continue;
      const s = box[i], p = rig.parts[i];
      for (let c = 0; c < 8; c++) {
        deformPoint(dp, c & 1 ? s[3] : s[0], c & 2 ? s[4] : s[1], c & 4 ? s[5] : s[2], P.d[i], p.size[2], p.pivot[2]);
        m4Point(t, P.M[i], dp[0], dp[1], dp[2]);
        const r = t[0] * cam.right[0] + t[1] * cam.right[1] + t[2] * cam.right[2], u = t[0] * cam.up[0] + t[1] * cam.up[1] + t[2] * cam.up[2];
        if (r < b[0]) b[0] = r; if (r > b[1]) b[1] = r; if (u < b[2]) b[2] = u; if (u > b[3]) b[3] = u;
      }
    }
  };
  const saved = { proc: ch.procedural, spr: ch.useSprings }; ch.procedural = false; ch.useSprings = false;
  const all = acc(), rest = acc();
  ch.tIdle = 0; ch.wTalk = 0; ch.tCheer = -1; ch.wPoint = 0; clearPose(P); solvePose(rig, P); take(rest); take(all);
  for (const name of ['idle', 'talk', 'cheer']) {
    const c = rig.clips[name];
    for (let k = 0; k < 12; k++) {
      const tt = c.duration * k / 12;
      ch.tIdle = name === 'idle' ? tt : 0; ch.wTalk = name === 'talk' ? 1 : 0; ch.tTalk = tt; ch.tCheer = name === 'cheer' ? tt : -1;
      ch.compose(); take(all);
    }
  }
  ch.tCheer = -1; ch.wTalk = 0;
  const v = [-cam.fwd[0], -cam.fwd[1], -cam.fwd[2]];
  for (const d of [[0, 0, 1], [0.6, 0, 0.8], [1, 0, 0], [0.7, 0, -0.7], [-0.7, 0, 0.7], [-1, 0, 0], [0.3, 0, -0.95]]) {
    const l = Math.hypot(...d); ch.point([d[0] / l, d[1] / l, d[2] / l], v); ch.wPoint = 1;
    for (let k = 0; k < 4; k++) { ch.tPoint = k / 4; ch.compose(); take(all); }
  }
  ch.point(null); ch.wPoint = 0; ch.tPoint = 0; ch.tIdle = 0;
  ch.procedural = saved.proc; ch.useSprings = saved.spr;
  return { all, rest };
}

/**
 * Mount the live gull in `host` (the guide's .gbird). Resolves to the API, or rejects when WebGL2 or the data cannot
 * be used (the caller then falls back to the flat gull).
 */
export async function mountGull3D(host, opts = {}) {
  const qa = !!opts.qa;
  const sh = await loadGull();
  const wrap = document.createElement('div'); wrap.className = 'gull3d';
  const gc = document.createElement('canvas'), fc = document.createElement('canvas');
  gc.className = 'gl'; fc.className = 'fx'; if (qa) gc.dataset.qa = '1';
  wrap.append(gc, fc);
  const r3 = new T3(gc, { smooth: true });
  r3.setParts(sh.rig.parts.map((p, i) => ({ size: p.size, pivot: p.pivot, albedo: sh.vols[i].albedo, nao: sh.vols[i].nao })));
  const ch = new GullCharacter(sh, { seed: (Math.random() * 1e9) >>> 0 });
  const cam = makeCamera(); setCamera(cam, VIEW.yaw, VIEW.pitch, 20, 1, 0, 0, 0);
  const fr = framing(ch, cam), M = VIEW.margin;
  const restH = fr.rest[3] - fr.rest[2], tpv = (VIEW.birdCss / VIEW.cssPerTexel) / restH;      // virtual texels per voxel
  const fw = Math.ceil((fr.all[1] - fr.all[0]) * tpv) + M.l + M.r, fh = Math.ceil((fr.all[3] - fr.all[2]) * tpv) + M.t + M.b;
  const dpr = Math.max(1, window.devicePixelRatio || 1), ps = Math.max(1, Math.round(VIEW.cssPerTexel * dpr)), css = ps / dpr;
  r3.resize(fw, fh, ps);
  const fx = new PixelFx(fc); fx.resize(fw, fh);
  // the camera looks at the point that puts the union box inside the margins
  const rc = fr.all[0] - M.l / tpv + fw / tpv / 2, uc = fr.all[2] - M.b / tpv + fh / tpv / 2;
  const tx = cam.right[0] * rc + cam.up[0] * uc, ty = cam.right[1] * rc + cam.up[1] * uc, tz = cam.right[2] * rc + cam.up[2] * uc;
  setCamera(cam, VIEW.yaw, VIEW.pitch, fh / tpv / 2, fw / fh, tx, ty, tz);
  // layout: the host keeps the rest pose's box; the canvases hang around it
  const W = fw * css, H = fh * css, restW = (fr.rest[1] - fr.rest[0]) * tpv * css, restHc = restH * tpv * css;
  const left = (fr.rest[0] - (rc - fw / tpv / 2)) * tpv * css, bottom = (fr.rest[2] - (uc - fh / tpv / 2)) * tpv * css;
  host.replaceChildren(wrap); host.classList.add('live');
  host.style.width = Math.round(restW) + 'px'; host.style.height = Math.round(restHc) + 'px';
  Object.assign(wrap.style, { position: 'absolute', left: -Math.round(left) + 'px', bottom: -Math.round(bottom) + 'px', width: W + 'px', height: H + 'px', pointerEvents: 'none' });
  for (const c of [gc, fc]) Object.assign(c.style, { position: 'absolute', left: 0, top: 0, width: W + 'px', height: H + 'px', imageRendering: 'pixelated' });
  const light = defaultLight();
  const ems = { cols: sh.rig.emissiveColors, flat: new Float32Array(sh.rig.emissiveColors.flat()), strength: sh.rig.emissiveStrength };
  const frame = { VP: cam.VP, root: ch.pose.root, items: ch.items, light, emissive: ems };
  const view = [-cam.fwd[0], -cam.fwd[1], -cam.fwd[2]];
  // world point → virtual pixel (top-left origin) for the effects, through the same snapped camera the renderer uses
  const wp = new Float64Array(3);
  const toPx = (p) => { const VP = r3.VPs, x = VP[0] * p[0] + VP[4] * p[1] + VP[8] * p[2] + VP[12], y = VP[1] * p[0] + VP[5] * p[1] + VP[9] * p[2] + VP[13];
    return [(x + 1) * 0.5 * fw, (1 - (y + 1) * 0.5) * fh]; };
  const onEvent = (e) => {
    if (e === 'start') { const [x, y] = toPx(ch.anchor('top', wp)); fx.burst(x, y - 2); }
    else if (e === 'launch') { const [x, y] = toPx(ch.anchor('head', wp)); fx.sparkles(x, y - 6, 6, 22); }
    else if (e === 'land') { const [x, y] = toPx(ch.anchor('feet', wp)); fx.dust(x, y + 1, 9 * tpv * 0.9); }
  };
  // ---- the loop: only while the guide is shown
  const guideEl = host.closest('.guide') ?? host.parentElement;
  const shown = () => host.isConnected && !host.closest('[hidden]');
  let raf = 0, last = 0, dead = false;
  const step = (now) => {
    raf = 0; if (dead || !shown()) return;
    const dt = last ? (now - last) / 1000 : 0; last = now;
    ch.update(dt);
    r3.render(frame);
    for (const e of ch.events) onEvent(e); ch.events.length = 0;
    fx.update(dt); fx.draw();
    raf = requestAnimationFrame(step);
  };
  const wake = () => { if (!raf && !dead && shown()) { last = 0; raf = requestAnimationFrame(step); } };
  const mo = guideEl ? new MutationObserver(wake) : null; mo?.observe(guideEl, { attributes: true, attributeFilter: ['hidden'] });
  wake();
  // ---- point: screen point (client px) of what the arrow points at → a world direction in the camera plane, toward the viewer a bit
  const pdir = new Float64Array(3);
  const shoulderPx = () => { const [x, y] = toPx(ch.anchor('shoulder', wp)), r = gc.getBoundingClientRect(); return [r.left + x / fw * r.width, r.top + y / fh * r.height]; };
  const api = {
    talk(on) { ch.talk(on); wake(); },
    cheer() { ch.cheer(); wake(); },
    point(pt) {
      if (!pt) { ch.point(null); return; }
      const [sx, sy] = shoulderPx(), dx = pt[0] - sx, dy = pt[1] - sy, l = Math.hypot(dx, dy);
      if (l < 12) { ch.point(null); return; }
      // the speech bubble sits to the right: a target right or down-right is pointed at from above it (75° up at least on screen before the wing's outward lean; the bird is drawn over the bubble's corner)
      let a = dx / l, b = -dy / l; if (a > 0 && opts.clearBubble !== false) { const an = Math.max(Math.atan2(b, a), 1.3); a = Math.cos(an); b = Math.sin(an); }
      ch.point(screenDir(cam, a, b, pdir), view); wake();
    },
    destroy() { dead = true; mo?.disconnect(); if (raf) cancelAnimationFrame(raf); r3.destroy(); },
    // for the QA page
    _: { ch, r3, fx, cam, frame, fw, fh, tpv, ps, step: (dt) => { ch.update(dt); r3.render(frame); for (const e of ch.events) onEvent(e); ch.events.length = 0; fx.update(dt); fx.draw(); } },
  };
  return api;
}
