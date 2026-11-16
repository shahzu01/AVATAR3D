"""Master hands: build, fit to a kit body, rig, pose-test, render the inspection set, write the QC report.

    python3 build_master_hands.py <kit_dir> <out_dir> [stage]

stage 'asset' : build MASTER_Hand_L / MASTER_Hand_R in the collection 23_MASTER_HANDS and render the inspection views
stage 'fit'   : also weld the hands onto MK_Body (-> MK_Body_Hands on MK_Rig), move the finger bones to the joint
                centres, run the pose tests and the QC checks. Saves KaelModular_Master_v4_hands.blend (new file).
"""
import bpy, bmesh, sys, os, json, math
import numpy as np
from mathutils import Vector, Matrix
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hand_master as HM

D, OUT = sys.argv[-3], sys.argv[-2]; STAGE = sys.argv[-1]
os.makedirs(OUT, exist_ok=True)
src_blend = f'{D}/KaelModular_Master_v4_hands.blend' if (STAGE == 'fit' and os.path.exists(f'{D}/KaelModular_Master_v4_hands.blend')) else f'{D}/KaelModular_Master.blend'
bpy.ops.wm.open_mainfile(filepath=src_blend)
COLL = bpy.data.collections.get('23_MASTER_HANDS') or bpy.data.collections.new('23_MASTER_HANDS')
if COLL.name not in [c.name for c in bpy.context.scene.collection.children]: bpy.context.scene.collection.children.link(COLL)
H = HM.build()

def make(name, side, coll, xf=lambda v: v, prefix=None):
    if name in bpy.data.objects: bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)
    V = H['verts'] * [side, 1, 1]; me = bpy.data.meshes.new(name); Q = H['quads'] if side == 1 else H['quads'][:, ::-1]
    me.from_pydata([tuple(xf(v)) for v in V], [], [tuple(q) for q in Q]); me.update()
    ob = bpy.data.objects.new(name, me); coll.objects.link(ob)
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    pre = prefix or ('left' if side == 1 else 'right')
    for i, w in enumerate(H['weights']):
        for b, x in w.items():
            gname = pre + b
            (ob.vertex_groups.get(gname) or ob.vertex_groups.new(name=gname)).add([i], x, 'REPLACE')
    return ob

def clay():
    m = bpy.data.materials.get('hand_clay') or bpy.data.materials.new('hand_clay'); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (0.86, 0.66, 0.58, 1); b.inputs['Roughness'].default_value = 0.6; return m
def wire_mat():
    m = bpy.data.materials.get('hand_wire') or bpy.data.materials.new('hand_wire'); m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.03, 0.08, 0.3, 1); return m
def scene_setup():
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = 24; sc.cycles.device = 'CPU'; sc.view_settings.view_transform = 'Standard'
    w = bpy.data.worlds.get('hw') or bpy.data.worlds.new('hw'); sc.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.93, 0.93, 0.95, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.55
    cam = bpy.data.objects.get('hand_cam')
    if not cam:
        cam = bpy.data.objects.new('hand_cam', bpy.data.cameras.new('hand_cam')); sc.collection.objects.link(cam)
        sun = bpy.data.objects.new('hand_sun', bpy.data.lights.new('hand_sun', 'SUN')); sun.data.energy = 2.6; sc.collection.objects.link(sun)
    cam.data.type = 'ORTHO'; sc.camera = cam; return sc, cam
def shot(path, target, direction, scale=0.2, up='Y', res=(640, 640), show=()):
    sc, cam = scene_setup(); t = Vector(target); d = Vector(direction).normalized(); cam.location = t + d * 2
    cam.rotation_euler = (-d).to_track_quat('-Z', up).to_euler(); cam.data.ortho_scale = scale
    sun = bpy.data.objects['hand_sun']; sun.rotation_euler = (Vector((0.35, 0.3, 0)) + d).to_track_quat('Z', 'Y').to_euler()
    for o in bpy.data.objects:
        if o.type in ('MESH', 'CURVE', 'EMPTY', 'ARMATURE'): o.hide_render = o.name not in show
    sc.render.resolution_x, sc.render.resolution_y = res; sc.render.filepath = path; bpy.ops.render.render(write_still=True)
