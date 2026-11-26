#!/usr/bin/env python3
"""끼룩이 (the guide gull) as an SVOX bundle: voxel parts sculpted against art/gull/turnaround-1.png, plus its clips.

    python3 art/gull/sculpt.py            -> art/gull/svox/rig.json + parts/*.albedo.png
    then build.sh bakes normals/AO, validates, and packs src/ui/gull/gulldata.js

Bird space: right-handed, +Z up, the bird faces -Y, 1 unit = 1 voxel, feet on z = 0 (the SVOX contract).
Parts are sculpted in bird space, then each is cut into its own volume with a 1-voxel empty margin all round.
Side names follow the screen in a front view: '...R' is the +X side (the bird's own left).
"""
import json, math, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, '/home/ubuntu/hybrid-voxel-sprite/skills/hybrid-voxel-sprite/scripts')
import svox_cli as sv  # noqa: E402

OUT = HERE / 'svox'

# ---------------------------------------------------------------- palette (sampled from the turnaround, then tuned)
def hx(s): return (int(s[1:3], 16), int(s[3:5], 16), int(s[5:7], 16))
P = {k: hx(v) for k, v in dict(
    white='#f6f3ee', white2='#eeebe6', white3='#e6e3df',
    blush='#f3b9b8', blush2='#eda7a8',
    eye='#14171d', eye2='#232836', glint='#ffffff',
    mouth='#8c2f24', mouth2='#6e2219',
    beak='#f6ad2a', beak2='#f09a1e', beakU='#e8861a', tip='#d8481e', tip2='#c23a17',
    cov1='#cbd7e5', cov2='#b9c7d8', cov3='#a6b6ca', cov4='#90a2b8',
    prim1='#7a8798', prim2='#5c6879', prim3='#454f5d',
    tail='#a8b6c6', tail2='#7d8a9b',
    foot='#f3a524', foot2='#e48f17', foot3='#cf7c12',
    navy='#233f7b', navy2='#2b4c8f', navy3='#1a305f', visor='#162850', gold='#e5ad2c', gold2='#c99021', anchor='#eef1f4',
).items()}


def jitter(c, x, y, z, amt):
    """A small fixed per-voxel brightness step, like hand-painted MagicaVoxel colour noise."""
    h = (x * 73856093 ^ y * 19349663 ^ z * 83492791) & 0xffff
    f = 1.0 + ((h % 5) - 2) * amt
    return tuple(max(0, min(255, int(round(v * f)))) for v in c)


class Part:
    def __init__(self, name):
        self.name, self.vox = name, {}

    def put(self, x, y, z, c):
        self.vox[(x, y, z)] = c

    def has(self, x, y, z):
        return (x, y, z) in self.vox


def ellipsoid_fill(part, c, r, colour, shape=None):
    cx, cy, cz = c
    rx, ry, rz = r
    for x in range(math.floor(cx - rx - 2), math.ceil(cx + rx + 2)):
        for y in range(math.floor(cy - ry - 2), math.ceil(cy + ry + 2)):
            for z in range(math.floor(cz - rz - 2), math.ceil(cz + rz + 2)):
                px, py, pz = x + .5, y + .5, z + .5
                k = shape(px, py, pz) if shape else 1.0
                if ((px - cx) / (rx * k)) ** 2 + ((py - cy) / (ry * k)) ** 2 + ((pz - cz) / rz) ** 2 <= 1.0:
                    part.put(x, y, z, colour(x, y, z) if callable(colour) else colour)


# ---------------------------------------------------------------- body
BODY_C, BODY_R = (0.0, 0.5, 13.2), (9.3, 9.6, 9.2)
HEAD_C, HEAD_R = (0.0, -0.6, 28.2), (8.9, 9.0, 8.4)


def body_shape(px, py, pz):          # an egg: fuller low, narrower toward the neck
    return 1.0 + 0.07 * (BODY_C[2] - pz) / BODY_R[2]


