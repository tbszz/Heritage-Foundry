// 主题展厅：每个厅按自己的技艺长出不同的空间，没有主题的厅沿用 SketchCorridorScene 的默认展厅。
// 厅内一律用局部坐标搭建：原点在门洞中心地面，-z 走向展厅深处，+x 是面朝厅内时的右手边。
// 场景只需把这个局部根节点摆到门后并转向，左右两侧的厅就共用同一套搭建代码。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// 火土新生：一段龙窑。砖砌拱顶 + 拱券，左侧玻璃展柜陈瓷器，右侧两级陶台列泥塑，尽头窑口透火。
export const EARTH_HALL = {
  vaultRise: 1.2,        // 拱顶比墙顶高出的矢高
  archEvery: 5,          // 拱券间距（进深方向）
  firstU: 4,             // 第一件展品距门洞的进深
  spacing: 2,            // 展品排距
  perSide: 10,           // 每侧最多陈列件数
  vitrineX: -3.2,        // 左侧瓷器展柜中心
  vitrineTop: 1.06,      // 展柜台面高度
  vitrineModelSize: 0.72,
  frontTier: { x: 2.8, top: 0.5 },   // 陶台前级
  backTier: { x: 3.8, top: 0.95 },   // 陶台后级
  figureModelSize: 0.95,
  kiln: { width: 2.2, springing: 1.5, depth: 0.8 }, // 窑口宽、起拱高度、窑膛深
  // Blender 建模 + Cycles 烘焙的厅体（scripts/bake-hall.py）；加载前后都先用下面的程序化厅体顶着
  shellUrl: '/models/architecture/earth-hall.glb',
  lamps: [5, 10, 15, 20].flatMap((u) => [[-2.4, u], [2.4, u]]), // 烘焙件里吊灯的位置 [x, u]
  lampY: 3.42
};

// 纯函数：火土厅的展位。瓷器进左侧展柜；泥塑等其余展品前后交错站上右侧陶台；
// 两侧都从门口往里按排距排开，再按进深合并成一条参观顺序（数字快捷键按这个顺序）。
export function getEarthHallLayout(crafts = []) {
  const isPorcelain = (craft) => craft?.category === '陶瓷';
  const vitrines = crafts.filter(isPorcelain).slice(0, EARTH_HALL.perSide).map((craft, slot) => ({
    craft,
    kind: 'vitrine',
    slot,
    u: EARTH_HALL.firstU + slot * EARTH_HALL.spacing,
    x: EARTH_HALL.vitrineX,
    top: EARTH_HALL.vitrineTop,
    anchorY: EARTH_HALL.vitrineTop + 0.46,
    modelSize: EARTH_HALL.vitrineModelSize
  }));
  const figures = crafts.filter((craft) => !isPorcelain(craft)).slice(0, EARTH_HALL.perSide).map((craft, slot) => {
    const tier = slot % 2 === 0 ? 'front' : 'back';
    const { x, top } = tier === 'front' ? EARTH_HALL.frontTier : EARTH_HALL.backTier;
    return {
      craft,
      kind: 'figure',
      tier,
      slot,
      u: EARTH_HALL.firstU + slot * EARTH_HALL.spacing,
      x,
      top,
      anchorY: top + 0.56,
      modelSize: EARTH_HALL.figureModelSize
    };
  });
  return [...vitrines, ...figures]
    .sort((a, b) => a.u - b.u || a.x - b.x)
    .map((item, index) => ({ ...item, id: item.craft.id, index, row: item.slot }));
}

// 纯函数：拱顶截面——墙顶以上的弓形高度，x 为横向偏移（厅宽 width，矢高 rise）。
export function getVaultSag(x, width, rise = EARTH_HALL.vaultRise) {
  const half = width / 2;
  const radius = (half * half + rise * rise) / (2 * rise);
  const clamped = Math.min(Math.abs(x), half);
  return Math.sqrt(radius * radius - clamped * clamped) - (radius - rise);
}

// 其余四厅：厅体全在烘焙件里（scripts/build-<id>-hall.py），网页端只按配置摆展位、名牌、柔影和辉光。
// 每侧的 tiers 按展位顺序循环取用：一级就是一排同高的展座，两级就是前低后高交错。
// labelOffset / labelY：名牌贴在展座朝过道一面的位置；titleY：尽头墙标题中心高度（避开烘焙件里的屏风、戏台檐板）；titleInk：浅色墙上的副标题颜色。
// lamps：烘焙件里灯笼的位置 [x, 高度, 进深, 光晕缩放]。
const bayLamps = (y) => [5, 10, 15, 20].flatMap((u) => [[-2.4, y, u], [2.4, y, u]]);

