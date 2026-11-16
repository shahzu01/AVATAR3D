"""Stage 1 quality control for KaelModular_Master.blend: measurements, topology, weights, deformation, export test, renders."""
import sys, os, json, math
import numpy as np, bpy, bmesh
from mathutils import Vector, Matrix
D = sys.argv[-2]; KA, KB = sys.argv[-1].split(',')
bpy.ops.wm.open_mainfile(filepath=f'{D}/KaelModular_Master.blend')
REG = json.load(open(f'{D}/attachment_registry.json'))
R = {'checks': [], 'failed': []}
PAIRS = ((KA, REG[KA]['prefix']), (KB, REG[KB]['prefix'])); ALLPRE = tuple(REG[k]['prefix'] for k in REG); LAB = {REG[k]['prefix']: k for k in REG}
def check(gender, name, ok, detail):
    R['checks'].append({'body': gender, 'check': name, 'pass': bool(ok), 'detail': detail})
    if not ok: R['failed'].append(f'{gender}: {name} - {detail}')

def setup(res=900):
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = 24; sc.cycles.device = 'CPU'
    sc.render.resolution_x = sc.render.resolution_y = res; sc.view_settings.view_transform = 'Standard'
    w = bpy.data.worlds.get('w') or bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.93, 0.93, 0.96, 1)
    cam = bpy.data.objects.get('qc_cam')
    if not cam:
        cam = bpy.data.objects.new('qc_cam', bpy.data.cameras.new('qc_cam')); sc.collection.objects.link(cam)
        sun = bpy.data.objects.new('qc_sun', bpy.data.lights.new('qc_sun', 'SUN')); sun.data.energy = 2.2; sun.rotation_euler = (math.radians(55), 0, math.radians(-30)); sc.collection.objects.link(sun)
    sc.camera = cam; return sc, cam
def shot(path, target, ang=0.0, ortho=2.0, res=900, elev=0.0):
    sc, cam = setup(res); t = Vector(target); d = 6
    cam.location = (t.x + d * math.sin(ang) * math.cos(elev), t.y - d * math.cos(ang) * math.cos(elev), t.z + d * math.sin(elev))
    cam.rotation_euler = (t - cam.location).to_track_quat('-Z', 'Y').to_euler(); cam.data.type = 'ORTHO'; cam.data.ortho_scale = ortho
    sc.render.filepath = path; bpy.ops.render.render(write_still=True)
def show(prefix):
    for o in bpy.data.objects:
        if o.name.startswith(ALLPRE): o.hide_render = not o.name.startswith(prefix) or o.type == 'EMPTY' or o.name.endswith('_HELPER')
def guides(prefix, on):
    for o in bpy.data.objects:
        if o.name.startswith(prefix) and o.name.endswith('_GUIDE'): o.hide_render = not on

