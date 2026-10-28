# 共用模块拼装、布光与出图；可由 bake-corridor-kit.py 导入。
import argparse
import importlib.util
import math
import os
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(os.environ.get('HERITAGE_ROOT', Path(__file__).resolve().parents[1]))
spec = importlib.util.spec_from_file_location('corridor_build', ROOT / 'scripts/build-corridor-kit.py')
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)
OUT = ROOT / 'artifacts/corridor-kit'
BAY, WIDTH, HEIGHT = build.BAY, build.WIDTH, build.HEIGHT
# 与网页七扇门一致；所有中心都在 3 米网格上。
DOORS = {'left': (-6, -24, -42, -57), 'right': (-15, -33, -48, -66)}
Z_START, Z_END = 13.5, -70.5
EXPOSURE = 1.7
VIEW_TRANSFORM = 'AgX'
VIEW_LOOK = 'AgX - Medium High Contrast'
POOL_COLOR = (1.0, 0.46, 0.055)  # 线性 RGB；压低蓝光，抵消冷灰石材与 AgX 的去饱和。


def instance(coll, src, name, loc, rot_z=0.0):
    ob = bpy.data.objects.new(name, src.data)
    ob.location = loc
    ob.rotation_euler = (0, 0, rot_z)
    coll.objects.link(ob)
    return ob


def plane(coll, name, size_x, size_y, loc, mat, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=rot)
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = (size_x, size_y, 1)
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    coll.objects.link(ob)
    ob.data.materials.append(mat)
    return ob


def emit_mat(name, color, strength):
    mat, bsdf = build.principled(name)
    bsdf.inputs['Base Color'].default_value = (0, 0, 0, 1)
    bsdf.inputs['Emission Color'].default_value = color
    bsdf.inputs['Emission Strength'].default_value = strength
    return mat


def add_light(coll, name, kind, loc, color, energy, target=None):
    light = bpy.data.lights.new(name, kind)
    light.color, light.energy = color, energy
    ob = bpy.data.objects.new(name, light)
    ob.location = loc
    if target is not None:
        ob.rotation_euler = (Vector(target) - ob.location).to_track_quat('-Z', 'Y').to_euler()
    coll.objects.link(ob)
    return light


def assemble(scene, kit, m, closed_doors=False):
    coll = build.get_collection(scene, 'preview')
    zs = [Z_START - BAY / 2 - BAY * i for i in range(round((Z_START - Z_END) / BAY))]
    for side, sign, rot in (('left', -1, math.pi / 2), ('right', 1, -math.pi / 2)):
        for z in zs:
            src = kit['portal'] if z in DOORS[side] else kit['wall']
            instance(coll, src, f'{side}_{z:g}', (sign * WIDTH / 2, -z, 0), rot)
    for z in zs:
        instance(coll, kit['ceiling'], f'ceiling_{z:g}', (0, -z, 0))
        instance(coll, kit['floor'], f'floor_{z:g}', (0, -z, 0))
        for x in (-2.5, 2.5):
            light = add_light(coll, f'lantern_{z}_{x}', 'POINT', (x, -z, 3.75), (1.0, 0.8, 0.6), 32)
            light.shadow_soft_size = 0.32
            # 底盖和穗子下方出光；38 度在地面形成约 2.3 米的柔边光池。
            pool = add_light(coll, f'lantern_pool_{z}_{x}', 'SPOT', (x, -z, 3.30),
                             POOL_COLOR, 400, (x * 1.06, -z, 0))
            pool.spot_size, pool.spot_blend = math.radians(38), 0.8
            pool.shadow_soft_size = 0.14
            wall = add_light(coll, f'lantern_wall_{z}_{x}', 'SPOT', (x, -z, 3.75),
                             (1.0, 0.76, 0.5), 240, (math.copysign(WIDTH / 2, x), -z, 3.5))
            wall.spot_size, wall.spot_blend = math.radians(50), 0.85
            wall.shadow_soft_size = 0.22
    plane(coll, 'end_wall', WIDTH, HEIGHT, (0, -Z_END, HEIGHT / 2), m['paper'], rot=(math.pi / 2, 0, 0))
    glow = emit_mat('preview_room_glow', (1.0, 0.7, 0.42, 1), 1.5)
    for side, sign in (('left', -1), ('right', 1)):
        for z in DOORS[side]:
            plane(coll, f'room_{side}_{z}', 2.2, 3.2, (sign * (WIDTH / 2 + 0.5), -z, 1.6), glow,
                  rot=(math.pi / 2, 0, math.pi / 2))
            room = add_light(coll, f'room_light_{side}_{z}', 'AREA', (sign * 5.35, -z, 2.2),
                             (1.0, 0.72, 0.44), 60, (sign * 3, -z, 1))
            room.shape, room.size, room.size_y = 'RECTANGLE', 1.6, 2.6
            spot = add_light(coll, f'spot_{side}_{z}', 'SPOT', (sign * 2, -z, 4.3),
                             (1.0, 0.86, 0.67), 120, (sign * 5, -z, 1.8))
            spot.spot_size, spot.spot_blend = 0.78, 0.85
            if closed_doors:
                # 贴住洞口的临时门板，仅供烘焙遮挡，导出前不选中。
                slab = plane(coll, f'door_slab_{side}_{z}', 2, 3.1, (sign * 5.01, -z, 1.55), m['walnut'],
                             rot=(math.pi / 2, 0, math.pi / 2))
                solid = slab.modifiers.new('door_thickness', 'SOLIDIFY')
                solid.thickness = 0.035
    return coll


