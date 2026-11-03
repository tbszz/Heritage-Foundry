# 竹木清韵展厅（竹构书斋）：竹片护墙、竹排吊顶、竹窗透进园子的绿光，墙上挂水墨条幅。
# 尽头一道月洞门，门后是粉墙黛瓦的小院和一丛竹子。左侧竹墩陈竹编，右侧红木香几高低错落陈木雕。
# 预览：blender --background --python scripts/build-carving-hall.py -- --preview
import math
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from hall_kit import *  # noqa: E402,F401,F403

OUT = ROOT / 'artifacts/carving-hall'
SCENE = 'CarvingHall'

WAINSCOT = 1.1                        # 竹片护墙高度
BEAM_EVERY = 5.0
WINDOW_Z = (1.6, 3.3)
GATE_R, GATE_CZ, GATE_RING = 1.45, 1.3, 0.18   # 月洞门半径、圆心高度、门框宽
YARD_X, YARD_Y = 2.8, DEPTH + 2.9               # 小院半宽、院墙位置
DRUM_X, DRUM_TOP = -3.2, 0.74                    # 竹墩
FRONT_STAND, BACK_STAND = (2.9, 0.9), (3.9, 1.2) # 香几（x, 几面高）

SPECIAL = {'hall_sky', 'hall_window', 'hall_lamp'}
DROP = set()


def beam_positions():
    return [BEAM_EVERY / 2 + i * BEAM_EVERY for i in range(5)]


def bay_centers():
    return [5.0, 10.0, 15.0, 20.0]


def leaf_spray(p, at, mat, rnd, count=7, length=0.24):
    # 一簇竹叶：细长菱形叶片从枝头向四周斜垂
    for _ in range(count):
        yaw = rnd.uniform(0, math.tau)
        droop = rnd.uniform(-0.75, 0.15)
        d = Vector((math.cos(yaw) * math.cos(droop), math.sin(yaw) * math.cos(droop), math.sin(droop)))
        s = Vector((-math.sin(yaw), math.cos(yaw), 0)) * rnd.uniform(0.022, 0.032)
        b = Vector(at) + Vector((rnd.uniform(-0.05, 0.05), rnd.uniform(-0.05, 0.05), rnd.uniform(-0.06, 0.03)))
        L = length * rnd.uniform(0.8, 1.2)
        p.quad([b, b + d * L * 0.4 + s, b + d * L, b + d * L * 0.4 - s], mat, tuple(d.cross(s)))


def build_materials():
    return {
        'plaster': plaster_material('hall_plaster', (0.52, 0.47, 0.38)),
        'slat': stripe_material('hall_slat', (0.38, 0.28, 0.12), (0.17, 0.11, 0.045), freq=16.0, nodes=3.0),
        'ceiling': stripe_material('hall_bamboo_ceiling', (0.34, 0.25, 0.11), (0.14, 0.09, 0.04), freq=14.0, nodes=0.5),
        'post': stripe_material('hall_post', (0.36, 0.27, 0.12), (0.16, 0.1, 0.04), freq=1.0, nodes=2.2, roughness=0.4),
        'pole': stripe_material('hall_pole', (0.36, 0.27, 0.12), (0.16, 0.1, 0.04), freq=1.0, axis=1, nodes=2.2, roughness=0.4),
        'green': stripe_material('hall_green_bamboo', (0.07, 0.15, 0.035), (0.03, 0.07, 0.015), freq=1.0, nodes=2.6, roughness=0.4),
        'leaf': clay_material('hall_leaf', (0.035, 0.1, 0.022), mottle=0.5, scale=12.0, roughness=0.6),
        'timber': wood_material('hall_timber', (0.05, 0.03, 0.016), (0.1, 0.064, 0.034), roughness=0.6),
        'rosewood': wood_material('hall_rosewood', (0.045, 0.011, 0.007), (0.1, 0.03, 0.016), roughness=0.4),
        'floor': plank_material('hall_floor', (0.11, 0.075, 0.045), (0.22, 0.15, 0.09), width=0.2),
        'stone': clay_material('hall_stone', (0.3, 0.3, 0.28), mottle=0.35, scale=5.0),
        'rock': clay_material('hall_rock', (0.14, 0.14, 0.13), mottle=0.6, scale=3.0, bump=0.8),
        'pebble': clay_material('hall_pebble', (0.17, 0.16, 0.14), mottle=0.4, scale=18.0, speckle=(0.32, 0.31, 0.28)),
        'tile': clay_material('hall_tile', (0.035, 0.035, 0.038), mottle=0.3, scale=20.0),
        'scroll': landscape_material('hall_scroll', (0.52, 0.48, 0.38), (0.05, 0.05, 0.05)),
        'mount': flat_material('hall_mount', (0.18, 0.2, 0.17), 0.7),
        'sky': emissive_material('hall_sky', (0.85, 0.92, 0.9), 1.5, axis='Z',
                                 gradient=[(0.72, 0.84, 0.66), (0.86, 0.93, 0.98)], span=(0.0, HEIGHT)),
        'window': emissive_material('hall_window', (0.85, 0.95, 0.82), 1.5),
        'lamp': emissive_material('hall_lamp', (1.0, 0.82, 0.6), 2.5)
    }