def body_inside(px, py, pz):
    k = body_shape(px, py, pz)
    return ((px - BODY_C[0]) / (BODY_R[0] * k)) ** 2 + ((py - BODY_C[1]) / (BODY_R[1] * k)) ** 2 + ((pz - BODY_C[2]) / BODY_R[2]) ** 2 <= 1.0


def body_surface_x(py, pz, side):
    """x of the body's outer surface at (y, z) on one side, or None."""
    k = body_shape(0, py, pz)
    t = 1.0 - ((py - BODY_C[1]) / (BODY_R[1] * k)) ** 2 - ((pz - BODY_C[2]) / BODY_R[2]) ** 2
    if t <= 0: return None
    return BODY_C[0] + side * BODY_R[0] * k * math.sqrt(t)


body = Part('body')
ellipsoid_fill(body, BODY_C, BODY_R, lambda x, y, z: jitter(P['white'] if z > 6 else P['white2'], x, y, z, 0.012), body_shape)

# ---------------------------------------------------------------- head (+ painted blush, mouth inside)
head = Part('head')
ellipsoid_fill(head, HEAD_C, HEAD_R, lambda x, y, z: jitter(P['white'], x, y, z, 0.012))


def head_front_y(px, pz):
    """y of the head's front surface (most negative y) at (x, z), or None."""
    t = 1.0 - ((px - HEAD_C[0]) / HEAD_R[0]) ** 2 - ((pz - HEAD_C[2]) / HEAD_R[2]) ** 2
    if t <= 0: return None
    return HEAD_C[1] - HEAD_R[1] * math.sqrt(t)


def head_front_voxel(x, z):
    """The frontmost solid head voxel in column (x, z)."""
    for y in range(-20, 20):
        if head.has(x, y, z): return y
    return None


# blush: a soft 3x2 patch below and outside each eye, two pinks
for side in (-1, 1):
    for (dx, dz, c) in [(0, 0, 'blush'), (1, 0, 'blush'), (2, 0, 'blush2'), (0, -1, 'blush2'), (1, -1, 'blush'), (2, -1, 'blush2')]:
        x = (5 + dx) if side > 0 else (-6 - dx)
        z = 24 + dz
        y = head_front_voxel(x, z)
        if y is not None:
            head.put(x, y, z, P[c]); head.put(x, y + 1, z, P[c])
# mouth inside: dark red where the beaks meet, seen only when the lower beak drops
for x in range(-2, 2):
    for z in (20, 21, 22):
        y = head_front_voxel(x, z)
        if y is not None:
            for d in range(0, 3): head.put(x, y + d, z, P['mouth'] if z > 20 else P['mouth2'])

# ---------------------------------------------------------------- eyes: shells that follow the head's surface
EYE_X, EYE_Z = 4, 25          # lower-left voxel of the right eye's 4x4 (x 4..7 would be too far out: x 3..6 -> centre 5)


def surface_shell(part, cells, out=1, inn=1):
    """For each (x, z, colour), voxels from the head surface `inn` deep to `out` proud (2 thick)."""
    for (x, z, c) in cells:
        y0 = head_front_voxel(x, z)
        if y0 is None: continue
        for y in range(y0 - out, y0 + inn):
            part.put(x, y, z, c)


def eye_cells(x0, z0, mirror):
    # 4x4 with the corners off; a white glint high on the side toward the light (+X, screen right)
    cells = []
    for i in range(4):
        for j in range(5):
            if (i in (0, 3)) and (j in (0, 4)): continue
            c = P['eye'] if j < 3 else P['eye2']
            cells.append((x0 + i, z0 + j, c))
    cells = [(x, z, P['glint'] if (x - x0, z - z0) in ((2, 3), (2, 2)) and not ((x - x0, z - z0) == (2, 2)) else c) for (x, z, c) in cells]
    return cells


