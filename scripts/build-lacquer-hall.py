# 金漆流光展厅（漆殿）：黑漆墙板朱红边框、描金暗纹，朱红立柱，井字天花点金花，尽头一座黑漆描金六扇围屏。
# 两侧都是独立玻璃柜：左陈漆器，右陈金工。灯光压暗，靠展柜顶光和洗墙光托出金线。
# 预览：blender --background --python scripts/build-lacquer-hall.py -- --preview
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from hall_kit import *  # noqa: E402,F401,F403

OUT = ROOT / 'artifacts/lacquer-hall'
SCENE = 'LacquerHall'

BEAM_EVERY = 5.0
BASE_H = 0.5                          # 朱红墙裙
FRIEZE = 3.85                         # 檐下朱红额带起点
LEFT_CASE, RIGHT_CASE = (-3.2, 1.0), (3.2, 1.12)   # 展柜（x, 台面高）
DAIS_Y = 23.1

SPECIAL = {'hall_lamp'}
DROP = set()


def beam_positions():
    return [BEAM_EVERY / 2 + i * BEAM_EVERY for i in range(5)]


def bay_centers():
    return [5.0, 10.0, 15.0, 20.0]


def build_materials():
    return {
        'lacquer': clay_material('hall_lacquer', (0.012, 0.009, 0.008), mottle=0.15, scale=3.0, roughness=0.25, bump=0.0),
        # 洒金：黑漆上撒细碎金箔
        'panel': clay_material('hall_gilt_panel', (0.014, 0.01, 0.009), mottle=0.15, scale=3.0, roughness=0.3, bump=0.0,
                               speckle=(0.3, 0.19, 0.05)),
        # 屏心：黑漆描金山水，屏风沿 x 展开
        'screen': landscape_material('hall_screen_panel', (0.014, 0.01, 0.009), (0.5, 0.32, 0.08), along='X', roughness=0.3, detail=2.0,
                                     layers=((3.0, 1.75, 0.6, 0.3, 0.45, 0.7), (9.0, 1.0, 0.75, 0.2, 0.9, 0.45))),
        'vermilion': clay_material('hall_vermilion', (0.24, 0.022, 0.011), mottle=0.12, scale=4.0, roughness=0.35, bump=0.0),
        'gold': flat_material('hall_gold', (0.55, 0.36, 0.09), 0.35),
        'bronze': clay_material('hall_bronze', (0.16, 0.1, 0.045), mottle=0.3, scale=10.0, roughness=0.4, bump=0.1),
        'floor': tile_material('hall_floor', (0.022, 0.024, 0.022), (0.032, 0.03, 0.026), (0.11, 0.08, 0.035),
                               size=(0.6, 0.6), mortar_size=0.006, offset=0.0, roughness=0.2, mottle=0.25, bump=0.2),
        'ceiling': clay_material('hall_ceiling', (0.02, 0.012, 0.01), mottle=0.2, scale=2.0, roughness=0.5, bump=0.0),
        'silk': cloth_material('hall_tassel', (0.3, 0.02, 0.015), (0.5, 0.3, 0.06), scale=8.0),
        'lamp': emissive_material('hall_lamp', (1.0, 0.32, 0.12), 2.5)
    }


