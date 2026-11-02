# Kael Studio head kit: sculpts each species' head in Blender from soft blended volumes (metaballs),
# smooths it, then bakes it into a compact radial "shape map" the Creator reads:
#   - head radius for 3 snout settings (short / normal / long), sampled on a sphere grid
#   - a muzzle mask and a cheek-fluff mask (soft, from how much each volume shapes that spot)
#   - one shared animal nose shape (rounded triangle with nostrils)
# Build space: metres-free unit head, Y up, facing +Z, character's left at +X.
# Run:  python3 heads.py <out_dir>
import sys, json, math, struct
import bpy, bmesh
from mathutils import Vector, Quaternion
from mathutils.bvhtree import BVHTree
import numpy as np

OUT = sys.argv[-1] if len(sys.argv) > 1 and not sys.argv[-1].endswith('.py') else '.'
NU, NV = 128, 65            # head grid: theta (around) x phi (pole to pole, inclusive)
NNU, NNV = 64, 33           # nose grid
RMAX = 2.5                  # u16 radius range
FIELD_R = 0.5747            # surface radius of a unit metaball at stiffness 2, threshold 0.6

SPECIES = {   # head radii and snout settings mirror public/creator/catalog.js
  'human':   dict(head=(1.0, 1.08, 0.98), muzzle=0.0, snout=0.0, kind='human'),
  'elf':     dict(head=(0.98, 1.1, 0.98), muzzle=0.0, snout=0.0, kind='human', elf=True),
  'cat':     dict(head=(1.12, 1.0, 1.0), muzzle=0.35, snout=0.25, pads=1.0, chin=0.6, cheeks='tuft', tufts=2, tuft=0.8),
  'fox':     dict(head=(1.12, 0.98, 1.02), muzzle=0.55, snout=0.75, pads=0.55, chin=0.7, bridge=0.8, cheeks='tuft', tufts=2, tuft=1.15),
  'wolf':    dict(head=(1.14, 1.0, 1.04), muzzle=0.6, snout=0.7, pads=0.5, chin=0.85, bridge=1.0, brow=0.8, cheeks='tuft', tufts=3, tuft=1.15),
  'raccoon': dict(head=(1.15, 1.0, 1.02), muzzle=0.5, snout=0.5, pads=0.6, chin=0.6, bridge=0.5, cheeks='tuft', tufts=2, tuft=1.3),
  'bear':    dict(head=(1.16, 1.0, 1.02), muzzle=0.55, snout=0.4, pads=0.25, chin=0.8, bridge=0.6, brow=0.5, cheeks='round', round=1.0),
  'panda':   dict(head=(1.18, 1.0, 1.02), muzzle=0.45, snout=0.35, pads=0.25, chin=0.6, cheeks='round', round=1.15),
  'bunny':   dict(head=(1.08, 1.02, 1.0), muzzle=0.35, snout=0.2, pads=1.15, chin=0.4, cheeks='round', round=0.85),
  'tiger':   dict(head=(1.16, 1.0, 1.02), muzzle=0.5, snout=0.45, pads=0.9, chin=0.75, bridge=0.7, brow=0.6, cheeks='tuft', tufts=3, tuft=1.35),
  'mouse':   dict(head=(1.06, 0.98, 1.02), muzzle=0.4, snout=0.55, pads=0.8, chin=0.4, cheeks='round', round=0.7),
}

V = lambda *a: Vector(a)
def unit(*a): return Vector(a).normalized()

