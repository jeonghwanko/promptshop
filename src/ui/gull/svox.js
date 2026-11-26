// SVOX runtime for 끼룩이: the rig, its clips, the per-slice deform and its exact inverse, FK, springs and the camera.
// Every formula is the hybrid-voxel-sprite contract (references/01_contract_and_math.md), the same as svox_cli.py:
// right-handed, +Z up, the bird faces -Y, 1 unit = 1 voxel. Matrices are column-major Float64Array(16).
// Nothing here allocates per frame: poses, matrices and scratch are made once per rig.

export const CH = { posX: 0, posY: 1, posZ: 2, rotX: 3, rotY: 4, rotZ: 5, scale: 6, shearX: 7, shearY: 8, twistZ: 9, squashZ: 10, waveAmpX: 11, waveAmpY: 12, waveFreq: 13, wavePhase: 14 };
export const NCH = 15;

// ---------------------------------------------------------------- 4x4 matrices
export const m4 = () => { const m = new Float64Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; };
export function m4Ident(o) { o.fill(0); o[0] = o[5] = o[10] = o[15] = 1; return o; }
const T16 = new Float64Array(16);
export function m4Mul(o, a, b) {   // o = a * b (o may alias a or b)
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
    for (let r = 0; r < 4; r++) T16[c * 4 + r] = a[r] * b0 + a[4 + r] * b1 + a[8 + r] * b2 + a[12 + r] * b3;
  }
  o.set(T16); return o;
}
export function m4Translate(o, x, y, z) { m4Ident(o); o[12] = x; o[13] = y; o[14] = z; return o; }
export function m4Rot(o, axis, a) {
  const c = Math.cos(a), s = Math.sin(a); m4Ident(o);
  if (axis === 0) { o[5] = c; o[6] = s; o[9] = -s; o[10] = c; }
  else if (axis === 1) { o[0] = c; o[2] = -s; o[8] = s; o[10] = c; }
  else { o[0] = c; o[1] = s; o[4] = -s; o[5] = c; }
  return o;
}
export function m4Invert(o, m) {
  const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3], a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
  const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11], a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06, d = 1 / det;
  o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * d; o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * d;
  o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * d; o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * d;
  o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * d; o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * d;
  o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * d; o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * d;
  o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * d; o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * d;
  o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * d; o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * d;
  o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * d; o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * d;
  o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * d; o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * d;
  return o;
}
export function m4Point(o, m, x, y, z) { o[0] = m[0] * x + m[4] * y + m[8] * z + m[12]; o[1] = m[1] * x + m[5] * y + m[9] * z + m[13]; o[2] = m[2] * x + m[6] * y + m[10] * z + m[14]; return o; }

// ---------------------------------------------------------------- the per-slice deform (d = [shearX, shearY, twistZ, squashZ, waveAmpX, waveAmpY, waveFreq, wavePhase])
export const isIdentity = (d) => !d[0] && !d[1] && !d[2] && d[3] === 1 && !d[4] && !d[5];
export function deformPoint(o, lx, ly, lz, d, sizeZ, pivotZ) {
  if (isIdentity(d)) { o[0] = lx; o[1] = ly; o[2] = lz; return o; }
  const sq = d[3], xys = 1 / Math.sqrt(Math.max(0.35, sq)), uz = Math.min(1, Math.max(0, (lz + pivotZ) / sizeZ));
  const x = lx * xys, y = ly * xys, z = lz * sq, t = d[2] * uz, c = Math.cos(t), s = Math.sin(t);
  let rx = c * x - s * y, ry = s * x + c * y;
  rx += d[0] * z; ry += d[1] * z;
  const ang = uz * d[6] + d[7];
  rx += Math.sin(ang) * d[4] * uz; ry += Math.cos(ang) * d[5] * uz;
  o[0] = rx; o[1] = ry; o[2] = z; return o;
}
export function undeformPoint(o, dx, dy, dz, d, sizeZ, pivotZ) {
  if (isIdentity(d)) { o[0] = dx; o[1] = dy; o[2] = dz; return o; }
  const sq = d[3], xys = 1 / Math.sqrt(Math.max(0.35, sq)), lz = dz / (Math.abs(sq) < 1e-4 ? 1e-4 : sq);
  const uz = Math.min(1, Math.max(0, (lz + pivotZ) / sizeZ)), ang = uz * d[6] + d[7];
  let x = dx - Math.sin(ang) * d[4] * uz, y = dy - Math.cos(ang) * d[5] * uz;
  x -= d[0] * dz; y -= d[1] * dz;
  const t = d[2] * uz, c = Math.cos(t), s = Math.sin(t);
  o[0] = (c * x + s * y) / xys; o[1] = (-s * x + c * y) / xys; o[2] = lz; return o;
}