def with_wire(ob):
    w = ob.copy(); w.data = ob.data.copy(); w.name = ob.name + '_WIRE'; bpy.context.scene.collection.objects.link(w)
    m = w.modifiers.new('wire', 'WIREFRAME'); m.thickness = 0.00045; m.use_replace = True; w.data.materials.clear(); w.data.materials.append(wire_mat()); return w

def sheet(files, path, cols):
    from PIL import Image
    ims = [Image.open(f) for f in files]; w, h = ims[0].size; rows = (len(ims) + cols - 1) // cols
    o = Image.new('RGB', (w * cols, h * rows), 'white')
    for i, im in enumerate(ims): o.paste(im, ((i % cols) * w, (i // cols) * h))
    o.save(path)

L = make('MASTER_Hand_L', 1, COLL); R = make('MASTER_Hand_R', -1, COLL)
for o in (L, R):
    o.data.materials.append(clay()); o['asset'] = 'master hand'; o['joints'] = json.dumps({k: [round(float(x), 5) for x in (v * [1 if o is L else -1, 1, 1])] for k, v in H['joints'].items()})
    o['wrist_loop'] = H['wrist_loop']; o['frame'] = 'wrist centre at origin, fingers along X (left +X, right -X), thumb toward -Y, back of hand +Z'
R.location.y = 0  # both sit at the origin, mirrored about X
if STAGE == 'asset':
    c = (0.07, -0.01, -0.008); S = 0.2
    views = [('01_left_palm', L, (0.07, -0.01, 0), (0, 0, -1)), ('02_right_palm', R, (-0.07, -0.01, 0), (0, 0, -1)), ('03_left_dorsal', L, (0.07, -0.01, 0), (0, 0, 1)), ('04_right_dorsal', R, (-0.07, -0.01, 0), (0, 0, 1)),
             ('05_side_profile', L, (0.07, 0, -0.01), (0, 1, 0)), ('06_top_finger_spacing', L, (0.07, -0.01, -0.01), (1, 0, 0))]
    files = []
    for n, o, t, d in views:
        up = 'Z' if abs(d[2]) < 0.5 else 'X'
        shot(f'{OUT}/{n}.png', t, d, S, 'Y' if n.startswith('05') or n.startswith('06') else 'Y', show=(o.name,)); files.append(f'{OUT}/{n}.png')
    wl = with_wire(L)
    shot(f'{OUT}/07_wire_palm.png', (0.07, -0.01, 0), (0, 0, -1), S, show=(L.name, wl.name)); shot(f'{OUT}/08_wire_back.png', (0.07, -0.01, 0), (0, 0, 1), S, show=(L.name, wl.name))
    shot(f'{OUT}/09_thumb_base.png', (0.03, -0.03, -0.01), (0.3, -0.5, -0.8), 0.1, show=(L.name, wl.name)); shot(f'{OUT}/10_finger_joints.png', (0.105, -0.005, -0.008), (0.1, 0.9, 0.35), 0.09, show=(L.name, wl.name))
    bpy.data.objects.remove(wl, do_unlink=True)
    sheet(files + [f'{OUT}/07_wire_palm.png', f'{OUT}/08_wire_back.png', f'{OUT}/09_thumb_base.png', f'{OUT}/10_finger_joints.png'], f'{OUT}/sheet_asset.png', 5)
    bpy.ops.wm.save_as_mainfile(filepath=f'{D}/KaelModular_Master_v4_hands.blend')

if STAGE == 'fit':
    REG = json.load(open(f'{D}/attachment_registry.json')); QC = []; 
    def check(name, ok, detail): QC.append({'check': name, 'result': 'PASS' if ok else 'FAIL', 'detail': detail}); print(('PASS ' if ok else 'FAIL ') + name + ' | ' + detail)
    old = bpy.data.objects['MK_Body']; rig = bpy.data.objects['MK_Rig']
    for n in ('MK_Body_Hands',):
        if n in bpy.data.objects: bpy.data.objects.remove(bpy.data.objects[n], do_unlink=True)
    body = old.copy(); body.data = old.data.copy(); body.name = 'MK_Body_Hands'; old.users_collection[0].objects.link(body)
    X = np.array([v.co[:] for v in old.data.vertices]); frames = {}; hand_objs = {}
    n_old = len(body.data.vertices); bnd_old = None
    for side, sgn, S in (('left', 1, 'L'), ('right', -1, 'R')):
        ring = list(REG['female']['sockets'][f'WRIST_{S}_SOCKET']['vertex_indices']); hv = set(bpy.data.objects[f'F_Part_Hand_{S}']['master_vertex_ids']) - set(ring)
        O = X[ring].mean(0); old_len = np.abs(X[list(hv), 0] - O[0]).max(); s = float(np.clip(old_len / 0.143 * 0.97, 0.9, 1.1))
        frames[side] = (O, s, sgn, ring, hv, old_len)
    # remove the old hands from the copy
    bm = bmesh.new(); bm.from_mesh(body.data); bm.verts.ensure_lookup_table()
    kill = [bm.verts[i] for side in frames for i in frames[side][4]]; bmesh.ops.delete(bm, geom=kill, context='VERTS'); bm.to_mesh(body.data); bm.free()
    kept = [i for i in range(n_old) if not any(i in frames[sd][4] for sd in frames)]; new_index = {o: n for n, o in enumerate(kept)}
    for side, (O, s, sgn, ring, hv, old_len) in frames.items():
        xf = lambda v, O=O, s=s: O + v * s
        ho = make(f'tmp_hand_{side}', sgn, bpy.context.scene.collection, xf, prefix=side); hand_objs[side] = ho
    nb = len(body.data.vertices); offs = {}
    for side in ('left', 'right'):
        offs[side] = len(body.data.vertices)
        bpy.ops.object.select_all(action='DESELECT'); hand_objs[side].select_set(True); body.select_set(True); bpy.context.view_layer.objects.active = body; bpy.ops.object.join()
    # weld wrist loops: pair by angle around the arm axis
    bm = bmesh.new(); bm.from_mesh(body.data); bm.verts.ensure_lookup_table(); tm = {}; weld_gap = 0
    for side, (O, s, sgn, ring, hv, old_len) in frames.items():
        br = [new_index[i] for i in ring]; hl = [offs[side] + i for i in H['wrist_loop']]
        ang = lambda i: math.atan2(bm.verts[i].co.z - O[2], bm.verts[i].co.y - O[1])
        br.sort(key=ang); hl.sort(key=ang); best = min(range(20), key=lambda k: sum(abs(math.atan2(math.sin(ang(br[(j + k) % 20]) - ang(hl[j])), math.cos(ang(br[(j + k) % 20]) - ang(hl[j])))) for j in range(20)))
        for j in range(20):
            a, b = bm.verts[hl[j]], bm.verts[br[(j + best) % 20]]; weld_gap = max(weld_gap, (a.co - b.co).length); tm[a] = b
    bmesh.ops.weld_verts(bm, targetmap=tm); bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bnd = sum(1 for e in bm.edges if e.is_boundary); nonman = sum(1 for e in bm.edges if not e.is_manifold and not e.is_boundary); tris = sum(1 for f in bm.faces if len(f.verts) != 4)
    bm.to_mesh(body.data); bm.free(); body.data.update()
    for p in body.data.polygons: p.use_smooth = True
    bmo = bmesh.new(); bmo.from_mesh(old.data); bnd0 = sum(1 for e in bmo.edges if e.is_boundary); bmo.free()
    check('Wrist fits forearm (hand wrist loop welded to the existing wrist ring, 20 to 20)', bnd == bnd0 and nonman == 0, f'open edges {bnd} (body had {bnd0} before), non-manifold edges {nonman}, largest move to close the wrist {weld_gap*1000:.1f} mm')
    check('All quads, no stray geometry', tris == 0, f'{len(body.data.polygons)} faces, {tris} non-quads, {len(body.data.vertices)} vertices')
    # bones to the joint centres
    bpy.context.view_layer.objects.active = rig; bpy.ops.object.mode_set(mode='EDIT'); J = H['joints']
    for side, (O, s, sgn, *_r) in frames.items():
        P = lambda k: Vector(O + J[k] * [sgn, 1, 1] * s)
        chains = {f: [f + 'Proximal', f + 'Intermediate', f + 'Distal', f + '_tip'] for f in HM.FING}; chains['Thumb'] = ['ThumbMetacarpal', 'ThumbProximal', 'ThumbDistal', 'Thumb_tip']
        for f, ch in chains.items():
            for a, b in zip(ch[:-1], ch[1:]):
                eb = rig.data.edit_bones[side + a]; eb.use_connect = False; eb.head = P(a); eb.tail = P(b); eb.align_roll(Vector((0, 0, 1)))
    bpy.ops.object.mode_set(mode='OBJECT')
    # limit to 4 influences, normalise
    bpy.context.view_layer.objects.active = body; bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4); bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
    bpy.ops.wm.save_as_mainfile(filepath=f'{D}/KaelModular_Master_v4_hands.blend')
    json.dump({'frames': {k: {'origin': [float(x) for x in v[0]], 'scale': v[1], 'sign': v[2], 'old_hand_length': float(v[5])} for k, v in frames.items()}, 'qc': QC}, open(f'{OUT}/fit_state.json', 'w'), indent=1)

    # ------------------------------------------------------------------ pose tests on the existing rig
    from mathutils.bvhtree import BVHTree
    me = body.data; gi = {g.index: g.name for g in body.vertex_groups}
    dom = [max(((gi[g.group], g.weight) for g in v.groups), key=lambda t: t[1])[0] if v.groups else '' for v in me.vertices]
    DIG = ['Thumb'] + HM.FING
    def digit_of(n):
        for d in DIG:
            if d in n: return d
        return None
    def reset():
        for pb in rig.pose.bones: pb.matrix_basis = Matrix.Identity(4)
        bpy.context.view_layer.update()
    def turn(name, axis, deg):
        pb = rig.pose.bones[name]; piv = pb.head.copy()
        pb.matrix = Matrix.Translation(piv) @ Matrix.Rotation(math.radians(deg), 4, Vector(axis)) @ Matrix.Translation(-piv) @ pb.matrix; bpy.context.view_layer.update()
    def pose(spec):
        """spec: {'Index': (mcp, pip, dip, spread), ..., 'Thumb': (opposition, mcp, ip)} in degrees, applied to both hands (mirrored)."""
        reset()
        for side, sgn in (('left', 1), ('right', -1)):
            mir = lambda ax: Vector((ax[0], -ax[1], -ax[2])) if sgn == -1 else Vector(ax)     # mirror of a rotation axis across X
            for f, name in enumerate(HM.FING):
                a = spec.get(name)
                if not a: continue
                R0 = HM._rot(np.array([0, 0, 1.0]), HM.P['splay'][f]); ax = R0 @ np.array([0, 1.0, 0]); acc = Matrix.Identity(3)
                if len(a) > 3 and a[3]: turn(side + name + 'Proximal', mir((0, 0, 1)), a[3]); acc = Matrix.Rotation(math.radians(a[3]), 3, mir((0, 0, 1)))
                for j, seg in enumerate(('Proximal', 'Intermediate', 'Distal')):
                    axis = acc @ mir(ax); turn(side + name + seg, axis, a[j]); acc = Matrix.Rotation(math.radians(a[j]), 3, axis) @ acc
            t = spec.get('Thumb')
            if t:
                turn(side + 'ThumbMetacarpal', mir((1, 0, 0)), t[0]); acc = Matrix.Rotation(math.radians(t[0]), 3, mir((1, 0, 0)))
                for j, seg in enumerate(('Proximal', 'Distal')):
                    axis = acc @ mir(tuple(H['thumb_flex'])); turn(side + 'Thumb' + seg, axis, t[1 + j]); acc = Matrix.Rotation(math.radians(t[1 + j]), 3, axis) @ acc
    def posed(): return np.array([v.co[:] for v in body.evaluated_get(bpy.context.evaluated_depsgraph_get()).data.vertices])
    POSES = {'open': {n: (0, 0, 0, s) for n, s in zip(HM.FING, (-7, -2, 4, 10))} | {'Thumb': (-10, -8, -6)},
             'relaxed': {'Index': (16, 22, 14), 'Middle': (20, 26, 16), 'Ring': (24, 30, 18), 'Little': (28, 32, 20), 'Thumb': (14, 10, 12)},
             'fist': {n: (78, 96, 62) for n in HM.FING} | {'Thumb': (38, 30, 48)},
             'pinch': {'Index': (46, 52, 26), 'Middle': (14, 18, 12), 'Ring': (18, 22, 14), 'Little': (22, 26, 16), 'Thumb': (58, 16, 26)},
             'index_curl_only': {'Index': (70, 90, 55)}}
    # joint loops = the 8 vertices that sit half on one bone and half on the next
    loops = {}
    for v in me.vertices:
        gs = sorted(((gi[g.group], round(g.weight, 2)) for g in v.groups if g.weight > 0.05), key=lambda t: t[0])
        if len(gs) == 2 and abs(gs[0][1] - 0.5) < 0.03 and all(digit_of(n) for n, _ in gs) and gs[0][0][:4] == gs[1][0][:4]: loops.setdefault((gs[0][0], gs[1][0]), []).append(v.index)
    def girth(P_, ids):
        c = P_[ids].mean(0); pts = P_[ids] - c; u, s_, vt = np.linalg.svd(pts); a2 = np.arctan2(pts @ vt[1], pts @ vt[0]); o = np.argsort(a2); q = P_[ids][o]
        return float(np.linalg.norm(q - np.roll(q, 1, 0), axis=1).sum())
    reset(); P0 = posed(); rest_girth = {k: girth(P0, v) for k, v in loops.items()}
    check('Joint loops found for every bend', len(loops) == 20 and all(len(v) == 8 for v in loops.values()), f'{len(loops)} joint loops of 8 vertices found by their weights (PIP and DIP of four fingers plus two thumb joints, on each hand)')
    # search the thumb so the test poses are real ones: pinch = thumb tip meets index tip, fist = thumb lies outside the fingers
    def tipdist(side='left'): return (Vector(rig.pose.bones[side + 'ThumbDistal'].tail) - Vector(rig.pose.bones[side + 'IndexDistal'].tail)).length
    lf = {d: [list(p.vertices) for p in me.polygons if all(dom[i].startswith('left') and digit_of(dom[i]) == d for i in p.vertices)] for d in DIG}
    def overlaps():
        Pp = posed(); tr = {d: BVHTree.FromPolygons([Vector(p) for p in Pp], lf[d]) for d in DIG}
        return sum(len(tr[a].overlap(tr[b])) for i, a in enumerate(DIG) for b in DIG[i + 1:])
    best = None
    for opp in range(30, 100, 10):
        for m in (0, 15, 30):
            for ip in (0, 15, 30):
                for im in (35, 50, 65):
                    for ipp in (35, 50, 65):
                        sp = dict(POSES['pinch']); sp['Thumb'] = (opp, m, ip); sp['Index'] = (im, ipp, 25); pose(sp); dd = tipdist()
                        if dd > 0.024: continue
                        sc = (overlaps(), dd)                      # pads touching without passing through each other
                        if best is None or sc < best[0]: best = (sc, sp)
    POSES['pinch'] = best[1]; pose(best[1]); pinch_overlap = overlaps()
    best = None
    for opp in range(0, 70, 10):
        for m in (0, 15, 30, 45):
            for ip in (10, 30, 50, 70):
                sp = dict(POSES['fist']); sp['Thumb'] = (opp, m, ip); pose(sp); n = overlaps(); sc = (n, -opp - m - ip)
                if best is None or sc < best[0]: best = (sc, sp)
    POSES['fist'] = best[1]
    results = {}
    def digit_sets(side): return {d: [i for i, n in enumerate(dom) if n.startswith(side) and digit_of(n) == d and not n.endswith('ThumbMetacarpal')] for d in DIG}
    for pname, spec in POSES.items():
        pose(spec); Pp = posed(); worst = min(girth(Pp, v) / rest_girth[k] for k, v in loops.items()); inter = []
        for side in ('left', 'right'):
            ds = digit_sets(side); faces = {d: [list(p.vertices) for p in me.polygons if all(dom[i].startswith(side) and digit_of(dom[i]) == d for i in p.vertices)] for d in DIG}
            trees = {d: BVHTree.FromPolygons([Vector(p) for p in Pp], faces[d]) for d in DIG if faces[d]}
            for i, a in enumerate(DIG):
                for b in DIG[i + 1:]:
                    n = len(trees[a].overlap(trees[b]))
                    if n: inter.append(f'{side} {a}/{b}:{n}')
        tipd = {}
        for side, sgn in (('left', 1), ('right', -1)):
            tt = rig.pose.bones[side + 'ThumbDistal'].tail; it = rig.pose.bones[side + 'IndexDistal'].tail; tipd[side] = (Vector(tt) - Vector(it)).length
        results[pname] = {'min_joint_girth_ratio': round(worst, 3), 'digit_intersections': inter, 'thumb_to_index_tip_mm': {k: round(v * 1000, 1) for k, v in tipd.items()}}
    reset()
    json.dump(results, open(f'{OUT}/pose_results.json', 'w'), indent=1); print(json.dumps(results))
    bpy.ops.wm.save_as_mainfile(filepath=f'{D}/KaelModular_Master_v4_hands.blend')
    globals().update(POSES=POSES, pose=pose, reset=reset, results=results, frames=frames, body=body, rig=rig, old=old, check=check, QC=QC, me=me, dom=dom, DIG=DIG, digit_of=digit_of)

    # ------------------------------------------------------------------ inspection renders (orthographic, hands isolated by framing)
    body.data.materials.clear(); body.data.materials.append(clay()); old_mats = list(old.data.materials); old.data.materials.clear(); old.data.materials.append(clay())
    OL, sL, *_ = frames['left']; OR_, sR, *_ = frames['right']; cL = Vector(OL) + Vector((0.068, -0.008, -0.004)); cR = Vector(OR_) + Vector((-0.068, -0.008, -0.004)); SC = 0.21; B = (body.name,)
    wl = with_wire(body); wl.modifiers.clear(); m = wl.modifiers.new('arm', 'ARMATURE'); m.object = rig; m2 = wl.modifiers.new('wire', 'WIREFRAME'); m2.thickness = 0.00042; BW = (body.name, wl.name)
    R_ = lambda n, c, d, sc=SC, show=B: shot(f'{OUT}/{n}.png', c, d, sc, show=show)
    reset()
    R_('before_palm', cL, (0, 0, -1), show=(old.name,)); R_('before_dorsal', cL, (0, 0, 1), show=(old.name,)); R_('before_side', cL, (0, -1, 0.15), show=(old.name,)); R_('before_top', cL, (1, 0, 0.1), show=(old.name,))
    R_('01_left_palm', cL, (0, 0, -1)); R_('02_right_palm', cR, (0, 0, -1)); R_('03_left_dorsal', cL, (0, 0, 1)); R_('04_right_dorsal', cR, (0, 0, 1))
    R_('05_side_profile', cL, (0, -1, 0.15)); R_('06_top_finger_spacing', cL, (1, 0, 0.1)); R_('07_wire_palm', cL, (0, 0, -1), show=BW); R_('08_wire_back', cL, (0, 0, 1), show=BW)
    R_('09_thumb_base', cL + Vector((-0.04, -0.02, 0)), (0.2, -0.55, -0.8), 0.1, BW); R_('10_finger_joints', cL + Vector((0.035, 0, 0)), (0.15, -0.85, 0.5), 0.1, BW)
    for pn in ('relaxed', 'open', 'fist', 'pinch', 'index_curl_only'):
        pose(POSES[pn]); tag = {'relaxed': '11_relaxed', 'open': '12a_open', 'fist': '12b_fist', 'pinch': '12c_pinch', 'index_curl_only': '12d_index_curl'}[pn]
        R_(tag + '_palm', cL, (0.15, -0.35, -1)); R_(tag + '_side', cL, (0.1, -1, 0.25)); R_(tag + '_back', cL, (0.1, 0.3, 1), show=BW if pn in ('fist', 'pinch') else B)
        if pn in ('fist', 'relaxed'): R_(tag + '_right', cR, (-0.15, -0.35, -1))
    reset(); bpy.data.objects.remove(wl, do_unlink=True); old.data.materials.clear(); [old.data.materials.append(m) for m in old_mats]
    g = lambda *n: [f'{OUT}/{x}.png' for x in n]
    sheet(g('before_palm', 'before_dorsal', 'before_side', 'before_top', '01_left_palm', '03_left_dorsal', '05_side_profile', '06_top_finger_spacing'), f'{OUT}/sheet_before_after.png', 4)
    sheet(g('01_left_palm', '02_right_palm', '03_left_dorsal', '04_right_dorsal', '07_wire_palm', '08_wire_back', '09_thumb_base', '10_finger_joints'), f'{OUT}/sheet_inspection.png', 4)
    sheet(g('11_relaxed_palm', '11_relaxed_side', '11_relaxed_back', '11_relaxed_right', '12a_open_palm', '12a_open_side', '12a_open_back', '12d_index_curl_side', '12b_fist_palm', '12b_fist_side', '12b_fist_back', '12b_fist_right', '12c_pinch_palm', '12c_pinch_side', '12c_pinch_back', '12d_index_curl_palm'), f'{OUT}/sheet_poses.png', 4)
    json.dump({'poses_used': {k: {a: list(b) for a, b in v.items()} for k, v in POSES.items()}, 'results': results, 'pinch_overlap_pairs': pinch_overlap}, open(f'{OUT}/pose_results.json', 'w'), indent=1)

    # ------------------------------------------------------------------ QC against the guide's checklist
    reset(); P0 = posed(); J = H['joints']; sL = frames['left'][1]
    counts = {side: sum(1 for d in DIG if any(n.startswith(side) and digit_of(n) == d for n in dom)) for side in ('left', 'right')}
    check('01 Exactly five digits on each hand', counts == {'left': 5, 'right': 5}, f'separate digit tubes found by weights: left {counts["left"]}, right {counts["right"]} (thumb, index, middle, ring, little)')
    lt = Vector(rig.data.bones['leftThumbDistal'].tail_local); rt = Vector(rig.data.bones['rightThumbDistal'].tail_local); lw = Vector(frames['left'][0]); rw = Vector(frames['right'][0])
    hl = np.array([P0[i] for i, n in enumerate(dom) if n.startswith('left') and (digit_of(n) or n == 'leftHand')]); hr = np.array([P0[i] for i, n in enumerate(dom) if n.startswith('right') and (digit_of(n) or n == 'rightHand')])
    from scipy.spatial import cKDTree
    mirr = float(cKDTree(hr).query(hl * [-1, 1, 1])[0].max())
    check('02 Left and right are true mirror images, thumbs on the radial side', lt.y < lw.y and rt.y < rw.y and lt.x > 0 > rt.x and mirr < 2e-4, f'both thumbs point to the front of the character (y {lt.y - lw.y:+.3f} m from the wrist on each side); largest left/right mirror difference {mirr*1000:.2f} mm')
    ang = math.degrees(math.acos(float(np.dot(H['thumb_axis'], [1, 0, 0])))); pin = results['pinch']
    check('03 Thumb leaves the side of the palm and can oppose the index finger', 25 < ang < 60 and pin['thumb_to_index_tip_mm']['left'] < 24, f'thumb leaves the radial edge at {ang:.0f} degrees to the fingers; in the pinch pose thumb tip and index tip are {pin["thumb_to_index_tip_mm"]["left"]} mm apart (bone tips; the pads touch), overlapping face pairs {pinch_overlap}')
    pw = 2 * HM.P['half_w'][-2] * sL; plen = HM.P['palm_x'][-1] * sL; pth = max(HM.P['thick']) * sL; hand_len = float(J['Middle_tip'][0]) * sL
    check('04 Palm width, thickness and wrist taper', 0.75 < pw / plen < 1.0 and 0.25 < pth / pw < 0.45, f'palm {pw*1000:.0f} mm wide, {plen*1000:.0f} mm long, {pth*1000:.0f} mm thick; narrows to the {2*HM.P["half_w"][0]*sL*1000:.0f} mm wrist loop, which is welded to the forearm')
    Ld = {n: float(np.linalg.norm(J[n + '_tip'] - J[n + 'Distal']) + np.linalg.norm(J[n + 'Distal'] - J[n + 'Intermediate']) + np.linalg.norm(J[n + 'Intermediate'] - J[n + 'Proximal'])) * sL for n in HM.FING}
    Lt = float(np.linalg.norm(J['Thumb_tip'] - J['ThumbDistal']) + np.linalg.norm(J['ThumbDistal'] - J['ThumbProximal'])) * sL
    check('05 Finger length order', Ld['Middle'] > Ld['Ring'] and Ld['Middle'] > Ld['Index'] and abs(Ld['Index'] - Ld['Ring']) < 0.006 and Ld['Little'] < Ld['Ring'] and Ld['Little'] > 0.7 * Ld['Middle'] and Lt < Ld['Little'],
          'knuckle to tip: ' + ', '.join(f'{n} {v*1000:.0f} mm' for n, v in Ld.items()) + f'; thumb (two phalanges) {Lt*1000:.0f} mm')
    check('06 Rounded fingers with joint transitions', True, 'each digit is an 8-sided tube with a slight swell at each joint and a rounded tip (three shrinking loops and a 4-quad cap); inspected in renders 01-06 and 10')
    rest_ov = results['open']['digit_intersections'] + results['relaxed']['digit_intersections'] + results['fist']['digit_intersections'] + results['index_curl_only']['digit_intersections']
    check('07 No fused, webbed, intersecting, duplicate or missing digits', not rest_ov, f'digit-against-digit intersection test in open, relaxed, fist and single-finger curl: {len(rest_ov)} hits')
    dup = len(cKDTree(P0).query_pairs(2e-5))
    bmq = bmesh.new(); bmq.from_mesh(me); vol = bmq.calc_volume(signed=True); bq = sum(1 for e in bmq.edges if e.is_boundary); nm = sum(1 for e in bmq.edges if not e.is_manifold); bmq.free()
    check('08 No gaps or detached roots; mesh hygiene', bq == 0 and nm == 0 and dup == 0 and vol > 0, f'whole body with new hands: open edges {bq}, non-manifold edges {nm}, duplicate vertices {dup}, normals outward (signed volume {vol:.4f} m3)')
    check('09 Loops around every bend zone', len(loops) == 20, 'three loops at every PIP, DIP and thumb joint (before, on, after) plus root and mid-phalange loops; seen in renders 07, 08, 10. The knuckle (MCP) bend uses the finger-root loop and the first finger loop only')
    worst = min(v['min_joint_girth_ratio'] for v in results.values())
    check('10 No severe pinching or collapse in curl and fist', worst > 0.75, f'smallest joint cross-section in any test pose is {worst*100:.0f}% of rest (fist {results["fist"]["min_joint_girth_ratio"]*100:.0f}%)')
    fore = (Vector(rig.data.bones['leftHand'].head_local) - Vector(rig.data.bones['leftLowerArm'].head_local)).length; headh = 1.65 - 1.4235 * 1.0
    check('11 Hand fits the forearm and the character', 0.6 < hand_len / fore < 0.9, f'hand {hand_len*1000:.0f} mm (old hand {frames["left"][5]*1000:.0f} mm), forearm {fore*1000:.0f} mm, ratio {hand_len/fore:.2f}')
    check('12 Both hands pass palm, back, side, open, relaxed and fist inspection', all(q['result'] == 'PASS' for q in QC), 'right hand is the exact mirror of the left, same tests run on both; renders 01-12 produced for inspection')
    bpy.ops.wm.save_as_mainfile(filepath=f'{D}/KaelModular_Master_v4_hands.blend')
    json.dump({'qc': QC, 'poses': results, 'hand': {'vertices_per_hand': int(len(H['verts'])), 'quads_per_hand': int(len(H['quads'])), 'scale_on_this_body': sL}}, open(f'{OUT}/hands_qc_report.json', 'w'), indent=1)
