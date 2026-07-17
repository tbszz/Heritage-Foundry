// 第一人称 3D 博物馆：开场牌匾 → 冲刺进门 → WASD 自由行走 → 两侧展台悬浮 GLB。
// 渲染/灯光惯例与 ParticleMorphScene 保持一致（RoomEnvironment PMREM + ACES）。
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createGLTFLoader } from '../utils/modelLoader.js';
import { Easing, Tween, update as updateTweens } from '@tweenjs/tween.js/dist/tween.esm.js';

const INK = 0x05070c;
const GOLD = 0xc99a2e;
const GOLD_LIGHT = 0xf8e5b8;
const RED = 0x8e2420;

export const HALL = {
  width: 14,           // 走廊总宽（墙在 x=±7）
  standX: 3.9,         // 展台中心离中轴距离
  rowSpacing: 6,       // 展台排距
  firstRowZ: -9,       // 第一排展台 z
  doorZ: 0,            // 大门所在平面
  endMargin: 7,        // 末排到尽头的距离
  height: 5.6,         // 层高
  playerMinX: 4.7,     // 玩家可活动半宽
  playerMaxZ: 2.2,     // 玩家最靠外 z
  standRadius: 0.95    // 展台碰撞半径
};

// 纯函数：把带模型的技艺铺成左右交替的展台序列（可单测）。
export function getStandLayout(crafts = []) {
  return crafts
    .filter((craft) => Boolean(craft?.modelUrl))
    .map((craft, index) => {
      const side = index % 2 === 0 ? 'left' : 'right';
      const row = Math.floor(index / 2);
      return {
        craft,
        id: craft.id,
        index,
        row,
        side,
        stopLabel: String(index + 1).padStart(2, '0'),
        position: {
          x: side === 'left' ? -HALL.standX : HALL.standX,
          y: 0,
          z: HALL.firstRowZ - row * HALL.rowSpacing
        }
      };
    });
}

export class MuseumScene {
  constructor(container) {
    this.container = container;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.loader = createGLTFLoader();
    this.clock = new THREE.Clock();
    this.state = 'gate'; // gate → entering → explore
    this.callbacks = {};
    this.stands = [];
    this.modelCache = new Map();
    this.focusedStand = null;
    this.inputEnabled = true;
    this.reducedMotion = false;

    this.yaw = 0;
    this.pitch = 0;
    this.velocity = new THREE.Vector3();
    this.keys = new Set();
    this.lookTarget = new THREE.Vector3(0, 4.0, 0);
    this.plaqueTarget = new THREE.Vector3(0, 4.0, 0);
    this.joystick = { active: false, id: null, baseX: 0, baseY: 0, x: 0, y: 0 };
    this.lookPointer = { active: false, id: null, lastX: 0, lastY: 0, moved: 0 };
    this.raycaster = new THREE.Raycaster();
    this.doorPivots = [];
    this.textTextures = [];
    this.animationId = null;
    this.disposed = false;

    this.resizeHandler = null;
    this.keydownHandler = null;
    this.keyupHandler = null;
    this.pointerDownHandler = null;
    this.pointerMoveHandler = null;
    this.pointerUpHandler = null;
    this.wheelHandler = null;
    this.visibilityHandler = null;
  }

