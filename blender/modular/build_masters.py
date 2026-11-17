"""Kael modular kit, stage 1: female + male HUMAN master bodies, shared rig, socket registry, QC.

Run with Blender's Python module:   MH_DATA=<makehuman/data> python3 build_masters.py <out_dir>
Builds from the MakeHuman CC0 quad base mesh through ../characters/mh.py and recipes.py (same source as the
existing Human_Female / Human_Male), but keeps the clean quad topology and writes an organised master .blend.
"""
import sys, os, json, math, re
HERE = os.path.dirname(os.path.abspath(__file__)); CH = os.path.join(HERE, '..', 'characters')
sys.path.insert(0, CH)
import numpy as np, bpy, bmesh
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
import mh, recipes, mhrig

OUT = sys.argv[-1]; os.makedirs(OUT, exist_ok=True)
DIMS = json.load(open(os.path.join(HERE, 'master_dimensions.json')))
SK = json.load(open(mh.DATA + '/rigs/default.mhskel')); WTS = json.load(open(mh.DATA + '/rigs/default_weights.mhw'))['weights']

# MakeHuman -> VRM humanoid bone mapping: reuse the exact definitions from build_human.py (kept in one place).
_src = open(os.path.join(CH, 'build_human.py')).read()
_a = _src.index('# ------------------------------------------------------------------ MakeHuman bones -> VRM humanoid bones')
_b = _src.index('# ------------------------------------------------------------------ garments')
_ns = {'SK': SK, 'np': np, 'mh': mh, 'math': math}
exec(_src[_a:_b], _ns)
MAP, VBONES, VPARENT, vjoints, rot_between = _ns['MAP'], _ns['VBONES'], _ns['VPARENT'], _ns['vjoints'], _ns['rot_between']

COLLECTIONS = ['01_MASTER_CHARACTER', '02_HEAD', '03_FACE', '04_EYES', '05_EYEBROWS', '06_MOUTH', '07_HAIR', '08_NECK', '09_TORSO',
               '10_ARMS', '11_HANDS', '12_LEGS', '13_FEET', '14_CLOTHING', '15_ANIMAL_EARS', '16_TAILS', '17_WINGS', '18_HORNS',
               '19_ACCESSORIES', '20_RIG', '21_MATERIALS', '22_EXPORT']
FINGERS = ('Thumb', 'Index', 'Middle', 'Ring', 'Little')

def coll(name, parent=None):
    c = bpy.data.collections.get(name)
    if not c:
        c = bpy.data.collections.new(name); (parent or bpy.context.scene.collection).children.link(c)
    return c
def put(ob, cname):
    for c in list(ob.users_collection): c.objects.unlink(ob)
    coll(cname).objects.link(ob)

