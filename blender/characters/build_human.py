"""Adjustable human VRM: one model per gender, body types as shape keys, T-pose rest, VRM humanoid rig.
usage: python3 build_human.py female|male OUTDIR [--preview]"""
import sys, os, json, math, time
sys.path.insert(0, '/home/claude/kael/fox')
import numpy as np, bpy
import mh, recipes, musc
import scipy.sparse as sps
from collections import Counter, deque

GENDER = sys.argv[1]; OUT = sys.argv[2]; os.makedirs(OUT, exist_ok=True)
FEMALE = GENDER == 'female'
RIG = mh.DATA + '/rigs/'
SK = json.load(open(RIG + 'default.mhskel')); WTS = json.load(open(RIG + 'default_weights.mhw'))['weights']

# ------------------------------------------------------------------ body types
def type_list():
    if FEMALE:
        out = [('Balanced', recipes.get('female'), recipes.HEIGHT['female'], recipes.MUSCLE['female'])]
        for n in recipes.FEMALE_SHAPES:
            t, h = recipes.female_shape(n); out.append((n, t, h, recipes.MUSCLE['female']))
    else:
        out = [('Balanced', recipes.get('male'), recipes.HEIGHT['male'], recipes.MUSCLE['male'])]
        for n in recipes.MALE_TYPES:
            t, h, md = recipes.male_type(n); out.append((n, t, h, md))
    return out

# ------------------------------------------------------------------ MakeHuman bones -> VRM humanoid bones
def vrm_map():
    """MH bone -> VRM bone (merge twist, face, metacarpal, toe and breast bones into their humanoid owner)."""
    m = {'root': 'hips', 'pelvis.L': 'hips', 'pelvis.R': 'hips', 'spine05': 'spine', 'spine04': 'spine',
         'spine03': 'chest', 'spine02': 'chest', 'spine01': 'upperChest', 'breast.L': 'upperChest', 'breast.R': 'upperChest',
         'neck01': 'neck', 'neck02': 'neck', 'neck03': 'neck', 'head': 'head', 'eye.L': 'leftEye', 'eye.R': 'rightEye'}
    for b in SK['bones']:
        if b in m: continue
        side = 'left' if b.endswith('.L') else ('right' if b.endswith('.R') else None)
        base = b.split('.')[0]
        if side is None: m[b] = 'head'; continue          # jaw, tongue, oris, special...
        S = side
        if base in ('clavicle', 'shoulder01'): m[b] = S + 'Shoulder'
        elif base in ('upperarm01', 'upperarm02'): m[b] = S + 'UpperArm'
        elif base in ('lowerarm01', 'lowerarm02'): m[b] = S + 'LowerArm'
        elif base in ('wrist',) or base.startswith('metacarpal'): m[b] = S + 'Hand'
        elif base.startswith('finger'):
            f, k = base[6], int(base[8])
            names = {'1': ('ThumbMetacarpal', 'ThumbProximal', 'ThumbDistal'), '2': ('IndexProximal', 'IndexIntermediate', 'IndexDistal'),
                     '3': ('MiddleProximal', 'MiddleIntermediate', 'MiddleDistal'), '4': ('RingProximal', 'RingIntermediate', 'RingDistal'),
                     '5': ('LittleProximal', 'LittleIntermediate', 'LittleDistal')}[f]
            m[b] = S + names[k - 1]
        elif base in ('upperleg01', 'upperleg02'): m[b] = S + 'UpperLeg'
        elif base in ('lowerleg01', 'lowerleg02'): m[b] = S + 'LowerLeg'
        elif base == 'foot': m[b] = S + 'Foot'
        elif base.startswith('toe'): m[b] = S + 'Toes'
        else: m[b] = 'head'                                # facial bones with a side
    return m
MAP = vrm_map()
VBONES = []
for v in MAP.values():
    if v not in VBONES: VBONES.append(v)
VPARENT = {'hips': None, 'spine': 'hips', 'chest': 'spine', 'upperChest': 'chest', 'neck': 'upperChest', 'head': 'neck',
           'leftEye': 'head', 'rightEye': 'head'}
for S in ('left', 'right'):
    VPARENT.update({S + 'Shoulder': 'upperChest', S + 'UpperArm': S + 'Shoulder', S + 'LowerArm': S + 'UpperArm',
                    S + 'Hand': S + 'LowerArm', S + 'UpperLeg': 'hips', S + 'LowerLeg': S + 'UpperLeg',
                    S + 'Foot': S + 'LowerLeg', S + 'Toes': S + 'Foot'})
    for f in ('Thumb', 'Index', 'Middle', 'Ring', 'Little'):
        seg = ('Metacarpal', 'Proximal', 'Distal') if f == 'Thumb' else ('Proximal', 'Intermediate', 'Distal')
        prev = S + 'Hand'
        for sname in seg: VPARENT[S + f + sname] = prev; prev = S + f + sname