def build_side_wall(coll, m, side, name):
    p = Parts(coll)
    x = side * HALF
    wall_panels(p, side, m['plaster'], WAINSCOT, HEIGHT)
    inner = x - side * 0.04
    for a, b in spans(DOOR_WALL_Y, DEPTH, 2.5):
        p.box(min(x, inner), max(x, inner), a, b, 0, WAINSCOT, m['slat'])
        rx = x - side * 0.07
        p.cylinder((rx, a, WAINSCOT + 0.03), (rx, b, WAINSCOT + 0.03), 0.04, m['pole'], segments=10, taper=1.0)
    # 粗竹立柱
    cx = x - side * 0.16
    for u in beam_positions():
        p.cylinder((cx, u, 0), (cx, u, HEIGHT), 0.13, m['post'], segments=14, taper=1.0)
    # 竹窗：窗口透园子的绿光，竖竹棂 + 卷起的竹帘
    z0, z1 = WINDOW_Z
    for u in bay_centers():
        w = 1.0
        px = x - side * 0.02
        p.quad([(px, u - w, z0), (px, u + w, z0), (px, u + w, z1), (px, u - w, z1)], m['window'], (-side, 0, 0))
        f0, f1 = x - side * 0.03, x - side * 0.12
        lo, hi = min(f0, f1), max(f0, f1)
        for zz in (z0 - 0.05, z1 + 0.05):
            p.cylinder(((lo + hi) / 2, u - w - 0.12, zz), ((lo + hi) / 2, u + w + 0.12, zz), 0.045, m['pole'], segments=10, taper=1.0)
        for yy in (u - w - 0.05, u + w + 0.05):
            p.cylinder(((lo + hi) / 2, yy, z0 - 0.1), ((lo + hi) / 2, yy, z1 + 0.1), 0.045, m['post'], segments=10, taper=1.0)
        for k in range(1, 9):
            yy = u - w + k * (2 * w) / 9
            p.cylinder(((lo + hi) / 2, yy, z0), ((lo + hi) / 2, yy, z1), 0.016, m['post'], segments=6, taper=1.0)
        p.cylinder((x - side * 0.14, u - w, z1 + 0.15), (x - side * 0.14, u + w, z1 + 0.15), 0.07, m['slat'], segments=12, taper=1.0)
        # 窗两侧水墨条幅
        for yy in (u - 1.75, u + 1.75):
            sx = x - side * 0.015
            p.box(min(x, sx), max(x, sx), yy - 0.32, yy + 0.32, 1.35, 3.25, m['mount'])
            sx2 = x - side * 0.02
            p.quad([(sx2, yy - 0.26, 1.5), (sx2, yy + 0.26, 1.5), (sx2, yy + 0.26, 3.08), (sx2, yy - 0.26, 3.08)],
                   m['scroll'], (-side, 0, 0))
            p.cylinder((x - side * 0.04, yy - 0.36, 1.33), (x - side * 0.04, yy + 0.36, 1.33), 0.022, m['rosewood'], segments=8, taper=1.0)
    return p.join(name)


