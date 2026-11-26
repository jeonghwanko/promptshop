// T3 hybrid voxel renderer for 끼룩이, in raw WebGL2 (no three.js: the game's three 0.160 stays the buildings' only copy).
// A port of the hybrid-voxel-sprite spec (references/02_shader_pipeline_spec.md, targets/webgl2_threejs.md):
//   pass 1 — a low-res MRT G-buffer (lit colour, world normal + foreground mask, D24 depth texture):
//            per-part ground shadows, then per-part OBB raymarch with the analytic inverse deform, gl_FragDepth with the
//            D24 depth-bucket tie-break, cel light, baked AO, self-shadow, the emissive slots;
//   pass 2 — a full-res texelFetch blit with the 1px depth/normal outline and the emissive halo.
// The canvas is transparent where there is no bird (premultiplied alpha), so it sits on the game's map.
import { m4, m4Mul, m4Invert, m4Point, deformPoint, isIdentity } from './svox.js';

const PART_VS = `#version 300 es
layout(location = 0) in vec3 aPos;
uniform mat4 uVP, uModel; uniform vec3 uBoxMin, uBoxMax;
void main() { gl_Position = uVP * uModel * vec4(mix(uBoxMin, uBoxMax, aPos), 1.0); }`;

const COMMON = `#version 300 es
precision highp float; precision highp int; precision highp sampler3D;
uniform mat4 uVP, uInvVP, uModel, uInvModel;
uniform vec4 uViewport;
uniform vec3 uSize, uPivot, uBoxMin, uBoxMax;
uniform vec4 uDefA;   // shearX, shearY, twistZ, squashZ
uniform vec4 uDefB;   // waveAmpX, waveAmpY, waveFreq, wavePhase
uniform sampler3D uVol;
void pixelRay(out vec3 ro, out vec3 rd) {
  vec2 ndc = (gl_FragCoord.xy - uViewport.xy) / uViewport.zw * 2.0 - 1.0;
  vec4 a = uInvVP * vec4(ndc, -1.0, 1.0), b = uInvVP * vec4(ndc, 1.0, 1.0);
  ro = a.xyz / a.w; rd = normalize(b.xyz / b.w - ro);
}
bool slab(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax, out float t0, out float t1) {
  vec3 r = vec3(abs(rd.x) < 1e-7 ? 1e-7 : rd.x, abs(rd.y) < 1e-7 ? 1e-7 : rd.y, abs(rd.z) < 1e-7 ? 1e-7 : rd.z);
  vec3 inv = 1.0 / r, ta = (bmin - ro) * inv, tb = (bmax - ro) * inv, lo = min(ta, tb), hi = max(ta, tb);
  t0 = max(max(lo.x, lo.y), lo.z); t1 = min(min(hi.x, hi.y), hi.z); return t1 > t0 && t1 > 0.0;
}
float edgeMask(vec3 v) { vec3 lo = clamp(v + 0.5, 0.0, 1.0), hi = clamp(uSize + 0.5 - v, 0.0, 1.0); return lo.x * lo.y * lo.z * hi.x * hi.y * hi.z; }
vec4 sampleSmooth(vec3 v) { return texture(uVol, v / uSize) * edgeMask(v); }
bool inGrid(ivec3 c) { return all(greaterThanEqual(c, ivec3(0))) && all(lessThan(c, ivec3(uSize))); }
float occCrisp(vec3 v) { ivec3 c = ivec3(floor(v)); return inGrid(c) && texelFetch(uVol, c, 0).a > 0.5 ? 1.0 : 0.0; }
vec3 invDeform(vec3 d) {
  float s = max(uDefA.w, 0.05), lz = d.z / s, uZ = clamp((lz + uPivot.z) / uSize.z, 0.0, 1.0), ph = uZ * uDefB.z + uDefB.w;
  float x = d.x - sin(ph) * uDefB.x * uZ, y = d.y - cos(ph) * uDefB.y * uZ;
  x -= uDefA.x * d.z; y -= uDefA.y * d.z;
  float t = uDefA.z * uZ, c = cos(t), sn = sin(t), xyS = 1.0 / sqrt(max(0.35, s));
  return vec3((c * x + sn * y) / xyS, (-sn * x + c * y) / xyS, lz);
}
vec3 toVoxel(vec3 d) { return invDeform(d) + uPivot; }
`;