export const BAKED_HALLS = {
  thread: {
    title: '经纬成章',
    left: {
      category: '织绣', glass: true, slab: 0x7a2a1e, modelSize: 0.72, labelWidth: 0.78,
      tiers: [{ x: -3.2, top: 1.06, labelY: 0.6, labelOffset: 0.415 }]
    },
    right: { modelSize: 0.8, labelWidth: 0.56, tiers: [{ x: 3.4, top: 0.846, labelY: 0.73, labelOffset: 0.37 }] },
    titleY: 3.95,
    titleInk: '#5a4030',
    palette: { floor: 0x5b4331, wall: 0xb8a07c, ceiling: 0x3b2618, stand: 0x4a2a1a },
    light: 0xffc48a,
    lampColor: 0xffb066,
    lamps: bayLamps(3.5)
  },
  carving: {
    title: '竹木清韵',
    left: { category: '竹编', modelSize: 0.72, labelWidth: 0.6, tiers: [{ x: -3.2, top: 0.74, labelY: 0.4, labelOffset: 0.38 }] },
    right: {
      modelSize: 0.72, labelWidth: 0.5,
      tiers: [{ x: 2.9, top: 0.9, labelY: 0.81, labelOffset: 0.28 }, { x: 3.9, top: 1.2, labelY: 1.11, labelOffset: 0.28 }]
    },
    titleY: 3.75,
    titleInk: '#5a4632',
    palette: { floor: 0x6b4c30, wall: 0xc9bb9c, ceiling: 0x6a5230, stand: 0x8a6a3a },
    light: 0xfff0d8,
    lampColor: 0xffd49a,
    lamps: bayLamps(3.53),
    // 月洞门里透出的园子天光
    glows: [{ x: 0, y: 1.35, u: 25.05, width: 3.6, height: 3.4, color: 0xd6f0dc, opacity: 0.22 }]
  },
  lacquer: {
    title: '金漆流光',
    left: {
      category: '漆器', glass: true, slab: 0x5a1410, modelSize: 0.72, labelWidth: 0.78,
      tiers: [{ x: -3.2, top: 1.0, labelY: 0.55, labelOffset: 0.415 }]
    },
    right: {
      glass: true, slab: 0x1c1210, modelSize: 0.72, labelWidth: 0.78,
      tiers: [{ x: 3.2, top: 1.12, labelY: 0.6, labelOffset: 0.415 }]
    },
    titleY: 3.75,
    palette: { floor: 0x1e1c1a, wall: 0x1a1110, ceiling: 0x241410, stand: 0x140c0a },
    light: 0xffc890,
    lampColor: 0xff6a3a,
    lamps: [
      ...bayLamps(3.47),
      ...[7.5, 12.5, 17.5].flatMap((u) => [[-5.25, 1.72, u, 0.5], [5.25, 1.72, u, 0.5]]) // 柱前铜灯檠
    ]
  },
  paper: {
    title: '灯影雅集',
    left: { category: '灯彩', modelSize: 0.8, labelWidth: 0.5, tiers: [{ x: -3.3, top: 1.25, labelY: 0.72, labelOffset: 0.09 }] },
    right: {
      modelSize: 0.85, labelWidth: 0.9,
      tiers: [{ x: 2.8, top: 0.55, labelY: 0.29, labelOffset: 0.46 }, { x: 3.8, top: 1.0, labelY: 0.78, labelOffset: 0.46 }]
    },
    titleY: 3.95,
    palette: { floor: 0x4a3020, wall: 0x5c3a24, ceiling: 0x24160c, stand: 0x6a1a10 },
    light: 0xffb27a,
    lampColor: 0xff5a28,
    // 四串红灯笼：内两串灯心约 3.49m，外两串约 3.74m
    lamps: [-4.0, -2.2, 2.2, 4.0].flatMap((x) => Array.from({ length: 8 }, (_, i) => [x, Math.abs(x) < 3 ? 3.49 : 3.74, 4 + 2.4 * i, 0.8])),
    // 皮影幕透出的烛光，会轻轻跳
    glows: [{ x: 0, y: 1.68, u: 24.4, width: 4.6, height: 2.6, color: 0xffa040, opacity: 0.32, flicker: true }]
  }
};

// 纯函数：烘焙厅的展位。左侧放 left.category，其余进右侧；每侧最多 perSide 件，
// 按排距从门口往里排，再按进深合并成参观顺序（与火土厅一致）。
export function getBakedHallLayout(hallId, crafts = []) {
  const hall = BAKED_HALLS[hallId];
  if (!hall) return [];
  const { firstU, spacing, perSide } = EARTH_HALL;
  const place = (sideName, list) => {
    const side = hall[sideName];
    return list.slice(0, perSide).map((craft, slot) => {
      const tier = slot % side.tiers.length;
      return {
        craft,
        kind: side.glass ? 'case' : 'stand',
        side: sideName,
        tier,
        slot,
        u: firstU + slot * spacing,
        ...side.tiers[tier],
        labelWidth: side.labelWidth,
        anchorY: side.tiers[tier].top + side.modelSize * 0.62,
        modelSize: side.modelSize
      };
    });
  };
  const isLeft = (craft) => craft?.category === hall.left.category;
  return [...place('left', crafts.filter(isLeft)), ...place('right', crafts.filter((craft) => !isLeft(craft)))]
    .sort((a, b) => a.u - b.u || a.x - b.x)
    .map((item, index) => ({ ...item, id: item.craft.id, index, row: item.slot }));
}

export function getBakedHallShellUrl(hallId) {
  return `/models/architecture/${hallId}-hall.glb`;
}

const HALL_BUILDERS = {
  earth: buildEarthHall,
  ...Object.fromEntries(Object.keys(BAKED_HALLS).map((id) => [id, buildBakedHall]))
};

export function hasThemedHall(chapterId) {
  return Boolean(HALL_BUILDERS[chapterId]);
}

