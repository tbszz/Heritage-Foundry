# 经纬成章展厅（木构厅堂）：白灰墙 + 木护墙板，两侧花窗透光，梁下垂丝绸横幅，尽头一台织机和一幅云锦。
# 左侧玻璃展柜陈织绣，右侧翘头案摆民俗物件。供 bake-hall.py 导入后烘焙。
# 预览：blender --background --python scripts/build-thread-hall.py -- --preview
import math
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from hall_kit import *  # noqa: E402,F401,F403

OUT = ROOT / 'artifacts/thread-hall'
SCENE = 'ThreadHall'

ROOF_RISE = 1.1                       # 两坡顶：檐口 4.6m，屋脊 5.7m
BEAM_EVERY = 5.0                      # 梁架间距，柱子立在梁下
DADO = 0.95                           # 木护墙板高度
WINDOW_Z = (2.5, 3.9)                 # 花窗上下沿
VITRINE_X, VITRINE_TOP = -3.2, 1.06
TABLE_X, TABLE_TOP, TABLE_W = 3.4, 0.84, 0.72
LOOM_Y = 23.0

SPECIAL = {'hall_window', 'hall_lamp'}
DROP = set()


def roof_z(x):
    return HEIGHT + ROOF_RISE * (1 - min(abs(x), HALF) / HALF)


def beam_positions():
    return [BEAM_EVERY / 2 + i * BEAM_EVERY for i in range(5)]


def bay_centers():
    return [5.0, 10.0, 15.0, 20.0]


def build_materials():
    return {
        'plaster': plaster_material('hall_plaster', (0.5, 0.45, 0.37)),
        'dado': wood_material('hall_dado', (0.04, 0.022, 0.012), (0.085, 0.05, 0.028), roughness=0.55),
        'timber': wood_material('hall_timber', (0.032, 0.014, 0.008), (0.07, 0.034, 0.018), roughness=0.6),
        'column': wood_material('hall_column', (0.07, 0.016, 0.01), (0.12, 0.03, 0.016), roughness=0.45),
        'floor': plank_material('hall_floor', (0.05, 0.03, 0.018), (0.11, 0.068, 0.04)),
        'boards': plank_material('hall_boards', (0.07, 0.045, 0.027), (0.14, 0.09, 0.055), width=0.18),
        'stone': clay_material('hall_stone', (0.13, 0.12, 0.105), mottle=0.3, scale=6.0),
        # 横幅：同色系暗纹，远看是素缎、近看有团花
        'red': cloth_material('hall_banner_red', (0.34, 0.02, 0.018), (0.46, 0.12, 0.03), scale=9.0, motif='voronoi'),
        'indigo': cloth_material('hall_banner_indigo', (0.018, 0.035, 0.11), (0.08, 0.12, 0.24), scale=9.0, motif='voronoi'),
        'ochre': cloth_material('hall_banner_ochre', (0.42, 0.2, 0.035), (0.5, 0.32, 0.08), scale=9.0, motif='voronoi'),
        'brocade': cloth_material('hall_brocade', (0.24, 0.015, 0.02), (0.6, 0.38, 0.08), scale=7.0, motif='voronoi'),
        'runner': cloth_material('hall_runner', (0.28, 0.02, 0.02), (0.5, 0.3, 0.06), scale=9.0),
        'warp': stripe_material('hall_warp', (0.5, 0.06, 0.04), (0.55, 0.38, 0.1), freq=60.0),
        'silk': cloth_material('hall_silk', (0.42, 0.05, 0.035), (0.6, 0.4, 0.1), scale=14.0),
        'embroidery': cloth_material('hall_embroidery', (0.16, 0.27, 0.25), (0.6, 0.42, 0.14), scale=5.0, motif='voronoi'),
        'cord': flat_material('hall_cord', (0.45, 0.4, 0.3), 0.8),
        'gold': flat_material('hall_gold', (0.5, 0.32, 0.08), 0.4),
        'window': emissive_material('hall_window', (1.0, 0.9, 0.72), 2.0),
        'lamp': emissive_material('hall_lamp', (1.0, 0.6, 0.3), 2.5)
    }


