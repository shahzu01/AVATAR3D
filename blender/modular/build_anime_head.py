"""Kael modular kit, stage 2a: dedicated ANIME HEAD part, attached at HEAD_NECK_SOCKET.

  python3 build_anime_head.py <kit_dir> [anime_female,anime_male]
Opens KaelModular_Master.blend, and for each anime body: splits the head off at the HEAD_NECK ring, reshapes it
into an anime head (small nose, simple mouth, large eye openings, tapered jaw), adds anime eyes, upper lashes,
brows and a mouth line as separate parts, then re-assembles head + headless body and verifies the weld.
"""
import sys, os, json, math
import numpy as np, bpy, bmesh
import scipy.sparse as sps
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
args = [a for a in sys.argv if not a.startswith('-')]
D = args[-2] if ',' in args[-1] else args[-1]
KEYS = [k for k in args[-1].split(',') if k] if ',' in args[-1] else ['anime_female', 'anime_male']
bpy.ops.wm.open_mainfile(filepath=f'{D}/KaelModular_Master.blend')
bpy.ops.preferences.addon_enable(module='io_scene_vrm')
REG = json.load(open(f'{D}/attachment_registry.json'))
REPORT = {'checks': [], 'failed': []}
def check(body, name, ok, detail):
    REPORT['checks'].append({'body': body, 'check': name, 'pass': bool(ok), 'detail': detail})
    if not ok: REPORT['failed'].append(f'{body}: {name} - {detail}')
    print('PASS' if ok else 'FAIL', '|', body, '|', name, '|', detail)

def ss(a, b, x): t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
def put(ob, cname):
    for c in list(ob.users_collection): c.objects.unlink(ob)
    bpy.data.collections[cname].objects.link(ob)
def mtoon(name, rgb, shade=None, image=None):
    if bpy.data.materials.get(name): return bpy.data.materials[name]
    m = bpy.data.materials.new(name); m.use_nodes = True; m.diffuse_color = (*rgb, 1); m.use_fake_user = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*rgb, 1)
    mt = m.vrm_addon_extension.mtoon1; mt.enabled = True; mt.pbr_metallic_roughness.base_color_factor = (*rgb, 1)
    x = mt.extensions.vrmc_materials_mtoon; x.shade_color_factor = shade or tuple(c * 0.7 for c in rgb); x.shading_toony_factor = 0.85
    if image is not None:
        mt.pbr_metallic_roughness.base_color_texture.index.source = image; x.shade_multiply_texture.index.source = image
    return m

def eye_texture(name, iris, size=512):
    """Painted anime eye: white, dark rim, iris gradient, pupil, two highlights. Flat colours, generated in code."""
    if bpy.data.images.get(name): return bpy.data.images[name]
    y, x = np.mgrid[0:size, 0:size].astype(np.float32); u = (x / size - 0.5) * 2; v = (y / size - 0.5) * 2
    img = np.ones((size, size, 4), np.float32); img[..., :3] = (0.97, 0.97, 0.99)
    r = np.sqrt((u / 0.50) ** 2 + (v / 0.62) ** 2)                       # tall oval iris
    iris = np.array(iris, np.float32); dark = iris * 0.28; light = np.minimum(iris * 1.5 + 0.12, 1.0)
    g = np.clip((v + 0.62) / 1.24, 0, 1)[..., None]                       # darker at the top, lighter at the bottom
    col = dark * g + light * (1 - g)
    col = np.where((r > 0.86)[..., None], dark * 0.6, col)                # limbal ring
    pr = np.sqrt((u / 0.20) ** 2 + ((v - 0.04) / 0.27) ** 2); col = np.where((pr < 1)[..., None], dark * 0.25, col)
    m = (r < 1)[..., None]; img[..., :3] = np.where(m, col, img[..., :3])
    for cu, cv, rad in ((-0.18, 0.30, 0.13), (0.20, -0.30, 0.07)):       # highlights
        h = np.sqrt((u - cu) ** 2 + (v - cv) ** 2) < rad; img[h, :3] = 1.0
    im = bpy.data.images.new(name, size, size, alpha=True); im.pixels.foreach_set(img.ravel()); im.pack(); return im

