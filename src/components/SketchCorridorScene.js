// 暗夜展厅风 3D 长廊 + 主题展厅：深色云纹石墙长廊 → 朱漆木门 = 主题展厅 / AI 共创工坊。
// 交互为轨道式（借鉴 itom portfolio 的 useScrollCamera 思路）：
// 滚轮/方向键/触摸竖滑沿轨道前进后退，鼠标移动视差环顾；
// 点击木门 → 相机转向 90° 正对门 → 真实穿门而入（房间就在门后，无跳切）。
// 渲染/灯光惯例与 MuseumScene 保持一致（RoomEnvironment PMREM + ACES + 暖金射灯），
// 墙面/地面/门均为受光 Standard 材质，GLB 模型保持正常立体渲染。
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Easing, Tween, update as updateTweens } from '@tweenjs/tween.js/dist/tween.esm.js';
import { createGLTFLoader } from '../utils/modelLoader.js';
import { loadManagedMuseumTexture } from '../utils/museumTexture.js';

const HALL_INK = 0x0a0b0d;
const GOLD = '#c99a2e';
const GOLD_TEXT = '#e6cd8f';
const SILK = '#e7e1d7';
const MIST = 'rgba(231, 225, 215, 0.62)';

const TEXTURE_BASE = '/assets/textures/';
const CRAFT_ICON_BASE = '/assets/generated/craft-icons-webp/';
const textureLoader = new THREE.TextureLoader();

// 门饰共享几何体/材质（全部展厅门复用，减少内存与 draw call 状态切换）
let sharedDoorDecor = null;

function getSharedDoorDecor() {
  if (!sharedDoorDecor) {
    sharedDoorDecor = {
      studGeometry: new THREE.SphereGeometry(0.058, 12, 8),
      bossGeometry: new THREE.CylinderGeometry(0.075, 0.075, 0.03, 16),
      ringGeometry: new THREE.TorusGeometry(0.11, 0.024, 10, 28),
      goldMaterial: new THREE.MeshStandardMaterial({ color: 0xd4a83a, roughness: 0.28, metalness: 0.85 })
    };
  }
  return sharedDoorDecor;
}

export const CORRIDOR = {
  width: 10,           // 走廊总宽（墙在 x=±5）
  height: 4.6,         // 层高
  startZ: 8,           // 轨道起点（入口）
  firstDoorZ: -6,      // 第一扇门 z
  doorSpacing: 9,      // 展厅门间距
  generatorGap: 7,     // AI 共创门与最后一扇展厅门的间距
  doorWidth: 2.0,
  doorHeight: 3.1,
  eyeY: 1.7,
  railSpeed: 0.02,     // 滚轮 deltaY → z 的映射系数
  railSmoothing: 0.08, // 轨道 lerp 平滑系数
  parallaxYaw: 0.12,   // 鼠标视差最大偏航（rad）
  parallaxPitch: 0.06
};

// 展厅：就建在走廊墙后（门洞真实连通），左门房间向 -x 延伸，右门向 +x
export const ROOM = {
  wallX: 5,            // 走廊墙所在 |x|
  depth: 11,           // 房间进深（x 方向）
  width: 9.6,          // 房间开间（z 方向，以门中轴为中心）
  height: 4.6,
  eyeY: 1.7,
  standZ: 2.3,         // 展台离门轴的 z 偏移
  standFirstX: 9.0,    // 第一排展台 |x|（距入口约 2.6m，正对视线）
  standSpacing: 2.0,   // 展台排距（x 方向）
  cameraEnter: 6.4,    // 相机在房间内的 |x| 轨道范围
  cameraDeep: 14.2,
  maxStands: 8,        // 展台上限（覆盖展品最多的展厅）
  parallaxYaw: 0.5,    // 房间内视差环顾范围更大，方便看两侧展台
  parallaxPitch: 0.14,
  modelSize: 1.15      // GLB 归一化目标尺寸
};

// 纯函数：把主题展厅铺成左右交替的门序列（可单测）。
export function getCorridorDoorLayout(chapters = []) {
  return chapters.map((chapter, index) => {
    const side = index % 2 === 0 ? 'left' : 'right';
    return {
      chapter,
      id: chapter.id,
      kind: 'chapter',
      index,
      side,
      position: {
        x: side === 'left' ? -(CORRIDOR.width / 2 - 0.12) : CORRIDOR.width / 2 - 0.12,
        y: 0,
        z: CORRIDOR.firstDoorZ - index * CORRIDOR.doorSpacing
      }
    };
  });
}

// 纯函数：AI 共创门（排在最后一扇展厅门之后，交替侧）。
export function getGeneratorDoorLayout(chapterCount = 0) {
  const side = chapterCount % 2 === 0 ? 'left' : 'right';
  return {
    id: 'generator',
    kind: 'generator',
    chapter: { id: 'generator', title: 'AI 共创', subtitle: '非遗文创生成工坊', crafts: [] },
    index: chapterCount,
    side,
    position: {
      x: side === 'left' ? -(CORRIDOR.width / 2 - 0.12) : CORRIDOR.width / 2 - 0.12,
      y: 0,
      z: CORRIDOR.firstDoorZ - Math.max(chapterCount - 1, 0) * CORRIDOR.doorSpacing - CORRIDOR.generatorGap
    }
  };
}

// 功能门定义：排在 AI 共创门之后的两扇"展陈功能"门，点击打开全屏展厅覆盖层
export const FEATURE_DOORS = [
  { id: 'gallery', title: '共创画廊', subtitle: '人人都是非遗共创者' },
  { id: 'map', title: '山河图志', subtitle: '非遗地域分布全图' }
];

// 纯函数：功能门布局（AI 共创门之后，交替侧，可单测）。
export function getFeatureDoorLayout(chapterCount = 0) {
  const generator = getGeneratorDoorLayout(chapterCount);
  return FEATURE_DOORS.map((feature, index) => {
    const doorIndex = chapterCount + 1 + index; // 章节门 + 共创门之后的交替序号
    const side = doorIndex % 2 === 0 ? 'left' : 'right';
    return {
      id: feature.id,
      kind: 'feature',
      featureId: feature.id,
      chapter: { id: feature.id, title: feature.title, subtitle: feature.subtitle, crafts: [] },
      index: doorIndex,
      side,
      position: {
        x: side === 'left' ? -(CORRIDOR.width / 2 - 0.12) : CORRIDOR.width / 2 - 0.12,
        y: 0,
        z: generator.position.z - (index + 1) * CORRIDOR.doorSpacing
      }
    };
  });
}

// 纯函数：相机轨道边界（含 AI 共创门与功能门，可单测）。
export function getCorridorRailBounds(doorCount = 0, featureCount = FEATURE_DOORS.length) {
  const lastDoorZ = CORRIDOR.firstDoorZ
    - Math.max(doorCount - 1, 0) * CORRIDOR.doorSpacing
    - (doorCount > 0 ? CORRIDOR.generatorGap : 0)
    - featureCount * CORRIDOR.doorSpacing;
  return {
    maxZ: CORRIDOR.startZ,
    minZ: lastDoorZ - 2.5
  };
}

export function clampCorridorZ(z, bounds) {
  return THREE.MathUtils.clamp(z, bounds.minZ, bounds.maxZ);
}