// 搭建主题展厅。api 由场景提供：room 尺寸、贴图各向异性、名牌与标题贴图。
// 返回 { stands, update }；stands 结构与默认展厅一致，可直接并入 door.roomStands。
export function buildThemedHall(door, root, api) {
  const builder = HALL_BUILDERS[door.chapter?.id];
  return builder ? builder(door, root, api) : null;
}

function buildEarthHall(door, root, api) {
  const { room } = api;
  const width = room.width;
  const depth = room.depth;
  const half = width / 2;
  const sag = (x) => getVaultSag(x, width);

  const brick = makeBrickCanvas();
  const brickTexture = (repeatX, repeatY) => canvasTexture(brick, repeatX, repeatY, api.anisotropy);
  const wallMaterial = new THREE.MeshStandardMaterial({ map: brickTexture(depth / 2, room.height / 2), roughness: 0.92, metalness: 0.02 });
  const vaultMaterial = new THREE.MeshStandardMaterial({ map: brickTexture(width / 2, depth / 2), roughness: 0.95, metalness: 0.02, color: 0x8c7468 });
  const capMaterial = new THREE.MeshStandardMaterial({ color: 0x4e2a1d, roughness: 0.95, side: THREE.DoubleSide });
  const ribMaterial = new THREE.MeshStandardMaterial({ color: 0x5b2d1d, roughness: 0.9, metalness: 0.02 });
  const terracotta = new THREE.MeshStandardMaterial({ color: 0x9a5236, roughness: 0.86, metalness: 0.02 });
  const fired = new THREE.MeshStandardMaterial({ color: 0x3b2219, roughness: 0.8, metalness: 0.04 });

  // 程序化厅体：烘焙 GLB 到手前（或加载失败时）的替身，加载成功后整组隐藏
  const fallback = new THREE.Group();
  fallback.name = 'earth_hall_fallback';
  root.add(fallback);

  // 方砖地面
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({ map: canvasTexture(makeFloorTileCanvas(), width / 3, depth / 3, api.anisotropy), roughness: 0.84, metalness: 0.03 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -depth / 2);
  fallback.add(floor);

  // 两侧砖墙
  [-1, 1].forEach((side) => {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(depth, room.height), wallMaterial);
    wall.rotation.y = -side * Math.PI / 2;
    wall.position.set(side * half, room.height / 2, -depth / 2);
    fallback.add(wall);
  });

  // 拱顶：横向分段的平面按弓形抬起，朝下受光
  const vaultGeometry = new THREE.PlaneGeometry(width, depth, 32, 1);
  vaultGeometry.rotateX(Math.PI / 2);
  const vaultPosition = vaultGeometry.getAttribute('position');
  for (let i = 0; i < vaultPosition.count; i++) {
    vaultPosition.setY(i, room.height + sag(vaultPosition.getX(i)));
  }
  vaultGeometry.translate(0, 0, -depth / 2);
  vaultGeometry.computeVertexNormals();
  fallback.add(new THREE.Mesh(vaultGeometry, vaultMaterial));

  // 两端山墙顶：补齐墙顶与拱顶之间的弓形
  const capShape = new THREE.Shape();
  capShape.moveTo(-half, 0);
  for (let i = 0; i <= 32; i++) {
    const x = -half + (i / 32) * width;
    capShape.lineTo(x, sag(x));
  }
  capShape.lineTo(half, 0);
  const capGeometry = new THREE.ShapeGeometry(capShape);
  [-0.16, -depth + 0.01].forEach((z) => {
    const cap = new THREE.Mesh(capGeometry, capMaterial);
    cap.position.set(0, room.height, z);
    fallback.add(cap);
  });

  // 尽头墙：留出窑口
  const { kiln } = EARTH_HALL;
  const kilnRadius = kiln.width / 2;
  const kilnTop = kiln.springing + kilnRadius;
  const farWallShape = new THREE.Shape([
    new THREE.Vector2(-half, 0),
    ...archNotch(kilnRadius, kiln.springing),
    new THREE.Vector2(half, 0),
    new THREE.Vector2(half, room.height),
    new THREE.Vector2(-half, room.height)
  ]);
  const farWallGeometry = new THREE.ShapeGeometry(farWallShape);
  setPlanarUv(farWallGeometry, depth, room.height);
  const farWall = new THREE.Mesh(farWallGeometry, wallMaterial);
  farWall.position.z = -depth;
  fallback.add(farWall);

  // 门洞墙：回身看时是砖墙而非走廊墙背面
  const doorway = api.doorway;
  const doorWallShape = new THREE.Shape([
    new THREE.Vector2(-half, 0),
    new THREE.Vector2(-doorway.width / 2, 0),
    new THREE.Vector2(-doorway.width / 2, doorway.height),
    new THREE.Vector2(doorway.width / 2, doorway.height),
    new THREE.Vector2(doorway.width / 2, 0),
    new THREE.Vector2(half, 0),
    new THREE.Vector2(half, room.height),
    new THREE.Vector2(-half, room.height)
  ]);
  const doorWallGeometry = new THREE.ShapeGeometry(doorWallShape);
  setPlanarUv(doorWallGeometry, depth, room.height);
  const doorWall = new THREE.Mesh(doorWallGeometry, wallMaterial);
  doorWall.rotation.y = Math.PI;
  doorWall.position.z = -0.16; // 走廊墙模块厚 0.12m，贴在它背后
  fallback.add(doorWall);

  // 拱券：贴墙砖柱 + 沿拱顶的券带，合成一份几何
  const ribParts = [];
  const pilaster = new THREE.BoxGeometry(0.35, room.height, 0.5);
  const bandShape = new THREE.Shape();
  const bandInset = 0.35;
  const bandThickness = 0.32;
  for (let i = 0; i <= 32; i++) {
    const x = -half + (i / 32) * width;
    const y = room.height + sag(x) + 0.02;
    if (i === 0) bandShape.moveTo(x, y);
    else bandShape.lineTo(x, y);
  }
  for (let i = 32; i >= 0; i--) {
    const x = -(half - bandInset) + (i / 32) * (width - bandInset * 2);
    bandShape.lineTo(x, room.height + sag(x) - bandThickness);
  }
  bandShape.closePath();
  const band = new THREE.ExtrudeGeometry(bandShape, { depth: 0.5, bevelEnabled: false, curveSegments: 1 });
  band.translate(0, 0, -0.25);
  for (let u = EARTH_HALL.archEvery / 2; u < depth; u += EARTH_HALL.archEvery) {
    [-1, 1].forEach((side) => {
      ribParts.push(pilaster.clone().translate(side * (half - 0.175), room.height / 2, -u));
    });
    ribParts.push(band.clone().translate(0, 0, -u));
  }
  // 窑口券脸：环绕窑口的砖拱，向后延伸成窑膛内壁
  // 倒 U 形：外拱从右脚翻到左脚，再沿内拱翻回
  const kilnFace = new THREE.Shape([
    ...archNotch(kilnRadius + 0.35, kiln.springing).reverse(),
    ...archNotch(kilnRadius, kiln.springing)
  ]);
  const kilnFaceGeometry = new THREE.ExtrudeGeometry(kilnFace, { depth: kiln.depth + 0.12, bevelEnabled: false, curveSegments: 1 });
  kilnFaceGeometry.translate(0, 0, -depth - kiln.depth);
  ribParts.push(kilnFaceGeometry);
  fallback.add(new THREE.Mesh(mergeIndexed(ribParts), ribMaterial));
  [pilaster, band, ...ribParts].forEach((geometry) => geometry.dispose());

  // 窑火：窑膛底的炽热渐变 + 一盏会闪的火光
  const fireGeometry = new THREE.ShapeGeometry(new THREE.Shape(archOutline(kilnRadius, kiln.springing)));
  const fireTexture = new THREE.CanvasTexture(makeKilnFireCanvas());
  fireTexture.colorSpace = THREE.SRGBColorSpace;
  fireTexture.repeat.set(1 / kiln.width, 1 / kilnTop);
  fireTexture.offset.set(0.5, 0);
  const fire = new THREE.Mesh(fireGeometry, new THREE.MeshBasicMaterial({ map: fireTexture, toneMapped: false, fog: false }));
  fire.position.z = -depth - kiln.depth + 0.02;
  root.add(fire);

  const kilnLight = new THREE.PointLight(0xff7a2e, 7, 13, 1.6);
  kilnLight.position.set(0, 1.1, -depth + 1.0);
  root.add(kilnLight);

  // 展厅标题悬在窑口上方
  const title = new THREE.Mesh(
    new THREE.PlaneGeometry(4.0, 2.0),
    new THREE.MeshBasicMaterial({ map: api.makeRoomTitleTexture(door.chapter), transparent: true, toneMapped: false, fog: false })
  );
  title.position.set(0, kilnTop + 0.35 + 1.0 - 0.2, -depth + 0.08);
  root.add(title);

  // 火星：从窑口飘出、缓慢上升
  const embers = makeEmbers(kiln.width, kilnTop, -depth);
  root.add(embers.points);

  // 匣钵垛：贴墙堆在拱券之间
  const saggars = makeSaggarStacks([
    ...[5, 10, 15, 20].flatMap((u, i) => [
      { x: -(half - 0.75), u, count: 3 + (i % 3) },
      { x: half - 0.75, u: u + 0.4, count: 4 + ((i + 1) % 2) }
    ]),
    { x: -(half - 1.3), u: depth - 1.0, count: 5 },
    { x: half - 1.3, u: depth - 1.2, count: 4 },
    { x: -(half - 2.0), u: depth - 0.8, count: 2 }
  ]);
  fallback.add(saggars);

  // 右侧两级陶台
  const tierLength = (EARTH_HALL.perSide - 1) * EARTH_HALL.spacing + 2.6;
  const tierCenter = -(EARTH_HALL.firstU + ((EARTH_HALL.perSide - 1) * EARTH_HALL.spacing) / 2);
  [EARTH_HALL.frontTier, EARTH_HALL.backTier].forEach(({ x, top }) => {
    const tier = new THREE.Mesh(new THREE.BoxGeometry(1.0, top, tierLength), terracotta);
    tier.position.set(x, top / 2, tierCenter);
    fallback.add(tier);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.04, tierLength + 0.04), fired);
    lip.position.set(x, top + 0.02, tierCenter);
    fallback.add(lip);
  });

  // 厅内照明：两盏暖橙主光，与窑火一起只在入厅时可见（随根节点显隐）
  [-depth * 0.3, -depth * 0.72].forEach((z) => {
    const light = new THREE.PointLight(0xffc48a, 5.5, 34, 1.2);
    light.position.set(0, room.height - 0.3, z);
    root.add(light);
  });

  // 展位
  const plinthGeometry = new THREE.BoxGeometry(0.8, EARTH_HALL.vitrineTop - 0.06, 0.8);
  const slabGeometry = new THREE.BoxGeometry(0.9, 0.06, 0.9);
  const celadon = new THREE.MeshStandardMaterial({ color: 0x86a894, roughness: 0.32, metalness: 0.05 });
  const glassGeometry = new THREE.BoxGeometry(0.86, 1.0, 0.86);
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: 0xe4f0ea, transparent: true, opacity: 0.1, roughness: 0.05, metalness: 0.2, depthWrite: false
  });
  const glassEdges = new THREE.EdgesGeometry(glassGeometry);
  const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xc99a2e, transparent: true, opacity: 0.55 });
  // 展品脚下的柔影：模型是实时加载的，烘焙图里没有它们的影子
  const glowTexture = new THREE.CanvasTexture(makeRadialCanvas());
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  const shadowMaterial = new THREE.MeshBasicMaterial({
    color: 0x000000, map: glowTexture, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false, fog: false
  });
  const shadowGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

  const stands = getEarthHallLayout(door.chapter.crafts || []).map((layout) => {
    const group = new THREE.Group();
    group.position.set(layout.x, 0, -layout.u);
    // 名牌放在展位朝向中间过道的一侧
    const aisleSide = layout.x < 0 ? 1 : -1;

    if (layout.kind === 'vitrine') {
      const plinth = new THREE.Mesh(plinthGeometry, fired);
      plinth.position.set(layout.x, (EARTH_HALL.vitrineTop - 0.06) / 2, -layout.u);
      fallback.add(plinth); // 烘焙件里已有展台
      const slab = new THREE.Mesh(slabGeometry, celadon);
      slab.position.y = EARTH_HALL.vitrineTop - 0.03;
      group.add(slab);
      const glass = new THREE.Mesh(glassGeometry, glassMaterial);
      glass.position.y = EARTH_HALL.vitrineTop + 0.5;
      glass.renderOrder = 2;
      group.add(glass);
      const edges = new THREE.LineSegments(glassEdges, edgeMaterial);
      edges.position.copy(glass.position);
      group.add(edges);
    }

    // 名牌贴在展台/陶台立面上（不用朝向相机的精灵：斜看时会插进台子被遮掉一半）
    const labelWidth = layout.kind === 'vitrine' ? 0.78 : 1.1;
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(labelWidth, labelWidth / 4),
      new THREE.MeshBasicMaterial({ map: api.makeStandLabelTexture(layout.craft), transparent: true, toneMapped: false, fog: false })
    );
    label.rotation.y = aisleSide * Math.PI / 2;
    if (layout.kind === 'vitrine') label.position.set(aisleSide * 0.41, 0.6, 0);
    else if (layout.tier === 'front') label.position.set(aisleSide * 0.51, EARTH_HALL.frontTier.top / 2, 0);
    else label.position.set(aisleSide * 0.51, (EARTH_HALL.frontTier.top + EARTH_HALL.backTier.top) / 2, 0);
    group.add(label);

    const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
    shadow.scale.setScalar(layout.modelSize * 1.15);
    shadow.position.y = layout.kind === 'vitrine' ? layout.top + 0.002 : layout.top + 0.042;
    shadow.raycast = () => {};
    group.add(shadow);

    const modelAnchor = new THREE.Group();
    modelAnchor.position.y = layout.anchorY;
    group.add(modelAnchor);

    root.add(group);
    const stand = { ...layout, group, modelAnchor, hoverT: 0, baseY: layout.anchorY };
    group.userData.stand = stand;
    return stand;
  });

  // 辉光贴片：代替整屏泛光后期——窑口一团火光、地面一片随火跳动的暖光、吊灯光晕
  const additive = (color, opacity) => new THREE.MeshBasicMaterial({
    color, map: glowTexture, transparent: true, opacity, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false, fog: false
  });
  const kilnGlow = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 3.6), additive(0xff6a1e, 0.4));
  kilnGlow.position.set(0, kiln.springing, -depth + 0.2);
  const floorGlow = new THREE.Mesh(new THREE.PlaneGeometry(6, 5).rotateX(-Math.PI / 2), additive(0xff5a14, 0.16));
  floorGlow.position.set(0, 0.012, -depth + 2.2);
  const lampGlow = new THREE.Group();
  lampGlow.visible = false; // 吊灯只在烘焙件里有
  EARTH_HALL.lamps.forEach(([x, u]) => {
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      color: 0xffb066, map: glowTexture, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false, fog: false
    }));
    halo.scale.setScalar(1.1);
    halo.position.set(x, EARTH_HALL.lampY, -u);
    lampGlow.add(halo);
  });
  [kilnGlow, floorGlow, lampGlow].forEach((item) => {
    item.traverse((child) => { child.raycast = () => {}; });
    root.add(item);
  });

  let shellRequested = false;
  let flicker = 0;
  return {
    stands,
    // 取烘焙厅体：场景在长廊模块加载完、或推门进厅时调用，重复调用无副作用
    preload() {
      if (shellRequested || !api.loadModel) return;
      shellRequested = true;
      api.loadModel(EARTH_HALL.shellUrl).then((gltf) => {
        if (api.isDisposed?.()) {
          disposeTree(gltf.scene);
          return;
        }
        gltf.scene.traverse((mesh) => {
          if (!mesh.isMesh) return;
          mesh.raycast = () => {};
          if (mesh.material.isMeshBasicMaterial) {
            // 烘焙图已经过与长廊相同的显示变换，不再做色调映射
            mesh.material.toneMapped = false;
            mesh.material.fog = false;
          }
          if (mesh.material.map) mesh.material.map.anisotropy = api.anisotropy;
        });
        root.add(gltf.scene);
        fallback.visible = false;
        lampGlow.visible = true;
      }).catch((error) => {
        console.warn('火土厅烘焙模型加载失败，沿用程序化展厅', error?.message);
      });
    },
    update(dt, now) {
      flicker += dt;
      const t = now * 0.001;
      const fire = 0.86 + Math.sin(t * 7.3) * 0.06 + Math.sin(t * 13.1 + 1.7) * 0.05 + Math.sin(flicker * 2.1) * 0.03;
      kilnLight.intensity = 7 * fire;
      kilnGlow.material.opacity = 0.4 * fire;
      floorGlow.material.opacity = 0.16 * (fire * 1.6 - 0.6);
      embers.update(dt);
    }
  };
}