def build_side_wall(coll, m, side, name):
    p = Parts(coll)
    x = side * HALF
    wall_panels(p, side, m['plaster'], DADO, HEIGHT)
    inner = x - side * 0.05
    for a, b in spans(DOOR_WALL_Y, DEPTH, 2.5):
        p.box(min(x, inner), max(x, inner), a, b, 0, DADO, m['dado'], bevel=0.006)
        rail = x - side * 0.08
        p.box(min(x, rail), max(x, rail), a, b, DADO - 0.05, DADO + 0.01, m['timber'], bevel=0.008)
    # 檐下一道木枋
    for a, b in spans(DOOR_WALL_Y, DEPTH, 6.3):
        eave = x - side * 0.12
        p.box(min(x, eave), max(x, eave), a, b, HEIGHT - 0.28, HEIGHT, m['timber'], bevel=0.01)
    # 立柱：柱础 + 圆柱，落在每榀梁下
    cx = x - side * 0.22
    for u in beam_positions():
        p.lathe([(0.26, 0), (0.27, 0.08), (0.23, 0.18), (0.2, 0.2)], m['stone'], segments=16, at=(cx, u, 0))
        p.cylinder((cx, u, 0.2), (cx, u, HEIGHT - 0.28), 0.18, m['column'], segments=16, taper=0.95)
    # 花窗：窗纸发光，前面一层木格
    z0, z1 = WINDOW_Z
    for u in bay_centers():
        w = 1.3
        px = x - side * 0.02
        p.quad([(px, u - w, z0), (px, u + w, z0), (px, u + w, z1), (px, u - w, z1)], m['window'], (-side, 0, 0))
        f0, f1 = x - side * 0.03, x - side * 0.1
        lo, hi = min(f0, f1), max(f0, f1)
        p.box(lo, hi, u - w - 0.1, u + w + 0.1, z0 - 0.1, z0, m['timber'], bevel=0.008)
        p.box(lo, hi, u - w - 0.1, u + w + 0.1, z1, z1 + 0.1, m['timber'], bevel=0.008)
        for k in range(7):
            yy = u - w + k * (2 * w) / 6
            p.box(lo, hi, yy - 0.025, yy + 0.025, z0, z1, m['timber'])
        for k in range(1, 4):
            zz = z0 + k * (z1 - z0) / 4
            g0, g1 = x - side * 0.04, x - side * 0.08
            p.box(min(g0, g1), max(g0, g1), u - w, u + w, zz - 0.02, zz + 0.02, m['timber'])
    return p.join(name)


def build_roof(coll, m):
    p = Parts(coll)
    # 望板：两坡，各切几片
    for s in (-1, 1):
        for a, b in spans(DOOR_WALL_Y, DEPTH, 6.3):
            for k in range(2):
                x0, x1 = s * HALF * k / 2, s * HALF * (k + 1) / 2
                p.quad([(x0, a, roof_z(x0)), (x1, a, roof_z(x1)), (x1, b, roof_z(x1)), (x0, b, roof_z(x0))],
                       m['boards'], (0, 0, -1))
    # 椽子：顺坡的方木，40cm 一根
    y = DOOR_WALL_Y + 0.25
    while y < DEPTH - 0.1:
        for s in (-1, 1):
            x0, x1 = s * 0.15, s * (HALF - 0.05)
            outline = [(x0, roof_z(x0) - 0.01), (x1, roof_z(x1) - 0.01), (x1, roof_z(x1) - 0.11), (x0, roof_z(x0) - 0.11)]
            p.prism(outline, y - 0.035, y + 0.035, m['timber'])
        y += 0.4
    # 檩条：脊檩 + 两侧金檩
    for x in (0.0, -3.0, 3.0):
        z = roof_z(x) - 0.2
        for a, b in spans(DOOR_WALL_Y, DEPTH, 6.3):
            p.cylinder((x, a, z), (x, b, z), 0.12, m['timber'], segments=12, taper=1.0)
    # 梁架：大梁 + 瓜柱
    for u in beam_positions():
        p.box(-HALF, HALF, u - 0.17, u + 0.17, HEIGHT - 0.5, HEIGHT - 0.12, m['timber'], bevel=0.02)
        for x in (0.0, -3.0, 3.0):
            p.box(x - 0.1, x + 0.1, u - 0.1, u + 0.1, HEIGHT - 0.12, roof_z(x) - 0.28, m['timber'], bevel=0.01)
    return p.join('hall_roof')


