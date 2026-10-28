"""Reimport the optimized public GLB into Blender and render the actual output."""
import bpy
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/spirit-pet/heritage-082'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'quadruped-review.blend'))
for name in ['ShandongTiger_082_Quad','TigerQuadruped']:
    bpy.data.objects.remove(bpy.data.objects[name],do_unlink=True)
# Remove old actions so the newly imported clip names remain unambiguous.
for a in list(bpy.data.actions):
    bpy.data.actions.remove(a)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'public/models/spirit-pet/shandong-tiger-quad.glb'))
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
scene=bpy.context.scene
scene.render.resolution_percentage=100
for track in rig.animation_data.nla_tracks:
    track.mute=True
actions={a.name:a for a in bpy.data.actions}
print('IMPORTED_ACTIONS',list(actions))
for clip,frames in [('walk',[0,8,15,23]),('run',[2,11]),('idle',[0])]:
    action=next(a for n,a in actions.items() if n==clip or n.startswith(clip+'_'))
    rig.animation_data.action=action
    for frame in frames:
        scene.frame_set(frame)
        scene.render.filepath=str(OUT/'preview'/f'final-{clip}-{frame:02}.png')
        bpy.ops.render.render(write_still=True)
print('FINAL_GLB_RENDERED')
