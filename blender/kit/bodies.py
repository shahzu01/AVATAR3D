# Kael Studio body kit: sculpts the torso, arms, legs, palms and bare feet in Blender from blended volumes
# (chest, shoulder blades, belly, glutes, deltoids, biceps, calves, knee caps, heels, toes, paw pads...),
# then bakes each part as a cylindrical "shape map": how far the sculpted surface sits in or out of the
# plain tube the Creator builds, for every height along the part and every angle around it.
#
# Two maps per part:   skin  - the sculpted surface itself
#                      cloth - the same, but with the hollows filled in (clothes drape over the spine groove,
#                              between the glutes, etc.), never inside the skin, so garments never clip.
# Three channels each: base, build (chunky minus normal), chest (fuller chest minus normal).
# Two styles: human, animal.  All parts work in a normalised space: unit-radius tube along +Y.
#
# Run:  python3 bodies.py <out_dir>
import sys, json, math, struct
import numpy as np
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from heads import Sculpt

OUT = sys.argv[-1] if len(sys.argv) > 1 and not sys.argv[-1].endswith('.py') else '.'
V = lambda *a: Vector(a)

# part: length (in radius units), grid size (angles x heights), and which local axes the angle uses.
# Angle psi: local dir = (sin psi, 0, cos psi) -> psi=0 is local +Z, psi=90deg is local +X.
PARTS = {
    'torso': dict(L=6.0, nu=72, nv=56),   # +Z front, +X character's left; h: 0 below hips .. 1 neck (landmark-warped)
    'arm':   dict(L=11.0, nu=40, nv=48),  # +Z front, +X up (T-pose); h: 0 inside shoulder .. 1 wrist
    'leg':   dict(L=8.5, nu=40, nv=52),   # +Z front, +X outward; h: 0 hip .. 1 ankle
    'palm':  dict(L=2.2, nu=40, nv=24),   # +Z thumb side, +X back of hand; h: 0 wrist .. 1 knuckles
    'foot':  dict(L=3.4, nu=40, nv=28),   # +Z up (top of foot), +X outward; h: 0 heel .. 1 toes
}
SCALE = 1 / 250.0
CHANNELS = ['build', 'chest', 'fem', 'masc', 'bust']   # int8 step for offsets (range about +-0.5)

def base_chain(S, L, r=1.0):
    """Plain tube made of overlapping volumes along +Y, extending past both ends."""
    n = int(L / 0.25) + 9
    for k in range(n):
        y = -1.0 + k * (L + 2.0) / (n - 1)
        S.add((0, y, 0), (0.62 * r, 0.62 * r, 0.62 * r), group='base', stiff=2.0)

def at(L, x, h, z): return (x, h * L, z)

class Soft:
    """Wraps a Sculpt so feature volumes sit a little deeper and blend more softly: muscles read as gentle
    swellings under the surface instead of separate lumps."""
    def __init__(self, S, depth=0.84, soft=0.75): self.S, self.depth, self.soft = S, depth, soft
    def add(self, c, radii, axis=None, group='skull', neg=False, stiff=2.0):
        c = (c[0] * self.depth, c[1], c[2] * self.depth) if not neg else c
        self.S.add(c, radii, axis, group, neg, stiff * (self.soft if not neg else 1.0))

TARGET = dict(torso=0.2, arm=0.17, leg=0.16, palm=0.22, foot=0.18)   # largest swelling allowed (fraction of radius)

def blur(a, n=1):
    k = np.array([1, 2, 1], float) / 4
    nv = a.shape[0]
    for _ in range(n):
        a = sum(kk * np.roll(a, s - 1, axis=1) for s, kk in enumerate(k))
        p = np.pad(a, ((1, 1), (0, 0)), mode='edge'); a = sum(kk * p[s: s + nv] for s, kk in enumerate(k))
    return a

