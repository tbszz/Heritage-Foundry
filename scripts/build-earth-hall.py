# 火土新生展厅（龙窑）：建模、程序材质与布光，供 bake-hall.py 导入后烘焙。
# 也可单独出预览图：blender --background --python scripts/build-earth-hall.py -- --preview
# 通用的材质、零件、布光工具在 hall_kit.py；这里只放龙窑特有的砖材质、窑口和陈设。
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from hall_kit import *  # noqa: E402,F401,F403
from hall_kit import ROOT, Parts, add_light, arch_notch, get_collection, get_scene, preview_main, spans  # noqa: E402

OUT = ROOT / 'artifacts/earth-hall'
SCENE = 'EarthHall'

VAULT_RISE = 1.2
ARCH_EVERY, BAND_DEPTH = 5.0, 0.5
KILN_R, KILN_SPRING, KILN_DEPTH = 1.1, 1.5, 0.8
KILN_RING = 0.35
VITRINE_X, VITRINE_TOP = -3.2, 1.06
FRONT_TIER, BACK_TIER = (2.8, 0.5), (3.8, 0.95)

SPECIAL = {'hall_fire', 'hall_ember', 'hall_lamp'}   # 自发光面不烘焙，导出为发光材质
DROP = {'hall_fire'}                                 # 窑火后壁在网页里换成实时渐变面片


def vault_sag(x):
    radius = (HALF * HALF + VAULT_RISE * VAULT_RISE) / (2 * VAULT_RISE)
    x = min(abs(x), HALF)
    return math.sqrt(radius * radius - x * x) - (radius - VAULT_RISE)


