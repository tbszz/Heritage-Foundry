# 灯影雅集展厅（灯会戏楼）：深色木板墙、朱红立柱，顶下拉起一串串红灯笼，墙上挂风筝。
# 尽头一座小戏台，台心一面透光的皮影幕，幕前立着两个皮影人。左侧高木灯座陈灯彩，右侧红绸两级台陈戏曲与乐器。
# 预览：blender --background --python scripts/build-paper-hall.py -- --preview
import math
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from hall_kit import *  # noqa: E402,F401,F403

OUT = ROOT / 'artifacts/paper-hall'
SCENE = 'PaperHall'

BEAM_EVERY = 5.0
DADO = 1.0
LINTEL = 3.75                                   # 柱间额枋
POST_X, POST_TOP = -3.3, 1.25                   # 灯彩木灯座
FRONT_TIER, BACK_TIER = (2.8, 0.55), (3.8, 1.0) # 红绸两级台（x, 台面高）
STAGE_Y, STAGE_H = 23.2, 0.6                    # 戏台台口、台高
STAGE_X, EAVE = 3.2, (2.5, 2.8)                 # 戏台半宽、台口檐板上下沿（压低，给尽头墙标题让位）
SCREEN = (1.75, 1.05, 2.3)                      # 皮影幕半宽、下沿、上沿
LANTERN_X = (-4.0, -2.2, 2.2, 4.0)              # 灯笼串避开中线，不挡尽头标题
LANTERN_Y = [4.0 + 2.4 * i for i in range(8)]  # 首尾两端系在额枋梁上（2.5 / 22.5）

SPECIAL = {'hall_screen', 'hall_lamp'}
DROP = set()


def beam_positions():
    return [BEAM_EVERY / 2 + i * BEAM_EVERY for i in range(5)]


def bay_centers():
    return [5.0, 10.0, 15.0, 20.0]


def build_materials():
    return {
        'timber': wood_material('hall_timber', (0.045, 0.026, 0.014), (0.09, 0.055, 0.03), roughness=0.55),
        'board': plank_material('hall_wall_board', (0.06, 0.035, 0.018), (0.11, 0.07, 0.038), width=0.18),
        'plaster': plaster_material('hall_plaster', (0.36, 0.26, 0.17)),
        'floor': plank_material('hall_floor', (0.08, 0.05, 0.03), (0.16, 0.1, 0.06), width=0.24),
        'red': clay_material('hall_red', (0.3, 0.03, 0.018), mottle=0.15, scale=4.0, roughness=0.45, bump=0.0),
        'gold': flat_material('hall_gold', (0.52, 0.34, 0.09), 0.4),
        'cloth': cloth_material('hall_red_cloth', (0.19, 0.016, 0.011), (0.25, 0.04, 0.018), scale=7.0, roughness=0.8,
                                motif='voronoi'),
        'curtain': cloth_material('hall_curtain', (0.16, 0.014, 0.01), (0.3, 0.16, 0.04), scale=4.0, roughness=0.85,
                                  motif='voronoi'),
        'kite_a': cloth_material('hall_kite_a', (0.6, 0.42, 0.12), (0.4, 0.04, 0.02), scale=3.0, roughness=0.7),
        'kite_b': cloth_material('hall_kite_b', (0.55, 0.52, 0.44), (0.06, 0.12, 0.3), scale=4.0, roughness=0.7,
                                 motif='voronoi'),
        'string': flat_material('hall_string', (0.06, 0.04, 0.03), 0.8),
        'shadow': flat_material('hall_puppet', (0.02, 0.012, 0.008), 0.6),
        'screen': emissive_material('hall_screen', (1.0, 0.7, 0.36), 2.0, axis='Z',
                                    gradient=[(1.0, 0.6, 0.25), (1.0, 0.8, 0.5)], span=(SCREEN[1], SCREEN[2])),
        'lamp': emissive_material('hall_lamp', (1.0, 0.3, 0.1), 2.5)
    }