class Sculpt:
    """A set of metaball volumes. Each volume also belongs to a group used for the colour masks."""
    def __init__(self): self.els = []; self.paints = []
    def paint(self, c, radii, axis=None, group='cheek'):
        """Colour-only volume: shapes nothing, only paints a mask."""
        n = len(self.els); self.add(c, radii, axis, group); self.paints.append(self.els.pop(n))
    def paint_field(self, p, group):
        keep = self.els; self.els = self.paints
        try: return self.field(p, group)
        finally: self.els = keep
    def add(self, c, radii, axis=None, group='skull', neg=False, stiff=2.0):
        radii = Vector(radii); R = max(radii) / FIELD_R
        q = Vector((0, 0, 1)).rotation_difference(Vector(axis).normalized()) if axis is not None else Quaternion()
        self.els.append(dict(c=Vector(c), size=radii / max(radii), R=R, q=q, group=group, neg=neg, s=stiff))
    def field(self, p, group=None):
        tot = 0.0
        for e in self.els:
            if group is not None and e['group'] != group: continue
            l = e['q'].inverted() @ (p - e['c'])
            d2 = (l.x / e['size'].x) ** 2 + (l.y / e['size'].y) ** 2 + (l.z / e['size'].z) ** 2
            d2 /= e['R'] ** 2
            if d2 < 1: f = e['s'] * (1 - d2) ** 3; tot += -f if e['neg'] else f
        return tot
    def mesh(self, res=0.022):
        mb = bpy.data.metaballs.new('mb'); mb.resolution = res; mb.render_resolution = res; mb.threshold = 0.6
        ob = bpy.data.objects.new('mb', mb); bpy.context.scene.collection.objects.link(ob)
        for e in self.els:
            el = mb.elements.new(); el.type = 'ELLIPSOID'; el.co = e['c']; el.radius = e['R']; el.stiffness = e['s']
            el.size_x, el.size_y, el.size_z = e['size']; el.rotation = e['q']; el.use_negative = e['neg']
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
        bpy.data.objects.remove(ob); bpy.data.metaballs.remove(mb)
        bm = bmesh.new(); bm.from_mesh(me); bpy.data.meshes.remove(me)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        for _ in range(6): bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
        return bm

