"""Clay turnaround render of a mesh npz. usage: python3 clay.py in.npz outprefix [views] [res]"""
import sys, math, numpy as np, bpy
from mathutils import Vector

inp, outp = sys.argv[1], sys.argv[2]
views = (sys.argv[3] if len(sys.argv) > 3 else 'front,back,side,three').split(',')
res = int(sys.argv[4]) if len(sys.argv) > 4 else 900
focus = sys.argv[5] if len(sys.argv) > 5 else 'full'

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.samples = 12; sc.cycles.use_denoising = True
sc.cycles.device = 'CPU'
sc.render.resolution_x = int(res * 0.62) if focus == 'full' else res; sc.render.resolution_y = res
sc.view_settings.view_transform = 'Standard'

d = np.load(inp)
me = bpy.data.meshes.new('fox'); me.from_pydata(d['v'].tolist(), [], d['f'].tolist()); me.update()
me.shade_smooth() if hasattr(me, 'shade_smooth') else None
ob = bpy.data.objects.new('fox', me); sc.collection.objects.link(ob)
for p in me.polygons: p.use_smooth = True
mat = bpy.data.materials.new('clay'); mat.use_nodes = True
b = mat.node_tree.nodes['Principled BSDF']
b.inputs['Base Color'].default_value = (0.36, 0.35, 0.34, 1); b.inputs['Roughness'].default_value = 0.55
me.materials.append(mat)
if 'm' in d:
    m2 = bpy.data.materials.new('cloth'); m2.use_nodes = True
    b2 = m2.node_tree.nodes['Principled BSDF']; b2.inputs['Base Color'].default_value = (0.035, 0.035, 0.04, 1); b2.inputs['Roughness'].default_value = 0.7
    me.materials.append(m2)
    m3 = bpy.data.materials.new('eye'); m3.use_nodes = True
    b3 = m3.node_tree.nodes['Principled BSDF']; b3.inputs['Base Color'].default_value = (0.36, 0.35, 0.34, 1); b3.inputs['Roughness'].default_value = 0.2
    me.materials.append(m3)
    mm = d['m']; me.polygons.foreach_set('material_index', [int(x) for x in mm])

w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.05, 0.052, 0.058, 1)
w.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0

def light(name, loc, energy, size):
    L = bpy.data.lights.new(name, 'AREA'); L.energy = energy; L.size = size
    o = bpy.data.objects.new(name, L); sc.collection.objects.link(o); o.location = loc
    o.rotation_euler = (Vector((0, 0, 1.1)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    return o
rig = bpy.data.objects.new('rig', None); sc.collection.objects.link(rig)
for o in (light('key', (-2.2, -3.0, 2.8), 220, 2.5), light('fill', (2.8, -2.0, 1.4), 70, 3),
          light('rim', (1.0, 3.2, 2.6), 200, 2)):
    o.parent = rig

cam = bpy.data.cameras.new('cam'); cam.type = 'ORTHO'
co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
targets = {'full': ((0, 0.05, 1.0), 2.15), 'head': ((0, -0.04, 1.76), 0.55), 'torso': ((0, 0, 1.22), 0.8),
           'legs': ((0, 0, 0.45), 1.0), 'hhead': ((0, -0.04, 1.69), 0.3), 'fhead': ((0, -0.035, 1.575), 0.3), 'fbust': ((0, 0.0, 1.47), 0.6), 'feye': ((0.0, -0.06, 1.575), 0.13), 'fchest': ((0.0, -0.1, 1.22), 0.3), 'meye': ((0.0, -0.075, 1.69), 0.14), 'mbust': ((0, -0.01, 1.6), 0.55), 'hand': ((0.37, 0, 0.84), 0.3), 'feet': ((0.12, -0.05, 0.12), 0.35)}
tgt, scale = targets[focus]; cam.ortho_scale = scale
ang = {'front': 0, 'three': 35, 'side': 90, 'back': 180, 'threeback': 145, 'left': -90}
for v in views:
    a = math.radians(ang[v])
    rig.rotation_euler = (0, 0, a)
    p = Vector(tgt) + Vector((math.sin(a) * 6, -math.cos(a) * 6, 0.0))
    co.location = p
    co.rotation_euler = (Vector(tgt) - p).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = f'{outp}_{v}.png'
    bpy.ops.render.render(write_still=True)
print('done')