eyeR, eyeL = Part('eyeR'), Part('eyeL')
surface_shell(eyeR, eye_cells(3, EYE_Z, False))
surface_shell(eyeL, eye_cells(-7, EYE_Z, True))

# happy eyes: an arch (^), 6 wide 4 tall, two thick
HAPPY = ['..XX..', '.XXXX.', 'XX..XX', 'X....X']
happyR, happyL = Part('happyR'), Part('happyL')
for part, x0 in ((happyR, 2), (happyL, -8)):
    cells = [(x0 + i, EYE_Z + 3 - j, P['eye']) for j, row in enumerate(HAPPY) for i, ch in enumerate(row) if ch == 'X']
    surface_shell(part, cells)

# ---------------------------------------------------------------- beak: upper and lower, short, chunky and rounded (wider than tall)
beakU, beakL = Part('beakU'), Part('beakL')
for x in range(-3, 3):
    outer = x in (-3, 2)
    for z in (22, 23, 24):
        yb = head_front_voxel(x, z) + 2      # 2 voxels into the face
        front = {22: -13, 23: -14, 24: -13}[z] + (1 if outer else 0)
        for y in range(front, yb):
            c = P['beak'] if z > 22 else P['beakU']
            if outer and z > 22 and y > front: c = P['beak2']
            beakU.put(x, y, z, jitter(c, x, y, z, 0.01))
for x in range(-3, 3):
    outer = x in (-3, 2)
    for z in (20, 21):
        yb = head_front_voxel(x, z) + 2
        front = (-12 if z == 21 else -11) + (1 if outer else 0)
        for y in range(front, yb):
            c = P['beak2'] if z == 21 else P['beakU']
            if y <= front + 1: c = P['tip'] if z == 21 else P['tip2']
            beakL.put(x, y, z, c)

# ---------------------------------------------------------------- wings: coverts (light) + primaries (dark), on the body's sides
SHOULDER = (8.2, -1.5, 20.5)       # +X side; the -X side mirrors x
TIP = (5.0, 17.0, 6.5)
JOINT_T = 0.52                      # where the wing splits into coverts and primaries, along shoulder -> tip


def wing_voxels(side):
    """(x, y, z) -> colour for one whole wing, before the split."""
    out = {}
    sx, sy, sz = SHOULDER
    tx, ty, tz = TIP
    ax, ay = ty - sy, tz - sz
    L = math.hypot(ax, ay)
    ux, uy = ax / L, ay / L            # along the wing in the (y, z) plane
    for y in range(-8, 22):
        for z in range(2, 24):
            py, pz = y + .5, z + .5
            t = ((py - sy) * ux + (pz - sz) * uy) / L          # 0 at the shoulder, 1 at the tip
            d = -(py - sy) * uy + (pz - sz) * ux                # across: + toward the top/back edge
            if t < -0.06 or t > 1.0: continue
            # teardrop half-width: round at the shoulder, widest at 35%, tapering to a narrow tip
            w = 6.6 * math.sin(math.pi * min(1.0, (t + 0.06) / 0.80) ** 0.75) if t < 0.74 else 6.6 * math.sin(math.pi * (0.74 + 0.06) / 0.80) * max(0.0, 1.0 - (t - 0.74) / 0.30)
            w = max(w, 0.0)
            # the primaries fan downward a little: shift the band toward the lower edge near the tip
            off = -1.2 * max(0.0, t - 0.5)
            if not (-w + off <= d <= w * 0.85 + off): continue
            # x: lie on the body, 2-3 voxels thick; past the body keep a straight 2-thick feather
            bx = body_surface_x(py, pz, 1)
            base = (bx if bx is not None else 0.0)
            inner = max(base - 0.6, 3.6 - 1.0 * t)
            thick = 3.0 if t < 0.45 else 2.0
            x0 = int(math.floor(inner + 0.5))
            for x in range(x0, x0 + int(thick)):
                # colour: covert rows (light, banded) then primaries (dark, darker at the tip)
                if t < JOINT_T:
                    band = int((t * L + 0.35 * d) / 2.3)
                    c = [P['cov1'], P['cov3'], P['cov2'], P['cov4']][band % 4]
                    if d < -w + off + 1.4: c = P['cov4']          # the lower edge rolls under: darker
                    if t > JOINT_T - 0.08: c = P['cov4']
                else:
                    c = P['prim1'] if t < 0.66 else P['prim2'] if t < 0.84 else P['prim3']
                    if d > w * 0.85 + off - 1.2 and t < 0.8: c = P['prim1']
                out[(x if side > 0 else -1 - x, y, z)] = (jitter(c, x, y, z, 0.015), t)
    return out