def vjoints(jp):
    """VRM bone (head, tail) positions from MH joint positions."""
    H = lambda b: jp[SK['bones'][b]['head']]; T = lambda b: jp[SK['bones'][b]['tail']]
    hipc = (H('upperleg01.L') + H('upperleg01.R')) / 2
    J = {'hips': (hipc + np.array([0, 0, 0.02]), H('spine04')), 'spine': (H('spine04'), H('spine03')),
         'chest': (H('spine03'), H('spine01')), 'upperChest': (H('spine01'), H('neck01')),
         'neck': (H('neck01'), H('head')), 'head': (H('head'), T('head')),
         'leftEye': (H('eye.L'), T('eye.L')), 'rightEye': (H('eye.R'), T('eye.R'))}
    J['hips'] = (J['hips'][0], H('spine04'))
    for S, s in (('left', 'L'), ('right', 'R')):
        J[S + 'Shoulder'] = (H('clavicle.' + s), H('upperarm01.' + s))
        J[S + 'UpperArm'] = (H('upperarm01.' + s), H('lowerarm01.' + s))
        J[S + 'LowerArm'] = (H('lowerarm01.' + s), H('wrist.' + s))
        J[S + 'Hand'] = (H('wrist.' + s), H('finger3-1.' + s))
        J[S + 'UpperLeg'] = (H('upperleg01.' + s), H('lowerleg01.' + s))
        J[S + 'LowerLeg'] = (H('lowerleg01.' + s), H('foot.' + s))
        J[S + 'Foot'] = (H('foot.' + s), H('toe3-1.' + s))
        J[S + 'Toes'] = (H('toe3-1.' + s), T('toe3-3.' + s))
        for f, fn in (('1', 'Thumb'), ('2', 'Index'), ('3', 'Middle'), ('4', 'Ring'), ('5', 'Little')):
            seg = ('Metacarpal', 'Proximal', 'Distal') if fn == 'Thumb' else ('Proximal', 'Intermediate', 'Distal')
            for k, sname in enumerate(seg):
                b = f'finger{f}-{k + 1}.{s}'; J[S + fn + sname] = (H(b), T(b))
    return J

# ------------------------------------------------------------------ helpers
def rot_between(a, b):
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b); v = np.cross(a, b); c = a @ b
    if np.linalg.norm(v) < 1e-9: return np.eye(3)
    vx = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + vx + vx @ vx * (1 / (1 + c))

def subdivide(P, faces, levels=1, groups=None):
    """Blender Catmull-Clark; returns positions, faces, normals and (optionally) interpolated weights."""
    me = bpy.data.meshes.new('tmp'); me.from_pydata(P.tolist(), [], faces); me.update()
    ob = bpy.data.objects.new('tmp', me); bpy.context.scene.collection.objects.link(ob)
    gnames = []
    if groups is not None:
        for gname, (idx, w) in groups.items():
            vg = ob.vertex_groups.new(name=gname); gnames.append(gname)
            for i, ww in zip(idx, w): vg.add([int(i)], float(ww), 'REPLACE')
    m = ob.modifiers.new('s', 'SUBSURF'); m.levels = levels; m.render_levels = levels
    dg = bpy.context.evaluated_depsgraph_get(); e = ob.evaluated_get(dg); em = e.to_mesh()
    V = np.array([v.co[:] for v in em.vertices]); N = np.array([v.normal[:] for v in em.vertices])
    F = [list(p.vertices) for p in em.polygons]
    W = None
    if groups is not None:
        W = np.zeros((len(V), len(gnames)), np.float32)
        gi = {g.index: g.name for g in e.vertex_groups}
        col = {g: k for k, g in enumerate(gnames)}
        for v in em.vertices:
            for g in v.groups: W[v.index, col[gi[g.group]]] = g.weight
    e.to_mesh_clear(); bpy.data.objects.remove(ob); bpy.data.meshes.remove(me)
    return V, F, N, W

def vnormals(V, F):
    T = mh.tris(F); N = np.zeros_like(V)
    fn = np.cross(V[T[:, 1]] - V[T[:, 0]], V[T[:, 2]] - V[T[:, 0]])
    for k in range(3): np.add.at(N, T[:, k], fn)
    return N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)