# ------------------------------------------------------------------ sculpt recipes
def torso(S, L, style, chan):
    hum = style == 'human'
    P = lambda x, h, z: at(L, x, h, z)
    # landmarks (h): hips 0.12, waist 0.40, chest 0.65, shoulders 0.95, neck 1.0
    if chan == 'chest':
        for s in (1, -1): S.add(P(s * 0.4, 0.68, 0.72), (0.42, 0.42, 0.34), stiff=1.4)
        return
    if chan == 'fem':     # female starting shape: defined waist, fuller hips and seat
        for s in (1, -1): S.add(P(s * 1.08, 0.42, 0), (0.2, 0.75, 0.55), neg=True, stiff=1.3)
        for s in (1, -1): S.add(P(s * 0.42, 0.06, -0.78), (0.46, 0.5, 0.42), stiff=1.3)
        for s in (1, -1): S.add(P(s * 0.95, 0.1, 0.05), (0.32, 0.5, 0.45), stiff=1.2)
        return
    if chan == 'bust':    # modest, rounded bust (size follows the chest slider)
        for s in (1, -1): S.add(P(s * 0.36, 0.66, 0.74), (0.36, 0.33, 0.34), stiff=1.5)
        return
    if chan == 'masc':    # male starting shape: broad flat chest, lats, trapezius
        for s in (1, -1): S.add(P(s * 0.42, 0.73, 0.72), (0.5, 0.42, 0.2), stiff=1.3)
        for s in (1, -1): S.add(P(s * 0.96, 0.66, -0.2), (0.28, 0.75, 0.5), stiff=1.2)
        for s in (1, -1): S.add(P(s * 0.4, 0.97, -0.25), (0.4, 0.2, 0.3), stiff=1.0)
        return
    if chan == 'build':
        S.add(P(0, 0.3, 0.75), (0.75, 1.1, 0.38), stiff=1.2)                    # rounder belly
        for s in (1, -1): S.add(P(s * 0.9, 0.3, 0.05), (0.3, 0.8, 0.5), stiff=1.0)   # softer sides
        for s in (1, -1): S.add(P(s * 0.4, 0.1, -0.8), (0.42, 0.5, 0.36), stiff=1.0)
        return
    # shoulder blades and spine
    for s in (1, -1): S.add(P(s * 0.45, 0.8, -0.78), (0.42, 0.55, 0.24), stiff=1.2 if hum else 0.8)
    if hum: S.add(P(0, 0.55, -1.05), (0.1, 2.6, 0.12), neg=True, stiff=1.6)        # spine groove
    # chest
    if hum:
        for s in (1, -1): S.add(P(s * 0.4, 0.72, 0.72), (0.44, 0.48, 0.28), stiff=1.3)   # pecs
        for s in (1, -1): S.add(P(s * 0.42, 0.93, 0.62), (0.5, 0.12, 0.15), stiff=1.0)   # collarbones
    else:
        S.add(P(0, 0.74, 0.8), (0.7, 0.62, 0.3), stiff=1.3)                         # chest fluff
    # belly
    if hum: S.add(P(0, 0.3, 0.82), (0.5, 0.7, 0.22), stiff=0.8)
    else: S.add(P(0, 0.3, 0.82), (0.72, 1.05, 0.35), stiff=1.4)                      # round tummy
    # waist and glutes
    if hum:
        for s in (1, -1): S.add(P(s * 1.06, 0.42, 0), (0.18, 0.9, 0.5), neg=True, stiff=1.2)
    for s in (1, -1): S.add(P(s * 0.4, 0.07, -0.8), (0.44, 0.52, 0.38), stiff=1.5 if hum else 1.7)
    if hum: S.add(P(0, 0.06, -1.02), (0.08, 0.5, 0.12), neg=True, stiff=1.2)     # cleft (skin only; cloth fills it)

def arm(S, L, style, chan):
    hum = style == 'human'
    P = lambda x, h, z: at(L, x, h, z)
    if chan in ('chest', 'bust', 'fem'): return
    if chan == 'build':
        S.add(P(-0.2, 0.3, 0), (0.6, 1.6, 0.6), stiff=0.8); S.add(P(0.2, 0.68, 0), (0.55, 1.6, 0.55), stiff=0.6)
        return
    if chan == 'masc':    # fuller shoulder cap, biceps and forearm
        S.add(P(0.35, 0.08, 0.05), (0.85, 1.3, 0.85), stiff=1.0); S.add(P(0.3, 0.3, 0.6), (0.5, 1.2, 0.45), stiff=1.0)
        S.add(P(0.5, 0.66, 0.2), (0.55, 1.5, 0.5), stiff=1.0)
        return
    S.add(P(0.35, 0.07, 0.08), (0.8, 1.2, 0.8), stiff=1.3)                          # deltoid cap
    if hum:
        S.add(P(0.3, 0.3, 0.62), (0.48, 1.2, 0.42), stiff=1.3)                      # biceps
        S.add(P(-0.25, 0.28, -0.6), (0.48, 1.4, 0.42), stiff=1.3)                   # triceps
        S.add(P(0.55, 0.66, 0.2), (0.5, 1.5, 0.48), stiff=1.3)                      # forearm
    else:
        S.add(P(0.1, 0.3, 0.2), (0.6, 1.5, 0.6), stiff=1.0)                         # soft upper arm
        S.add(P(0.3, 0.68, 0.15), (0.55, 1.5, 0.55), stiff=1.0)                     # soft forearm
    S.add(P(-0.15, 0.555, -0.82), (0.28, 0.35, 0.26), stiff=1.4)                    # elbow
    S.add(P(0, 0.985, 0), (0.75, 0.25, 0.75), neg=True, stiff=0.5)                  # slimmer wrist

