"""Kael modular kit, stage 3: cut every master body into interchangeable parts and stitch mixed characters.

  python3 build_parts.py <kit_dir>
1. Makes the socket rings canonical: the same loop of vertex ids on every body (taken from the female master).
2. Cuts each body into 11 parts (head, neck, torso, arm L/R, hand L/R, leg L/R, foot L/R) at those rings.
3. assemble(recipe): takes each part from any body, moves it onto its parent's ring, blends the seam, welds,
   rebuilds the skeleton to match, and returns one closed quad mesh on the standard rig.
"""
import sys, os, json, math
import numpy as np, bpy, bmesh
from mathutils import Vector, Matrix
from scipy.spatial import cKDTree
D = sys.argv[-1]
bpy.ops.wm.open_mainfile(filepath=f'{D}/KaelModular_Master.blend')
bpy.ops.preferences.addon_enable(module='io_scene_vrm')
REG = json.load(open(f'{D}/attachment_registry.json'))
REPORT = {'checks': [], 'failed': []}
def check(body, name, ok, detail):
    REPORT['checks'].append({'body': body, 'check': name, 'pass': bool(ok), 'detail': detail})
    if not ok: REPORT['failed'].append(f'{body}: {name} - {detail}')
    print('PASS' if ok else 'FAIL', '|', body, '|', name, '|', detail, flush=True)
def put(ob, cname):
    for c in list(ob.users_collection): c.objects.unlink(ob)
    bpy.data.collections[cname].objects.link(ob)

BODIES = list(REG)
SRC = {k: bpy.data.objects.get(REG[k]['prefix'] + 'Assembled_AnimeHead') or bpy.data.objects[REG[k]['prefix'] + 'Body'] for k in BODIES}
RIG = {k: bpy.data.objects[REG[k]['prefix'] + 'Rig'] for k in BODIES}
X = {k: np.array([v.co[:] for v in SRC[k].data.vertices]) for k in BODIES}
me0 = SRC['female'].data; NV = len(me0.vertices)
FACES = [list(p.vertices) for p in me0.polygons]
for k in BODIES:
    assert [list(p.vertices) for p in SRC[k].data.polygons] == FACES, f'{k} does not share the master topology'
check('all', 'shared topology', True, f'{len(BODIES)} bodies share {NV} vertices and {len(FACES)} quads with identical vertex order')

# ---------------------------------------------------------------- 1 canonical rings
RINGS = {n: d['vertex_indices'] for n, d in REG['female']['sockets'].items() if d.get('vertex_indices')}
changed = []
for k in BODIES:
    for n, ids in RINGS.items():
        d = REG[k]['sockets'][n]
        if set(d['vertex_indices']) != set(ids): changed.append(f'{k}:{n}')
        P = X[k][ids]; cen = P.mean(0); rad = np.linalg.norm(P - cen, axis=1)
        nrm = np.zeros(3)
        for i in range(len(ids)): nrm += np.cross(P[i] - cen, P[(i + 1) % len(ids)] - cen)
        nrm /= np.linalg.norm(nrm)
        if np.dot(nrm, d['normal']) < 0: nrm = -nrm
        d.update(vertex_indices=list(ids), vertex_ring_count=len(ids), position=[round(float(x), 5) for x in cen], normal=[round(float(x), 4) for x in nrm],
                 circumference=round(float(sum(np.linalg.norm(P[i] - P[(i + 1) % len(ids)]) for i in range(len(ids)))), 4),
                 radius_mean=round(float(rad.mean()), 4), radius_min=round(float(rad.min()), 4), radius_max=round(float(rad.max()), 4), canonical=True)
        for ob in {SRC[k], bpy.data.objects[REG[k]['prefix'] + 'Body']}:
            vg = ob.vertex_groups.get(n) or ob.vertex_groups.new(name=n)
            vg.remove(list(range(len(ob.data.vertices)))); vg.add(list(ids), 1.0, 'REPLACE')
check('all', 'canonical socket rings', True, f'every ring now uses the same vertex ids on all bodies; rings re-pointed: {changed or "none"}')