function buildBakedHall(door, root, api) {
  const hallId = door.chapter.id;
  const hall = BAKED_HALLS[hallId];
  const { room, doorway } = api;
  const width = room.width;
  const depth = room.depth;
  const half = width / 2;
  const { palette } = hall;

  // 程序化替身：素色地、墙、顶和展座，烘焙件到手前顶一下，到手后整组隐藏
  const fallback = new THREE.Group();
  fallback.name = `${hallId}_hall_fallback`;
  root.add(fallback);
  const flat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.02, side: THREE.DoubleSide });
  const wallMaterial = flat(palette.wall);
  const standMaterial = flat(palette.stand);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), flat(palette.floor));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -depth / 2);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), flat(palette.ceiling));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, room.height, -depth / 2);
  fallback.add(floor, ceiling);
  [-1, 1].forEach((side) => {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(depth, room.height), wallMaterial);
    wall.rotation.y = -side * Math.PI / 2;
    wall.position.set(side * half, room.height / 2, -depth / 2);
    fallback.add(wall);
  });
  const farWall = new THREE.Mesh(new THREE.PlaneGeometry(width, room.height), wallMaterial);
  farWall.position.set(0, room.height / 2, -depth);
  const doorWall = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape([
    new THREE.Vector2(-half, 0),
    new THREE.Vector2(-doorway.width / 2, 0),
    new THREE.Vector2(-doorway.width / 2, doorway.height),
    new THREE.Vector2(doorway.width / 2, doorway.height),
    new THREE.Vector2(doorway.width / 2, 0),
    new THREE.Vector2(half, 0),
    new THREE.Vector2(half, room.height),
    new THREE.Vector2(-half, room.height)
  ])), wallMaterial);
  doorWall.rotation.y = Math.PI;
  doorWall.position.z = -0.16;
  fallback.add(farWall, doorWall);

  // 厅内灯只照实时加载的展品模型（烘焙件不受光），随根节点显隐
  [-depth * 0.3, -depth * 0.72].forEach((z) => {
    const light = new THREE.PointLight(hall.light, 5.5, 34, 1.2);
    light.position.set(0, room.height - 0.3, z);
    root.add(light);
  });

  const title = new THREE.Mesh(
    new THREE.PlaneGeometry(4.0, 2.0),
    new THREE.MeshBasicMaterial({ map: api.makeRoomTitleTexture(door.chapter, hall.titleInk), transparent: true, toneMapped: false, fog: false })
  );
  title.position.set(0, hall.titleY, -depth + 0.08);
  root.add(title);

  const glowTexture = new THREE.CanvasTexture(makeRadialCanvas());
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  const shadowMaterial = new THREE.MeshBasicMaterial({
    color: 0x000000, map: glowTexture, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false, fog: false
  });
  const shadowGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const glassGeometry = new THREE.BoxGeometry(0.86, 1.0, 0.86);
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: 0xe8f0ec, transparent: true, opacity: 0.1, roughness: 0.05, metalness: 0.2, depthWrite: false
  });
  const glassEdges = new THREE.EdgesGeometry(glassGeometry);
  const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xc99a2e, transparent: true, opacity: 0.55 });
  const slabGeometry = new THREE.BoxGeometry(0.9, 0.06, 0.9);
  const slabMaterials = {};

  const stands = getBakedHallLayout(hallId, door.chapter.crafts || []).map((layout) => {
    const group = new THREE.Group();
    group.position.set(layout.x, 0, -layout.u);
    const aisleSide = layout.x < 0 ? 1 : -1;

    // 替身展座：按名牌所在立面估一个方块
    const footprint = Math.max(layout.labelOffset * 2, 0.3);
    const block = new THREE.Mesh(new THREE.BoxGeometry(footprint, layout.top, footprint), standMaterial);
    block.position.set(layout.x, layout.top / 2, -layout.u);
    fallback.add(block);

    if (layout.kind === 'case') {
      const color = hall[layout.side].slab;
      slabMaterials[color] ??= new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.05 });
      const slab = new THREE.Mesh(slabGeometry, slabMaterials[color]);
      slab.position.y = layout.top - 0.03;
      group.add(slab);
      const glass = new THREE.Mesh(glassGeometry, glassMaterial);
      glass.position.y = layout.top + 0.5;
      glass.renderOrder = 2;
      group.add(glass);
      const edges = new THREE.LineSegments(glassEdges, edgeMaterial);
      edges.position.copy(glass.position);
      group.add(edges);
    }

    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(layout.labelWidth, layout.labelWidth / 4),
      new THREE.MeshBasicMaterial({ map: api.makeStandLabelTexture(layout.craft), transparent: true, toneMapped: false, fog: false })
    );
    label.rotation.y = aisleSide * Math.PI / 2;
    label.position.set(aisleSide * (layout.labelOffset + 0.006), layout.labelY, 0);
    group.add(label);

    const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
    shadow.scale.setScalar(layout.modelSize * 1.15);
    shadow.position.y = layout.top + 0.003;
    shadow.raycast = () => {};
    group.add(shadow);

    const modelAnchor = new THREE.Group();
    modelAnchor.position.y = layout.anchorY;
    group.add(modelAnchor);

    root.add(group);
    const stand = { ...layout, group, modelAnchor, hoverT: 0, baseY: layout.anchorY };
    group.userData.stand = stand;
    return stand;
  });

  // 辉光：灯笼光晕 + 各厅自己的透光处，都只在烘焙件到手后显示
  const additive = (color, opacity) => ({
    color, map: glowTexture, transparent: true, opacity, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false, fog: false
  });
  const lampGlow = new THREE.Group();
  const haloMaterial = new THREE.SpriteMaterial(additive(hall.lampColor, 0.45));
  hall.lamps.forEach(([x, y, u, scale = 1]) => {
    const halo = new THREE.Sprite(haloMaterial);
    halo.scale.setScalar(1.1 * scale);
    halo.position.set(x, y, -u);
    lampGlow.add(halo);
  });
  const glows = (hall.glows || []).map((glow) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(glow.width, glow.height), new THREE.MeshBasicMaterial(additive(glow.color, glow.opacity)));
    mesh.position.set(glow.x, glow.y, -glow.u);
    lampGlow.add(mesh);
    return { mesh, glow };
  });
  lampGlow.visible = false;
  lampGlow.traverse((child) => { child.raycast = () => {}; });
  root.add(lampGlow);

  let shellRequested = false;
  return {
    stands,
    // 取烘焙厅体：游客走近门口或推门进厅时调用，重复调用无副作用
    preload() {
      if (shellRequested || !api.loadModel) return;
      shellRequested = true;
      api.loadModel(getBakedHallShellUrl(hallId)).then((gltf) => {
        if (api.isDisposed?.()) {
          disposeTree(gltf.scene);
          return;
        }
        gltf.scene.traverse((mesh) => {
          if (!mesh.isMesh) return;
          mesh.raycast = () => {};
          if (mesh.material.isMeshBasicMaterial) {
            mesh.material.toneMapped = false;
            mesh.material.fog = false;
          }
          if (mesh.material.map) mesh.material.map.anisotropy = api.anisotropy;
        });
        root.add(gltf.scene);
        fallback.visible = false;
        lampGlow.visible = true;
      }).catch((error) => {
        console.warn(`${hall.title}厅烘焙模型加载失败，沿用程序化展厅`, error?.message);
      });
    },
    update(dt, now) {
      const t = now * 0.001;
      glows.forEach(({ mesh, glow }) => {
        if (glow.flicker) mesh.material.opacity = glow.opacity * (0.88 + Math.sin(t * 6.1) * 0.06 + Math.sin(t * 11.7 + 0.8) * 0.05);
      });
    }
  };
}