wingR, wingL, wtipR, wtipL = Part('wingR'), Part('wingL'), Part('wingTipR'), Part('wingTipL')
for side, wp, tp in ((1, wingR, wtipR), (-1, wingL, wtipL)):
    for (x, y, z), (c, t) in wing_voxels(side).items():
        (wp if t < JOINT_T else tp).put(x, y, z, c)
JOINT = (SHOULDER[0] - 1.6, SHOULDER[1] + (TIP[1] - SHOULDER[1]) * JOINT_T, SHOULDER[2] + (TIP[2] - SHOULDER[2]) * JOINT_T)

# ---------------------------------------------------------------- tail: a short grey wedge low at the back
tail = Part('tail')
for x in range(-3, 3):
    for y in range(7, 14):
        for z in range(5, 9):
            ty = y - 7
            half = 3 - ty * 0.25
            if abs(x + .5) > half: continue
            ztop = 8 - ty * 0.15
            zbot = 6 - ty * 0.0 + ty * 0.25
            if z + .5 > ztop + .5 or z + .5 < zbot - .5: continue
            c = P['tail'] if ty < 4 else P['tail2']
            tail.put(x, y, z, jitter(c, x, y, z, 0.015))

# ---------------------------------------------------------------- feet: a short leg and three webbed toes forward
footR, footL = Part('footR'), Part('footL')
for part, cx in ((footR, 4), (footL, -6)):          # leg columns x = cx, cx+1
    for z in range(2, 7):
        for x in (cx, cx + 1):
            for y in (0, 1):
                part.put(x, y, z, P['foot2'] if z == 2 else P['foot'])
    for x in range(cx - 2, cx + 4):                   # 6 wide: toes at cx-2..-1, cx..cx+1, cx+2..cx+3
        for y in range(-5, 2):
            for z in (0, 1):
                toe = (x - (cx - 2)) // 2
                if y <= -4 and (x - (cx - 2)) % 2 == 1 and toe != 1: pass
                if y == -5 and toe != 1: continue        # the middle toe is longest
                if y <= -3 and (x - (cx - 2)) in (1, 4) and False: continue
                if y >= 1 and toe != 1: continue          # side toes start under the leg's front
                c = P['foot'] if z == 1 else P['foot2']
                if y <= -4 and (x - (cx - 2)) in (1, 4): c = P['foot3']   # the gaps between toes read as shadow
                part.put(x, y, z, c)

# ---------------------------------------------------------------- cap: a flat navy sailor cap, gold band, visor, white anchor
cap = Part('cap')
CAP_C = (0.0, 0.8, 35.4)            # centre of the band's bottom ring
for x in range(-11, 11):
    for y in range(-12, 12):
        for z in range(33, 43):
            px, py, pz = x + .5, y + .5, z + .5
            h = pz - CAP_C[2]
            if h < 0 or h > 5: continue
            r = 6.9 + (1.5 if h > 2 else 0.4 * h)            # flares out above the band
            if h > 4: r -= 0.9                                # rounded top edge
            if ((px - CAP_C[0]) / r) ** 2 + ((py - CAP_C[1]) / (r * 0.98)) ** 2 > 1: continue
            if h < 2: c = P['gold'] if h >= 1 else P['gold2']
            else: c = P['navy2'] if h > 4 else P['navy']
            if h >= 2 and ((px - CAP_C[0]) / r) ** 2 + ((py - CAP_C[1]) / (r * 0.98)) ** 2 > 0.80 and h <= 4: c = P['navy3']
            cap.put(x, y, z, jitter(c, x, y, z, 0.015))