# ---------------------------------------------------------------- 2 part map (same for every body)
nb = [[] for _ in range(NV)]
for f in FACES:
    for a, b in zip(f, f[1:] + f[:1]): nb[a].append(b); nb[b].append(a)
ringv = {v: n for n, ids in RINGS.items() for v in ids}
comp = -np.ones(NV, int); comps = []
for s in range(NV):
    if comp[s] >= 0 or s in ringv: continue
    c = len(comps); st = [s]; comp[s] = c; mem = [s]
    while st:
        i = st.pop()
        for j in nb[i]:
            if comp[j] < 0 and j not in ringv: comp[j] = c; st.append(j); mem.append(j)
    comps.append(mem)
Xf = X['female']
def touching(mem):
    ms = set(mem); return {ringv[j] for i in mem for j in nb[i] if j in ringv}
PART_OF = {}; PARTS = {}
for mem in comps:
    t = touching(mem); cx = Xf[mem][:, 0].mean()
    if t == {'HEAD_NECK_SOCKET'}: name = 'Head'
    elif t == {'HEAD_NECK_SOCKET', 'NECK_TORSO_SOCKET'}: name = 'Neck'
    elif 'NECK_TORSO_SOCKET' in t: name = 'Torso'
    elif any(x.startswith('SHOULDER') for x in t) and any(x.startswith('WRIST') for x in t): name = 'Arm_' + ('L' if cx > 0 else 'R')
    elif any(x.startswith('WRIST') for x in t): name = 'Hand_' + ('L' if cx > 0 else 'R')
    elif any(x.startswith('HIP') for x in t) and any(x.startswith('ANKLE') for x in t): name = 'Leg_' + ('L' if cx > 0 else 'R')
    elif any(x.startswith('ANKLE') for x in t): name = 'Foot_' + ('L' if cx > 0 else 'R')
    else: name = f'Unknown{len(PARTS)}'
    PARTS.setdefault(name, []).extend(mem)
    for i in mem: PART_OF[i] = name
# hierarchy: (part, parent part, socket joining them); ring vertices are owned by the parent side
TREE = [('Torso', None, None), ('Neck', 'Torso', 'NECK_TORSO_SOCKET'), ('Head', 'Neck', 'HEAD_NECK_SOCKET')]
for s in 'LR':
    TREE += [(f'Arm_{s}', 'Torso', f'SHOULDER_{s}_SOCKET'), (f'Hand_{s}', f'Arm_{s}', f'WRIST_{s}_SOCKET'), (f'Leg_{s}', 'Torso', f'HIP_{s}_SOCKET'), (f'Foot_{s}', f'Leg_{s}', f'ANKLE_{s}_SOCKET')]
expected = {t[0] for t in TREE}
check('all', 'part map', set(PARTS) == expected, f'{len(PARTS)} parts: ' + ', '.join(f'{n} {len(PARTS[n])}v' for n in sorted(PARTS)))
COLL = {'Head': '02_HEAD', 'Neck': '08_NECK', 'Torso': '09_TORSO', 'Arm': '10_ARMS', 'Hand': '11_HANDS', 'Leg': '12_LEGS', 'Foot': '13_FEET'}
BONES = {'Head': ['head', 'leftEye', 'rightEye'], 'Neck': ['neck'], 'Torso': ['hips', 'spine', 'chest', 'upperChest', 'leftShoulder', 'rightShoulder']}
FING = ['Thumb', 'Index', 'Middle', 'Ring', 'Little']
for s, S in (('L', 'left'), ('R', 'right')):
    BONES[f'Arm_{s}'] = [S + 'UpperArm', S + 'LowerArm']; BONES[f'Hand_{s}'] = [S + 'Hand'] + [c.name for c in RIG['female'].data.bones[S + 'Hand'].children_recursive]
    BONES[f'Leg_{s}'] = [S + 'UpperLeg', S + 'LowerLeg']; BONES[f'Foot_{s}'] = [S + 'Foot', S + 'Toes']