def build_side_wall(coll, m, side, name):
    p = Parts(coll)
    x = side * HALF
    wall_panels(p, side, m['board'], 0, DADO)
    wall_panels(p, side, m['plaster'], DADO, HEIGHT)
    inner = x - side * 0.06
    lo, hi = min(x, inner), max(x, inner)
    for a, b in spans(DOOR_WALL_Y, DEPTH, 2.5):
        p.box(lo, hi, a, b, DADO - 0.02, DADO + 0.06, m['timber'], bevel=0.008)
        p.box(lo, hi, a, b, 0, 0.12, m['timber'])
        p.box(lo, hi, a, b, LINTEL, LINTEL + 0.32, m['red'], bevel=0.008)
        p.box(min(x, x - side * 0.065), max(x, x - side * 0.065), a, b, LINTEL + 0.05, LINTEL + 0.07, m['gold'])
        p.box(min(x, x - side * 0.065), max(x, x - side * 0.065), a, b, LINTEL + 0.25, LINTEL + 0.27, m['gold'])
        p.box(lo, hi, a, b, HEIGHT - 0.22, HEIGHT, m['timber'])
    # 朱红立柱：石础、柱头雀替
    cx = x - side * 0.22
    for u in beam_positions():
        p.lathe([(0.28, 0), (0.28, 0.08), (0.22, 0.16)], m['timber'], segments=16, at=(cx, u, 0))
        p.cylinder((cx, u, 0.16), (cx, u, HEIGHT), 0.18, m['red'], segments=18, taper=1.0)
        for dy in (-1, 1):
            p.prism([(0, 0), (0.6, 0), (0.6, 0.06), (0.2, -0.2), (0, -0.28)], 0, 0.08, m['red'])
            ob = p.objects[-1]
            ob.rotation_euler = (0, 0, math.radians(90 * dy))
            ob.location = (cx + side * 0.04 - 0.04, u + dy * 0.16, LINTEL)
    # 风筝：每开间一大一小，菱形纸鸢拖两条尾巴
    rnd = random.Random(53 + side)
    for k, u in enumerate(bay_centers()):
        for j, (dy, size) in enumerate(((-1.1, 0.55), (1.2, 0.42))):
            mat = ('kite_a', 'kite_b')[(k + j) % 2]
            y, z = u + dy, 2.75 + rnd.uniform(-0.15, 0.2)
            px = x - side * 0.05
            p.quad([(px, y, z + size), (px, y + size * 0.7, z), (px, y, z - size * 1.1), (px, y - size * 0.7, z)],
                   m[mat], (-side, 0, 0))
            p.box(min(px, px - side * 0.012), max(px, px - side * 0.012), y - 0.008, y + 0.008, z - size * 1.1, z + size,
                  m['timber'])
            p.box(min(px, px - side * 0.012), max(px, px - side * 0.012), y - size * 0.7, y + size * 0.7, z - 0.008, z + 0.008,
                  m['timber'])
            for t in range(4):
                ty, tz = y + rnd.uniform(-0.05, 0.05), z - size * 1.1 - 0.12 - t * 0.17
                p.quad([(px, ty - 0.035, tz + 0.06), (px, ty + 0.035, tz + 0.06), (px, ty + 0.035, tz - 0.06),
                        (px, ty - 0.035, tz - 0.06)], m['cloth'], (-side, 0, 0))
    return p.join(name)


def build_ceiling(coll, m):
    p = Parts(coll)
    z = HEIGHT
    for a, b in spans(DOOR_WALL_Y, DEPTH, 6.3):
        for k in range(2):
            x0, x1 = -HALF + k * HALF, k * HALF
            p.quad([(x0, a, z), (x1, a, z), (x1, b, z), (x0, b, z)], m['board'], (0, 0, -1))
    for u in beam_positions():
        p.box(-HALF, HALF, u - 0.14, u + 0.14, z - 0.36, z, m['timber'], bevel=0.015)
        p.box(-HALF, HALF, u - 0.145, u + 0.145, z - 0.3, z - 0.27, m['red'])
    for x in (-3.1, 0.0, 3.1):
        for a, b in spans(DOOR_WALL_Y, DEPTH, 6.3):
            p.box(x - 0.08, x + 0.08, a, b, z - 0.18, z, m['timber'])
    return p.join('hall_ceiling')