rigs = {}
for g, PRE in PAIRS:
    body = bpy.data.objects[PRE + 'Body']; rig = bpy.data.objects[PRE + 'Rig']; me = body.data; rigs[g] = rig
    co = np.array([v.co[:] for v in me.vertices]); H = REG[g]['master_dimensions']['height']
    target = REG[g]['target_height']
    check(g, '1 scale', abs(co[:, 2].max() - target) < 0.002, f'height {co[:,2].max():.4f} m (target {target})')
    check(g, '1 ground', abs(co[:, 2].min()) < 1e-4, f'lowest point Z = {co[:,2].min():.5f}')
    check(g, '1 centred', abs((co[:, 0].max() + co[:, 0].min()) / 2) < 0.003, f'X centre {((co[:,0].max()+co[:,0].min())/2):.5f}')
    head = co[co[:, 2] > H * 0.9]; nose = head[np.argmin(head[:, 1])]
    check(g, '1 orientation', nose[1] < -0.05 and abs(nose[0]) < 0.02, f'nose tip at Y = {nose[1]:.3f} (faces -Y)')
    objs = [o for o in bpy.data.objects if o.name.startswith(PRE) and o.type in ('MESH', 'ARMATURE')]
    bad = [o.name for o in objs if (o.matrix_world - Matrix.Identity(4)).to_3x3().normalized() != Matrix.Identity(3) and max(abs(x - y) for a, b in zip(o.matrix_world, Matrix.Identity(4)) for x, y in zip(a, b)) > 1e-5]
    check(g, '2 origins and transforms', not bad, 'all mesh and rig objects at the origin with identity transforms' if not bad else f'not identity: {bad}')
    bm = bmesh.new(); bm.from_mesh(me)
    q = sum(len(f.verts) == 4 for f in bm.faces); t3 = sum(len(f.verts) == 3 for f in bm.faces); ng = sum(len(f.verts) > 4 for f in bm.faces)
    check(g, '3 topology quads', ng == 0 and t3 == 0, f'{q} quads, {t3} triangles, {ng} n-gons, {len(bm.verts)} vertices')
    val = {}
    for v in bm.verts: val[len(v.link_edges)] = val.get(len(v.link_edges), 0) + 1
    poles = sum(n for k, n in val.items() if k not in (4,))
    check(g, '3 poles', True, f'vertex valence counts {dict(sorted(val.items()))} ({poles} non-4 vertices incl. open borders)')
    nm = [e for e in bm.edges if len(e.link_faces) > 2]; bd = [e for e in bm.edges if len(e.link_faces) == 1]; wire = [e for e in bm.edges if not e.link_faces]
    # group boundary edges into loops
    seen = set(); loops = []
    for e in bd:
        if e in seen: continue
        st = [e]; comp = []
        while st:
            x = st.pop()
            if x in seen: continue
            seen.add(x); comp.append(x)
            for v in x.verts:
                for y in v.link_edges:
                    if len(y.link_faces) == 1 and y not in seen: st.append(y)
        cz = np.mean([v.co.z for x in comp for v in x.verts]); loops.append((len(comp), round(float(cz), 3)))
    check(g, '3 non-manifold', not nm and not wire, f'{len(nm)} edges with >2 faces, {len(wire)} loose edges')
    check(g, '3 closed mesh', len(bd) == 0, f'{len(bd)} open border edges in {len(loops)} loops (edges, mean Z): {sorted(loops, key=lambda x: -x[1])}')
    # duplicates
    from mathutils.kdtree import KDTree
    kd = KDTree(len(bm.verts))
    for v in bm.verts: kd.insert(v.co, v.index)
    kd.balance(); dup = sum(1 for v in bm.verts if len(kd.find_range(v.co, 1e-6)) > 1)
    check(g, '5 duplicate vertices', dup == 0, f'{dup} vertices share a position with another vertex')
    # normals: signed volume and consistency
    vol = sum(f.calc_center_median().dot(f.normal) * f.calc_area() for f in bm.faces) / 3
    bm2 = bm.copy(); before = [f.normal.copy() for f in bm2.faces]; bmesh.ops.recalc_face_normals(bm2, faces=bm2.faces[:]); bm2.faces.ensure_lookup_table()
    flipped = sum(1 for f, n in zip(bm2.faces, before) if f.normal.dot(n) < 0); bm2.free()
    check(g, '4 normals', vol > 0 and flipped == 0, f'signed volume {vol:.4f} m3, {flipped} faces disagree with a consistent outward recalculation')
    bm.free()
    # weights
    tot = np.zeros(len(me.vertices)); mx = 0
    names = {vg.index: vg.name for vg in body.vertex_groups}
    for v in me.vertices:
        ws = [gr.weight for gr in v.groups if not names[gr.group].endswith('_SOCKET')]
        tot[v.index] = sum(ws); mx = max(mx, sum(1 for w in ws if w > 1e-4))
    check(g, '9 skin weights', np.abs(tot - 1).max() < 1e-3, f'weights sum to 1 on every vertex (max error {np.abs(tot-1).max():.2e}); up to {mx} bones per vertex')
    check(g, '9 real-time bone limit', mx <= 4, f'max {mx} influences per vertex (VRM / game engines allow 4)')
    # sockets
    bad = [n for n, d in REG[g]['sockets'].items() if not d.get('ok')]
    check(g, '6 sockets found', not bad and len(REG[g]['sockets']) == 15, f"{len(REG[g]['sockets'])} sockets, failed: {bad or 'none'}")
    bmr = bmesh.new(); bmr.from_mesh(me); bmr.verts.ensure_lookup_table(); sides = {}
    for n, d in REG[g]['sockets'].items():
        if not d.get('vertex_indices'): continue
        ring = set(d['vertex_indices']); start = next(v for v in bmr.verts if v.index not in ring); seen = {start.index}; st = [start]
        while st:
            v = st.pop()
            for e in v.link_edges:
                o = e.other_vert(v)
                if o.index not in seen and o.index not in ring: seen.add(o.index); st.append(o)
        sides[n] = min(len(seen), len(bmr.verts) - len(ring) - len(seen))
    bmr.free()
    check(g, '6 socket rings cut the body', all(v >= 60 for v in sides.values()), f'vertices on the smaller side of each ring: {sides}')
    sym = []
    for a in ('SHOULDER', 'WRIST', 'HIP', 'ANKLE', 'EAR', 'WING'):
        L = REG[g]['sockets'][f'{a}_L_SOCKET']; Rr = REG[g]['sockets'][f'{a}_R_SOCKET']
        if L.get('ok') and Rr.get('ok'):
            sym.append((a, round(abs(L['position'][0] + Rr['position'][0]), 4), L.get('vertex_ring_count') == Rr.get('vertex_ring_count')))
    check(g, '6 sockets symmetric', all(s[1] < 0.003 and s[2] for s in sym), f'left/right X mismatch (m) and equal ring counts: {sym}')