def framed_panel(p, m, side, y0, y1, z0, z1):
    # 墙板：描金黑漆心 + 朱红边框 + 内圈金线
    x = side * HALF
    px = x - side * 0.012
    p.quad([(px, y0, z0), (px, y1, z0), (px, y1, z1), (px, y0, z1)], m['panel'], (-side, 0, 0))
    f0, f1 = x - side * 0.005, x - side * 0.04
    lo, hi = min(f0, f1), max(f0, f1)
    w = 0.08
    p.box(lo, hi, y0 - w, y1 + w, z0 - w, z0, m['vermilion'], bevel=0.006)
    p.box(lo, hi, y0 - w, y1 + w, z1, z1 + w, m['vermilion'], bevel=0.006)
    p.box(lo, hi, y0 - w, y0, z0, z1, m['vermilion'], bevel=0.006)
    p.box(lo, hi, y1, y1 + w, z0, z1, m['vermilion'], bevel=0.006)
    g0, g1 = x - side * 0.01, x - side * 0.025
    lo, hi = min(g0, g1), max(g0, g1)
    i, t = 0.1, 0.012
    p.box(lo, hi, y0 + i, y1 - i, z0 + i, z0 + i + t, m['gold'])
    p.box(lo, hi, y0 + i, y1 - i, z1 - i - t, z1 - i, m['gold'])
    p.box(lo, hi, y0 + i, y0 + i + t, z0 + i, z1 - i, m['gold'])
    p.box(lo, hi, y1 - i - t, y1 - i, z0 + i, z1 - i, m['gold'])


def build_side_wall(coll, m, side, name):
    p = Parts(coll)
    x = side * HALF
    wall_panels(p, side, m['lacquer'], 0, HEIGHT)
    inner = x - side * 0.05
    for a, b in spans(DOOR_WALL_Y, DEPTH, 2.5):
        p.box(min(x, inner), max(x, inner), a, b, 0, BASE_H, m['vermilion'], bevel=0.006)
        g = x - side * 0.055
        p.box(min(x, g), max(x, g), a, b, BASE_H, BASE_H + 0.025, m['gold'])
        p.box(min(x, inner), max(x, inner), a, b, FRIEZE, HEIGHT, m['vermilion'], bevel=0.006)
        p.box(min(x, g), max(x, g), a, b, FRIEZE - 0.025, FRIEZE, m['gold'])
    # 每个开间两块描金墙板
    bounds = [DOOR_WALL_Y] + beam_positions() + [DEPTH]
    for u0, u1 in zip(bounds, bounds[1:]):
        a, b = u0 + 0.35, u1 - 0.35
        if b - a < 1.0:
            continue
        mid = (a + b) / 2
        for y0, y1 in ((a, mid - 0.08), (mid + 0.08, b)):
            framed_panel(p, m, side, y0, y1, BASE_H + 0.3, FRIEZE - 0.3)
    # 朱红圆柱：金柱础、金箍
    cx = x - side * 0.25
    for u in beam_positions():
        p.lathe([(0.3, 0), (0.3, 0.06), (0.25, 0.16), (0.22, 0.2)], m['gold'], segments=20, at=(cx, u, 0))
        p.cylinder((cx, u, 0.2), (cx, u, HEIGHT), 0.2, m['vermilion'], segments=20, taper=1.0)
        for z in (3.5, 3.62):
            p.lathe([(0.215, 0), (0.215, 0.05)], m['gold'], segments=20, at=(cx, u, z))
    return p.join(name)


def build_ceiling(coll, m):
    p = Parts(coll)
    z = HEIGHT
    for a, b in spans(DOOR_WALL_Y, DEPTH, 6.3):
        for k in range(2):
            x0, x1 = -HALF + k * HALF, k * HALF
            p.quad([(x0, a, z), (x1, a, z), (x1, b, z), (x0, b, z)], m['ceiling'], (0, 0, -1))
    # 井字天花：纵横朱枋，格心一朵金花
    longs = (-4.5, -1.5, 1.5, 4.5)
    for x in longs:
        for a, b in spans(DOOR_WALL_Y, DEPTH, 6.3):
            p.box(x - 0.07, x + 0.07, a, b, z - 0.14, z, m['vermilion'])
    rows = [DOOR_WALL_Y + 0.1 + i * 2.5 for i in range(11)]
    for y in rows:
        p.box(-HALF, HALF, y - 0.07, y + 0.07, z - 0.14, z, m['vermilion'])
        p.box(-HALF, HALF, y - 0.02, y + 0.02, z - 0.155, z - 0.14, m['gold'])
    for y0, y1 in zip(rows, rows[1:]):
        for x0, x1 in zip((-HALF,) + longs, longs + (HALF,)):
            if x1 - x0 < 2.0:
                continue
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            p.lathe([(0.34, 0), (0.3, -0.02), (0.12, -0.05), (0.0, -0.06)], m['gold'], segments=8, at=(cx, cy, z - 0.001))
    # 屏风上方的八角藻井：一圈圈往下叠的金红八角环
    for k, (r, mat) in enumerate(((1.6, 'vermilion'), (1.35, 'gold'), (1.1, 'vermilion'), (0.85, 'gold'), (0.55, 'vermilion'))):
        top, bottom = z - 0.14 - k * 0.07, z - 0.21 - k * 0.07
        p.lathe([(r, bottom - top), (r, 0)], m[mat], segments=8, at=(0, DAIS_Y + 0.6, top), cap_top=True)
    return p.join('hall_ceiling')