def leg(S, L, style, chan):
    hum = style == 'human'
    P = lambda x, h, z: at(L, x, h, z)
    if chan in ('chest', 'bust'): return
    if chan == 'build':
        S.add(P(0.2, 0.22, 0.1), (0.7, 1.8, 0.65), stiff=0.9); S.add(P(0, 0.7, -0.4), (0.55, 1.2, 0.5), stiff=0.7)
        return
    if chan == 'fem':     # fuller upper thigh and hip line
        S.add(P(0.6, 0.12, 0.0), (0.5, 1.4, 0.6), stiff=1.2); S.add(P(-0.5, 0.15, 0.1), (0.4, 1.2, 0.5), stiff=0.8)
        return
    if chan == 'masc':    # firmer calf and quads
        S.add(P(-0.15, 0.68, -0.72), (0.55, 1.2, 0.5), stiff=1.0); S.add(P(0.1, 0.28, 0.65), (0.55, 1.6, 0.42), stiff=1.0)
        return
    if hum:
        S.add(P(0.1, 0.26, 0.68), (0.55, 1.7, 0.42), stiff=1.3)                     # quads
        S.add(P(0.72, 0.28, 0.15), (0.38, 1.5, 0.5), stiff=1.1)                     # outer thigh
        S.add(P(0, 0.25, -0.68), (0.55, 1.7, 0.4), stiff=1.2)                       # hamstrings
        S.add(P(-0.2, 0.68, -0.72), (0.55, 1.2, 0.48), stiff=1.5)                   # calf
        for s in (1, -1): S.add(P(s * 0.95, 0.975, 0), (0.17, 0.17, 0.17), stiff=1.3)   # ankle bones
    else:
        S.add(P(0.1, 0.18, -0.55), (0.75, 1.6, 0.6), stiff=1.5)                     # haunch
        S.add(P(0.15, 0.25, 0.55), (0.6, 1.5, 0.45), stiff=1.0)                     # thigh front
        S.add(P(-0.1, 0.68, -0.65), (0.55, 1.2, 0.5), stiff=1.2)                    # calf
    S.add(P(0, 0.535, 0.9), (0.33, 0.33, 0.24), stiff=1.4)                          # knee cap
    S.add(P(0, 0.99, 0), (0.7, 0.3, 0.7), neg=True, stiff=0.4)                      # slimmer ankle

def palm(S, L, style, chan):
    paw = style == 'animal'
    P = lambda x, h, z: at(L, x, h, z)
    if chan != 'base': return
    for i, z in enumerate((0.72, 0.24, -0.24, -0.72)):                             # knuckles
        S.add(P(0.82, 0.93, z), (0.22, 0.2, 0.2), stiff=1.2 if not paw else 0.8)
    if paw:
        S.add(P(-0.9, 0.58, -0.05), (0.62, 0.42, 0.32), stiff=1.6)                  # big palm pad
        S.add(P(-0.75, 0.15, 0.1), (0.4, 0.3, 0.3), stiff=1.0)
    else:
        S.add(P(-0.82, 0.25, 0.55), (0.42, 0.42, 0.34), stiff=1.4)                  # thumb pad
        S.add(P(-0.85, 0.3, -0.6), (0.36, 0.5, 0.3), stiff=1.0)                     # outer pad
        S.add(P(-0.95, 0.55, 0), (0.4, 0.3, 0.4), neg=True, stiff=0.7)              # palm hollow