const PART_FS = COMMON + `
uniform sampler3D uNao;
uniform int uSmooth, uView;
uniform vec3 uL, uLightCol, uSky, uShadowTint, uHiTint, uRimCol;
uniform float uAmbient, uRim, uBands;
uniform float uDepthSlot, uDepthSlots;
uniform int uEmCount; uniform vec3 uEmCols[6]; uniform float uEmStrength, uPartEm;
layout(location = 0) out vec4 oColor; layout(location = 1) out vec4 oNormal;
vec3 faceNormal(vec3 hv, vec3 rdV) {
  vec3 f = abs(hv - floor(hv + 0.5));
  if (f.x <= f.y && f.x <= f.z) return vec3(-sign(rdV.x), 0.0, 0.0);
  if (f.y <= f.z) return vec3(0.0, -sign(rdV.y), 0.0);
  return vec3(0.0, 0.0, -sign(rdV.z));
}
vec3 deformNormal(vec3 n, float uZ) {
  float s = max(uDefA.w, 0.05), xyS = 1.0 / sqrt(max(0.35, s));
  n = vec3(n.x / xyS, n.y / xyS, n.z / s);
  float t = uDefA.z * uZ, c = cos(t), sn = sin(t);
  n.xy = vec2(c * n.x - sn * n.y, sn * n.x + c * n.y);
  n.z -= uDefA.x * n.x + uDefA.y * n.y;
  return n;
}
void main() {
  vec3 roW, rdW; pixelRay(roW, rdW);
  vec3 ro = (uInvModel * vec4(roW, 1.0)).xyz, rd = mat3(uInvModel) * rdW; rd /= length(rd);
  float t0, t1; if (!slab(ro, rd, uBoxMin, uBoxMax, t0, t1)) discard; t0 = max(t0, 0.0);
  bool smoothM = uSmooth == 1;
  float STEP = smoothM ? 0.35 : 0.4, ISO = smoothM ? 0.45 : 0.5, tPrev = t0, th = -1.0;
  for (int i = 0; i < 600; i++) {
    float t = t0 + float(i) * STEP; if (t > t1) break;
    vec3 v = toVoxel(ro + rd * t);
    float a = smoothM ? sampleSmooth(v).a : occCrisp(v);
    if (a >= ISO) {
      float lo = tPrev, hi = t;
      for (int b = 0; b < 6; b++) { float m = 0.5 * (lo + hi); float am = smoothM ? sampleSmooth(toVoxel(ro + rd * m)).a : occCrisp(toVoxel(ro + rd * m)); if (am >= ISO) hi = m; else lo = m; }
      th = hi; break;
    }
    tPrev = t;
  }
  if (th < 0.0) discard;
  vec3 hd = ro + rd * th, hv = toVoxel(hd), wp = (uModel * vec4(hd, 1.0)).xyz;
  vec4 clipP = uVP * vec4(wp, 1.0);
  float dRaw = clamp(0.5 * clipP.z / clipP.w + 0.5, 0.0, 1.0), D24 = 16777215.0, bucket = 4.0 * uDepthSlots;
  gl_FragDepth = min((floor(dRaw * (D24 / bucket)) * bucket + uDepthSlot * 4.0 + 2.0) / D24, 1.0);
  // surface attributes
  vec3 rdV = toVoxel(hd + rd * 0.05) - hv;
  ivec3 cin = ivec3(floor(toVoxel(hd + rd * 0.3)));
  if (!inGrid(cin) || texelFetch(uVol, cin, 0).a < 0.5) cin = ivec3(floor(hv - faceNormal(hv, rdV) * 0.5));
  cin = clamp(cin, ivec3(0), ivec3(uSize) - 1);
  vec4 vin = texelFetch(uVol, cin, 0), nao = texelFetch(uNao, cin, 0);
  vec3 nTex = nao.rgb * 2.0 - 1.0; bool texOk = vin.a > 0.5 && dot(nTex, nTex) > 0.25;
  vec3 albedo, Nv;
  if (smoothM) {
    vec4 cs = sampleSmooth(hv + normalize(rdV) * 0.35);
    albedo = vin.a > 0.5 ? vin.rgb : clamp(cs.rgb / max(cs.a, 1e-3), 0.0, 1.0);
    float h = 0.6; vec3 g = vec3(sampleSmooth(hv + vec3(h, 0, 0)).a - sampleSmooth(hv - vec3(h, 0, 0)).a,
      sampleSmooth(hv + vec3(0, h, 0)).a - sampleSmooth(hv - vec3(0, h, 0)).a, sampleSmooth(hv + vec3(0, 0, h)).a - sampleSmooth(hv - vec3(0, 0, h)).a);
    vec3 nG = dot(g, g) > 1e-10 ? -normalize(g) : -normalize(rdV);
    Nv = texOk ? normalize(0.45 * nG + 0.55 * nTex) : nG;
  } else {
    albedo = vin.rgb;
    Nv = faceNormal(hv, rdV); Nv = texOk ? normalize(mix(Nv, nTex, 0.3)) : Nv;
  }
  float ao = texOk ? smoothstep(0.1, 0.92, nao.a) : 1.0;
  vec3 N = normalize(transpose(mat3(uInvModel)) * normalize(deformNormal(Nv, clamp(hv.z / uSize.z, 0.0, 1.0))));
  // self-shadow: a 12-step ray toward the light inside this part
  vec3 Ld = normalize(mat3(uInvModel) * uL), q = hd - rd * 0.25 + Ld * 0.9; float occ = 0.0;
  for (int i = 0; i < 12; i++) { occ = max(occ, smoothstep(0.35, 0.7, sampleSmooth(toVoxel(q)).a) * (1.0 - float(i) * 0.03)); q += Ld * 1.15; }
  float shadowF = 1.0 - occ, heightOcc = mix(0.74, 1.0, smoothstep(0.0, 7.0, wp.z));
  vec3 L = uL, V = -rdW;
  float diff = max(dot(N, L), 0.0) * shadowF, b = uBands;
  float qb = clamp(floor(diff * b * 0.999 + 0.0001 + 0.15) / (b - 1.0), 0.0, 1.0);
  vec3 shadowCol = albedo * uShadowTint * (0.62 + uAmbient * 0.9) + vec3(0.012, 0.008, 0.03);
  vec3 litCol = albedo * mix(vec3(1.0), uHiTint, 0.45) * mix(vec3(1.0), uLightCol, 0.6) * 1.12;
  vec3 col = mix(shadowCol, litCol, qb) * mix(0.6, 1.0, floor(ao * heightOcc * 4.0 + 0.5) / 4.0);
  if (qb > 0.99 && pow(max(dot(N, normalize(L + V)), 0.0), 40.0) > 0.7) col += litCol * 0.09;
  col += uRimCol * uRim * 0.55 * step(0.45, pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.5) * clamp(0.3 + 0.7 * dot(N, normalize(L + vec3(0, 0, 1))), 0.0, 1.0));
  float em = uPartEm;
  for (int k = 0; k < 6; k++) { if (k >= uEmCount) break; if (length(albedo - uEmCols[k]) < 0.048) em = max(em, uEmStrength); }
  em = clamp(em, 0.0, 1.0);
  if (uView == 1) { col = N * 0.5 + 0.5; em = 0.0; }
  else if (uView == 2) { col = vec3(ao * heightOcc * mix(0.55, 1.0, shadowF)); em = 0.0; }
  if (em > 0.01) col = mix(col, min(albedo * 1.25 + vec3(0.03), vec3(1.0)), em);
  oColor = vec4(clamp(col, 0.0, 1.0), 1.0 - 0.5 * em);
  oNormal = vec4(N * 0.5 + 0.5, 1.0);
}`;