def relax(X, nb_idx, free, fixed_iters=200):
    """Membrane (harmonic) fill: free vertices move to the mean of their neighbours, everything else stays."""
    n = len(X); rows = [i for i in free for _ in nb_idx[i]]; cols = [j for i in free for j in nb_idx[i]]
    A = sps.csr_matrix((np.ones(len(rows)), (rows, cols)), shape=(n, n)); deg = np.asarray(A.sum(1)).ravel()
    S = X.copy(); fm = np.zeros(n, bool); fm[free] = True; fm &= deg > 0
    for _ in range(fixed_iters): S[fm] = (A @ S)[fm] / deg[fm, None]
    return S

def band(points, ups, normals, h0, h1, lift, name, mat, bone, rig, coll, group_weight=None):
    """A thin ribbon along a polyline lying on the skin (lashes, brows, mouth line)."""
    n = len(points); V = []; F = []
    for i in range(n):
        t = i / (n - 1); h = h0 + (h1 - h0) * t if not callable(h0) else h0(t)
        V.append(points[i] + normals[i] * lift - ups[i] * h * 0.25); V.append(points[i] + normals[i] * lift + ups[i] * h)
    for i in range(n - 1): F.append([2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1])
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(v) for v in V], [], F); me.update()
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    if sum(f.normal.y for f in bm.faces) > 0: bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob); put(ob, coll)
    me.materials.append(mat); ob.vertex_groups.new(name=bone).add(list(range(len(V))), 1.0, 'REPLACE')
    ob.parent = rig; ob.modifiers.new('Armature', 'ARMATURE').object = rig
    return ob