def build_ends(coll, m):
    p = Parts(coll)
    top = [(HALF, HEIGHT), (-HALF, HEIGHT)]
    p.prism(door_wall_outline(top), DOOR_WALL_Y - 0.04, DOOR_WALL_Y, m['lacquer'])
    for a, b in ((-HALF, -DOOR_W / 2 - 0.14), (DOOR_W / 2 + 0.14, HALF)):
        p.box(a, b, DOOR_WALL_Y, DOOR_WALL_Y + 0.05, 0, BASE_H, m['vermilion'], bevel=0.006)
        p.box(a, b, DOOR_WALL_Y, DOOR_WALL_Y + 0.05, FRIEZE, HEIGHT, m['vermilion'], bevel=0.006)
    for s in (-1, 1):
        x0 = s * DOOR_W / 2
        p.box(min(x0, x0 + s * 0.14), max(x0, x0 + s * 0.14), DOOR_WALL_Y, DOOR_WALL_Y + 0.08, 0, DOOR_H + 0.14,
              m['vermilion'], bevel=0.01)
    p.box(-DOOR_W / 2 - 0.14, DOOR_W / 2 + 0.14, DOOR_WALL_Y, DOOR_WALL_Y + 0.08, DOOR_H, DOOR_H + 0.16, m['vermilion'], bevel=0.01)
    p.box(-DOOR_W / 2 - 0.14, DOOR_W / 2 + 0.14, DOOR_WALL_Y + 0.08, DOOR_WALL_Y + 0.09, DOOR_H + 0.07, DOOR_H + 0.09, m['gold'])
    # 尽头墙
    p.prism([(-HALF, 0), (HALF, 0)] + top, DEPTH, DEPTH + 0.05, m['lacquer'])
    p.box(-HALF, HALF, DEPTH - 0.05, DEPTH, 0, BASE_H, m['vermilion'], bevel=0.006)
    p.box(-HALF, HALF, DEPTH - 0.05, DEPTH, FRIEZE, HEIGHT, m['vermilion'], bevel=0.006)
    # 屏风台
    p.box(-3.4, 3.4, DAIS_Y, DEPTH - 0.06, 0, 0.18, m['lacquer'], bevel=0.015)
    p.box(-3.45, 3.45, DAIS_Y - 0.05, DEPTH - 0.06, 0.18, 0.25, m['vermilion'], bevel=0.01)
    p.box(-3.46, 3.46, DAIS_Y - 0.06, DAIS_Y - 0.04, 0.2, 0.22, m['gold'])
    # 六扇围屏：扇与扇之间折出锯齿，黑漆描金心、朱红边、金包角
    panel_w, z0, z1 = 0.86, 0.3, 2.75
    angle = math.radians(14)
    start = -3 * panel_w * math.cos(angle)
    x, y = start, DEPTH - 0.55
    for k in range(6):
        a = angle if k % 2 == 0 else -angle
        x2, y2 = x + panel_w * math.cos(a), y + panel_w * math.sin(a)
        nx, ny = math.sin(a), -math.cos(a)

        def at(t, d, x=x, y=y, x2=x2, y2=y2, nx=nx, ny=ny):
            return (x + (x2 - x) * t + nx * d, y + (y2 - y) * t + ny * d)

        heart = [(*at(0.06, 0.01), z0 + 0.12), (*at(0.94, 0.01), z0 + 0.12), (*at(0.94, 0.01), z1 - 0.12), (*at(0.06, 0.01), z1 - 0.12)]
        p.quad(heart, m['screen'], (nx, ny, 0))
        # 边框四根
        for t0, t1, za, zb in ((0, 0.06, z0, z1), (0.94, 1, z0, z1), (0.06, 0.94, z0, z0 + 0.12), (0.06, 0.94, z1 - 0.12, z1)):
            pts = [at(t0, 0.03), at(t1, 0.03), at(t1, -0.03), at(t0, -0.03)]
            hexa(p, [(px, py, za) for px, py in pts] + [(px, py, zb) for px, py in pts], m['vermilion'])
        for t in (0.0, 1.0):
            hx, hy = at(t, 0)
            p.box(hx - 0.04, hx + 0.04, hy - 0.04, hy + 0.04, z1 - 0.06, z1 + 0.02, m['gold'])
            p.box(hx - 0.04, hx + 0.04, hy - 0.04, hy + 0.04, z0 - 0.05, z0 + 0.04, m['gold'])
        x, y = x2, y2
    return p.join('hall_ends')