const SHADOW_VS = `#version 300 es
layout(location = 0) in vec3 aPos;
uniform mat4 uVP; uniform vec4 uRect;   // world xy rect on the ground
void main() { gl_Position = uVP * vec4(mix(uRect.xy, uRect.zw, aPos.xy), 0.02, 1.0); }`;
const SHADOW_FS = COMMON + `
uniform vec3 uL; uniform vec4 uShadowCol;
layout(location = 0) out vec4 oColor; layout(location = 1) out vec4 oNormal;
void main() {
  vec3 roW, rdW; pixelRay(roW, rdW);
  if (abs(rdW.z) < 1e-5) discard;
  vec3 g = roW + rdW * ((0.02 - roW.z) / rdW.z), Lw = normalize(vec3(uL.xy, max(uL.z, 0.12)));
  vec3 ro = (uInvModel * vec4(g, 1.0)).xyz, rd = normalize(mat3(uInvModel) * Lw);
  float t0, t1; if (!slab(ro, rd, uBoxMin, uBoxMax, t0, t1)) discard;
  float occ = 0.0, t = max(t0, 0.0) + 0.2;
  for (int i = 0; i < 160; i++) { if (t > t1) break; occ = max(occ, smoothstep(0.3, 0.6, sampleSmooth(toVoxel(ro + rd * t)).a)); if (occ > 0.99) break; t += 0.6; }
  if (occ < 0.5) discard;
  vec4 c = uVP * vec4(g, 1.0); gl_FragDepth = 0.5 * c.z / c.w + 0.5;
  oColor = uShadowCol; oNormal = vec4(0.5, 0.5, 0.5, 0.0);
}`;