def build_ceiling(coll, m):
    p = Parts(coll)
    for a, b in spans(DOOR_WALL_Y, DEPTH, 6.3):
        for k in range(2):
            x0, x1 = -HALF + k * HALF, k * HALF
            p.quad([(x0, a, HEIGHT), (x1, a, HEIGHT), (x1, b, HEIGHT), (x0, b, HEIGHT)], m['ceiling'], (0, 0, -1))
    # 木梁落在立柱上，梁间每 1.25m 一根横竹
    for u in beam_positions():
        p.box(-HALF, HALF, u - 0.14, u + 0.14, HEIGHT - 0.32, HEIGHT, m['timber'], bevel=0.015)
    u = 1.25
    while u < DEPTH - 0.3:
        if all(abs(u - b) > 0.3 for b in beam_positions()):
            p.cylinder((-HALF, u, HEIGHT - 0.08), (HALF, u, HEIGHT - 0.08), 0.06, m['pole'], segments=10, taper=1.0)
        u += 1.25
    for x in (-3.0, 0.0, 3.0):
        for a, b in spans(DOOR_WALL_Y, DEPTH, 6.3):
            p.cylinder((x, a, HEIGHT - 0.2), (x, b, HEIGHT - 0.2), 0.07, m['post'], segments=10, taper=1.0)
    return p.join('hall_ceiling')


def gate_arc(radius, segments=40):
    # 月洞门：圆被地面截去一小段，从左下脚绕过顶到右下脚
    c = math.sqrt(radius * radius - GATE_CZ * GATE_CZ)
    a0 = math.atan2(-GATE_CZ, -c) + 2 * math.pi
    a1 = math.atan2(-GATE_CZ, c)
    return [(radius * math.cos(a0 + (a1 - a0) * i / segments), GATE_CZ + radius * math.sin(a0 + (a1 - a0) * i / segments))
            for i in range(segments + 1)], c