def build(key):
    PRE = REG[key]['prefix']; female = 'female' in key
    body = bpy.data.objects[PRE + 'Body']; rig = bpy.data.objects[PRE + 'Rig']; me = body.data
    ring = REG[key]['sockets']['HEAD_NECK_SOCKET']['vertex_indices']; ringset = set(ring)
    cE = {s: np.array(rig.data.bones[b].head_local) for s, b in (('L', 'leftEye'), ('R', 'rightEye'))}
    u = float(abs(cE['L'][0] - cE['R'][0]) / 0.064)                     # head unit: 1.0 = a 64 mm eye spacing
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
    X = np.array([v.co[:] for v in bm.verts]); N = np.array([v.normal[:] for v in bm.verts])
    # ---- which side of the ring is the head
    top = int(np.argmax(X[:, 2])); seen = {top}; st = [top]
    while st:
        i = st.pop()
        for e in bm.verts[i].link_edges:
            j = e.other_vert(bm.verts[i]).index
            if j not in seen and j not in ringset: seen.add(j); st.append(j)
    H = np.array(sorted(seen)); hset = seen | ringset
    head_faces = [f.index for f in bm.faces if all(v.index in hset for v in f.verts) and any(v.index in seen for v in f.verts)]
    hfs = set(head_faces)
    nb = [[e.other_vert(v).index for e in v.link_edges] for v in bm.verts]
    ringP = X[ring]; dring = np.full(len(X), 9.0)
    dring[H] = np.min(np.linalg.norm(X[H][:, None, :] - ringP[None], axis=2), axis=1)
    mfall = ss(0.004, 0.035 * u, dring); mfall[list(ringset)] = 0
    isH = np.zeros(len(X), bool); isH[H] = True
    X0 = X.copy()
    # ---- landmarks
    ez = (cE['L'][2] + cE['R'][2]) / 2; ey = (cE['L'][1] + cE['R'][1]) / 2
    mid = isH & (np.abs(X[:, 0]) < 0.006 * u)
    cand = mid & (X[:, 2] < ez + 0.005) & (X[:, 2] > ez - 0.06 * u)
    nose = X[np.where(cand)[0][np.argmin(X[cand, 1])]]
    front = isH & (X[:, 1] < ey + 0.01 * u)
    chin_z = float(X[front & (np.abs(X[:, 0]) < 0.015 * u), 2].min())
    # lip seam: the most recessed point of the mid profile between the lips
    zs = np.linspace(chin_z + 0.012 * u, nose[2] - 0.012 * u, 40); prof = []
    for z in zs:
        mm = mid & (np.abs(X[:, 2] - z) < 0.003 * u) & (N[:, 1] < -0.3)
        prof.append(X[mm, 1].min() if mm.any() else np.nan)
    prof = np.array(prof); zm = float(nose[2] - 0.42 * (nose[2] - chin_z))
    k = np.where(np.abs(zs - zm) < 0.012 * u)[0]
    if len(k) and np.isfinite(prof[k]).any(): zm = float(zs[k[np.nanargmax(prof[k])]])
    info = {'unit': round(u, 3), 'nose_tip': [round(float(x), 4) for x in nose], 'mouth_z': round(zm, 4), 'chin_z': round(chin_z, 4), 'head_vertices': int(len(H) + len(ring))}
    outer = N[:, 1] < 0.2

    def fields(Pts, w=1.0):
        """Position-based reshaping (eyes, jaw): also applied to helper points and landmarks."""
        Pts = Pts.copy()
        for s in ('L', 'R'):
            c = cE[s]; d = np.sqrt((Pts[:, 0] - c[0]) ** 2 + (Pts[:, 2] - c[2]) ** 2)
            wgt = (1 - ss(0.013 * u, 0.050 * u, d)) * (Pts[:, 1] < c[1] + 0.03 * u) * w
            wgt = wgt * ((Pts[:, 0] > 0) == (c[0] > 0))
            S = np.array([EYE_X, 1.0, EYE_Z]); Pts += wgt[:, None] * ((c + (Pts - c) * S) - Pts)
        t = np.clip((zm + 0.012 * u - Pts[:, 2]) / (zm + 0.012 * u - chin_z), 0, 1.25)
        fy = ss(ey + 0.07 * u, ey + 0.015 * u, Pts[:, 1])
        Pts[:, 0] *= 1 - JAW * ss(0, 1, t) * fy * w
        Pts[:, 2] += CHIN_UP * u * ss(0.3, 1.1, t) * fy * w            # shorter lower face
        return Pts
    EYE_X, EYE_Z, JAW, CHIN_UP = (1.22, 1.75, 0.20, 0.002) if female else (1.28, 1.95, 0.16, 0.005)

    # ---- 1 soften the whole face (brow ridge, cheek hollows), keep the silhouette
    face = np.where(isH & outer & (X[:, 1] < ey + 0.035 * u) & (X[:, 2] < ez + 0.075 * u))[0]
    S = X.copy()
    for _ in range(6): S = relax(S, nb, face, 1)
    X[face] += (S[face] - X[face]) * 0.6 * mfall[face, None]
    # ---- 2 small nose
    nreg = np.where(isH & outer & (np.linalg.norm((X - (nose + [0, 0.012 * u, 0.008 * u])) / [1, 1.2, 1.25], axis=1) < 0.030 * u))[0]
    S = relax(X, nb, nreg, 250); X[nreg] = S[nreg] + (X[nreg] - S[nreg]) * (0.20 if female else 0.32)
    # ---- 3 simple mouth
    # outer lip surface only: the mouth cavity stays closed behind it
    mreg = np.where(isH & outer & (((X[:, 0] / (0.034 * u)) ** 2 + ((X[:, 2] - zm) / (0.017 * u)) ** 2) < 1) & (X[:, 1] < nose[1] + 0.035 * u))[0]
    S = relax(X, nb, mreg, 250); X[mreg] = S[mreg] + (X[mreg] - S[mreg]) * (0.45 if female else 0.55)
    # ---- 4 eyes + jaw
    Xf = fields(X); X[H] = X[H] + (Xf[H] - X[H]) * mfall[H, None]
    # light second softening so the enlarged eye area blends into the cheeks and brow (lid rims and sockets excluded)
    de = np.minimum(*[np.sqrt((X[:, 0] - fields(cE[s][None])[0][0]) ** 2 + (X[:, 2] - cE[s][2]) ** 2) for s in ('L', 'R')])
    face2 = np.where(isH & outer & (X[:, 1] < ey + 0.035 * u) & (X[:, 2] < ez + 0.085 * u) & (de > 0.022 * u))[0]
    S = X.copy()
    for _ in range(8): S = relax(S, nb, face2, 1)
    X[face2] += (S[face2] - X[face2]) * 0.7 * mfall[face2, None]
    moved = float(np.linalg.norm(X[ring] - X0[ring], axis=1).max())
    check(key, 'socket ring untouched', moved < 1e-7, f'HEAD_NECK ring vertices moved {moved:.2e} m during the reshape (ring count {len(ring)})')
    bm.free()

    # ---- head part + headless body, both cut from the master topology
    def sub_object(name, face_ids, coords, coll):
        polys = [list(me.polygons[i].vertices) for i in face_ids]; used = sorted({v for p in polys for v in p}); rm = {v: k for k, v in enumerate(used)}
        m2 = bpy.data.meshes.new(name); m2.from_pydata([tuple(coords[v]) for v in used], [], [[rm[v] for v in p] for p in polys]); m2.update()
        uv = m2.uv_layers.new(name='UVMap'); src = me.uv_layers[0].data; li = 0
        for i in face_ids:
            for l in me.polygons[i].loop_indices: uv.data[li].uv = src[l].uv; li += 1
        for p in m2.polygons: p.use_smooth = True
        ob = bpy.data.objects.new(name, m2); bpy.context.scene.collection.objects.link(ob); put(ob, coll)
        m2.materials.append(bpy.data.materials['MAT_Skin'])
        names = {g.index: g.name for g in body.vertex_groups}; made = {}
        for v in used:
            for g in me.vertices[v].groups:
                nm = names[g.group]
                if nm.endswith('_SOCKET') and nm != 'HEAD_NECK_SOCKET': 
                    if v not in ringset and not all(x in rm for x in REG[key]['sockets'][nm]['vertex_indices']): continue
                if nm not in made: made[nm] = ob.vertex_groups.new(name=nm)
                made[nm].add([rm[v]], g.weight, 'REPLACE')
        ob.parent = rig; ob.modifiers.new('Armature', 'ARMATURE').object = rig
        ob['source_vertex_ids'] = used
        return ob, used
    for nm in (PRE + 'Head_Anime', PRE + 'Body_NoHead', PRE + 'Assembled_AnimeHead', PRE + 'Eyes_Anime', PRE + 'Lashes_Anime', PRE + 'Brows_Anime', PRE + 'MouthLine_Anime'):
        if bpy.data.objects.get(nm): bpy.data.objects.remove(bpy.data.objects[nm])
    head, hused = sub_object(PRE + 'Head_Anime', head_faces, X, '02_HEAD')
    rest_faces = [p.index for p in me.polygons if p.index not in hfs]
    torso, tused = sub_object(PRE + 'Body_NoHead', rest_faces, X0, '09_TORSO')
    # boundary of each part must be exactly the socket ring
    def border(ob):
        b = bmesh.new(); b.from_mesh(ob.data); n = sum(1 for e in b.edges if e.is_boundary); nv = len({v.index for e in b.edges if e.is_boundary for v in e.verts}); b.free(); return n, nv
    bh, bt = border(head), border(torso)
    check(key, 'part borders = socket ring', bh == (len(ring), len(ring)) and bt == (len(ring), len(ring)), f'head border {bh[1]} vertices, body border {bt[1]} vertices, socket ring {len(ring)}')

    # ---- assembly test: join copies, weld the ring
    bma = bmesh.new(); bma.from_mesh(torso.data); nt = len(bma.verts); bma.from_mesh(head.data); n0 = len(bma.verts)
    bmesh.ops.remove_doubles(bma, verts=bma.verts[:], dist=1e-5)
    bmesh.ops.recalc_face_normals(bma, faces=bma.faces[:])
    open_e = sum(1 for e in bma.edges if e.is_boundary); nm_e = sum(1 for e in bma.edges if len(e.link_faces) > 2)
    quads = sum(len(f.verts) == 4 for f in bma.faces)
    check(key, 'assembly weld', len(bma.verts) == len(me.vertices) and open_e == 0 and nm_e == 0 and quads == len(bma.faces),
          f'{n0} vertices before weld, {len(bma.verts)} after (master body has {len(me.vertices)}); {n0 - len(bma.verts)} merged on a {len(ring)}-vertex ring; {open_e} open edges, {nm_e} non-manifold edges, {quads}/{len(bma.faces)} quads')
    bma.free()
    # the shipped assembled mesh: same vertex order as the master body (weights, UVs and sockets carry over 1:1)
    am = me.copy(); am.name = PRE + 'Assembled_AnimeHead'
    for v, c in zip(am.vertices, X): v.co = c
    am.update()
    asm = bpy.data.objects.new(PRE + 'Assembled_AnimeHead', am); bpy.context.scene.collection.objects.link(asm); put(asm, '22_EXPORT')
    for g in body.vertex_groups: asm.vertex_groups.new(name=g.name)
    for v in me.vertices:
        for g in v.groups: asm.vertex_groups[g.group].add([v.index], g.weight, 'REPLACE')
    asm.parent = rig; asm.modifiers.new('Armature', 'ARMATURE').object = rig

    # ---- skin surface lookup on the finished head
    bmh = bmesh.new(); bmh.from_mesh(head.data); bmesh.ops.triangulate(bmh, faces=bmh.faces[:]); tree = BVHTree.FromBMesh(bmh)
    def cast(x, z):
        loc, nrm, idx, dist = tree.ray_cast(Vector((x, -1.0, z)), Vector((0, 1, 0)))
        return (np.array(loc), np.array(nrm)) if loc is not None else (None, None)

    # ---- anime eyes: a large painted sphere cap behind each opening, rotating on the eye bone
    lash = bpy.data.objects[PRE + 'Lash_HELPER']; LP = fields(np.array([v.co[:] for v in lash.data.vertices]))
    lg = {g.index: g.name for g in lash.vertex_groups}
    eye_me = bpy.data.meshes.new(PRE + 'Eyes_Anime'); eb = bmesh.new(); uvl = eb.loops.layers.uv.new('UVMap'); groups = {}
    iris = (0.33, 0.47, 0.78) if female else (0.28, 0.58, 0.62)
    img = eye_texture('TEX_Eye_Anime_' + ('F' if female else 'M'), iris)
    rims = {}
    for s, bone in (('L', 'leftEye'), ('R', 'rightEye')):
        def grp(suffix): return [v.index for v in lash.data.vertices if any(lg[g.group].endswith(suffix) and lg[g.group].split('-')[1] == s.lower() for g in v.groups)]
        ga, gb = grp('eyelashes-1'), grp('eyelashes-2')
        up_idx, lo_idx = (ga, gb) if LP[ga][:, 2].mean() > LP[gb][:, 2].mean() else (gb, ga)
        c = cE[s].copy()
        def margin(idx, nb_=14):
            P = LP[idx]; edges = np.linspace(P[:, 0].min(), P[:, 0].max() + 1e-9, nb_ + 1); out = []
            for a in range(nb_):
                mm = (P[:, 0] >= edges[a]) & (P[:, 0] <= edges[a + 1])
                if mm.any(): out.append(P[mm][np.argmax(P[mm][:, 1])])          # rearmost = the edge attached to the lid
            return np.array(out)
        mu, ml = margin(up_idx), margin(lo_idx); rims[s] = (mu, ml)
        x0, x1 = min(mu[:, 0].min(), ml[:, 0].min()), max(mu[:, 0].max(), ml[:, 0].max()); z0, z1 = ml[:, 2].min(), mu[:, 2].max()
        oc = np.array([(x0 + x1) / 2, np.median(np.r_[mu[:, 1], ml[:, 1]]), (z0 + z1) / 2]); half = max((x1 - x0) / 2, (z1 - z0) / 2)
        R = float(np.clip(half * 1.3, 0.016 * u, 0.024 * u)); cen = np.array([oc[0], oc[1] + R * 1.02 + 0.0015 * u, oc[2]])
        info[f'eye_{s}'] = {'opening_width': round(float(x1 - x0), 4), 'opening_height': round(float(z1 - z0), 4), 'sphere_radius': round(float(R), 4)}
        r = bmesh.ops.create_uvsphere(eb, u_segments=28, v_segments=18, radius=R, matrix=Matrix.Translation(Vector(cen)) @ Matrix.Rotation(math.pi / 2, 4, 'X'))
        vs = r['verts']; kill = [v for v in vs if v.co.y > cen[1] + R * 0.35]
        bmesh.ops.delete(eb, geom=kill, context='VERTS'); vs = [v for v in vs if v.is_valid]
        iris_half = half * (0.78 if female else 0.74)
        for v in vs:
            for l in v.link_loops: l[uvl].uv = (0.5 + (v.co.x - cen[0]) / (iris_half / 0.5 * 2) * (1 if s == 'L' else -1) * -1, 0.5 + (v.co.z - cen[2]) / (iris_half / 0.62 * 2))
        groups[bone] = vs
        # eye bone moves to the sphere centre so looking around rotates the painted iris correctly
        bpy.context.view_layer.objects.active = rig; bpy.ops.object.mode_set(mode='EDIT')
        e = rig.data.edit_bones[bone]; ln = e.length; e.head = Vector(cen); e.tail = Vector(cen) + Vector((0, -ln, 0)); e.roll = 0
        bpy.ops.object.mode_set(mode='OBJECT')
    eb.verts.index_update(); gi = {b: [v.index for v in vs] for b, vs in groups.items()}
    eb.to_mesh(eye_me); eb.free()
    for p in eye_me.polygons: p.use_smooth = True
    eyes = bpy.data.objects.new(PRE + 'Eyes_Anime', eye_me); bpy.context.scene.collection.objects.link(eyes); put(eyes, '04_EYES')
    eye_me.materials.append(mtoon('MAT_Eyes_Anime_' + ('F' if female else 'M'), (1, 1, 1), (0.82, 0.84, 0.92), img))
    for b, ids in gi.items(): eyes.vertex_groups.new(name=b).add(ids, 1.0, 'REPLACE')
    eyes.parent = rig; eyes.modifiers.new('Armature', 'ARMATURE').object = rig
    old = bpy.data.objects.get(PRE + 'Eyes')
    if old: old.hide_render = True; old.hide_viewport = True

    # ---- lashes (upper lid line), brows, mouth line: ribbons on the skin
    dark = mtoon('MAT_Lashes', (0.10, 0.07, 0.09)); browm = mtoon('MAT_Eyebrows', (0.23, 0.16, 0.14)); mouthm = mtoon('MAT_Mouth', (0.62, 0.30, 0.30))
    parts = []
    for s in ('L', 'R'):
        mu, ml = rims[s]; sg = 1 if s == 'L' else -1
        xs = np.linspace(mu[:, 0].min(), mu[:, 0].max(), 18)                      # smooth the lid line (cubic fit through the margin)
        P = np.c_[xs, np.polyval(np.polyfit(mu[:, 0], mu[:, 1], 3), xs), np.polyval(np.polyfit(mu[:, 0], mu[:, 2], 3), xs)]
        if sg < 0: P = P[::-1]                                                     # inner corner -> outer corner
        P = P[np.argsort(P[:, 0] * sg)]
        nrm = []; ups = []
        for p in P:
            loc, n = cast(p[0], p[2]); n = n if n is not None else np.array([0, -1.0, 0]); nrm.append(n)
            upv = np.array([0, 0, 1.0]) - n * n[2]; ups.append(upv / np.linalg.norm(upv))
        hf = lambda t: (0.0016 + 0.0030 * ss(0.15, 1.0, t)) * u * (1.0 if female else 0.75)
        parts.append(band(P, np.array(ups), np.array(nrm), hf, None, 0.0009 * u, f'_lash{s}', dark, 'head', rig, '03_FACE'))
        # brow
        c = cE[s]; top = mu[:, 2].max(); pts = []; ns = []; us = []
        for t in np.linspace(0, 1, 11):
            x = c[0] + sg * (-0.017 + 0.036 * t) * u; z = top + (0.011 + 0.0045 * math.sin(math.pi * min(t * 1.15, 1)) - 0.0025 * t) * u * (1 if female else 0.8)
            loc, n = cast(x, z)
            if loc is None: continue
            pts.append(loc); ns.append(n); upv = np.array([0, 0, 1.0]) - n * n[2]; us.append(upv / np.linalg.norm(upv))
        bw = (0.0020 if female else 0.0034) * u
        parts.append(band(np.array(pts), np.array(us), np.array(ns), lambda t: bw * (1 - 0.55 * t), None, 0.0008 * u, f'_brow{s}', browm, 'head', rig, '05_EYEBROWS'))
    def join(objs, name, coll):
        for o in bpy.data.objects: o.select_set(False)
        for o in objs: o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]; bpy.ops.object.join(); objs[0].name = name; objs[0].data.name = name; put(objs[0], coll); return objs[0]
    lsh = [p for p in parts if p.name.startswith('_lash')]; brw = [p for p in parts if p.name.startswith('_brow')]
    lashes = join(lsh, PRE + 'Lashes_Anime', '03_FACE'); brows = join(brw, PRE + 'Brows_Anime', '05_EYEBROWS')
    # mouth line: follows the lip seam (deepest point of each column) but floats at the front of the lips so it is never buried
    pts = []; ns = []; us = []; zc = zm + CHIN_UP * u * 0.5
    for t in np.linspace(-1, 1, 15):
        x = t * (0.0125 if female else 0.015) * u; col = []
        for dz in np.linspace(-0.007, 0.007, 15):
            loc, n = cast(x, zc + dz * u)
            if loc is not None: col.append((loc, n))
        if not col: continue
        seam = max(col, key=lambda a: a[0][1])[0]; fronty = min(a[0][1] for a in col)
        pts.append(np.array([x, fronty, seam[2] + 0.0010 * u * t * t])); ns.append(np.array([0, -1.0, 0])); us.append(np.array([0, 0, 1.0]))
    zmed = float(np.median([p[2] for p in pts]))
    for p in pts: p[2] = zmed + (p[2] - zmed) * 0.35 + 0.0012 * u * (p[0] / (0.0125 * u)) ** 2      # calm the line, slight smile
    mouth = band(np.array(pts), np.array(us), np.array(ns), lambda t: 0.0013 * u * (0.45 + 0.75 * math.sin(math.pi * t)), None, 0.0008 * u, PRE + 'MouthLine_Anime', mouthm, 'head', rig, '06_MOUTH')
    bmh.free()
    head['part_type'] = 'HEAD'; head['socket'] = 'HEAD_NECK_SOCKET'; head['ring_vertex_count'] = len(ring); head['style'] = 'anime'
    info['parts'] = {o.name: {'vertices': len(o.data.vertices), 'faces': len(o.data.polygons), 'collection': o.users_collection[0].name} for o in (head, torso, asm, eyes, lashes, brows, mouth)}
    return info, PRE, rig

