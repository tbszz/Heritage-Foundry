# 主题展厅共用的 Blender 工具：程序材质、零件堆叠、布光、Cycles 设置与预览出图。
# 各厅的 build-<id>-hall.py 都从这里取件，bake-hall.py 统一烘焙。
# 坐标约定：Blender 里 x 为横向（面朝厅内右手 +x），y 为进深（门洞墙内侧 y=0.16，尽头墙 y=25），z 向上。
# 导出 glTF（+Y up）后 (x, y, z) -> three 局部 (x, z, -y)，正好是 museumHalls.js 里 hallRoot 的局部坐标。
import math
import os
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

ROOT = Path(os.environ.get('HERITAGE_ROOT', Path(__file__).resolve().parents[1]))

# 与 SketchCorridorScene.ROOM 一致
WIDTH, DEPTH, HEIGHT = 12.0, 25.0, 4.6
HALF = WIDTH / 2
DOOR_W, DOOR_H = 2.24, 3.2           # 门洞（含门套余量）
DOOR_WALL_Y = 0.16                    # 走廊墙模块厚 0.12m，门洞墙贴在它背后
FIRST_U, SPACING, PER_SIDE = 4.0, 2.0, 10
EYE = 1.7

EXPOSURE = 1.7                        # 与长廊烘焙同一曝光与显示变换，两边亮度衔接
VIEW_TRANSFORM = 'AgX'
VIEW_LOOK = 'AgX - Medium High Contrast'


def get_scene(name):
    if not bpy.context.window:
        bpy.context.scene.name = name
        return bpy.context.scene
    scene = bpy.data.scenes.get(name) or bpy.data.scenes.new(name)
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


# ---------- 材质 ----------

def inp(node, ident):
    # Mix 节点有同名的 float / vector / color 插槽，按 identifier 取才稳
    return next(s for s in node.inputs if s.identifier == ident or s.name == ident)


def out(node, ident):
    return next(s for s in node.outputs if s.identifier == ident or s.name == ident)


def principled(name):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    output = nodes.new('ShaderNodeOutputMaterial')
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    mat.node_tree.links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])
    return mat, bsdf


def math_node(nt, op, a, b=None):
    n = nt.nodes.new('ShaderNodeMath')
    n.operation = op
    for i, v in enumerate((a, b)):
        if v is None:
            continue
        if isinstance(v, (int, float)):
            n.inputs[i].default_value = v
        else:
            nt.links.new(v, n.inputs[i])
    return n.outputs[0]


def map_range(nt, value, a, b, c=0.0, d=1.0):
    n = nt.nodes.new('ShaderNodeMapRange')
    nt.links.new(value, n.inputs['Value'])
    n.inputs['From Min'].default_value, n.inputs['From Max'].default_value = a, b
    n.inputs['To Min'].default_value, n.inputs['To Max'].default_value = c, d
    return n.outputs['Result']


def mix_color(nt, blend, factor, a, b):
    n = nt.nodes.new('ShaderNodeMix')
    n.data_type = 'RGBA'
    n.blend_type = blend
    for ident, v in (('Factor_Float', factor), ('A_Color', a), ('B_Color', b)):
        if isinstance(v, (int, float)):
            inp(n, ident).default_value = v
        elif isinstance(v, tuple):
            inp(n, ident).default_value = v
        else:
            nt.links.new(v, inp(n, ident))
    return out(n, 'Result_Color')