for o in [o for o in bpy.data.collections['14_CLOTHING'].objects if o.name.split('_')[0] + '_' in (PAIRS[0][1], PAIRS[1][1])]:
    bm = bmesh.new(); bm.from_mesh(o.data)
    bow = sum(1 for v in bm.verts if v.link_faces and not v.is_manifold and sum(1 for e in v.link_edges if e.is_boundary) > 2)
    loose = sum(1 for v in bm.verts if not v.link_faces)
    seen = set(); n_isl = 0
    for f in bm.faces:
        if f in seen: continue
        n_isl += 1; st = [f]
        while st:
            x = st.pop()
            if x in seen: continue
            seen.add(x)
            for e in x.edges:
                for y in e.link_faces:
                    if y not in seen: st.append(y)
    check(LAB[o.name.split('_')[0] + '_'], f'3 garment {o.name}', bow == 0 and loose == 0 and n_isl == 1, f'{len(bm.faces)} faces, {n_isl} island(s), {bow} corner-only joins, {loose} loose vertices')
    bm.free()
from mathutils.bvhtree import BVHTree
for o in [o for o in bpy.data.collections['14_CLOTHING'].objects if o.name.split('_')[0] + '_' in (PAIRS[0][1], PAIRS[1][1])]:
    PRE = o.name.split('_')[0] + '_'; bb = bpy.data.objects[PRE + 'Body']; bmb = bmesh.new(); bmb.from_mesh(bb.data); tree = BVHTree.FromBMesh(bmb)
    inside = 0
    for v in o.data.vertices:
        loc, nrm, idx, dist = tree.find_nearest(v.co)
        if (v.co - loc).dot(nrm) < 0.001: inside += 1
    bmb.free()
    check(LAB[PRE], f'6 garment clearance {o.name}', inside == 0, f'{inside} of {len(o.data.vertices)} garment vertices sit less than 1 mm outside the skin')
# 9 armature compatibility between the two bodies
bf = {b.name: (b.parent.name if b.parent else None) for b in rigs[KA].data.bones}; bmn = {b.name: (b.parent.name if b.parent else None) for b in rigs[KB].data.bones}
check('both', '9 armature compatibility', bf == bmn, f'{len(bf)} bones each, identical names and parents: {bf == bmn}')
def roll_diff(n):
    A = rigs[KA].data.bones[n].matrix_local.to_3x3(); B = rigs[KB].data.bones[n].matrix_local.to_3x3()
    ya, yb = A.col[1].normalized(), B.col[1].normalized()
    B2 = ya.rotation_difference(yb).inverted().to_matrix() @ B          # take out the anatomical direction difference
    return math.degrees(A.col[0].normalized().angle(B2.col[0].normalized()))
def dir_diff(n):
    return math.degrees(rigs[KA].data.bones[n].matrix_local.to_3x3().col[1].angle(rigs[KB].data.bones[n].matrix_local.to_3x3().col[1]))