HAVE_VRM = False
def material(name, rgb, rough=0.6):
    global HAVE_VRM
    if bpy.data.materials.get(name): return bpy.data.materials[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True; b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = rough
    m.diffuse_color = (*rgb, 1); m.use_fake_user = True
    if HAVE_VRM:                                   # one toon shader (MToon) for every material in the kit
        mt = m.vrm_addon_extension.mtoon1; mt.enabled = True
        mt.pbr_metallic_roughness.base_color_factor = (*rgb, 1)
        x = mt.extensions.vrmc_materials_mtoon
        x.shade_color_factor = tuple(c * f for c, f in zip(rgb, (0.78, 0.66, 0.72))); x.shading_toony_factor = 0.85; x.shading_shift_factor = -0.05
    return m

def tpose(J, V, W, GN, extra=()):
    """Arms to a T (same maths as build_human.tpose). Returns posed verts, posed joints, posed extra point sets."""
    Wn = {}
    for S, sg in (('left', 1), ('right', -1)):
        t = np.array([sg, 0, 0.0])
        Wu = rot_between(J[S + 'UpperArm'][1] - J[S + 'UpperArm'][0], t)
        Wl = rot_between(Wu @ (J[S + 'LowerArm'][1] - J[S + 'LowerArm'][0]), t) @ Wu
        Wh = rot_between(Wl @ (J[S + 'Hand'][1] - J[S + 'Hand'][0]), t) @ Wl
        th = Wh @ (J[S + 'ThumbProximal'][0] - J[S + 'Hand'][0]); th[0] = 0
        if np.linalg.norm(th) > 1e-6:
            ang = math.atan2(th[2], -th[1]); c, s_ = math.cos(-ang * 0.85 * sg), math.sin(-ang * 0.85 * sg)
            K = np.array([[0, -t[2], t[1]], [t[2], 0, -t[0]], [-t[1], t[0], 0]])
            Wh = (np.eye(3) + s_ * K + (1 - c) * K @ K) @ Wh
        Wn[S + 'UpperArm'] = Wu; Wn[S + 'LowerArm'] = Wl; Wn[S + 'Hand'] = Wh
        for b in VPARENT:
            if b.startswith(S) and any(k in b for k in FINGERS): Wn[b] = Wh
    order = []
    def visit(b):
        if b in order: return
        if VPARENT.get(b): visit(VPARENT[b])
        order.append(b)
    for b in J: visit(b)
    Wf, hn = {}, {}
    for b in order:
        p = VPARENT.get(b)
        Wf[b] = Wn[b] if b in Wn else (Wf[p] if p else np.eye(3))
        hn[b] = J[b][0] if p is None else Wf[p] @ (J[b][0] - J[p][0]) + hn[p]
    def apply(X, Wt):
        out = np.zeros_like(X)
        for k, g in enumerate(GN):
            w = Wt[:, k]; m = w > 0
            if m.any(): out[m] += w[m, None] * ((X[m] - J[g][0]) @ Wf[g].T + hn[g])
        return out
    Jt = {b: (hn[b], Wf[b] @ (J[b][1] - J[b][0]) + hn[b]) for b in J}
    return apply(V, W), Jt, [apply(X, Wx) for X, Wx in extra]

def walk_loop(bm, e0):
    """Follow a quad edge loop from edge e0. Returns ordered vertex list if it closes, else None."""
    def step(e, v):
        if len(v.link_edges) != 4: return None
        fs = set(e.link_faces)
        for e2 in v.link_edges:
            if e2 is not e and not (set(e2.link_faces) & fs): return e2
        return None
    verts = [e0.verts[0]]; e = e0; v = e0.verts[1]
    for _ in range(400):
        if v is verts[0]: return verts
        verts.append(v); e = step(e, v)
        if e is None: return None
        v = e.other_vert(v)
    return None

def splits_mesh(bm, loop, min_side=60):
    """True if removing the loop leaves two pieces that each hold at least min_side vertices (a real limb / head cut)."""
    ring = {v.index for v in loop}; start = next(v for v in bm.verts if v.index not in ring); seen = {start.index}; st = [start]
    while st:
        v = st.pop()
        for e in v.link_edges:
            o = e.other_vert(v)
            if o.index not in seen and o.index not in ring: seen.add(o.index); st.append(o)
    rest = len(bm.verts) - len(ring) - len(seen)
    return min(len(seen), rest) >= min_side

def find_ring(bm, point, axis, radius, wanted=None):
    """Closed edge loop nearest to the plane through `point` with normal `axis` that cuts the body in two."""
    point = Vector(point); axis = Vector(axis).normalized(); best = None; tried = {}
    for e in bm.edges:
        a, b = e.verts[0].co, e.verts[1].co
        m = (a + b) / 2
        if abs((m - point).dot(axis)) > 0.03 or (m - point).length > radius: continue
        d = (b - a).normalized()
        if abs(d.dot(axis)) > 0.45: continue
        loop = walk_loop(bm, e)
        if not loop or not (8 <= len(loop) <= 90): continue
        key = frozenset(v.index for v in loop)
        if key in tried: continue
        tried[key] = False
        cen = sum((v.co for v in loop), Vector()) / len(loop)
        dev = sum(abs((v.co - point).dot(axis)) for v in loop) / len(loop)
        off = ((cen - point) - axis * (cen - point).dot(axis)).length
        if any((v.co - cen).length > radius for v in loop): continue
        if not splits_mesh(bm, loop): continue
        score = dev + off * 0.5
        if best is None or score < best[0]: best = (score, loop, cen)
    return best

def clean_garment(ob):
    """Keep the main sheet only: drop stray face islands and corner-only (bow-tie) connections left by the mask."""
    bm = bmesh.new(); bm.from_mesh(ob.data)
    def islands(faces):
        seen = set(); out = []
        for f in faces:
            if f in seen: continue
            st = [f]; comp = []
            while st:
                x = st.pop()
                if x in seen: continue
                seen.add(x); comp.append(x)
                for e in x.edges:
                    for y in e.link_faces:
                        if y not in seen: st.append(y)
            out.append(comp)
        return sorted(out, key=len, reverse=True)
    for _ in range(4):
        isl = islands(bm.faces)
        junk = [f for comp in isl[1:] for f in comp]
        if junk: bmesh.ops.delete(bm, geom=junk, context='FACES')
        bad = [v for v in bm.verts if v.link_faces and not v.is_manifold and not v.is_boundary]
        bow = [v for v in bm.verts if v.link_faces and not v.is_manifold and v.is_boundary and sum(1 for e in v.link_edges if e.is_boundary) > 2]
        if not bow and not junk: break
        for v in bow:
            fans = islands_of_fan(v)
            for fan in fans[1:]:
                bmesh.ops.delete(bm, geom=[f for f in fan if f.is_valid], context='FACES')
    loose = [v for v in bm.verts if not v.link_faces]
    if loose: bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bm.to_mesh(ob.data); bm.free(); ob.data.update()
def islands_of_fan(v):
    """Groups of faces around v that are connected through edges touching v (largest first)."""
    fs = list(v.link_faces); seen = set(); out = []
    for f in fs:
        if f in seen: continue
        st = [f]; comp = []
        while st:
            x = st.pop()
            if x in seen: continue
            seen.add(x); comp.append(x)
            for e in x.edges:
                if v in e.verts:
                    for y in e.link_faces:
                        if y not in seen and y in fs: st.append(y)
        out.append(comp)
    return sorted(out, key=len, reverse=True)

def anime_targets(base):
    """Anime-style master: younger head, large eyes, small nose and mouth, slim neck and limbs, longer legs."""
    if base == 'female':
        g = dict(gender=0, age=0.40, muscle=0.45, weight=0.35)
        t = mh.macro(height=0.5, proportions=1.0, **g) + mh.breast(size=0.5, firm=0.85, **g)
        t += recipes.mirror([('eyes/l-eye-scale-incr', 1.5), ('eyes/l-eye-height2-incr', 0.6), ('nose/nose-scale-horiz-decr', 1.0), ('nose/nose-scale-vert-decr', 0.6),
            ('nose/nose-scale-depth-decr', 0.8), ('nose/nose-volume-decr', 1.0), ('nose/nose-point-width-decr', 0.8), ('mouth/mouth-scale-horiz-decr', 0.8),
            ('chin/chin-width-decr', 0.8), ('chin/chin-triangle', 0.6), ('head/head-round', 0.4), ('head/head-age-decr', 0.8), ('neck/neck-scale-horiz-decr', 0.6),
            ('measure/measure-waist-circ-decr', 0.5), ('measure/measure-upperarm-circ-decr', 0.6), ('measure/measure-thigh-circ-decr', 0.2),
            ('armslegs/upperlegs-height-incr', 0.5), ('armslegs/lowerlegs-height-incr', 0.7), ('armslegs/l-hand-fingers-diameter-decr', 0.4),
            ('armslegs/l-foot-scale-decr', 0.3), ('stomach/stomach-pregnant-decr', 0.4), ('breast/breast-point-decr', 1.0)])
    else:
        t = mh.macro(gender=1, age=0.42, muscle=0.6, weight=0.3, height=0.5, proportions=1.0)
        t += recipes.mirror([('eyes/l-eye-scale-incr', 1.0), ('eyes/l-eye-height2-incr', 0.3), ('nose/nose-scale-horiz-decr', 0.8), ('nose/nose-scale-vert-decr', 0.3),
            ('nose/nose-scale-depth-decr', 0.5), ('nose/nose-volume-decr', 0.8), ('nose/nose-point-width-decr', 0.6), ('mouth/mouth-scale-horiz-decr', 0.6),
            ('chin/chin-width-decr', 0.5), ('head/head-invertedtriangular', 0.4), ('head/head-age-decr', 0.5), ('neck/neck-scale-horiz-decr', 0.2),
            ('torso/torso-vshape-incr', 0.4), ('measure/measure-shoulder-dist-incr', 0.2), ('measure/measure-waist-circ-decr', 0.3),
            ('armslegs/upperlegs-height-incr', 0.5), ('armslegs/lowerlegs-height-incr', 0.6), ('stomach/stomach-pregnant-decr', 0.5)])
    return t

def head_weights(nverts):
    """Share of each base-mesh vertex that belongs to the head (helpers take the value of the nearest weighted vertex)."""
    from scipy.spatial import cKDTree
    hw = np.zeros(nverts); tw = np.zeros(nverts)
    for bn, lst in WTS.items():
        isH = MAP[bn] in ('head', 'leftEye', 'rightEye')
        for vi, w in lst:
            tw[vi] += w
            if isH: hw[vi] += w
    return hw, tw

def build_gender(g):
    cfg = DIMS[g]; PRE = cfg['prefix']; base = cfg['base']
    Ht = float(cfg['height'])
    targets = anime_targets(base) if cfg.get('style') == 'anime' else recipes.get(cfg['recipe'])
    P, faces, used, Q = mh.build(targets)
    hk = float(cfg.get('head_scale', 1.0)); hpiv = None
    if hk != 1.0:                                   # stylised head size: scale about the top of the neck, blended through the neck weights
        from scipy.spatial import cKDTree
        hw, tw = head_weights(len(Q)); known = tw > 1e-6
        hw[known] /= tw[known]
        if (~known).any(): hw[~known] = hw[known][cKDTree(Q[known]).query(Q[~known])[1]]
        hpiv = Q[SK['joints'][SK['bones']['head']['head']]].mean(0)
        Q = Q + hw[:, None] * (hk - 1.0) * (Q - hpiv); P = Q[used]
    s = Ht / P[:, 2].max(); P = P * s; Q = Q * s
    jp = {k: Q[v].mean(0) for k, v in SK['joints'].items()}
    J = vjoints(jp)
    MHJ = {b: (jp[v['head']], jp[v['tail']]) for b, v in SK['bones'].items()}
    remap = {v: i for i, v in enumerate(used)}
    GN = list(VBONES); gi = {n: k for k, n in enumerate(GN)}
    W = np.zeros((len(P), len(GN)))
    for bn, lst in WTS.items():
        k = gi[MAP[bn]]
        for vi, w in lst:
            if vi in remap: W[remap[vi], k] += w
    unweighted = int((W.sum(1) < 1e-6).sum())
    # real-time limit: keep the 4 strongest bones per vertex, then renormalise
    if W.shape[1] > 4:
        top = np.argsort(W, axis=1)[:, -4:]; K = np.zeros_like(W); np.put_along_axis(K, top, np.take_along_axis(W, top, 1), 1); W = K
    W = W / np.maximum(W.sum(1, keepdims=True), 1e-9)
    EV, EF = mh.proxy(mh.DATA + '/eyes/high-poly/high-poly.mhclo', mh.build.Praw); EV = mh.conv(EV)
    if hpiv is not None: EV = EV + (hk - 1.0) * (EV - hpiv)
    EV = EV * s
    We = np.zeros((len(EV), len(GN))); We[:, gi['head']] = 1
    # eyelid margin helpers from the base mesh (lash strips): parts such as lashes are placed from these
    _Vb, _Fb, _FG, _VT, _FT = mh.base()
    lfi = [i for i, grp in enumerate(_FG) if grp and 'eyelashes' in grp]
    lids = sorted({v for i in lfi for v in _Fb[i]}); lrm = {v: k for k, v in enumerate(lids)}
    LP = Q[lids]; Wl = np.zeros((len(LP), len(GN))); Wl[:, gi['head']] = 1
    Vt, Jt, (EVt, LPt) = tpose(J, P, W, GN, extra=[(EV, We), (LP, Wl)])
    dz = Vt[:, 2].min(); Vt[:, 2] -= dz; EVt[:, 2] -= dz; LPt[:, 2] -= dz
    Jt = {b: (h - [0, 0, dz], t - [0, 0, dz]) for b, (h, t) in Jt.items()}
    MHJ = {b: (h - [0, 0, dz], t - [0, 0, dz]) for b, (h, t) in MHJ.items()}

    # ---- body mesh (quads, MakeHuman UVs)
    me = bpy.data.meshes.new(PRE + 'Body'); me.from_pydata(Vt.tolist(), [], faces); me.update()
    Vb, Fb, FG, VT, FT = mh.base()
    keep = [i for i, grp in enumerate(FG) if grp == 'body']
    uv = me.uv_layers.new(name='UVMap')
    li = 0
    for fi in keep:
        for k in range(len(Fb[fi])):
            t = FT[fi][k]; uv.data[li].uv = (VT[t][0], VT[t][1]) if t >= 0 else (0, 0); li += 1
    for p in me.polygons: p.use_smooth = True
    body = bpy.data.objects.new(PRE + 'Body', me); bpy.context.scene.collection.objects.link(body); put(body, '01_MASTER_CHARACTER')
    me.materials.append(material('MAT_Skin', (0.87, 0.66, 0.55)))

    # ---- armature (root + VRM humanoid names, identical for both genders)
    ad = bpy.data.armatures.new(PRE + 'Rig'); rig = bpy.data.objects.new(PRE + 'Rig', ad)
    bpy.context.scene.collection.objects.link(rig); put(rig, '20_RIG')
    bpy.context.view_layer.objects.active = rig; bpy.ops.object.mode_set(mode='EDIT')
    eb = ad.edit_bones.new('root'); eb.head = (0, 0, 0); eb.tail = (0, 0.12, 0); eb.use_deform = False
    for b in VBONES:
        e = ad.edit_bones.new(b); h, t = Jt[b]; e.head = Vector(h); e.tail = Vector(t)
        if (e.tail - e.head).length < 0.004: e.tail = e.head + (Vector(t) - Vector(h)).normalized() * 0.01 if (Vector(t) - Vector(h)).length > 1e-6 else e.head + Vector((0, 0, 0.01))
    for b in VBONES:
        ad.edit_bones[b].parent = ad.edit_bones[VPARENT[b]] if VPARENT[b] else ad.edit_bones['root']
    for e in ad.edit_bones: e.roll = 0.0
    # one roll convention for every rig built by this script: local Z towards the front (-Y);
    # bones that themselves point along Y (eyes, toes, feet) use world up instead, where -Y would be undefined
    bpy.ops.armature.select_all(action='SELECT'); bpy.ops.armature.calculate_roll(type='GLOBAL_NEG_Y')
    bpy.ops.armature.select_all(action='DESELECT')
    for e in ad.edit_bones:
        d = (e.tail - e.head).normalized(); e.select = e.select_head = e.select_tail = abs(d.y) > 0.6
    bpy.ops.armature.calculate_roll(type='GLOBAL_POS_Z')
    bpy.ops.object.mode_set(mode='OBJECT')
    for k, n in enumerate(GN):
        vg = body.vertex_groups.new(name=n)
        idx = np.nonzero(W[:, k] > 1e-5)[0]
        for i in idx: vg.add([int(i)], float(W[i, k]), 'REPLACE')
    body.parent = rig; mod = body.modifiers.new('Armature', 'ARMATURE'); mod.object = rig

    # ---- eyes
    em = bpy.data.meshes.new(PRE + 'Eyes'); em.from_pydata(EVt.tolist(), [], EF); em.update()
    for p in em.polygons: p.use_smooth = True
    eyes = bpy.data.objects.new(PRE + 'Eyes', em); bpy.context.scene.collection.objects.link(eyes); put(eyes, '04_EYES')
    em.materials.append(material('MAT_Eyes', (0.95, 0.95, 0.97), 0.25))
    for sd, bn in (('L', 'leftEye'), ('R', 'rightEye')):
        eyes.vertex_groups.new(name=bn).add([i for i, v in enumerate(EVt) if (v[0] > 0) == (sd == 'L')], 1.0, 'REPLACE')
    eyes.parent = rig; m2 = eyes.modifiers.new('Armature', 'ARMATURE'); m2.object = rig

    lm = bpy.data.meshes.new(PRE + 'Lash_HELPER'); lm.from_pydata(LPt.tolist(), [], [[lrm[v] for v in _Fb[i]] for i in lfi]); lm.update()
    lo = bpy.data.objects.new(PRE + 'Lash_HELPER', lm); bpy.context.scene.collection.objects.link(lo); put(lo, '03_FACE')
    lo.hide_render = True; lo.display_type = 'WIRE'; lo.parent = rig
    for grp in sorted({_FG[i] for i in lfi}):
        lo.vertex_groups.new(name=grp).add(sorted({lrm[v] for i in lfi if _FG[i] == grp for v in _Fb[i]}), 1.0, 'REPLACE')
    # ---- base garments (fitted from the body by the existing garment builder; body restored afterwards)
    keepco = [v.co.copy() for v in me.vertices]
    mhrig.ARMB = ('UpperArm', 'LowerArm', 'Hand') + FINGERS
    Jm = {b: (np.array(h), np.array(t)) for b, (h, t) in MHJ.items()}
    for gdef in recipes.GARMENTS[base]:
        gname, fn, off = gdef[0], gdef[1], gdef[2]
        if gname == 'harness': continue
        thick = gdef[3] if len(gdef) > 3 else 0.0025; smooth = gdef[4] if len(gdef) > 4 else 25
        nice = {'bra': 'BaseTop', 'shorts': 'BaseShorts'}[gname]
        # no under-garment smoothing here: the master body is left untouched, so the garment must follow the skin exactly
        go = mhrig.garment(body, rig, Jm, PRE + nice, fn, max(off, 0.006), thick, 0)
        go.modifiers['arm'].name = 'Armature'; put(go, '14_CLOTHING'); clean_garment(go)
        go.data.materials.append(material('MAT_Clothing_Base', (0.16, 0.17, 0.2), 0.8))
        for v, c in zip(me.vertices, keepco): v.co = c
    me.update()

    # ---- sockets, derived from the body
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table(); bm.edges.ensure_lookup_table(); bm.faces.ensure_lookup_table()
    bvh = BVHTree.FromBMesh(bm)
    Jv = {b: (Vector(h), Vector(t)) for b, (h, t) in Jt.items()}
    def along(b, f): return Jv[b][0].lerp(Jv[b][1], f)
    def dirn(b): return (Jv[b][1] - Jv[b][0]).normalized()
    reg = {}
    RINGS = [
        ('HEAD_NECK_SOCKET', 'head', along('neck', 0.62), (dirn('neck') + Vector((0, 0, 1))).normalized(), 0.11, 'Head rides on the neck ring; seam hidden under the jaw line and by hair / collars.'),
        ('NECK_TORSO_SOCKET', 'neck', Jv['neck'][0], dirn('neck'), 0.12, 'Neck base ring; seam hidden by the collar line.'),
        ('SHOULDER_L_SOCKET', 'leftUpperArm', along('leftUpperArm', 0.16), dirn('leftUpperArm'), 0.11, 'Arm joins on a ring just past the deltoid; seam hidden by sleeves or kept welded.'),
        ('SHOULDER_R_SOCKET', 'rightUpperArm', along('rightUpperArm', 0.16), dirn('rightUpperArm'), 0.11, 'Mirror of SHOULDER_L.'),
        ('WRIST_L_SOCKET', 'leftHand', Jv['leftHand'][0], dirn('leftLowerArm'), 0.07, 'Hand joins at the wrist ring; seam hidden by cuffs, gloves or bracelets.'),
        ('WRIST_R_SOCKET', 'rightHand', Jv['rightHand'][0], dirn('rightLowerArm'), 0.07, 'Mirror of WRIST_L.'),
        ('HIP_L_SOCKET', 'leftUpperLeg', along('leftUpperLeg', 0.2), dirn('leftUpperLeg'), 0.16, 'Leg joins on a ring at the top of the thigh; seam hidden by shorts / skirt hem.'),
        ('HIP_R_SOCKET', 'rightUpperLeg', along('rightUpperLeg', 0.2), dirn('rightUpperLeg'), 0.16, 'Mirror of HIP_L.'),
        ('ANKLE_L_SOCKET', 'leftFoot', Jv['leftFoot'][0] + Vector((0, 0, 0.03)), dirn('leftLowerLeg'), 0.08, 'Foot joins at the ankle ring; seam hidden by socks, shoes or boots.'),
        ('ANKLE_R_SOCKET', 'rightFoot', Jv['rightFoot'][0] + Vector((0, 0, 0.03)), dirn('rightLowerLeg'), 0.08, 'Mirror of ANKLE_L.'),
    ]
    guides = []
    for name, bone, pt, ax, rad, seam in RINGS:
        r = find_ring(bm, pt, ax, rad)
        if r is None:
            reg[name] = {'ok': False, 'error': 'no closed edge loop found near the joint'}; continue
        _, loop, cen = r
        radii = [(v.co - cen).length for v in loop]
        circ = sum((loop[i].co - loop[(i + 1) % len(loop)].co).length for i in range(len(loop)))
        nrm = Vector((0, 0, 0))
        for i in range(len(loop)): nrm += (loop[i].co - cen).cross(loop[(i + 1) % len(loop)].co - cen)
        nrm.normalize()
        if nrm.dot(ax) < 0: nrm = -nrm
        vg = body.vertex_groups.new(name=name); vg.add([v.index for v in loop], 1.0, 'REPLACE')
        reg[name] = {'ok': True, 'type': 'ring', 'parent_bone': bone, 'position': [round(x, 5) for x in cen],
                     'normal': [round(x, 4) for x in nrm], 'vertex_ring_count': len(loop), 'circumference': round(circ, 4),
                     'radius_mean': round(sum(radii) / len(radii), 4), 'radius_min': round(min(radii), 4), 'radius_max': round(max(radii), 4),
                     'vertex_group': name, 'vertex_indices': [v.index for v in loop], 'scale': [1, 1, 1],
                     'deformation': 'ring follows the skin weights of the body at this loop; a part must copy these weights on its matching ring',
                     'seam': seam}
        guides.append((name, [v.co.copy() for v in loop]))
    # surface sockets (ears, tail, wings): a point on the skin with an outward normal
    hd = Jv['head']; eye_z = (Jv['leftEye'][0].z + Jv['rightEye'][0].z) / 2
    def surf(origin, direction):
        loc, nrm, idx, dist = bvh.ray_cast(Vector(origin), Vector(direction).normalized())
        return loc, nrm
    SURF = []
    for sd, sg in (('L', 1), ('R', -1)):
        o = Vector((sg * 0.5, hd[0].y + 0.01, eye_z + 0.085 * Ht / 1.65)); loc, n = surf(o, (-sg, 0, 0))
        SURF.append((f'EAR_{sd}_SOCKET', 'head', loc, n, 'Animal ear base on the upper side of the skull; base hidden inside the hair.'))
    loc, n = surf(Vector((0, 0.6, Jv['hips'][0].z - 0.005)), (0, -1, 0))
    SURF.append(('TAIL_SOCKET', 'hips', loc, n, 'Tail base at the bottom of the spine; base hidden by a hole or flap in the garment.'))
    for sd, sg in (('L', 1), ('R', -1)):
        zc = Jv['upperChest'][0].lerp(Jv['upperChest'][1], 0.45).z
        loc, n = surf(Vector((sg * 0.065 * Ht / 1.65, 0.6, zc)), (0, -1, 0))
        SURF.append((f'WING_{sd}_SOCKET', 'upperChest', loc, n, 'Wing root on the shoulder blade; base hidden by a slit in the garment.'))
    for name, bone, loc, n, seam in SURF:
        if loc is None: reg[name] = {'ok': False, 'error': 'ray missed the body'}; continue
        reg[name] = {'ok': True, 'type': 'surface', 'parent_bone': bone, 'position': [round(x, 5) for x in loc],
                     'normal': [round(x, 4) for x in n], 'vertex_ring_count': None, 'connection_radius': 0.03 if 'EAR' in name else 0.035,
                     'scale': [1, 1, 1], 'deformation': 'rigid to the parent bone; the part carries its own bone chain for physics', 'seam': seam}
    bm.free()
    # empties for every socket, parented to their bone, +Z of the empty = socket normal
    for name, d in reg.items():
        if not d.get('ok'): continue
        e = bpy.data.objects.new(PRE + name, None); e.empty_display_type = 'ARROWS'; e.empty_display_size = 0.05
        bpy.context.scene.collection.objects.link(e); put(e, '01_MASTER_CHARACTER')
        q = Vector((0, 0, 1)).rotation_difference(Vector(d['normal']))
        Mw = Matrix.Translation(Vector(d['position'])) @ q.to_matrix().to_4x4()
        e.parent = rig; e.parent_type = 'BONE'; e.parent_bone = d['parent_bone']
        bpy.context.view_layer.update()
        e.matrix_world = Mw
        d['rotation_euler_xyz_deg'] = [round(math.degrees(a), 2) for a in q.to_euler()]
        for k in ('type', 'parent_bone', 'vertex_ring_count'): e[k] = d[k] if d[k] is not None else 'n/a'
    # visible ring guides (curves), not rendered by default
    gm = material('MAT_SocketGuide', (1.0, 0.35, 0.1), 0.4)
    for name, pts in guides:
        cu = bpy.data.curves.new(PRE + name + '_GUIDE', 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = 0.0035
        sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1); sp.use_cyclic_u = True
        for p, c in zip(sp.points, pts): p.co = (*c, 1)
        o = bpy.data.objects.new(PRE + name + '_GUIDE', cu); bpy.context.scene.collection.objects.link(o); put(o, '01_MASTER_CHARACTER')
        cu.materials.append(gm); o.hide_render = True; o.parent = rig

    # ---- measured master dimensions
    def ring(n, k): return reg.get(n, {}).get(k)
    head_h = float(Vt[:, 2].max() - Jv['head'][0].z)
    chin = float(Vt[(np.abs(Vt[:, 0]) < 0.02) & (Vt[:, 1] < Jv['head'][0].y - 0.02) & (Vt[:, 2] > Jv['neck'][0].z), 2].min())
    dims = {'height': round(float(Vt[:, 2].max()), 4), 'shoulder_width': round(float((Jv['leftUpperArm'][0] - Jv['rightUpperArm'][0]).length), 4),
            'hip_joint_width': round(float((Jv['leftUpperLeg'][0] - Jv['rightUpperLeg'][0]).length), 4),
            'arm_length': round(float(sum((Jv['left' + b][1] - Jv['left' + b][0]).length for b in ('UpperArm', 'LowerArm'))), 4),
            'leg_length': round(float(Jv['leftUpperLeg'][0].z - Jv['leftFoot'][0].z), 4), 'crotch_height': round(float(Jv['hips'][0].z - 0.02), 4),
            'head_height_chin_to_crown': round(float(Vt[:, 2].max() - chin), 4), 'heads_tall': round(float(Vt[:, 2].max() / (Vt[:, 2].max() - chin)), 2),
            'neck_circumference': ring('NECK_TORSO_SOCKET', 'circumference'), 'wrist_circumference': ring('WRIST_L_SOCKET', 'circumference'),
            'thigh_circumference': ring('HIP_L_SOCKET', 'circumference'), 'ankle_circumference': ring('ANKLE_L_SOCKET', 'circumference'),
            'arm_span': round(float(Vt[:, 0].max() - Vt[:, 0].min()), 4)}
    holder = bpy.data.objects.new(PRE + 'MASTER_DIMENSIONS', None); holder.empty_display_type = 'PLAIN_AXES'; holder.empty_display_size = 0.1
    bpy.context.scene.collection.objects.link(holder); put(holder, '01_MASTER_CHARACTER')
    for k, v in dims.items(): holder[k] = v if v is not None else -1.0
    return dict(g=g, PRE=PRE, body=body, rig=rig, eyes=eyes, reg=reg, dims=dims, unweighted=unweighted, target_height=Ht)

# =================================================================== build
bpy.ops.wm.read_factory_settings(use_empty=True)
try:
    bpy.ops.preferences.addon_enable(module='io_scene_vrm'); HAVE_VRM = hasattr(bpy.types.Material, 'vrm_addon_extension')
except Exception: HAVE_VRM = False
print('VRM add-on available for MToon materials:', HAVE_VRM)
for c in COLLECTIONS: coll(c)
res = {g: build_gender(g) for g in DIMS if not g.startswith('_')}
bpy.context.view_layer.update()
json.dump({g: {'prefix': r['PRE'], 'target_height': r['target_height'], 'master_dimensions': r['dims'], 'sockets': r['reg']} for g, r in res.items()}, open(f'{OUT}/attachment_registry.json', 'w'), indent=1)
bpy.ops.wm.save_as_mainfile(filepath=f'{OUT}/KaelModular_Master.blend')
print('BUILT', {g: (len(r['body'].data.vertices), len(r['body'].data.polygons), r['dims']['height']) for g, r in res.items()})
for g, r in res.items():
    print(g, 'sockets', {n: (d.get('vertex_ring_count'), d.get('circumference')) if d.get('ok') else 'FAIL' for n, d in r['reg'].items()})