def surface_coords(nt, vault=False):
    # 三向投影：按面朝向挑两根轴做纹理坐标，墙、券、台子都不用单独展 UV。
    # vault=True 时朝上/下的面让纹理长边顺着进深（筒拱顺砌、地板顺铺）。
    coord = nt.nodes.new('ShaderNodeTexCoord')
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    pos = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(coord.outputs['Object'], pos.inputs[0])
    nrm = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(geo.outputs['True Normal'], nrm.inputs[0])
    x, y, z = pos.outputs['X'], pos.outputs['Y'], pos.outputs['Z']
    ax = math_node(nt, 'ABSOLUTE', nrm.outputs['X'])
    az = math_node(nt, 'ABSOLUTE', nrm.outputs['Z'])
    wx = math_node(nt, 'GREATER_THAN', ax, 0.6)
    wz = math_node(nt, 'GREATER_THAN', az, 0.6)

    def combine(a, b):
        n = nt.nodes.new('ShaderNodeCombineXYZ')
        nt.links.new(a, n.inputs[0])
        nt.links.new(b, n.inputs[1])
        return n.outputs[0]

    def blend(vec_a, vec_b, weight):
        n = nt.nodes.new('ShaderNodeMix')
        n.data_type = 'VECTOR'
        nt.links.new(weight, inp(n, 'Factor_Float'))
        nt.links.new(vec_a, inp(n, 'A_Vector'))
        nt.links.new(vec_b, inp(n, 'B_Vector'))
        return out(n, 'Result_Vector')

    side = blend(combine(x, z), combine(y, z), wx)        # 立面：朝 ±y 用 (x,z)，朝 ±x 用 (y,z)
    top = combine(y, x) if vault else combine(x, y)
    return blend(side, top, wz), pos


def noise_shade(nt, vec, scale, mottle, detail=10.0):
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = scale
    noise.inputs['Detail'].default_value = detail
    noise.inputs['Roughness'].default_value = 0.6
    nt.links.new(vec, noise.inputs['Vector'])
    return map_range(nt, noise.outputs['Fac'], 0.3, 0.7, 1 - mottle, 1 + mottle * 0.5), noise


def add_bump(nt, bsdf, height, strength, distance=0.01, invert=False):
    b = nt.nodes.new('ShaderNodeBump')
    b.invert = invert
    b.inputs['Strength'].default_value = strength
    b.inputs['Distance'].default_value = distance
    nt.links.new(height, b.inputs['Height'])
    nt.links.new(b.outputs['Normal'], bsdf.inputs['Normal'])