# ------------------------------------------------------------------ garments (fixed face set across types)
class Garment:
    def __init__(self, name, faces_sub, Mmask, off, thick, smooth):
        F = [f for f in faces_sub if all(Mmask[i] for i in f)]
        self.used = np.array(sorted({i for f in F for i in f})); rm = {v: k for k, v in enumerate(self.used)}
        self.F = [[rm[i] for i in f] for f in F]; self.name = name; self.off = off; self.thick = thick; self.smooth = smooth
        n = len(self.used); nb = [set() for _ in range(n)]
        for f in self.F:
            for a in range(len(f)): nb[f[a]].add(f[a - 1]); nb[f[a]].add(f[(a + 1) % len(f)])
        self.nbl = [list(x) for x in nb]
        rows = [i for i, l in enumerate(self.nbl) for _ in l]; cols = [j for l in self.nbl for j in l]
        Wm = sps.csr_matrix((np.ones(len(rows)), (rows, cols)), shape=(n, n))
        self.Wm = sps.diags(1 / np.maximum(np.asarray(Wm.sum(1)).ravel(), 1)) @ Wm
        ec = Counter()
        for f in self.F:
            for q in range(len(f)): ec[tuple(sorted((f[q], f[(q + 1) % len(f)])))] += 1
        self.bnb = [[] for _ in range(n)]
        for (i, j), k in ec.items():
            if k == 1: self.bnb[i].append(j); self.bnb[j].append(i)
        ring = np.full(n, 99); dq = deque()
        for i in range(n):
            if self.bnb[i]: ring[i] = 0; dq.append(i)
        while dq:
            i = dq.popleft()
            for j in self.nbl[i]:
                if ring[j] > ring[i] + 1: ring[j] = ring[i] + 1; dq.append(j)
        self.wgt = np.clip(ring / 3.0, 0, 1)[:, None]
        self.bi = [i for i in range(n) if self.bnb[i]]
        self.bnba = [np.array(x) for x in self.bnb]

    def fit(self, P, N, flat=()):
        """Returns (garment verts, body positions under the garment) for body positions P with normals N."""
        B = P[self.used].copy(); BN = N[self.used]
        for c, r in flat:                                   # harmonic fill over small bumps (nipples) under the garment
            d = np.linalg.norm(B - c, axis=1); free = d < r
            if free.sum() < 3: continue
            k0 = np.argmin(d); n0 = BN[k0]
            for it in range(300): B[free] = (self.Wm @ B)[free]       # flat membrane over the bump...
            B[free] += n0 * (0.0042 * (1 - (d[free] / r) ** 2))[:, None]   # ...then restore the breast's own curvature
        Bs = B.copy()
        for it in range(self.smooth):                       # Taubin smoothing: removes bumps without shrinking
            Bs = Bs + (self.Wm @ Bs - Bs) * 0.6; Bs = Bs + (self.Wm @ Bs - Bs) * -0.63
        Bn = B + (Bs - B) * self.wgt
        SN = vnormals(Bn, self.F)                            # normals of the smoothed surface (not the bumpy skin)
        SN = SN * self.wgt + BN * (1 - self.wgt); SN /= np.linalg.norm(SN, axis=1, keepdims=True)
        V = Bn + SN * self.off
        for it in range(12):
            V2 = V.copy()
            for i in self.bi: V2[i] = V[i] * 0.5 + V[self.bnba[i]].mean(0) * 0.5
            V = V2
        return V, Bn - BN * 0.0008

# ------------------------------------------------------------------ build all types
t0 = time.time()
bpy.ops.wm.read_factory_settings(use_empty=True)
TYPES = type_list()
print('types', [t[0] for t in TYPES])
data = []
for ti, (tname, targets, height, mdef) in enumerate(TYPES):
    P, faces, used, Q = mh.build(targets); s = height / P[:, 2].max(); P = P * s; Q = Q * s
    jp = {k: Q[v].mean(0) for k, v in SK['joints'].items()}
    EV, EF = mh.proxy(mh.DATA + '/eyes/high-poly/high-poly.mhclo', mh.build.Praw); EV = mh.conv(EV) * s
    rec = dict(name=tname, P=P, jp=jp, EV=EV, s=s, mdef=mdef)
    if ti == 0:
        # weights (merged to VRM bones), interpolated through the subdivision
        remap = {v: i for i, v in enumerate(used)}
        acc = {}
        for bn, lst in WTS.items():
            vb = MAP[bn]
            for vi, w in lst:
                if vi in remap: acc.setdefault(vb, {}); acc[vb][remap[vi]] = acc[vb].get(remap[vi], 0) + w
        groups = {vb: (np.array(list(d.keys())), np.array(list(d.values()))) for vb, d in acc.items()}
        Vs, Fs, Ns, W = subdivide(P, faces, 1, groups)
        GN = list(groups.keys())
        W = W / np.maximum(W.sum(1, keepdims=True), 1e-6)
        BASE = dict(faces=faces, Fs=Fs, W=W, GN=GN, EF=EF)
    else:
        Vs, Fs2, Ns, _ = subdivide(P, faces, 1)
    MHJ = {b: (jp[v['head']], jp[v['tail']]) for b, v in SK['bones'].items()}
    if mdef: Vs = Vs + Ns * musc.displace(Vs, Ns, MHJ, mdef, female=FEMALE)[:, None]
    rec.update(V=Vs, J=vjoints(jp), MHJ=MHJ)
    data.append(rec)
    print(f'  {tname}: {len(Vs)} verts  {time.time() - t0:.0f}s', flush=True)

# garments: face set from the basis type
Vb = data[0]['V']; Nb = vnormals(Vb, BASE['Fs'])
armw = sum(BASE['W'][:, BASE['GN'].index(g)] for g in BASE['GN'] if any(k in g for k in ('UpperArm', 'LowerArm', 'Hand', 'Thumb', 'Index', 'Middle', 'Ring', 'Little')))
GARM = []
for g in recipes.GARMENTS[GENDER]:
    name, fn, off = g[0], g[1], g[2]; thick = g[3] if len(g) > 3 else 0.0025; smooth = g[4] if len(g) > 4 else 25
    M = fn(Vb, Nb, data[0]['MHJ']) & (armw < 0.3)
    GARM.append(Garment(name, BASE['Fs'], M, off, thick, smooth))