def brick_material(name, c1, c2, mortar, size=(0.24, 0.062), mortar_size=0.007, offset=0.5,
                   roughness=0.9, soot=0.0, mottle=0.35, bump=0.55, vault=False):
    mat, bsdf = principled(name)
    nt = mat.node_tree
    vec, pos = surface_coords(nt, vault)
    # 砖缝轻微扭动，免得像 CAD 网格
    warp = nt.nodes.new('ShaderNodeTexNoise')
    warp.inputs['Scale'].default_value = 3.0
    warp.inputs['Detail'].default_value = 2.0
    nt.links.new(vec, warp.inputs['Vector'])
    jitter = nt.nodes.new('ShaderNodeVectorMath')
    jitter.operation = 'MULTIPLY_ADD'
    nt.links.new(warp.outputs['Color'], jitter.inputs[0])
    jitter.inputs[1].default_value = (0.006, 0.006, 0.0)
    nt.links.new(vec, jitter.inputs[2])
    brick = nt.nodes.new('ShaderNodeTexBrick')
    brick.offset = offset
    brick.inputs['Scale'].default_value = 1.0
    brick.inputs['Brick Width'].default_value = size[0]
    brick.inputs['Row Height'].default_value = size[1]
    brick.inputs['Mortar Size'].default_value = mortar_size
    brick.inputs['Mortar Smooth'].default_value = 0.25
    brick.inputs['Bias'].default_value = 0.0
    brick.inputs['Color1'].default_value = (*c1, 1)
    brick.inputs['Color2'].default_value = (*c2, 1)
    brick.inputs['Mortar'].default_value = (*mortar, 1)
    nt.links.new(jitter.outputs[0], brick.inputs['Vector'])
    # 砖面斑驳：大块深浅 + 细颗粒
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 7.0
    noise.inputs['Detail'].default_value = 12.0
    noise.inputs['Roughness'].default_value = 0.65
    nt.links.new(vec, noise.inputs['Vector'])
    shade = map_range(nt, noise.outputs['Fac'], 0.3, 0.7, 1 - mottle, 1 + mottle * 0.6)
    color = mix_color(nt, 'MULTIPLY', 1.0, brick.outputs['Color'], shade)
    if soot:
        # 窑烟：越靠拱顶、越靠窑口越黑
        high = map_range(nt, pos.outputs['Z'], 3.0, HEIGHT + VAULT_RISE, 0.0, soot)
        deep = map_range(nt, pos.outputs['Y'], DEPTH - 7, DEPTH, 0.0, soot * 0.8)
        f = math_node(nt, 'MAXIMUM', high, deep)
        streak = nt.nodes.new('ShaderNodeTexNoise')
        streak.inputs['Scale'].default_value = 1.6
        streak.inputs['Detail'].default_value = 6.0
        nt.links.new(vec, streak.inputs['Vector'])
        f = math_node(nt, 'MULTIPLY', f, map_range(nt, streak.outputs['Fac'], 0.35, 0.65, 0.6, 1.25))
        color = mix_color(nt, 'MIX', math_node(nt, 'MINIMUM', f, 0.92), color, (0.012, 0.008, 0.006, 1))
    nt.links.new(color, bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = roughness
    if bump:
        b = nt.nodes.new('ShaderNodeBump')
        b.invert = True
        b.inputs['Strength'].default_value = bump
        b.inputs['Distance'].default_value = 0.012
        height = math_node(nt, 'ADD', brick.outputs['Fac'], math_node(nt, 'MULTIPLY', noise.outputs['Fac'], 0.25))
        nt.links.new(height, b.inputs['Height'])
        nt.links.new(b.outputs['Normal'], bsdf.inputs['Normal'])
    return mat




def emissive_material(name, color, strength, gradient=None):
    mat, bsdf = principled(name)
    bsdf.inputs['Base Color'].default_value = (0, 0, 0, 1)
    bsdf.inputs['Emission Color'].default_value = (*color, 1)
    bsdf.inputs['Emission Strength'].default_value = strength
    if gradient:
        # 窑膛后壁：底部白热，往上转暗红
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
        nt.links.new(map_range(nt, sep.outputs['Z'], 0.35, KILN_SPRING + KILN_R), ramp.inputs['Fac'])
        nt.links.new(ramp.outputs['Color'], bsdf.inputs['Emission Color'])
    return mat


def build_materials():
    m = {}
    # 窑砖：红褐为主，烧流的砖偏紫黑
    m['brick'] = brick_material('hall_brick', (0.22, 0.072, 0.036), (0.12, 0.045, 0.028), (0.10, 0.082, 0.064),
                                soot=0.75)
    m['vault'] = brick_material('hall_vault', (0.20, 0.068, 0.036), (0.11, 0.042, 0.027), (0.09, 0.075, 0.06),
                                soot=0.85, vault=True)
    m['rib'] = brick_material('hall_rib', (0.13, 0.042, 0.022), (0.075, 0.03, 0.018), (0.07, 0.058, 0.046),
                              soot=0.7, mottle=0.25)
    m['kiln_face'] = brick_material('hall_kiln_face', (0.10, 0.032, 0.018), (0.05, 0.022, 0.015),
                                    (0.06, 0.045, 0.035), soot=0.9, size=(0.24, 0.12))
    m['firebox'] = clay_material('hall_firebox', (0.11, 0.035, 0.014), mottle=0.5, scale=4.0)
    m['base_course'] = brick_material('hall_base_course', (0.07, 0.05, 0.04), (0.05, 0.038, 0.032),
                                      (0.05, 0.045, 0.04), size=(0.48, 0.2), mottle=0.3)
    m['floor'] = brick_material('hall_floor', (0.085, 0.06, 0.045), (0.06, 0.044, 0.036), (0.03, 0.025, 0.021),
                                size=(0.42, 0.42), mortar_size=0.009, offset=0.0, roughness=0.8, mottle=0.3, bump=0.4)
    m['terracotta'] = brick_material('hall_terracotta', (0.36, 0.13, 0.06), (0.30, 0.10, 0.05), (0.16, 0.10, 0.07),
                                     size=(0.3, 0.075), roughness=0.85, mottle=0.25, bump=0.4)
    m['fired'] = clay_material('hall_fired_lip', (0.05, 0.03, 0.022), mottle=0.3, scale=14.0, roughness=0.6)
    m['plinth'] = wood_material('hall_plinth', (0.012, 0.007, 0.005), (0.024, 0.014, 0.009), roughness=0.45)
    m['saggar'] = clay_material('hall_saggar', (0.24, 0.17, 0.115), mottle=0.45, scale=6.0,
                                speckle=(0.08, 0.075, 0.06))
    m['jar'] = clay_material('hall_jar', (0.05, 0.035, 0.022), mottle=0.3, scale=5.0, roughness=0.35)
    m['wood'] = wood_material('hall_wood', (0.035, 0.022, 0.014), (0.09, 0.06, 0.038), roughness=0.8)
    m['char'] = clay_material('hall_char', (0.012, 0.01, 0.009), mottle=0.4, scale=20.0)
    m['iron'] = clay_material('hall_iron', (0.018, 0.016, 0.015), mottle=0.3, scale=30.0, roughness=0.6, bump=0.0)
    m['fire'] = emissive_material('hall_fire', (1.0, 0.45, 0.12), 1.0, gradient=[
        (1.0, 0.62, 0.22), (0.95, 0.30, 0.05), (0.45, 0.07, 0.01), (0.08, 0.012, 0.004)])
    m['ember'] = emissive_material('hall_ember', (1.0, 0.36, 0.06), 4.0)
    m['lamp'] = emissive_material('hall_lamp', (1.0, 0.66, 0.32), 5.0)
    return m


# ---------- 几何 ----------





def vault_profile(segments=32, lift=0.0):
    return [(-HALF + i / segments * WIDTH, HEIGHT + vault_sag(-HALF + i / segments * WIDTH) + lift)
            for i in range(segments + 1)]




def build_floor(coll, m, y0, y1, name):
    p = Parts(coll)
    for a, b in spans(y0, y1, 6.3):
        p.quad([(-HALF, a, 0), (HALF, a, 0), (HALF, b, 0), (-HALF, b, 0)], m['floor'], (0, 0, 1))
    if y1 >= DEPTH:
        # 窑口前的砖砌踏台
        p.box(-1.7, 1.7, DEPTH - 0.6, DEPTH - 0.1, 0, 0.09, m['base_course'], bevel=0.01)
    return p.join(name)


def build_side_wall(coll, m, side, name):
    p = Parts(coll)
    x = side * HALF
    for a, b in spans(DOOR_WALL_Y, DEPTH, 2.5):
        p.quad([(x, a, 0), (x, b, 0), (x, b, HEIGHT), (x, a, HEIGHT)], m['brick'], (-side, 0, 0))
    # 墙脚一圈深色压脚砖
    inner = x - side * 0.05
    for a, b in spans(DOOR_WALL_Y, DEPTH, 2.5):
        p.box(min(x, inner), max(x, inner), a, b, 0, 0.42, m['base_course'], bevel=0.008)
    # 拱券的贴墙砖柱
    u = ARCH_EVERY / 2
    while u < DEPTH:
        face = x - side * 0.35
        p.box(min(x, face), max(x, face), u - BAND_DEPTH / 2, u + BAND_DEPTH / 2, 0, HEIGHT, m['rib'], bevel=0.015)
        u += ARCH_EVERY
    return p.join(name)


def build_vault(coll, m):
    p = Parts(coll)
    for a, b in spans(DOOR_WALL_Y, DEPTH, 6.3):
        for k in range(4):
            x0, x1 = -HALF + k * WIDTH / 4, -HALF + (k + 1) * WIDTH / 4
            p.grid(lambda s, t, x0=x0, x1=x1, a=a, b=b: (x0 + (x1 - x0) * s, a + (b - a) * t,
                                                          HEIGHT + vault_sag(x0 + (x1 - x0) * s)),
                   8, 1, m['vault'], lambda c: (0, 0, -1))
    # 券带：沿拱顶的一圈砖券
    outer = vault_profile(32, 0.02)
    inner = [(x * (HALF - 0.35) / HALF, HEIGHT + vault_sag(x * (HALF - 0.35) / HALF) - 0.32) for x, _ in reversed(outer)]
    u = ARCH_EVERY / 2
    while u < DEPTH:
        p.prism(outer + inner, u - BAND_DEPTH / 2, u + BAND_DEPTH / 2, m['rib'])
        u += ARCH_EVERY
    return p.join('hall_vault')


def build_ends(coll, m):
    p = Parts(coll)
    top = list(reversed(vault_profile(32, 0.01)))
    # 门洞墙：朝厅内 (+y)
    door = [(-HALF, 0), (-DOOR_W / 2, 0), (-DOOR_W / 2, DOOR_H), (DOOR_W / 2, DOOR_H), (DOOR_W / 2, 0), (HALF, 0)] + top
    p.prism(door, DOOR_WALL_Y - 0.04, DOOR_WALL_Y, m['brick'])
    # 门洞上方一道砖过梁
    p.box(-DOOR_W / 2 - 0.3, DOOR_W / 2 + 0.3, DOOR_WALL_Y, DOOR_WALL_Y + 0.06, DOOR_H, DOOR_H + 0.3, m['rib'], bevel=0.01)
    # 尽头墙：留出窑口
    far = [(-HALF, 0)] + arch_notch(KILN_R, KILN_SPRING) + [(HALF, 0)] + top
    p.prism(far, DEPTH, DEPTH + 0.05, m['brick'])
    # 窑口券脸（倒 U），凸出墙面 12cm
    ring = list(reversed(arch_notch(KILN_R + KILN_RING, KILN_SPRING))) + arch_notch(KILN_R, KILN_SPRING)
    p.prism(ring, DEPTH - 0.12, DEPTH + 0.02, m['kiln_face'], bevel=0.012)
    # 窑膛：火床、两侧直墙、筒拱，后壁是窑火
    hearth = 0.35
    back = DEPTH + KILN_DEPTH
    p.box(-KILN_R, KILN_R, DEPTH - 0.12, back, 0, hearth, m['firebox'])
    for s in (-1, 1):
        p.quad([(s * KILN_R, DEPTH, hearth), (s * KILN_R, back, hearth), (s * KILN_R, back, KILN_SPRING),
                (s * KILN_R, DEPTH, KILN_SPRING)], m['firebox'], (-s, 0, 0))
    p.grid(lambda s, t: (math.cos(math.pi * s) * KILN_R, DEPTH + KILN_DEPTH * t, KILN_SPRING + math.sin(math.pi * s) * KILN_R),
           16, 1, m['firebox'], lambda c: (-c.x, 0, KILN_SPRING - c.z))
    fire = [(-KILN_R, hearth)] + [(x, max(z, hearth)) for x, z in arch_notch(KILN_R, KILN_SPRING)[1:-1]] + [(KILN_R, hearth)]
    p.prism(fire, back - 0.02, back, m['fire'])
    # 火床上的炭火与柴
    import random
    rnd = random.Random(7)
    for _ in range(46):
        x = rnd.uniform(-KILN_R + 0.15, KILN_R - 0.15)
        y = rnd.uniform(DEPTH + 0.15, back - 0.08)
        hot = rnd.random() < 0.65
        p.ico((x, y, hearth + 0.02), rnd.uniform(0.04, 0.09), m['ember'] if hot else m['char'])
    for x, ang in ((-0.45, 0.2), (0.1, -0.12), (0.55, 0.08)):
        p0 = (x - math.sin(ang) * 0.7, DEPTH - 0.25, hearth + 0.07)
        p1 = (x + math.sin(ang) * 0.3, DEPTH + 0.55, hearth + 0.1)
        p.cylinder(p0, p1, 0.07, m['char'])
    return p.join('hall_ends')


def saggar_stack(p, m, x, y, count, rnd):
    z = 0.0
    for _ in range(count):
        r = 0.3 + rnd.uniform(-0.015, 0.015)
        p.lathe([(r, 0), (r + 0.012, 0.02), (r + 0.012, 0.235), (r, 0.255), (r - 0.03, 0.255)],
                m['saggar'], segments=22, at=(x + rnd.uniform(-0.03, 0.03), y + rnd.uniform(-0.03, 0.03), z))
        z += 0.255


def build_tiers(coll, m):
    # 右侧两级陶台：离镜头近、面积大，单独占一张烘焙图
    p = Parts(coll)
    tier_y0 = FIRST_U - 1.3
    tier_y1 = FIRST_U + (PER_SIDE - 1) * SPACING + 1.3
    for x, top in (FRONT_TIER, BACK_TIER):
        # 分段砌，长条面在烘焙图里才排得紧
        for a, b in spans(tier_y0, tier_y1, 4.2):
            p.box(x - 0.5, x + 0.5, a, b, 0, top, m['terracotta'], bevel=0.004)
        for a, b in spans(tier_y0 - 0.02, tier_y1 + 0.02, 4.2):
            p.box(x - 0.52, x + 0.52, a, b, top, top + 0.04, m['fired'], bevel=0.004)
    return p.join('hall_tiers')


def build_props(coll, m):
    import random
    rnd = random.Random(17)
    p = Parts(coll)
    # 左侧瓷器展台（台面青瓷板与玻璃罩在网页里实时渲染，保留高光）
    for i in range(PER_SIDE):
        y = FIRST_U + i * SPACING
        p.box(VITRINE_X - 0.43, VITRINE_X + 0.43, y - 0.43, y + 0.43, 0, 0.08, m['fired'], bevel=0.01)
        p.box(VITRINE_X - 0.4, VITRINE_X + 0.4, y - 0.4, y + 0.4, 0.08, VITRINE_TOP - 0.06, m['plinth'], bevel=0.012)
    # 匣钵垛：贴墙堆在拱券之间
    for i, u in enumerate((5, 10, 15, 20)):
        saggar_stack(p, m, -(HALF - 0.75), u, 3 + i % 3, rnd)
        saggar_stack(p, m, HALF - 0.75, u + 0.4, 4 + (i + 1) % 2, rnd)
    saggar_stack(p, m, -(HALF - 1.3), DEPTH - 1.0, 5, rnd)
    saggar_stack(p, m, -(HALF - 2.0), DEPTH - 0.8, 2, rnd)
    saggar_stack(p, m, HALF - 1.3, DEPTH - 1.2, 4, rnd)
    # 门口两口大缸
    for s in (-1, 1):
        p.lathe([(0.0, 0), (0.28, 0), (0.42, 0.22), (0.48, 0.52), (0.45, 0.78), (0.38, 0.92), (0.41, 0.97),
                 (0.40, 1.0), (0.34, 1.0), (0.32, 0.9)], m['jar'], segments=28, at=(s * 4.9, 1.25, 0))
    # 窑口右侧一垛松柴
    for row in range(4):
        for k in range(5 - row):
            y = DEPTH - 1.25 + k * 0.17 + row * 0.085 + rnd.uniform(-0.02, 0.02)
            z = 0.08 + row * 0.15
            p.cylinder((1.75, y, z), (3.0 + rnd.uniform(-0.1, 0.1), y + rnd.uniform(-0.05, 0.05), z), 0.075, m['wood'])
    # 吊灯：从拱顶垂下的铁框油灯
    for x, y in lamp_positions():
        top = HEIGHT + vault_sag(x)
        p.cylinder((x, y, 3.78), (x, y, top + 0.05), 0.012, m['iron'], segments=6)
        p.lathe([(0.2, 0), (0.05, 0.12), (0.03, 0.16)], m['iron'], segments=12, at=(x, y, 3.64))
        p.lathe([(0.17, 0), (0.17, 0.025)], m['iron'], segments=12, at=(x, y, 3.2))
        for k in range(4):
            a = math.pi / 4 + k * math.pi / 2
            bx, by = x + math.cos(a) * 0.165, y + math.sin(a) * 0.165
            p.box(bx - 0.008, bx + 0.008, by - 0.008, by + 0.008, 3.2, 3.65, m['iron'])
        p.lathe([(0.1, 0), (0.12, 0.2), (0.09, 0.36)], m['lamp'], segments=16, at=(x, y, 3.24))
    return p.join('hall_props')


def lamp_positions():
    return [(s * 2.4, u) for u in (5.0, 10.0, 15.0, 20.0) for s in (-1, 1)]


def stand_targets():
    for i in range(PER_SIDE):
        y = FIRST_U + i * SPACING
        yield (VITRINE_X, y, VITRINE_TOP + 0.35)
        x, top = FRONT_TIER if i % 2 == 0 else BACK_TIER
        yield (x, y, top + 0.45)


def build_hall():
    scene = get_scene(SCENE)
    coll = get_collection(scene, 'earth_hall')
    m = build_materials()
    parts = {
        'floor_a': build_floor(coll, m, DOOR_WALL_Y - 0.04, 12.6, 'hall_floor_a'),
        'floor_b': build_floor(coll, m, 12.6, DEPTH, 'hall_floor_b'),
        'wall_left': build_side_wall(coll, m, -1, 'hall_wall_left'),
        'wall_right': build_side_wall(coll, m, 1, 'hall_wall_right'),
        'vault': build_vault(coll, m),
        'ends': build_ends(coll, m),
        'tiers': build_tiers(coll, m),
        'props': build_props(coll, m)
    }
    return scene, parts, m


# ---------- 布光 ----------



def light_hall(scene):
    coll = get_collection(scene, 'earth_hall_lights')
    # 窑火：窑膛里一块朝外的面光，加一盏低处的橙光把地面和券脸打亮
    fire = add_light(coll, 'kiln_fire', 'AREA', (0, DEPTH - 0.14, 1.1), (1.0, 0.4, 0.1), 200,
                     target=(0, DEPTH - 3, 0.6))
    fire.shape, fire.size, fire.size_y = 'RECTANGLE', 2.0, 1.6
    add_light(coll, 'kiln_spill', 'POINT', (0, DEPTH - 0.6, 0.9), (1.0, 0.42, 0.12), 110, soft=0.5)
    # 吊灯
    for x, y in lamp_positions():
        add_light(coll, f'lamp_{x}_{y}', 'POINT', (x, y, 3.42), (1.0, 0.7, 0.42), 90, soft=0.15)
    # 展品顶光：从拱顶打到每个展位，形成一圈圈光池
    for i, (x, y, z) in enumerate(stand_targets()):
        sx = x * 0.35
        spot = add_light(coll, f'spot_{i}', 'SPOT', (sx, y, HEIGHT + vault_sag(sx) - 0.1), (1.0, 0.84, 0.64), 480,
                         target=(x, y, z - 0.4), soft=0.06)
        spot.spot_size, spot.spot_blend = math.radians(24), 0.55
    # 拱顶下的柔和补光，代替窑里砖墙之间的多次反射，免得灯与灯之间死黑
    for y in (4.0, 10.0, 16.0, 22.0):
        fill = add_light(coll, f'vault_fill_{y}', 'AREA', (0, y, HEIGHT + 0.9), (1.0, 0.72, 0.48), 35,
                         target=(0, y, 0))
        fill.shape, fill.size, fill.size_y = 'RECTANGLE', 4.0, 5.0
    # 门洞透进来的走廊暖光
    door = add_light(coll, 'door_spill', 'AREA', (0, DOOR_WALL_Y - 0.3, 1.6), (1.0, 0.74, 0.5), 120,
                     target=(0, 4, 0.8))
    door.shape, door.size, door.size_y = 'RECTANGLE', DOOR_W, DOOR_H
    world = bpy.data.worlds.get('earth_hall_world') or bpy.data.worlds.new('earth_hall_world')
    world.use_nodes = True
    bg = world.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = (0.3, 0.22, 0.16, 1)
    bg.inputs['Strength'].default_value = 0.02
    scene.world = world
    return coll


VIEWS = {
    'entrance': ((0, 1.4, EYE), 0),
    'vitrines': ((0.6, 8.5, EYE), 62),
    'tiers': ((-0.6, 8.5, EYE), -62),
    'kiln': ((0, 18.5, EYE), 0),
    'back': ((0, 21, EYE), 180)
}


if __name__ == '__main__':
    preview_main(build_hall, light_hall, OUT, VIEWS)
