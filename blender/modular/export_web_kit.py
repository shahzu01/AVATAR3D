"""Kael modular kit, stage 4: export the kit for live part-mixing in Kael Studio (public/modular/).

  python3 export_web_kit.py <kit_dir> <repo_public_dir>
Writes base.vrm (VRM 1.0, female master body on the shared rig), kit.json (positions and bones of every body,
topology, socket rings, part map, garment face lists) and one GLB per head-extras set and hairstyle.
"""
import sys, os, json, base64, re, struct
import numpy as np, bpy, bmesh
from mathutils import Vector
from scipy.spatial import cKDTree
D, PUB = sys.argv[-2], sys.argv[-1]; OUT = os.path.join(PUB, 'modular'); os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=f'{D}/KaelModular_Master.blend')
bpy.ops.preferences.addon_enable(module='io_scene_vrm')
for _o in bpy.data.objects:                         # export from the rest pose: a leftover test pose would be baked into base.vrm's bind
    if _o.type == 'ARMATURE':
        for _pb in _o.pose.bones: _pb.matrix_basis.identity()
bpy.context.view_layer.update()
REG = json.load(open(f'{D}/attachment_registry.json'))
b64 = lambda a: base64.b64encode(np.ascontiguousarray(a).tobytes()).decode()
LABEL = {'female': 'Human Female', 'male': 'Human Male', 'anime_female': 'Anime Female', 'anime_male': 'Anime Male'}
SRC = {k: bpy.data.objects.get(REG[k]['prefix'] + 'Assembled_AnimeHead') or bpy.data.objects[REG[k]['prefix'] + 'Body'] for k in REG}
RIG = {k: bpy.data.objects[REG[k]['prefix'] + 'Rig'] for k in REG}
me0 = SRC['female'].data; NV = len(me0.vertices); QUADS = np.array([list(p.vertices) for p in me0.polygons], np.uint16)
kit = {'version': 1, 'vertexCount': NV, 'quads': b64(QUADS), 'bodies': {}, 'rings': {}, 'tree': [], 'far': {}, 'garments': {}, 'extras': {}}
RINGS = {n: d['vertex_indices'] for n, d in REG['female']['sockets'].items() if d.get('vertex_indices')}
kit['rings'] = RINGS
# part map from the part objects written by build_parts.py
ringv = {v for ids in RINGS.values() for v in ids}; part = np.full(NV, 255, np.uint8); PNAMES = []; pbones = {}
for o in sorted(bpy.data.objects, key=lambda o: o.name):
    if o.name.startswith('F_Part_'):
        p = o['part_type']; PNAMES.append(p); pbones[p] = list(o['bones'])
        for v in o['master_vertex_ids']:
            if v not in ringv: part[v] = len(PNAMES) - 1
assert (part[[v for v in range(NV) if v not in ringv]] != 255).all()
kit['parts'] = PNAMES; kit['partOfVertex'] = b64(part); kit['partBones'] = pbones
kit['tree'] = [['Torso', None, None], ['Neck', 'Torso', 'NECK_TORSO_SOCKET'], ['Head', 'Neck', 'HEAD_NECK_SOCKET']]
for s in 'LR': kit['tree'] += [[f'Arm_{s}', 'Torso', f'SHOULDER_{s}_SOCKET'], [f'Hand_{s}', f'Arm_{s}', f'WRIST_{s}_SOCKET'], [f'Leg_{s}', 'Torso', f'HIP_{s}_SOCKET'], [f'Foot_{s}', f'Leg_{s}', f'ANKLE_{s}_SOCKET']]
kit['far'] = {'Neck': 'HEAD_NECK_SOCKET', 'Arm_L': 'WRIST_L_SOCKET', 'Arm_R': 'WRIST_R_SOCKET', 'Leg_L': 'ANKLE_L_SOCKET', 'Leg_R': 'ANKLE_R_SOCKET'}
for k in REG:
    X = np.array([v.co[:] for v in SRC[k].data.vertices], np.float32)
    kit['bodies'][k] = {'label': LABEL[k], 'base': 'female' if 'female' in k else 'male', 'style': 'anime' if 'anime' in k else 'human', 'positions': b64(X),
                        'bones': {b.name: [[round(x, 5) for x in b.head_local], [round(x, 5) for x in b.tail_local]] for b in RIG[k].data.bones if b.name != 'root'}}