  init({ layout = [], onStateChange, onFocusStand, onSelectStand } = {}) {
    this.callbacks = { onStateChange, onFocusStand, onSelectStand };
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;

    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(INK);
    this.scene.fog = new THREE.Fog(INK, 22, 90);

    this.camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 220);
    this.camera.position.set(0, 2.1, 30);
    this.camera.rotation.order = 'YXZ';
    this.camera.lookAt(this.plaqueTarget);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.container.appendChild(this.renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(roomEnv).texture;
    roomEnv.dispose();
    pmrem.dispose();

    this.addLighting();
    this.buildExterior();
    this.buildInterior();
    layout.forEach((standLayout) => this.buildStand(standLayout));
    this.bindEvents();

    // 字体加载完成后重绘牌匾 / 名牌纹理（@font-face 在 style.css 中声明）
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => this.refreshTextTextures()).catch(() => {});
    }

    this.animate();
  }

  // ---------- 场景搭建 ----------

  addLighting() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.32));

    const moonLight = new THREE.DirectionalLight(0xbfd4ff, 0.5);
    moonLight.position.set(-6, 12, 18);
    this.scene.add(moonLight);

    const doorGlow = new THREE.PointLight(0xffd28a, 6, 16, 1.6);
    doorGlow.position.set(0, 3.0, 1.6);
    this.scene.add(doorGlow);

    // 馆内沿走廊三盏暖光，其余氛围靠自发光材质
    [-14, -32, -50].forEach((z) => {
      const light = new THREE.PointLight(0xffd9a0, 10, 22, 1.8);
      light.position.set(0, 4.6, z);
      this.scene.add(light);
    });
  }

  buildExterior() {
    // 星空
    const starCount = 700;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i += 1) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random());
      const radius = 90 + Math.random() * 60;
      starPositions[i * 3] = Math.sin(phi) * Math.cos(theta) * radius;
      starPositions[i * 3 + 1] = Math.abs(Math.cos(phi)) * radius * 0.6 + 2;
      starPositions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const stars = new THREE.Points(
      starGeometry,
      new THREE.PointsMaterial({ color: 0xcfd8ff, size: 0.35, sizeAttenuation: true, fog: false })
    );
    this.scene.add(stars);

    // 广场地面
    const plaza = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 60),
      new THREE.MeshStandardMaterial({ color: 0x0b0f16, roughness: 0.95, metalness: 0.05 })
    );
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(0, 0, 26);
    this.scene.add(plaza);

    // 门楼：两侧围墙 + 立柱 + 门楣 + 牌匾 + 双开红门
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x151a22, roughness: 0.85 });
    const gateWallL = new THREE.Mesh(new THREE.BoxGeometry(4.7, 4.4, 0.4), wallMaterial);
    gateWallL.position.set(-4.65, 2.2, HALL.doorZ);
    const gateWallR = gateWallL.clone();
    gateWallR.position.x = 4.65;
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.8, 0.4), wallMaterial);
    lintel.position.set(0, 4.0, HALL.doorZ);
    this.scene.add(gateWallL, gateWallR, lintel);

    const columnMaterial = new THREE.MeshStandardMaterial({ color: RED, roughness: 0.55, metalness: 0.1 });
    [-3.15, 3.15].forEach((x) => {
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 4.4, 20), columnMaterial);
      column.position.set(x, 2.2, 0.45);
      this.scene.add(column);
    });

    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(9.6, 0.55, 1.1),
      new THREE.MeshStandardMaterial({ color: 0x1f130d, roughness: 0.7 })
    );
    beam.position.set(0, 4.75, 0.45);
    this.scene.add(beam);

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(10.6, 0.35, 2.0),
      new THREE.MeshStandardMaterial({ color: 0x101318, roughness: 0.9 })
    );
    roof.position.set(0, 5.2, 0.45);
    this.scene.add(roof);

    // 牌匾（Canvas 纹理，字体就绪后重绘）
    const plaqueTexture = this.makePlaqueTexture();
    const plaque = new THREE.Mesh(
      new THREE.BoxGeometry(3.6, 1.15, 0.14),
      [
        new THREE.MeshStandardMaterial({ color: 0x1f130d }),
        new THREE.MeshStandardMaterial({ color: 0x1f130d }),
        new THREE.MeshStandardMaterial({ color: 0x1f130d }),
        new THREE.MeshStandardMaterial({ color: 0x1f130d }),
        new THREE.MeshStandardMaterial({ map: plaqueTexture, roughness: 0.6 }),
        new THREE.MeshStandardMaterial({ color: 0x1f130d })
      ]
    );
    plaque.position.set(0, 4.0, 0.62);
    this.scene.add(plaque);

    // 双开红门（铰链在两侧，进场时向内旋开）
    const doorMaterial = new THREE.MeshStandardMaterial({ color: RED, roughness: 0.5, metalness: 0.15 });
    const doorStudMaterial = new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.35, metalness: 0.7 });
    [
      { hingeX: -2.3, panelX: 1.12, openAngle: -Math.PI * 0.56 },
      { hingeX: 2.3, panelX: -1.12, openAngle: Math.PI * 0.56 }
    ].forEach(({ hingeX, panelX, openAngle }) => {
      const pivot = new THREE.Group();
      pivot.position.set(hingeX, 0, HALL.doorZ);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(2.24, 3.6, 0.12), doorMaterial);
      panel.position.set(panelX, 1.8, 0);
      pivot.add(panel);
      for (let row = 0; row < 3; row += 1) {
        for (let col = 0; col < 2; col += 1) {
          const stud = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 10), doorStudMaterial);
          stud.position.set(panelX + (col === 0 ? -0.7 : 0.7), 1.0 + row * 0.8, 0.09);
          pivot.add(stud);
        }
      }
      pivot.userData.openAngle = openAngle;
      this.doorPivots.push(pivot);
      this.scene.add(pivot);
    });

    // 门口两盏红灯笼
    [-3.15, 3.15].forEach((x) => {
      const lantern = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 16, 12),
        new THREE.MeshStandardMaterial({
          color: 0xd3382f,
          emissive: 0xff5a3c,
          emissiveIntensity: 1.4,
          roughness: 0.4
        })
      );
      lantern.scale.y = 0.85;
      lantern.position.set(x, 3.1, 1.0);
      this.scene.add(lantern);
      const light = new THREE.PointLight(0xff6a4a, 3.5, 8, 1.8);
      light.position.set(x, 3.1, 1.4);
      this.scene.add(light);
    });
  }

  buildInterior() {
    const hallLength = Math.abs(HALL.firstRowZ - 8 * HALL.rowSpacing) + HALL.endMargin + 6;
    const hallCenterZ = 4 - hallLength / 2;
    const endZ = 4 - hallLength;

    // 地板（深色石砖 + 金色中线）
    const floorTexture = this.makeFloorTexture();
    floorTexture.wrapS = THREE.RepeatWrapping;
    floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(4, Math.ceil(hallLength / 4));
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(HALL.width, hallLength),
      new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.55, metalness: 0.25 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, hallCenterZ);
    this.scene.add(floor);

    const centerLine = new THREE.Mesh(
      new THREE.PlaneGeometry(0.16, hallLength - 4),
      new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.35 })
    );
    centerLine.rotation.x = -Math.PI / 2;
    centerLine.position.set(0, 0.012, hallCenterZ);
    this.scene.add(centerLine);

    // 墙面与立柱
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x11161f, roughness: 0.9 });
    [-HALL.width / 2, HALL.width / 2].forEach((x) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.4, HALL.height, hallLength), wallMaterial);
      wall.position.set(x, HALL.height / 2, hallCenterZ);
      this.scene.add(wall);
    });
    const pilasterMaterial = new THREE.MeshStandardMaterial({ color: 0x1a2230, roughness: 0.75 });
    for (let row = -1; row <= 9; row += 1) {
      const z = HALL.firstRowZ - row * HALL.rowSpacing + HALL.rowSpacing / 2;
      [-HALL.width / 2 + 0.45, HALL.width / 2 - 0.45].forEach((x) => {
        const pilaster = new THREE.Mesh(new THREE.BoxGeometry(0.5, HALL.height, 0.5), pilasterMaterial);
        pilaster.position.set(x, HALL.height / 2, z);
        this.scene.add(pilaster);
      });
    }

    // 顶面与横梁
    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(HALL.width, hallLength),
      new THREE.MeshStandardMaterial({ color: 0x0a0d13, roughness: 0.95 })
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, HALL.height, hallCenterZ);
    this.scene.add(ceiling);

    const beamMaterial = new THREE.MeshStandardMaterial({ color: 0x241812, roughness: 0.7 });
    for (let row = -1; row <= 9; row += 1) {
      const z = HALL.firstRowZ - row * HALL.rowSpacing + HALL.rowSpacing / 2;
      const beam = new THREE.Mesh(new THREE.BoxGeometry(HALL.width, 0.28, 0.36), beamMaterial);
      beam.position.set(0, HALL.height - 0.14, z);
      this.scene.add(beam);
    }

    // 走廊吊灯（自发光，不额外开光源）
    for (let row = 0; row < 9; row += 2) {
      const z = HALL.firstRowZ - row * HALL.rowSpacing - HALL.rowSpacing / 2;
      const lantern = new THREE.Mesh(
        new THREE.SphereGeometry(0.26, 14, 10),
        new THREE.MeshStandardMaterial({
          color: 0xd3382f,
          emissive: 0xff7a4a,
          emissiveIntensity: 1.6,
          roughness: 0.4
        })
      );
      lantern.scale.y = 0.8;
      lantern.position.set(0, HALL.height - 0.9, z);
      this.scene.add(lantern);
      const cord = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.015, 0.7, 6),
        new THREE.MeshBasicMaterial({ color: 0x33221a })
      );
      cord.position.set(0, HALL.height - 0.35, z);
      this.scene.add(cord);
    }

    // 尽头影壁 + 印章标志
    const endWall = new THREE.Mesh(new THREE.BoxGeometry(HALL.width, HALL.height, 0.4), wallMaterial);
    endWall.position.set(0, HALL.height / 2, endZ);
    this.scene.add(endWall);

    new THREE.TextureLoader().load('/assets/generated/seal-mark.webp', (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      const emblem = new THREE.Mesh(
        new THREE.PlaneGeometry(2.6, 2.6),
        new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.92 })
      );
      emblem.position.set(0, 2.7, endZ + 0.25);
      this.scene.add(emblem);
    });
  }

  buildStand(layout) {
    const group = new THREE.Group();
    group.position.set(layout.position.x, 0, layout.position.z);
    this.scene.add(group);

    const craftColor = new THREE.Color(layout.craft.color || '#c99a2e');

    // 石质基座 + 金色顶圈
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.66, 1.1, 24),
      new THREE.MeshStandardMaterial({ color: 0x1a2029, roughness: 0.65, metalness: 0.2 })
    );
    pedestal.position.y = 0.55;
    group.add(pedestal);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.56, 0.03, 10, 40),
      new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.3, metalness: 0.8 })
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 1.1;
    group.add(rim);

    // 地面光晕（颜色随技艺）
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.makeGlowTexture(),
        color: craftColor,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    glow.scale.set(2.6, 2.6, 1);
    glow.position.y = 0.15;
    group.add(glow);

    // 悬浮环（低于视高，从上方看呈环绕模型的光环）
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.05, 0.012, 8, 64),
      new THREE.MeshBasicMaterial({
        color: GOLD_LIGHT,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.2;
    group.add(ring);

    // 名牌（Canvas Sprite，朝向走廊一侧）
    const labelTexture = this.makeLabelTexture(layout);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture, transparent: true, depthWrite: false }));
    label.scale.set(1.7, 0.53, 1);
    label.position.set(layout.side === 'left' ? 0.85 : -0.85, 0.72, 0);
    group.add(label);

    // 墙面挂幅
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 3.1),
      new THREE.MeshStandardMaterial({
        map: this.makeBannerTexture(layout),
        transparent: true,
        roughness: 0.85,
        side: THREE.DoubleSide
      })
    );
    banner.position.set(layout.side === 'left' ? -2.6 : 2.6, 2.6, 0);
    banner.rotation.y = layout.side === 'left' ? Math.PI / 2 : -Math.PI / 2;
    group.add(banner);

    const modelAnchor = new THREE.Group();
    modelAnchor.position.y = 1.85;
    group.add(modelAnchor);

    const stand = {
      ...layout,
      group,
      modelAnchor,
      ring,
      glow,
      label,
      craftColor,
      loaded: false,
      loading: false,
      highlighted: false,
      highlightT: 0
    };
    group.userData.stand = stand;
    this.stands.push(stand);
    return stand;
  }

  // ---------- Canvas 纹理 ----------

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

  makePlaqueTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 340;
    const draw = (ctx) => {
      const bg = ctx.createLinearGradient(0, 0, 0, 340);
      bg.addColorStop(0, '#2c1a10');
      bg.addColorStop(1, '#1a0f08');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 1024, 340);
      ctx.strokeStyle = '#c99a2e';
      ctx.lineWidth = 10;
      ctx.strokeRect(18, 18, 988, 304);
      ctx.lineWidth = 3;
      ctx.strokeRect(38, 38, 948, 264);

      const goldGradient = ctx.createLinearGradient(0, 70, 0, 240);
      goldGradient.addColorStop(0, '#f8e5b8');
      goldGradient.addColorStop(1, '#c99a2e');
      ctx.fillStyle = goldGradient;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const chars = '非遗造物局'.split('');
      ctx.font = '900 150px "Source Han Serif Local", serif';
      chars.forEach((char, index) => {
        ctx.fillText(char, 180 + index * 166, 165);
      });
      ctx.font = '42px "LXGW WenKai Local", serif';
      ctx.fillStyle = 'rgba(248, 229, 184, 0.85)';
      ctx.fillText('AI 非遗文创与手作方案生成平台', 512, 285);
    };
    draw(canvas.getContext('2d'));
    return this.registerTextTexture(canvas, draw);
  }

  makeLabelTexture(stand) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 160;
    const draw = (ctx) => {
      ctx.fillStyle = 'rgba(5, 8, 12, 0.72)';
      ctx.beginPath();
      ctx.roundRect(6, 14, 500, 132, 18);
      ctx.fill();
      ctx.strokeStyle = 'rgba(201, 154, 46, 0.85)';
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f8e5b8';
      ctx.font = '900 58px "Source Han Serif Local", serif';
      ctx.fillText(`${stand.stopLabel} · ${stand.craft.name}`, 256, 72);
      ctx.fillStyle = 'rgba(248, 229, 184, 0.72)';
      ctx.font = '34px "LXGW WenKai Local", serif';
      ctx.fillText(stand.craft.category || '', 256, 124);
    };
    draw(canvas.getContext('2d'));
    return this.registerTextTexture(canvas, draw);
  }

  makeBannerTexture(stand) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 512;
    const color = stand.craft.color || '#c99a2e';
    const draw = (ctx) => {
      const gradient = ctx.createLinearGradient(0, 0, 0, 512);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, 'rgba(5, 8, 12, 0.12)');
      ctx.fillStyle = gradient;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(0, 0, 256, 512);
      ctx.globalAlpha = 1;
      ctx.font = '120px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(stand.craft.emoji || '✦', 128, 170);
      ctx.fillStyle = 'rgba(255, 250, 240, 0.92)';
      ctx.font = '52px "LXGW WenKai Local", serif';
      (stand.craft.name || '').split('').slice(0, 5).forEach((char, index) => {
        ctx.fillText(char, 128, 270 + index * 62);
      });
    };
    draw(canvas.getContext('2d'));
    return this.registerTextTexture(canvas, draw);
  }

  makeFloorTexture() {
    if (this.floorTexture) return this.floorTexture;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#10151d';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#1d2632';
    ctx.lineWidth = 3;
    for (let i = 0; i <= 256; i += 64) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 256);
      ctx.moveTo(0, i);
      ctx.lineTo(256, i);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
    for (let i = 0; i < 120; i += 1) {
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    this.floorTexture = new THREE.CanvasTexture(canvas);
    this.floorTexture.colorSpace = THREE.SRGBColorSpace;
    return this.floorTexture;
  }

  makeGlowTexture() {
    if (this.glowTexture) return this.glowTexture;
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.28)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    this.glowTexture = new THREE.CanvasTexture(canvas);
    return this.glowTexture;
  }

  // ---------- 进场 ----------

  enter() {
    if (this.state !== 'gate') return;
    this.state = 'entering';
    this.callbacks.onStateChange?.('entering');

    const now = performance.now();

    // 红门旋开
    this.doorPivots.forEach((pivot, index) => {
      new Tween(pivot.rotation)
        .to({ y: pivot.userData.openAngle }, this.reducedMotion ? 200 : 1100)
        .easing(Easing.Cubic.InOut)
        .delay(index * 60)
        .start(now);
    });

    if (this.reducedMotion) {
      // 减少动效：直接落位
      this.camera.position.set(0, 1.7, -4.5);
      this.setYawPitchFromLookAt(new THREE.Vector3(0, 1.6, -40));
      this.state = 'explore';
      this.callbacks.onStateChange?.('explore');
      this.startModelLoading();
      return;
    }

    const duration = 2100;
    this.shakeUntil = now + duration - 500;

    // 视线：牌匾 → 大厅深处
    const lookStart = this.plaqueTarget.clone();
    const lookEnd = new THREE.Vector3(0, 1.6, -40);
    new Tween({ t: 0 })
      .to({ t: 1 }, duration)
      .easing(Easing.Cubic.InOut)
      .onUpdate(({ t }) => {
        this.lookTarget.lerpVectors(lookStart, lookEnd, t);
      })
      .start(now);

    // 相机：加速冲近（冲击感）→ 穿门落定
    new Tween(this.camera.position)
      .to({ x: 0, y: 1.82, z: 5.5 }, 1300)
      .easing(Easing.Cubic.In)
      .start(now)
      .onComplete(() => {
        new Tween(this.camera.position)
          .to({ x: 0, y: 1.7, z: -4.5 }, 800)
          .easing(Easing.Cubic.Out)
          .start()
          .onComplete(() => {
            this.setYawPitchFromLookAt(lookEnd);
            this.state = 'explore';
            this.callbacks.onStateChange?.('explore');
            this.startModelLoading();
          });
      });

    // FOV 冲击：55 → 78 → 55
    new Tween(this.camera)
      .to({ fov: 78 }, 1200)
      .easing(Easing.Cubic.In)
      .onUpdate(() => this.camera.updateProjectionMatrix())
      .start(now)
      .onComplete(() => {
        new Tween(this.camera)
          .to({ fov: 55 }, 900)
          .easing(Easing.Cubic.Out)
          .onUpdate(() => this.camera.updateProjectionMatrix())
          .start();
      });
  }

  setYawPitchFromLookAt(target) {
    const direction = target.clone().sub(this.camera.position).normalize();
    this.yaw = Math.atan2(-direction.x, -direction.z);
    this.pitch = Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1));
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  // ---------- 模型加载 ----------

  loadCraftModel(url) {
    if (!this.modelCache.has(url)) {
      this.modelCache.set(url, new Promise((resolve, reject) => {
        this.loader.load(url, resolve, undefined, reject);
      }));
    }
    return this.modelCache.get(url);
  }

  attachModel(stand) {
    if (stand.loaded || stand.loading || this.disposed) return;
    stand.loading = true;
    this.loadCraftModel(stand.craft.modelUrl)
      .then((gltf) => {
        if (this.disposed) return;
        const model = gltf.scene.clone(true);
        normalizeObject(model, 1.5);
        stand.modelAnchor.add(model);
        stand.loaded = true;
      })
      .catch(() => {})
      .finally(() => {
        stand.loading = false;
      });
  }

  startModelLoading() {
    // 按排数由近及远加载，并发 2；走近的展台会插队立即加载
    const queue = [...this.stands].sort((a, b) => a.row - b.row || a.index - b.index);
    let active = 0;
    const pump = () => {
      if (this.disposed) return;
      while (active < 2 && queue.length) {
        const stand = queue.shift();
        if (stand.loaded || stand.loading) continue;
        active += 1;
        const url = stand.craft.modelUrl;
        stand.loading = true;
        this.loadCraftModel(url)
          .then((gltf) => {
            if (this.disposed) return;
            const model = gltf.scene.clone(true);
            normalizeObject(model, 1.5);
            stand.modelAnchor.add(model);
            stand.loaded = true;
          })
          .catch(() => {})
          .finally(() => {
            stand.loading = false;
            active -= 1;
            pump();
          });
      }
    };
    pump();
  }

  // ---------- 输入 ----------

  bindEvents() {
    const canvas = this.renderer.domElement;

    this.resizeHandler = () => this.onResize();
    window.addEventListener('resize', this.resizeHandler);

    this.keydownHandler = (event) => {
      if (event.target?.closest?.('input, textarea, select')) return;
      if (event.code === 'KeyE' && this.state === 'explore' && this.inputEnabled) {
        if (this.focusedStand) this.callbacks.onSelectStand?.(this.focusedStand);
        return;
      }
      this.keys.add(event.code);
    };
    this.keyupHandler = (event) => this.keys.delete(event.code);
    window.addEventListener('keydown', this.keydownHandler);
    window.addEventListener('keyup', this.keyupHandler);

    this.wheelHandler = (event) => {
      if (this.state === 'gate') {
        event.preventDefault();
        this.enter();
      } else if (this.state === 'explore' && this.inputEnabled) {
        event.preventDefault();
        const forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();
        this.camera.position.addScaledVector(forward, -Math.sign(event.deltaY) * 0.9);
        this.resolveCollisions();
      }
    };
    canvas.addEventListener('wheel', this.wheelHandler, { passive: false });

    this.pointerDownHandler = (event) => {
      if (this.state === 'gate') {
        this.enter();
        return;
      }
      if (this.state !== 'explore' || !this.inputEnabled) return;
      canvas.setPointerCapture?.(event.pointerId);
      if (event.pointerType === 'touch' && event.clientX < window.innerWidth / 2 && !this.joystick.active) {
        this.joystick = { active: true, id: event.pointerId, baseX: event.clientX, baseY: event.clientY, x: 0, y: 0 };
      } else if (!this.lookPointer.active) {
        this.lookPointer = { active: true, id: event.pointerId, lastX: event.clientX, lastY: event.clientY, moved: 0 };
      }
    };
    this.pointerMoveHandler = (event) => {
      if (this.joystick.active && event.pointerId === this.joystick.id) {
        const dx = event.clientX - this.joystick.baseX;
        const dy = event.clientY - this.joystick.baseY;
        const radius = 60;
        const length = Math.hypot(dx, dy) || 1;
        const clamped = Math.min(length, radius);
        this.joystick.x = (dx / length) * (clamped / radius);
        this.joystick.y = (dy / length) * (clamped / radius);
      } else if (this.lookPointer.active && event.pointerId === this.lookPointer.id) {
        const dx = event.clientX - this.lookPointer.lastX;
        const dy = event.clientY - this.lookPointer.lastY;
        this.lookPointer.lastX = event.clientX;
        this.lookPointer.lastY = event.clientY;
        this.lookPointer.moved += Math.abs(dx) + Math.abs(dy);
        this.yaw -= dx * 0.0032;
        this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.0032, -1.15, 1.15);
      }
    };
    this.pointerUpHandler = (event) => {
      if (this.joystick.active && event.pointerId === this.joystick.id) {
        this.joystick = { active: false, id: null, baseX: 0, baseY: 0, x: 0, y: 0 };
      }
      if (this.lookPointer.active && event.pointerId === this.lookPointer.id) {
        const wasClick = this.lookPointer.moved < 6;
        this.lookPointer = { active: false, id: null, lastX: 0, lastY: 0, moved: 0 };
        if (wasClick && this.state === 'explore' && this.inputEnabled) {
          this.pickStand(event.clientX, event.clientY);
        }
      }
    };
    canvas.addEventListener('pointerdown', this.pointerDownHandler);
    canvas.addEventListener('pointermove', this.pointerMoveHandler);
    canvas.addEventListener('pointerup', this.pointerUpHandler);
    canvas.addEventListener('pointercancel', this.pointerUpHandler);

    this.visibilityHandler = () => {
      if (document.hidden) {
        this.clock.stop();
      } else {
        this.clock.start();
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  pickStand(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(pointer, this.camera);
    const anchors = this.stands.filter((stand) => stand.loaded).map((stand) => stand.modelAnchor);
    const hits = this.raycaster.intersectObjects(anchors, true);
    if (!hits.length) return;
    let node = hits[0].object;
    while (node && !node.userData.stand) node = node.parent;
    const stand = node?.userData.stand;
    if (stand) this.callbacks.onSelectStand?.(stand);
  }

  setInputEnabled(enabled) {
    this.inputEnabled = enabled;
    if (!enabled) {
      this.keys.clear();
      this.joystick.x = 0;
      this.joystick.y = 0;
    }
  }

  getStandById(id) {
    return this.stands.find((stand) => stand.id === id) || null;
  }

  // ---------- 主循环 ----------

  animate() {
    if (this.disposed) return;
    this.animationId = requestAnimationFrame(() => this.animate());
    const now = performance.now();
    const dt = Math.min(this.clock.getDelta(), 0.066);

    updateTweens(now);

    if (this.state === 'gate') {
      // 牌匾前轻微呼吸摆动
      const swayX = Math.sin(now * 0.0004) * 0.35;
      const swayY = Math.sin(now * 0.0007) * 0.15;
      this.camera.lookAt(this.plaqueTarget.x + swayX, this.plaqueTarget.y + swayY, this.plaqueTarget.z);
    } else if (this.state === 'entering') {
      if (this.shakeUntil && now < this.shakeUntil) {
        this.camera.position.x += (Math.random() - 0.5) * 0.03;
        this.camera.position.y += (Math.random() - 0.5) * 0.02;
      }
      this.camera.lookAt(this.lookTarget);
    } else {
      this.updateMovement(dt);
      this.updateFocus();
    }

    // 展台动画：模型自旋悬浮、高亮过渡
    this.stands.forEach((stand) => {
      if (stand.loaded) {
        stand.modelAnchor.rotation.y += dt * 0.5;
        stand.modelAnchor.position.y = 1.85 + Math.sin(now * 0.0011 + stand.index) * 0.06;
      }
      stand.ring.rotation.z += dt * 0.35;
      const target = stand.highlighted ? 1 : 0;
      stand.highlightT += (target - stand.highlightT) * Math.min(1, dt * 8);
      stand.ring.scale.setScalar(1 + stand.highlightT * 0.3);
      stand.ring.material.opacity = 0.4 + stand.highlightT * 0.5;
      stand.glow.material.opacity = 0.35 + stand.highlightT * 0.4;
      const labelScale = 1 + stand.highlightT * 0.12;
      stand.label.scale.set(1.7 * labelScale, 0.53 * labelScale, 1);
      // 走近且未加载的展台立即插队加载
      if (this.state === 'explore' && !stand.loaded && !stand.loading) {
        const dx = this.camera.position.x - stand.group.position.x;
        const dz = this.camera.position.z - stand.group.position.z;
        if (dx * dx + dz * dz < 81) this.attachModel(stand);
      }
    });

    this.renderer.render(this.scene, this.camera);
  }

  updateMovement(dt) {
    if (!this.inputEnabled) {
      this.velocity.multiplyScalar(Math.max(0, 1 - dt * 10));
      this.camera.position.addScaledVector(this.velocity, dt);
      return;
    }

    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(-forward.z, 0, forward.x);

    const move = new THREE.Vector3();
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) move.add(forward);
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) move.sub(forward);
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) move.add(right);
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) move.sub(right);
    if (this.joystick.active) {
      move.addScaledVector(forward, -this.joystick.y);
      move.addScaledVector(right, this.joystick.x);
    }

    const running = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const speed = running ? 5.6 : 3.2;
    const targetVelocity = move.lengthSq() > 0 ? move.normalize().multiplyScalar(speed) : move;
    this.velocity.lerp(targetVelocity, Math.min(1, dt * 10));
    this.camera.position.addScaledVector(this.velocity, dt);
    this.camera.position.y = 1.7;
    this.camera.rotation.set(this.pitch, this.yaw, 0);

    this.resolveCollisions();
  }

  resolveCollisions() {
    const position = this.camera.position;
    position.x = THREE.MathUtils.clamp(position.x, -HALL.playerMinX, HALL.playerMinX);
    const minZ = HALL.firstRowZ - 8 * HALL.rowSpacing - HALL.endMargin + 1.2;
    position.z = THREE.MathUtils.clamp(position.z, minZ, HALL.playerMaxZ);

    this.stands.forEach((stand) => {
      const dx = position.x - stand.group.position.x;
      const dz = position.z - stand.group.position.z;
      const distanceSq = dx * dx + dz * dz;
      const radius = HALL.standRadius;
      if (distanceSq > 0.0001 && distanceSq < radius * radius) {
        const distance = Math.sqrt(distanceSq);
        position.x = stand.group.position.x + (dx / distance) * radius;
        position.z = stand.group.position.z + (dz / distance) * radius;
      }
    });
  }

  updateFocus() {
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);

    let nearest = null;
    let nearestDistance = Infinity;
    this.stands.forEach((stand) => {
      const toStand = new THREE.Vector3(
        stand.group.position.x - this.camera.position.x,
        0,
        stand.group.position.z - this.camera.position.z
      );
      const distance = toStand.length();
      if (distance < 4.2 && distance < nearestDistance) {
        const facing = toStand.normalize().dot(new THREE.Vector3(forward.x, 0, forward.z).normalize());
        if (facing > 0.25) {
          nearest = stand;
          nearestDistance = distance;
        }
      }
    });

    if (nearest !== this.focusedStand) {
      this.focusedStand = nearest;
      this.stands.forEach((stand) => {
        stand.highlighted = stand === nearest;
      });
      this.callbacks.onFocusStand?.(nearest);
    }
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
    window.removeEventListener('keyup', this.keyupHandler);
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

// 与 ParticleMorphScene 同款归一化：按最大边缩放到目标尺寸并居中。
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
