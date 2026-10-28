"""Render source landmarks and record the old rig, without modifying inputs."""
import bpy, json, math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/spirit-pet/heritage-082/preview'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT / 'artifacts/spirit-pet/heritage-082/rigged.raw.glb'))
rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
old = {b.name: {'head': list(rig.matrix_world @ b.head_local), 'tail': list(rig.matrix_world @ b.tail_local), 'parent': b.parent.name if b.parent else None} for b in rig.data.bones}
(OUT.parent / 'old-rig-inspection.json').write_text(json.dumps(old, indent=2))
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT / 'public/models/heritage/heritage-082.glb'))
mesh = next(o for o in bpy.data.objects if o.type == 'MESH')
bpy.context.view_layer.objects.active = mesh
mesh.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
coords = [v.co.copy() for v in mesh.data.vertices]
lo = Vector(tuple(min(v[i] for v in coords) for i in range(3)))
hi = Vector(tuple(max(v[i] for v in coords) for i in range(3)))
span = max(hi-lo)
for v in mesh.data.vertices:
    v.co = (v.co - Vector(((lo.x+hi.x)/2, (lo.y+hi.y)/2, lo.z))) / span
coords = [list(v.co) for v in mesh.data.vertices]
(OUT.parent / 'source-vertices.json').write_text(json.dumps(coords))
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = 900
scene.render.resolution_y = 800
scene.render.resolution_percentage = 100
scene.world = bpy.data.worlds.new('Studio')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.65,.65,.65,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value = .7
scene.view_settings.view_transform = 'Standard'
for loc, energy, size in [((2,-3,4),200,4),((-3,1,3),140,3)]:
    bpy.ops.object.light_add(type='AREA', location=loc)
    bpy.context.object.data.energy = energy
    bpy.context.object.data.shape = 'DISK'
    bpy.context.object.data.size = size
for name, pos in [('source-side',(0,-3,.6)),('source-front',(3,0,.6)),('source-top',(0,0,4)),('source-three-quarter',(2,-3,1.5))]:
    bpy.ops.object.camera_add(location=pos)
    cam = bpy.context.object
    cam.rotation_euler = (Vector((0,0,.4))-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = 1.35
    scene.camera = cam
    scene.render.filepath = str(OUT / (name+'.png'))
    bpy.ops.render.render(write_still=True)
print('SOURCE_BOUNDS', list(lo), list(hi), 'NORMALIZED', max(v[2] for v in coords))