allb = {b.name for b in RIG['female'].data.bones} - {'root'}
check('all', 'bone ownership', set(sum(BONES.values(), [])) == allb, f'{len(allb)} bones each owned by exactly one part')
PART_SOCKETS = {p: [sk for (c, par, sk) in TREE if sk and (c == p or par == p)] for p in expected}

# part objects: the part's own vertices plus every ring it touches
def part_faces(p):
    own = set(PARTS[p]); rings = set(v for sk in PART_SOCKETS[p] for v in RINGS[sk])
    return [i for i, f in enumerate(FACES) if all((v in own or v in rings) for v in f) and any(v in own for v in f)]
PF = {p: part_faces(p) for p in expected}
cover = sorted(i for p in PF for i in PF[p])
check('all', 'parts cover the body exactly once', cover == list(range(len(FACES))), f'{len(cover)} part faces for {len(FACES)} body faces')
names_vg = {g.index: g.name for g in SRC['female'].vertex_groups}
made = 0
for k in BODIES:
    PRE = REG[k]['prefix']; src = SRC[k]; gn = {g.index: g.name for g in src.vertex_groups}
    for p in sorted(expected):
        oname = f'{PRE}Part_{p}'
        if bpy.data.objects.get(oname): bpy.data.objects.remove(bpy.data.objects[oname])
        used = sorted({v for i in PF[p] for v in FACES[i]}); rm = {v: j for j, v in enumerate(used)}
        m = bpy.data.meshes.new(oname); m.from_pydata(X[k][used].tolist(), [], [[rm[v] for v in FACES[i]] for i in PF[p]]); m.update()
        uv = m.uv_layers.new(name='UVMap'); sl = src.data.uv_layers[0].data; li = 0
        for i in PF[p]:
            for l in src.data.polygons[i].loop_indices: uv.data[li].uv = sl[l].uv; li += 1
        for q in m.polygons: q.use_smooth = True
        ob = bpy.data.objects.new(oname, m); bpy.context.scene.collection.objects.link(ob); put(ob, COLL[p.split('_')[0]])
        m.materials.append(bpy.data.materials['MAT_Skin']); vgs = {}
        for v in used:
            for g in src.data.vertices[v].groups:
                nm = gn[g.group]
                if nm.endswith('_SOCKET') and nm not in PART_SOCKETS[p]: continue
                if nm not in vgs: vgs[nm] = ob.vertex_groups.new(name=nm)
                vgs[nm].add([rm[v]], g.weight, 'REPLACE')
        ob.parent = RIG[k]; ob.modifiers.new('Armature', 'ARMATURE').object = RIG[k]; ob.hide_render = True
        ob['part_type'] = p; ob['source_body'] = k; ob['sockets'] = PART_SOCKETS[p]; ob['bones'] = BONES[p]; ob['master_vertex_ids'] = used
        b = bmesh.new(); b.from_mesh(m); be = len({v.index for e in b.edges if e.is_boundary for v in e.verts}); b.free()
        want = sum(len(RINGS[sk]) for sk in PART_SOCKETS[p])
        if be != want: check(k, f'part border {p}', False, f'open border has {be} vertices, sockets total {want}')
        made += 1
check('all', 'part objects', made == len(BODIES) * len(expected), f'{made} part objects written ({len(expected)} per body), each open only on its socket rings')