for rec in data:
    N = vnormals(rec['V'], BASE['Fs']); rec['G'] = []
    flat = [(rec['MHJ']['breast.L'][1], 0.022), (rec['MHJ']['breast.R'][1], 0.022)] if FEMALE else []
    for G in GARM:
        gv, under = G.fit(rec['V'], N, flat if G.name == 'bra' else ()); rec['V'][G.used] = under; rec['G'].append(gv)

# ------------------------------------------------------------------ T-pose (LBS in numpy)
def tpose(rec):
    J = rec['J']; Wn = {}
    for S, sg in (('left', 1), ('right', -1)):
        t = np.array([sg, 0, 0.0])
        Wu = rot_between(J[S + 'UpperArm'][1] - J[S + 'UpperArm'][0], t)
        Wl = rot_between(Wu @ (J[S + 'LowerArm'][1] - J[S + 'LowerArm'][0]), t) @ Wu
        hd = Wl @ (J[S + 'Hand'][1] - J[S + 'Hand'][0])
        Wh = rot_between(hd, t) @ Wl
        # roll the hand so the thumb points forward (-Y)
        th = Wh @ (J[S + 'ThumbProximal'][0] - J[S + 'Hand'][0]); th[0] = 0
        if np.linalg.norm(th) > 1e-6:
            ang = math.atan2(th[2], -th[1]) * (1 if sg > 0 else 1)
            ax = t; c, s_ = math.cos(-ang * 0.85 * sg), math.sin(-ang * 0.85 * sg)
            K = np.array([[0, -ax[2], ax[1]], [ax[2], 0, -ax[0]], [-ax[1], ax[0], 0]])
            Wh = (np.eye(3) + s_ * K + (1 - c) * K @ K) @ Wh
        Wn[S + 'UpperArm'] = Wu; Wn[S + 'LowerArm'] = Wl; Wn[S + 'Hand'] = Wh
        for b in VPARENT:
            if b.startswith(S) and any(k in b for k in ('Thumb', 'Index', 'Middle', 'Ring', 'Little')): Wn[b] = Wh
    # world transforms: x' = W (x - h) + h'
    head_new = {}; Wf = {}
    order = []
    def visit(b):
        if b in order: return
        if VPARENT.get(b): visit(VPARENT[b])
        order.append(b)
    for b in J: visit(b)
    for b in order:
        p = VPARENT.get(b)
        Wf[b] = Wn[b] if b in Wn else (Wf[p] if p else np.eye(3))
        head_new[b] = J[b][0] if p is None else Wf[p] @ (J[b][0] - J[p][0]) + head_new[p]
    def apply(X, Wt):
        out = np.zeros_like(X)
        for k, g in enumerate(BASE['GN']):
            w = Wt[:, k]; m = w > 0
            if not m.any(): continue
            out[m] += w[m, None] * ((X[m] - J[g][0]) @ Wf[g].T + head_new[g])
        return out
    rec['Vt'] = apply(rec['V'], BASE['W'])
    rec['Gt'] = [apply(gv, BASE['W'][G.used]) for gv, G in zip(rec['G'], GARM)]
    rec['Jt'] = {b: (head_new[b], Wf[b] @ (J[b][1] - J[b][0]) + head_new[b]) for b in J}
    Wh_ = np.zeros((len(rec['EV']), len(BASE['GN']))); Wh_[:, BASE['GN'].index('head')] = 1
    rec['EVt'] = apply(rec['EV'], Wh_)
for rec in data: tpose(rec)
print('T-posed', f'{time.time() - t0:.0f}s')

if '--previewA' in sys.argv:
    rec = data[0]
    V = np.concatenate([rec['V']] + rec['G']); F = []; n = 0; M = []
    for X, FF, m in [(rec['V'], BASE['Fs'], 0)] + [(g, G.F, 1) for g, G in zip(rec['G'], GARM)]:
        T = mh.tris(FF) + n; F.append(T); M.append(np.full(len(T), m)); n += len(X)
    np.savez_compressed(f'{OUT}/a0.npz', v=V.astype(np.float32), f=np.concatenate(F).astype(np.int32), m=np.concatenate(M).astype(np.int8)); sys.exit(0)
if '--preview' in sys.argv:
    for k, rec in enumerate(data):
        V = np.concatenate([rec['Vt']] + rec['Gt'] + [rec['EVt']]); F = []; n = 0; M = []
        for X, FF, m in [(rec['Vt'], BASE['Fs'], 0)] + [(g, G.F, 1) for g, G in zip(rec['Gt'], GARM)] + [(rec['EVt'], BASE['EF'], 2)]:
            T = mh.tris(FF) + n; F.append(T); M.append(np.full(len(T), m)); n += len(X)
        np.savez_compressed(f'{OUT}/t{k}.npz', v=V.astype(np.float32), f=np.concatenate(F).astype(np.int32), m=np.concatenate(M).astype(np.int8))
    print('preview written'); sys.exit(0)


