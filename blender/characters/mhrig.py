"""Blender: MakeHuman body + default rig (CC0). Builds mesh, armature and weights."""
import bpy, json, numpy as np, math
from mathutils import Vector, Matrix
import mh
RIG = mh.DATA + '/rigs/'

def make(targets, name='human', scale_to=None, subdiv=0, muscle=0.0, garments=(), female=False):
    P, faces, used, Q = mh.build(targets)
    sk = json.load(open(RIG + 'default.mhskel')); wts = json.load(open(RIG + 'default_weights.mhw'))['weights']
    jpos = {k: Q[v].mean(0) for k, v in sk['joints'].items()}
    s = 1.0
    if scale_to: s = scale_to / P[:, 2].max()
    P = P * s; jpos = {k: v * s for k, v in jpos.items()}
    me = bpy.data.meshes.new(name); me.from_pydata(P.tolist(), [], faces); me.update()
    for p in me.polygons: p.use_smooth = True
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    arm = bpy.data.armatures.new(name + '_rig'); ao = bpy.data.objects.new(name + '_rig', arm)
    bpy.context.scene.collection.objects.link(ao)
    bpy.context.view_layer.objects.active = ao; bpy.ops.object.mode_set(mode='EDIT')
    for bn, b in sk['bones'].items():
        eb = arm.edit_bones.new(bn); eb.head = Vector(jpos[b['head']]); eb.tail = Vector(jpos[b['tail']])
        if (eb.tail - eb.head).length < 1e-4: eb.tail = eb.head + Vector((0, 0, 0.01))
    for bn, b in sk['bones'].items():
        if b['parent']: arm.edit_bones[bn].parent = arm.edit_bones[b['parent']]
    bpy.ops.object.mode_set(mode='OBJECT')
    remap = {v: i for i, v in enumerate(used)}
    for bn, lst in wts.items():
        vg = ob.vertex_groups.new(name=bn)
        for vi, w in lst:
            if vi in remap: vg.add([remap[vi]], w, 'REPLACE')
    if subdiv:
        bpy.context.view_layer.objects.active = ao
        for o in bpy.context.selected_objects: o.select_set(False)
        bpy.context.view_layer.objects.active = ob; ob.select_set(True)
        m = ob.modifiers.new('sub', 'SUBSURF'); m.levels = subdiv
        bpy.ops.object.modifier_apply(modifier=m.name)
    if muscle:
        import musc
        me = ob.data
        Pv = np.array([v.co[:] for v in me.vertices]); Nv = np.array([v.normal[:] for v in me.vertices])
        J = {b.name: (np.array(b.head_local), np.array(b.tail_local)) for b in arm.bones}
        D = musc.displace(Pv, Nv, J, muscle, female=female)
        Pn = Pv + Nv * D[:, None]
        for i, v in enumerate(me.vertices): v.co = Pn[i]
        me.update()
    mod = ob.modifiers.new('arm', 'ARMATURE'); mod.object = ao; ob.parent = ao
    garm = []
    if garments:
        J = {b.name: (np.array(b.head_local), np.array(b.tail_local)) for b in arm.bones}
        for g in garments: garm.append(garment(ob, ao, J, *g))
    ob['garments'] = [g.name for g in garm]
    # eyes (MakeHuman high-poly eye proxy, CC0)
    EV, EF = mh.proxy(mh.DATA + '/eyes/high-poly/high-poly.mhclo', mh.build.Praw)
    EV = mh.conv(EV) * s
    em = bpy.data.meshes.new(name + '_eyes'); em.from_pydata(EV.tolist(), [], EF); em.update()
    for p in em.polygons: p.use_smooth = True
    eo = bpy.data.objects.new(name + '_eyes', em); bpy.context.scene.collection.objects.link(eo)
    for sd in ('L', 'R'):
        vg = eo.vertex_groups.new(name=f'eye.{sd}')
        vg.add([i for i, v in enumerate(EV) if (v[0] > 0) == (sd == 'L')], 1.0, 'REPLACE')
    m2 = eo.modifiers.new('arm', 'ARMATURE'); m2.object = ao; eo.parent = ao
    ob['eyes'] = eo.name
    return ob, ao