wr = max(bf, key=roll_diff); wd = max(bf, key=dir_diff)
check('both', '9 bone orientation', roll_diff(wr) < 5, f'same roll convention on both rigs: largest roll difference {roll_diff(wr):.1f} deg ({wr}); largest bone direction difference from the bodies\' own proportions {dir_diff(wd):.1f} deg ({wd})')
ringeq = all(REG[KA]['sockets'][n].get('vertex_ring_count') == REG[KB]['sockets'][n].get('vertex_ring_count') for n in REG[KA]['sockets'])
allring = {k: [REG[k]['sockets'][n].get('vertex_ring_count') for n in sorted(REG[k]['sockets'])] for k in REG}
check('all', '6 ring counts match across every body in the kit', len({tuple(v) for v in allring.values()}) == 1, f'bodies compared: {list(allring)}')
allb = {o.name: sorted(b.name for b in o.data.bones) for o in bpy.data.objects if o.type == 'ARMATURE'}
check('all', '9 same bone names on every rig in the kit', len({tuple(v) for v in allb.values()}) == 1, f'rigs compared: {list(allb)}')
check('both', '6 ring counts match across bodies', ringeq, {n: d.get('vertex_ring_count') for n, d in REG[KA]['sockets'].items() if d.get('vertex_ring_count')})

# renders: neutral + sockets + wire + deformation
def rot(rig, b, axis, deg):
    pb = rig.pose.bones[b]; bpy.context.view_layer.update(); h = pb.matrix.to_translation()
    pb.matrix = Matrix.Translation(h) @ Matrix.Rotation(math.radians(deg), 4, axis) @ Matrix.Translation(-h) @ pb.matrix; bpy.context.view_layer.update()
for g, PRE in PAIRS:
    H = REG[g]['master_dimensions']['height']; rig = rigs[g]; show(PRE); guides(PRE, False)
    shot(f'{D}/render_{g}_front.png', (0, 0, H / 2), 0, ortho=2.0); shot(f'{D}/render_{g}_34.png', (0, 0, H / 2), 0.75, ortho=2.0); shot(f'{D}/render_{g}_back.png', (0, 0, H / 2), math.pi, ortho=2.0)
    clay = bpy.data.materials.get('qc_clay') or bpy.data.materials.new('qc_clay'); clay.use_nodes = True
    clay.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.75, 0.72, 0.7, 1); clay.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.7
    bpy.context.view_layer.material_override = clay
    shot(f'{D}/render_{g}_clay_front.png', (0, 0, H / 2), 0, ortho=2.0); shot(f'{D}/render_{g}_clay_34.png', (0, 0, H / 2), 0.75, ortho=2.0)
    shot(f'{D}/render_{g}_clay_face.png', (0, 0, H * 0.93), 0.0, ortho=0.38); shot(f'{D}/render_{g}_clay_face34.png', (0, 0, H * 0.93), 0.6, ortho=0.38)
    bpy.context.view_layer.material_override = None
    guides(PRE, True)
    shot(f'{D}/render_{g}_sockets_front.png', (0, 0, H / 2), 0.35, ortho=2.0, elev=0.12); shot(f'{D}/render_{g}_sockets_back.png', (0, 0, H / 2), math.pi - 0.35, ortho=2.0, elev=0.12)
    guides(PRE, False)
    # wireframe overlay (topology view), garments hidden
    body = bpy.data.objects[PRE + 'Body']
    for o in bpy.data.objects:
        if o.name.startswith(PRE) and o.name != PRE + 'Body': o.hide_render = True
    wo = body.copy(); wo.data = body.data.copy(); wo.name = 'qc_wire'; bpy.context.scene.collection.objects.link(wo)
    wm = bpy.data.materials.new('qc_wire'); wm.use_nodes = True; wm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.02, 0.02, 0.05, 1)
    wo.data.materials.clear(); wo.data.materials.append(wm); wf = wo.modifiers.new('w', 'WIREFRAME'); wf.thickness = 0.0012; wf.use_replace = True
    wo.modifiers.move(len(wo.modifiers) - 1, 0)
    shot(f'{D}/render_{g}_wire_head.png', (0, 0, H * 0.93), 0.5, ortho=0.42); shot(f'{D}/render_{g}_wire_torso.png', (0, 0, H * 0.68), 0.3, ortho=0.9)
    shot(f'{D}/render_{g}_wire_hand.png', (H * 0.47, 0, H * 0.84), 0.0, ortho=0.3, elev=0.9)
    bpy.data.objects.remove(wo)
    show(PRE); guides(PRE, False)
    # 7 deformation test pose
    for b, ax, dg in (('leftUpperArm', 'Y', 72), ('rightUpperArm', 'Y', -40), ('rightLowerArm', 'Y', -95), ('leftLowerArm', 'Y', 25), ('leftUpperLeg', 'X', -55), ('leftLowerLeg', 'X', 80),
                      ('head', 'Z', 30), ('spine', 'Z', -12), ('rightHand', 'Z', 30), ('leftIndexProximal', 'Y', 50), ('leftMiddleProximal', 'Y', 60), ('leftRingProximal', 'Y', 60), ('leftLittleProximal', 'Y', 60)):
        rot(rig, b, ax, dg)
    dg_ = bpy.context.evaluated_depsgraph_get(); ev = bpy.data.objects[PRE + 'Body'].evaluated_get(dg_); m = ev.to_mesh()
    pc = np.array([v.co[:] for v in m.vertices]); ev.to_mesh_clear()
    check(g, '7 deformation', np.isfinite(pc).all() and np.abs(pc).max() < 3, f'posed mesh stays finite and bounded (max coordinate {np.abs(pc).max():.2f} m); see render_{g}_pose.png')
    shot(f'{D}/render_{g}_pose.png', (0, 0, H / 2), 0.5, ortho=2.0)
    for pb in rig.pose.bones: pb.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()