# visor: a short dark brim at the front of the band, sloping down a little
for x in range(-6, 6):
    for y in range(-10, -5):
        for z in (35, 36):
            if abs(x + .5) > 5.5 - max(0, -8 - y) * 0.9: continue
            if cap.has(x, y, z) and z > 35: continue
            cap.put(x, y, z, P['visor'])
# anchor on the crown's front face (5 x 5), in white
ANCHOR = ['..X..', '.XXX.', '..X..', 'X.X.X', '.XXX.']
for j, row in enumerate(ANCHOR):
    for i, ch in enumerate(row):
        if ch != 'X': continue
        x, z = i - 3, 41 - j - 1
        for y in range(-12, 12):
            if cap.has(x, y, z):
                cap.put(x, y, z, P['anchor']); cap.put(x, y + 1, z, P['anchor'])
                break

# ---------------------------------------------------------------- a feather for the effects (not part of the bird's pose)
feather = Part('feather')
for y in range(0, 7):
    half = [0.6, 1.2, 1.6, 1.6, 1.3, 0.9, 0.5][y]
    for x in range(-2, 2):
        if abs(x + .5) > half + 0.2: continue
        for z in (0, 1):
            c = P['cov1'] if y < 5 else P['cov3']
            if x == -1 and y < 6: c = P['white']      # the shaft
            feather.put(x, y, z, c)

# ---------------------------------------------------------------- rig
PARTS = [
    # name, part, parent, pivot (bird space), rest rotation
    ('body', body, None, (0.0, 0.5, 4.0)),
    ('head', head, 'body', (0.0, -0.5, 20.5)),
    ('beakU', beakU, 'head', (0.0, -7.0, 23.5)),
    ('beakL', beakL, 'head', (0.0, -6.5, 21.9)),
    ('eyeR', eyeR, 'head', (5.0, -7.5, 27.5)),
    ('eyeL', eyeL, 'head', (-5.0, -7.5, 27.5)),
    ('happyR', happyR, 'head', (5.0, -7.5, 27.0)),
    ('happyL', happyL, 'head', (-5.0, -7.5, 27.0)),
    ('cap', cap, 'head', (0.0, 0.8, 35.4)),
    ('wingR', wingR, 'body', SHOULDER),
    ('wingTipR', wtipR, 'wingR', JOINT),
    ('wingL', wingL, 'body', (-SHOULDER[0], SHOULDER[1], SHOULDER[2])),
    ('wingTipL', wtipL, 'wingL', (-JOINT[0], JOINT[1], JOINT[2])),
    ('tail', tail, 'body', (0.0, 7.5, 7.0)),
    ('footR', footR, None, (5.0, 0.5, 0.0)),
    ('footL', footL, None, (-5.0, 0.5, 0.0)),
    ('feather', feather, None, (0.0, 3.0, 1.0)),
]
HAPPY_HIDE = 3.0     # happy eyes rest 3 voxels inside the head; open eyes go in when they come out
CAP_TILT = (-0.16, 0.13, 0.0)


def cut(part, pivot):
    xs = [k[0] for k in part.vox]; ys = [k[1] for k in part.vox]; zs = [k[2] for k in part.vox]
    o = (min(xs) - 1, min(ys) - 1, min(zs) - 1)
    size = (max(xs) - o[0] + 2, max(ys) - o[1] + 2, max(zs) - o[2] + 2)
    sx, sy, sz = size
    vol = bytearray(sx * sy * sz * 4)
    for (x, y, z), c in part.vox.items():
        i = (((z - o[2]) * sy + (y - o[1])) * sx + (x - o[0])) * 4
        vol[i:i + 4] = bytes((c[0], c[1], c[2], 255))
    return size, o, vol