# garments as lists of body faces (so they can be rebuilt on any mixed body)
_e = {}
for i, q in enumerate(QUADS.tolist()):
    for a_, b_ in zip(q, q[1:] + q[:1]): _e.setdefault((min(a_, b_), max(a_, b_)), []).append(i)
FADJ = {i: [] for i in range(len(QUADS))}
for fs in _e.values():
    if len(fs) == 2: FADJ[fs[0]].append(fs[1]); FADJ[fs[1]].append(fs[0])
for base, PRE in (('female', 'F_'), ('male', 'M_')):
    tree = cKDTree(np.array([v.co[:] for v in SRC[base].data.vertices])); kit['garments'][base] = {}
    for o in bpy.data.collections['14_CLOTHING'].objects:
        if not o.name.startswith(PRE) or o.name.split('_')[0] + '_' != PRE: continue
        G = np.array([v.co[:] for v in o.data.vertices]); near = tree.query(G)[1]; vs = set(int(i) for i in near)
        gname = o.name.split('_', 1)[1]
        sel = {i for i, q in enumerate(QUADS.tolist()) if sum(v in vs for v in q) >= 3}
        def grow(sel_, rings):
            for _ in range(rings):
                vv = {v for i in sel_ for v in QUADS[i].tolist()}; sel_ = sel_ | {i for i in range(len(QUADS)) if any(v in vv for v in QUADS[i].tolist())}
            return sel_
        if 'Top' in gname: sel = grow(sel, 2)                                   # fuller cover for the base top
        for _ in range(4):                                                      # tidy the hem: fill notches, drop tabs
            cnt = {i: sum(1 for j in FADJ[i] if j in sel) for i in set(FADJ)}
            sel = {i for i in sel if cnt[i] >= 2} | {i for i in cnt if cnt[i] >= 3}
        kit['garments'][base][gname] = sorted(sel); print('GARMENT', o.name, len(sel), 'body faces')

# ---- static GLBs (head extras, hair): plain materials, no skin
def export_static(objs, path):
    for o in bpy.data.objects: o.select_set(False)
    cps = []
    for so in objs:
        c = so.copy(); c.data = so.data.copy(); bpy.context.scene.collection.objects.link(c); c.parent = None; c.hide_viewport = False; c.hide_render = False; c.hide_set(False)
        for md in list(c.modifiers): c.modifiers.remove(md)
        c.vertex_groups.clear()
        for s in c.material_slots:
            m = s.material; p = bpy.data.materials.new('X_' + m.name); p.use_nodes = True; b = p.node_tree.nodes['Principled BSDF']
            b.inputs['Base Color'].default_value = m.diffuse_color; b.inputs['Roughness'].default_value = 0.7
            img = m.vrm_addon_extension.mtoon1.pbr_metallic_roughness.base_color_texture.index.source
            if img is not None:
                t = p.node_tree.nodes.new('ShaderNodeTexImage'); t.image = img; p.node_tree.links.new(t.outputs['Color'], b.inputs['Base Color'])
            s.material = p
        c.select_set(True); cps.append(c)
    bpy.context.view_layer.objects.active = cps[0]
    if len(cps) > 1: bpy.ops.object.join()
    act = bpy.context.view_layer.objects.active
    for _ in range(3):                    # the first selection-only export of a session can come back empty: verify and retry
        for o in bpy.data.objects: o.select_set(o is act)
        bpy.context.view_layer.objects.active = act; bpy.context.view_layer.update()
        bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_format='GLB', export_apply=False, export_yup=True, export_skins=False, export_animations=False, export_morph=False)
        if os.path.getsize(path) > 2000: break
    bpy.data.objects.remove(bpy.context.view_layer.objects.active)
    return os.path.getsize(path)