def puppet(p, m, x0, y, outline, mirror=False):
    # 皮影人：薄片剪影 + 两根签子
    s = -1 if mirror else 1
    pts = [(x0 + s * px, SCREEN[1] + 0.12 + pz) for px, pz in outline]
    if mirror:
        pts.reverse()
    p.prism(pts, y - 0.006, y + 0.006, m['shadow'])
    top = max(pz for _, pz in outline)
    for px, pz in ((0.15, top * 0.55), (0.42, top * 0.62)):
        p.cylinder((x0 + s * px, y - 0.02, SCREEN[1] + 0.12 + pz), (x0 + s * (px + 0.1), y - 0.18, SCREEN[1] - 0.25),
                   0.006, m['string'], segments=4, taper=1.0)


WARRIOR = [(0.0, 0.0), (0.08, 0.0), (0.11, 0.3), (0.16, 0.3), (0.2, 0.0), (0.28, 0.0), (0.25, 0.36), (0.3, 0.55),
           (0.46, 0.5), (0.5, 0.56), (0.32, 0.68), (0.25, 0.72), (0.27, 0.8), (0.23, 0.9), (0.15, 0.94), (0.06, 0.98),
           (0.1, 0.88), (0.12, 0.8), (0.06, 0.72), (-0.04, 0.56), (0.02, 0.36)]
LADY = [(0.0, 0.0), (0.32, 0.0), (0.24, 0.42), (0.3, 0.56), (0.42, 0.66), (0.38, 0.7), (0.24, 0.64), (0.21, 0.74),
        (0.23, 0.82), (0.18, 0.9), (0.11, 0.88), (0.1, 0.78), (0.04, 0.7), (0.06, 0.44)]


