"""Fifth body for the Part Mixer: the anime female master re-proportioned to match NekoMika.

    python3 build_mika_body.py <kit_dir> <repo_public_dir>

Same topology, same vertex order and same skeleton as every other master, so its parts mix with the rest.
The proportions come from measuring NekoMika.vrm (boots taken off, scaled to 1.65 m): shorter torso, longer and
fuller legs, narrower shoulders and waist, shorter arms, slightly larger head, legs straight down instead of the
MakeHuman A-stance. The shape is made the Blender way: the anime female rig is posed with per-bone scales, the
posed mesh becomes the new rest shape, and the posed bone positions become the new rest skeleton.
Adds MK_Body + MK_Rig to KaelModular_Master.blend and a 'mika_female' body to public/modular/kit.json.
(Re-running export_web_kit.py rewrites kit.json from the four registry masters: run this script again after it.)
"""
import bpy, sys, os, json, base64, math
import numpy as np
from mathutils import Matrix, Vector

D, PUB = sys.argv[-2], sys.argv[-1]; KEY, PRE, LABEL, H = 'mika_female', 'MK_', 'Mika Female', 1.65
bpy.ops.wm.open_mainfile(filepath=f'{D}/KaelModular_Master.blend')
for n in (PRE + 'Body', PRE + 'Rig'):
    if n in bpy.data.objects: bpy.data.objects.remove(bpy.data.objects[n], do_unlink=True)
src = bpy.data.objects['AF_Assembled_AnimeHead']; rig0 = bpy.data.objects['AF_Rig']
rig = rig0.copy(); rig.data = rig0.data.copy(); rig.name = PRE + 'Rig'; rig.data.name = PRE + 'Rig'
body = src.copy(); body.data = src.data.copy(); body.name = PRE + 'Body'; body.data.name = PRE + 'Body'
for c in src.users_collection: c.objects.link(body)
for c in rig0.users_collection: c.objects.link(rig)
for m in body.modifiers:
    if m.type == 'ARMATURE': m.object = rig
if body.parent == rig0: body.parent = rig

# (length along the bone, thickness across it); anything not listed stays 1
S = {'hips': (0.92, 0.96), 'spine': (0.76, 0.86), 'chest': (0.76, 0.90), 'upperChest': (0.76, 0.84), 'neck': (0.80, 0.84), 'head': (1.05, 1.05),
     'Shoulder': (0.80, 0.9), 'UpperArm': (0.85, 0.92), 'LowerArm': (0.85, 0.92), 'UpperLeg': (1.07, 1.06), 'LowerLeg': (1.03, 1.04), 'Foot': (0.97, 0.97), 'Toes': (0.97, 0.97)}
HAND = 0.95; FINGER = (0.9, 1.32); LEG_IN = math.radians(4.2)          # legs brought in from the A-stance
bpy.context.view_layer.objects.active = rig; bpy.ops.object.mode_set(mode='POSE')
for pb in rig.pose.bones:
    pb.bone.inherit_scale = 'NONE'; n = pb.name; side = n.replace('left', '').replace('right', '')
    if n in S: ly, t = S[n]
    elif side in S: ly, t = S[side]
    elif n.endswith('Hand'): ly = t = HAND
    elif n.startswith(('left', 'right')) and any(k in n for k in ('Thumb', 'Index', 'Middle', 'Ring', 'Little')): ly, t = HAND * FINGER[0], HAND * FINGER[1]   # softer, fuller anime fingers
    elif n.endswith('Eye'): ly = t = S['head'][0]
    else: ly = t = 1.0
    pb.scale = (t, ly, t)
bpy.context.view_layer.update()
for s, sign in (('left', 1), ('right', -1)):       # rotate each leg about the front-back axis through its hip joint
    pb = rig.pose.bones[s + 'UpperLeg']; piv = pb.head.copy()
    R = Matrix.Translation(piv) @ Matrix.Rotation(sign * LEG_IN, 4, 'Y') @ Matrix.Translation(-piv)
    pb.matrix = R @ pb.matrix; bpy.context.view_layer.update()
    ft = rig.pose.bones[s + 'Foot']; piv = ft.head.copy()      # keep the sole flat
    R = Matrix.Translation(piv) @ Matrix.Rotation(-sign * LEG_IN, 4, 'Y') @ Matrix.Translation(-piv)
    ft.matrix = R @ ft.matrix; bpy.context.view_layer.update()
