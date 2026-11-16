"""Kael modular kit, stage 2b: hair parts for the anime heads, generated with ../characters/hairlib.py.

  python3 build_anime_hair.py <kit_dir>
Hair is fitted to the assembled anime head, stored in 07_HAIR as one object per style, skinned to the head bone.
"""
import sys, os, json, math, re
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(HERE, '..', 'characters'))
import numpy as np, bpy
from mathutils import Vector
import mh, recipes, hairlib
D = sys.argv[-1]
bpy.ops.wm.open_mainfile(filepath=f'{D}/KaelModular_Master.blend')
bpy.ops.preferences.addon_enable(module='io_scene_vrm')
REG = json.load(open(f'{D}/attachment_registry.json')); DIMS = json.load(open(os.path.join(HERE, 'master_dimensions.json')))
FCOL = [(0.36, 0.22, 0.16), (0.16, 0.12, 0.20), (0.85, 0.55, 0.62), (0.80, 0.62, 0.30), (0.20, 0.30, 0.45)]
ONLY = os.environ.get('KAEL_HAIR_ONLY', '')
PLAN = {'anime_female': (hairlib.style, [(n, FCOL[i % 5]) for i, n in enumerate(hairlib.STYLES)]),
        'anime_male': (hairlib.male_style, [(n, FCOL[(i + 1) % 5]) for i, n in enumerate(hairlib.MALE_STYLES)])}
if ONLY: PLAN = {k: v for k, v in PLAN.items() if k == ONLY}
KEEP = json.loads(os.environ.get('KAEL_HAIR_KEEP', 'null'))
if KEEP: PLAN = {k: (fn, [(n, c) for n, c in st if n in KEEP.get(k, [])]) for k, (fn, st) in PLAN.items()}
FULL = bool(KEEP)
slug = lambda n: re.sub(r'[^A-Za-z0-9]+', '', n.title())
def put(ob, cname):
    for c in list(ob.users_collection): c.objects.unlink(ob)
    bpy.data.collections[cname].objects.link(ob)
def mtoon(name, rgb):
    if bpy.data.materials.get(name): return bpy.data.materials[name]
    m = bpy.data.materials.new(name); m.use_nodes = True; m.diffuse_color = (*rgb, 1); m.use_fake_user = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*rgb, 1)
    mt = m.vrm_addon_extension.mtoon1; mt.enabled = True; mt.pbr_metallic_roughness.base_color_factor = (*rgb, 1)
    x = mt.extensions.vrmc_materials_mtoon; x.shade_color_factor = tuple(c * 0.62 for c in rgb); x.shading_toony_factor = 0.85
    return m
RESULT = {}
for key, (fn, styles) in PLAN.items():
    PRE = REG[key]['prefix']; rig = bpy.data.objects[PRE + 'Rig']; asm = bpy.data.objects[PRE + 'Assembled_AnimeHead']
    P = np.array([v.co[:] for v in asm.data.vertices]); faces = [list(p.vertices) for p in asm.data.polygons]; T = mh.tris(faces)
    hk = float(DIMS[key].get('head_scale', 1.0)); c0, R0 = recipes.headfit(P)
    Pn = c0 + (P - c0) / hk                               # the library is tuned for a realistic head size: fit there, scale the hair back up
    head = recipes.headfit(Pn)
    # scalp base: a thin hair-coloured layer over the scalp so no style leaves bare skin at the temples or nape
    Nrm = np.array([v.normal[:] for v in asm.data.vertices]); fr = -(P[:, 1] - c0[1]) / R0[1]
    hl = c0[2] + np.interp(fr, [-1.2, -1.0, -0.4, 0.0, 0.35, 0.8, 1.2], [-0.085, -0.080, -0.050, -0.030, 0.004, 0.046, 0.058]) * hk
    incap = (P[:, 2] > hl) & (P[:, 2] > c0[2] - 0.1 * hk) & (np.abs(P[:, 0]) < R0[0] * 1.04)
    cf = [f for f in faces if all(incap[i] for i in f)]; cu = sorted({i for f in cf for i in f}); cm = {v: k for k, v in enumerate(cu)}
    CAPV = P[cu] + Nrm[cu] * 0.0022; CAPF = [[cm[i] for i in f] for f in cf]
    for nm, rgb in styles:
        oname = f'{PRE}Hair_{slug(nm)}'
        if bpy.data.objects.get(oname): bpy.data.objects.remove(bpy.data.objects[oname])
        V, F = fn(nm, Pn, T, head); V = c0 + (np.asarray(V, float) - c0) * hk; F = [list(f) for f in np.asarray(F).tolist()]
        V = np.vstack([V, CAPV]); F = F + [[i + len(V) - len(CAPV) for i in f] for f in CAPF]
        me = bpy.data.meshes.new(oname); me.from_pydata(V.tolist(), [], F); me.update()
        for p in me.polygons: p.use_smooth = True
        ob = bpy.data.objects.new(oname, me); bpy.context.scene.collection.objects.link(ob); put(ob, '07_HAIR')
        me.materials.append(mtoon(f'MAT_Hair_{slug(nm)}', rgb))
        ob.vertex_groups.new(name='head').add(list(range(len(V))), 1.0, 'REPLACE')
        ob.parent = rig; ob.modifiers.new('Armature', 'ARMATURE').object = rig
        ob['part_type'] = 'HAIR'; ob['attach_bone'] = 'head'; ob['style'] = nm
        tris = sum(len(p.vertices) - 2 for p in me.polygons)
        RESULT[oname] = {'style': nm, 'vertices': len(V), 'triangles': tris, 'lowest_z': round(float(V[:, 2].min()), 3)}
        print('HAIR', oname, len(V), 'verts', tris, 'tris', flush=True)