def loom(p, m, y0):
    # 立式织机：四柱框架、经轴、卷布轴、两片综框、筘座和织工凳
    z = 0.22
    for x in (-0.95, 0.95):
        for y in (y0, y0 + 1.4):
            p.box(x - 0.045, x + 0.045, y - 0.045, y + 0.045, z, 1.95, m['timber'], bevel=0.006)
        p.box(x - 0.04, x + 0.04, y0, y0 + 1.4, 1.88, 1.96, m['timber'], bevel=0.006)
        p.box(x - 0.04, x + 0.04, y0, y0 + 1.4, z + 0.12, z + 0.2, m['timber'], bevel=0.006)
    for y in (y0, y0 + 1.4):
        p.box(-0.95, 0.95, y - 0.04, y + 0.04, 1.88, 1.96, m['timber'], bevel=0.006)
    p.cylinder((-0.92, y0 + 1.3, 0.95), (0.92, y0 + 1.3, 0.95), 0.07, m['timber'], segments=14, taper=1.0)
    p.cylinder((-0.92, y0 + 0.08, 0.86), (0.92, y0 + 0.08, 0.86), 0.08, m['silk'], segments=14, taper=1.0)
    p.quad([(-0.75, y0 + 1.3, 1.02), (0.75, y0 + 1.3, 1.02), (0.75, y0 + 0.55, 0.96), (-0.75, y0 + 0.55, 0.96)],
           m['warp'], (0, 0, 1))
    p.quad([(-0.75, y0 + 0.55, 0.96), (0.75, y0 + 0.55, 0.96), (0.75, y0 + 0.1, 0.93), (-0.75, y0 + 0.1, 0.93)],
           m['silk'], (0, 0, 1))
    for y in (y0 + 0.75, y0 + 0.9):
        p.box(-0.82, 0.82, y - 0.02, y + 0.02, 0.98, 1.62, m['timber'])
    p.box(-0.85, 0.85, y0 + 0.5, y0 + 0.58, 0.88, 1.28, m['timber'], bevel=0.005)
    p.box(-0.6, 0.6, y0 - 0.55, y0 - 0.25, z, 0.66, m['timber'], bevel=0.01)
    # 花楼：后端两根高柱撑起横梁，提花线从梁上垂到综框，一眼看出是提花机
    for x in (-0.7, 0.7):
        p.box(x - 0.05, x + 0.05, y0 + 1.05, y0 + 1.15, 1.96, 2.9, m['timber'], bevel=0.006)
    p.box(-0.85, 0.85, y0 + 1.03, y0 + 1.17, 2.86, 2.98, m['timber'], bevel=0.008)
    for k in range(13):
        x = -0.6 + k * 0.1
        p.cylinder((x, y0 + 1.1, 2.86), (x, y0 + 0.82, 1.62), 0.006, m['cord'], segments=4, taper=1.0)
    # 脚踏
    for x in (-0.3, -0.1, 0.1, 0.3):
        p.box(x - 0.04, x + 0.04, y0 - 0.1, y0 + 0.9, z + 0.02, z + 0.06, m['timber'])