def build():
    rig = sv.new_rig(target_height=17.0)
    rig['name'] = '끼룩이'
    rig['source'] = 'art/gull/turnaround-1.png (front / three-quarter / side), sculpted by art/gull/sculpt.py'
    rig['emissiveColors'] = ['#ffffff']        # the eye glints stay bright in shadow
    rig['emissiveStrength'] = 0.85
    birdpiv = {}
    (OUT / 'parts').mkdir(parents=True, exist_ok=True)
    for name, part, parent, piv in PARTS:
        size, o, vol = cut(part, piv)
        pv = [piv[0] - o[0], piv[1] - o[1], piv[2] - o[2]]
        rest = list(piv) if parent is None else [piv[k] - birdpiv[parent][k] for k in range(3)]
        p = sv.make_part(name, size, pv, parent=parent, rest_offset=rest)
        if name == 'feather': p['restOffset'] = [0.0, 3.0, 10.0]       # parked inside the body; drawn only by the effects
        if name.startswith('happy'): p['restOffset'][1] += HAPPY_HIDE
        if name == 'cap': p['restRotation'] = list(CAP_TILT)
        rig['parts'].append(p)
        birdpiv[name] = piv
        sv.write_part_albedo(OUT, p, vol)
        print('  %-9s %2dx%2dx%2d  %5d voxels  pivot %s' % (name, *size, len(part.vox), [round(v, 2) for v in pv]))
    rig['clips'] = clips()
    rig['framing'] = {'note': 'the runtime sizes its camera from the union of the rest pose, every clip and the point poses'}
    sv.save_json(OUT / 'rig.json', rig)


# ---------------------------------------------------------------- clips
def keys(part, channel, pts, dur, fps=30, ease=True):
    """Dense linear keys from (time, value) points with smoothstep easing between them (the format stays 'keys')."""
    ts, vs = [], []
    n = int(round(dur * fps))
    for i in range(n + 1):
        t = dur * i / n
        for k in range(len(pts) - 1):
            (t0, v0), (t1, v1) = pts[k], pts[k + 1]
            if t0 <= t <= t1:
                f = (t - t0) / max(1e-9, t1 - t0)
                if ease: f = f * f * (3 - 2 * f)
                v = v0 + (v1 - v0) * f
                break
        else:
            v = pts[-1][1] if t > pts[-1][0] else pts[0][1]
        ts.append(round(t, 4)); vs.append(round(v, 5))
    return {'part': part, 'channel': channel, 'fn': 'keys', 'times': ts, 'values': vs}


def sin(part, channel, amp, cycles, phase=0.0, bias=0.0):
    return {'part': part, 'channel': channel, 'fn': 'sin', 'amp': amp, 'cycles': cycles, 'phase': phase, 'bias': bias}


def blink(at, dur):
    """Eye squash (with a matching scale so the eye does not widen): open -> shut -> open."""
    pts_s = [(0, 0), (at, 0), (at + 0.05, -0.65), (at + 0.09, -0.65), (at + 0.16, 0), (dur, 0)]
    pts_k = [(0, 0), (at, 0), (at + 0.05, -0.41), (at + 0.09, -0.41), (at + 0.16, 0), (dur, 0)]
    return pts_s, pts_k


def merge(a, b):
    """Two point lists on the same channel, both 0 outside their events: sum them sampled at every key time."""
    return sorted(set(a + b))


