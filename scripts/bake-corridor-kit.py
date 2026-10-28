# Cycles 漫反射烘焙（直射 + 间接 + 底色），统一 AgX 显示变换后导出。
import argparse
import importlib.util
import json
import sys
import subprocess
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('corridor_preview', ROOT / 'scripts/preview-corridor-kit.py')
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)
OUT = preview.OUT
EXPOSURE = preview.EXPOSURE  # 全部模块共用预览曝光；禁止逐张自动曝光。
RESOLUTION = 2048
SPECIAL = {'kit_gilt', 'kit_glow'}
TARGETS = {'wall': 'left_3', 'portal': 'left_-24', 'ceiling': 'ceiling_3', 'floor': 'floor_3'}


def select_only(ob):
    bpy.ops.object.select_all(action='DESELECT')
    ob.hide_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob


def unwrap(ob):
    select_only(ob)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.008, area_weight=1.0, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    # 背面和内部底面少占纹素，把分辨率留给可见地面。
    if ob.name.startswith('floor'):
        uv = ob.data.uv_layers.active.data
        for face in ob.data.polygons:
            if face.normal.z < 0.5:
                center = sum((uv[i].uv for i in face.loop_indices), Vector((0, 0))) / len(face.loop_indices)
                for i in face.loop_indices:
                    uv[i].uv = center + (uv[i].uv - center) * 0.12
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.uv.pack_islands(rotate=True, margin=0.008)
        bpy.ops.object.mode_set(mode='OBJECT')
    ob.data.uv_layers.active.name = 'BakeUV'


def subset(ob, special):
    mesh = ob.data.copy()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    remove = [f for f in bm.faces if (mesh.materials[f.material_index].name in SPECIAL) != special]
    bmesh.ops.delete(bm, geom=remove, context='FACES')
    bm.to_mesh(mesh)
    bm.free()
    temp = bpy.data.objects.new('bake_special' if special else 'bake_surface', mesh)
    ob.users_collection[0].objects.link(temp)
    temp.matrix_world = ob.matrix_world.copy()
    return temp


def unlit_material(name, image):
    mat = bpy.data.materials.new(name + '_baked')
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    output = nodes.new('ShaderNodeOutputMaterial')
    emission = nodes.new('ShaderNodeBackground')
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = image
    links.new(tex.outputs['Color'], emission.inputs['Color'])
    links.new(emission.outputs[0], output.inputs['Surface'])
    return mat


def bake_module(scene, ob, key):
    print('BAKE START:', key, flush=True)
    original_mesh = ob.data
    ob.data = ob.data.copy()
    unwrap(ob)
    # 原件保留全部 UV；临时烘焙对象只含非金属、非灯纸的面。
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
    scene.render.bake.use_pass_direct = True
    scene.render.bake.use_pass_indirect = True
    scene.render.bake.use_pass_color = True
    scene.render.bake.use_selected_to_active = False
    scene.render.bake.margin = 16
    scene.render.bake.margin_type = 'EXTEND'
    bpy.ops.object.bake(type='DIFFUSE')
    # EXR 留存原始线性浮点，PNG 经过同一 OCIO AgX 曲线、曝光和 sRGB 编码。
    image.filepath_raw = str(OUT / f'{key}-linear.exr')
    image.file_format = 'OPEN_EXR'
    image.save()
    png = OUT / f'{key}-baked.png'
    image.save_render(str(png), scene=scene)
    display = bpy.data.images.load(str(png), check_existing=False)
    display.name = f'{key}_display_sRGB'
    display.colorspace_settings.name = 'sRGB'
    display.pack()
    material = unlit_material(f'kit_{key}', display)
    old = list(ob.data.materials)
    indices = [old[f.material_index].name for f in ob.data.polygons]
    keep = [m for m in old if m.name in SPECIAL]
    ob.data.materials.clear()
    ob.data.materials.append(material)
    for mat in keep:
        ob.data.materials.append(mat)
    for face, name in zip(ob.data.polygons, indices):
        face.material_index = 1 + [m.name for m in keep].index(name) if name in SPECIAL else 0
    for temp in (surface, special):
        mesh = temp.data
        bpy.data.objects.remove(temp, do_unlink=True)
        bpy.data.meshes.remove(mesh)
    context = bpy.data.objects.new('bake_context_' + key, original_mesh)
    ob.users_collection[0].objects.link(context)
    context.matrix_world = ob.matrix_world.copy()
    # 后续各件仍在完全相同的原材质照明环境中烘焙。
    ob.hide_render = True
    print('BAKE DONE:', key, flush=True)
    return ob