def embroidery_frame(p, m, x, y):
    # 绣绷：木架上绷一块绣片
    for dx in (-0.62, 0.62):
        p.box(x + dx - 0.035, x + dx + 0.035, y - 0.035, y + 0.035, 0.22, 1.7, m['timber'], bevel=0.005)
        p.box(x + dx - 0.035, x + dx + 0.035, y - 0.3, y + 0.3, 0.22, 0.28, m['timber'], bevel=0.005)
    p.box(x - 0.62, x + 0.62, y - 0.035, y + 0.035, 0.75, 0.8, m['timber'])
    p.box(x - 0.62, x + 0.62, y - 0.035, y + 0.035, 1.65, 1.7, m['timber'])
    p.quad([(x - 0.58, y - 0.01, 0.8), (x + 0.58, y - 0.01, 0.8), (x + 0.58, y - 0.01, 1.65), (x - 0.58, y - 0.01, 1.65)],
           m['embroidery'], (0, -1, 0))


def build_ends(coll, m):
    p = Parts(coll)
    top = [(HALF, HEIGHT), (0, HEIGHT + ROOF_RISE + 0.01), (-HALF, HEIGHT)]
    # 门洞墙
    p.prism(door_wall_outline(top), DOOR_WALL_Y - 0.04, DOOR_WALL_Y, m['plaster'])
    for a, b in ((-HALF, -DOOR_W / 2 - 0.12), (DOOR_W / 2 + 0.12, HALF)):
        p.box(a, b, DOOR_WALL_Y, DOOR_WALL_Y + 0.05, 0, DADO, m['dado'], bevel=0.006)
    for s in (-1, 1):
        p.box(s * DOOR_W / 2 - 0.12 * (s < 0), s * DOOR_W / 2 + 0.12 * (s > 0), DOOR_WALL_Y, DOOR_WALL_Y + 0.08,
              0, DOOR_H + 0.12, m['timber'], bevel=0.01)
    p.box(-DOOR_W / 2 - 0.12, DOOR_W / 2 + 0.12, DOOR_WALL_Y, DOOR_WALL_Y + 0.08, DOOR_H, DOOR_H + 0.14, m['timber'], bevel=0.01)
    # 尽头墙
    p.prism([(-HALF, 0), (HALF, 0)] + top, DEPTH, DEPTH + 0.05, m['plaster'])
    p.box(-HALF, HALF, DEPTH - 0.05, DEPTH, 0, DADO, m['dado'], bevel=0.006)
    # 云锦挂轴：上下木轴夹住一幅锦
    p.quad([(-1.9, DEPTH - 0.07, 1.2), (1.9, DEPTH - 0.07, 1.2), (1.9, DEPTH - 0.07, 3.05), (-1.9, DEPTH - 0.07, 3.05)],
           m['brocade'], (0, -1, 0))
    p.box(-1.95, 1.95, DEPTH - 0.1, DEPTH - 0.06, 3.05, 3.12, m['gold'])
    p.box(-1.95, 1.95, DEPTH - 0.1, DEPTH - 0.06, 1.13, 1.2, m['gold'])
    for z in (1.16, 3.09):
        p.cylinder((-2.08, DEPTH - 0.1, z), (2.08, DEPTH - 0.1, z), 0.045, m['timber'], segments=10, taper=1.0)
    # 织机台
    p.box(-2.3, 2.3, LOOM_Y - 0.9, DEPTH - 0.08, 0, 0.22, m['timber'], bevel=0.015)
    loom(p, m, LOOM_Y)
    embroidery_frame(p, m, -3.7, DEPTH - 0.9)
    embroidery_frame(p, m, 3.7, DEPTH - 0.9)
    return p.join('hall_ends')