for s in ('left', 'right'):                         # fingers together: turn each finger about the vertical so it runs parallel to the middle finger
    md = rig.pose.bones[s + 'MiddleProximal']; mdir = math.atan2(md.y_axis.y, md.y_axis.x)
    for f in ('Index', 'Ring', 'Little'):
        pb = rig.pose.bones[s + f + 'Proximal']; a = mdir - math.atan2(pb.y_axis.y, pb.y_axis.x); a = math.atan2(math.sin(a), math.cos(a)) * 0.9; piv = pb.head.copy()
        pb.matrix = Matrix.Translation(piv) @ Matrix.Rotation(a, 4, 'Z') @ Matrix.Translation(-piv) @ pb.matrix; bpy.context.view_layer.update()
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get(); ev = body.evaluated_get(dg); X = np.array([v.co[:] for v in ev.data.vertices], np.float64)
bones = {pb.name: [np.array(pb.head[:]), np.array(pb.tail[:])] for pb in rig.pose.bones if pb.name != 'root'}
# symmetrise (the pose is mirrored, tiny solver noise is not), ground, and bring to the master height
X0 = np.array([v.co[:] for v in src.data.vertices]); from scipy.spatial import cKDTree
mir = cKDTree(X0).query(X0 * [-1, 1, 1])[1]; ok = np.linalg.norm(X0[mir] * [-1, 1, 1] - X0, axis=1) < 1e-4
Xm = X[mir] * [-1, 1, 1]; X[ok] = (X[ok] + Xm[ok]) / 2
z0 = X[:, 2].min(); g = H / (X[:, 2].max() - z0)
X = (X - [0, 0, z0]) * g; bones = {n: [(h - [0, 0, z0]) * g, (t - [0, 0, z0]) * g] for n, (h, t) in bones.items()}
head_scale = S['head'][0] * g

# bake: posed shape -> rest shape, posed skeleton -> rest skeleton
bpy.ops.pose.select_all(action='SELECT'); bpy.ops.pose.transforms_clear(); bpy.ops.object.mode_set(mode='OBJECT')
for v, p in zip(body.data.vertices, X): v.co = p
if body.data.shape_keys:
    for kb in body.data.shape_keys.key_blocks:
        if kb.name == 'Basis':
            for i, p in enumerate(X): kb.data[i].co = p
bpy.ops.object.mode_set(mode='EDIT')
for eb in rig.data.edit_bones:
    if eb.name in bones:
        roll_axis = eb.z_axis.copy(); eb.use_connect = False; eb.head = Vector(bones[eb.name][0]); eb.tail = Vector(bones[eb.name][1]); eb.align_roll(roll_axis); eb.inherit_scale = 'FULL'
bpy.ops.object.mode_set(mode='OBJECT'); body.data.update()
body['source_body'] = 'anime_female'; body['proportions_from'] = 'NekoMika.vrm'; body['bone_scales'] = json.dumps(S)

# checks, executed here and reported
rep = {'vertices': len(body.data.vertices), 'faces': len(body.data.polygons), 'all_quads': all(len(p.vertices) == 4 for p in body.data.polygons),
       'height': round(float(X[:, 2].max()), 4), 'ground': round(float(X[:, 2].min()), 5), 'centre_x': round(float(X[:, 0].mean()), 5),
       'symmetry_error_mm': round(float(np.abs(X[mir][ok] * [-1, 1, 1] - X[ok]).max() * 1000), 3), 'head_scale_vs_anime_female': round(head_scale, 4)}
dg = bpy.context.evaluated_depsgraph_get(); ev = body.evaluated_get(dg); Xe = np.array([v.co[:] for v in ev.data.vertices])
rep['rest_pose_matches_shape_mm'] = round(float(np.abs(Xe - X).max() * 1000), 4)
def hw(z, lim=0.22): m = (np.abs(X[:, 2] - z) < 0.008) & (np.abs(X[:, 0]) < lim); return round(float(np.abs(X[m, 0]).max()), 3)
b = {n: [round(float(x), 4) for x in v[0]] for n, v in bones.items()}
rep['landmarks'] = {'hip_joint_z': b['leftUpperLeg'][2], 'knee_z': b['leftLowerLeg'][2], 'ankle_z': b['leftFoot'][2], 'shoulder_joint': b['leftUpperArm'], 'wrist_x': b['leftHand'][0], 'neck_z': b['neck'][2], 'head_bone_z': b['head'][2],
                    'hip_x': b['leftUpperLeg'][0], 'knee_x': b['leftLowerLeg'][0], 'ankle_x': b['leftFoot'][0]}
zw = min(np.arange(b['leftUpperLeg'][2] + 0.03, b['leftUpperArm'][2] - 0.08, 0.01), key=lambda z: hw(z))
rep['waist'] = {'z': round(float(zw), 3), 'half_width': hw(zw)}
bpy.ops.wm.save_as_mainfile(filepath=f'{D}/KaelModular_Master.blend')

# web kit
kp = os.path.join(PUB, 'modular', 'kit.json'); kit = json.load(open(kp)); af = kit['bodies']['anime_female']
kit['bodies'][KEY] = {'label': LABEL, 'base': 'female', 'style': 'anime', 'positions': base64.b64encode(X.astype(np.float32).tobytes()).decode(),
                      'bones': {n: [[round(float(x), 5) for x in h], [round(float(x), 5) for x in t]] for n, (h, t) in bones.items()}}
kit['extras'][KEY] = {**kit['extras']['anime_female'], 'from': 'anime_female', 'scale': round(head_scale, 5)}
json.dump(kit, open(kp, 'w'), separators=(',', ':'))
json.dump(rep, open(f'{D}/mika_body_report.json', 'w'), indent=1); print(json.dumps(rep, indent=1))