def clips():
    out = []
    # ---- idle: breathing, two blinks (one double), head tilts and glances, wing and tail life. 4.8 s, all whole cycles.
    D = 4.8
    ch = [
        sin('body', 'squashZ', 0.022, 3), sin('body', 'rotY', 0.025, 1), sin('body', 'rotX', 0.012, 3, phase=1.2),
        sin('wingR', 'rotY', -0.035, 3, phase=0.4), sin('wingL', 'rotY', 0.035, 3, phase=0.4),
        sin('wingTipR', 'rotY', -0.03, 3, phase=1.0), sin('wingTipL', 'rotY', 0.03, 3, phase=1.0),
        sin('tail', 'rotZ', 0.10, 2), sin('tail', 'rotX', 0.05, 3, phase=0.7),
        keys('head', 'rotY', [(0, 0), (0.5, 0), (1.0, -0.14), (2.1, -0.12), (2.6, 0.0), (3.4, 0.09), (4.2, 0.08), (4.8, 0)], D),
        keys('head', 'rotZ', [(0, 0), (1.2, 0), (1.5, -0.32), (2.3, -0.30), (2.7, 0.06), (3.6, 0.1), (4.1, 0.0), (4.8, 0)], D),
        keys('head', 'rotX', [(0, 0), (1.5, 0.0), (1.75, 0.06), (2.4, 0.04), (2.8, -0.05), (3.6, -0.03), (4.2, 0.0), (4.8, 0)], D),
    ]
    # blinks at 0.9 s and a double at 3.0/3.25 s
    def ev(at, a): return [(at, 0), (at + 0.05, a), (at + 0.09, a), (at + 0.16, 0)]
    for eye in ('eyeR', 'eyeL'):
        ch.append(keys(eye, 'squashZ', [(0, 0)] + ev(0.9, -0.65) + ev(3.0, -0.65) + ev(3.22, -0.65)[1:] + [(D, 0)], D, fps=50, ease=False))
        ch.append(keys(eye, 'scale', [(0, 0)] + ev(0.9, -0.41) + ev(3.0, -0.41) + ev(3.22, -0.41)[1:] + [(D, 0)], D, fps=50, ease=False))
    out.append({'name': 'idle', 'duration': D, 'loop': True, 'channels': ch})

    # ---- talk: the beak opens and shuts per syllable (uneven, like speech), the head nods and bobs. 1.2 s loop.
    D = 1.2
    syl = [(0.0, 0.0), (0.08, 0.42), (0.2, 0.05), (0.3, 0.30), (0.42, 0.0), (0.52, 0.48), (0.66, 0.08), (0.76, 0.26), (0.9, 0.02), (1.0, 0.38), (1.12, 0.05), (1.2, 0.0)]
    ch = [
        keys('beakL', 'rotX', [(t, v) for t, v in syl], D, fps=50),
        keys('beakU', 'rotX', [(t, -v * 0.22) for t, v in syl], D, fps=50),
        sin('head', 'rotX', 0.07, 2, phase=0.5), sin('head', 'posZ', 0.35, 4, phase=0.9),
        sin('head', 'rotY', 0.05, 1), sin('body', 'squashZ', 0.018, 4, phase=0.9),
        keys('wingR', 'rotY', [(0, 0), (0.25, -0.22), (0.55, -0.10), (0.85, -0.26), (1.2, 0)], D),
        keys('wingTipR', 'rotY', [(0, 0), (0.3, -0.18), (0.6, -0.05), (0.9, -0.2), (1.2, 0)], D),
    ]
    out.append({'name': 'talk', 'duration': D, 'loop': True, 'channels': ch})

    # ---- cheer: squash, jump with three flaps and happy eyes, land with a squash, settle. 1.2 s, one shot.
    D = 1.2
    up, land = 0.40, 0.70
    ch = [
        keys('@root', 'posZ', [(0, 0), (0.12, 0), (0.24, 4.6), (up, 7.0), (0.52, 6.0), (land, 0), (D, 0)], D),
        keys('body', 'squashZ', [(0, 0), (0.11, -0.20), (0.2, 0.14), (0.34, 0.04), (0.6, 0.06), (land, 0.02), (0.78, -0.24), (0.9, 0.07), (1.0, -0.03), (D, 0)], D),
        keys('head', 'rotX', [(0, 0), (0.11, 0.12), (0.26, -0.16), (0.55, -0.1), (land, 0.04), (0.8, 0.12), (0.95, -0.04), (D, 0)], D),
        keys('head', 'posZ', [(0, 0), (0.12, -0.6), (0.24, 0.6), (land, 0), (0.8, -0.9), (0.95, 0.3), (D, 0)], D),
        keys('beakL', 'rotX', [(0, 0), (0.14, 0), (0.24, 0.5), (0.5, 0.45), (0.62, 0.0), (D, 0)], D),
        keys('beakU', 'rotX', [(0, 0), (0.14, 0), (0.24, -0.1), (0.5, -0.08), (0.62, 0.0), (D, 0)], D),
        keys('tail', 'rotX', [(0, 0), (0.12, 0.3), (0.3, -0.35), (land, 0.1), (0.82, 0.35), (D, 0)], D),
        keys('footR', 'rotX', [(0, 0), (0.15, 0), (0.28, 0.35), (0.6, 0.3), (land, 0), (D, 0)], D),
        keys('footL', 'rotX', [(0, 0), (0.15, 0), (0.28, 0.42), (0.6, 0.25), (land, 0), (D, 0)], D),
    ]
    for eye, happy in (('eyeR', 'happyR'), ('eyeL', 'happyL')):
        ch.append(keys(eye, 'posY', [(0, 0), (0.06, 0), (0.1, HAPPY_HIDE), (0.98, HAPPY_HIDE), (1.04, 0), (D, 0)], D, fps=50, ease=False))
        ch.append(keys(happy, 'posY', [(0, 0), (0.06, 0), (0.1, -HAPPY_HIDE), (0.98, -HAPPY_HIDE), (1.04, 0), (D, 0)], D, fps=50, ease=False))
    # three flaps: up (wings out and raised) / down, the tips lagging behind
    flap = [(0, 0), (0.1, 0.25), (0.2, -2.15), (0.3, -0.7), (0.4, -2.25), (0.5, -0.75), (0.6, -1.9), (land, -0.3), (0.8, 0.12), (D, 0)]
    tipf = [(0, 0), (0.13, 0.35), (0.23, -0.55), (0.33, 0.45), (0.43, -0.6), (0.53, 0.4), (0.63, -0.45), (0.75, 0.15), (0.85, -0.05), (D, 0)]
    ch.append(keys('wingR', 'rotY', flap, D)); ch.append(keys('wingL', 'rotY', [(t, -v) for t, v in flap], D))
    ch.append(keys('wingTipR', 'rotY', tipf, D)); ch.append(keys('wingTipL', 'rotY', [(t, -v) for t, v in tipf], D))
    lift = [(0, 0), (0.2, -0.35), (0.6, -0.3), (land, 0), (D, 0)]
    ch.append(keys('wingR', 'rotX', lift, D)); ch.append(keys('wingL', 'rotX', lift, D))
    out.append({'name': 'cheer', 'duration': D, 'loop': False, 'channels': ch})

    # ---- point: the aim itself is computed at run time from the target; this clip is its life — a small wiggle of the
    # pointing wing's tip, a lean toward the target and a little bob. 1.0 s loop.
    D = 1.0
    ch = [
        sin('wingTipR', 'rotX', 0.10, 2), sin('wingTipR', 'rotY', 0.08, 2, phase=1.3),
        sin('wingR', 'rotX', 0.03, 1, phase=0.4),
        sin('wingTipL', 'rotX', 0.10, 2), sin('wingTipL', 'rotY', -0.08, 2, phase=1.3),
        sin('wingL', 'rotX', 0.03, 1, phase=0.4),
        sin('head', 'rotX', 0.04, 2, phase=0.8), sin('body', 'squashZ', 0.015, 2, phase=0.8),
    ]
    out.append({'name': 'point', 'duration': D, 'loop': True, 'channels': ch})
    return out


if __name__ == '__main__':
    build()
