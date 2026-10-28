# 中央长廊模块件：3 米墙段、3 米门套、3 米藻井（含宣纸灯笼）。
# 在已连接的 Blender 里 exec 本文件，或 blender --background --python 本文件。
# 坐标约定（导出 glTF +Y up 后与 SketchCorridorScene 的门组一致）：
#   墙/门套：沿 x 铺开，墙面在 y=0，走廊一侧是 -y（three 里是局部 +z），z 向上。
#   藻井：x 横跨走廊 [-5, 5]，y 沿走廊 [-1.5, 1.5]。
import math

import bmesh
import bpy
from mathutils import Vector

BAY = 3.0
HEIGHT = 4.6
WIDTH = 10.0
DOOR_W = 2.0
DOOR_H = 3.1
SLAB = 0.12
KIT_SCENE = 'CorridorKit'


def get_scene():
    # 后台模式没有窗口，直接用当前场景；界面里另开一个场景，不动用户的场景
    if not bpy.context.window:
        bpy.context.scene.name = KIT_SCENE
        return bpy.context.scene
    scene = bpy.data.scenes.get(KIT_SCENE) or bpy.data.scenes.new(KIT_SCENE)
    bpy.context.window.scene = scene
    return scene


def get_collection(scene, name):
    coll = bpy.data.collections.get(name)
    if coll:
        for ob in list(coll.objects):
            bpy.data.objects.remove(ob, do_unlink=True)
    else:
        coll = bpy.data.collections.new(name)
    if coll.name not in scene.collection.children:
        scene.collection.children.link(coll)
    return coll


# ---------- 材质（程序纹理，烘焙时转成贴图） ----------

def principled(name):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    out = nodes.new('ShaderNodeOutputMaterial')
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    mat.node_tree.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat, bsdf


def ramp_color(mat, bsdf, stretch, stops, scale, detail):
    # stretch：各轴的频率倍数，某一轴给小值就拉出顺着该轴的木纹
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    coord = nodes.new('ShaderNodeTexCoord')
    mapping = nodes.new('ShaderNodeMapping')
    mapping.inputs['Scale'].default_value = stretch or (1, 1, 1)
    tex = nodes.new('ShaderNodeTexNoise')
    tex.inputs['Detail'].default_value = detail
    tex.inputs['Roughness'].default_value = 0.62
    tex.inputs['Scale'].default_value = scale
    links.new(coord.outputs['Object'], mapping.inputs['Vector'])
    links.new(mapping.outputs['Vector'], tex.inputs['Vector'])
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[0].color = stops[0]
    ramp.color_ramp.elements[1].position, ramp.color_ramp.elements[1].color = stops[-1]
    for pos, color in stops[1:-1]:
        el = ramp.color_ramp.elements.new(pos)
        el.color = color
    links.new(tex.outputs['Fac'], ramp.inputs['Fac'])
    links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])