def build_ends(coll, m):
    p = Parts(coll)
    rnd = random.Random(31)
    top = [(HALF, HEIGHT), (-HALF, HEIGHT)]
    p.prism(door_wall_outline(top), DOOR_WALL_Y - 0.04, DOOR_WALL_Y, m['plaster'])
    for a, b in ((-HALF, -DOOR_W / 2 - 0.1), (DOOR_W / 2 + 0.1, HALF)):
        p.box(a, b, DOOR_WALL_Y, DOOR_WALL_Y + 0.04, 0, WAINSCOT, m['slat'])
    for s in (-1, 1):
        p.cylinder((s * (DOOR_W / 2 + 0.06), DOOR_WALL_Y + 0.06, 0), (s * (DOOR_W / 2 + 0.06), DOOR_WALL_Y + 0.06, DOOR_H + 0.1),
                   0.06, m['post'], segments=12, taper=1.0)
    p.cylinder((-DOOR_W / 2 - 0.2, DOOR_WALL_Y + 0.06, DOOR_H + 0.06), (DOOR_W / 2 + 0.2, DOOR_WALL_Y + 0.06, DOOR_H + 0.06),
               0.06, m['pole'], segments=12, taper=1.0)
    # 尽头墙与月洞门
    inner, c = gate_arc(GATE_R)
    outer, co = gate_arc(GATE_R + GATE_RING)
    p.prism([(-HALF, 0)] + inner + [(HALF, 0)] + top, DEPTH, DEPTH + 0.05, m['plaster'])
    p.prism(outer + list(reversed(inner)), DEPTH - 0.08, DEPTH + 0.3, m['stone'], bevel=0.01)
    for a, b in ((-HALF, -co - 0.05), (co + 0.05, HALF)):
        p.box(a, b, DEPTH - 0.04, DEPTH, 0, WAINSCOT, m['slat'])
    p.box(-co, co, DEPTH - 0.1, DEPTH + 0.32, 0, 0.06, m['stone'], bevel=0.01)
    # 门后小院：两侧粉墙，院墙一道黛瓦压顶，墙外是天光
    y0 = DEPTH + 0.05
    for s in (-1, 1):
        p.quad([(s * YARD_X, y0, 0), (s * YARD_X, YARD_Y, 0), (s * YARD_X, YARD_Y, HEIGHT), (s * YARD_X, y0, HEIGHT)],
               m['plaster'], (-s, 0, 0))
    p.quad([(-YARD_X, y0, 0), (YARD_X, y0, 0), (YARD_X, YARD_Y, 0), (-YARD_X, YARD_Y, 0)], m['pebble'], (0, 0, 1))
    p.quad([(-YARD_X, YARD_Y - 0.05, 0), (YARD_X, YARD_Y - 0.05, 0), (YARD_X, YARD_Y - 0.05, 2.2), (-YARD_X, YARD_Y - 0.05, 2.2)],
           m['plaster'], (0, -1, 0))
    p.prism([(-YARD_X, 2.2), (YARD_X, 2.2), (YARD_X, 2.3), (-YARD_X, 2.3)], YARD_Y - 0.2, YARD_Y, m['tile'])
    p.prism([(-YARD_X, 2.3), (YARD_X, 2.3), (YARD_X - 0.05, 2.42), (-YARD_X + 0.05, 2.42)], YARD_Y - 0.14, YARD_Y - 0.02, m['tile'])
    p.quad([(-YARD_X, YARD_Y, 2.2), (YARD_X, YARD_Y, 2.2), (YARD_X, YARD_Y, HEIGHT), (-YARD_X, YARD_Y, HEIGHT)], m['sky'], (0, -1, 0))
    p.quad([(-YARD_X, y0, HEIGHT), (YARD_X, y0, HEIGHT), (YARD_X, YARD_Y, HEIGHT), (-YARD_X, YARD_Y, HEIGHT)], m['sky'], (0, 0, -1))
    # 竹丛：竿子略微歪斜，上半截挂叶团
    for _ in range(20):
        x, y = rnd.uniform(-2.5, 2.5), rnd.uniform(DEPTH + 1.3, YARD_Y - 0.35)
        r = rnd.uniform(0.03, 0.055)
        lean = (rnd.uniform(-0.25, 0.25), rnd.uniform(-0.2, 0.1))
        p.cylinder((x, y, 0), (x + lean[0], y + lean[1], HEIGHT + 0.1), r, m['green'], segments=8, taper=0.8)
        for _ in range(7):
            t = rnd.uniform(0.3, 0.95)
            leaf_spray(p, (x + lean[0] * t + rnd.uniform(-0.2, 0.2), y + lean[1] * t + rnd.uniform(-0.15, 0.15), t * HEIGHT),
                       m['leaf'], rnd, count=12, length=0.42)
    # 太湖石
    bm_rock = p.ico((0.95, DEPTH + 1.0, 0.55), 0.5, m['rock'], squash=1.0, subdivisions=2)
    for v in bm_rock.data.vertices:
        n = v.co - Vector((0.95, DEPTH + 1.0, 0.55))
        v.co = Vector((0.95, DEPTH + 1.0, 0.55)) + Vector((n.x * 0.8, n.y * 0.6, n.z * 1.3)) * (0.8 + 0.4 * rnd.random())
    p.box(0.5, 1.4, DEPTH + 0.7, DEPTH + 1.3, 0, 0.08, m['stone'], bevel=0.01)
    return p.join('hall_ends')


def drum_stand(p, m, x, y):
    # 竹墩：竹片箍成的鼓墩，木面
    p.lathe([(0.3, 0), (0.36, 0.08), (0.37, 0.36), (0.36, 0.62), (0.32, DRUM_TOP - 0.04)], m['slat'], segments=20, at=(x, y, 0))
    for z in (0.08, DRUM_TOP - 0.1):
        p.lathe([(0.375, 0), (0.375, 0.035)], m['pole'], segments=20, at=(x, y, z))
    p.lathe([(0.36, 0), (0.37, 0.02), (0.36, 0.04)], m['timber'], segments=20, at=(x, y, DRUM_TOP - 0.04))


def incense_stand(p, m, x, y, top):
    # 香几：方几面、四腿、牙板、落地托泥
    h = 0.27
    p.box(x - h, x + h, y - h, y + h, top - 0.045, top, m['rosewood'], bevel=0.01)
    p.box(x - h + 0.02, x + h - 0.02, y - h + 0.02, y + h - 0.02, top - 0.13, top - 0.045, m['rosewood'])
    for dx in (-h + 0.04, h - 0.04):
        for dy in (-h + 0.04, h - 0.04):
            p.box(x + dx - 0.025, x + dx + 0.025, y + dy - 0.025, y + dy + 0.025, 0.05, top - 0.045, m['rosewood'])
    p.box(x - h - 0.01, x + h + 0.01, y - h - 0.01, y + h + 0.01, 0, 0.05, m['rosewood'], bevel=0.008)


