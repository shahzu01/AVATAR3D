import sys, bpy, numpy as np
sys.path.insert(0, '/home/claude/kael/fox')
import mh, mhrig, recipes
bpy.ops.wm.read_factory_settings(use_empty=True)
name = sys.argv[1]; out = sys.argv[2]
mus = None
if name.startswith('shape:'):
    tg, hgt = recipes.female_shape(name[6:]); key = 'female'
elif name.startswith('mtype:'):
    tg, hgt, mus = recipes.male_type(name[6:]); key = 'male'
else:
    tg, hgt, key = recipes.get(name), recipes.HEIGHT.get(name), name
ob, ao = mhrig.make(tg, scale_to=hgt, subdiv=int(sys.argv[3]) if len(sys.argv) > 3 else 2,
                    muscle=recipes.MUSCLE[key] if mus is None else mus, garments=recipes.GARMENTS.get(key, ()), female=(key == 'female'))
name = key
for side, sg in (('L', 1), ('R', -1)):
    mhrig.rotate_bone(ao, f'upperarm01.{side}', (0, 1, 0), sg * recipes.ARMS[name])
    mhrig.rotate_bone(ao, f'upperarm01.{side}', (1, 0, 0), 12)
    mhrig.rotate_bone(ao, f'lowerarm01.{side}', (0, 1, 0), sg * 6)
parts = [ob, bpy.data.objects[ob['eyes']]] + [bpy.data.objects[g] for g in ob['garments']]
V = []; T = []; M = []; n = 0
for k, o in enumerate(parts):
    v, f = mhrig.baked(o); t = mh.tris(f) + n; V.append(v); T.append(t); n += len(v)
    M.append(np.full(len(t), 0 if k == 0 else (2 if k == 1 else 1)))
np.savez_compressed(out, v=np.concatenate(V).astype(np.float32), f=np.concatenate(T).astype(np.int32), m=np.concatenate(M).astype(np.int8))
print('height', np.concatenate(V)[:, 2].max())