function disposeTree(object) {
  object.traverse((child) => {
    child.geometry?.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      material?.map?.dispose();
      material?.dispose();
    });
  });
}

// ---------- 几何与贴图小工具 ----------

// 半圆拱轮廓（逆时针）：底宽 2r，直墙高 springing，顶上半圆
function archOutline(radius, springing, segments = 24) {
  const points = [new THREE.Vector2(-radius, 0), new THREE.Vector2(radius, 0), new THREE.Vector2(radius, springing)];
  for (let i = 1; i < segments; i++) {
    const angle = (i / segments) * Math.PI;
    points.push(new THREE.Vector2(Math.cos(angle) * radius, springing + Math.sin(angle) * radius));
  }
  points.push(new THREE.Vector2(-radius, springing));
  return points;
}

// 拱门缺口：从左脚 (-r, 0) 上到起拱点，翻过半圆，落到右脚 (r, 0)
function archNotch(radius, springing, segments = 24) {
  const points = [new THREE.Vector2(-radius, 0)];
  for (let i = 0; i <= segments; i++) {
    const angle = Math.PI - (i / segments) * Math.PI;
    points.push(new THREE.Vector2(Math.cos(angle) * radius, springing + Math.sin(angle) * radius));
  }
  points.push(new THREE.Vector2(radius, 0));
  return points;
}