def tile_material(name, c1, c2, mortar, size=(0.24, 0.062), mortar_size=0.007, offset=0.5,
                  roughness=0.9, mottle=0.35, bump=0.55, vault=False):
    # 砖、方砖、石板：Brick 纹理 + 斑驳 + 缝隙凹凸
    mat, bsdf = principled(name)
    nt = mat.node_tree
    vec, _ = surface_coords(nt, vault)
    brick = nt.nodes.new('ShaderNodeTexBrick')
    brick.offset = offset
    brick.inputs['Scale'].default_value = 1.0
    brick.inputs['Brick Width'].default_value = size[0]
    brick.inputs['Row Height'].default_value = size[1]
    brick.inputs['Mortar Size'].default_value = mortar_size
    brick.inputs['Mortar Smooth'].default_value = 0.25
    brick.inputs['Color1'].default_value = (*c1, 1)
    brick.inputs['Color2'].default_value = (*c2, 1)
    brick.inputs['Mortar'].default_value = (*mortar, 1)
    nt.links.new(vec, brick.inputs['Vector'])
    shade, noise = noise_shade(nt, vec, 7.0, mottle, 12.0)
    nt.links.new(mix_color(nt, 'MULTIPLY', 1.0, brick.outputs['Color'], shade), bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = roughness
    if bump:
        height = math_node(nt, 'ADD', brick.outputs['Fac'], math_node(nt, 'MULTIPLY', noise.outputs['Fac'], 0.25))
        add_bump(nt, bsdf, height, bump, 0.012, invert=True)
    return mat


def clay_material(name, base, mottle=0.4, scale=9.0, roughness=0.88, bump=0.3, speckle=None):
    # 素色面：泥、灰、漆、布底——底色乘上大小两层噪声
    mat, bsdf = principled(name)
    nt = mat.node_tree
    vec, _ = surface_coords(nt)
    shade, noise = noise_shade(nt, vec, scale, mottle)
    color = mix_color(nt, 'MULTIPLY', 1.0, (*base, 1), shade)
    if speckle:
        dots = nt.nodes.new('ShaderNodeTexVoronoi')
        dots.inputs['Scale'].default_value = 40.0
        nt.links.new(vec, dots.inputs['Vector'])
        mask = map_range(nt, dots.outputs['Distance'], 0.05, 0.12, 1.0, 0.0)
        color = mix_color(nt, 'MIX', mask, color, (*speckle, 1))
    nt.links.new(color, bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = roughness
    if bump:
        add_bump(nt, bsdf, noise.outputs['Fac'], bump)
    return mat


def plaster_material(name, base, roughness=0.95):
    # 白灰墙：极淡的大块水渍 + 细砂
    mat = clay_material(name, base, mottle=0.12, scale=1.6, roughness=roughness, bump=0.08)
    return mat


def wood_material(name, dark, light, roughness=0.6, along='y'):
    # 木纹沿 along 轴拉长；三向投影坐标里 'y' 指纹理第二根轴
    mat, bsdf = principled(name)
    nt = mat.node_tree
    vec, _ = surface_coords(nt, vault=along == 'depth')
    stretch = nt.nodes.new('ShaderNodeMapping')
    stretch.inputs['Scale'].default_value = (0.06, 1.0, 1.0) if along == 'depth' else (1.0, 0.06, 1.0)
    nt.links.new(vec, stretch.inputs['Vector'])
    grain = nt.nodes.new('ShaderNodeTexNoise')
    grain.inputs['Scale'].default_value = 24.0
    grain.inputs['Detail'].default_value = 8.0
    nt.links.new(stretch.outputs[0], grain.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[0].color = 0.35, (*dark, 1)
    ramp.color_ramp.elements[1].position, ramp.color_ramp.elements[1].color = 0.7, (*light, 1)
    nt.links.new(grain.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = roughness
    return mat


def plank_material(name, dark, light, width=0.22, roughness=0.7):
    # 木地板：顺进深铺的长条板，板与板之间深缝、每块深浅不一
    mat, bsdf = principled(name)
    nt = mat.node_tree
    vec, _ = surface_coords(nt, vault=True)
    brick = nt.nodes.new('ShaderNodeTexBrick')
    brick.offset = 0.37
    brick.inputs['Scale'].default_value = 1.0
    brick.inputs['Brick Width'].default_value = 1.8
    brick.inputs['Row Height'].default_value = width
    brick.inputs['Mortar Size'].default_value = 0.004
    brick.inputs['Color1'].default_value = (1, 1, 1, 1)
    brick.inputs['Color2'].default_value = (0.72, 0.72, 0.72, 1)
    brick.inputs['Mortar'].default_value = (0.25, 0.25, 0.25, 1)
    nt.links.new(vec, brick.inputs['Vector'])
    stretch = nt.nodes.new('ShaderNodeMapping')
    stretch.inputs['Scale'].default_value = (0.08, 1.0, 1.0)
    nt.links.new(vec, stretch.inputs['Vector'])
    grain = nt.nodes.new('ShaderNodeTexNoise')
    grain.inputs['Scale'].default_value = 30.0
    grain.inputs['Detail'].default_value = 6.0
    nt.links.new(stretch.outputs[0], grain.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[0].color = 0.3, (*dark, 1)
    ramp.color_ramp.elements[1].position, ramp.color_ramp.elements[1].color = 0.75, (*light, 1)
    nt.links.new(grain.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(mix_color(nt, 'MULTIPLY', 1.0, ramp.outputs['Color'], brick.outputs['Color']), bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = roughness
    add_bump(nt, bsdf, brick.outputs['Fac'], 0.4, 0.006, invert=True)
    return mat


def stripe_material(name, base, dark, freq=40.0, axis=0, roughness=0.55, nodes=0.0):
    # 竹片、竹帘、织物经线：沿纹理坐标第 axis 根轴的细条纹；nodes>0 时每隔 1/nodes 米加一道竹节
    mat, bsdf = principled(name)
    nt = mat.node_tree
    vec, _ = surface_coords(nt)
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(vec, sep.inputs[0])
    across, along = (sep.outputs['X'], sep.outputs['Y']) if axis == 0 else (sep.outputs['Y'], sep.outputs['X'])
    wave = math_node(nt, 'SINE', math_node(nt, 'MULTIPLY', across, freq * 2 * math.pi))
    stripes = map_range(nt, wave, -1.0, 1.0, 0.0, 1.0)
    shade, _ = noise_shade(nt, vec, 3.0, 0.25)
    color = mix_color(nt, 'MIX', math_node(nt, 'POWER', stripes, 3.0), (*base, 1), (*dark, 1))
    color = mix_color(nt, 'MULTIPLY', 1.0, color, shade)
    if nodes:
        ring = math_node(nt, 'FRACT', math_node(nt, 'MULTIPLY', along, nodes))
        band = math_node(nt, 'LESS_THAN', ring, 0.035)
        color = mix_color(nt, 'MIX', math_node(nt, 'MULTIPLY', band, 0.7), color, (*dark, 1))
    nt.links.new(color, bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = roughness
    add_bump(nt, bsdf, stripes, 0.25, 0.004)
    return mat


def cloth_material(name, base, pattern, scale=6.0, roughness=0.85, motif='wave'):
    # 丝绸横幅、幕布、锦缎：底色上压一层暗纹（wave 水波 / voronoi 团花）
    mat, bsdf = principled(name)
    nt = mat.node_tree
    vec, _ = surface_coords(nt)
    if motif == 'voronoi':
        tex = nt.nodes.new('ShaderNodeTexVoronoi')
        tex.inputs['Scale'].default_value = scale
        nt.links.new(vec, tex.inputs['Vector'])
        mask = map_range(nt, tex.outputs['Distance'], 0.18, 0.26, 1.0, 0.0)
    else:
        tex = nt.nodes.new('ShaderNodeTexWave')
        tex.inputs['Scale'].default_value = scale
        tex.inputs['Distortion'].default_value = 6.0
        tex.inputs['Detail'].default_value = 2.0
        nt.links.new(vec, tex.inputs['Vector'])
        mask = map_range(nt, tex.outputs['Fac'], 0.55, 0.75)
    shade, noise = noise_shade(nt, vec, 2.0, 0.18)
    color = mix_color(nt, 'MIX', mask, (*base, 1), (*pattern, 1))
    nt.links.new(mix_color(nt, 'MULTIPLY', 1.0, color, shade), bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = roughness
    return mat


# 两层山：(噪声偏移, 山脚高, 起伏, 频率, 浓度, 晕开距离)，远山淡、近山浓
INK_LAYERS = ((5.0, 2.45, 0.5, 3.0, 0.4, 0.5), (11.0, 1.8, 0.65, 2.2, 0.85, 0.35))


def landscape_material(name, ground, ink, layers=INK_LAYERS, along='Y', roughness=0.9, detail=6.0):
    # 山水：沿 along 轴用一维噪声勾山脊，脊线最浓、往下晕成雾。水墨条幅用墨色，漆屏用金色
    mat, bsdf = principled(name)
    nt = mat.node_tree
    coord = nt.nodes.new('ShaderNodeTexCoord')
    pos = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(coord.outputs['Object'], pos.inputs[0])
    color = (*ground, 1)
    for offset, base, rise, freq, strength, fade in layers:
        noise = nt.nodes.new('ShaderNodeTexNoise')
        noise.noise_dimensions = '1D'
        noise.inputs['Detail'].default_value = detail  # Scale 保持默认 5，频率实际是 freq × 5
        noise.inputs['Roughness'].default_value = 0.55
        nt.links.new(math_node(nt, 'ADD', math_node(nt, 'MULTIPLY', pos.outputs[along], freq), offset), noise.inputs['W'])
        ridge = map_range(nt, noise.outputs['Fac'], 0.3, 0.7, base, base + rise)
        depth = math_node(nt, 'SUBTRACT', pos.outputs['Z'], ridge)
        edge = map_range(nt, depth, 0.006, -0.006)
        wash = map_range(nt, depth, 0.0, -fade, strength, 0.0)
        color = mix_color(nt, 'MIX', math_node(nt, 'MULTIPLY', edge, wash), color, (*ink, 1))
    shade, _ = noise_shade(nt, surface_coords(nt)[0], 9.0, 0.08)
    nt.links.new(mix_color(nt, 'MULTIPLY', 1.0, color, shade), bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = roughness
    return mat


def flat_material(name, color, roughness=0.5):
    # 金线、朱漆边：不做纹理的纯色。金色不设金属度——漫反射烘焙里金属会烘成黑
    mat, bsdf = principled(name)
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    return mat


def emissive_material(name, color, strength, gradient=None, axis='Z', span=(0.0, 1.0)):
    mat, bsdf = principled(name)
    bsdf.inputs['Base Color'].default_value = (0, 0, 0, 1)
    bsdf.inputs['Emission Color'].default_value = (*color, 1)
    bsdf.inputs['Emission Strength'].default_value = strength
    if gradient:
        # 沿 axis 从 span[0] 到 span[1] 的色带（窑火、天光、幕布透光）
        nt = mat.node_tree
        coord = nt.nodes.new('ShaderNodeTexCoord')
        sep = nt.nodes.new('ShaderNodeSeparateXYZ')
        nt.links.new(coord.outputs['Object'], sep.inputs[0])
        ramp = nt.nodes.new('ShaderNodeValToRGB')
        els = ramp.color_ramp.elements
        els[0].position, els[0].color = 0.0, (*gradient[0], 1)
        els[1].position, els[1].color = 1.0, (*gradient[-1], 1)
        for i, c in enumerate(gradient[1:-1], 1):
            el = els.new(i / (len(gradient) - 1))
            el.color = (*c, 1)
        nt.links.new(map_range(nt, sep.outputs[axis], *span), ramp.inputs['Fac'])
        nt.links.new(ramp.outputs['Color'], bsdf.inputs['Emission Color'])
    return mat


# ---------- 几何 ----------

class Parts:
    """往一组网格里堆零件，最后合成一个对象（一个对象 = 一张烘焙图）。"""

    def __init__(self, coll):
        self.coll = coll
        self.objects = []

    def link(self, bm, mat, name='part'):
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        me.materials.append(mat)
        ob = bpy.data.objects.new(name, me)
        self.coll.objects.link(ob)
        self.objects.append(ob)
        return ob

    def box(self, x0, x1, y0, y1, z0, z1, mat, bevel=0.0):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        center = Vector(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
        size = Vector((x1 - x0, y1 - y0, z1 - z0))
        for v in bm.verts:
            v.co = center + Vector((v.co.x * size.x, v.co.y * size.y, v.co.z * size.z))
        if bevel:
            bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=2,
                            profile=0.5, affect='EDGES', clamp_overlap=True)
        return self.link(bm, mat)

    def quad(self, corners, mat, facing):
        # 单面板（墙、地、顶分片），法线朝向 facing（指向厅内）
        bm = bmesh.new()
        verts = [bm.verts.new(c) for c in corners]
        face = bm.faces.new(verts)
        bm.normal_update()
        if face.normal.dot(Vector(facing)) < 0:
            face.normal_flip()
        return self.link(bm, mat)

    def grid(self, fn, nu, nv, mat, facing):
        # 参数曲面 fn(i/nu, j/nv) -> (x,y,z)，用于拱顶、筒拱、垂幔
        bm = bmesh.new()
        rows = [[bm.verts.new(fn(i / nu, j / nv)) for i in range(nu + 1)] for j in range(nv + 1)]
        for j in range(nv):
            for i in range(nu):
                bm.faces.new((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]))
        bm.normal_update()
        center = sum((f.calc_center_median() for f in bm.faces), Vector()) / len(bm.faces)
        probe = min(bm.faces, key=lambda f: (f.calc_center_median() - center).length)
        if probe.normal.dot(Vector(facing(probe.calc_center_median()))) < 0:
            for f in bm.faces:
                f.normal_flip()
        return self.link(bm, mat)

    def prism(self, outline, y0, y1, mat, bevel=0.0):
        # outline: [(x, z), ...] 平面多边形（可凹），沿 y 从 y0 挤出到 y1
        bm = bmesh.new()
        front = [bm.verts.new((x, y0, z)) for x, z in outline]
        back = [bm.verts.new((x, y1, z)) for x, z in outline]
        bm.faces.new(front)
        bm.faces.new(list(reversed(back)))
        n = len(outline)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((front[i], front[j], back[j], back[i]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        if bevel:
            bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=1, affect='EDGES', clamp_overlap=True)
        return self.link(bm, mat)

    def lathe(self, profile, mat, segments=24, at=(0, 0, 0), cap_top=True):
        bm = bmesh.new()
        rings = []
        for radius, z in profile:
            rings.append([bm.verts.new((at[0] + radius * math.cos(2 * math.pi * i / segments),
                                        at[1] + radius * math.sin(2 * math.pi * i / segments),
                                        at[2] + z)) for i in range(segments)])
        for lower, upper in zip(rings, rings[1:]):
            for i in range(segments):
                j = (i + 1) % segments
                bm.faces.new((lower[i], lower[j], upper[j], upper[i])).smooth = True
        bm.faces.new(list(reversed(rings[0])))
        if cap_top:
            bm.faces.new(rings[-1])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return self.link(bm, mat)

    def cylinder(self, p0, p1, radius, mat, segments=10, taper=0.92):
        p0, p1 = Vector(p0), Vector(p1)
        axis = p1 - p0
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=radius, radius2=radius * taper,
                              depth=axis.length)
        rot = axis.to_track_quat('Z', 'Y').to_matrix().to_4x4()
        bmesh.ops.transform(bm, matrix=Matrix.Translation((p0 + p1) / 2) @ rot, verts=bm.verts)
        for f in bm.faces:
            f.smooth = len(f.verts) == 4
        return self.link(bm, mat)

    def ico(self, at, radius, mat, squash=0.6, subdivisions=1):
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=subdivisions, radius=radius)
        bmesh.ops.scale(bm, vec=(1, 1, squash), verts=bm.verts)
        bmesh.ops.translate(bm, vec=at, verts=bm.verts)
        return self.link(bm, mat)

    def join(self, name):
        target = self.objects[0]
        with bpy.context.temp_override(active_object=target, object=target,
                                       selected_objects=self.objects,
                                       selected_editable_objects=self.objects):
            bpy.ops.object.join()
        target.name = name
        target.data.name = name
        return target


def arch_notch(radius, springing, segments=24):
    # 拱门缺口：左脚 -> 起拱 -> 半圆 -> 右脚
    pts = [(-radius, 0.0)]
    for i in range(segments + 1):
        a = math.pi - i / segments * math.pi
        pts.append((math.cos(a) * radius, springing + math.sin(a) * radius))
    pts.append((radius, 0.0))
    return pts


def spans(y0, y1, step):
    # 把长面切成不超过 step 的几片，烘焙图打包更省
    count = max(1, math.ceil((y1 - y0) / step - 1e-6))
    return [(y0 + (y1 - y0) * i / count, y0 + (y1 - y0) * (i + 1) / count) for i in range(count)]


def floor_part(coll, mat, y0, y1, name):
    p = Parts(coll)
    for a, b in spans(y0, y1, 6.3):
        p.quad([(-HALF, a, 0), (HALF, a, 0), (HALF, b, 0), (-HALF, b, 0)], mat, (0, 0, 1))
    return p


def wall_panels(p, side, mat, z0=0.0, z1=HEIGHT, y0=DOOR_WALL_Y, y1=DEPTH, step=2.5):
    x = side * HALF
    for a, b in spans(y0, y1, step):
        p.quad([(x, a, z0), (x, b, z0), (x, b, z1), (x, a, z1)], mat, (-side, 0, 0))


def door_wall_outline(top):
    # 门洞墙轮廓：底边留门洞，top 为从右到左的墙顶折线 [(x, z), ...]
    return [(-HALF, 0), (-DOOR_W / 2, 0), (-DOOR_W / 2, DOOR_H), (DOOR_W / 2, DOOR_H), (DOOR_W / 2, 0), (HALF, 0)] + top


def stand_slots():
    return [FIRST_U + i * SPACING for i in range(PER_SIDE)]


# ---------- 布光 ----------

def add_light(coll, name, kind, loc, color, energy, target=None, soft=0.1):
    light = bpy.data.lights.new(name, kind)
    light.color, light.energy = color, energy
    if kind != 'SUN':
        light.shadow_soft_size = soft
    ob = bpy.data.objects.new(name, light)
    ob.location = loc
    ob.visible_camera = False  # 只照亮，不在画面里显出光源本体
    if target is not None:
        ob.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    coll.objects.link(ob)
    return light


def area_light(coll, name, loc, color, energy, target, size):
    light = add_light(coll, name, 'AREA', loc, color, energy, target=target)
    light.shape, light.size, light.size_y = 'RECTANGLE', size[0], size[1]
    return light


def exhibit_spots(coll, targets, ceiling, energy=480, angle=24, color=(1.0, 0.84, 0.64)):
    # 展品顶光：从顶棚斜打到每个展位，形成一圈圈光池
    for i, (x, y, z) in enumerate(targets):
        spot = add_light(coll, f'spot_{i}', 'SPOT', (x * 0.35, y, ceiling(x * 0.35) - 0.1), color, energy,
                         target=(x, y, z - 0.4), soft=0.06)
        spot.spot_size, spot.spot_blend = math.radians(angle), 0.55


def door_spill(coll, energy=120):
    # 门洞透进来的走廊暖光
    area_light(coll, 'door_spill', (0, DOOR_WALL_Y - 0.3, 1.6), (1.0, 0.74, 0.5), energy, (0, 4, 0.8), (DOOR_W, DOOR_H))


def set_world(scene, name, color, strength):
    world = bpy.data.worlds.get(name) or bpy.data.worlds.new(name)
    world.use_nodes = True
    bg = world.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = (*color, 1)
    bg.inputs['Strength'].default_value = strength
    scene.world = world


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
    scene.view_settings.view_transform = VIEW_TRANSFORM
    scene.view_settings.look = VIEW_LOOK
    scene.view_settings.exposure = EXPOSURE
    scene.view_settings.gamma = 1


# 预览机位：位置与偏航（度，0 = 朝厅内深处）
VIEWS = {
    'entrance': ((0, 1.4, EYE), 0),
    'left': ((0.6, 8.5, EYE), 62),
    'right': ((-0.6, 8.5, EYE), -62),
    'end': ((0, 18.5, EYE), 0),
    'back': ((0, 21, EYE), 180)
}


def render_previews(scene, out_dir, names, width=960, height=540, samples=96, views=VIEWS):
    setup_cycles(scene, samples)
    cam_data = bpy.data.cameras.get('hall_cam') or bpy.data.cameras.new('hall_cam')
    cam_data.sensor_fit = 'VERTICAL'
    cam_data.angle_y = math.radians(55)
    cam = bpy.data.objects.get('hall_cam') or bpy.data.objects.new('hall_cam', cam_data)
    if cam.name not in scene.collection.objects:
        scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.resolution_x, scene.render.resolution_y = width, height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    out_dir.mkdir(parents=True, exist_ok=True)
    for name in names:
        loc, yaw = views[name]
        cam.location = loc
        cam.rotation_euler = (math.radians(90), 0, math.radians(yaw))
        scene.render.filepath = str(out_dir / f'preview-{name}.png')
        bpy.ops.render.render(write_still=True, scene=scene.name)
        print('RENDERED', name, flush=True)


def preview_main(build_hall, light_hall, out_dir, views=VIEWS):
    # blender --background --python scripts/build-<id>-hall.py -- --preview [机位...] --samples N
    import argparse
    import sys
    parser = argparse.ArgumentParser()
    parser.add_argument('--preview', nargs='*', default=None)
    parser.add_argument('--samples', type=int, default=96)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    scene, parts, m = build_hall()
    light_hall(scene)
    if args.preview is not None:
        render_previews(scene, out_dir, args.preview or list(views), samples=args.samples, views=views)