bpy.ops.wm.save_as_mainfile(filepath=f'{D}/KaelModular_Master.blend')

# ---- preview renders with plain lit materials (the toon shader renders flat in this offline renderer)
def setup(res):
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = 32 if FULL else 12; sc.cycles.device = 'CPU'
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
def preview(m):
    if m.name in PV: return PV[m.name]
    p = bpy.data.materials.new('PV_' + m.name); p.use_nodes = True; b = p.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = m.diffuse_color; b.inputs['Roughness'].default_value = 0.65
    img = m.vrm_addon_extension.mtoon1.pbr_metallic_roughness.base_color_texture.index.source
    if img is not None:
        t = p.node_tree.nodes.new('ShaderNodeTexImage'); t.image = img; p.node_tree.links.new(t.outputs['Color'], b.inputs['Base Color'])
        b.inputs['Emission Color'].default_value = (1, 1, 1, 1); p.node_tree.links.new(t.outputs['Color'], b.inputs['Emission Color']); b.inputs['Emission Strength'].default_value = 0.35
    PV[m.name] = p; return p
swapped = []
for o in bpy.data.objects:
    if o.type == 'MESH':
        for s in o.material_slots:
            if s.material and not s.material.name.startswith('PV_'): swapped.append((s, s.material)); s.material = preview(s.material)
for key, (fn, styles) in PLAN.items():
    PRE = REG[key]['prefix']; rig = bpy.data.objects[PRE + 'Rig']; H = REG[key]['target_height']
    base = {PRE + n for n in ('Assembled_AnimeHead', 'Eyes_Anime', 'Lashes_Anime', 'Brows_Anime', 'MouthLine_Anime', 'BaseTop', 'BaseShorts')}
    hz = float(rig.data.bones['head'].head_local.z) + 0.085
    for nm, rgb in styles:
        hn = f'{PRE}Hair_{slug(nm)}'
        for o in bpy.data.objects:
            if o.type in ('MESH', 'CURVE', 'EMPTY'): o.hide_render = o.name not in base and o.name != hn
        views = (('front', 0.0), ('34', 0.6), ('side', math.pi / 2), ('back', math.pi)) if FULL else (('front', 0.0), ('34', 0.6), ('back', math.pi))
        for tag, ang in views:
            shot(f'{D}/hair_{key}_{slug(nm)}_{tag}.png', (0, 0, hz - 0.03), ang, ortho=0.5, res=700 if FULL else 380)
        if FULL: shot(f'{D}/hair_{key}_{slug(nm)}_full.png', (0, 0, H / 2), 0.0, ortho=2.0)
for s, m in swapped: s.material = m
json.dump(RESULT, open(f'{D}/anime_hair_report{"_" + ONLY if ONLY else ""}.json', 'w'), indent=1)