// 纯函数：把一侧走廊墙按门洞切成若干墙板段（可单测）。
export function getWallSegments(doorZs = [], startZ, endZ, holeHalfWidth = 1.14) {
  const segments = [];
  let cursor = startZ;
  [...doorZs].sort((a, b) => b - a).forEach((z) => {
    segments.push({ from: cursor, to: z + holeHalfWidth });
    cursor = z - holeHalfWidth;
  });
  segments.push({ from: cursor, to: endZ });
  return segments.filter((segment) => segment.from - segment.to > 0.01);
}

// 纯函数：展厅展台布局——沿进深（x）排布，在门轴两侧交替（可单测）。
export function getRoomStandLayout(crafts = [], door = null) {
  const dir = door?.side === 'left' ? -1 : 1;
  const doorZ = door?.position?.z ?? 0;
  return crafts.slice(0, ROOM.maxStands).map((craft, index) => {
    const row = Math.floor(index / 2);
    const nearSide = index % 2 === 0;
    return {
      craft,
      id: craft.id,
      index,
      row,
      position: {
        x: dir * (ROOM.standFirstX + row * ROOM.standSpacing),
        y: 0,
        z: doorZ + (nearSide ? -ROOM.standZ : ROOM.standZ)
      }
    };
  });
}

export class SketchCorridorScene {
  constructor(container) {
    this.container = container;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.clock = new THREE.Clock();
    this.callbacks = {};
    this.doors = [];
    this.textTextures = [];
    this.raycaster = new THREE.Raycaster();
    this.pointerNdc = new THREE.Vector2(0, 0);
    this.hoveredDoor = null;
    this.activeDoor = null;
    this.inputEnabled = true;
    this.renderPaused = false;
    this.reducedMotion = false;
    this.disposed = false;
    this.animationId = null;

    // 状态机：corridor（走廊）→ entering（穿门）→ room（展厅内）→ exiting → corridor
    this.viewState = 'corridor';
    this.currentDoor = null;
    this.loader = createGLTFLoader();
    this.modelCache = new Map();
    this.hoveredStand = null;

    // 轨道与视差状态（走廊沿 z，展厅沿 x）
    this.targetZ = CORRIDOR.startZ;
    this.targetX = 0;
    this.railBounds = getCorridorRailBounds(0);
    this.yaw = 0;
    this.pitch = 0;
    this.targetYaw = 0;
    this.targetPitch = 0;
    this.baseYaw = 0; // 走廊朝 -z（0）；左展厅朝 -x（π/2），右展厅朝 +x（-π/2）
    this.touchPointer = { active: false, id: null, lastY: 0, moved: 0, lastX: 0, startX: 0, startY: 0 };

    this.resizeHandler = null;
    this.keydownHandler = null;
    this.wheelHandler = null;
    this.pointerMoveHandler = null;
    this.pointerDownHandler = null;
    this.pointerUpHandler = null;
    this.visibilityHandler = null;
  }

  init({ chapters = [], onRoomEnter, onRoomExit, onSelectCraft, onOpenFeature, onReady } = {}) {
    this.callbacks = { onRoomEnter, onRoomExit, onSelectCraft, onOpenFeature, onReady };
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;

    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(HALL_INK);
    this.scene.fog = new THREE.Fog(HALL_INK, 16, 52);

    this.camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 120);
    this.camera.position.set(0, CORRIDOR.eyeY, CORRIDOR.startZ);
    this.camera.rotation.order = 'YXZ';

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // 与 MuseumScene 同款：ACES 色调映射 + 微提曝光，射灯下的展厅更有层次
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.22;
    this.container.appendChild(this.renderer.domElement);

    // 灯光同时作用于展厅 Standard 材质与 GLB 模型
    this.addLighting();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(roomEnv).texture;
    roomEnv.dispose();
    pmrem.dispose();

    const layouts = [
      ...getCorridorDoorLayout(chapters),
      getGeneratorDoorLayout(chapters.length),
      ...getFeatureDoorLayout(chapters.length)
    ];
    this.railBounds = getCorridorRailBounds(chapters.length);
    this.targetZ = CORRIDOR.startZ;

    this.buildCorridor(layouts);
    layouts.forEach((layout) => this.buildDoor(layout));
    this.buildFrames(chapters);
    this.buildLanterns();
    this.bindEvents();

    // 性能预热：一次性编译 shader + 上传 Canvas 纹理，避免首次滚动时卡顿
    this.renderer.compile(this.scene, this.camera);
    this.textTextures.forEach(({ texture }) => this.renderer.initTexture(texture));