def build_ends(coll, m):
    p = Parts(coll)
    top = [(HALF, HEIGHT), (-HALF, HEIGHT)]
    p.prism(door_wall_outline(top), DOOR_WALL_Y - 0.04, DOOR_WALL_Y, m['board'])
    for s in (-1, 1):
        x0 = s * DOOR_W / 2
        p.box(min(x0, x0 + s * 0.16), max(x0, x0 + s * 0.16), DOOR_WALL_Y, DOOR_WALL_Y + 0.08, 0, DOOR_H + 0.16,
              m['red'], bevel=0.01)
    p.box(-DOOR_W / 2 - 0.16, DOOR_W / 2 + 0.16, DOOR_WALL_Y, DOOR_WALL_Y + 0.1, DOOR_H, DOOR_H + 0.3, m['red'], bevel=0.01)
    p.box(-DOOR_W / 2 - 0.1, DOOR_W / 2 + 0.1, DOOR_WALL_Y + 0.1, DOOR_WALL_Y + 0.11, DOOR_H + 0.08, DOOR_H + 0.22, m['gold'])
    # 尽头墙：下半深色板墙，上半土红粉墙（标题贴在这一段）
    p.prism([(-HALF, 0), (HALF, 0), (HALF, DADO), (-HALF, DADO)], DEPTH, DEPTH + 0.05, m['board'])
    p.prism([(-HALF, DADO), (HALF, DADO), (HALF, HEIGHT), (-HALF, HEIGHT)], DEPTH, DEPTH + 0.05, m['plaster'])
    p.box(-HALF, HALF, DEPTH - 0.06, DEPTH, HEIGHT - 0.22, HEIGHT, m['timber'])
    # 戏台：台基、红台裙、四根朱柱、压低的檐板
    p.box(-STAGE_X, STAGE_X, STAGE_Y, DEPTH - 0.05, 0, STAGE_H, m['timber'], bevel=0.02)
    p.box(-STAGE_X - 0.02, STAGE_X + 0.02, STAGE_Y - 0.02, STAGE_Y + 0.02, 0.08, STAGE_H - 0.06, m['cloth'])
    p.box(-STAGE_X - 0.03, STAGE_X + 0.03, STAGE_Y - 0.03, STAGE_Y + 0.03, STAGE_H - 0.06, STAGE_H - 0.03, m['gold'])
    for x in (-STAGE_X + 0.15, STAGE_X - 0.15):
        for y in (STAGE_Y + 0.15, DEPTH - 0.3):
            p.cylinder((x, y, STAGE_H), (x, y, EAVE[1]), 0.11, m['red'], segments=14, taper=1.0)
    p.box(-STAGE_X - 0.1, STAGE_X + 0.1, STAGE_Y + 0.02, STAGE_Y + 0.22, EAVE[0], EAVE[1], m['red'], bevel=0.012)
    p.box(-STAGE_X - 0.1, STAGE_X + 0.1, STAGE_Y + 0.0, STAGE_Y + 0.02, EAVE[0] + 0.05, EAVE[0] + 0.08, m['gold'])
    p.box(-STAGE_X - 0.1, STAGE_X + 0.1, STAGE_Y + 0.0, STAGE_Y + 0.02, EAVE[1] - 0.08, EAVE[1] - 0.05, m['gold'])
    p.box(-STAGE_X - 0.15, STAGE_X + 0.15, STAGE_Y - 0.05, DEPTH - 0.05, EAVE[1], EAVE[1] + 0.08, m['timber'], bevel=0.01)
    # 两侧垂幔：从檐下垂到台面，褶子用正弦起伏
    for s in (-1, 1):
        xa, xb = s * (STAGE_X - 0.3), s * (STAGE_X - 1.05)

        def drape(u, v, xa=xa, xb=xb):
            return (xa + (xb - xa) * u * (1 - 0.35 * v), STAGE_Y + 0.3 + 0.05 * math.sin(u * 22),
                    EAVE[0] - (EAVE[0] - STAGE_H - 0.02) * v)
        p.grid(drape, 24, 6, m['curtain'], lambda c: (0, -1, 0))
    # 皮影幕：木框 + 透光幕面，幕前两个皮影人对戏
    sx, z0, z1 = SCREEN
    yb = DEPTH - 0.55
    p.quad([(-sx, yb, z0), (sx, yb, z0), (sx, yb, z1), (-sx, yb, z1)], m['screen'], (0, -1, 0))
    for a, b, c, d in ((-sx - 0.1, -sx, z0 - 0.1, z1 + 0.1), (sx, sx + 0.1, z0 - 0.1, z1 + 0.1),
                       (-sx, sx, z0 - 0.1, z0), (-sx, sx, z1, z1 + 0.1)):
        p.box(a, b, yb - 0.04, yb + 0.04, c, d, m['timber'])
    p.box(-sx - 0.1, sx + 0.1, yb - 0.3, yb + 0.06, STAGE_H, z0 - 0.1, m['cloth'])
    puppet(p, m, -0.75, yb - 0.03, WARRIOR)
    puppet(p, m, 0.8, yb - 0.03, LADY, mirror=True)
    # 台口两侧的锣鼓架
    for s in (-1, 1):
        x, y = s * (STAGE_X - 0.6), STAGE_Y + 0.9
        p.cylinder((x, y, STAGE_H), (x, y, STAGE_H + 0.5), 0.025, m['timber'], segments=6, taper=1.0)
        p.lathe([(0.22, 0), (0.24, 0.08), (0.24, 0.24), (0.22, 0.32)], m['red'], segments=16, at=(x, y, STAGE_H + 0.5))
        p.lathe([(0.225, 0), (0.225, 0.01)], m['gold'], segments=16, at=(x, y, STAGE_H + 0.56))
        p.lathe([(0.225, 0), (0.225, 0.01)], m['gold'], segments=16, at=(x, y, STAGE_H + 0.76))
    return p.join('hall_ends')


def build_displays(coll, m):
    p = Parts(coll)
    slots = stand_slots()
    # 左：高木灯座
    for y in slots:
        x = POST_X
        p.box(x - 0.3, x + 0.3, y - 0.3, y + 0.3, 0, 0.08, m['timber'], bevel=0.01)
        p.box(x - 0.08, x + 0.08, y - 0.08, y + 0.08, 0.08, POST_TOP - 0.08, m['timber'], bevel=0.008)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            p.box(x + dx * 0.08 - 0.02 + dx * 0.06, x + dx * 0.08 + 0.02 + dx * 0.06,
                  y + dy * 0.08 - 0.02 + dy * 0.06, y + dy * 0.08 + 0.02 + dy * 0.06, 0.08, 0.3, m['timber'])
        p.box(x - 0.26, x + 0.26, y - 0.26, y + 0.26, POST_TOP - 0.08, POST_TOP, m['red'], bevel=0.008)
        p.box(x - 0.265, x + 0.265, y - 0.265, y + 0.265, POST_TOP - 0.05, POST_TOP - 0.04, m['gold'])
    # 右：每两个展位共用一座红绸两级台，前低后高
    for k in range(0, len(slots), 2):
        y0, y1 = slots[k] - 0.6, slots[k + 1] + 0.6
        fx, ft = FRONT_TIER
        bx, bt = BACK_TIER
        p.box(fx - 0.45, bx + 0.5, y0, y1, 0, ft, m['cloth'], bevel=0.02)
        p.box(bx - 0.45, bx + 0.5, y0 + 0.02, y1 - 0.02, ft, bt, m['cloth'], bevel=0.02)
        p.box(fx - 0.46, fx - 0.44, y0, y1, ft - 0.06, ft - 0.03, m['gold'])
        p.box(bx - 0.46, bx - 0.44, y0 + 0.02, y1 - 0.02, bt - 0.06, bt - 0.03, m['gold'])
        p.box(fx - 0.47, bx + 0.52, y0 - 0.02, y1 + 0.02, 0, 0.06, m['timber'])
    return p.join('hall_displays')