# ------------------------------------------------------------------ render helpers
def setup(res):
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = 32; sc.cycles.device = 'CPU'
    sc.render.resolution_x = sc.render.resolution_y = res; sc.view_settings.view_transform = 'Standard'
    w = bpy.data.worlds.get('w') or bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.9, 0.9, 0.94, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.45
    cam = bpy.data.objects.get('qc_cam')
    if not cam:
        cam = bpy.data.objects.new('qc_cam', bpy.data.cameras.new('qc_cam')); sc.collection.objects.link(cam)
        sun = bpy.data.objects.new('qc_sun', bpy.data.lights.new('qc_sun', 'SUN')); sun.data.energy = 2.4; sun.rotation_euler = (math.radians(60), 0, math.radians(-35)); sc.collection.objects.link(sun)
    sc.camera = cam; return sc, cam
def shot(path, target, ang=0.0, ortho=2.0, res=800):
    sc, cam = setup(res); t = Vector(target); d = 6
    cam.location = (t.x + d * math.sin(ang), t.y - d * math.cos(ang), t.z); cam.rotation_euler = (t - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = ortho; sc.render.filepath = path; bpy.ops.render.render(write_still=True)

ALLPRE = tuple(REG[k]['prefix'] for k in REG); OUT = {}
built = [build(k) + (k,) for k in KEYS]
bpy.ops.wm.save_as_mainfile(filepath=f'{D}/KaelModular_Master.blend')
for info, PRE, rig, key in built:
    H = REG[key]['target_height']
    vis = {PRE + n for n in ('Assembled_AnimeHead', 'Eyes_Anime', 'Lashes_Anime', 'Brows_Anime', 'MouthLine_Anime', 'BaseTop', 'BaseShorts')}
    for o in bpy.data.objects:
        if o.type in ('MESH', 'CURVE', 'EMPTY'): o.hide_render = o.name not in vis
    hz = float(rig.data.bones['head'].head_local.z) + 0.09 * info['unit']
    shot(f'{D}/anime_head_{key}_face.png', (0, 0, hz), 0.0, ortho=0.36); shot(f'{D}/anime_head_{key}_face34.png', (0, 0, hz), 0.6, ortho=0.36)
    shot(f'{D}/anime_head_{key}_side.png', (0, 0, hz), math.pi / 2, ortho=0.36); shot(f'{D}/anime_head_{key}_full.png', (0, 0, H / 2), 0.0, ortho=2.0)
    clay = bpy.data.materials.get('qc_clay') or bpy.data.materials.new('qc_clay'); clay.use_nodes = True
    clay.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.62, 0.6, 0.6, 1)
    for o in bpy.data.objects:
        if o.name in vis and o.name != PRE + 'Assembled_AnimeHead': o.hide_render = True
    bpy.context.view_layer.material_override = clay
    shot(f'{D}/anime_head_{key}_clay.png', (0, 0, hz), 0.0, ortho=0.36); shot(f'{D}/anime_head_{key}_clay34.png', (0, 0, hz), 0.6, ortho=0.36); shot(f'{D}/anime_head_{key}_clayside.png', (0, 0, hz), math.pi / 2, ortho=0.36)
    bpy.context.view_layer.material_override = None
    OUT[key] = info