    // 字体加载完成后重绘牌匾 / 标题等 Canvas 纹理（@font-face 在页面样式中声明）
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => this.refreshTextTextures()).catch(() => {});
    }

    this.animate();
    this.callbacks.onReady?.();
  }

  // ---------- 场景搭建 ----------

  addLighting() {
    // 博物馆基调：环境光给到能看清墙面浮雕与石纹的程度，门上暖金射灯塑造观展光池
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    this.scene.add(new THREE.HemisphereLight(0x4a5060, 0x1c1712, 0.75));
  }

  buildCorridor(layouts) {
    const bounds = this.railBounds;
    const startZ = CORRIDOR.startZ + 6; // 入口后再延伸一段，避免转身看到虚空
    const endZ = bounds.minZ - 1.5;
    const length = startZ - endZ;
    const centerZ = (startZ + endZ) / 2;

    // 地板（深色石材 + 金色砖缝，沿走廊方向平铺）
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(CORRIDOR.width, length),
      new THREE.MeshStandardMaterial({
        map: this.loadMuseumTexture('floor-stone', [1.6, Math.ceil(length / 5)]),
        roughness: 0.55,
        metalness: 0.18
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, centerZ);
    this.scene.add(floor);

    // 两侧墙：按门洞切成墙板段 + 门洞上方过梁
    [-1, 1].forEach((sign) => {
      const side = sign === -1 ? 'left' : 'right';
      const doorZs = layouts.filter((layout) => layout.side === side).map((layout) => layout.position.z);
      getWallSegments(doorZs, startZ, endZ).forEach(({ from, to }) => {
        const segmentLength = from - to;
        const wall = new THREE.Mesh(
          new THREE.PlaneGeometry(segmentLength, CORRIDOR.height),
          this.makeWallMaterial('wall-cloud', [Math.max(segmentLength / 7, 0.4), 1])
        );
        wall.rotation.y = side === 'left' ? Math.PI / 2 : -Math.PI / 2;
        wall.position.set(sign * CORRIDOR.width / 2, CORRIDOR.height / 2, (from + to) / 2);
        this.scene.add(wall);
      });
      // 门洞过梁（门楣上方的墙板）
      doorZs.forEach((z) => {
        const lintelHeight = CORRIDOR.height - CORRIDOR.doorHeight - 0.14;
        const lintel = new THREE.Mesh(
          new THREE.PlaneGeometry(CORRIDOR.doorWidth + 0.28, lintelHeight),
          this.makeWallMaterial('wall-cloud', [0.4, lintelHeight / CORRIDOR.height])
        );
        lintel.rotation.y = side === 'left' ? Math.PI / 2 : -Math.PI / 2;
        lintel.position.set(sign * CORRIDOR.width / 2, CORRIDOR.doorHeight + 0.14 + lintelHeight / 2, z);
        this.scene.add(lintel);
      });
    });

    // 顶面（鎏金藻井）
    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(CORRIDOR.width, length),
      this.makeWallMaterial('ceiling-coffer', [1.6, Math.ceil(length / 6)], { roughness: 0.75, metalness: 0.2, emissiveIntensity: 0.16 })
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, CORRIDOR.height, centerZ);
    this.scene.add(ceiling);

    // 中轴红毯：金龙祥云纹，引视线向长廊深处
    const carpet = new THREE.Mesh(
      new THREE.PlaneGeometry(2.3, length),
      new THREE.MeshStandardMaterial({
        map: this.loadMuseumTexture('carpet-runner', [1, Math.ceil(length / 4)]),
        roughness: 0.92,
        metalness: 0.02
      })
    );
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.set(0, 0.015, centerZ);
    this.scene.add(carpet);

    // 两侧墙脚鎏金踢脚线
    const baseTrimGeometry = new THREE.BoxGeometry(0.06, 0.16, length);
    const baseTrimMaterial = new THREE.MeshStandardMaterial({ color: 0x8a6a2a, roughness: 0.4, metalness: 0.7 });
    [-1, 1].forEach((sign) => {
      const trim = new THREE.Mesh(baseTrimGeometry, baseTrimMaterial);
      trim.position.set(sign * (CORRIDOR.width / 2 - 0.04), 0.08, centerZ);
      this.scene.add(trim);
    });

    // 尽头墙：云纹石底 + 金凤照壁 + 横版馆名金匾
    const endWall = new THREE.Mesh(
      new THREE.PlaneGeometry(CORRIDOR.width, CORRIDOR.height),
      this.makeWallMaterial('wall-cloud', [1.4, 1])
    );
    endWall.position.set(0, CORRIDOR.height / 2, endZ);
    this.scene.add(endWall);

    // 金凤纹照壁（鎏金衬框 + 缂丝凤纹面板）
    const featureFrame = new THREE.Mesh(
      new THREE.PlaneGeometry(4.06, 3.16),
      new THREE.MeshStandardMaterial({ color: 0x8a6a2a, roughness: 0.4, metalness: 0.7 })
    );
    featureFrame.position.set(0, 2.85, endZ + 0.03);
    this.scene.add(featureFrame);

    const feature = new THREE.Mesh(
      new THREE.PlaneGeometry(3.9, 3.0),
      new THREE.MeshStandardMaterial({
        map: this.loadMuseumTexture('feature-wall', [1, 1]),
        roughness: 0.7,
        metalness: 0.15
      })
    );
    feature.position.set(0, 2.85, endZ + 0.05);
    this.scene.add(feature);

    // 照壁洗墙灯：暖金光束打在尽头端景上
    const featureSpot = new THREE.SpotLight(0xffd9a0, 14, 18, 0.5, 0.6, 1.1);
    featureSpot.position.set(0, CORRIDOR.height - 0.3, endZ + 6);
    featureSpot.target.position.set(0, 2.2, endZ);
    this.scene.add(featureSpot);
    this.scene.add(featureSpot.target);

    const title = new THREE.Mesh(
      new THREE.PlaneGeometry(4.6, 1.15),
      // 牌匾类 Canvas 纹理不参与色调映射与雾效，保持金字在暗墙上的准确发色与可读性
      new THREE.MeshBasicMaterial({ map: this.makeTitleTexture(), transparent: true, toneMapped: false, fog: false })
    );
    title.position.set(0, 0.62, endZ + 0.06);
    this.scene.add(title);
  }

  buildDoor(layout) {
    const group = new THREE.Group();
    group.position.set(layout.position.x, 0, layout.position.z);
    // 局部 +z 朝向走廊中轴
    group.rotation.y = layout.side === 'left' ? Math.PI / 2 : -Math.PI / 2;
    this.scene.add(group);

    // 门框（鎏金铜框）
    const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x8a6a2a, roughness: 0.38, metalness: 0.78 });
    const sidePostGeometry = new THREE.BoxGeometry(0.14, CORRIDOR.doorHeight + 0.14, 0.14);
    [-1, 1].forEach((sign) => {
      const post = new THREE.Mesh(sidePostGeometry, frameMaterial);
      post.position.set(sign * (CORRIDOR.doorWidth / 2 + 0.07), (CORRIDOR.doorHeight + 0.14) / 2, 0);
      group.add(post);
    });
    const lintel = new THREE.Mesh(
      new THREE.BoxGeometry(CORRIDOR.doorWidth + 0.28, 0.14, 0.14),
      frameMaterial
    );
    lintel.position.set(0, CORRIDOR.doorHeight + 0.07, 0);
    group.add(lintel);

    // 门板（朱漆大门：clearcoat 漆面光泽，铰链在局部左侧，开门时向展厅内旋开，不挡走廊）
    const pivot = new THREE.Group();
    pivot.position.set(-CORRIDOR.doorWidth / 2, 0, 0.04);
    group.add(pivot);
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(CORRIDOR.doorWidth, CORRIDOR.doorHeight),
      new THREE.MeshPhysicalMaterial({
        map: this.loadMuseumTexture('red-lacquer', [1, 1]),
        roughness: 0.34,
        metalness: 0.1,
        clearcoat: 0.7,
        clearcoatRoughness: 0.25,
        side: THREE.DoubleSide
      })
    );
    panel.position.set(CORRIDOR.doorWidth / 2, CORRIDOR.doorHeight / 2, 0);
    pivot.add(panel);

    // 门槛（鎏金压边）
    const threshold = new THREE.Mesh(
      new THREE.BoxGeometry(CORRIDOR.doorWidth + 0.28, 0.09, 0.22),
      frameMaterial
    );
    threshold.position.set(0, 0.045, 0.06);
    group.add(threshold);

    // 门钉（4×3 鎏金泡钉）与铺首门环，挂在门板上随门开合
    const decor = getSharedDoorDecor();
    [0.3, 0.68, 1.06, 1.44].forEach((x) => {
      [0.7, 1.5, 2.3].forEach((y) => {
        const stud = new THREE.Mesh(decor.studGeometry, decor.goldMaterial);
        stud.position.set(x, y, 0.03);
        pivot.add(stud);
      });
    });
    const boss = new THREE.Mesh(decor.bossGeometry, decor.goldMaterial);
    boss.rotation.x = Math.PI / 2;
    boss.position.set(1.7, 1.52, 0.04);
    pivot.add(boss);
    const ring = new THREE.Mesh(decor.ringGeometry, decor.goldMaterial);
    ring.position.set(1.7, 1.36, 0.06);
    pivot.add(ring);

    // 黑漆金字牌匾（Canvas 纹理：展厅名 + 副题）
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 0.84),
      new THREE.MeshBasicMaterial({ map: this.makeSignTexture(layout.chapter), transparent: true, toneMapped: false, fog: false })
    );
    sign.position.set(0, CORRIDOR.doorHeight + 0.72, 0.08);
    group.add(sign);

    // 门上暖金射灯：照亮门、牌匾与周边墙面，在地面投出观展光池
    const spot = new THREE.SpotLight(0xffd9a0, 20, 14, 0.75, 0.55, 1.2);
    spot.position.set(layout.position.x * 0.4, CORRIDOR.height - 0.25, layout.position.z + 0.6);
    spot.target.position.set(layout.position.x, 1.7, layout.position.z);
    this.scene.add(spot);
    this.scene.add(spot.target);

    const door = {
      ...layout,
      group,
      pivot,
      sign,
      openAngle: 1.85,
      opened: false,
      hoverT: 0,
      roomStands: [],
      modelsRequested: false
    };
    panel.userData.door = door;
    sign.userData.door = door;
    group.userData.door = door;
    this.doors.push(door);

    // 展厅门：在墙后建真实连通的展厅
    if (door.kind === 'chapter') this.buildRoom(door);
    return door;
  }

  // ---------- 展厅（建在门后，与走廊门洞真实连通） ----------

  buildRoom(door) {
    const dir = door.side === 'left' ? -1 : 1;
    const doorZ = door.position.z;
    const centerX = dir * (ROOM.wallX + ROOM.depth / 2);
    const farX = dir * (ROOM.wallX + ROOM.depth);

    // 地板 / 顶面
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM.depth, ROOM.width),
      new THREE.MeshStandardMaterial({
        map: this.loadMuseumTexture('floor-stone', [2, 2]),
        roughness: 0.55,
        metalness: 0.18
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(centerX, 0, doorZ);
    this.scene.add(floor);

    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM.depth, ROOM.width),
      new THREE.MeshStandardMaterial({
        map: this.loadMuseumTexture('ceiling-coffer', [2, 2]),
        roughness: 0.75,
        metalness: 0.2
      })
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(centerX, ROOM.height, doorZ);
    this.scene.add(ceiling);

    // 两侧墙（z 方向）
    const sideWallGeometry = new THREE.PlaneGeometry(ROOM.depth, ROOM.height);
    [
      { z: doorZ - ROOM.width / 2, rotationY: 0 },
      { z: doorZ + ROOM.width / 2, rotationY: Math.PI }
    ].forEach(({ z, rotationY }) => {
      const wall = new THREE.Mesh(
        sideWallGeometry,
        this.makeWallMaterial('wall-cloud', [1.6, 1])
      );
      wall.rotation.y = rotationY;
      wall.position.set(centerX, ROOM.height / 2, z);
      this.scene.add(wall);
    });

    // 尽头墙（面向展厅入口）+ 展厅大标题
    const farWallRotation = dir === -1 ? Math.PI / 2 : -Math.PI / 2;
    const farWall = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM.width, ROOM.height),
      this.makeWallMaterial('wall-cloud', [1.6, 1])
    );
    farWall.rotation.y = farWallRotation;
    farWall.position.set(farX, ROOM.height / 2, doorZ);
    this.scene.add(farWall);

    const title = new THREE.Mesh(
      new THREE.PlaneGeometry(5.2, 2.6),
      new THREE.MeshBasicMaterial({ map: this.makeRoomTitleTexture(door.chapter), transparent: true, toneMapped: false, fog: false })
    );
    title.rotation.y = farWallRotation;
    title.position.set(farX - dir * 0.08, 2.5, doorZ);
    this.scene.add(title);

    // 展厅照明：暖金点光源悬于厅心，仅在观众进入该厅时点亮（控制同屏灯数）
    const roomLight = new THREE.PointLight(0xffd9a0, 8, 22, 1.6);
    roomLight.position.set(centerX, ROOM.height - 0.7, doorZ);
    roomLight.visible = false;
    this.scene.add(roomLight);
    door.roomLight = roomLight;

    // 展台（深色花岗岩贴图石座 + 鎏金顶圈 + 深色名牌 + GLB 锚点）
    // 石纹同时挂到自发光通道，保证远距离也能读出石材颗粒感而不是一团黑
    const pedestalGeometry = new THREE.CylinderGeometry(0.5, 0.58, 1.0, 24);
    const pedestalTexture = this.loadMuseumTexture('pedestal-stone', [3, 1]);
    const pedestalMaterial = new THREE.MeshStandardMaterial({
      map: pedestalTexture,
      emissive: 0xffffff,
      emissiveMap: pedestalTexture,
      emissiveIntensity: 0.3,
      roughness: 0.55,
      metalness: 0.15
    });
    const rimGeometry = new THREE.TorusGeometry(0.5, 0.02, 8, 40);
    const rimMaterial = new THREE.MeshStandardMaterial({ color: 0xc99a2e, roughness: 0.3, metalness: 0.8 });

    getRoomStandLayout(door.chapter.crafts || [], door).forEach((layout) => {
      const group = new THREE.Group();
      group.position.set(layout.position.x, 0, layout.position.z);

      const pedestal = new THREE.Mesh(pedestalGeometry, pedestalMaterial);
      pedestal.position.y = 0.5;
      group.add(pedestal);
      const rim = new THREE.Mesh(rimGeometry, rimMaterial);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 1.0;
      group.add(rim);

      const modelAnchor = new THREE.Group();
      modelAnchor.position.y = 1.55;
      group.add(modelAnchor);

      const label = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.makeStandLabelTexture(layout.craft),
        transparent: true,
        depthWrite: false,
        fog: false
      }));
      label.scale.set(1.5, 0.375, 1);
      label.position.set(0, 0.35, 0);
      group.add(label);

      const stand = { ...layout, group, modelAnchor, hoverT: 0 };
      group.userData.stand = stand;
      door.roomStands.push(stand);
      this.scene.add(group);
    });
  }

  // 首次进厅时加载该厅全部 GLB（缓存共享，模型克隆挂载）
  requestRoomModels(door) {
    if (door.modelsRequested) return;
    door.modelsRequested = true;
    door.roomStands.forEach((stand) => {
      const url = stand.craft?.modelUrl;
      if (!url) return;
      this.loadCraftModel(url)
        .then((gltf) => {
          if (this.disposed || stand.modelAnchor.children.length) return;
          const model = gltf.scene.clone(true);
          normalizeObject(model, ROOM.modelSize);
          stand.modelAnchor.add(model);
        })
        .catch(() => {});
    });
  }

  loadCraftModel(url) {
    if (!this.modelCache.has(url)) {
      const promise = new Promise((resolve, reject) => {
        this.loader.load(url, resolve, undefined, reject);
      });
      promise.catch(() => {});
      this.modelCache.set(url, promise);
    }
    return this.modelCache.get(url);
  }

  // ---------- 进门 / 出门 ----------

  enterChapter(chapterId) {
    const aliases = {
      shadow: 'paper',
      textile: 'thread',
      tiger: 'thread',
      'tiger-head': 'thread'
    };
    const resolvedId = aliases[chapterId] || chapterId;
    const door = this.doors.find((item) => item.kind === 'chapter' && item.id === resolvedId);
    if (
      !door
      || this.disposed
      || !this.inputEnabled
      || this.renderPaused
      || this.activeDoor
      || this.viewState !== 'corridor'
    ) return false;

    this.activeDoor = door;
    door.opened = true;
    this.enterRoom(door);
    return true;
  }

  switchChapter(chapterId) {
    if (this.disposed || this.renderPaused) return false;
    if (this.viewState === 'corridor') return this.enterChapter(chapterId);
    if (this.viewState !== 'room') return false;

    this.exitRoom();
    if (this.reducedMotion) return this.enterChapter(chapterId);
    window.setTimeout(() => {
      if (!this.disposed) this.enterChapter(chapterId);
    }, 1800);
    return true;
  }

  // 点击展厅门：滑到门前 → 转向 90° 正对门 → 穿门而入（房间就在门后）
  enterRoom(door) {
    this.viewState = 'entering';
    this.inputEnabled = false;
    this.currentDoor = door;
    this.requestRoomModels(door);
    // 点亮该厅射灯（其余展厅的灯保持熄灭，控制同屏灯数）
    if (door.roomLight) door.roomLight.visible = true;
    // 进厅动作一开始就让首页覆盖层淡出（等走完再切会遮挡穿门过程）
    this.callbacks.onRoomEnter?.(door.chapter.id);

    const dir = door.side === 'left' ? -1 : 1;
    const faceYaw = -dir * Math.PI / 2; // 左展厅朝 -x（+π/2），右展厅朝 +x（-π/2）

    if (this.reducedMotion) {
      // 减少动效：直接落位
      this.camera.position.set(dir * (ROOM.wallX + 1.6), ROOM.eyeY, door.position.z);
      this.targetX = this.camera.position.x;
      this.targetZ = door.position.z;
      this.baseYaw = faceYaw;
      this.yaw = faceYaw;
      this.targetYaw = faceYaw;
      this.pitch = 0;
      this.targetPitch = 0;
      door.pivot.rotation.y = door.openAngle;
      this.viewState = 'room';
      this.inputEnabled = true;
      return;
    }

    const now = performance.now();
    new Tween(door.pivot.rotation)
      .to({ y: door.openAngle }, 900)
      .easing(Easing.Cubic.InOut)
      .delay(350)
      .start(now);

    // 第一阶段：沿走廊滑到门前，视线微偏向门
    this.targetYaw = -dir * 0.5;
    this.targetPitch = -0.03;
    this.targetZ = door.position.z;

    // 第二阶段：转向 90° 正对门
    window.setTimeout(() => {
      if (this.disposed) return;
      this.baseYaw = faceYaw;
      this.targetYaw = faceYaw;
    }, 750);

    // 第三阶段：穿门而入
    window.setTimeout(() => {
      if (this.disposed) return;
      this.targetX = dir * ROOM.cameraEnter;
    }, 1250);

    // 落定：进入展厅状态（覆盖层在进厅动作开始时已淡出）
    window.setTimeout(() => {
      if (this.disposed) return;
      this.viewState = 'room';
      this.inputEnabled = true;
    }, 2500);
  }

  // 返回走廊（ESC / 返回按钮）：转身面向门 → 走出门洞 → 回正朝向
  exitRoom() {
    if (this.viewState !== 'room') return;
    this.viewState = 'exiting';
    this.inputEnabled = false;
    const door = this.currentDoor;
    const dir = door.side === 'left' ? -1 : 1;

    const finish = () => {
      this.baseYaw = 0;
      this.yaw = 0;
      this.pitch = 0;
      this.targetYaw = 0;
      this.targetPitch = 0;
      this.targetX = 0;
      this.targetZ = door.position.z + 2.4;
      this.camera.position.set(0, CORRIDOR.eyeY, door.position.z + 2.4);
      this.viewState = 'corridor';
      this.callbacks.onRoomExit?.();
      if (door) {
        if (door.roomLight) door.roomLight.visible = false;
        new Tween(door.pivot.rotation)
          .to({ y: 0 }, 700)
          .easing(Easing.Cubic.InOut)
          .start();
        door.opened = false;
      }
      this.activeDoor = null;
      this.inputEnabled = true;
    };

    if (this.reducedMotion) {
      finish();
      return;
    }

    // 转身面向门（面向走廊方向）
    this.targetYaw = dir * Math.PI / 2;
    window.setTimeout(() => {
      if (this.disposed) return;
      this.targetX = 0; // 走出门洞
    }, 500);
    window.setTimeout(() => {
      if (this.disposed) return;
      finish();
    }, 1750);
  }

  // 功能门（共创画廊 / 山河图志）：开门动画后由首页打开对应的全屏展厅覆盖层；
  // 门保持打开，覆盖层关闭时首页调 closeFeatureDoor 把门带上
  enterFeature(door) {
    this.inputEnabled = false;
    this.activeDoor = door;
    const dir = door.side === 'left' ? -1 : 1;
    this.targetYaw = -dir * 0.5;
    this.targetZ = door.position.z;

    new Tween(door.pivot.rotation)
      .to({ y: door.openAngle }, this.reducedMotion ? 200 : 800)
      .easing(Easing.Cubic.InOut)
      .delay(this.reducedMotion ? 0 : 300)
      .start();

    window.setTimeout(() => {
      if (this.disposed) return;
      this.callbacks.onOpenFeature?.(door.featureId);
      this.inputEnabled = true;
      this.activeDoor = null;
    }, this.reducedMotion ? 300 : 1050);
  }

  // 覆盖层关闭后把功能门带回关上
  closeFeatureDoor(featureId) {
    const door = this.doors.find((item) => item.featureId === featureId);
    if (!door || !door.opened) return;
    new Tween(door.pivot.rotation)
      .to({ y: 0 }, 700)
      .easing(Easing.Cubic.InOut)
      .start();
    door.opened = false;
  }

  // AI 共创门：开门动画后跳转到生成工坊
  enterGenerator(door) {
    this.inputEnabled = false;
    this.activeDoor = door;
    const dir = door.side === 'left' ? -1 : 1;
    this.targetYaw = -dir * 0.5;
    this.targetZ = door.position.z;

    new Tween(door.pivot.rotation)
      .to({ y: door.openAngle }, this.reducedMotion ? 200 : 800)
      .easing(Easing.Cubic.InOut)
      .delay(this.reducedMotion ? 0 : 300)
      .start();

    window.setTimeout(() => {
      if (!this.disposed) window.location.href = 'generator.html';
    }, this.reducedMotion ? 300 : 1050);
  }

  // ---------- 墙面展品格 ----------

  // 宫灯壁灯：入口段与功能门区段的门间墙面各挂一盏，暖光晕填补墙面留白
  buildLanterns() {
    const glowTexture = this.makeGlowTexture();
    const zs = [1.5, -36.5, -44.5, -53.5];
    zs.forEach((z) => {
      this.addLantern('left', z, glowTexture);
      this.addLantern('right', z, glowTexture);
    });
  }

  addLantern(side, z, glowTexture) {
    const dir = side === 'left' ? -1 : 1;
    const group = new THREE.Group();
    group.position.set(dir * (CORRIDOR.width / 2 - 0.2), 2.6, z);

    const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4a83a, roughness: 0.35, metalness: 0.8 });
    const redMat = new THREE.MeshStandardMaterial({
      color: 0xb03226,
      roughness: 0.5,
      metalness: 0.1,
      emissive: 0xff6a3c,
      emissiveIntensity: 0.55
    });

    // 墙面挂板 + 挑杆
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.12), goldMat);
    plate.position.set(dir * 0.16, 0.1, 0);
    group.add(plate);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.035, 0.035), goldMat);
    arm.position.set(dir * 0.05, 0.26, 0);
    group.add(arm);

    // 六棱朱漆灯身 + 鎏金灯盖
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.3, 6), redMat);
    group.add(body);
    [-1, 1].forEach((capDir) => {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.06, 6), goldMat);
      cap.position.set(0, capDir * 0.18, 0);
      group.add(cap);
    });

    // 灯穗
    const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 8), redMat);
    tassel.position.set(0, -0.3, 0);
    tassel.rotation.x = Math.PI;
    group.add(tassel);
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), goldMat);
    bead.position.set(0, -0.22, 0);
    group.add(bead);

    // 暖金光晕（加色混合 sprite，不占用真实光源）
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture,
      color: 0xffc97a,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    }));
    glow.scale.set(1.3, 1.3, 1);
    group.add(glow);

    this.scene.add(group);
  }

  // 径向光晕纹理（宫灯共用）
  makeGlowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    gradient.addColorStop(0, 'rgba(255, 220, 160, 0.85)');
    gradient.addColorStop(0.45, 'rgba(255, 190, 110, 0.28)');
    gradient.addColorStop(1, 'rgba(255, 190, 110, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  // 墙面展品格：把现有馆藏图标合成「鎏金画框」纹理，挂在门与门之间
  buildFrames(chapters) {
    const crafts = chapters.flatMap((chapter) => chapter.crafts || []).slice(0, 6);
    if (!crafts.length) return;

    const frameGeometry = new THREE.PlaneGeometry(1.35, 1.7);
    crafts.forEach((craft, index) => {
      const side = index % 2 === 0 ? 'left' : 'right';
      // 挂在相邻两门之间的墙面上
      const gapIndex = Math.floor(index / 2);
      const z = CORRIDOR.firstDoorZ - gapIndex * CORRIDOR.doorSpacing - CORRIDOR.doorSpacing / 2;
      const frame = new THREE.Mesh(
        frameGeometry,
        new THREE.MeshBasicMaterial({ map: this.makeFrameTexture(craft), transparent: true, toneMapped: false, fog: false })
      );
      frame.position.set(side === 'left' ? -(CORRIDOR.width / 2 - 0.06) : CORRIDOR.width / 2 - 0.06, 2.35, z);
      frame.rotation.y = side === 'left' ? Math.PI / 2 : -Math.PI / 2;
      this.scene.add(frame);
    });
  }

  // ---------- Canvas 纹理 ----------

  loadMuseumTexture(name, repeat = [1, 1]) {
    return loadManagedMuseumTexture({
      THREE,
      loader: textureLoader,
      renderer: this.renderer,
      url: `${TEXTURE_BASE}${name}.webp`,
      name,
      repeat,
      anisotropy: 8
    });
  }

  // 墙面/顶面材质：贴图同时挂自发光通道，暗部的浮雕纹理在全场景可读（不再是一团黑）
  makeWallMaterial(name, repeat, { roughness = 0.9, metalness = 0.05, emissiveIntensity = 0.2 } = {}) {
    const texture = this.loadMuseumTexture(name, repeat);
    return new THREE.MeshStandardMaterial({
      map: texture,
      emissive: 0xffffff,
      emissiveMap: texture,
      emissiveIntensity,
      roughness,
      metalness
    });
  }

  registerTextTexture(canvas, draw) {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    this.textTextures.push({ canvas, draw, texture });
    return texture;
  }

  refreshTextTextures() {
    this.textTextures.forEach(({ canvas, draw, texture }) => {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      draw(ctx, canvas);
      texture.needsUpdate = true;
    });
  }

  // 门楣牌匾：黑漆底 + 鎏金双线框 + 金字展厅名
  makeSignTexture(chapter) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 360;
    const draw = (ctx) => {
      const lacquer = ctx.createLinearGradient(0, 0, 0, 360);
      lacquer.addColorStop(0, '#1d150b');
      lacquer.addColorStop(1, '#120d07');
      ctx.fillStyle = lacquer;
      ctx.fillRect(0, 0, 1024, 360);
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 10;
      ctx.strokeRect(16, 16, 992, 328);
      ctx.lineWidth = 3;
      ctx.strokeRect(40, 40, 944, 280);
      // 四角鎏金铆钉
      ctx.fillStyle = GOLD;
      [[60, 60], [964, 60], [60, 300], [964, 300]].forEach(([x, y]) => {
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = GOLD_TEXT;
      ctx.font = '800 136px "Source Han Serif", serif';
      ctx.fillText(chapter.title || '', 512, 158);
      ctx.fillStyle = MIST;
      ctx.font = '44px "LXGW WenKai", serif';
      ctx.fillText(chapter.subtitle || '', 512, 292);
    };
    draw(canvas.getContext('2d'));
    return this.registerTextTexture(canvas, draw);
  }

  // 尽头墙横版馆名金匾（与上方金凤照壁组成端景）
  makeTitleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const draw = (ctx) => {
      ctx.clearRect(0, 0, 1024, 256);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = GOLD_TEXT;
      ctx.font = '800 112px "Source Han Serif", serif';
      ctx.fillText('非遗造物局', 512, 92);
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(312, 162);
      ctx.lineTo(712, 162);
      ctx.stroke();
      ctx.font = '36px "LXGW WenKai", serif';
      ctx.fillStyle = MIST;
      ctx.fillText('H E R I T A G E   F O U N D R Y', 512, 212);
    };
    draw(canvas.getContext('2d'));
    return this.registerTextTexture(canvas, draw);
  }

  // 展厅尽头墙大标题：展厅名 + 副题 + 馆藏数
  makeRoomTitleTexture(chapter) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const draw = (ctx) => {
      ctx.clearRect(0, 0, 1024, 512);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = GOLD_TEXT;
      ctx.font = '800 150px "Source Han Serif", serif';
      ctx.fillText(chapter?.title || '', 512, 180);
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(282, 288);
      ctx.lineTo(742, 288);
      ctx.stroke();
      ctx.font = '50px "LXGW WenKai", serif';
      ctx.fillStyle = MIST;
      ctx.fillText(chapter?.subtitle || '', 512, 368);
      ctx.font = '40px "LXGW WenKai", serif';
      ctx.fillText(`${chapter?.crafts?.length || 0} 件馆藏`, 512, 438);
    };
    draw(canvas.getContext('2d'));
    return this.registerTextTexture(canvas, draw);
  }

  // 展台名牌：深色小牌 + 绢白字
  makeStandLabelTexture(craft) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const draw = (ctx) => {
      ctx.fillStyle = 'rgba(18, 15, 11, 0.92)';
      ctx.beginPath();
      ctx.roundRect(8, 16, 496, 96, 10);
      ctx.fill();
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = SILK;
      ctx.font = '50px "LXGW WenKai", serif';
      ctx.fillText(craft?.name || '', 256, 66);
    };
    draw(canvas.getContext('2d'));
    return this.registerTextTexture(canvas, draw);
  }

  // 鎏金展品格：深色衬底 + 鎏金双线框 + 馆藏彩图 + 绢白名
  makeFrameTexture(craft) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 640;
    const image = new Image();
    const draw = (ctx) => {
      ctx.fillStyle = '#14110c';
      ctx.fillRect(0, 0, 512, 640);
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 8;
      ctx.strokeRect(12, 12, 488, 616);
      ctx.lineWidth = 2;
      ctx.strokeRect(30, 30, 452, 580);

      if (image.complete && image.naturalWidth > 0) {
        ctx.drawImage(image, 56, 56, 400, 400);
      }

      ctx.textAlign = 'center';
      ctx.fillStyle = SILK;
      ctx.font = '52px "LXGW WenKai", serif';
      ctx.fillText(craft.name || '', 256, 540);
      ctx.fillStyle = GOLD_TEXT;
      ctx.font = '32px "LXGW WenKai", serif';
      ctx.fillText(craft.category || '', 256, 592);
    };
    draw(canvas.getContext('2d'));
    image.onload = () => {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, 512, 640);
      draw(ctx, canvas);
      const entry = this.textTextures.find((item) => item.canvas === canvas);
      if (entry) entry.texture.needsUpdate = true;
    };
    image.src = `${CRAFT_ICON_BASE}${encodeURIComponent(craft.id)}.webp`;
    return this.registerTextTexture(canvas, draw);
  }

  // ---------- 输入 ----------

  bindEvents() {
    const canvas = this.renderer.domElement;

    this.resizeHandler = () => this.onResize();
    window.addEventListener('resize', this.resizeHandler);

    this.keydownHandler = (event) => {
      if (event.target?.closest?.('input, textarea, select')) return;
      if (!this.inputEnabled || this.renderPaused) return;
      const corridorFocused = document.activeElement === this.container
        || this.container.contains(document.activeElement);
      if (!corridorFocused) return;
      if (event.code === 'Escape' && this.viewState === 'room') {
        this.exitRoom();
        return;
      }

      const numericShortcut = event.code.match(/^Digit([1-9])$/);
      if (numericShortcut) {
        const index = Number(numericShortcut[1]) - 1;
        if (this.viewState === 'room') {
          const stand = this.currentDoor?.roomStands?.[index];
          if (stand?.craft) {
            event.preventDefault();
            this.callbacks.onSelectCraft?.(stand.craft);
          }
        } else if (this.viewState === 'corridor') {
          const chapterDoors = this.doors.filter((door) => door.kind === 'chapter');
          const door = chapterDoors[index];
          if (door) {
            event.preventDefault();
            this.enterChapter(door.id);
          }
        }
        return;
      }

      const step = { ArrowDown: 2.6, PageDown: 7, ArrowUp: -2.6, PageUp: -7 }[event.code];
      if (!step) return;
      event.preventDefault();
      this.moveRail(step);
    };
    window.addEventListener('keydown', this.keydownHandler);

    this.wheelHandler = (event) => {
      if (!this.inputEnabled || this.renderPaused) return;
      const delta = event.deltaY * CORRIDOR.railSpeed;
      if (this.viewState === 'room') {
        // 展厅内轨道沿 x：滚轮向下 = 走向展厅深处
        const magnitude = Math.abs(this.targetX);
        const releasing = (delta > 0 && magnitude >= ROOM.cameraDeep)
          || (delta < 0 && magnitude <= ROOM.cameraEnter);
        if (releasing) return;
        event.preventDefault();
        this.moveRail(delta);
        return;
      }
      const next = clampCorridorZ(this.targetZ - delta, this.railBounds);
      // 轨道到顶/到底后释放滚轮，让页面继续滚动（避免滚轮劫持）
      const releasing = (delta > 0 && this.targetZ <= this.railBounds.minZ)
        || (delta < 0 && this.targetZ >= this.railBounds.maxZ);
      if (releasing) return;
      event.preventDefault();
      this.targetZ = next;
    };
    canvas.addEventListener('wheel', this.wheelHandler, { passive: false });

    this.pointerDownHandler = (event) => {
      this.container.focus({ preventScroll: true });
      if (event.pointerType === 'touch') {
        this.touchPointer = {
          active: true,
          id: event.pointerId,
          lastY: event.clientY,
          lastX: event.clientX,
          startX: event.clientX,
          startY: event.clientY,
          moved: 0
        };
      }
    };
    this.pointerMoveHandler = (event) => {
      if (event.pointerType === 'mouse') {
        // 鼠标位置 → 视差环顾目标值（展厅内环顾范围更大，方便看两侧展台）
        const nx = (event.clientX / Math.max(window.innerWidth, 1) - 0.5) * 2;
        const ny = (event.clientY / Math.max(window.innerHeight, 1) - 0.5) * 2;
        if (!this.reducedMotion && this.inputEnabled) {
          const inRoom = this.viewState === 'room';
          const yawRange = inRoom ? ROOM.parallaxYaw : CORRIDOR.parallaxYaw;
          const pitchRange = inRoom ? ROOM.parallaxPitch : CORRIDOR.parallaxPitch;
          this.targetYaw = this.baseYaw + (-nx * yawRange);
          this.targetPitch = -ny * pitchRange;
        }
        const rect = canvas.getBoundingClientRect();
        this.pointerNdc.set(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          -((event.clientY - rect.top) / rect.height) * 2 + 1
        );
      } else if (this.touchPointer.active && event.pointerId === this.touchPointer.id) {
        // 触摸竖滑 → 轨道前进后退（上滑 = 前进）
        const dy = event.clientY - this.touchPointer.lastY;
        this.touchPointer.lastY = event.clientY;
        this.touchPointer.moved += Math.abs(dy) + Math.abs(event.clientX - this.touchPointer.lastX);
        this.touchPointer.lastX = event.clientX;
        if (this.inputEnabled && !this.renderPaused) {
          if (this.viewState === 'room') {
            this.moveRail(dy * 0.03);
          } else {
            this.targetZ = clampCorridorZ(this.targetZ - dy * 0.03, this.railBounds);
          }
        }
      }
    };
    this.pointerUpHandler = (event) => {
      if (this.touchPointer.active && event.pointerId === this.touchPointer.id) {
        const wasTap = this.touchPointer.moved < 8;
        this.touchPointer = { active: false, id: null, lastY: 0, moved: 0, lastX: 0, startX: 0, startY: 0 };
        if (wasTap) this.pickAt(event.clientX, event.clientY);
        return;
      }
      if (event.pointerType === 'mouse' && event.button === 0) {
        this.pickAt(event.clientX, event.clientY);
      }
    };
    canvas.addEventListener('pointerdown', this.pointerDownHandler);
    canvas.addEventListener('pointermove', this.pointerMoveHandler);
    canvas.addEventListener('pointerup', this.pointerUpHandler);
    canvas.addEventListener('pointercancel', this.pointerUpHandler);

    this.visibilityHandler = () => {
      if (document.hidden) {
        this.clock.stop();
      } else if (!this.renderPaused) {
        this.clock.start();
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  // 轨道移动统一入口：走廊沿 z（前进 = -z），展厅沿 x（前进 = 深入展厅）
  moveRail(step) {
    if (this.viewState === 'room') {
      const dir = this.currentDoor?.side === 'left' ? -1 : 1;
      this.targetX = dir * THREE.MathUtils.clamp(
        Math.abs(this.targetX) + step,
        ROOM.cameraEnter,
        ROOM.cameraDeep
      );
    } else {
      this.targetZ = clampCorridorZ(this.targetZ - step, this.railBounds);
    }
  }

  // 点击路由：走廊点门进展厅，展厅点模型看详情
  pickAt(clientX, clientY) {
    if (!this.inputEnabled || this.renderPaused) return;
    if (this.viewState === 'room') {
      this.pickRoomStand(clientX, clientY);
    } else if (this.viewState === 'corridor') {
      this.pickDoor(clientX, clientY);
    }
  }

  pickDoor(clientX, clientY) {
    if (this.activeDoor) return;
    const pointer = this.ndcFromClient(clientX, clientY);
    this.raycaster.setFromCamera(pointer, this.camera);

    const hits = this.raycaster.intersectObjects(this.doors.map((door) => door.group), true);
    if (!hits.length) return;
    let node = hits[0].object;
    while (node && !node.userData.door) node = node.parent;
    const door = node?.userData.door;
    if (!door) return;
    this.activeDoor = door;
    door.opened = true;
    if (door.kind === 'generator') {
      this.enterGenerator(door);
    } else if (door.kind === 'feature') {
      this.enterFeature(door);
    } else {
      this.enterRoom(door);
    }
  }

  pickRoomStand(clientX, clientY) {
    const stands = this.currentDoor?.roomStands || [];
    const pointer = this.ndcFromClient(clientX, clientY);
    this.raycaster.setFromCamera(pointer, this.camera);
    const anchors = stands
      .filter((stand) => stand.modelAnchor.children.length)
      .map((stand) => stand.modelAnchor);
    const hits = this.raycaster.intersectObjects(anchors, true);
    if (!hits.length) return;
    const stand = stands.find((item) => {
      let node = hits[0].object;
      while (node) {
        if (node === item.modelAnchor) return true;
        node = node.parent;
      }
      return false;
    });
    if (stand?.craft) this.callbacks.onSelectCraft?.(stand.craft);
  }

  ndcFromClient(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
  }

  setInputEnabled(enabled) {
    this.inputEnabled = Boolean(enabled);
  }

  setRenderPaused(paused) {
    this.renderPaused = Boolean(paused);
    if (this.renderPaused) {
      this.clock.stop();
    } else if (!document.hidden) {
      this.clock.start();
    }
  }

  // ---------- 主循环 ----------

  animate() {
    if (this.disposed) return;
    this.animationId = requestAnimationFrame(() => this.animate());
    if (this.renderPaused) return;
    const now = performance.now();
    const dt = Math.min(this.clock.getDelta(), 0.066);

    updateTweens(now);

    // 轨道：x/z 向目标值平滑逼近（走廊走 z，展厅走 x）
    this.camera.position.z = THREE.MathUtils.lerp(this.camera.position.z, this.targetZ, CORRIDOR.railSmoothing);
    this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, this.targetX, CORRIDOR.railSmoothing);
    this.camera.position.y = this.viewState === 'room' ? ROOM.eyeY : CORRIDOR.eyeY;

    // 视差环顾：yaw/pitch 平滑逼近
    this.yaw = THREE.MathUtils.lerp(this.yaw, this.targetYaw, 0.06);
    this.pitch = THREE.MathUtils.lerp(this.pitch, this.targetPitch, 0.06);
    this.camera.rotation.set(this.pitch, this.yaw, 0);

    if (this.viewState === 'room') {
      this.updateRoomHover(dt);
    } else if (this.viewState === 'corridor') {
      this.updateDoorHover(dt);
    }

    // 展厅模型：缓慢自旋 + 悬浮
    if (!this.reducedMotion && this.viewState === 'room' && this.currentDoor) {
      this.currentDoor.roomStands.forEach((stand, index) => {
        if (!stand.modelAnchor.children.length) return;
        stand.modelAnchor.rotation.y += dt * 0.4;
        stand.modelAnchor.position.y = 1.55 + Math.sin(now * 0.001 + index) * 0.05;
      });
    }

    this.renderer.render(this.scene, this.camera);
  }

  // 走廊门悬停高亮：牌匾轻微放大 + 指针手势
  updateDoorHover(dt) {
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hits = this.raycaster.intersectObjects(this.doors.map((door) => door.group), true);
    let hovered = null;
    if (hits.length) {
      let node = hits[0].object;
      while (node && !node.userData.door) node = node.parent;
      hovered = node?.userData.door || null;
    }
    if (hovered !== this.hoveredDoor) {
      this.hoveredDoor = hovered;
      this.renderer.domElement.style.cursor = hovered ? 'pointer' : '';
    }
    this.doors.forEach((door) => {
      const target = door === hovered && !door.opened ? 1 : 0;
      door.hoverT += (target - door.hoverT) * Math.min(1, dt * 10);
      door.sign.scale.setScalar(1 + door.hoverT * 0.08);
    });
  }

  // 展厅展台悬停：模型轻微放大 + 指针手势
  updateRoomHover(dt) {
    const stands = this.currentDoor?.roomStands || [];
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const anchors = stands
      .filter((stand) => stand.modelAnchor.children.length)
      .map((stand) => stand.modelAnchor);
    const hits = this.raycaster.intersectObjects(anchors, true);
    let hovered = null;
    if (hits.length) {
      hovered = stands.find((stand) => {
        let node = hits[0].object;
        while (node) {
          if (node === stand.modelAnchor) return true;
          node = node.parent;
        }
        return false;
      }) || null;
    }
    if (hovered !== this.hoveredStand) {
      this.hoveredStand = hovered;
      this.renderer.domElement.style.cursor = hovered ? 'pointer' : '';
    }
    stands.forEach((stand) => {
      const target = stand === hovered ? 1 : 0;
      stand.hoverT += (target - stand.hoverT) * Math.min(1, dt * 10);
      stand.modelAnchor.scale.setScalar(1 + stand.hoverT * 0.06);
    });
  }

  onResize() {
    if (!this.camera || !this.renderer) return;
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  dispose() {
    this.disposed = true;
    if (this.animationId) cancelAnimationFrame(this.animationId);
    window.removeEventListener('resize', this.resizeHandler);
    window.removeEventListener('keydown', this.keydownHandler);
    document.removeEventListener('visibilitychange', this.visibilityHandler);
    const canvas = this.renderer?.domElement;
    if (canvas) {
      canvas.removeEventListener('wheel', this.wheelHandler);
      canvas.removeEventListener('pointerdown', this.pointerDownHandler);
      canvas.removeEventListener('pointermove', this.pointerMoveHandler);
      canvas.removeEventListener('pointerup', this.pointerUpHandler);
      canvas.removeEventListener('pointercancel', this.pointerUpHandler);
    }
    this.scene?.traverse((child) => {
      child.geometry?.dispose?.();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.filter(Boolean).forEach((material) => {
        Object.keys(material).forEach((key) => {
          if (material[key]?.isTexture) material[key].dispose();
        });
        material.dispose();
      });
    });
    this.renderer?.dispose();
    if (canvas?.parentNode === this.container) {
      this.container.removeChild(canvas);
    }
  }
}

// 与 MuseumScene 同款归一化：按最大边缩放到目标尺寸并居中。
function normalizeObject(object, targetSize) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(maxDim) || maxDim <= 0) return;
  const scale = targetSize / maxDim;
  object.scale.setScalar(scale);
  object.position.copy(center).multiplyScalar(-scale);
  object.updateMatrixWorld(true);
}