def build_materials():
    mats = {}

    mat, bsdf = principled('kit_paper')
    ramp_color(mat, bsdf, None, [
        (0.30, (0.70, 0.62, 0.50, 1)),
        (0.55, (0.79, 0.72, 0.60, 1)),
        (0.80, (0.84, 0.78, 0.67, 1))
    ], scale=9.0, detail=12.0)
    bsdf.inputs['Roughness'].default_value = 0.92
    mats['paper'] = mat

    mat, bsdf = principled('kit_walnut')
    ramp_color(mat, bsdf, (0.08, 1, 1), [
        (0.30, (0.028, 0.014, 0.008, 1)),
        (0.55, (0.045, 0.024, 0.013, 1)),
        (0.75, (0.065, 0.036, 0.02, 1))
    ], scale=28.0, detail=6.0)
    bsdf.inputs['Roughness'].default_value = 0.55
    mats['walnut'] = mat

    mat, bsdf = principled('kit_paper_ceiling')
    ramp_color(mat, bsdf, None, [
        (0.35, (0.36, 0.28, 0.19, 1)),
        (0.70, (0.44, 0.35, 0.24, 1))
    ], scale=9.0, detail=10.0)
    bsdf.inputs['Roughness'].default_value = 0.95
    mats['paper_ceiling'] = mat

    mat, bsdf = principled('kit_carpet')
    ramp_color(mat, bsdf, (1, 0.05, 1), [
        (0.35, (0.085, 0.006, 0.006, 1)),
        (0.70, (0.13, 0.012, 0.009, 1))
    ], scale=60.0, detail=4.0)
    bsdf.inputs['Roughness'].default_value = 1.0
    mats['carpet'] = mat

    mat, bsdf = principled('kit_carpet_border')
    bsdf.inputs['Base Color'].default_value = (0.36, 0.22, 0.07, 1)
    bsdf.inputs['Roughness'].default_value = 1.0
    mats['carpet_border'] = mat

    mat, bsdf = principled('kit_vermilion')
    ramp_color(mat, bsdf, None, [
        (0.35, (0.36, 0.040, 0.020, 1)),
        (0.70, (0.48, 0.065, 0.030, 1))
    ], scale=14.0, detail=6.0)
    bsdf.inputs['Roughness'].default_value = 0.42
    mats['vermilion'] = mat

    # 深灰磨光石材，按 1 米见方分缝
    mat, bsdf = principled('kit_stone')
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    coord = nodes.new('ShaderNodeTexCoord')
    brick = nodes.new('ShaderNodeTexBrick')
    brick.offset = 0.5
    brick.inputs['Scale'].default_value = 1.0
    brick.inputs['Brick Width'].default_value = 1.0
    brick.inputs['Row Height'].default_value = 1.0
    brick.inputs['Mortar Size'].default_value = 0.004
    brick.inputs['Mortar Smooth'].default_value = 0.3
    brick.inputs['Color1'].default_value = (0.15, 0.16, 0.18, 1)
    brick.inputs['Color2'].default_value = (0.19, 0.20, 0.22, 1)
    brick.inputs['Mortar'].default_value = (0.06, 0.055, 0.05, 1)
    links.new(coord.outputs['Object'], brick.inputs['Vector'])
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 5.0
    noise.inputs['Detail'].default_value = 10.0
    links.new(coord.outputs['Object'], noise.inputs['Vector'])
    mix = nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.blend_type = 'OVERLAY'
    mix.inputs['Factor'].default_value = 0.35
    links.new(brick.outputs['Color'], mix.inputs['A'])
    links.new(noise.outputs['Fac'], mix.inputs['B'])
    links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.52
    mats['stone'] = mat

    mat, bsdf = principled('kit_gilt')
    bsdf.inputs['Base Color'].default_value = (0.78, 0.55, 0.24, 1)
    bsdf.inputs['Metallic'].default_value = 1.0
    bsdf.inputs['Roughness'].default_value = 0.34
    mats['gilt'] = mat

    mat, bsdf = principled('kit_glow')
    bsdf.inputs['Base Color'].default_value = (0.95, 0.86, 0.70, 1)
    bsdf.inputs['Roughness'].default_value = 0.9
    bsdf.inputs['Emission Color'].default_value = (0.12, 0.065, 0.025, 1)
    bsdf.inputs['Emission Strength'].default_value = 1.5
    # 纸罩透过灯光，保留相机所见的暖色纸面。
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    ray = nodes.new('ShaderNodeLightPath')
    transparent = nodes.new('ShaderNodeBsdfTransparent')
    mix = nodes.new('ShaderNodeMixShader')
    links.new(ray.outputs['Is Shadow Ray'], mix.inputs[0])
    links.new(bsdf.outputs['BSDF'], mix.inputs[1])
    links.new(transparent.outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], nodes.get('Material Output').inputs['Surface'])
    mats['glow'] = mat
    return mats


# ---------- 几何 ----------

