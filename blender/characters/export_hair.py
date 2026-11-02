"""Export every hairstyle as a GLB (Blender coords -> glTF), with spring chains for hair that hangs below the head.
usage: python3 export_hair.py female|male OUTDIR"""
import sys, os, re, math
sys.path.insert(0, '/home/claude/kael/fox')
import numpy as np, bpy
import mh, recipes, hairlib
from mathutils import Vector

G = sys.argv[1]; OUT = sys.argv[2]; os.makedirs(OUT, exist_ok=True)
P, faces, used, Q = mh.build(recipes.get(G)); P = P * (recipes.HEIGHT[G] / P[:, 2].max())
T = mh.tris(faces); head = recipes.headfit(P)
c, R = head
LIST, fn = (hairlib.MALE_STYLES, hairlib.male_style) if G == 'male' else (hairlib.STYLES, hairlib.style)
slug = lambda n: re.sub(r'^_|_$', '', re.sub(r'[^a-z0-9]+', '_', n.lower()))
NCH, NSEG = 10, 4
for nm in LIST:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    V, F = fn(nm, P, T, head)
    V = np.asarray(V, float)
    me = bpy.data.meshes.new('Hair'); me.from_pydata(V.tolist(), [], np.asarray(F).tolist()); me.update()
    for p in me.polygons: p.use_smooth = True
    ob = bpy.data.objects.new('Hair', me); bpy.context.scene.collection.objects.link(ob)
    mat = bpy.data.materials.new('Hair'); me.materials.append(mat)
    zlow = c[2] - 0.06
    hang = V[:, 2] < zlow
    if hang.sum() > 200 and V[:, 2].min() < c[2] - 0.12:
        # chains: NCH azimuth sectors around the head, NSEG segments from zlow down to the lowest hair
        zmin = V[:, 2].min()
        arm_d = bpy.data.armatures.new('HairRig'); arm = bpy.data.objects.new('HairRig', arm_d)
        bpy.context.scene.collection.objects.link(arm); bpy.context.view_layer.objects.active = arm
        bpy.ops.object.mode_set(mode='EDIT')
        root = arm_d.edit_bones.new('hair_root'); root.head = Vector(c); root.tail = Vector(c + np.array([0, 0, 0.05]))
        az = np.arctan2(V[:, 1] - c[1], V[:, 0] - c[0])
        centers = []
        for k in range(NCH):
            a = -math.pi + (k + 0.5) * 2 * math.pi / NCH
            sel = hang & (np.abs(np.angle(np.exp(1j * (az - a)))) < math.pi / NCH)
            if sel.sum() < 30: centers.append(None); continue
            rr = np.median(np.hypot(V[sel, 0] - c[0], V[sel, 1] - c[1]))
            prev = root
            for s in range(NSEG):
                z0 = zlow + (zmin - zlow) * s / NSEG; z1 = zlow + (zmin - zlow) * (s + 1) / NSEG
                b = arm_d.edit_bones.new(f'chain_{k}_{s}')
                b.head = Vector((c[0] + rr * math.cos(a), c[1] + rr * math.sin(a), z0)); b.tail = Vector((c[0] + rr * math.cos(a), c[1] + rr * math.sin(a), z1))
                b.parent = prev; prev = b
            centers.append(a)
        bpy.ops.object.mode_set(mode='OBJECT')
        groups = {b.name: ob.vertex_groups.new(name=b.name) for b in arm_d.bones}
        for i, p in enumerate(V):
            if p[2] >= zlow + 0.02 or not any(x is not None for x in centers):
                groups['hair_root'].add([i], 1.0, 'REPLACE'); continue
            ks = [k for k, a in enumerate(centers) if a is not None]
            d = [abs(np.angle(np.exp(1j * (az[i] - centers[k])))) for k in ks]
            k = ks[int(np.argmin(d))]
            t = np.clip((zlow - p[2]) / max(zlow - zmin, 1e-6), 0, 0.999) * NSEG
            s = int(t); w_root = np.clip((zlow + 0.02 - p[2]) / 0.04, 0, 1)
            groups[f'chain_{k}_{s}'].add([i], float(w_root), 'REPLACE')
            if w_root < 1: groups['hair_root'].add([i], float(1 - w_root), 'REPLACE')
        mo = ob.modifiers.new('Armature', 'ARMATURE'); mo.object = arm; ob.parent = arm
    fn_out = f'{OUT}/{slug(nm)}.glb'
    bpy.ops.export_scene.gltf(filepath=fn_out, export_format='GLB', export_apply=False, export_skins=True,
                              export_animations=False, export_morph=False, export_materials='PLACEHOLDER')
    print(nm, len(V), 'verts', 'chains' if hang.sum() > 200 else '', os.path.getsize(fn_out) // 1024, 'KB', flush=True)