def head_sculpt(cfg, amt):
    rx, ry, rz = cfg['head']; S = Sculpt()
    if cfg.get('kind') == 'human':
        S.add((0, 0.1 * ry, -0.03), (rx * 0.97, ry * 0.9, rz * 0.97))                       # cranium
        S.add((0, -0.36 * ry, 0.12), (rx * 0.74, ry * 0.6, rz * 0.76))                       # face / jaw
        S.add((0, -0.8 * ry, 0.46), (0.2, 0.17, 0.18), group='chin')                        # chin
        for s in (1, -1): S.add((s * 0.46 * rx, -0.12 * ry, 0.66), (0.24, 0.2, 0.2), axis=(s * 0.4, 0, 1))   # cheekbones
        S.add((0, 0.32 * ry, 0.72), (0.5, 0.26, 0.2), axis=(0, 0.3, 1))                      # forehead
        return S
    S.add((0, 0.02, -0.02), (rx * 0.97, ry * 0.95, rz * 0.97))                               # cranium
    sn = cfg['snout']
    m = unit(0, -0.36, 1)
    w, h = 0.44 - 0.16 * sn, 0.31 - 0.06 * sn
    L = 0.24 + 0.4 * amt
    tip = 1.0 + 0.46 * amt
    mc = m * (tip - L * 0.95)
    S.add(mc, (w, h, L), axis=m, group='muzzle')                                            # muzzle
    up = m.cross(V(1, 0, 0)).normalized() * -1                                                # muzzle "up" (towards forehead)
    if up.y < 0: up = -up
    if cfg.get('pads'):                                                                        # whisker pads
        k = cfg['pads']
        for s in (1, -1):
            S.add(mc + V(s * w * 0.42, 0, 0) - up * h * 0.25 + m * L * 0.45, (w * 0.5 * (0.7 + 0.3 * k), h * 0.62 * (0.7 + 0.3 * k), L * 0.55), axis=m, group='muzzle', stiff=1.0 + k)
    if cfg.get('chin'):                                                                        # lower jaw / chin
        k = cfg['chin']
        S.add(mc - up * h * 0.95 + m * L * 0.05, (w * 0.62 * k, h * 0.42, L * 0.62), axis=m, group='muzzle')
    if cfg.get('bridge'):                                                                      # nose bridge
        k = cfg['bridge']; a = V(0, 0.18, 0.88); b = mc + up * h * 0.55 + m * L * 0.5
        S.add((a + b) / 2, (0.17 * k + 0.05, 0.1 * k + 0.04, (b - a).length * 0.55), axis=b - a, stiff=1.6)
    if cfg.get('brow'):                                                                        # brow ridge
        k = cfg['brow']
        for s in (1, -1): S.add((s * 0.36 * rx, 0.3, 0.8), (0.2 * k + 0.05, 0.1 * k + 0.03, 0.12), axis=(s * 0.45, 0.25, 1), stiff=1.4)
    if cfg.get('cheeks') == 'round':                                                           # chubby cheeks
        k = cfg['round']
        for s in (1, -1): S.add((s * 0.56 * rx, -0.36, 0.5), (0.34 * k, 0.3 * k, 0.3 * k), axis=(s * 0.6, 0, 1), group='cheek', stiff=1.6)
    if cfg.get('cheeks') == 'tuft':                                                            # cheek fluff tufts
        k = cfg['tuft']; n = cfg['tufts']
        for s in (1, -1):
            S.add((s * 0.62 * rx, -0.38, 0.42), (0.3, 0.26, 0.28), axis=(s * 0.7, -0.2, 1), stiff=1.4)   # soft cheek pad
            S.paint((s * 0.5 * rx, -0.5, 0.62), (0.46, 0.26, 0.5), axis=(s * 0.55, -0.15, 1))                # pale cheek band, joins the muzzle
            for i in range(n):
                t = i / max(1, n - 1) if n > 1 else 0.5
                ang = -0.35 - 0.6 * t                                                          # fan downward
                ax = V(s * math.cos(ang), math.sin(ang), -0.08 - 0.12 * t).normalized()
                base = V(s * 0.74 * rx, -0.32 - 0.24 * t, 0.4 - 0.18 * t)
                ln = (0.27 - 0.04 * i) * k
                # each tuft is a chain of shrinking volumes, so it tapers to a soft point
                for j, (f, w) in enumerate(((0.0, 0.12), (0.4, 0.08), (0.75, 0.05), (1.0, 0.028))):
                    S.add(base + ax * ln * f, (w * (0.6 + 0.4 * k), w * 0.75 * (0.6 + 0.4 * k), w * 1.6), axis=ax, group='tuft', stiff=1.5 + 0.4 * j)
    return S

def nose_sculpt():
    S = Sculpt()
    for s in (1, -1): S.add((s * 0.36, 0.16, 0), (0.62, 0.5, 0.55), axis=(s * 0.3, 0, 1))
    S.add((0, -0.32, 0.06), (0.34, 0.36, 0.42), axis=(0, -0.3, 1))
    S.add((0, 0.2, 0.08), (0.8, 0.32, 0.5))                                                     # flat-ish top
    for s in (1, -1): S.add((s * 0.34, -0.04, 0.56), (0.17, 0.11, 0.2), axis=(s * 0.5, -0.2, 1), neg=True, stiff=2.4)
    return S

def grid_dirs(nu, nv):
    out = []
    for j in range(nv):
        ph = j / (nv - 1) * math.pi
        for i in range(nu):
            th = i / nu * 2 * math.pi
            out.append(Vector((math.sin(ph) * math.sin(th), math.cos(ph), math.sin(ph) * math.cos(th))))
    return out

def radial(bm, dirs, centre=Vector()):
    tree = BVHTree.FromBMesh(bm)
    rs = []
    for d in dirs:
        hit = tree.ray_cast(centre + d * 4.0, -d, 8.0)
        rs.append((hit[0] - centre).length if hit[0] is not None else 0.0)
    return rs