# ------------------------------------------------------------------ expressions (MakeHuman expression units, CC0)
UNITS = ['eye-left-closure', 'eye-right-closure', 'eye-left-opened-up', 'eye-right-opened-up', 'eye-left-slit', 'eye-right-slit',
         'eyebrows-left-down', 'eyebrows-right-down', 'eyebrows-left-inner-up', 'eyebrows-right-inner-up',
         'eyebrows-left-extern-up', 'eyebrows-right-extern-up', 'eyebrows-left-up', 'eyebrows-right-up',
         'mouth-open', 'mouth-corner-puller', 'mouth-depression', 'mouth-pursing', 'mouth-protusion', 'mouth-compression',
         'mouth-retraction', 'mouth-elevation', 'mouth-upward-retraction', 'mouth-parling', 'mouth-depression-retraction',
         'nose-left-elevation', 'nose-right-elevation']
rec0 = data[0]; s0 = rec0['s']
Pu0 = rec0['P']; Vs0, _, _, _ = subdivide(Pu0, BASE['faces'], 1)
used_idx = sorted({v for f in mh.base()[1] for i, f in enumerate([mh.base()[1][j] for j in range(len(mh.base()[1])) if mh.base()[2][j] == 'body']) for v in f})
remap_u = {v: i for i, v in enumerate(used_idx)}
UD = {}
for u in UNITS:
    acc = np.zeros_like(Pu0)
    for race in ('african', 'asian', 'caucasian'):
        t = mh.target(f'expression/units/{race}/{u}')
        if t is None: continue
        for vi, dv in zip(t[0], t[1]):
            if vi in remap_u: acc[remap_u[vi]] += np.array([dv[0], -dv[2], dv[1]]) * 0.1 * s0 / 3
    Vx, _, _, _ = subdivide(Pu0 + acc, BASE['faces'], 1)
    UD[u] = Vx - Vs0
side = lambda X, sg: np.clip(0.5 + sg * X[:, 0] / 0.012, 0, 1)[:, None]      # smooth left/right split at the midline
Xb = rec0['Vt']
def U(n): return UD[n]
EXPR = {   # ARKit (Perfect Sync) names
    'eyeBlinkLeft': U('eye-left-closure'), 'eyeBlinkRight': U('eye-right-closure'),
    'eyeWideLeft': U('eye-left-opened-up'), 'eyeWideRight': U('eye-right-opened-up'),
    'eyeSquintLeft': U('eye-left-slit'), 'eyeSquintRight': U('eye-right-slit'),
    'browDownLeft': U('eyebrows-left-down'), 'browDownRight': U('eyebrows-right-down'),
    'browInnerUp': U('eyebrows-left-inner-up') + U('eyebrows-right-inner-up'),
    'browOuterUpLeft': U('eyebrows-left-extern-up'), 'browOuterUpRight': U('eyebrows-right-extern-up'),
    'jawOpen': U('mouth-open'),
    'mouthSmileLeft': U('mouth-corner-puller') * side(Xb, 1), 'mouthSmileRight': U('mouth-corner-puller') * side(Xb, -1),
    'mouthFrownLeft': U('mouth-depression') * side(Xb, 1), 'mouthFrownRight': U('mouth-depression') * side(Xb, -1),
    'mouthPucker': U('mouth-pursing'), 'mouthFunnel': U('mouth-protusion'),
    'mouthPressLeft': U('mouth-compression') * side(Xb, 1), 'mouthPressRight': U('mouth-compression') * side(Xb, -1),
    'mouthStretchLeft': U('mouth-retraction') * side(Xb, 1), 'mouthStretchRight': U('mouth-retraction') * side(Xb, -1),
    'mouthShrugUpper': U('mouth-elevation'), 'mouthShrugLower': U('mouth-depression-retraction'),
    'mouthUpperUpLeft': U('mouth-upward-retraction') * side(Xb, 1), 'mouthUpperUpRight': U('mouth-upward-retraction') * side(Xb, -1),
    'mouthLowerDownLeft': U('mouth-parling') * side(Xb, 1), 'mouthLowerDownRight': U('mouth-parling') * side(Xb, -1),
    'noseSneerLeft': U('nose-left-elevation'), 'noseSneerRight': U('nose-right-elevation'),
    'cheekSquintLeft': U('eye-left-slit') * 0.6, 'cheekSquintRight': U('eye-right-slit') * 0.6,
}
mix = lambda **kw: kw
PRESETS = {
    'blink': mix(eyeBlinkLeft=1, eyeBlinkRight=1), 'blinkLeft': mix(eyeBlinkLeft=1), 'blinkRight': mix(eyeBlinkRight=1),
    'aa': mix(jawOpen=1.0), 'ih': mix(jawOpen=0.25, mouthStretchLeft=0.6, mouthStretchRight=0.6),
    'ou': mix(jawOpen=0.2, mouthPucker=0.9), 'ee': mix(jawOpen=0.35, mouthStretchLeft=0.5, mouthStretchRight=0.5, mouthSmileLeft=0.2, mouthSmileRight=0.2),
    'oh': mix(jawOpen=0.55, mouthFunnel=0.6),
    'happy': mix(mouthSmileLeft=1, mouthSmileRight=1, eyeSquintLeft=0.45, eyeSquintRight=0.45, browInnerUp=0.15),
    'angry': mix(browDownLeft=1, browDownRight=1, mouthFrownLeft=0.4, mouthFrownRight=0.4, noseSneerLeft=0.3, noseSneerRight=0.3),
    'sad': mix(browInnerUp=0.9, mouthFrownLeft=0.7, mouthFrownRight=0.7),
    'relaxed': mix(mouthSmileLeft=0.5, mouthSmileRight=0.5, eyeSquintLeft=0.3, eyeSquintRight=0.3),
    'surprised': mix(browOuterUpLeft=0.8, browOuterUpRight=0.8, browInnerUp=0.8, eyeWideLeft=0.8, eyeWideRight=0.8, jawOpen=0.4),
}
print('expressions', len(EXPR), 'presets', len(PRESETS), f'{time.time() - t0:.0f}s')