def lantern_top(x):
    # 内两串垂得低些，外两串贴近墙
    return HEIGHT - 0.36 - (0.55 if abs(x) < 3 else 0.3)


def lantern(p, m, x, y, z, r=0.22):
    p.lathe([(0.07, 0), (r * 0.8, r * 0.3), (r, r * 0.9), (r * 0.8, r * 1.5), (0.07, r * 1.8)], m['lamp'], segments=16,
            at=(x, y, z))
    p.lathe([(0.085, 0), (0.085, 0.05)], m['gold'], segments=12, at=(x, y, z + r * 1.8 - 0.01))
    p.lathe([(0.085, 0), (0.085, 0.05)], m['gold'], segments=12, at=(x, y, z - 0.04))
    p.cylinder((x, y, z - 0.04), (x, y, z - 0.32), 0.022, m['cloth'], segments=6, taper=0.4)


def build_props(coll, m):
    p = Parts(coll)
    # 一串串红灯笼：灯顶齐平挂在一根线上，线两头斜拉到梁底
    for x in LANTERN_X:
        top = lantern_top(x)
        line = [(BEAM_EVERY / 2, HEIGHT - 0.36), (LANTERN_Y[0], top), (LANTERN_Y[-1], top), (DEPTH - BEAM_EVERY / 2, HEIGHT - 0.36)]
        for (ya, za), (yb, zb) in zip(line, line[1:]):
            p.cylinder((x, ya, za), (x, yb, zb), 0.006, m['string'], segments=4, taper=1.0)
        for y in LANTERN_Y:
            lantern(p, m, x, y, top - 0.4)
    return p.join('hall_props')


def stand_targets():
    slots = stand_slots()
    for i, y in enumerate(slots):
        yield (POST_X, y, POST_TOP + 0.35)
        x, top = FRONT_TIER if i % 2 == 0 else BACK_TIER
        yield (x, y, top + 0.35)


def build_hall():
    scene = get_scene(SCENE)
    coll = get_collection(scene, 'paper_hall')
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
    coll = get_collection(scene, 'paper_hall_lights')
    warm = (1.0, 0.78, 0.52)
    for x in LANTERN_X:
        for y in LANTERN_Y:
            add_light(coll, f'lantern_{x}_{y}', 'POINT', (x, y, lantern_top(x) - 0.2), (1.0, 0.4, 0.18), 32, soft=0.2)
    exhibit_spots(coll, list(stand_targets()), lambda x: HEIGHT - 0.4, energy=320, angle=24)
    # 皮影幕背光：从幕后往台前打，幕面本身另算发光
    area_light(coll, 'screen_back', (0, DEPTH - 0.3, 1.7), (1.0, 0.68, 0.36), 160, (0, STAGE_Y - 2, 1.0), (3.0, 1.2))
    spot = add_light(coll, 'stage_key', 'SPOT', (0, STAGE_Y - 4.5, HEIGHT - 0.45), warm, 520,
                     target=(0, STAGE_Y + 0.8, STAGE_H + 0.6), soft=0.3)
    spot.spot_size, spot.spot_blend = math.radians(60), 0.85
    for y in (5.0, 12.5, 20.0):
        area_light(coll, f'ceiling_fill_{y}', (0, y, HEIGHT - 0.45), warm, 30, (0, y, 0), (6.0, 6.0))
    door_spill(coll, 110)
    set_world(scene, 'paper_hall_world', (0.3, 0.22, 0.16), 0.025)
    return coll


if __name__ == '__main__':
    preview_main(build_hall, light_hall, OUT)