def setup_cycles(scene, samples=256):
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'OPTIX'
    prefs.get_devices()
    gpus = [d for d in prefs.devices if d.type == 'OPTIX']
    if not gpus:
        raise RuntimeError('No OPTIX device available')
    for d in prefs.devices:
        d.use = d in gpus
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'GPU'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 8
    scene.cycles.diffuse_bounces = 5
    print('OPTIX:', [d.name for d in gpus], flush=True)


def setup_render(scene, engine='cycles', width=1600, height=900):
    cam_data = bpy.data.cameras.get('preview_cam') or bpy.data.cameras.new('preview_cam')
    cam_data.sensor_fit = 'VERTICAL'
    cam_data.angle_y = math.radians(55)
    cam = bpy.data.objects.get('preview_cam') or bpy.data.objects.new('preview_cam', cam_data)
    if cam.name not in scene.collection.objects:
        scene.collection.objects.link(cam)
    scene.camera = cam
    world = bpy.data.worlds.get('kit_world') or bpy.data.worlds.new('kit_world')
    world.use_nodes = True
    bg = world.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = (0.35, 0.3, 0.24, 1)
    bg.inputs['Strength'].default_value = 0.06
    scene.world = world
    if engine == 'cycles':
        setup_cycles(scene)
    else:
        scene.render.engine = 'BLENDER_EEVEE'
        scene.eevee.taa_render_samples = 64
    scene.render.resolution_x, scene.render.resolution_y = width, height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.image_settings.color_depth = '8'
    scene.view_settings.view_transform = VIEW_TRANSFORM
    scene.view_settings.look = VIEW_LOOK
    scene.view_settings.exposure = EXPOSURE
    scene.view_settings.gamma = 1
    return cam


def render(scene, cam, name, y=-8.0, yaw=0.0):
    cam.location = (0, y, 1.7)
    cam.rotation_euler = (math.radians(90), 0, yaw)
    OUT.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(OUT / name)
    bpy.ops.render.render(write_still=True, scene=scene.name)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--engine', choices=['cycles', 'eevee'], default='cycles')
    parser.add_argument('--output', default='preview-front.png')
    parser.add_argument('--width', type=int, default=1600)
    parser.add_argument('--height', type=int, default=900)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    scene, kit, m = build.build_kit()
    assemble(scene, kit, m)
    cam = setup_render(scene, args.engine, args.width, args.height)
    render(scene, cam, args.output)


if __name__ == '__main__':
    main()