# ---------------------------------------------------------------- 3 assembly
FAR = {'Neck': 'HEAD_NECK_SOCKET', 'Arm_L': 'WRIST_L_SOCKET', 'Arm_R': 'WRIST_R_SOCKET', 'Leg_L': 'ANKLE_L_SOCKET', 'Leg_R': 'ANKLE_R_SOCKET'}
def circ(R_): return float(sum(np.linalg.norm(R_[i] - R_[(i + 1) % len(R_)]) for i in range(len(R_))))
def assemble(name, recipe, blend=0.05):
    """recipe: {part: body_key, 'Hair': object name, 'Fit': {part: 'own' | 'match' | number}}.
    Fit 'own' keeps the part at its own size (seam blended over a few cm). 'match' scales the part so its ring matches
    what it attaches to: limbs and neck change thickness only (length kept), hands, feet and head scale evenly."""
    P = np.zeros((NV, 3)); AFF = {}; notes = []; fit = recipe.get('Fit', {})
    def src_of(p): return recipe[p]
    def apply(p, pts): A, c, t = AFF[p]; return (np.asarray(pts) - c) @ A.T + c + t
    for p, par, sk in TREE:
        k = src_of(p); ids = PARTS[p]
        if par is None:
            AFF[p] = (np.eye(3), np.zeros(3), np.zeros(3)); P[ids] = X[k][ids]
            for sk2 in [s for (c, pp, s) in TREE if pp == p]: P[RINGS[sk2]] = X[k][RINGS[sk2]]      # torso owns its rings
            continue
        ring = RINGS[sk]; target = P[ring]                      # ring as placed by the parent
        own = X[k][ring]; c = own.mean(0); t = target.mean(0) - c
        mode = fit.get(p, 'own'); g = 1.0
        if mode == 'match': g = circ(target) / circ(own)
        elif isinstance(mode, (int, float)): g = float(mode)
        if p in FAR and g != 1.0:                               # thickness only, along the limb axis
            ax = X[k][RINGS[FAR[p]]].mean(0) - c; ax /= np.linalg.norm(ax); A = g * np.eye(3) + (1 - g) * np.outer(ax, ax)
        else: A = g * np.eye(3)
        AFF[p] = (A, c, t)
        Q = apply(p, X[k][ids]); resid = target - apply(p, own)
        gap = float(np.linalg.norm(resid, axis=1).max())
        if gap > 1e-7:
            tree = cKDTree(apply(p, own)); dd, ii = tree.query(Q, k=4); w = 1.0 / np.maximum(dd, 1e-6) ** 2; w /= w.sum(1, keepdims=True)
            fall = 1 - np.clip(dd[:, 0] / blend, 0, 1); fall = fall * fall * (3 - 2 * fall)
            Q = Q + (resid[ii] * w[..., None]).sum(1) * fall[:, None]
        P[ids] = Q
        for sk2 in [s for (c2, pp, s) in TREE if pp == p]:       # rings this part owns for its own children
            P[RINGS[sk2]] = apply(p, X[k][RINGS[sk2]])
        if src_of(par) != k or g != 1.0: notes.append(f'{p} from {k} onto {par} from {src_of(par)} at {sk}: fit {mode}, scale {g:.2f}, moved {np.linalg.norm(t)*100:.1f} cm, ring mismatch left for blending {gap*1000:.1f} mm')
    dz = P[:, 2].min(); P[:, 2] -= dz
    for o in [o for o in bpy.data.objects if o.name.startswith(name)]: bpy.data.objects.remove(o)
    m = SRC[recipe['Torso']].data.copy(); m.name = name + '_Body'
    for v, c in zip(m.vertices, P): v.co = c
    m.update()
    ob = bpy.data.objects.new(name + '_Body', m); bpy.context.scene.collection.objects.link(ob); put(ob, '22_EXPORT')
    tsrc = SRC[recipe['Torso']]
    for g in tsrc.vertex_groups: ob.vertex_groups.new(name=g.name)
    for v in tsrc.data.vertices:
        for g in v.groups: ob.vertex_groups[g.group].add([v.index], g.weight, 'REPLACE')
    # skeleton: each bone from the body that supplied its part, moved with that part
    rig = RIG[recipe['Torso']].copy(); rig.data = rig.data.copy(); rig.name = name + '_Rig'; rig.data.name = name + '_Rig'
    bpy.context.scene.collection.objects.link(rig); put(rig, '20_RIG')
    pos = {}
    for p, bl in BONES.items():
        k = src_of(p)
        for b in bl:
            sb = RIG[k].data.bones[b]; pos[b] = (apply(p, np.array(sb.head_local)) - [0, 0, dz], apply(p, np.array(sb.tail_local)) - [0, 0, dz])
    bpy.context.view_layer.objects.active = rig; bpy.ops.object.mode_set(mode='EDIT')
    for b, (h, t) in pos.items():
        e = rig.data.edit_bones[b]; e.head = Vector(h); e.tail = Vector(t)
    bpy.ops.armature.select_all(action='SELECT'); bpy.ops.armature.calculate_roll(type='GLOBAL_NEG_Y'); bpy.ops.armature.select_all(action='DESELECT')
    for e in rig.data.edit_bones:
        d = (e.tail - e.head).normalized(); e.select = e.select_head = e.select_tail = abs(d.y) > 0.6
    bpy.ops.armature.calculate_roll(type='GLOBAL_POS_Z'); bpy.ops.object.mode_set(mode='OBJECT')
    ob.parent = rig; ob.modifiers.new('Armature', 'ARMATURE').object = rig
    # face and hair pieces travel with the head
    hk = src_of('Head'); HP = REG[hk]['prefix']; extras = []
    cand = [HP + 'Eyes_Anime', HP + 'Lashes_Anime', HP + 'Brows_Anime', HP + 'MouthLine_Anime'] if bpy.data.objects.get(HP + 'Eyes_Anime') else [HP + 'Eyes']
    hair = recipe.get('Hair')
    if hair: cand.append(hair)
    TP = REG[recipe['Torso']]['prefix']; gshift = Vector((0, 0, -dz))
    cand += [o.name for o in bpy.data.collections['14_CLOTHING'].objects if o.name.startswith(TP) and o.name.split('_')[0] + '_' == TP]   # base garments follow the torso
    for n in cand:
        isg = n.startswith(TP) and 'Base' in n
        so = bpy.data.objects.get(n)
        if so is None: notes.append(f'missing piece {n}'); continue
        c = so.copy(); c.data = so.data.copy(); c.name = name + '_' + n.split('_', 1)[1]; bpy.context.scene.collection.objects.link(c); put(c, '22_EXPORT')
        for v in c.data.vertices: v.co = (v.co + gshift) if isg else Vector(apply('Head', np.array(v.co)) - [0, 0, dz])
        c.parent = rig; c.hide_render = False; c.hide_viewport = False
        for md in c.modifiers:
            if md.type == 'ARMATURE': md.object = rig
        extras.append(c)
    # verify
    b = bmesh.new(); b.from_mesh(m); openb = sum(1 for e in b.edges if e.is_boundary); nm = sum(1 for e in b.edges if len(e.link_faces) > 2)
    quads = sum(len(f.verts) == 4 for f in b.faces); minlen = min(e.calc_length() for e in b.edges)
    vol = sum(f.calc_center_median().dot(f.normal) * f.calc_area() for f in b.faces) / 3; b.free()
    # seam smoothness: longest edge crossing each mixed ring vs the same edges on the two source bodies
    worst = 0.0
    for p, par, sk in TREE:
        if par and src_of(par) != src_of(p):
            rs = set(RINGS[sk])
            for v in RINGS[sk]:
                for j in nb[v]:
                    if j in rs: continue
                    cur = np.linalg.norm(P[v] - P[j]); ref = max(np.linalg.norm(X[src_of(p)][v] - X[src_of(p)][j]), np.linalg.norm(X[src_of(par)][v] - X[src_of(par)][j]))
                    worst = max(worst, cur / max(ref, 1e-6))
    h = float(P[:, 2].max())
    check(name, 'stitched mesh', openb == 0 and nm == 0 and quads == len(FACES) and vol > 0 and minlen > 1e-5,
          f'{NV} vertices, {quads}/{len(FACES)} quads, {openb} open edges, {nm} non-manifold edges, volume {vol:.4f} m3, height {h:.3f} m')
    check(name, 'seam stretch', worst < 2.0, f'edges crossing the mixed seams are at most {worst:.2f}x their length on the source bodies')
    for n_ in notes: print('NOTE |', name, '|', n_, flush=True)
    return ob, rig, extras, notes, h