def rotate_bone(ao, bn, axis, deg):
    """Rotate a pose bone about a world axis through its head."""
    pb = ao.pose.bones[bn]
    bpy.context.view_layer.update()
    M = ao.matrix_world @ pb.matrix
    head = M.translation.copy()
    R = Matrix.Translation(head) @ Matrix.Rotation(math.radians(deg), 4, Vector(axis)) @ Matrix.Translation(-head)
    pb.matrix = ao.matrix_world.inverted() @ R @ M
    bpy.context.view_layer.update()

def baked(ob):
    dg = bpy.context.evaluated_depsgraph_get(); e = ob.evaluated_get(dg); m = e.to_mesh()
    v = np.array([x.co[:] for x in m.vertices]); f = [list(p.vertices) for p in m.polygons]
    e.to_mesh_clear(); return v, f

ARMB = ('upperarm', 'lowerarm', 'wrist', 'finger', 'metacarpal')
def garment(ob, ao, J, gname, maskfn, off, thick=0.0025, smooth=25):
    me = ob.data
    P = np.array([v.co[:] for v in me.vertices]); N = np.array([v.normal[:] for v in me.vertices])
    gi = {g.index: g.name for g in ob.vertex_groups}
    armw = np.zeros(len(P))
    for v in me.vertices:
        for g in v.groups:
            if any(k in gi[g.group] for k in ARMB): armw[v.index] += g.weight
    M = maskfn(P, N, J) & (armw < 0.3)
    faces = [list(p.vertices) for p in me.polygons if all(M[i] for i in p.vertices)]
    used = sorted({i for f in faces for i in f}); rm = {v: k for k, v in enumerate(used)}
    F2 = [[rm[i] for i in f] for f in faces]
    B = P[used]; BN = N[used]; V = B + BN * off
    nb = [set() for _ in used]
    for f in F2:
        for a in range(len(f)):
            nb[f[a]].add(f[a - 1]); nb[f[a]].add(f[(a + 1) % len(f)])
    nbl = [list(x) for x in nb]
    import scipy.sparse as sps
    rows = [i for i, l in enumerate(nbl) for _ in l]; cols = [j for l in nbl for j in l]
    Wm = sps.csr_matrix((np.ones(len(rows)), (rows, cols)), shape=(len(nbl), len(nbl)))
    Wm = sps.diags(1 / np.maximum(np.asarray(Wm.sum(1)).ravel(), 1)) @ Wm
    from collections import Counter, deque
    ec = Counter()
    for f in F2:
        for q in range(len(f)): ec[tuple(sorted((f[q], f[(q + 1) % len(f)])))] += 1
    bnb = [[] for _ in used]
    for (i, j), k in ec.items():
        if k == 1: bnb[i].append(j); bnb[j].append(i)
    ring = np.full(len(used), 99); dq = deque()
    for i in range(len(used)):
        if bnb[i]: ring[i] = 0; dq.append(i)
    while dq:
        i = dq.popleft()
        for j in nbl[i]:
            if ring[j] > ring[i] + 1: ring[j] = ring[i] + 1; dq.append(j)
    Bs = B.copy()
    for it in range(smooth):
        Bs = Bs + (Wm @ Bs - Bs) * 0.6
    wgt = np.clip(ring / 6.0, 0, 1)[:, None]
    Bn = B + (Bs - B) * wgt                       # body under the garment, smoothed (hidden anyway)
    for k, vi in enumerate(used): me.vertices[vi].co = Bn[k] - BN[k] * 0.0008
    me.update()
    V = Bn + BN * off
    bi = [i for i in range(len(used)) if bnb[i]]   # tidy the jagged hem: 1D smoothing along the edge loop
    for it in range(12):
        V2 = V.copy()
        for i in bi: V2[i] = V[i] * 0.5 + V[bnb[i]].mean(0) * 0.5
        V = V2
    gm = bpy.data.meshes.new(gname); gm.from_pydata(V.tolist(), [], F2); gm.update()
    for p in gm.polygons: p.use_smooth = True
    go = bpy.data.objects.new(gname, gm); bpy.context.scene.collection.objects.link(go)
    groups = {}
    for v in used:
        for g in me.vertices[v].groups:
            nm = gi[g.group]
            if nm not in groups: groups[nm] = go.vertex_groups.new(name=nm)
            groups[nm].add([rm[v]], g.weight, 'REPLACE')
    sm = go.modifiers.new('thick', 'SOLIDIFY'); sm.thickness = thick; sm.offset = 1.0
    m2 = go.modifiers.new('arm', 'ARMATURE'); m2.object = ao; go.parent = ao
    return go