def build_displays(coll, m):
    p = Parts(coll)
    # 左：织绣玻璃柜的木座（台面与玻璃罩在网页里实时渲染）
    for y in stand_slots():
        p.box(VITRINE_X - 0.43, VITRINE_X + 0.43, y - 0.43, y + 0.43, 0, 0.08, m['timber'], bevel=0.01)
        p.box(VITRINE_X - 0.4, VITRINE_X + 0.4, y - 0.4, y + 0.4, 0.08, VITRINE_TOP - 0.06, m['dado'], bevel=0.012)
        p.box(VITRINE_X - 0.41, VITRINE_X + 0.41, y - 0.41, y + 0.41, VITRINE_TOP - 0.16, VITRINE_TOP - 0.12, m['gold'])
    # 右：翘头案，一张案放两件
    half_w = TABLE_W / 2
    for i in range(0, PER_SIDE, 2):
        y0, y1 = FIRST_U + i * SPACING - 0.75, FIRST_U + (i + 1) * SPACING + 0.75
        top = TABLE_TOP
        p.box(TABLE_X - half_w, TABLE_X + half_w, y0, y1, top - 0.06, top, m['column'], bevel=0.01)
        for y in (y0, y1 - 0.12):
            p.box(TABLE_X - half_w, TABLE_X + half_w, y, y + 0.12, top, top + 0.05, m['column'], bevel=0.01)
        p.box(TABLE_X - half_w + 0.03, TABLE_X + half_w - 0.03, y0 + 0.1, y1 - 0.1, top - 0.16, top - 0.06, m['column'])
        for x in (TABLE_X - half_w + 0.06, TABLE_X + half_w - 0.06):
            for y in (y0 + 0.18, y1 - 0.18):
                p.box(x - 0.035, x + 0.035, y - 0.035, y + 0.035, 0, top - 0.06, m['column'], bevel=0.006)
            p.box(x - 0.02, x + 0.02, y0 + 0.18, y1 - 0.18, 0.12, 0.17, m['column'])
        # 红地金纹桌旗
        p.box(TABLE_X - 0.22, TABLE_X + 0.22, y0 + 0.25, y1 - 0.25, top, top + 0.006, m['runner'])
    return p.join('hall_displays')


def palace_lantern(p, m, x, y):
    # 六角宫灯：木顶、发光灯身、木底、垂穗
    top = roof_z(x)
    p.cylinder((x, y, 3.9), (x, y, top - 0.1), 0.012, m['timber'], segments=6)
    p.lathe([(0.26, 0), (0.18, 0.08), (0.06, 0.14)], m['timber'], segments=6, at=(x, y, 3.78))
    p.lathe([(0.2, 0), (0.24, 0.12), (0.24, 0.42), (0.2, 0.54)], m['lamp'], segments=6, at=(x, y, 3.24))
    p.lathe([(0.24, 0), (0.22, 0.04)], m['timber'], segments=6, at=(x, y, 3.2))
    for k in range(6):
        a = k * math.pi / 3
        p.cylinder((x + math.cos(a) * 0.24, y + math.sin(a) * 0.24, 3.2),
                   (x + math.cos(a) * 0.24, y + math.sin(a) * 0.24, 2.92), 0.012, m['red'], segments=4)


def lamp_positions():
    return [(s * 2.4, u) for u in bay_centers() for s in (-1, 1)]