function setPlanarUv(geometry, unitX, unitY) {
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < position.count; i++) {
    uv.setXY(i, position.getX(i) / unitX, position.getY(i) / unitY);
  }
  uv.needsUpdate = true;
}

function mergeIndexed(geometries) {
  const prepared = geometries.map((geometry) => {
    const copy = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    copy.deleteAttribute('uv');
    return copy;
  });
  const merged = mergeGeometries(prepared);
  prepared.forEach((geometry) => geometry.dispose());
  return merged;
}

function makeSaggarStacks(stacks) {
  const random = seededRandom(17);
  const base = new THREE.CylinderGeometry(0.3, 0.32, 0.26, 20);
  base.deleteAttribute('uv');
  const parts = [];
  stacks.forEach(({ x, u, count }) => {
    for (let level = 0; level < count; level++) {
      const piece = base.clone();
      const shade = 0.78 + random() * 0.3;
      const color = new THREE.Color(0x7a5038).multiplyScalar(shade);
      const colors = new Float32Array(piece.getAttribute('position').count * 3);
      for (let i = 0; i < colors.length; i += 3) colors.set([color.r, color.g, color.b], i);
      piece.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      piece.rotateY(random() * Math.PI);
      piece.translate(x + (random() - 0.5) * 0.05, 0.13 + level * 0.27, -u + (random() - 0.5) * 0.05);
      parts.push(piece);
    }
  });
  const merged = mergeGeometries(parts);
  [base, ...parts].forEach((geometry) => geometry.dispose());
  return new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0.02 }));
}