def hexa(p, corners, mat):
    # 八点六面体（底四点 + 顶四点），用于斜放的屏风边框
    bm = bmesh.new()
    v = [bm.verts.new(c) for c in corners]
    for face in ((0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)):
        bm.faces.new([v[i] for i in face])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return p.link(bm, mat)


def case_plinth(p, m, x, y, top):
    # 黑漆展座：朱红腰线、金边，台面与玻璃罩在网页里实时渲染
    p.box(x - 0.44, x + 0.44, y - 0.44, y + 0.44, 0, 0.1, m['vermilion'], bevel=0.01)
    p.box(x - 0.4, x + 0.4, y - 0.4, y + 0.4, 0.1, top - 0.06, m['lacquer'], bevel=0.012)
    p.box(x - 0.41, x + 0.41, y - 0.41, y + 0.41, top - 0.2, top - 0.16, m['vermilion'])
    p.box(x - 0.412, x + 0.412, y - 0.412, y + 0.412, top - 0.215, top - 0.205, m['gold'])
    p.box(x - 0.412, x + 0.412, y - 0.412, y + 0.412, 0.1, 0.115, m['gold'])


def build_displays(coll, m):
    p = Parts(coll)
    for y in stand_slots():
        case_plinth(p, m, *LEFT_CASE[:1], y, LEFT_CASE[1])
        case_plinth(p, m, *RIGHT_CASE[:1], y, RIGHT_CASE[1])
    return p.join('hall_displays')


def lamp_positions():
    return [(s * 2.4, u) for u in bay_centers() for s in (-1, 1)]