def validate_clearances(kit):
    for key in ('wall', 'portal'):
        mesh = kit[key].data
        for face in mesh.polygons:
            points = [mesh.vertices[i].co for i in face.vertices]
            lo = [min(v[i] for v in points) for i in range(3)]
            hi = [max(v[i] for v in points) for i in range(3)]
            if key == 'wall' and hi[2] > 1.5 and lo[2] < 3.2:
                assert lo[1] >= -0.04001, ('frame clearance', lo)
            if key == 'portal':
                if hi[0] > -1.19999 and lo[0] < 1.19999 and hi[2] > 3.40001 and lo[2] < 4.23999:
                    assert lo[1] >= -0.06001, ('sign clearance', lo)
                assert not (hi[0] > -0.99999 and lo[0] < 0.99999 and hi[2] > 0.00001 and lo[2] < 3.09999), ('door opening', lo, hi)
    assert min(v.co.z for v in kit['ceiling'].data.vertices) >= 3.3


def export_modules(scene, objects):
    # 原点和局部轴不变；仅网格被导出，灯光、相机、门板都留在预览集合。
    bpy.ops.object.select_all(action='DESELECT')
    for key, ob in objects.items():
        mat = ob.data.materials[0]
        if not mat.node_tree.nodes.get('Background'):
            tex = next(n for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE')
            replacement = unlit_material('kit_' + key, tex.image)
            ob.data.materials[0] = replacement
        ob.hide_render = False
        ob.name = f'kit_{key}'
        ob.location = (0, 0, 0)
        ob.rotation_euler = (0, 0, 0)
        ob.select_set(True)
    glow = bpy.data.materials['kit_glow']
    nodes = glow.node_tree.nodes
    glow.node_tree.links.new(nodes.get('Principled BSDF').outputs['BSDF'], nodes.get('Material Output').inputs['Surface'])
    raw = OUT / 'corridor-kit-raw.glb'
    bpy.ops.export_scene.gltf(filepath=str(raw), export_format='GLB', use_selection=True,
                              use_active_scene=True, export_yup=True, export_cameras=False, export_lights=False,
                              export_materials='EXPORT', export_image_format='AUTO', export_extras=True)
    # 重新导入原始导出文件，再由 Node 验证压缩后的交付文件。
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for old in list(bpy.data.objects):
        bpy.data.objects.remove(old, do_unlink=True)
    bpy.ops.import_scene.gltf(filepath=str(raw))
    nodes_report = []
    for ob in bpy.context.scene.objects:
        assert ob.name in {f'kit_{key}' for key in TARGETS}, ob.name
        assert ob.location.length < 1e-6
        size = list(ob.dimensions)
        nodes_report.append({'name': ob.name, 'blenderDimensions': size})
    assert len(nodes_report) == 4
    report = {'exposureEV': EXPOSURE, 'viewTransform': preview.VIEW_TRANSFORM,
              'curve': preview.VIEW_LOOK, 'poolColorLinearRGB': preview.POOL_COLOR, 'output': 'sRGB',
              'resolution': RESOLUTION, 'samples': 256, 'engine': 'Cycles OPTIX',
              'passes': ['DIFFUSE_DIRECT', 'DIFFUSE_INDIRECT', 'DIFFUSE_COLOR'],
              'targets': TARGETS, 'rawReimport': nodes_report}
    (OUT / 'bake-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--reuse', action='store_true', help='Reuse baked blend for export only')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    OUT.mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.file_preview_type = 'NONE'
    if args.reuse:
        bpy.ops.wm.open_mainfile(filepath=str(OUT / 'baked-kit.blend'))
        scene = bpy.context.scene
        objects = {k: bpy.data.objects['baked_' + k] for k in TARGETS}
    else:
        scene, kit, m = preview.build.build_kit()
        validate_clearances(kit)
        coll = preview.assemble(scene, kit, m, closed_doors=True)
        preview.setup_render(scene)
        objects = {}
        for key, name in TARGETS.items():
            ob = coll.objects[name]
            # 至少前后各两格邻居；墙段两侧均无门。
            z = -ob.location.y
            assert preview.Z_END + 7.5 <= z <= preview.Z_START - 7.5
            if key == 'wall':
                assert all(z not in zs for zs in preview.DOORS.values())
            objects[key] = bake_module(scene, ob, key)
            objects[key].name = 'baked_' + key
            bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'baked-kit.blend'))
    # 隐藏模板原件，避免与导出节点重名。
    for ob in list(bpy.data.objects):
        if ob.name.startswith('kit_'):
            ob.name = 'template_' + ob.name
    export_modules(scene, objects)
    subprocess.run(['node', str(ROOT / 'scripts/prepare-corridor-kit.mjs')], cwd=ROOT, check=True)


if __name__ == '__main__':
    main()