DEMOS = {
 'MIX_A_AnimeHead_HumanFemaleBody': dict({p: 'female' for p in expected}, Head='anime_female', Hair='AF_Hair_HighPonytail'),
 'MIX_B_MaleTorso_FemaleArms': dict({p: 'male' for p in expected}, Arm_L='female', Arm_R='female', Hand_L='female', Hand_R='female'),
 'MIX_B2_MaleTorso_FemaleArms_Matched': dict({p: 'male' for p in expected}, Arm_L='female', Arm_R='female', Hand_L='female', Hand_R='female', Fit={'Arm_L': 'match', 'Arm_R': 'match', 'Hand_L': 'match', 'Hand_R': 'match'}),
 'MIX_C_AnimeFemaleHead_AnimeMaleBody': dict({p: 'anime_male' for p in expected}, Head='anime_female', Neck='anime_female', Hair='AF_Hair_Bob'),
 'MIX_D_HumanMaleHead_AnimeMaleBody_FemaleLegs': dict({p: 'anime_male' for p in expected}, Head='male', Leg_L='anime_female', Leg_R='anime_female', Foot_L='anime_female', Foot_R='anime_female'),
 'MIX_D2_Same_LegsMatched': dict({p: 'anime_male' for p in expected}, Head='male', Leg_L='anime_female', Leg_R='anime_female', Foot_L='anime_female', Foot_R='anime_female', Fit={'Leg_L': 'match', 'Leg_R': 'match', 'Foot_L': 'match', 'Foot_R': 'match'}),
}
BUILT = {}
for name, rec in DEMOS.items():
    BUILT[name] = assemble(name, rec)