# ------------------------------------------------------------------ brows + lashes (basis), transferred to types / expressions
import face as facemod
EVb = rec0['EV']; ecs = [EVb[EVb[:, 0] > 0].mean(0), EVb[EVb[:, 0] < 0].mean(0)]
facemod.build.eye_r = np.linalg.norm(EVb[EVb[:, 0] > 0] - ecs[0], axis=1).max()
SV, SF = facemod.build(Pu0, BASE['faces'], ecs, female=FEMALE)
from scipy.spatial import cKDTree
near = cKDTree(rec0['V']).query(SV)[1]
print('strands', len(SV), len(SF))

# ------------------------------------------------------------------ Blender scene
import addon_utils
addon_utils.enable('io_scene_vrm', default_set=True, persistent=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
addon_utils.enable('io_scene_vrm', default_set=True, persistent=True)
NAME = 'Human Female' if FEMALE else 'Human Male'
slug = lambda n: 'Body_' + ''.join(ch for ch in n.title() if ch.isalnum())
Jt0 = rec0['Jt']
arm_data = bpy.data.armatures.new('Armature'); arm = bpy.data.objects.new('Armature', arm_data)
bpy.context.scene.collection.objects.link(arm); bpy.context.view_layer.objects.active = arm; arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
from mathutils import Vector
for b, (h, t) in Jt0.items():
    eb = arm_data.edit_bones.new(b); eb.head = Vector(h); eb.tail = Vector(t)
    if (eb.tail - eb.head).length < 0.005: eb.tail = eb.head + Vector((0, 0, 0.02))
for b in Jt0:
    if VPARENT.get(b): arm_data.edit_bones[b].parent = arm_data.edit_bones[VPARENT[b]]
bpy.ops.object.mode_set(mode='OBJECT')

def mesh_obj(name, V, F, groups=None, uv=None):
    me = bpy.data.meshes.new(name); me.from_pydata(V.tolist(), [], F); me.update()
    for p in me.polygons: p.use_smooth = True
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    if uv is not None:
        lay = me.uv_layers.new(name='UVMap')
        for li, l in enumerate(me.loops): lay.data[li].uv = uv[li]
    if groups:
        for gname, w in groups.items():
            vg = ob.vertex_groups.new(name=gname); nz = np.nonzero(w > 1e-4)[0]
            for i in nz: vg.add([int(i)], float(w[i]), 'REPLACE')
    mo = ob.modifiers.new('Armature', 'ARMATURE'); mo.object = arm; ob.parent = arm
    ob.shape_key_add(name='Basis', from_mix=False)
    return ob

def add_key(ob, name, X):
    k = ob.shape_key_add(name=name, from_mix=False); k.data.foreach_set('co', X.astype(np.float32).ravel()); k.value = 0.0

Wg = {g: BASE['W'][:, k] for k, g in enumerate(BASE['GN'])}
body = mesh_obj('Body', rec0['Vt'], BASE['Fs'], Wg)
for rec in data[1:]: add_key(body, slug(rec['name']), rec['Vt'])
for k, d in EXPR.items(): add_key(body, k, rec0['Vt'] + d)
garm_obs = []
for gi, (G, gv0) in enumerate(zip(GARM, rec0['Gt'])):
    ob = mesh_obj(G.name.title(), gv0, G.F, {g: BASE['W'][G.used, k] for k, g in enumerate(BASE['GN'])})
    for rec in data[1:]: add_key(ob, slug(rec['name']), rec['Gt'][gi])
    garm_obs.append(ob)
# eyes: UVs from the MakeHuman eye obj (CC0)
EVT = []; EFT = []
for ln in open(mh.DATA + '/eyes/high-poly/high-poly.obj'):
    if ln.startswith('vt '): EVT.append([float(x) for x in ln.split()[1:3]])
    elif ln.startswith('f '): EFT.append([int(p.split('/')[1]) - 1 for p in ln.split()[1:]])
keepf = [fi for fi, f in enumerate(EFT) if not all(EVT[i][0] > 0.8 and EVT[i][1] < 0.2 for i in f)]
EFk = [BASE['EF'][fi] for fi in keepf]; uvs = [EVT[i] for fi in keepf for i in EFT[fi]]
EVt0 = rec0['EVt']
eyes = mesh_obj('Eyes', EVt0, EFk, {'leftEye': (EVt0[:, 0] > 0).astype(float), 'rightEye': (EVt0[:, 0] <= 0).astype(float)}, uv=uvs)
for rec in data[1:]: add_key(eyes, slug(rec['name']), rec['EVt'])
strands = mesh_obj('BrowsLashes', SV, SF.tolist() if hasattr(SF, 'tolist') else SF, {'head': np.ones(len(SV))})
for rec in data[1:]: add_key(strands, slug(rec['name']), SV + (rec['Vt'][near] - rec0['Vt'][near]))
for k, d in EXPR.items(): add_key(strands, k, SV + d[near])
# teeth: two arcs behind the lips, transferred like the strands
mouth_c = rec0['MHJ']['jaw'][0]
lip = Xb[(np.abs(Xb[:, 0]) < 0.01) & (np.abs(Xb[:, 2] - (mouth_c[2] - 0.0)) < 0.06)]
lipfront = Xb[(np.abs(Xb[:, 0]) < 0.006)]
TV = []; TF = []
def arc(zc, h, depth):
    n0 = len(TV); ring = []
    for a in np.linspace(-1.1, 1.1, 15):
        for dz in (h / 2, -h / 2):
            TV.append([0.024 * math.sin(a), 0, zc + dz]); ring.append(len(TV) - 1)
    return n0
MV = rec0['MHJ']['special04'] if 'special04' in rec0['MHJ'] else None
cen = BASE['Fs']
fc = np.array([Xb[f].mean(0) for f in BASE['Fs']])
# mouth reference: lips are the most forward body points near the jaw height
jz = rec0['MHJ']['jaw'][1][2]
cand = Xb[(np.abs(Xb[:, 0]) < 0.004) & (Xb[:, 2] > jz - 0.03) & (Xb[:, 2] < jz + 0.05)]
lipY = cand[:, 1].min(); lipZ = cand[np.argmin(cand[:, 1]), 2]
# mouth cavity: flood-fill faces from a seed deep inside the mouth, blocked by the lips' outer surface
from collections import defaultdict
e2f = defaultdict(list)
for fi, f in enumerate(BASE['Fs']):
    for q in range(len(f)): e2f[tuple(sorted((f[q], f[(q + 1) % len(f)])))].append(fi)
seed = int(np.argmin(np.linalg.norm(fc - np.array([0, lipY + 0.035, lipZ]), axis=1)))
inner = np.zeros(len(fc), bool); dq = deque([seed]); inner[seed] = True
Xo = Xb + EXPR['jawOpen']; fco = np.array([Xo[f].mean(0) for f in BASE['Fs']]); fno = vnormals(Xo, BASE['Fs'])
fno = np.array([fno[f].mean(0) for f in BASE['Fs']]); cav = np.array([0, lipY + 0.03, lipZ - 0.01])
facing = np.einsum('ij,ij->i', fno, cav - fco) > 0          # inside faces look toward the cavity, skin looks away
block = lambda fi: (not facing[fi]) or np.linalg.norm(fc[fi] - cav) > 0.07
while dq:
    fi = dq.popleft(); f = BASE['Fs'][fi]
    for q in range(len(f)):
        for nf in e2f[tuple(sorted((f[q], f[(q + 1) % len(f)])))]:
            if not inner[nf] and not block(nf): inner[nf] = True; dq.append(nf)
body.data.polygons.foreach_set('material_index', inner.astype(np.int32))
print('mouth inner faces', int(inner.sum()), 'lip', lipY, lipZ)
tv = []; tf = []
for (zc, hh, yoff) in ((lipZ + 0.0045, 0.0065, 0.016), (lipZ - 0.0065, 0.0055, 0.018)):
    n0 = len(tv)
    for a in np.linspace(-1.15, 1.15, 17):
        x = 0.019 * math.sin(a); y = lipY + yoff + 0.019 * (1 - math.cos(a))
        tv += [[x, y, zc + hh / 2], [x, y, zc - hh / 2]]
    for i in range(16):
        a0 = n0 + 2 * i; tf.append([a0, a0 + 2, a0 + 3, a0 + 1])
TVv = np.array(tv); tnear = cKDTree(rec0['V']).query(TVv)[1]
teeth = mesh_obj('Teeth', TVv, tf, {'head': np.ones(len(TVv))})
for rec in data[1:]: add_key(teeth, slug(rec['name']), TVv + (rec['Vt'][tnear] - rec0['Vt'][tnear]))
lower = np.arange(len(TVv)) >= len(TVv) // 2
chin = (np.abs(Xb[:, 0]) < 0.012) & (Xb[:, 2] < lipZ - 0.02) & (Xb[:, 2] > lipZ - 0.045) & (Xb[:, 1] < lipY + 0.02)
for k in ('jawOpen',):                                   # lower teeth ride on the jaw; upper teeth stay put
    dj = EXPR[k][chin].mean(0)
    add_key(teeth, k, TVv + np.where(lower[:, None], dj[None, :] * 0.85, 0))
print('scene built', f'{time.time() - t0:.0f}s')

# ------------------------------------------------------------------ materials (MToon)
def srgb(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple([x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [1.0])
def mtoon(name, base, shade, tex=None, outline=0.0, cull=True, toony=0.75):
    m = bpy.data.materials.new(name); m.use_nodes = True
    mt = m.vrm_addon_extension.mtoon1; mt.enabled = True
    mt.pbr_metallic_roughness.base_color_factor = srgb(base)
    mm = mt.extensions.vrmc_materials_mtoon
    mm.shade_color_factor = srgb(shade)[:3]; mm.shading_toony_factor = toony; mm.shading_shift_factor = -0.1
    mt.double_sided = not cull
    if tex:
        img = bpy.data.images.load(tex); mt.pbr_metallic_roughness.base_color_texture.index.source = img
    if outline:
        mm.outline_width_mode = 'worldCoordinates'; mm.outline_width_factor = outline
        mm.outline_color_factor = srgb('#2a1c18')[:3]; mm.outline_lighting_mix_factor = 0.8
    return m
SKIN = ('#e9bfa3', '#c98f78')
body.data.materials.append(mtoon('Skin', SKIN[0], SKIN[1], outline=0.0006))
body.data.materials.append(mtoon('MouthInner', '#5a2a2c', '#2e1415'))
teeth.data.materials.append(mtoon('Teeth', '#f2efe8', '#c9c4ba', cull=False))
for ob in garm_obs: ob.data.materials.append(mtoon('Cloth_' + ob.name, '#2b2b31', '#16161b', cull=False, outline=0.0005))
eyes.data.materials.append(mtoon('Eyes', '#ffffff', '#c8c8cc', tex=mh.DATA + '/eyes/materials/brown_eye.png', toony=0.5))
strands.data.materials.append(mtoon('Brows', '#2b211c', '#17110e', cull=False))

# ------------------------------------------------------------------ VRM 1.0 config
import re
ext = arm_data.vrm_addon_extension; ext.spec_version = '1.0'; v1 = ext.vrm1
hb = v1.humanoid.human_bones
def snake(n): return re.sub(r'(?<!^)(?=[A-Z])', '_', n).lower()
for b in Jt0:
    attr = snake(b)
    if hasattr(hb, attr): getattr(hb, attr).node.bone_name = b
    else: print('no humanoid slot for', b)
v1.meta.vrm_name = NAME
au = v1.meta.authors.add() if len(v1.meta.authors) == 0 else v1.meta.authors[0]; au.value = 'Kael Studio (MakeHuman CC0 base, built with Claude)'
v1.meta.avatar_permission = 'everyone'; v1.meta.commercial_usage = 'personalProfit'
v1.look_at.type = 'bone'
pr = v1.expressions.preset
PMAP = {'blink': pr.blink, 'blinkLeft': pr.blink_left, 'blinkRight': pr.blink_right, 'aa': pr.aa, 'ih': pr.ih, 'ou': pr.ou,
        'ee': pr.ee, 'oh': pr.oh, 'happy': pr.happy, 'angry': pr.angry, 'sad': pr.sad, 'relaxed': pr.relaxed, 'surprised': pr.surprised}
def bind(e, key, w=1.0):
    for ob in (body, strands, teeth):
        if ob.data.shape_keys and key in ob.data.shape_keys.key_blocks:
            mb = e.morph_target_binds.add(); mb.node.mesh_object_name = ob.name; mb.index = key; mb.weight = w
for k, e in PMAP.items():
    for key, w in PRESETS[k].items(): bind(e, key, w)
pr.happy.override_blink = 'blend'
for k in EXPR:
    bpy.ops.vrm.add_vrm1_expressions_custom_expression(armature_object_name=arm.name, custom_expression_name=k)
    ce = [c for c in v1.expressions.custom if c.custom_name == k][0]; bind(ce, k)
for k in [r['name'] for r in data[1:]]:          # body types as custom expressions too (handy for tools); app drives morphs directly
    pass

bpy.ops.wm.save_as_mainfile(filepath=f'{OUT}/{GENDER}.blend')
fn = f'{OUT}/Human_{GENDER.title()}.vrm'
r = bpy.ops.export_scene.vrm(filepath=fn, armature_object_name=arm.name, ignore_warning=True, enable_advanced_preferences=True, export_try_sparse_sk=True)
print('VRM export', r, os.path.getsize(fn) // 1024, 'KB', f'{time.time() - t0:.0f}s')

# per-type skeleton (T-pose bone heads/tails, Blender coords) + morph names for the app
meta = {'name': NAME, 'gender': GENDER, 'types': [], 'default': 'Balanced'}
for rec in data:
    meta['types'].append({'name': rec['name'], 'morph': None if rec is rec0 else slug(rec['name']),
                          'bones': {b: [list(map(float, h)), list(map(float, t))] for b, (h, t) in rec['Jt'].items()}})
json.dump(meta, open(f'{OUT}/Human_{GENDER.title()}.json', 'w'))
print('done')
