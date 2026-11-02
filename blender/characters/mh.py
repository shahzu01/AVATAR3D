"""MakeHuman (CC0) base mesh + macro targets -> numpy mesh in metres, Z up, facing -Y."""
import numpy as np, os, itertools, functools
DATA = os.environ.get('MH_DATA', '/home/claude/makehumancommunity/makehuman/makehuman/data')

@functools.lru_cache(None)
def base():
    V = []; F = []; grp = None; FG = []; VT = []; FT = []
    for ln in open(f'{DATA}/3dobjs/base.obj'):
        if ln.startswith('v '): V.append([float(x) for x in ln.split()[1:4]])
        elif ln.startswith('vt '): VT.append([float(x) for x in ln.split()[1:3]])
        elif ln.startswith('g '): grp = ln.split()[1]
        elif ln.startswith('f '):
            idx = [p.split('/') for p in ln.split()[1:]]
            F.append([int(p[0]) - 1 for p in idx]); FG.append(grp)
            FT.append([int(p[1]) - 1 if len(p) > 1 and p[1] else -1 for p in idx])
    return np.array(V), F, FG, np.array(VT), FT

@functools.lru_cache(None)
def target(name):
    p = f'{DATA}/targets/{name}.target'
    if not os.path.exists(p): return None
    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter('ignore'); a = np.loadtxt(p, comments='#', ndmin=2)
    if a.size == 0: return np.zeros(0, int), np.zeros((0, 3))
    return a[:, 0].astype(int), a[:, 1:4]

def macro(gender=1.0, age=0.5, muscle=0.5, weight=0.5, height=0.5, proportions=0.5,
          race=(1/3, 1/3, 1/3)):
    g = {'male': gender, 'female': 1 - gender}
    if age < 0.5:
        young = max(0, (age - 0.1875) * 3.2); baby = max(0, 1 - age * 5.333)
        a = {'baby': baby, 'child': max(0, min(1, 5.333 * age) - young), 'young': young, 'old': 0}
    else:
        old = max(0, age * 2 - 1); a = {'baby': 0, 'child': 0, 'young': 1 - old, 'old': old}
    def tri(v, lo, mid, hi):
        mx = max(0, v * 2 - 1); mn = max(0, 1 - v * 2); return {hi: mx, lo: mn, mid: 1 - mx - mn}
    m = tri(muscle, 'minmuscle', 'averagemuscle', 'maxmuscle')
    w = tri(weight, 'minweight', 'averageweight', 'maxweight')
    hmax = max(0, height * 2 - 1); hmin = max(0, 1 - height * 2)
    pid = max(0, proportions * 2 - 1); pun = max(0, 1 - proportions * 2)
    out = []
    for (rn, rv) in zip(('african', 'asian', 'caucasian'), race):
        for gn, gv in g.items():
            for an, av in a.items():
                out.append((f'macrodetails/{rn}-{gn}-{an}', rv * gv * av))
    for gn, an, mn, wn in itertools.product(g, a, m, w):
        base_w = g[gn] * a[an] * m[mn] * w[wn]
        if base_w <= 0: continue
        out.append((f'macrodetails/universal-{gn}-{an}-{mn}-{wn}', base_w))
        if hmax: out.append((f'macrodetails/height/{gn}-{an}-{mn}-{wn}-maxheight', base_w * hmax))
        if hmin: out.append((f'macrodetails/height/{gn}-{an}-{mn}-{wn}-minheight', base_w * hmin))
        if pid: out.append((f'macrodetails/proportions/{gn}-{an}-{mn}-{wn}-idealproportions', base_w * pid))
        if pun: out.append((f'macrodetails/proportions/{gn}-{an}-{mn}-{wn}-uncommonproportions', base_w * pun))
    return [(n, v) for n, v in out if v > 1e-6]