# 10 export test: VRM 0.x per gender, then re-import and count
try:
    bpy.ops.preferences.addon_enable(module='io_scene_vrm'); ok_addon = True
except Exception as e: ok_addon = False; check('both', '10 export', False, f'VRM add-on unavailable: {e}')
if ok_addon:
    for g, PRE in PAIRS:
        rig = rigs[g]; ext = rig.data.vrm_addon_extension; ext.spec_version = '0.0'; v = ext.vrm0
        names = set(b.name for b in rig.data.bones)
        for h in v.humanoid.human_bones: h.node.bone_name = h.bone if h.bone in names else ''
        v.meta.title = f'Kael Master {g.capitalize()}'; v.meta.author = 'Kael Studio'; v.first_person.first_person_bone.bone_name = 'head'
        for o in bpy.data.objects:
            o.select_set(False)
            if o.type in ('MESH', 'ARMATURE'): o.hide_render = False
        keep = [o for o in bpy.data.objects if o.name.startswith(PRE) and o.type in ('MESH', 'ARMATURE')]
        other = [o for o in bpy.data.objects if o.type in ('MESH', 'ARMATURE', 'CURVE') and o not in keep]
        for o in other: o.hide_set(True); o.hide_viewport = True
        for o in keep: o.hide_viewport = False; o.select_set(True)
        path = f'{D}/export_test_{g}.vrm'
        try:
            import struct
            tries = 0; j = {}
            want = len([o for o in keep if o.type == 'MESH'])
            while len(j.get('meshes', [])) < want and tries < 3:      # the add-on's first export in a fresh session can come back empty; verify content, not just the return code
                tries += 1
                for o in bpy.data.objects: o.select_set(o in keep)
                bpy.context.view_layer.objects.active = rig; bpy.context.view_layer.update()
                r = bpy.ops.export_scene.vrm(filepath=path, armature_object_name=rig.name, export_invisibles=False, export_only_selections=True)
                if os.path.exists(path):
                    f = open(path, 'rb'); f.read(12); n, _ = struct.unpack('<I4s', f.read(8)); j = json.loads(f.read(n)); f.close()
            hb = j['extensions']['VRM']['humanoid']['humanBones']; req = {'hips', 'spine', 'chest', 'neck', 'head', 'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightUpperArm', 'rightLowerArm', 'rightHand', 'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot'}
            got = {b['bone'] for b in hb}
            check(g, '10 export', 'FINISHED' in r and req <= got and len(j.get('meshes', [])) >= want, f'VRM 0.x written on attempt {tries} ({os.path.getsize(path)//1024} KB), shaders {sorted({m["shader"] for m in j["extensions"]["VRM"]["materialProperties"]})}, {len(hb)} humanoid bones mapped, {len(j["meshes"])} meshes; required bones present: {req <= got}')
        except Exception as e:
            check(g, '10 export', False, f'export raised: {str(e)[:200]}')
        for o in other: o.hide_set(False); o.hide_viewport = False
check('both', '8 facial expressions', False, 'NOT BUILT in stage 1: the master bodies carry no blink, mouth or ARKit shape keys yet')
check('both', '7 IK controls', False, 'NOT BUILT in stage 1: the rig has deform bones only (root + 54 humanoid); no IK, jaw, hair, ear, tail or wing bones yet')
json.dump(R, open(f'{D}/qc_report_{KA}_{KB}.json', 'w'), indent=1)
for c in R['checks']: print('PASS' if c['pass'] else 'FAIL', '|', c['body'], '|', c['check'], '|', c['detail'] if not isinstance(c['detail'], dict) else json.dumps(c['detail']))
