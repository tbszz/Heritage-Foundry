"""Render independent limb tests, a contact sheet, and animated review previews."""
import bpy, math, json, sys
from pathlib import Path
from mathutils import Matrix, Quaternion, Vector

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/spirit-pet/heritage-082'
P=OUT/'preview'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'quadruped-review.blend'))
rig=bpy.data.objects['TigerQuadruped']
mesh=bpy.data.objects['ShandongTiger_082_Quad']
scene=bpy.context.scene
scene.render.image_settings.file_format='PNG'
scene.camera.location=(1.5,-2.5,1.0)
scene.camera.rotation_euler=(Vector((0,0,.32))-scene.camera.location).to_track_quat('-Z','Y').to_euler()
rig.animation_data.action=None
for track in rig.animation_data.nla_tracks:
    track.mute=True
for b in rig.pose.bones:
    b.matrix_basis=Matrix.Identity(4)
bpy.context.view_layer.update()

def evaluated():
    obj=mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
    m=obj.to_mesh()
    coords=[v.co.copy() for v in m.vertices]
    obj.to_mesh_clear()
    return coords

baseline=evaluated()
checks=[]
for name,degrees in [('fore.L.upper',15),('fore.R.upper',-15),('hind.L.upper',15)]:
    bone=rig.pose.bones[name]
    # Sagittal rotation about Blender world Y, expressed in this bone's frame.
    axis=bone.bone.matrix_local.to_quaternion().inverted()@Vector((0,1,0))
    bone.rotation_mode='QUATERNION'
    bone.rotation_quaternion=Quaternion(axis,math.radians(degrees))
    bpy.context.view_layer.update()
    coords=evaluated()
    moved=[(a-b).length for a,b in zip(coords,baseline)]
    # Exclude only the rotated chain's skin influences, including descendants.
    affected={mesh.vertex_groups[b.name].index for b in [bone,*bone.children_recursive] if b.name in mesh.vertex_groups}
    isolated=[moved[v.index] for v in mesh.data.vertices if not any(g.group in affected and g.weight>0 for g in v.groups)]
    error=max(isolated)
    assert error<1e-6,(name,error)
    checks.append({'bone':name,'degrees':degrees,'movingVertices':sum(x>1e-5 for x in moved),'unweightedVertices':len(isolated),'maxUnweightedDisplacement':error,'maxDisplacement':max(moved)})
    scene.render.filepath=str(P/('isolation-'+name.replace('.','-')+'.png'))
    bpy.ops.render.render(write_still=True)
    bone.matrix_basis=Matrix.Identity(4)
    bpy.context.view_layer.update()
(OUT/'quad-isolation-validation.json').write_text(json.dumps(checks,indent=2))

# Render whole cycles, not just favorable stills. Pillow assembly is a separate
# CPython step because the bundled Blender Python does not provide Pillow.
scene.render.resolution_percentage=60
for clip,last in [('walk',30),('run',18)]:
    rig.animation_data.action=bpy.data.actions[clip]
    for frame in range(1,last+1):
        scene.frame_set(frame)
        scene.render.filepath=str(P/f'{clip}-sequence'/f'{frame:03}.png')
        bpy.ops.render.render(write_still=True)
print('ISOLATION_CHECKS',json.dumps(checks))