def build(targets, groups=('body',)):
    V, F, FG, VT, FT = base()
    P = V.copy()
    for name, wgt in targets:
        t = target(name)
        if t is None: print('missing', name); continue
        P[t[0]] += t[1] * wgt
    keep = [i for i, g in enumerate(FG) if g in groups]
    faces = [F[i] for i in keep]
    used = sorted({v for f in faces for v in f}); remap = {v: i for i, v in enumerate(used)}
    faces = [[remap[v] for v in f] for f in faces]
    Q = np.stack([P[:, 0], -P[:, 2], P[:, 1]], 1) * 0.1   # dm -> m, Y-up/+Z-front -> Z-up/-Y-front
    build.z0 = Q[used, 2].min(); build.Praw = P
    Q[:, 2] -= build.z0
    return Q[used], faces, used, Q

def conv(P):
    Q = np.stack([P[:, 0], -P[:, 2], P[:, 1]], 1) * 0.1; Q[:, 2] -= build.z0; return Q

def tris(faces):
    out = []
    for f in faces:
        for i in range(1, len(f) - 1): out.append([f[0], f[i], f[i + 1]])
    return np.array(out)

if __name__ == '__main__':
    import sys
    P, faces, _, _ = build(macro(gender=1, age=0.5, muscle=0.8, weight=0.4, height=0.7, proportions=1.0))
    print('height %.3f m' % (P[:, 2].max()), len(P), 'verts', len(faces), 'faces')
    np.savez_compressed(sys.argv[1], v=P.astype(np.float32), f=tris(faces).astype(np.int32))

def proxy(mhclo, Pfull):
    """Fit a MakeHuman proxy (mhclo) to morphed full base verts Pfull (MH coords, dm). Returns verts, faces."""
    d = os.path.dirname(mhclo); refs = []; scales = {}; objf = None; mode = None
    for ln in open(mhclo):
        t = ln.split()
        if not t or t[0].startswith('#'): continue
        if t[0] == 'obj_file': objf = t[1]
        elif t[0] in ('x_scale', 'y_scale', 'z_scale'): scales[t[0][0]] = (int(t[1]), int(t[2]), float(t[3]))
        elif t[0] == 'verts': mode = 'v'; continue
        elif mode == 'v':
            if len(t) == 9: refs.append(([int(x) for x in t[:3]], [float(x) for x in t[3:6]], [float(x) for x in t[6:9]]))
            elif len(t) == 1: refs.append(([int(t[0])] * 3, [1, 0, 0], [0, 0, 0]))
            else: mode = None
    sc = np.ones(3)
    for i, a in enumerate('xyz'):
        if a in scales:
            v1, v2, ref = scales[a]; sc[i] = abs(Pfull[v1][i] - Pfull[v2][i]) / ref
    V = np.array([np.dot(w, Pfull[idx]) + np.array(o) * sc for idx, w, o in refs])
    F = []
    for ln in open(os.path.join(d, objf)):
        if ln.startswith('f '): F.append([int(p.split('/')[0]) - 1 for p in ln.split()[1:]])
    return V, F

def breast(gender=0.0, age=0.5, muscle=0.5, weight=0.5, size=0.5, firm=0.5):
    """MakeHuman breast modifier (female only)."""
    if age < 0.5:
        young = max(0, (age - 0.1875) * 3.2); a = {'young': young, 'child': max(0, min(1, 5.333 * age) - young)}
    else:
        old = max(0, age * 2 - 1); a = {'young': 1 - old, 'old': old}
    def tri(v, lo, mid, hi):
        mx = max(0, v * 2 - 1); mn = max(0, 1 - v * 2); return {hi: mx, lo: mn, mid: 1 - mx - mn}
    m = tri(muscle, 'minmuscle', 'averagemuscle', 'maxmuscle'); w = tri(weight, 'minweight', 'averageweight', 'maxweight')
    c = tri(size, 'mincup', 'averagecup', 'maxcup'); f = tri(firm, 'minfirmness', 'averagefirmness', 'maxfirmness')
    out = []
    for an, mn, wn, cn, fn in itertools.product(a, m, w, c, f):
        v = (1 - gender) * a[an] * m[mn] * w[wn] * c[cn] * f[fn]
        if v > 1e-6 and not (cn == 'averagecup' and fn == 'averagefirmness'):
            out.append((f'breast/female-{an}-{mn}-{wn}-{cn}-{fn}', v))
    return out