def ray_hit(bm, d):
    tree = BVHTree.FromBMesh(bm); hit = tree.ray_cast(d * 4.0, -d, 8.0); return hit[0]

def scale_bm(bm, s):
    for v in bm.verts: v.co = Vector((v.co.x * s.x, v.co.y * s.y, v.co.z * s.z))

def smoothstep(a, b, x):
    t = min(1, max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t)

def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    dirs = grid_dirs(NU, NV)
    blob = bytearray(); index = {}
    report = {}
    for name, cfg in SPECIES.items():
        rx, ry, rz = cfg['head']; human = cfg.get('kind') == 'human'
        variants = [0.0, 0.5, 1.0]
        scale = None; grids = []; masks = None
        for mv in variants:
            amt = cfg['muzzle'] * (0.4 + 1.2 * mv)
            S = head_sculpt(cfg, amt); bm = S.mesh()
            if scale is None:   # fit the cranium to the same size as the analytic heads (top, back, upper side)
                top = ray_hit(bm, V(0, 1, 0)); back = ray_hit(bm, V(0, 0, -1)); side = ray_hit(bm, unit(1, 0.35, 0))
                ty = ry * (0.97 if human else 0.96); tz = rz * (0.94 if human else 1.0)
                sd = unit(1, 0.35, 0); tx = sd.x * rx
                scale = Vector((tx / side.x, ty / top.y, tz / -back.z))
            scale_bm(bm, scale)
            grids.append(radial(bm, dirs))
            if mv == 0.5:   # bake colour masks from how much each group of volumes shapes the surface
                mm, cm = [], []
                for d, r in zip(dirs, grids[-1]):
                    p = Vector((d.x * r / scale.x, d.y * r / scale.y, d.z * r / scale.z))
                    # sample just inside the surface so thin features still read
                    pin = p - d * 0.03
                    tot = max(1e-6, S.field(pin))
                    fm = S.field(pin, 'muzzle'); ft = S.field(pin, 'tuft'); fp = S.paint_field(p, 'cheek')
                    mm.append(smoothstep(0.24, 0.56, fm / tot))
                    cm.append(max(smoothstep(0.3, 0.55, ft / tot), smoothstep(0.35, 0.75, fp)))
                masks = (mm, cm)
            bm.free()
        off = len(blob)
        for g in grids: blob += struct.pack('<%dH' % len(g), *[min(65535, int(round(r / RMAX * 65535))) for r in g])
        for mk in masks: blob += bytes(int(round(min(1, max(0, x)) * 255)) for x in mk)
        index[name] = off
        report[name] = dict(scale=[round(x, 3) for x in scale], front=[round(g[(NV // 2) * NU], 3) for g in grids])
        print(name, report[name], flush=True)
    # nose
    S = nose_sculpt(); bm = S.mesh(0.015)
    xs = [v.co.x for v in bm.verts]; ys = [v.co.y for v in bm.verts]; zs = [v.co.z for v in bm.verts]
    c = Vector(((max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2, (max(zs) + min(zs)) / 2 - 0.05))
    for v in bm.verts: v.co -= c
    hw = (max(xs) - min(xs)) / 2
    for v in bm.verts: v.co /= hw
    nrs = radial(bm, grid_dirs(NNU, NNV))
    nose_off = len(blob)
    blob += struct.pack('<%dH' % len(nrs), *[min(65535, int(round(r / RMAX * 65535))) for r in nrs])
    bm.free()
    while len(blob) % 4: blob += b'\0'
    meta = dict(version=1, nu=NU, nv=NV, rmax=RMAX, species=index, variants=[0, 0.5, 1], nose=dict(offset=nose_off, nu=NNU, nv=NNV), bytes=len(blob))
    open(f'{OUT}/heads.bin', 'wb').write(blob)
    open(f'{OUT}/heads.json', 'w').write(json.dumps(meta))
    print('wrote', len(blob), 'bytes', flush=True)

if __name__ == "__main__":
    main()