def build_props(coll, m):
    p = Parts(coll)
    # 方形红纱宫灯：金顶金底、四角垂穗
    for x, y in lamp_positions():
        p.cylinder((x, y, 3.82), (x, y, HEIGHT - 0.14), 0.012, m['gold'], segments=6)
        p.lathe([(0.3, 0), (0.2, 0.08), (0.05, 0.14)], m['gold'], segments=4, at=(x, y, 3.7))
        p.lathe([(0.24, 0), (0.27, 0.1), (0.27, 0.36), (0.24, 0.46)], m['lamp'], segments=4, at=(x, y, 3.24))
        p.lathe([(0.29, 0), (0.29, 0.04)], m['gold'], segments=4, at=(x, y, 3.2))
        for k in range(4):
            a = math.pi / 4 + k * math.pi / 2
            p.cylinder((x + math.cos(a) * 0.38, y + math.sin(a) * 0.38, 3.74),
                       (x + math.cos(a) * 0.38, y + math.sin(a) * 0.38, 3.36), 0.02, m['silk'], segments=5)
    # 柱前铜灯檠：细杆托一盏小灯
    for side in (-1, 1):
        for u in (7.5, 12.5, 17.5):
            x, y = side * (HALF - 0.75), u
            p.lathe([(0.22, 0), (0.2, 0.05), (0.06, 0.12), (0.035, 0.18)], m['bronze'], segments=16, at=(x, y, 0))
            p.cylinder((x, y, 0.18), (x, y, 1.55), 0.025, m['bronze'], segments=10, taper=1.0)
            p.lathe([(0.03, 0), (0.16, 0.06), (0.17, 0.09)], m['bronze'], segments=16, at=(x, y, 1.55))
            p.lathe([(0.06, 0), (0.09, 0.1), (0.07, 0.2)], m['lamp'], segments=12, at=(x, y, 1.62))
    return p.join('hall_props')


def stand_targets():
    for y in stand_slots():
        yield (LEFT_CASE[0], y, LEFT_CASE[1] + 0.35)
        yield (RIGHT_CASE[0], y, RIGHT_CASE[1] + 0.35)


def build_hall():
    scene = get_scene(SCENE)
    coll = get_collection(scene, 'lacquer_hall')
    m = build_materials()
    parts = {
        'floor_a': floor_part(coll, m['floor'], DOOR_WALL_Y - 0.04, 12.6, 'hall_floor_a').join('hall_floor_a'),
        'floor_b': floor_part(coll, m['floor'], 12.6, DEPTH, 'hall_floor_b').join('hall_floor_b'),
        'wall_left': build_side_wall(coll, m, -1, 'hall_wall_left'),
        'wall_right': build_side_wall(coll, m, 1, 'hall_wall_right'),
        'ceiling': build_ceiling(coll, m),
        'ends': build_ends(coll, m),
        'displays': build_displays(coll, m),
        'props': build_props(coll, m)
    }
    return scene, parts, m


def light_hall(scene):
    coll = get_collection(scene, 'lacquer_hall_lights')
    warm = (1.0, 0.8, 0.56)
    # 洗墙光：顶棚边缘一排面光斜打墙板，托出金线
    for side in (-1, 1):
        for u in bay_centers():
            area_light(coll, f'wash_{side}_{u}', (side * (HALF - 1.8), u, HEIGHT - 0.6), warm, 80,
                       (side * HALF, u, 1.6), (3.6, 0.4))
    for x, y in lamp_positions():
        add_light(coll, f'lamp_{x}_{y}', 'POINT', (x, y, 3.46), (1.0, 0.42, 0.2), 45, soft=0.22)
    for side in (-1, 1):
        for u in (7.5, 12.5, 17.5):
            add_light(coll, f'sconce_{side}_{u}', 'POINT', (side * (HALF - 0.75), u, 1.75), (1.0, 0.55, 0.25), 18, soft=0.08)
    exhibit_spots(coll, list(stand_targets()), lambda x: HEIGHT - 0.2, energy=560, angle=20)
    # 屏风主光
    spot = add_light(coll, 'screen_key', 'SPOT', (0, DAIS_Y - 4.0, HEIGHT - 0.25), warm, 700,
                     target=(0, DEPTH - 0.6, 1.5), soft=0.3)
    spot.spot_size, spot.spot_blend = math.radians(44), 0.9
    for y in (5.0, 12.5, 20.0):
        area_light(coll, f'ceiling_fill_{y}', (0, y, HEIGHT - 0.3), warm, 14, (0, y, 0), (6.0, 6.0))
    door_spill(coll, 90)
    set_world(scene, 'lacquer_hall_world', (0.3, 0.2, 0.15), 0.015)
    return coll


if __name__ == '__main__':
    preview_main(build_hall, light_hall, OUT)
