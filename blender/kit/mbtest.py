import bpy, bmesh
from mathutils import Vector
bpy.ops.wm.read_factory_settings(use_empty=True)
mb = bpy.data.metaballs.new('m'); mb.resolution=0.02; mb.render_resolution=0.02; mb.threshold=0.6
ob = bpy.data.objects.new('m', mb); bpy.context.scene.collection.objects.link(ob)
for st in (2.0,):
  e = mb.elements.new(); e.type='BALL'; e.radius=1.0; e.stiffness=st; e.co=(0,0,0)
dg = bpy.context.evaluated_depsgraph_get(); ev = ob.evaluated_get(dg); me = ev.to_mesh()
xs=[v.co.x for v in me.vertices]; print('ball r=1 st=2 extent', max(xs), len(me.vertices))
e2 = mb.elements[0]; e2.type='ELLIPSOID'; e2.size_x=1; e2.size_y=0.5; e2.size_z=0.3; e2.radius=1
dg = bpy.context.evaluated_depsgraph_get(); ev = ob.evaluated_get(dg); me = ev.to_mesh()
for i in range(3): print('ell', i, max(v.co[i] for v in me.vertices))