function makeEmbers(width, height, farZ, count = 48) {
  const random = seededRandom(5);
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  const reset = (i, y) => {
    positions[i * 3] = (random() - 0.5) * width * 0.7;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = farZ + 0.1 + random() * 1.2;
    speeds[i] = 0.25 + random() * 0.45;
  };
  for (let i = 0; i < count; i++) reset(i, 0.3 + random() * (height + 1.4));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({
    color: 0xffa040,
    size: 0.045,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    fog: false
  }));
  return {
    points,
    update(dt) {
      for (let i = 0; i < count; i++) {
        positions[i * 3 + 1] += speeds[i] * dt;
        positions[i * 3] += Math.sin(positions[i * 3 + 1] * 3 + i) * dt * 0.08;
        if (positions[i * 3 + 1] > height + 1.6) reset(i, 0.3);
      }
      geometry.getAttribute('position').needsUpdate = true;
    }
  };
}

function canvasTexture(canvas, repeatX, repeatY, anisotropy = 4) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = anisotropy;
  return texture;
}

// 窑砖：错缝顺砖，深浅不一，偶有烟熏发黑的砖。一张贴图 = 2m × 2m。
function makeBrickCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const random = seededRandom(11);
  ctx.fillStyle = '#1f130d';
  ctx.fillRect(0, 0, 512, 512);
  const rows = 16;
  const brickH = 512 / rows;
  const brickW = 512 / 5;
  for (let row = 0; row < rows; row++) {
    const offset = row % 2 ? brickW / 2 : 0;
    for (let col = -1; col < 6; col++) {
      const x = col * brickW + offset;
      const sooty = random() < 0.12;
      const r = sooty ? 52 + random() * 20 : 98 + random() * 42;
      const g = sooty ? 30 + random() * 10 : 52 + random() * 22;
      const b = sooty ? 22 + random() * 8 : 36 + random() * 14;
      ctx.fillStyle = `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
      ctx.fillRect(x + 3, row * brickH + 3, brickW - 6, brickH - 6);
      // 砖面斑驳
      for (let k = 0; k < 6; k++) {
        ctx.fillStyle = `rgba(${random() < 0.5 ? '20, 10, 6' : '220, 160, 110'}, ${0.05 + random() * 0.08})`;
        ctx.fillRect(x + 3 + random() * (brickW - 16), row * brickH + 3 + random() * (brickH - 10), 4 + random() * 12, 2 + random() * 5);
      }
    }
  }
  return canvas;
}

// 方砖地：4 × 4 块，一张贴图 = 3m × 3m
function makeFloorTileCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const random = seededRandom(23);
  ctx.fillStyle = '#2a1c15';
  ctx.fillRect(0, 0, 512, 512);
  const tile = 128;
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const r = 72 + random() * 20;
      const g = 48 + random() * 12;
      const b = 36 + random() * 10;
      ctx.fillStyle = `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
      ctx.fillRect(col * tile + 3, row * tile + 3, tile - 6, tile - 6);
      for (let k = 0; k < 14; k++) {
        ctx.fillStyle = `rgba(${random() < 0.5 ? '18, 10, 6' : '200, 150, 110'}, ${0.04 + random() * 0.06})`;
        ctx.beginPath();
        ctx.arc(col * tile + 6 + random() * (tile - 12), row * tile + 6 + random() * (tile - 12), 2 + random() * 9, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  return canvas;
}

// 径向渐变：中心白、边缘透明。辉光贴片和展品柔影共用
function makeRadialCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.35, 'rgba(255, 255, 255, 0.55)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return canvas;
}

// 窑火：底部白热、往上转橙红，边缘沉入暗红
function makeKilnFireCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#2a0703';
  ctx.fillRect(0, 0, 256, 256);
  const glow = ctx.createRadialGradient(128, 250, 10, 128, 230, 230);
  glow.addColorStop(0, '#fff3c4');
  glow.addColorStop(0.18, '#ffc35a');
  glow.addColorStop(0.45, '#ff6a1c');
  glow.addColorStop(0.75, '#9a1d08');
  glow.addColorStop(1, '#2a0703');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 256, 256);
  return canvas;
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