json.dump(REG, open(f'{D}/attachment_registry.json', 'w'), indent=1)
bpy.ops.wm.save_as_mainfile(filepath=f'{D}/KaelModular_Master.blend')

# ---------------------------------------------------------------- renders (plain lit preview materials) + export
def setup(res):
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = 24; sc.cycles.device = 'CPU'
    sc.render.resolution_x = sc.render.resolution_y = res; sc.view_settings.view_transform = 'Standard'
    w = bpy.data.worlds.get('w') or bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.86, 0.86, 0.92, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.75
    cam = bpy.data.objects.get('qc_cam')
    if not cam:
        cam = bpy.data.objects.new('qc_cam', bpy.data.cameras.new('qc_cam')); sc.collection.objects.link(cam)
        sun = bpy.data.objects.new('qc_sun', bpy.data.lights.new('qc_sun', 'SUN')); sun.data.energy = 1.6; sun.data.angle = 0.3; sun.rotation_euler = (math.radians(60), 0, math.radians(-35)); sc.collection.objects.link(sun)
    sc.camera = cam; return sc, cam
def shot(path, target, ang=0.0, ortho=2.0, res=700):
    sc, cam = setup(res); t = Vector(target); d = 6
    cam.location = (t.x + d * math.sin(ang), t.y - d * math.cos(ang), t.z); cam.rotation_euler = (t - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = ortho; sc.render.filepath = path; bpy.ops.render.render(write_still=True)
PV = {}
def preview(mt):
    if mt.name in PV: return PV[mt.name]
    p = bpy.data.materials.new('PV_' + mt.name); p.use_nodes = True; b = p.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = mt.diffuse_color; b.inputs['Roughness'].default_value = 0.65
    img = mt.vrm_addon_extension.mtoon1.pbr_metallic_roughness.base_color_texture.index.source
    if img is not None:
        t = p.node_tree.nodes.new('ShaderNodeTexImage'); t.image = img; p.node_tree.links.new(t.outputs['Color'], b.inputs['Base Color'])
        p.node_tree.links.new(t.outputs['Color'], b.inputs['Emission Color']); b.inputs['Emission Strength'].default_value = 0.35
    PV[mt.name] = p; return p
swapped = []
for o in bpy.data.objects:
    if o.type == 'MESH':
        for s in o.material_slots:
            if s.material and not s.material.name.startswith('PV_'): swapped.append((s, s.material)); s.material = preview(s.material)
def rot(rig, b, axis, deg):
    pb = rig.pose.bones[b]; bpy.context.view_layer.update(); hh = pb.matrix.to_translation()
    pb.matrix = Matrix.Translation(hh) @ Matrix.Rotation(math.radians(deg), 4, axis) @ Matrix.Translation(-hh) @ pb.matrix; bpy.context.view_layer.update()
for name, (ob, rig, extras, notes, h) in BUILT.items():
    vis = {ob.name} | {e.name for e in extras}
    for o in bpy.data.objects:
        if o.type in ('MESH', 'CURVE', 'EMPTY'): o.hide_render = o.name not in vis
    shot(f'{D}/mix_{name}_front.png', (0, 0, h / 2), 0.0, ortho=2.0); shot(f'{D}/mix_{name}_34.png', (0, 0, h / 2), 0.7, ortho=2.0)
    hz = float(rig.data.bones['neck'].head_local.z)
    shot(f'{D}/mix_{name}_neck.png', (0, 0, hz + 0.06), 0.5, ortho=0.6); shot(f'{D}/mix_{name}_shoulder.png', (0.22, 0, hz - 0.08), 0.3, ortho=0.6)
    for b_, ax, dg in (('leftUpperArm', 'Y', 70), ('rightUpperArm', 'Y', -35), ('rightLowerArm', 'Y', -90), ('head', 'Z', 30), ('leftUpperLeg', 'X', -45), ('leftLowerLeg', 'X', 70), ('rightHand', 'Z', 30)):
        rot(rig, b_, ax, dg)
    shot(f'{D}/mix_{name}_pose.png', (0, 0, h / 2), 0.5, ortho=2.0)
    for pb in rig.pose.bones: pb.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
for s, mt in swapped: s.material = mt
import struct
for name, (ob, rig, extras, notes, h) in BUILT.items():
    ext = rig.data.vrm_addon_extension; ext.spec_version = '0.0'; v = ext.vrm0; names = set(b.name for b in rig.data.bones)
    for hb in v.humanoid.human_bones: hb.node.bone_name = hb.bone if hb.bone in names else ''
    v.meta.title = name; v.first_person.first_person_bone.bone_name = 'head'
    keep = [rig, ob] + extras; other = [o for o in bpy.data.objects if o.type in ('MESH', 'ARMATURE', 'CURVE') and o not in keep]
    for o in other: o.hide_set(True); o.hide_viewport = True
    for o in keep: o.hide_viewport = False; o.hide_set(False); o.hide_render = False
    path = f'{D}/export_test_{name}.vrm'; j = {}; tries = 0; want = len([o for o in keep if o.type == 'MESH'])
    while len(j.get('meshes', [])) < want and tries < 3:
        tries += 1
        for o in bpy.data.objects: o.select_set(o in keep)
        bpy.context.view_layer.objects.active = rig; bpy.context.view_layer.update()
        try: bpy.ops.export_scene.vrm(filepath=path, armature_object_name=rig.name, export_invisibles=False, export_only_selections=True)
        except Exception as e: print('export error', str(e)[:200])
        if os.path.exists(path):
            f = open(path, 'rb'); f.read(12); n, _ = struct.unpack('<I4s', f.read(8)); j = json.loads(f.read(n)); f.close()
    hbn = len(j.get('extensions', {}).get('VRM', {}).get('humanoid', {}).get('humanBones', []))
    check(name, 'export', len(j.get('meshes', [])) >= want and hbn >= 50, f'VRM written on attempt {tries}: {len(j.get("meshes", []))} of {want} meshes, {hbn} humanoid bones, {os.path.getsize(path) // 1024 if os.path.exists(path) else 0} KB')
    for o in other: o.hide_set(False); o.hide_viewport = False
json.dump({'recipes': DEMOS, 'notes': {n: b[3] for n, b in BUILT.items()}, **REPORT}, open(f'{D}/parts_report.json', 'w'), indent=1)