def foot(S, L, style, chan):
    paw = style == 'animal'
    P = lambda x, h, z: at(L, x, h, z)
    if chan != 'base': return
    S.add(P(0, 0.07, -0.45), (0.65, 0.45, 0.5), stiff=1.3)                          # heel
    S.add(P(0, 0.35, 0.85), (0.6, 0.65, 0.3), stiff=1.0)                            # instep
    if paw:
        for x in (0.62, 0.2, -0.2, -0.62): S.add(P(x, 0.86, 0.6), (0.27, 0.3, 0.3), stiff=1.5)   # toe beans
        for x in (0.42, 0.0, -0.42): S.add(P(x, 0.9, 0.78), (0.06, 0.32, 0.12), neg=True, stiff=1.2)   # gaps between toes
    else:
        S.add(P(-0.45, 0.45, -1.0), (0.42, 0.7, 0.28), neg=True, stiff=1.2)         # arch (inner side)
        for i, x in enumerate((-0.68, -0.3, 0.05, 0.38, 0.68)):                    # toes, big toe on the inside
            S.add(P(x, 0.88 + (0.04 if i == 0 else -0.015 * i), 0.55), (0.24 if i == 0 else 0.17, 0.2, 0.2), stiff=1.3)
SCULPT = dict(torso=torso, arm=arm, leg=leg, palm=palm, foot=foot)

# ------------------------------------------------------------------ baking
def radii(bm, L, nu, nv):
    tree = BVHTree.FromBMesh(bm)
    out = np.zeros((nv, nu))
    for j in range(nv):
        h = j / (nv - 1); o = V(0, h * L, 0)
        for i in range(nu):
            ps = i / nu * 2 * math.pi; d = V(math.sin(ps), 0, math.cos(ps))
            hit = tree.ray_cast(o + d * 4.0, -d, 8.0)
            out[j, i] = (hit[0] - o).length if hit[0] is not None else 1.0
    return out

def bake_part(name, style):
    cfg = PARTS[name]; L, nu, nv = cfg['L'], cfg['nu'], cfg['nv']
    def surface(chans):
        S = Sculpt(); base_chain(S, L)
        for c in chans: SCULPT[name](Soft(S), L, style, c)
        bm = S.mesh(res=0.035); r = radii(bm, L, nu, nv); bm.free(); return r
    r0 = surface([])
    b0 = blur(surface(['base']) / r0 - 1)
    g = min(1.0, TARGET[name] / max(1e-6, np.percentile(b0, 99.5)))      # keep the largest swelling in range
    out = {'base': b0 * g}
    for ch in CHANNELS:      # each channel = (base + channel) - base, at the same gain
        out[ch] = (blur(surface(['base', ch]) / r0 - 1) - b0) * g
    return out

def cloth_of(skin):
    """Fill hollows: max-filter then blur (wrapping around), and never inside the skin."""
    nv, nu = skin.shape
    m = skin.copy()
    for di in range(-3, 4):
        for dj in range(-2, 3):
            m = np.maximum(m, np.roll(np.pad(skin, ((2, 2), (0, 0)), mode='edge')[2 + dj: 2 + dj + nv], di, axis=1))
    k = np.array([1, 4, 6, 4, 1], float); k /= k.sum()
    b = m.copy()
    for _ in range(2):
        b = sum(kk * np.roll(b, s - 2, axis=1) for s, kk in enumerate(k))
        p = np.pad(b, ((2, 2), (0, 0)), mode='edge'); b = sum(kk * p[s: s + nv] for s, kk in enumerate(k))
    return np.maximum(b, skin + 0.004)

def q8(a): return np.clip(np.round(a / SCALE), -127, 127).astype(np.int8).tobytes()

def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    blob = bytearray(); index = {}
    for style in ('human', 'animal'):
        for name, cfg in PARTS.items():
            m = bake_part(name, style)
            entry = dict(nu=cfg['nu'], nv=cfg['nv'], channels=CHANNELS, offsets={})
            cb = cloth_of(m['base'])
            for ch in ['base'] + CHANNELS:
                entry['offsets'][f'skin.{ch}'] = len(blob); blob += q8(m[ch])
                entry['offsets'][f'cloth.{ch}'] = len(blob); blob += q8(cb if ch == 'base' else cloth_of(m['base'] + m[ch]) - cb)
            index[f'{style}.{name}'] = entry
            print(style, name, '  '.join('%s %.3f..%.3f' % (k, v.min(), v.max()) for k, v in m.items()), flush=True)
    while len(blob) % 4: blob += b'\0'
    meta = dict(version=1, scale=SCALE, parts=index, bytes=len(blob))
    open(f'{OUT}/bodies.bin', 'wb').write(blob)
    open(f'{OUT}/bodies.json', 'w').write(json.dumps(meta))
    print('wrote', len(blob), 'bytes', flush=True)

if __name__ == '__main__':
    main()
