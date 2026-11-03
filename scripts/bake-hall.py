# 主题展厅：Cycles 漫反射烘焙（直射 + 间接 + 底色），与长廊同一 AgX 曝光，导出 GLB 后交给 Node 压缩校验。
# blender --background --factory-startup --python scripts/bake-hall.py -- <earth|thread|carving|lacquer|paper>
# 每个厅的 scripts/build-<id>-hall.py 提供 OUT、SPECIAL、DROP、build_hall()、light_hall()。
import importlib.util
import subprocess
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
HALL = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'earth'
sys.path.insert(0, str(ROOT / 'scripts'))
spec = importlib.util.spec_from_file_location(f'{HALL}_hall_build', ROOT / f'scripts/build-{HALL}-hall.py')
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)
OUT = build.OUT
RESOLUTION = 2048
SAMPLES = 256


def select_only(ob):
    bpy.ops.object.select_all(action='DESELECT')
    ob.hide_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob


def hidden_face(center, normal):
    # 永远看不到的面（贴地底面、贴墙背面、墙体外侧）只给极小的纹素，把分辨率留给可见面
    if center.z < 0.005 and normal.z < -0.5:
        return True
    if center.y < build.DOOR_WALL_Y - 0.02 and normal.y < -0.9:
        return True
    if center.y > build.DEPTH + 0.03 and normal.y > 0.9:
        return True
    if abs(center.x) > build.HALF - 0.002 and normal.x * center.x > 0.9 * abs(center.x):
        return True
    return False


def unwrap(ob):
    select_only(ob)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.004, area_weight=0.0, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    uv = ob.data.uv_layers.active.data
    for face in ob.data.polygons:
        if hidden_face(face.center, face.normal):
            center = sum((uv[i].uv for i in face.loop_indices), Vector((0, 0))) / len(face.loop_indices)
            for i in face.loop_indices:
                uv[i].uv = center + (uv[i].uv - center) * 0.03
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(rotate=True, rotate_method='CARDINAL', margin=0.004)  # 只转 90°，斜放会浪费一半贴图
    bpy.ops.object.mode_set(mode='OBJECT')
    ob.data.uv_layers.active.name = 'BakeUV'


def subset(ob, special):
    mesh = ob.data.copy()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    remove = [f for f in bm.faces if (mesh.materials[f.material_index].name in build.SPECIAL) != special]
    bmesh.ops.delete(bm, geom=remove, context='FACES')
    bm.to_mesh(mesh)
    bm.free()
    temp = bpy.data.objects.new('bake_special' if special else 'bake_surface', mesh)
    ob.users_collection[0].objects.link(temp)
    temp.matrix_world = ob.matrix_world.copy()
    return temp


def unlit_material(name, image):
    # Background 着色器会被 glTF 导出成 KHR_materials_unlit
    mat = bpy.data.materials.new(name + '_baked')
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    output = nodes.new('ShaderNodeOutputMaterial')
    background = nodes.new('ShaderNodeBackground')
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = image
    links.new(tex.outputs['Color'], background.inputs['Color'])
    links.new(background.outputs[0], output.inputs['Surface'])
    return mat


def bake_part(scene, ob, key):
    print('BAKE START:', key, flush=True)
    original_mesh = ob.data
    ob.data = ob.data.copy()
    unwrap(ob)
    surface, special = subset(ob, False), subset(ob, True)
    ob.hide_render = True
    image = bpy.data.images.new(f'{key}_radiance', width=RESOLUTION, height=RESOLUTION, alpha=False, float_buffer=True)
    image.colorspace_settings.name = 'Linear Rec.709'
    for slot in surface.material_slots:
        mat = slot.material.copy()
        slot.material = mat
        tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
        tex.image = image
        mat.node_tree.nodes.active = tex
        tex.select = True
    select_only(surface)
    bake = scene.render.bake
    bake.use_pass_direct = bake.use_pass_indirect = bake.use_pass_color = True
    bake.use_selected_to_active = False
    bake.margin = 16
    bake.margin_type = 'EXTEND'
    bpy.ops.object.bake(type='DIFFUSE')
    # 经过同一条 AgX 曲线与曝光编码成 sRGB，网页端直接当无光照贴图显示
    png = OUT / f'{key}-baked.png'
    image.save_render(str(png), scene=scene)
    display = bpy.data.images.load(str(png), check_existing=False)
    display.name = f'{key}_display_sRGB'
    display.colorspace_settings.name = 'sRGB'
    display.pack()
    material = unlit_material(f'hall_{key}', display)
    old = list(ob.data.materials)
    names = [old[f.material_index].name for f in ob.data.polygons]
    keep = [m for m in old if m.name in build.SPECIAL]
    ob.data.materials.clear()
    ob.data.materials.append(material)
    for mat in keep:
        ob.data.materials.append(mat)
    keep_names = [m.name for m in keep]
    for face, name in zip(ob.data.polygons, names):
        face.material_index = 1 + keep_names.index(name) if name in keep_names else 0
    for temp in (surface, special):
        mesh = temp.data
        bpy.data.objects.remove(temp, do_unlink=True)
        bpy.data.meshes.remove(mesh)
    # 原网格留在场景里继续投影、反光，后面几件仍在同一照明环境中烘焙
    context = bpy.data.objects.new('bake_context_' + key, original_mesh)
    ob.users_collection[0].objects.link(context)
    context.matrix_world = ob.matrix_world.copy()
    print('BAKE DONE:', key, flush=True)
    return ob


def drop_faces(ob, material_names):
    # 网页里换成实时效果的面（如火土厅的窑火后壁）不导出
    mesh = ob.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    names = [m.name for m in mesh.materials]
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if names[f.material_index] in material_names], context='FACES')
    bm.to_mesh(mesh)
    bm.free()


def export(objects):
    bpy.ops.object.select_all(action='DESELECT')
    for key, ob in objects.items():
        drop_faces(ob, build.DROP)
        ob.name = f'hall_{key}'
        ob.hide_render = False
        ob.hide_set(False)
        ob.select_set(True)
    raw = OUT / 'hall-raw.glb'
    bpy.ops.export_scene.gltf(filepath=str(raw), export_format='GLB', use_selection=True,
                              use_active_scene=True, export_yup=True, export_cameras=False, export_lights=False,
                              export_materials='EXPORT', export_image_format='AUTO')
    return raw


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.file_preview_type = 'NONE'
    scene, parts, m = build.build_hall()
    build.light_hall(scene)
    build.setup_cycles(scene, SAMPLES)
    objects = {}
    for key, ob in parts.items():
        objects[key] = bake_part(scene, ob, key)
    # 模板原件改名，避免与导出节点重名
    for ob in list(bpy.data.objects):
        if ob.name.startswith('hall_') and ob not in objects.values():
            ob.name = 'template_' + ob.name
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'baked-hall.blend'))
    export(objects)
    subprocess.run(['node', str(ROOT / 'scripts/prepare-hall.mjs'), HALL], cwd=ROOT, check=True)


if __name__ == '__main__':
    main()