const POST_VS = `#version 300 es
layout(location = 0) in vec3 aPos;
void main() { gl_Position = vec4(aPos.xy * 2.0 - 1.0, 0.0, 1.0); }`;
const POST_FS = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
uniform sampler2D uC0, uC1, uDepth; uniform ivec2 uSizeV; uniform vec4 uOut;   // out viewport x, y, w, h
uniform float uDepthScale, uDark; uniform vec3 uL; uniform int uOutline, uHalo; uniform vec3 uInk; uniform float uInkMix;
layout(location = 0) out vec4 oColor;
bool fgAt(ivec2 c) { return all(greaterThanEqual(c, ivec2(0))) && all(lessThan(c, uSizeV)) && texelFetch(uC1, c, 0).a > 0.5; }
void main() {
  vec2 uv = (gl_FragCoord.xy - uOut.xy) / uOut.zw;
  ivec2 c = clamp(ivec2(floor(uv * vec2(uSizeV))), ivec2(0), uSizeV - 1);
  vec4 c0 = texelFetch(uC0, c, 0), c1 = texelFetch(uC1, c, 0);
  bool fg = c1.a > 0.5;
  const ivec2 OFFS[4] = ivec2[4](ivec2(1, 0), ivec2(0, 1), ivec2(-1, 0), ivec2(0, -1));
  vec4 outc;
  if (!fg) {
    float best = 2.0; vec3 bc = vec3(0.0); float bem = 0.0; bool any = false;
    if (uOutline == 1) for (int i = 0; i < 4; i++) { ivec2 q = c + OFFS[i]; if (!fgAt(q)) continue; float d = texelFetch(uDepth, q, 0).r;
      if (d < best) { best = d; vec4 qc = texelFetch(uC0, q, 0); bc = qc.rgb; bem = clamp((1.0 - qc.a) * 2.0, 0.0, 1.0); any = true; } }
    if (any) { vec3 oc = bc * mix(1.0 - uDark, 0.62, bem); oc = mix(oc, uInk, uInkMix * (1.0 - bem)); outc = vec4(oc, 1.0); }
    else outc = vec4(c0.rgb, c0.a);            // ground shadow (premultiplied) or nothing
  } else {
    vec3 col = c0.rgb, N = c1.rgb * 2.0 - 1.0; float em = clamp((1.0 - c0.a) * 2.0, 0.0, 1.0);
    float dl = texelFetch(uDepth, c, 0).r * uDepthScale; bool edge = false; int crease = 0;
    if (uOutline == 1) for (int i = 0; i < 4; i++) { ivec2 q = c + OFFS[i]; if (!fgAt(q)) continue;
      float dq = texelFetch(uDepth, q, 0).r * uDepthScale; vec3 Nq = texelFetch(uC1, q, 0).rgb * 2.0 - 1.0;
      if (dl - dq > 1.75) edge = true;
      else if (i < 2 && abs(dl - dq) < 1.75 && dot(N, Nq) < 0.45) crease = dot(Nq, uL) > dot(N, uL) ? 1 : -1; }
    if (edge) col = mix(col, mix(col * (1.0 - uDark), uInk, uInkMix), 0.85);
    else if (crease > 0) col *= mix(1.0, 1.0 - uDark, 0.32);
    else if (crease < 0) col = min(col * 1.12 + 0.02, vec3(1.0));
    col = mix(col, c0.rgb, em);
    if (uHalo == 1 && em < 0.5) {    // the emissive halo: strongest of a 16-tap ring
      float ge = 0.0; vec3 gc = vec3(0.0);
      for (int i = 0; i < 16; i++) {
        ivec2 o = i < 4 ? OFFS[i] : i < 8 ? OFFS[i - 4] * 2 : i < 12 ? ivec2(OFFS[i - 8].x + OFFS[i - 8].y, OFFS[i - 8].y - OFFS[i - 8].x) : OFFS[i - 12] * 3;
        float w = i < 4 ? 1.0 : i < 12 ? 0.62 : 0.32; ivec2 q = c + o; if (!fgAt(q)) continue;
        vec4 qc = texelFetch(uC0, q, 0); float e = clamp((1.0 - qc.a) * 2.0, 0.0, 1.0); if (e < 0.01) continue;
        if (texelFetch(uDepth, q, 0).r * uDepthScale - dl > 6.0) continue;
        if (e * w > ge) { ge = e * w; gc = qc.rgb; } }
      if (ge > 0.0) col = mix(col, gc, 0.22 * ge) + gc * 0.08 * ge;
    }
    outc = vec4(clamp(col, 0.0, 1.0), 1.0);
  }
  oColor = outc;
}`;

function compile(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('gull shader: ' + gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('gull link: ' + gl.getProgramInfoLog(p));
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i), name = a.name.replace(/\[0\]$/, ''); u[name] = gl.getUniformLocation(p, a.name); }
  return { p, u };
}

/** Default light: the spec's key light, turned a little so the bird is lit from the front-left like the game's buildings. */
export function defaultLight() {
  const y = -1.0, p = 0.85, L = [Math.sin(y) * Math.cos(p), -Math.cos(y) * Math.cos(p), Math.sin(p)];
  // the ground shadow falls nearly straight down (a contact shadow under the feet), a little toward the back right
  const S = [-0.10, -0.08, 1], sl = Math.hypot(...S);
  return { L, S: S.map((v) => v / sl), color: [1, 0.97, 0.9], ambient: 0.42, sky: [0.62, 0.70, 0.86], shadowTint: [0.76, 0.78, 0.92], hiTint: [1, 0.96, 0.86], rim: [0.80, 0.90, 1], rimStrength: 0.35 };
}

export class T3 {
  /** canvas: the output canvas; ps: device pixels per virtual texel. */
  constructor(canvas, { smooth = true } = {}) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: true, premultipliedAlpha: true, depth: false, stencil: false, preserveDrawingBuffer: !!canvas.dataset.qa });
    if (!gl) throw new Error('no webgl2');
    this.gl = gl; this.canvas = canvas; this.smooth = smooth;
    this.opts = { outline: true, halo: true, zbuffer: true, snap: true, shadows: true, bands: 4, view: 0, reverse: false, ink: [0.18, 0.14, 0.10], inkMix: 0.35, shadowCol: [0.07, 0.09, 0.16, 0.24] };
    this.part = compile(gl, PART_VS, PART_FS); this.shadow = compile(gl, SHADOW_VS, SHADOW_FS); this.post = compile(gl, POST_VS, POST_FS);
    // unit cube (8 verts, 36 indices) and a quad
    this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao);
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5]), gl.STATIC_DRAW);
    this.qvao = gl.createVertexArray(); gl.bindVertexArray(this.qvao);
    const qb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, qb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    const samp = (f) => { const s = gl.createSampler(); gl.samplerParameteri(s, gl.TEXTURE_MIN_FILTER, f); gl.samplerParameteri(s, gl.TEXTURE_MAG_FILTER, f);
      for (const w of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.samplerParameteri(s, w, gl.CLAMP_TO_EDGE); return s; };
    this.sLin = samp(gl.LINEAR); this.sNear = samp(gl.NEAREST);
    this.fw = 0; this.fh = 0; this.vols = [];
    // per-frame scratch
    this.VPs = m4(); this.invVPs = m4(); this.Ms = m4(); this.invMs = m4(); this.T = m4(); this.tmp = new Float64Array(3);
    this.f32 = new Float32Array(16); this.rootDelta = new Float64Array(3);
    this.DB2 = [gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]; this.DB1 = [gl.COLOR_ATTACHMENT0, gl.NONE]; this.DBB = [gl.BACK];
    this.Z4 = new Float32Array(4); this.N4 = new Float32Array([0.5, 0.5, 0.5, 0]); this.ONE = new Float32Array([1]); this.box = new Float64Array(6); this.order = [];
    this.stats = { draws: 0 };
  }
  setParts(defs) {   // [{ size, pivot, albedo, nao }]
    const gl = this.gl;
    const up = (sx, sy, sz, bytes) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_3D, t);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, sx, sy, sz, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_BASE_LEVEL, 0); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAX_LEVEL, 0);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.bindTexture(gl.TEXTURE_3D, null); return t; };
    this.vols = defs.map((d) => ({ size: d.size, pivot: d.pivot, alb: up(...d.size, d.albedo), nao: up(...d.size, d.nao) }));
  }
  resize(fw, fh, ps) {
    const gl = this.gl; this.ps = ps;
    const W = fw * ps, H = fh * ps;
    if (this.canvas.width !== W) this.canvas.width = W; if (this.canvas.height !== H) this.canvas.height = H;
    if (fw === this.fw && fh === this.fh) return;
    if (this.fbo) { gl.deleteFramebuffer(this.fbo); for (const t of [this.c0, this.c1, this.dt]) gl.deleteTexture(t); }
    const mk = (internal, format, type) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, fw, fh, 0, format, type, null); return t; };
    this.c0 = mk(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE); this.c1 = mk(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
    this.dt = mk(gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT);
    this.fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.c0, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this.c1, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.dt, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) console.error('gull G-buffer incomplete');
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.fw = fw; this.fh = fh;
  }
  /** Snap a world point to a virtual-texel centre: NDC delta (02 §1). */
  snapNdc(VP, x, y, z, out) {
    const px = VP[0] * x + VP[4] * y + VP[8] * z + VP[12], py = VP[1] * x + VP[5] * y + VP[9] * z + VP[13];
    const sx = (px + 1) * 0.5 * this.fw - 0.5, sy = (py + 1) * 0.5 * this.fh - 0.5;
    out[0] = (Math.round(sx + 1e-6) - sx) * 2 / this.fw; out[1] = (Math.round(sy + 1e-6) - sy) * 2 / this.fh; return out;
  }
  /** Proxy box of a part in deformed local space (02 §1). */
  bounds(v, d, out) {
    const [sx, sy, sz] = v.size, [px, py, pz] = v.pivot;
    if (isIdentity(d)) { out[0] = -px - 0.5; out[1] = -py - 0.5; out[2] = -pz - 0.5; out[3] = sx - px + 0.5; out[4] = sy - py + 0.5; out[5] = sz - pz + 0.5; return out; }
    out[0] = out[1] = out[2] = Infinity; out[3] = out[4] = out[5] = -Infinity; const t = this.tmp;
    for (let k = 0; k <= 12; k++) { const lz = -pz + sz * k / 12;
      for (let c = 0; c < 4; c++) { deformPoint(t, c & 1 ? sx - px : -px, c & 2 ? sy - py : -py, lz, d, sz, pz);
        for (let a = 0; a < 3; a++) { if (t[a] < out[a]) out[a] = t[a]; if (t[a] > out[3 + a]) out[3 + a] = t[a]; } } }
    const m = 1.25 + 0.5 * Math.abs(d[2]); out[0] -= m; out[1] -= m; out[2] -= 1; out[3] += m; out[4] += m; out[5] += 1; return out;
  }
  /**
   * Draw one frame. frame = { VP (Float64Array16), root: [x,y,z], items: [{ part (volume index), M, inv, d, slot }], light }.
   * Items may repeat a volume (the effect feathers). The root snap keeps sub-texel motion from crawling (02 §1).
   */
  render(frame) {
    const gl = this.gl, o = this.opts, fw = this.fw, fh = this.fh, VP = this.VPs, iVP = this.invVPs, f32 = this.f32, dn = this.tmp;
    VP.set(frame.VP);
    if (o.snap) { this.snapNdc(VP, 0, 0, 0, dn); const T = this.T; T.fill(0); T[0] = T[5] = T[10] = T[15] = 1; T[12] = dn[0]; T[13] = dn[1]; m4Mul(VP, T, VP); }
    m4Invert(iVP, VP);
    // root snap: a world delta pushed into every part
    let rdx = 0, rdy = 0, rdz = 0;
    if (o.snap) {
      const r = frame.root; this.snapNdc(VP, r[0], r[1], r[2], dn);
      const sx = Math.hypot(VP[0], VP[4], VP[8]), sy = Math.hypot(VP[1], VP[5], VP[9]);
      rdx = VP[0] / sx * dn[0] / sx + VP[1] / sy * dn[1] / sy; rdy = VP[4] / sx * dn[0] / sx + VP[5] / sy * dn[1] / sy; rdz = VP[8] / sx * dn[0] / sx + VP[9] / sy * dn[1] / sy;
    }
    this.rootDelta[0] = rdx; this.rootDelta[1] = rdy; this.rootDelta[2] = rdz;
    const zs = Math.hypot(VP[2], VP[6], VP[10]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo); gl.viewport(0, 0, fw, fh);
    gl.drawBuffers(this.DB2);
    gl.clearBufferfv(gl.COLOR, 0, this.Z4); gl.clearBufferfv(gl.COLOR, 1, this.N4); gl.clearBufferfv(gl.DEPTH, 0, this.ONE);
    gl.disable(gl.SCISSOR_TEST); gl.disable(gl.BLEND);
    const L = frame.light.L, items = frame.items, n = items.length, order = this.order; order.length = 0;
    for (let i = 0; i < n; i++) order.push(o.reverse ? n - 1 - i : i);
    const setPart = (P, it) => {
      const v = this.vols[it.part], Ms = this.Ms, iMs = this.invMs;
      Ms.set(it.M); Ms[12] += rdx; Ms[13] += rdy; Ms[14] += rdz; m4Invert(iMs, Ms);
      gl.uniformMatrix4fv(P.u.uVP, false, (f32.set(VP), f32)); gl.uniformMatrix4fv(P.u.uInvVP, false, (f32.set(iVP), f32));
      gl.uniformMatrix4fv(P.u.uModel, false, (f32.set(Ms), f32)); gl.uniformMatrix4fv(P.u.uInvModel, false, (f32.set(iMs), f32));
      gl.uniform4f(P.u.uViewport, 0, 0, fw, fh);
      gl.uniform3f(P.u.uSize, v.size[0], v.size[1], v.size[2]); gl.uniform3f(P.u.uPivot, v.pivot[0], v.pivot[1], v.pivot[2]);
      const d = it.d, bx = this.bounds(v, d, this.box);
      gl.uniform3f(P.u.uBoxMin, bx[0], bx[1], bx[2]); gl.uniform3f(P.u.uBoxMax, bx[3], bx[4], bx[5]);
      gl.uniform4f(P.u.uDefA, d[0], d[1], d[2], d[3]); gl.uniform4f(P.u.uDefB, d[4], d[5], d[6], d[7]);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_3D, v.alb); gl.bindSampler(0, this.smooth ? this.sLin : this.sNear); gl.uniform1i(P.u.uVol, 0);
      return bx;
    };
    let draws = 0;
    // ground shadows: C0 only (C1 is kept by writing a = 0 there with the blend), first part wins
    if (o.shadows) {
      gl.drawBuffers(this.DB1);
      const P = this.shadow; gl.useProgram(P.p); gl.bindVertexArray(this.qvao);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true); gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      const SL = frame.light.S ?? L; gl.uniform3f(P.u.uL, SL[0], SL[1], SL[2]); const sc = o.shadowCol; gl.uniform4f(P.u.uShadowCol, sc[0], sc[1], sc[2], sc[3]);
      const Lz = Math.max(SL[2], 0.12);
      for (const i of order) { const it = items[i]; if (!it.shadow) continue; const bx = setPart(P, it), Ms = this.Ms, t = this.tmp;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (let c = 0; c < 8; c++) { m4Point(t, Ms, c & 1 ? bx[3] : bx[0], c & 2 ? bx[4] : bx[1], c & 4 ? bx[5] : bx[2]);
          const z = Math.max(0, t[2]), gx = t[0] - SL[0] / Lz * z, gy = t[1] - SL[1] / Lz * z;
          x0 = Math.min(x0, gx, t[0]); y0 = Math.min(y0, gy, t[1]); x1 = Math.max(x1, gx, t[0]); y1 = Math.max(y1, gy, t[1]); }
        gl.uniform4f(P.u.uRect, x0 - 1, y0 - 1, x1 + 1, y1 + 1); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); draws++; }
      gl.disable(gl.BLEND);
    }
    // parts
    gl.drawBuffers(this.DB2);
    const P = this.part; gl.useProgram(P.p); gl.bindVertexArray(this.vao);
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.FRONT);
    if (o.zbuffer) { gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); } else { gl.disable(gl.DEPTH_TEST); gl.depthMask(false); }
    const lt = frame.light, ems = frame.emissive ?? { cols: [], strength: 0.9 };
    gl.uniform3f(P.u.uL, L[0], L[1], L[2]); gl.uniform3fv(P.u.uLightCol, lt.color); gl.uniform3fv(P.u.uShadowTint, lt.shadowTint);
    gl.uniform3fv(P.u.uHiTint, lt.hiTint); gl.uniform3fv(P.u.uRimCol, lt.rim); gl.uniform1f(P.u.uAmbient, lt.ambient); gl.uniform1f(P.u.uRim, lt.rimStrength);
    gl.uniform1f(P.u.uBands, o.bands); gl.uniform1i(P.u.uSmooth, this.smooth ? 1 : 0); gl.uniform1i(P.u.uView, o.view);
    gl.uniform1f(P.u.uDepthSlots, 32); gl.uniform1i(P.u.uEmCount, ems.cols.length); gl.uniform1f(P.u.uEmStrength, ems.strength);
    if (ems.cols.length) gl.uniform3fv(P.u.uEmCols, ems.flat);
    gl.uniform1i(P.u.uNao, 1);
    for (const i of order) { const it = items[i]; setPart(P, it);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_3D, this.vols[it.part].nao); gl.bindSampler(1, this.sNear);
      gl.uniform1f(P.u.uDepthSlot, it.slot); gl.uniform1f(P.u.uPartEm, it.emissive ?? 0);
      gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0); draws++; }
    for (let k = 0; k < 2; k++) { gl.activeTexture(gl.TEXTURE0 + k); gl.bindTexture(gl.TEXTURE_3D, null); gl.bindSampler(k, null); }
    // pass 2: full-res blit + outline
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.drawBuffers(this.DBB);
    const W = this.canvas.width, H = this.canvas.height; gl.viewport(0, 0, W, H);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
    const Q = this.post; gl.useProgram(Q.p); gl.bindVertexArray(this.qvao);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.c0); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.c1); gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.dt);
    gl.uniform1i(Q.u.uC0, 0); gl.uniform1i(Q.u.uC1, 1); gl.uniform1i(Q.u.uDepth, 2);
    gl.uniform2i(Q.u.uSizeV, fw, fh); gl.uniform4f(Q.u.uOut, 0, 0, W, H); gl.uniform1f(Q.u.uDepthScale, 2 / zs);
    gl.uniform1f(Q.u.uDark, 0.78); gl.uniform3f(Q.u.uL, L[0], L[1], L[2]); gl.uniform1i(Q.u.uOutline, o.outline ? 1 : 0); gl.uniform1i(Q.u.uHalo, o.halo ? 1 : 0);
    gl.uniform3fv(Q.u.uInk, o.ink); gl.uniform1f(Q.u.uInkMix, o.inkMix);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); draws++;
    for (let k = 0; k < 3; k++) { gl.activeTexture(gl.TEXTURE0 + k); gl.bindTexture(gl.TEXTURE_2D, null); }
    gl.activeTexture(gl.TEXTURE0); gl.bindVertexArray(null); gl.useProgram(null);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true);
    this.stats.draws = draws;
  }
  /** Read the G-buffer foreground mask (C1.a) for the QA gates. */
  readMask() {
    const gl = this.gl, out = new Uint8Array(this.fw * this.fh * 4);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.fbo); gl.readBuffer(gl.COLOR_ATTACHMENT1);
    gl.readPixels(0, 0, this.fw, this.fh, gl.RGBA, gl.UNSIGNED_BYTE, out);
    gl.readBuffer(gl.COLOR_ATTACHMENT0); gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null); return out;
  }
  readOutput() { const gl = this.gl, W = this.canvas.width, H = this.canvas.height, out = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, out); return out; }
  destroy() { this.gl.getExtension('WEBGL_lose_context')?.loseContext(); }
}