class Parts:
    def __init__(self, coll):
        self.coll = coll
        self.objects = []

    def link(self, me, mat):
        me.materials.append(mat)
        ob = bpy.data.objects.new(me.name, me)
        self.coll.objects.link(ob)
        self.objects.append(ob)
        return ob

    def box(self, x0, x1, y0, y1, z0, z1, mat):
        me = bpy.data.meshes.new('part')
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        center = Vector(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
        size = Vector((x1 - x0, y1 - y0, z1 - z0))
        for v in bm.verts:
            v.co = center + Vector((v.co.x * size.x, v.co.y * size.y, v.co.z * size.z))
        bm.to_mesh(me)
        bm.free()
        return self.link(me, mat)

    def lathe(self, profile, mat, segments=20, cx=0.0, cy=0.0):
        # profile: [(radius, z), ...] 自下而上
        me = bpy.data.meshes.new('part')
        bm = bmesh.new()
        rings = []
        for radius, z in profile:
            ring = []
            for i in range(segments):
                a = 2 * math.pi * i / segments
                ring.append(bm.verts.new((cx + radius * math.cos(a), cy + radius * math.sin(a), z)))
            rings.append(ring)
        for lower, upper in zip(rings, rings[1:]):
            for i in range(segments):
                j = (i + 1) % segments
                face = bm.faces.new((lower[i], lower[j], upper[j], upper[i]))
                face.smooth = True
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
        bm.to_mesh(me)
        bm.free()
        return self.link(me, mat)

    def join(self, name):
        target = self.objects[0]
        with bpy.context.temp_override(active_object=target, object=target,
                                       selected_objects=self.objects,
                                       selected_editable_objects=self.objects):
            bpy.ops.object.join()
        target.name = name
        target.data.name = name
        return target


def wall_trim(p, m, x0, x1):
    # 胡桃木护墙板 + 踢脚 + 腰线鎏金条（门套两侧也用）
    p.box(x0, x1, -0.025, 0, 0, 1.0, m['walnut'])
    p.box(x0, x1, -0.045, 0, 0, 0.18, m['walnut'])
    p.box(x0, x1, -0.055, 0, 0.98, 1.05, m['walnut'])
    p.box(x0, x1, -0.058, -0.04, 1.05, 1.065, m['gilt'])


def cornice(p, m, x0, x1):
    p.box(x0, x1, -0.09, 0, 4.42, HEIGHT, m['walnut'])
    p.box(x0, x1, -0.06, 0, 4.3, 4.42, m['walnut'])
    p.box(x0, x1, -0.064, -0.05, 4.28, 4.3, m['gilt'])


def frieze(p, m, x0, x1):
    # 檐下一圈直棂窗格：上下横档 + 12 厘米一根的竖棂，透出后面的宣纸
    p.box(x0, x1, -0.05, 0, 3.72, 3.78, m['walnut'])
    p.box(x0, x1, -0.05, 0, 4.18, 4.24, m['walnut'])
    count = max(int((x1 - x0) / 0.12), 1)
    step = (x1 - x0) / count
    for i in range(1, count):
        x = x0 + i * step
        p.box(x - 0.015, x + 0.015, -0.04, 0, 3.78, 4.18, m['walnut'])


def pilasters(p, m, depth=0.07):
    half = BAY / 2
    p.box(-half, -half + 0.12, -depth, 0, 0, 4.3, m['walnut'])
    p.box(half - 0.12, half, -depth, 0, 0, 4.3, m['walnut'])


def build_wall(coll, m):
    p = Parts(coll)
    half = BAY / 2
    p.box(-half, half, 0, SLAB, 0, HEIGHT, m['paper'])
    wall_trim(p, m, -half, half)
    # 护墙板上的凸起镶板
    for x0, x1 in ((-1.25, -0.08), (0.08, 1.25)):
        p.box(x0, x1, -0.038, -0.025, 0.28, 0.84, m['walnut'])
    frieze(p, m, -half + 0.12, half - 0.12)
    # 宣纸墙面的细木框（画框挂在 1.5–3.2 米）
    frame = (-1.2, 1.2, 1.3, 3.55)
    bead = 0.035
    p.box(frame[0], frame[1], -0.02, 0, frame[2], frame[2] + bead, m['walnut'])
    p.box(frame[0], frame[1], -0.02, 0, frame[3] - bead, frame[3], m['walnut'])
    p.box(frame[0], frame[0] + bead, -0.02, 0, frame[2], frame[3], m['walnut'])
    p.box(frame[1] - bead, frame[1], -0.02, 0, frame[2], frame[3], m['walnut'])
    # 画框跨格缝悬挂，边柱也要留出 4 厘米净空。
    pilasters(p, m, depth=0.035)
    cornice(p, m, -half, half)
    return p.join('kit_wall')


def build_portal(coll, m):
    p = Parts(coll)
    half = BAY / 2
    door = DOOR_W / 2
    # 门洞周围的墙体
    p.box(-half, -door, 0, SLAB, 0, HEIGHT, m['paper'])
    p.box(door, half, 0, SLAB, 0, HEIGHT, m['paper'])
    p.box(-door, door, 0, SLAB, DOOR_H, HEIGHT, m['paper'])
    wall_trim(p, m, -half, -door)
    wall_trim(p, m, door, half)
    # 窗格只做在门套两侧，中间留给牌匾
    frieze(p, m, -half + 0.12, -door - 0.42)
    frieze(p, m, door + 0.42, half - 0.12)
    # 朱漆门套：立柱包住门洞侧壁，门扇退在门套之后
    jamb = 0.24
    p.box(-door - jamb, -door, -0.11, SLAB, 0, DOOR_H, m['vermilion'])
    p.box(door, door + jamb, -0.11, SLAB, 0, DOOR_H, m['vermilion'])
    p.box(-door - jamb, door + jamb, -0.11, SLAB, DOOR_H, DOOR_H + 0.24, m['vermilion'])
    # 门套正面的鎏金线
    p.box(-door - 0.16, -door - 0.12, -0.118, -0.11, 0, DOOR_H + 0.16, m['gilt'])
    p.box(door + 0.12, door + 0.16, -0.118, -0.11, 0, DOOR_H + 0.16, m['gilt'])
    p.box(-door - 0.16, door + 0.16, -0.118, -0.11, DOOR_H + 0.12, DOOR_H + 0.16, m['gilt'])
    # 门楣上的木挑檐（牌匾挂在它上方，留 2cm 余量）
    p.box(-door - 0.4, door + 0.4, -0.18, 0, DOOR_H + 0.24, DOOR_H + 0.28, m['walnut'])
    # 石门槛
    p.box(-door - 0.1, door + 0.1, -0.16, SLAB, -0.03, 0, m['stone'])
    pilasters(p, m)
    cornice(p, m, -half, half)
    return p.join('kit_portal')


def build_ceiling(coll, m):
    p = Parts(coll)
    half_w, half_b = WIDTH / 2, BAY / 2
    p.box(-half_w, half_w, -half_b, half_b, HEIGHT, HEIGHT + 0.05, m['walnut'])
    # 两端半根横梁，相邻两格拼成一根完整的梁
    p.box(-half_w, half_w, half_b - 0.13, half_b, 4.22, HEIGHT, m['walnut'])
    p.box(-half_w, half_w, -half_b, -half_b + 0.13, 4.22, HEIGHT, m['walnut'])
    # 1.25 米一根纵肋，中间一根横肋，每格 1.25 × 1.37 米
    edges_x = [-half_w + 1.25 * i for i in range(9)]
    for x in edges_x[1:-1]:
        p.box(x - 0.05, x + 0.05, -half_b + 0.13, half_b - 0.13, 4.44, HEIGHT, m['walnut'])
    p.box(-half_w, half_w, -0.05, 0.05, 4.44, HEIGHT, m['walnut'])
    # 每个藻井格里退进去一块暗宣纸板，四周压一圈细木线
    for x0, x1 in zip(edges_x, edges_x[1:]):
        for y0, y1 in ((-half_b + 0.13, -0.05), (0.05, half_b - 0.13)):
            p.box(x0 + 0.14, x1 - 0.14, y0 + 0.14, y1 - 0.14, HEIGHT - 0.01, HEIGHT, m['paper_ceiling'])
            p.box(x0 + 0.1, x1 - 0.1, y0 + 0.1, y0 + 0.14, HEIGHT - 0.04, HEIGHT, m['walnut'])
            p.box(x0 + 0.1, x1 - 0.1, y1 - 0.14, y1 - 0.1, HEIGHT - 0.04, HEIGHT, m['walnut'])
            p.box(x0 + 0.1, x0 + 0.14, y0 + 0.14, y1 - 0.14, HEIGHT - 0.04, HEIGHT, m['walnut'])
            p.box(x1 - 0.14, x1 - 0.1, y0 + 0.14, y1 - 0.14, HEIGHT - 0.04, HEIGHT, m['walnut'])
    # 宣纸灯笼：挂在纵肋与中横肋的交点下
    for x in (-2.5, 2.5):
        body = [(0.13 + 0.1 * math.sin(math.pi * t / 8), 3.52 + 0.46 * t / 8) for t in range(9)]
        p.lathe(body, m['glow'], cx=x)
        p.lathe([(0.12, 3.46), (0.12, 3.52)], m['walnut'], cx=x)
        p.lathe([(0.12, 3.98), (0.12, 4.04)], m['walnut'], cx=x)
        p.lathe([(0.01, 4.04), (0.01, 4.42)], m['gilt'], segments=6, cx=x)
        p.lathe([(0.025, 3.34), (0.012, 3.46)], m['vermilion'], segments=8, cx=x)
    return p.join('kit_ceiling')


def build_floor(coll, m):
    # 地面单独成件，烘焙时能分到一整张贴图（离相机最近，要最清楚）
    p = Parts(coll)
    half_w, half_b = WIDTH / 2, BAY / 2
    p.box(-half_w, half_w, -half_b, half_b, -0.05, 0, m['stone'])
    p.box(-0.8, 0.8, -half_b, half_b, 0, 0.012, m['carpet'])
    for x0, x1 in ((-0.875, -0.8), (0.8, 0.875)):
        p.box(x0, x1, -half_b, half_b, 0, 0.012, m['carpet_border'])
    return p.join('kit_floor')


def build_kit():
    scene = get_scene()
    coll = get_collection(scene, 'kit')
    m = build_materials()
    kit = {
        'wall': build_wall(coll, m),
        'portal': build_portal(coll, m),
        'ceiling': build_ceiling(coll, m),
        'floor': build_floor(coll, m)
    }
    for ob in kit.values():
        ob.hide_render = True
        ob.hide_set(True)
    return scene, kit, m


if __name__ == '__main__':
    build_kit()