// ---------------------------------------------------------------- volumes from the packed module
/** VOX (base64 zlib) -> one Uint8Array per part: { albedo, nao } in texImage3D order. Needs DecompressionStream. */
export async function unpackVolumes(RIG, VOX) {
  const bin = Uint8Array.from(atob(VOX), (c) => c.charCodeAt(0));
  const raw = new Uint8Array(await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
  let at = 0;
  return RIG.parts.map((p) => {
    const n = p.size[0] * p.size[1] * p.size[2] * 4, albedo = raw.subarray(at, at + n), nao = raw.subarray(at + n, at + 2 * n);
    at += 2 * n; return { albedo, nao };
  });
}

// ---------------------------------------------------------------- the rig: parts in parent-first order, clips compiled
export function makeRig(RIG) {
  const byName = new Map(RIG.parts.map((p, i) => [p.name, i]));
  const order = [], state = new Map();
  const visit = (i) => { if (state.get(i) === 2) return; state.set(i, 1); const par = RIG.parts[i].parent; if (par) visit(byName.get(par)); state.set(i, 2); order.push(i); };
  RIG.parts.forEach((_, i) => visit(i));
  const parts = RIG.parts.map((p, i) => ({
    name: p.name, index: i, parent: p.parent ? byName.get(p.parent) : -1, pivot: p.pivot.slice(), restOffset: p.restOffset.slice(),
    restRotation: (p.restRotation ?? [0, 0, 0]).slice(), size: p.size.slice(), flipped: !!p.flippedCloth, emissive: +(p.emissive ?? 0) || 0,
  }));
  const clips = {};
  for (const c of RIG.clips ?? []) {
    clips[c.name] = { name: c.name, duration: c.duration, loop: c.loop !== false, chans: c.channels.map((ch) => ({
      part: ch.part === '@root' ? -1 : byName.get(ch.part), ch: ch.part === '@root' ? 'XYZ'.indexOf(ch.channel.slice(-1)) : CH[ch.channel],
      fn: ch.fn ?? 'sin', amp: +(ch.amp ?? 0), cycles: +(ch.cycles ?? 1), phase: +(ch.phase ?? 0), bias: +(ch.bias ?? 0),
      times: ch.times ? Float64Array.from(ch.times) : null, values: ch.values ? Float64Array.from(ch.values) : null })) };
  }
  const ems = (RIG.emissiveColors ?? []).filter((s) => typeof s === 'string' && /^#?[0-9a-fA-F]{6}$/.test(s)).slice(0, 6)
    .map((s) => { const h = s.replace('#', ''); return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255]; });
  const es = RIG.emissiveStrength;
  return { parts, order, byName, clips, targetHeight: RIG.targetHeight, emissiveColors: ems,
    emissiveStrength: Number.isFinite(es) && es !== null && es !== '' ? Math.min(1, Math.max(0, es)) : 0.9 };
}

/** channel value at time t (svox_cli channel_value). */
export function channelValue(c, t, dur) {
  const u = dur > 0 ? t / dur : 0;
  if (c.fn === 'sin') return c.bias + c.amp * Math.sin(2 * Math.PI * c.cycles * u + c.phase);
  if (c.fn === 'ramp') return c.bias + c.amp * c.cycles * u;
  const ts = c.times, vs = c.values, tt = dur > 0 ? t % dur : 0;
  if (tt <= ts[0]) return c.bias + vs[0];
  for (let i = 1; i < ts.length; i++) if (tt <= ts[i]) { const f = (tt - ts[i - 1]) / Math.max(1e-9, ts[i] - ts[i - 1]); return c.bias + vs[i - 1] + (vs[i] - vs[i - 1]) * f; }
  return c.bias + vs[vs.length - 1];
}

/** A pose buffer for a rig: channel values, root offset, per-part aim rotations, and the solved matrices. */
export function makePose(rig) {
  const n = rig.parts.length;
  return {
    vals: new Float64Array(n * NCH), root: new Float64Array(3),
    aim: Array.from({ length: n }, () => null),          // optional per-part 4x4 rotation applied before the channel rotations
    M: Array.from({ length: n }, m4), inv: Array.from({ length: n }, m4), d: Array.from({ length: n }, () => new Float64Array(8)),
    show: new Uint8Array(n).fill(1),
  };
}
export function clearPose(pose) { pose.vals.fill(0); pose.root.fill(0); pose.aim.fill(null); }
/** Add a clip's channels at time t with weight w (channels are additive offsets on the rest value). */
export function addClip(pose, clip, t, w = 1) {
  if (!clip || w === 0) return;
  const dur = clip.duration, tt = clip.loop ? t : Math.min(t, dur);
  for (const c of clip.chans) {
    // a one-shot clip held at its end evaluates its last key (keys wrap at duration otherwise)
    const v = (!clip.loop && tt >= dur) ? channelValue(c, dur - 1e-9, dur) : channelValue(c, tt, dur);
    if (c.part < 0) pose.root[c.ch] += v * w; else pose.vals[c.part * NCH + c.ch] += v * w;
  }
}

const A = new Float64Array(3), MT = m4(), MR = m4(), MX = m4();
/** FK exactly as svox_cli evaluate_pose: children ride the parent's deformed surface; M = attach · aim · Rz·Ry·Rx · [RotX(π)] · S. */
export function solvePose(rig, pose, useDeform = true) {
  const { parts } = rig, V = pose.vals, root = pose.root;
  for (const i of rig.order) {
    const p = parts[i], o = i * NCH, M = pose.M[i], d = pose.d[i];
    const lx = p.restOffset[0] + V[o], ly = p.restOffset[1] + V[o + 1], lz = p.restOffset[2] + V[o + 2];
    if (useDeform) { d[0] = V[o + 7]; d[1] = V[o + 8]; d[2] = V[o + 9]; d[3] = 1 + V[o + 10]; d[4] = V[o + 11]; d[5] = V[o + 12]; d[6] = V[o + 13]; d[7] = V[o + 14]; }
    else { d.fill(0); d[3] = 1; }
    if (p.parent >= 0) {
      const pp = parts[p.parent];
      deformPoint(A, lx, ly, lz, pose.d[p.parent], pp.size[2], pp.pivot[2]);
      m4Mul(M, pose.M[p.parent], m4Translate(MT, A[0], A[1], A[2]));
    } else m4Translate(M, root[0] + lx, root[1] + ly, root[2] + lz);
    if (pose.aim[i]) m4Mul(M, M, pose.aim[i]);
    m4Mul(M, M, m4Rot(MR, 2, p.restRotation[2] + V[o + 5]));
    m4Mul(M, M, m4Rot(MR, 1, p.restRotation[1] + V[o + 4]));
    m4Mul(M, M, m4Rot(MR, 0, p.restRotation[0] + V[o + 3]));
    if (p.flipped) m4Mul(M, M, m4Rot(MR, 0, Math.PI));
    const sc = 1 + V[o + 6];
    if (sc !== 1) { m4Ident(MX); MX[0] = MX[5] = MX[10] = sc; m4Mul(M, M, MX); }
    m4Invert(pose.inv[i], M);
  }
  return pose;
}

// ---------------------------------------------------------------- damped spring (semi-implicit Euler, fixed sub-steps)
export class Spring3 {
  constructor(k = 120, c = 14) { this.k = k; this.c = c; this.x = new Float64Array(3); this.v = new Float64Array(3); this.init = false; }
  reset(t) { this.x.set(t); this.v.fill(0); this.init = true; }
  step(target, dt) {
    if (!this.init) { this.reset(target); return this.x; }
    dt = Math.min(Math.max(dt, 0), 0.25); const n = Math.max(1, Math.ceil(dt * 240)), h = dt / n;
    for (let s = 0; s < n; s++) for (let k = 0; k < 3; k++) { this.v[k] += (this.k * (target[k] - this.x[k]) - this.c * this.v[k]) * h; this.x[k] += this.v[k] * h; }
    return this.x;
  }
}

// ---------------------------------------------------------------- orthographic orbit camera (01 §1)
/** View-projection for an ortho camera at (yaw, pitch) around `target`, halfH world units tall. Writes cam.{VP, right, up, fwd}. */
export function makeCamera() { return { V: m4(), P: m4(), VP: m4(), right: new Float64Array(3), up: new Float64Array(3), fwd: new Float64Array(3) }; }
export function setCamera(cam, yaw, pitch, halfH, aspect, tx, ty, tz) {
  const dx = Math.sin(yaw) * Math.cos(pitch), dy = -Math.cos(yaw) * Math.cos(pitch), dz = Math.sin(pitch);
  const f = cam.fwd; f[0] = -dx; f[1] = -dy; f[2] = -dz;
  const r = cam.right; r[0] = f[1]; r[1] = -f[0]; r[2] = 0; const rl = Math.hypot(r[0], r[1]); r[0] /= rl; r[1] /= rl;   // cross(f, +Z)
  const u = cam.up; u[0] = r[1] * f[2] - r[2] * f[1]; u[1] = r[2] * f[0] - r[0] * f[2]; u[2] = r[0] * f[1] - r[1] * f[0];
  const ex = tx + dx * 100, ey = ty + dy * 100, ez = tz + dz * 100, V = cam.V;
  V[0] = r[0]; V[4] = r[1]; V[8] = r[2]; V[12] = -(r[0] * ex + r[1] * ey + r[2] * ez);
  V[1] = u[0]; V[5] = u[1]; V[9] = u[2]; V[13] = -(u[0] * ex + u[1] * ey + u[2] * ez);
  V[2] = -f[0]; V[6] = -f[1]; V[10] = -f[2]; V[14] = (f[0] * ex + f[1] * ey + f[2] * ez);
  V[3] = V[7] = V[11] = 0; V[15] = 1;
  const halfW = halfH * aspect, n = -200, fa = 200, P = m4Ident(cam.P);
  P[0] = 1 / halfW; P[5] = 1 / halfH; P[10] = -2 / (fa - n); P[14] = -(fa + n) / (fa - n);
  m4Mul(cam.VP, P, V); return cam;
}