if '--export' in sys.argv:
    import struct
    for info, PRE, rig, key in built:
        ext = rig.data.vrm_addon_extension; ext.spec_version = '0.0'; v = ext.vrm0; names = set(b.name for b in rig.data.bones)
        for h in v.humanoid.human_bones: h.node.bone_name = h.bone if h.bone in names else ''
        v.meta.title = f'Kael {key} anime head'; v.first_person.first_person_bone.bone_name = 'head'
        keep = [bpy.data.objects[PRE + n] for n in ('Rig', 'Assembled_AnimeHead', 'Eyes_Anime', 'Lashes_Anime', 'Brows_Anime', 'MouthLine_Anime') ] + [o for o in bpy.data.collections['14_CLOTHING'].objects if o.name.startswith(PRE)]
        other = [o for o in bpy.data.objects if o.type in ('MESH', 'ARMATURE', 'CURVE') and o not in keep]
        for o in other: o.hide_set(True); o.hide_viewport = True
        for o in keep: o.hide_viewport = False; o.hide_set(False); o.hide_render = False
        path = f'{D}/export_test_{key}_animehead.vrm'; j = {}; tries = 0; want = len([o for o in keep if o.type == 'MESH'])
        while len(j.get('meshes', [])) < want and tries < 3:
            tries += 1
            for o in bpy.data.objects: o.select_set(o in keep)
            bpy.context.view_layer.objects.active = rig; bpy.context.view_layer.update()
            try: bpy.ops.export_scene.vrm(filepath=path, armature_object_name=rig.name, export_invisibles=False, export_only_selections=True)
            except Exception as e: print('export error', str(e)[:200])
            if os.path.exists(path):
                f = open(path, 'rb'); f.read(12); n, _ = struct.unpack('<I4s', f.read(8)); j = json.loads(f.read(n)); f.close()
        check(key, 'export with anime head', len(j.get('meshes', [])) >= want, f'VRM written on attempt {tries}: {len(j.get("meshes", []))} of {want} meshes, {len(j.get("images", []))} texture image(s), {os.path.getsize(path) // 1024 if os.path.exists(path) else 0} KB')
        for o in other: o.hide_set(False); o.hide_viewport = False
check('all', 'facial expressions', False, 'NOT BUILT: the anime head has no blink, mouth or ARKit shapes yet; lashes, brows and mouth line are static ribbons')
json.dump({'info': OUT, **REPORT}, open(f'{D}/anime_head_report.json', 'w'), indent=1)
print('INFO', json.dumps(OUT)[:1500])
