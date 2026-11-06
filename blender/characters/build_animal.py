"""Species head + tail for the realistic body: one GLB per gender x species.
Head mesh carries ARKit-named shape keys (blink, jaw, smile, frown, brows, wide, squint) and vertex colours;
eyes are separate meshes (rotated by the app for gaze); the tail is a separate mesh rooted at the sacrum.
usage: python3 build_animal.py female|male fox[,bear,...] OUTDIR"""
import sys, os, math, pickle, json
sys.path.insert(0, '/home/claude/kael/fox')
import numpy as np, bpy
import mh, recipes, anthro_head as ah
from sdf import Scene, rcone, chain, _n
from body import flat

G, NAMES, OUT = sys.argv[1], sys.argv[2].split(','), sys.argv[3]; os.makedirs(OUT, exist_ok=True)
d = pickle.load(open(f'/tmp/claude-0/basis_{G}.pkl', 'rb'))
Vb, EV = d['V'], d['EV']
eyes = [EV[EV[:, 0] > 0].mean(0), EV[EV[:, 0] < 0].mean(0)]
head = recipes.headfit(d['P']); c, R = head
COL = {   # base, light, dark, inner, nose  (from the Creator catalog)
    'cat': ('#f2f0f4', '#ffffff', '#9a9aa6', '#f5a6b8', '#f08ca0'), 'fox': ('#e9792f', '#fbf4ea', '#2a2228', '#fbe3d0', '#231d22'),
    'wolf': ('#8e94a2', '#e7e9ef', '#4b4f5a', '#e9d6d6', '#1d1e22'), 'raccoon': ('#9a9ca6', '#ecebf0', '#2b2c33', '#4a4b55', '#141418'),
    'bear': ('#8a5a3c', '#d8b48f', '#5a3a26', '#d8b48f', '#2a1d18'), 'panda': ('#f4f4f6', '#ffffff', '#24242a', '#24242a', '#1b1b20'),
    'bunny': ('#f1e6dd', '#ffffff', '#c7b2a3', '#f6b3c2', '#f08ca0'), 'tiger': ('#ef8b2c', '#fbf4ea', '#26201f', '#fbf4ea', '#e58a8a')}
IRIS = {'fox': '#d99a1e', 'wolf': '#c9a227', 'cat': '#7fb04a', 'tiger': '#d9a020', 'bear': '#5a3418', 'panda': '#3a2414', 'raccoon': '#3a2414', 'bunny': '#7a3a2a'}
def lin(h):
    h = h.lstrip('#'); c_ = np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])
    return np.where(c_ <= 0.04045, c_ / 12.92, ((c_ + 0.055) / 1.055) ** 2.4)