def build_props(coll, m):
    p = Parts(coll)
    rnd = random.Random(23)
    # 梁下垂幅：每榀梁两幅，红、靛、赭轮换
    colours = ('red', 'indigo', 'ochre')
    for i, u in enumerate(beam_positions()[:-1]):  # 最后一榀梁不挂，免得挡住尽头标题
        for k, x in enumerate((-1.5, 1.5)):
            mat = m[colours[(i + k) % 3]]
            z1, z0 = HEIGHT - 0.5, 2.55
            sway = rnd.uniform(-0.04, 0.04)
            p.grid(lambda s, t, x=x, u=u, sway=sway: (x - 0.32 + 0.64 * s, u - 0.2 + sway * t * t, z1 - (z1 - z0) * t),
                   2, 6, mat, lambda c: (0, -1, 0))
            p.cylinder((x - 0.4, u - 0.2, z1 + 0.02), (x + 0.4, u - 0.2, z1 + 0.02), 0.025, m['gold'], segments=8, taper=1.0)
            p.cylinder((x - 0.34, u - 0.2 + sway, z0), (x + 0.34, u - 0.2 + sway, z0), 0.02, m['timber'], segments=8, taper=1.0)
    for x, y in lamp_positions():
        palace_lantern(p, m, x, y)
    # 墙边布匹架：卷好的布匹码在矮架上
    for side in (-1, 1):
        for u in (6.2, 11.2, 16.2, 21.2):
            x = side * (HALF - 0.55)
            p.box(x - 0.3, x + 0.3, u - 0.6, u + 0.6, 0, 0.32, m['timber'], bevel=0.01)
            for row in range(3):
                for k in range(3 - row):
                    zz = 0.42 + row * 0.17
                    yy = u - 0.36 + k * 0.36 + row * 0.18
                    mat = m[colours[rnd.randrange(3)]]
                    p.cylinder((x - 0.28, yy, zz), (x + 0.28, yy, zz), 0.09, mat, segments=12, taper=1.0)
    return p.join('hall_props')


def stand_targets():
    for y in stand_slots():
        yield (VITRINE_X, y, VITRINE_TOP + 0.35)
        yield (TABLE_X, y, TABLE_TOP + 0.45)


def build_hall():
    scene = get_scene(SCENE)
    coll = get_collection(scene, 'thread_hall')
    m = build_materials()
    parts = {
        'floor_a': floor_part(coll, m['floor'], DOOR_WALL_Y - 0.04, 12.6, 'hall_floor_a').join('hall_floor_a'),
        'floor_b': floor_part(coll, m['floor'], 12.6, DEPTH, 'hall_floor_b').join('hall_floor_b'),
        'wall_left': build_side_wall(coll, m, -1, 'hall_wall_left'),
        'wall_right': build_side_wall(coll, m, 1, 'hall_wall_right'),
        'roof': build_roof(coll, m),
        'ends': build_ends(coll, m),
        'displays': build_displays(coll, m),
        'props': build_props(coll, m)
    }
    return scene, parts, m


def light_hall(scene):
    coll = get_collection(scene, 'thread_hall_lights')
    # 花窗透进来的天光：窗外一块面光斜照进厅
    for side in (-1, 1):
        for u in bay_centers():
            area_light(coll, f'window_{side}_{u}', (side * (HALF + 0.4), u, 3.4), (1.0, 0.93, 0.82), 260,
                       (side * 1.0, u + 1.0, 0.0), (2.6, 1.4))
    for x, y in lamp_positions():
        add_light(coll, f'lamp_{x}_{y}', 'POINT', (x, y, 3.5), (1.0, 0.66, 0.38), 60, soft=0.2)
    exhibit_spots(coll, list(stand_targets()), lambda x: HEIGHT - 0.4, energy=320)
    # 屋脊下补光：白灰墙之间的多次反射
    for y in (5.0, 12.5, 20.0):
        area_light(coll, f'ridge_fill_{y}', (0, y, HEIGHT + 0.7), (1.0, 0.88, 0.72), 40, (0, y, 0), (6.0, 6.0))
    # 织机与云锦一束主光
    spot = add_light(coll, 'loom_key', 'SPOT', (0, LOOM_Y - 3.5, HEIGHT - 0.3), (1.0, 0.86, 0.66), 520,
                     target=(0, DEPTH, 1.4), soft=0.4)
    spot.spot_size, spot.spot_blend = math.radians(70), 0.9
    door_spill(coll)
    set_world(scene, 'thread_hall_world', (0.5, 0.45, 0.4), 0.03)
    return coll


if __name__ == '__main__':
    preview_main(build_hall, light_hall, OUT)