def build_displays(coll, m):
    p = Parts(coll)
    for i, y in enumerate(stand_slots()):
        drum_stand(p, m, DRUM_X, y)
        x, top = FRONT_STAND if i % 2 == 0 else BACK_STAND
        incense_stand(p, m, x, y, top)
    return p.join('hall_displays')


def lamp_positions():
    return [(s * 2.4, u) for u in bay_centers() for s in (-1, 1)]


def build_props(coll, m):
    p = Parts(coll)
    rnd = random.Random(41)
    # 竹骨纸灯笼
    for x, y in lamp_positions():
        p.cylinder((x, y, 3.78), (x, y, HEIGHT - 0.08), 0.01, m['timber'], segments=6)
        p.lathe([(0.06, 0), (0.2, 0.06), (0.25, 0.2), (0.2, 0.36), (0.06, 0.42)], m['lamp'], segments=16, at=(x, y, 3.32))
        for z in (3.3, 3.73):
            p.lathe([(0.075, 0), (0.075, 0.03)], m['timber'], segments=12, at=(x, y, z))
    # 立柱脚下的竹编矮凳和花盆竹
    for side in (-1, 1):
        for u in (7.5, 17.5):
            x = side * (HALF - 0.6)
            p.lathe([(0.26, 0), (0.3, 0.05), (0.3, 0.36), (0.26, 0.42)], m['stone'], segments=16, at=(x, u + 0.9, 0))
            for _ in range(5):
                bx, by = x + rnd.uniform(-0.15, 0.15), u + 0.9 + rnd.uniform(-0.15, 0.15)
                tip = (bx + rnd.uniform(-0.3, 0.3), by + rnd.uniform(-0.3, 0.3), rnd.uniform(1.8, 2.6))
                p.cylinder((bx, by, 0.4), tip, 0.018, m['green'], segments=6, taper=0.7)
                leaf_spray(p, tip, m['leaf'], rnd, count=8)
    return p.join('hall_props')


def stand_targets():
    for i, y in enumerate(stand_slots()):
        yield (DRUM_X, y, DRUM_TOP + 0.35)
        x, top = FRONT_STAND if i % 2 == 0 else BACK_STAND
        yield (x, y, top + 0.45)


def build_hall():
    scene = get_scene(SCENE)
    coll = get_collection(scene, 'carving_hall')
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
    coll = get_collection(scene, 'carving_hall_lights')
    cool = (0.88, 0.96, 0.9)
    for side in (-1, 1):
        for u in bay_centers():
            area_light(coll, f'window_{side}_{u}', (side * (HALF + 0.4), u, 2.8), cool, 200,
                       (side * 1.0, u, 0.0), (2.0, 1.7))
    # 小院天光：从院顶照下，再从月洞门漫进厅里
    area_light(coll, 'yard_sky', (0, DEPTH + 1.5, HEIGHT - 0.05), (0.92, 0.97, 1.0), 380, (0, DEPTH + 1.5, 0), (5.4, 2.8))
    area_light(coll, 'gate_spill', (0, DEPTH + 0.6, 1.4), cool, 160, (0, DEPTH - 4, 0.6), (2.6, 2.6))
    for x, y in lamp_positions():
        add_light(coll, f'lamp_{x}_{y}', 'POINT', (x, y, 3.52), (1.0, 0.78, 0.52), 50, soft=0.22)
    exhibit_spots(coll, list(stand_targets()), lambda x: HEIGHT - 0.3, energy=320)
    for y in (5.0, 12.5, 20.0):
        area_light(coll, f'ceiling_fill_{y}', (0, y, HEIGHT - 0.35), (1.0, 0.9, 0.75), 35, (0, y, 0), (6.0, 6.0))
    door_spill(coll)
    set_world(scene, 'carving_hall_world', (0.45, 0.5, 0.45), 0.03)
    return coll


if __name__ == '__main__':
    preview_main(build_hall, light_hall, OUT)