def ss(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
def bump(P, c0, r):
    return np.clip(1 - (np.linalg.norm(P - c0, axis=1) / r) ** 2, 0, 1) ** 2

def decimate(v, f, target):
    me = bpy.data.meshes.new('h'); me.from_pydata(v.tolist(), [], f.tolist()); me.update()
    ob = bpy.data.objects.new('h', me); bpy.context.scene.collection.objects.link(ob)
    m = ob.modifiers.new('d', 'DECIMATE'); m.ratio = min(1, target / len(f))
    dg = bpy.context.evaluated_depsgraph_get(); e = ob.evaluated_get(dg); em = e.to_mesh()
    V = np.array([x.co[:] for x in em.vertices]); F = np.array([list(p.vertices) for p in em.polygons])
    e.to_mesh_clear(); bpy.data.objects.remove(ob); bpy.data.meshes.remove(me)
    return V, F

def sphere(n=20):
    ug = np.linspace(0, np.pi, n); vg = np.linspace(0, 2 * np.pi, n + 4, endpoint=False); m = len(vg)
    P = np.array([[np.sin(a) * np.cos(b), -np.cos(a) * 0 + np.sin(a) * np.sin(b), np.cos(a)] for a in ug for b in vg])
    F = []
    for i in range(n - 1):
        for j in range(m): a0 = i * m + j; a1 = i * m + (j + 1) % m; F += [[a0, a1, a1 + m], [a0, a1 + m, a0 + m]]
    return P, np.array(F)[:, ::-1]

def tail_shape(name):
    """(points in a local frame: x side, y back, z up; radii) for each species."""
    if name in ('fox', 'wolf', 'raccoon'):
        s = {'fox': 1.0, 'wolf': 0.85, 'raccoon': 0.75}[name]
        key = np.array([(0, 0, 0), (0, 0.08, -0.07), (0, 0.15, -0.22), (0, 0.17, -0.40), (0, 0.15, -0.57), (0, 0.12, -0.70), (0, 0.10, -0.80)]) * [1, 1, s]
        r = [0.03, 0.06, 0.09, 0.1, 0.085, 0.055, 0.012]
    elif name in ('cat', 'tiger'):
        key = np.array([(0, 0, 0), (0, 0.08, -0.08), (0, 0.13, -0.25), (0.02, 0.12, -0.45), (0.05, 0.16, -0.62), (0.06, 0.24, -0.70)])
        r = [0.022, 0.024, 0.024, 0.022, 0.02, 0.016]
    elif name in ('bear', 'panda'):
        key = np.array([(0, 0, 0), (0, 0.035, -0.02), (0, 0.05, -0.05)]); r = [0.03, 0.04, 0.02]
    else:  # bunny pom
        key = np.array([(0, 0, 0), (0, 0.04, -0.01), (0, 0.06, -0.03)]); r = [0.03, 0.055, 0.03]
    return key, np.array(r)

def catmull(P, n):
    P = [P[0]] + list(P) + [P[-1]]; out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for t in np.linspace(0, 1, n, endpoint=False):
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(P[-2]); return np.array(out)

# sacrum (tail root): most backward body point at the top of the glutes
P0 = d['P']; zs = P0[P0[:, 2] > 0.5][:, 2]
hipz = np.percentile(P0[:, 2], 52)
band = Vb[(np.abs(Vb[:, 2] - hipz) < 0.01) & (np.abs(Vb[:, 0]) < 0.02)]
SACRUM = band[np.argmax(band[:, 1])] + np.array([0, -0.012, 0])
meta = {}

for name in NAMES:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    k = R[0] / 0.08 * 1.08
    hv, hf, ec, k, fwd = ah.build(name, eyes, k=k, vox=0.0016)
    hv, hf = decimate(hv, hf[:, ::-1], 24000)
    tM = ah.V(0, ah.EYE[1], ah.EYE[2]); Mw = (eyes[0] + eyes[1]) / 2
    T = (hv - Mw) / k + tM                     # template coordinates (fox model frame)
    x, y, z = T.T; ax = np.abs(x); p = ah.P[name]; sn = p['sn']
    base, light, dark, inner, nose = [lin(h) for h in COL[name]]
    C = np.tile(base, (len(T), 1))
    def paint(w, col): C[:] = C * (1 - w[:, None]) + col * w[:, None]
    muzzle = ss(1.735, 1.715, z) * ss(-0.04, -0.07, y) * ss(1.655, 1.68, z)
    if name in ('fox', 'wolf', 'cat', 'tiger', 'raccoon', 'bear'): paint(muzzle * (0.6 if name == 'bear' else 1), light)
    paint(ss(1.72, 1.67, z) * ss(0.04, 0.0, y) * ss(0.11, 0.05, ax), light)   # throat, chin and the front of the neck ruff
    if name in ('fox', 'tiger', 'cat', 'wolf'): paint(ss(1.71, 1.69, z) * ss(0.06, 0.09, ax), light)  # cheek ruff
    # snout bridge: base colour runs down the top of the snout to the nose, so the snout reads from the front
    sz = 1.737 - 0.024 * sn * np.clip((-0.06 - y) / (0.14 * sn + 1e-6), 0, 1)       # snout centreline height along its length
    bridge = ss(0.012 * p['sw'], 0.006 * p['sw'], ax) * ss(sz - 0.004, sz + 0.006, z) * ss(-0.05, -0.065, y)
    if name in ('fox', 'wolf', 'tiger', 'raccoon', 'cat'): paint(bridge * 0.95, base)
    # soft shading strips along the snout sides (darker fur), separating snout from cheeks
    sidew = ss(0.014 * p['sw'], 0.022 * p['sw'], ax) * ss(0.034 * p['sw'], 0.026 * p['sw'], ax) * ss(sz + 0.012, sz, z) * ss(sz - 0.02, sz - 0.008, z) * ss(-0.06, -0.075, y)
    paint(sidew * 0.35, C.mean(0) * 0 + np.array(dark) * 0.6 + np.array(base) * 0.4)
    # eye-to-nose tear line (fox / wolf / tiger)
    if name in ('fox', 'wolf', 'tiger', 'cat'):
        for sg in (1, -1):
            e0 = ah.V(sg * 0.036, -0.078, 1.748); n0 = ah.V(sg * 0.012 * p['sw'], -0.06 - 0.1 * sn, 1.722)
            dvec = n0 - e0; tt = np.clip(((T - e0) @ dvec) / (dvec @ dvec), 0, 1); dist = np.linalg.norm(T - (e0 + np.outer(tt, dvec)), axis=1)
            paint(ss(0.0035, 0.0015, dist) * (1 - tt) ** 0.5 * 0.55, dark)
    if name == 'fox': paint(ss(1.90, 1.95, z), dark)                                             # ear tips
    if name == 'panda':
        for sg in (1, -1): paint(np.clip(bump(T, ah.V(sg * 0.05, -0.08, 1.745), 0.042) * 2.5, 0, 1), dark)
        paint(ss(1.83, 1.84, z), dark)                                                           # ears
    if name == 'raccoon':
        mask = ss(0.03, 0.0, np.abs(z - 1.755)) * ss(0.012, 0.02, ax) * ss(0.11, 0.08, ax) * ss(0.02, -0.03, y)
        paint(mask, dark); paint(ss(1.79, 1.78, z) * ss(1.73, 1.745, z) * ss(0.0, -0.06, y) * ss(0.012, 0.0, ax), dark)
    if name == 'tiger':
        st = (np.sin(z * 260 + ax * 90) > 0.65) * ss(1.77, 1.80, z) + (np.sin(z * 220 - ax * 150) > 0.7) * ss(0.07, 0.085, ax) * ss(1.70, 1.73, z)
        paint(np.clip(st, 0, 1), dark)
    tip = ah.V(0, -0.06 - 0.14 * sn, 1.737 - 0.024 * sn)
    paint(np.clip(bump(T, tip + ah.V(0, -0.008, -0.004), 0.019 * p['nose']) * 3, 0, 1), nose)    # nose leather
    # mouth line (dark) and ear cavities (inner)
    jt = ah.V(0, -0.05 - 0.13 * sn, 1.694 - 0.01 * (1 - sn))
    yy = np.clip((y - (-0.09)) / (jt[1] - 0.004 - (-0.09)), 0, 1)
    zline = 1.693 + (jt[2] + 0.0085 - 1.693) * yy
    mouthband = ss(0.0035, 0.0008, np.abs(z - zline)) * ss(-0.08, -0.095, y) * ss(0.045 * p['sw'], 0.03 * p['sw'], ax)
    paint(mouthband, lin('#3a1418'))
    if p['ear'] in ('fox', 'cat', 'raccoon', 'round', 'bunny'):
        earz = 1.85 if p['ear'] != 'bunny' else 1.88
        Nn = np.zeros_like(hv); tri = hf
        fn_ = np.cross(hv[tri[:, 1]] - hv[tri[:, 0]], hv[tri[:, 2]] - hv[tri[:, 0]])
        for q in range(3): np.add.at(Nn, tri[:, q], fn_)
        Nn /= np.maximum(np.linalg.norm(Nn, axis=1, keepdims=True), 1e-12)
        paint(ss(earz, earz + 0.025, z) * ss(0.2, 0.6, -Nn[:, 1]) * ss(0.04, 0.06, ax) * 0.85, inner)
    # ---------------- shape keys (template space, converted to world by * k)
    keys = {}
    def key(nm, D): keys[nm] = D * k
    # jaw: rotate the lower jaw about a hinge behind the cheeks
    lower = ss(0.006, -0.006, z - zline) * ss(-0.035, -0.06, y) * ss(0.075 * p['sw'], 0.05 * p['sw'], ax)
    hinge = ah.V(0, -0.02, 1.705); a = math.radians(-20)
    rel = T - hinge; Rx = np.array([[1, 0, 0], [0, math.cos(a), math.sin(a)], [0, -math.sin(a), math.cos(a)]])
    band = ss(0.004, 0.0, np.abs(z - zline)) * ss(-0.06, -0.075, y) * ss(0.05 * p['sw'], 0.035 * p['sw'], ax)
    inward = np.stack([-x * 0.5, np.full_like(x, 0.008), np.zeros_like(x)], 1)          # lips roll in so the mouth opens onto the inside
    key('jawOpen', (rel @ Rx.T - rel) * lower[:, None] + inward * band[:, None])
    # ---------------- mouth interior: dark cavity, tongue and teeth (template coords); lower parts ride on the jaw
    MV = []; MF = []; MC = []; Mlow = []
    def addpart(sc_, col, low):
        v_, f_ = sc_.mesh(); v_, f_ = decimate(v_, f_[:, ::-1], 1500)
        n0 = len(MV); MV.extend(v_); MF.extend((f_ + n0).tolist()); MC.extend([lin(col)] * len(v_))
        Mlow.extend(low(v_) if callable(low) else [low] * len(v_))
    mback = ah.V(0, -0.075, 1.697); mfront = jt + ah.V(0, 0.012, 0.007)
    cav = Scene(np.minimum(mback, mfront) - 0.04, np.maximum(mback, mfront) + 0.04, 0.0012)
    cav.add(flat(rcone(mback, mfront, 0.016 * p['sw'], 0.005), (mback + mfront) / 2, (0, 0, 1), 0.7), 0.004)
    def lowfn(v_):
        yy_ = np.clip((v_[:, 1] - (-0.09)) / (jt[1] - 0.004 - (-0.09)), 0, 1); zl_ = 1.693 + (jt[2] + 0.0085 - 1.693) * yy_
        return list(ss(0.003, -0.003, v_[:, 2] - zl_))
    addpart(cav, '#3a1216', lowfn)
    tg = Scene(np.minimum(mback, mfront) - 0.04, np.maximum(mback, mfront) + 0.04, 0.0012)
    tg.add(flat(rcone(mback + ah.V(0, -0.005, -0.006), mfront + ah.V(0, 0.008, -0.004), 0.011 * p['sw'], 0.004), (mback + mfront) / 2, (0, 0, 1), 0.45), 0.003)
    addpart(tg, '#c95a68', 1.0)
    if name not in ('bunny',):
        for sg in (1, -1):
            for frac, up in ((0.75, True), (0.72, False)):
                pt = mback + (mfront - mback) * frac + ah.V(sg * 0.007 * p['sw'], 0, 0.004 if up else -0.004)
                th_ = Scene(pt - 0.02, pt + 0.02, 0.0006)
                th_.add(rcone(pt, pt + ah.V(0, -0.001, -0.007 if up else 0.006), 0.0028, 0.0006), 0.001)
                addpart(th_, '#f4f1ea', 0.0 if up else 1.0)
    MV = np.array(MV); Mlow = np.array(Mlow)
    relm = MV - hinge
    mouth_jaw = (relm @ Rx.T - relm) * Mlow[:, None]
    for sg, S in ((1, 'Left'), (-1, 'Right')):
        corner = ah.V(sg * 0.034 * p['sw'], -0.09, 1.693)
        w = bump(T, corner, 0.03)
        key(f'mouthSmile{S}', np.stack([sg * 0.003 * w, 0.004 * w, 0.006 * w], 1))
        key(f'mouthFrown{S}', np.stack([0 * w, 0.002 * w, -0.005 * w], 1))
        browc = ah.V(sg * 0.045, -0.077, 1.777)
        wb = bump(T, browc, 0.03)
        key(f'browDown{S}', np.stack([-sg * 0.002 * wb, -0.002 * wb, -0.006 * wb], 1))
        wo = bump(T, browc + ah.V(sg * 0.015, 0, 0), 0.025)
        key(f'browOuterUp{S}', np.stack([0 * wo, 0 * wo, 0.006 * wo], 1))
    wi = bump(T, ah.V(0.02, -0.08, 1.775), 0.025) + bump(T, ah.V(-0.02, -0.08, 1.775), 0.025)
    key('browInnerUp', np.stack([0 * wi, 0 * wi, 0.006 * wi], 1))
    key('mouthPucker', np.stack([-x * 0.25, 0 * x, 0 * x], 1) * bump(T, ah.V(0, -0.1, 1.693), 0.04)[:, None])
    # ---------------- eyelids: caps around each eye, rotated up (open) / down (closed)
    LV = []; LF = []; LC = []; lid_keys = {n: [] for n in ('eyeBlinkLeft', 'eyeBlinkRight', 'eyeWideLeft', 'eyeWideRight', 'eyeSquintLeft', 'eyeSquintRight')}
    er = 0.019 * 1.12
    sp, sf = sphere(14)
    for sg, S in ((1, 'Left'), (-1, 'Right')):
        ce = ah.V(sg * ah.EYE[0], ah.EYE[1] + 0.004, ah.EYE[2])
        cap = sp[sp[:, 2] > -0.05]; idx = np.where(sp[:, 2] > -0.05)[0]; rm = -np.ones(len(sp), int); rm[idx] = np.arange(len(idx))
        cf = [rm[f] for f in sf if (rm[f] >= 0).all()]
        def rotx(P, deg):
            a = math.radians(deg); M = np.array([[1, 0, 0], [0, math.cos(a), -math.sin(a)], [0, math.sin(a), math.cos(a)]]); return P @ M.T
        # cap points: upper hemisphere; rest pose tilted back so its edge sits above the eye
        open_ = rotx(cap * er, -62) + ce; closed = rotx(cap * er, -4) + ce
        wide = rotx(cap * er, -80) + ce; squint = rotx(cap * er, -38) + ce
        n0 = len(LV); LV += list(open_); LF += [list(np.array(f) + n0) for f in cf]; LC += [base] * len(cap)
        for nm, X in ((f'eyeBlink{S}', closed), (f'eyeWide{S}', wide), (f'eyeSquint{S}', squint)):
            for other in lid_keys: pass
            lid_keys[nm].append((n0, X - open_))
    LV = np.array(LV)
    from scipy.spatial import cKDTree
    LC = C[cKDTree(T).query(LV)[1]]                    # lids take the fur colour around the eye
    # cut the mouth open: drop the thin strip of faces along the mouth line so the lips can part
    slit = ss(0.0032, 0.0018, np.abs(z - zline)) * (y < -0.075) * (ax < 0.042 * p['sw'])
    keepf = ~(slit[hf] > 0.5).all(1)
    hf = hf[keepf]
    allT = np.concatenate([T, LV, MV]); nH = len(T); nL = len(LV)
    F = np.concatenate([hf, np.array(LF) + nH, np.array(MF) + nH + nL]); Cc = np.concatenate([C, LC, np.array(MC)])
    Vw = (allT - tM) * k + Mw
    me = bpy.data.meshes.new('AnimalHead'); me.from_pydata(Vw.tolist(), [], F.tolist()); me.update()
    for poly in me.polygons: poly.use_smooth = True
    ob = bpy.data.objects.new('AnimalHead', me); bpy.context.scene.collection.objects.link(ob)
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    ca.data.foreach_set('color', np.concatenate([Cc, np.ones((len(Cc), 1))], 1).astype(np.float32).ravel())
    ob.shape_key_add(name='Basis')
    allnames = sorted(set(keys) | set(lid_keys))
    for nm in allnames:
        D = np.zeros_like(Vw)
        if nm in keys: D[:nH] = keys[nm]
        for n0, dd in lid_keys.get(nm, []): D[nH + n0: nH + n0 + len(dd)] = dd * k
        if nm == 'jawOpen': D[nH + nL:] = mouth_jaw * k
        kb = ob.shape_key_add(name=nm, from_mix=False); kb.data.foreach_set('co', (Vw + D).astype(np.float32).ravel())
    mat = bpy.data.materials.new('AnimalFur'); me.materials.append(mat)
    # ---------------- eyes (separate, origin at the eye centre so the app can rotate them)
    iris = lin(IRIS[name]); esp, esf = sphere(18)
    for sg, S in ((1, 'L'), (-1, 'R')):
        ce = fwd(ah.V(sg * ah.EYE[0], ah.EYE[1] + 0.004, ah.EYE[2]))
        P_ = esp * 0.019 * k
        fwdness = -esp[:, 1]
        col = np.where(fwdness[:, None] > 0.93, lin('#0b0b0d'), np.where(fwdness[:, None] > 0.72, iris, lin('#f4f2ee')))
        em_ = bpy.data.meshes.new(f'AnimalEye{S}'); em_.from_pydata(P_.tolist(), [], esf.tolist()); em_.update()
        for poly in em_.polygons: poly.use_smooth = True
        eo = bpy.data.objects.new(f'AnimalEye{S}', em_); bpy.context.scene.collection.objects.link(eo); eo.location = ce
        ca = em_.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT'); ca.data.foreach_set('color', np.concatenate([col, np.ones((len(col), 1))], 1).astype(np.float32).ravel())
        em_.materials.append(bpy.data.materials.new('AnimalEye'))
    # ---------------- tail (separate, origin at the sacrum)
    keyp, rr = tail_shape(name)
    pts = catmull(list(keyp), 6); u = np.linspace(0, 1, len(pts)); rad = np.interp(u, np.linspace(0, 1, len(rr)), rr)
    s = Scene(pts.min(0) - 0.13, pts.max(0) + 0.13, 0.004)
    s.add(chain(list(pts), list(rad)), 0.02 if name in ('fox', 'wolf', 'raccoon') else 0.004)
    tv, tf = s.mesh(); tv, tf = decimate(tv, tf[:, ::-1], 5000)
    tu = np.array([np.argmin(np.linalg.norm(pts - q, axis=1)) for q in tv]) / (len(pts) - 1)
    tc = np.tile(base, (len(tv), 1))
    if name == 'fox': tc[tu > 0.8] = light
    if name == 'wolf': tc[tu > 0.85] = dark
    if name == 'raccoon': tc[(np.floor(tu * 9) % 2 == 1) | (tu > 0.92)] = dark
    if name == 'tiger': tc[(np.floor(tu * 10) % 2 == 1) & (tu > 0.15)] = dark; tc[tu > 0.93] = dark
    if name == 'panda': tc[:] = dark
    if name == 'bunny': tc[:] = light
    tm = bpy.data.meshes.new('AnimalTail'); tm.from_pydata(tv.tolist(), [], tf.tolist()); tm.update()
    for poly in tm.polygons: poly.use_smooth = True
    to = bpy.data.objects.new('AnimalTail', tm); bpy.context.scene.collection.objects.link(to); to.location = SACRUM
    ca = tm.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT'); ca.data.foreach_set('color', np.concatenate([tc, np.ones((len(tc), 1))], 1).astype(np.float32).ravel())
    tm.materials.append(mat)
    # ---------------- claws on the fingertips (the app attaches each to its finger bone)
    HB = json.load(open(f'/home/claude/kael/fox/out/{"hf" if G == "female" else "hm"}/Human_{G.title()}.json'))['types'][0]['bones']
    clawcol = lin('#1c1714') if name not in ('panda', 'bear') else lin('#2a221d')
    for S in ('left', 'right'):
        for f in ('Thumb', 'Index', 'Middle', 'Ring', 'Little'):
            bn = S + f + 'Distal'; h0, t0 = np.array(HB[bn][0]), np.array(HB[bn][1])
            prox = np.array(HB[S + f + ('Proximal' if f == 'Thumb' else 'Proximal')][0])
            tip = t0 + (prox - t0) * 0.22                       # fingertip after the Paws shape
            d = _n(t0 - h0); up = np.array([0, 0, 1.0]); side = _n(np.cross(d, up)); up = np.cross(side, d)
            L = 0.022 if f != 'Thumb' else 0.018
            pts = [tip - d * 0.008 + up * 0.006, tip + d * 0.004 + up * 0.004, tip + d * L * 0.6 - up * 0.002, tip + d * L - up * 0.012]
            cs = Scene(np.min(pts, 0) - 0.02, np.max(pts, 0) + 0.02, 0.0007)
            cs.add(chain(pts, [0.0045, 0.0042, 0.0028, 0.0006]), 0.002)
            cv, cf = cs.mesh(); cv, cf = decimate(cv, cf[:, ::-1], 300)
            cm = bpy.data.meshes.new(f'Claw_{bn}'); cm.from_pydata((cv - h0).tolist(), [], cf.tolist()); cm.update()
            for poly in cm.polygons: poly.use_smooth = True
            co = bpy.data.objects.new(f'Claw_{bn}', cm); bpy.context.scene.collection.objects.link(co); co.location = h0
            ca = cm.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT'); ca.data.foreach_set('color', np.tile(np.append(clawcol, 1), len(cv)).astype(np.float32))
            cm.materials.append(mat)
    fn = f'{OUT}/{G}_{name}.glb'
    bpy.ops.export_scene.gltf(filepath=fn, export_format='GLB', export_morph=True, export_morph_normal=False, export_materials='PLACEHOLDER',
                              export_attributes=True, export_vertex_color='ACTIVE', export_animations=False)
    meta[name] = {'fur': COL[name][0], 'sacrum': list(map(float, SACRUM))}
    print(name, len(Vw), 'verts', len(keys) + 6, 'keys', os.path.getsize(fn) // 1024, 'KB', flush=True)
json.dump(meta, open(f'{OUT}/{G}_meta.json', 'w'))