slug = lambda n: re.sub(r'[^a-z0-9]+', '_', n.lower()).strip('_')
for k in REG:
    PRE = REG[k]['prefix']; names = [PRE + n for n in ('Eyes_Anime', 'Lashes_Anime', 'Brows_Anime', 'MouthLine_Anime')] if bpy.data.objects.get(PRE + 'Eyes_Anime') else [PRE + 'Eyes']
    sz = export_static([bpy.data.objects[n] for n in names], os.path.join(OUT, f'head_{k}.glb'))
    hairs = []
    for o in sorted(bpy.data.collections['07_HAIR'].objects, key=lambda o: o.name):
        if o.name.startswith(PRE + 'Hair_'):
            f = f'hair_{k}_{slug(o["style"])}.glb'; hs = export_static([o], os.path.join(OUT, f)); hairs.append({'name': o['style'], 'file': f, 'kb': hs // 1024, 'color': [round(c, 3) for c in o.data.materials[0].diffuse_color[:3]]})
    kit['extras'][k] = {'head': f'head_{k}.glb', 'headKb': sz // 1024, 'hair': hairs}
    print('EXTRAS', k, sz // 1024, 'KB', [(h['name'], h['kb']) for h in hairs])

# ---- base.vrm: female master body on the shared rig, VRM 1.0
rig = RIG['female']; body = bpy.data.objects['F_Body']
ext = rig.data.vrm_addon_extension; ext.spec_version = '1.0'
hb = ext.vrm1.humanoid.human_bones; names = {b.name for b in rig.data.bones}; mapped = 0
snake = lambda n: re.sub(r'(?<!^)([A-Z])', r'_\1', n).lower()
for n in names:
    slot = getattr(hb, snake(n), None)
    if slot is not None: slot.node.bone_name = n; mapped += 1
ext.vrm1.meta.vrm_name = 'Kael Modular Base'; ext.vrm1.meta.authors.clear(); a = ext.vrm1.meta.authors.add(); a.value = 'Kael Studio'
while len(body.data.uv_layers): body.data.uv_layers.remove(body.data.uv_layers[0])          # no UV seams: one glTF vertex per master vertex
for g in [g for g in body.vertex_groups if g.name.endswith('_SOCKET')]: body.vertex_groups.remove(g)
for o in list(bpy.data.objects):
    if o not in (rig, body): bpy.data.objects.remove(o)
path = os.path.join(OUT, 'base.vrm'); j = {}; tries = 0
while not j.get('meshes') and tries < 3:
    tries += 1
    for o in bpy.data.objects: o.select_set(True)
    bpy.context.view_layer.objects.active = rig; bpy.context.view_layer.update()
    try: print('export', bpy.ops.export_scene.vrm(filepath=path, armature_object_name=rig.name, ignore_warning=True))
    except Exception as e: print('export error', str(e)[:300])
    if os.path.exists(path):
        f = open(path, 'rb'); f.read(12); n, _ = struct.unpack('<I4s', f.read(8)); j = json.loads(f.read(n)); f.close()
vh = j.get('extensions', {}).get('VRMC_vrm', {}).get('humanoid', {}).get('humanBones', {})
acc = j['accessors'][j['meshes'][0]['primitives'][0]['attributes']['POSITION']] if j.get('meshes') else {}
print('BASEVRM bones mapped in rig', mapped, '| humanBones in file', len(vh), '| meshes', len(j.get('meshes', [])), '| prims', [len(m['primitives']) for m in j.get('meshes', [])], '| position count', acc.get('count'), '| master', NV, '|', os.path.getsize(path) // 1024, 'KB')
json.dump(kit, open(os.path.join(OUT, 'kit.json'), 'w'))
print('KIT', os.path.getsize(os.path.join(OUT, 'kit.json')) // 1024, 'KB; parts', PNAMES)
