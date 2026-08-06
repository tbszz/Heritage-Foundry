import * as THREE from 'three';

/**
 * 程序化非遗3D模型工厂
 * 每种非遗技艺对应一个生成函数，返回 THREE.Group
 * 每个模型都包含一个名为 'texture-target' 的 Mesh，用于 AI 贴图
 */

// ─── 工具函数 ───────────────────────────────────────────

function createStdMaterial(color, roughness = 0.3, metalness = 0.1) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function createTextureTarget(geometry, position = [0, 0, 0]) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.4,
    metalness: 0,
    transparent: true,
    opacity: 0,
    alphaTest: 0.02,
    depthWrite: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.name = 'texture-target';
  mesh.position.set(...position);
  mesh.renderOrder = 2;
  mesh.visible = false;
  return mesh;
}

function createRoundedRectShape(w, h, r) {
  const shape = new THREE.Shape();
  const hw = w / 2, hh = h / 2;
  shape.moveTo(-hw + r, -hh);
  shape.lineTo(hw - r, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + r);
  shape.lineTo(hw, hh - r);
  shape.quadraticCurveTo(hw, hh, hw - r, hh);
  shape.lineTo(-hw + r, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - r);
  shape.lineTo(-hw, -hh + r);
  shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  return shape;
}

function addMesh(group, geometry, material, position = [0, 0, 0], rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

// ─── 各非遗技艺模型 ────────────────────────────────────

/** 景德镇陶瓷 — 经典梅瓶造型 */
function createPorcelainVase(color) {
  const group = new THREE.Group();

  const points = [];
  const profile = [
    [0.00, -1.5], [0.25, -1.4], [0.55, -1.1], [0.82, -0.6],
    [0.95, 0.0],  [0.88, 0.5],  [0.62, 0.9],  [0.32, 1.1],
    [0.22, 1.25], [0.28, 1.4],  [0.24, 1.55], [0.18, 1.6],
    [0.0, 1.6]
  ];
  for (const [r, y] of profile) {
    points.push(new THREE.Vector2(r, y));
  }

  const vaseGeo = new THREE.LatheGeometry(points, 48);
  const vaseMat = createStdMaterial(color, 0.25, 0.05);
  const vase = new THREE.Mesh(vaseGeo, vaseMat);
  vase.castShadow = true;
  vase.receiveShadow = true;
  group.add(vase);

  // 贴图目标 — 瓶身中段
  const beltGeo = new THREE.CylinderGeometry(0.88, 0.88, 0.8, 48, 1, true, 0, Math.PI * 2);
  const belt = createTextureTarget(beltGeo, [0, 0.15, 0]);
  belt.rotation.x = 0;
  group.add(belt);

  return group;
}

/** 布老虎 — 圆润可爱的老虎头 */
function createTigerHead(color) {
  const group = new THREE.Group();

  // 主体
  const headGeo = new THREE.SphereGeometry(1, 32, 24);
  const head = new THREE.Mesh(headGeo, createStdMaterial(color, 0.5, 0));
  head.scale.set(1, 0.9, 0.75);
  head.castShadow = true;
  head.receiveShadow = true;
  group.add(head);

  // 耳朵
  for (const side of [-1, 1]) {
    const earGeo = new THREE.SphereGeometry(0.35, 16, 12);
    const ear = new THREE.Mesh(earGeo, createStdMaterial(0xd3382f, 0.5, 0));
    ear.position.set(side * 0.65, 0.7, 0);
    ear.scale.set(0.7, 0.8, 0.5);
    ear.castShadow = true;
    group.add(ear);

    const innerEarGeo = new THREE.SphereGeometry(0.22, 12, 8);
    const innerEar = new THREE.Mesh(innerEarGeo, createStdMaterial(0xf5d5c8, 0.6, 0));
    innerEar.position.set(side * 0.65, 0.68, 0.12);
    innerEar.scale.set(0.65, 0.75, 0.45);
    group.add(innerEar);
  }

  // 鼻子
  const noseGeo = new THREE.SphereGeometry(0.15, 12, 8);
  addMesh(group, noseGeo, createStdMaterial(0x2d1f0e, 0.4, 0), [0, -0.05, 0.65]);

  // 眼睛
  for (const side of [-1, 1]) {
    const eyeGeo = new THREE.SphereGeometry(0.12, 12, 8);
    addMesh(group, eyeGeo, createStdMaterial(0x111111, 0.1, 0.2), [side * 0.3, 0.25, 0.6]);
  }

  // 贴图目标 — 额头
  const targetPlane = new THREE.PlaneGeometry(0.8, 0.6);
  const target = createTextureTarget(targetPlane, [0, 0.16, 0.55]);
  target.rotation.x = -0.15;
  group.add(target);

  return group;
}

/** 剪纸 — 红色平面带镂空 */
function createPaperCut(color) {
  const group = new THREE.Group();

  const shape = createRoundedRectShape(2.0, 2.0, 0.2);
  const geo = new THREE.ShapeGeometry(shape, 32);
  const paper = new THREE.Mesh(geo, createStdMaterial(color, 0.7, 0));
  paper.castShadow = true;
  paper.receiveShadow = true;
  group.add(paper);

  // 背面
  const back = new THREE.Mesh(geo, createStdMaterial(color, 0.7, 0));
  back.rotation.y = Math.PI;
  back.position.z = -0.02;
  group.add(back);

  // 贴图目标
  const target = createTextureTarget(new THREE.PlaneGeometry(1.8, 1.8), [0, 0, 0.015]);
  group.add(target);

  return group;
}

/** 皮影 — 人物剪影在框架上 */
function createShadowPuppet(color) {
  const group = new THREE.Group();

  // 框架
  const frameShape = createRoundedRectShape(1.4, 2.2, 0.15);
  const innerHole = createRoundedRectShape(1.0, 1.8, 0.1);
  frameShape.holes.push(innerHole);

  const frameGeo = new THREE.ShapeGeometry(frameShape, 32);
  const frame = new THREE.Mesh(frameGeo, createStdMaterial(0x5c3d2e, 0.6, 0.05));
  frame.castShadow = true;
  frame.receiveShadow = true;
  group.add(frame);

  // 人物剪影
  const bodyShape = new THREE.Shape();
  // 头
  bodyShape.absellipse(0, 0.6, 0.18, 0.22, 0, Math.PI * 2, false, 0);
  // 身体
  bodyShape.moveTo(-0.2, 0.35);
  bodyShape.lineTo(0.2, 0.35);
  bodyShape.lineTo(0.25, -0.2);
  bodyShape.lineTo(-0.25, -0.2);
  bodyShape.closePath();
  const bodyGeo = new THREE.ShapeGeometry(bodyShape, 24);
  const body = new THREE.Mesh(bodyGeo, createStdMaterial(color, 0.5, 0.1));
  body.position.z = 0.05;
  group.add(body);

  // 贴图目标
  const target = createTextureTarget(new THREE.PlaneGeometry(0.9, 1.6), [0, 0.05, 0.08]);
  group.add(target);

  return group;
}

/** 苗绣 — 绣绷 */
function createEmbroideryHoop(color) {
  const group = new THREE.Group();

  // 外环
  const outerRingGeo = new THREE.TorusGeometry(1.05, 0.08, 12, 64);
  const woodMat = createStdMaterial(0x8b6914, 0.5, 0.05);
  const outerRing = new THREE.Mesh(outerRingGeo, woodMat);
  outerRing.castShadow = true;
  group.add(outerRing);

  // 内环
  const innerRingGeo = new THREE.TorusGeometry(0.92, 0.06, 12, 64);
  addMesh(group, innerRingGeo, woodMat, [0, 0, 0.03]);

  // 布料
  const clothGeo = new THREE.CircleGeometry(0.9, 48);
  const cloth = new THREE.Mesh(clothGeo, createStdMaterial(color, 0.8, 0));
  cloth.position.z = -0.01;
  cloth.receiveShadow = true;
  group.add(cloth);

  // 贴图目标
  const target = createTextureTarget(new THREE.CircleGeometry(0.82, 48), [0, 0, 0.02]);
  group.add(target);

  return group;
}

/** 扎染 — 褶皱布料 */
function createTieDye(color) {
  const group = new THREE.Group();

  const clothGeo = new THREE.PlaneGeometry(1.8, 1.8, 20, 20);
  // 扰动顶点模拟褶皱
  const pos = clothGeo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const z = 0.08 * Math.sin(x * 3) * Math.cos(y * 3)
           + 0.05 * Math.sin(x * 7 + y * 5) * Math.cos(y * 4);
    pos.setZ(i, z);
  }
  clothGeo.computeVertexNormals();

  const cloth = new THREE.Mesh(clothGeo, createStdMaterial(color, 0.75, 0));
  cloth.castShadow = true;
  cloth.receiveShadow = true;
  group.add(cloth);

  // 贴图目标
  const targetGeo = new THREE.PlaneGeometry(1.6, 1.6);
  const target = createTextureTarget(targetGeo, [0, 0, 0.1]);
  group.add(target);

  return group;
}

/** 书法 — 毛笔 */
function createCalligraphyBrush(color) {
  const group = new THREE.Group();

  // 笔杆
  const handleGeo = new THREE.CylinderGeometry(0.1, 0.12, 2.2, 24);
  const bambooMat = createStdMaterial(0x8fbc5a, 0.5, 0.05);
  const handle = new THREE.Mesh(handleGeo, bambooMat);
  handle.position.y = 0.5;
  handle.castShadow = true;
  group.add(handle);

  // 笔头根部
  const baseGeo = new THREE.CylinderGeometry(0.12, 0.08, 0.3, 24);
  addMesh(group, baseGeo, createStdMaterial(0x3d2b1f, 0.6, 0), [0, -0.65, 0]);

  // 笔尖
  const tipGeo = new THREE.ConeGeometry(0.08, 0.8, 24, 8);
  addMesh(group, tipGeo, createStdMaterial(0x2a1a0e, 0.7, 0), [0, -1.15, 0]);

  // 挂绳
  const cordGeo = new THREE.TorusGeometry(0.15, 0.02, 8, 12);
  addMesh(group, cordGeo, createStdMaterial(0xc41e3a, 0.4, 0), [0, 1.65, 0], [Math.PI / 2, 0, 0]);

  // 贴图目标 — 笔杆中段
  const targetGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.9, 24, 1, true);
  const target = createTextureTarget(targetGeo, [0, 0.5, 0]);
  group.add(target);

  return group;
}

/** 篆刻 — 印章 */
function createSeal(color) {
  const group = new THREE.Group();

  // 印体
  const bodyGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
  const bodyMat = createStdMaterial(color, 0.4, 0.05);
  addMesh(group, bodyGeo, bodyMat, [0, 0, 0]);

  // 印钮
  const knobGeo = new THREE.CylinderGeometry(0.25, 0.35, 0.4, 24);
  addMesh(group, knobGeo, bodyMat, [0, 0.65, 0]);

  // 印钮顶部
  const topGeo = new THREE.SphereGeometry(0.3, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  addMesh(group, topGeo, bodyMat, [0, 0.85, 0]);

  // 印面
  const faceGeo = new THREE.PlaneGeometry(0.7, 0.7);
  addMesh(group, faceGeo, createStdMaterial(0xd3382f, 0.3, 0.1), [0, 0, 0.46]);

  // 贴图目标 — 印体侧面
  const targetGeo = new THREE.PlaneGeometry(0.85, 0.85);
  const target = createTextureTarget(targetGeo, [0, 0, 0.47]);
  group.add(target);

  return group;
}

/** 南京云锦 — 织锦卷轴 */
function createBrocadeScroll(color) {
  const group = new THREE.Group();

  // 织物面
  const fabricGeo = new THREE.PlaneGeometry(1.2, 2.0, 1, 1);
  const fabric = new THREE.Mesh(fabricGeo, createStdMaterial(color, 0.6, 0.15));
  fabric.receiveShadow = true;
  group.add(fabric);

  // 上下轴
  const rollerMat = createStdMaterial(0x5c3d2e, 0.5, 0.1);
  for (const y of [-1.05, 1.05]) {
    const rollerGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.5, 24);
    const roller = new THREE.Mesh(rollerGeo, rollerMat);
    roller.rotation.z = Math.PI / 2;
    roller.position.y = y;
    roller.castShadow = true;
    group.add(roller);
  }

  // 贴图目标
  const target = createTextureTarget(new THREE.PlaneGeometry(1.1, 1.8), [0, 0, 0.01]);
  group.add(target);

  return group;
}

/** 泥塑 — 圆润雕塑 */
function createClaySculpture(color) {
  const group = new THREE.Group();

  // 底座
  const baseGeo = new THREE.CylinderGeometry(0.8, 0.9, 0.25, 32);
  addMesh(group, baseGeo, createStdMaterial(0x5c3d2e, 0.6, 0), [0, -1.25, 0]);

  // 主体 - 不规则球体
  const bodyGeo = new THREE.SphereGeometry(1, 32, 24);
  const pos = bodyGeo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const noise = 1 + 0.08 * Math.sin(x * 5) * Math.cos(z * 4)
                   + 0.06 * Math.cos(y * 6) * Math.sin(x * 3 + z * 3);
    pos.setXYZ(i, x * noise, y * noise * 0.85, z * noise);
  }
  bodyGeo.computeVertexNormals();
  const body = new THREE.Mesh(bodyGeo, createStdMaterial(color, 0.55, 0));
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // 贴图目标 — 正面
  const targetGeo = new THREE.SphereGeometry(0.7, 32, 16, 0, Math.PI, 0, Math.PI * 0.6);
  const target = createTextureTarget(targetGeo, [0, -0.1, 0.65]);
  group.add(target);

  return group;
}

/** 制茶技艺 — 紫砂茶壶 */
function createTeapot(color) {
  const group = new THREE.Group();

  // 壶身
  const bodyGeo = new THREE.SphereGeometry(1, 40, 32);
  const body = new THREE.Mesh(bodyGeo, createStdMaterial(color, 0.3, 0.08));
  body.scale.set(1, 0.8, 0.85);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // 壶盖
  const lidGeo = new THREE.SphereGeometry(0.35, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2.2);
  addMesh(group, lidGeo, createStdMaterial(color, 0.3, 0.08), [0, 0.68, 0]);

  // 壶钮
  const knobGeo = new THREE.SphereGeometry(0.12, 16, 12);
  addMesh(group, knobGeo, createStdMaterial(color, 0.3, 0.08), [0, 0.95, 0]);

  // 壶嘴
  const spoutCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.9, 0.2, 0),
    new THREE.Vector3(1.1, 0.5, 0.15),
    new THREE.Vector3(1.25, 0.85, 0.1),
    new THREE.Vector3(1.2, 1.05, 0)
  ]);
  const spoutGeo = new THREE.TubeGeometry(spoutCurve, 24, 0.08, 12, false);
  addMesh(group, spoutGeo, createStdMaterial(color, 0.3, 0.08));

  // 壶柄
  const handleCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.85, 0.1, 0),
    new THREE.Vector3(-1.3, 0.3, 0),
    new THREE.Vector3(-1.4, 0.7, 0),
    new THREE.Vector3(-1.2, 0.95, 0),
    new THREE.Vector3(-0.8, 0.7, 0)
  ]);
  const handleGeo = new THREE.TubeGeometry(handleCurve, 32, 0.07, 12, false);
  addMesh(group, handleGeo, createStdMaterial(color, 0.3, 0.08));

  // 壶底
  const baseGeo = new THREE.CylinderGeometry(0.35, 0.4, 0.15, 32);
  addMesh(group, baseGeo, createStdMaterial(color, 0.3, 0.08), [0, -0.65, 0]);

  // 贴图目标 — 壶身正面
  const targetGeo = new THREE.PlaneGeometry(0.7, 0.7);
  const target = createTextureTarget(targetGeo, [0, 0.1, 0.72]);
  group.add(target);

  return group;
}

/** 风筝 — 菱形风筝 */
function createKite(color) {
  const group = new THREE.Group();

  // 风筝面
  const kiteShape = new THREE.Shape();
  kiteShape.moveTo(0, 1.4);
  kiteShape.lineTo(0.8, 0);
  kiteShape.lineTo(0, -1.4);
  kiteShape.lineTo(-0.8, 0);
  kiteShape.closePath();
  const kiteGeo = new THREE.ShapeGeometry(kiteShape, 16);
  const kite = new THREE.Mesh(kiteGeo, createStdMaterial(color, 0.5, 0));
  kite.castShadow = true;
  kite.receiveShadow = true;
  group.add(kite);

  // 骨架
  const stickMat = createStdMaterial(0x8b6914, 0.5, 0.05);
  const vStickGeo = new THREE.CylinderGeometry(0.025, 0.025, 2.8, 8);
  addMesh(group, vStickGeo, stickMat, [0, 0, 0.02], [0, 0, 0]);
  const hStickGeo = new THREE.CylinderGeometry(0.025, 0.025, 1.6, 8);
  addMesh(group, hStickGeo, stickMat, [0, 0, 0.02], [0, 0, Math.PI / 2]);

  // 飘带
  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -1.4, 0), new THREE.Vector3(0.05, -1.8, 0.05),
    new THREE.Vector3(-0.02, -2.2, 0.08), new THREE.Vector3(0.03, -2.5, 0.03)
  ]);
  const tailGeo = new THREE.TubeGeometry(tailCurve, 20, 0.02, 8, false);
  addMesh(group, tailGeo, createStdMaterial(0xd3382f, 0.5, 0));

  // 贴图目标
  const target = createTextureTarget(new THREE.PlaneGeometry(1.4, 2.5), [0, 0, 0.04]);
  group.add(target);

  return group;
}

/** 花灯 — 传统灯笼 */
function createLantern(color) {
  const group = new THREE.Group();

  // 灯笼主体 — 旋转体
  const points = [];
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const y = -1.2 + t * 2.4;
    const r = 0.85 * Math.sin(t * Math.PI) + 0.15;
    points.push(new THREE.Vector2(r, y));
  }
  const bodyGeo = new THREE.LatheGeometry(points, 48);
  const body = new THREE.Mesh(bodyGeo, createStdMaterial(color, 0.5, 0.05));
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // 上下箍
  const ringMat = createStdMaterial(0xc99a2e, 0.3, 0.7);
  for (const y of [-1.22, 1.22]) {
    const ringGeo = new THREE.TorusGeometry(0.25, 0.05, 8, 32);
    addMesh(group, ringGeo, ringMat, [0, y, 0]);
  }

  // 挂绳
  const cordGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8);
  addMesh(group, cordGeo, createStdMaterial(0xd3382f, 0.4, 0), [0, 1.55, 0]);

  // 贴图目标 — 灯笼正面
  const targetGeo = new THREE.PlaneGeometry(1.0, 1.6);
  const target = createTextureTarget(targetGeo, [0.9, 0, 0]);
  target.rotation.y = Math.PI / 2;
  group.add(target);

  return group;
}

/** 木雕 — 雕花木板 */
function createWoodCarving(color) {
  const group = new THREE.Group();

  const boardGeo = new THREE.BoxGeometry(1.6, 2.0, 0.2);
  const board = new THREE.Mesh(boardGeo, createStdMaterial(color, 0.55, 0.05));
  board.castShadow = true;
  board.receiveShadow = true;
  group.add(board);

  // 边框
  const frameShape = createRoundedRectShape(1.6, 2.0, 0.15);
  const innerHole = createRoundedRectShape(1.2, 1.6, 0.1);
  frameShape.holes.push(innerHole);
  const frameGeo = new THREE.ShapeGeometry(frameShape, 32);
  addMesh(group, frameGeo, createStdMaterial(0x5c3d2e, 0.4, 0.1), [0, 0, 0.11]);

  // 贴图目标
  const target = createTextureTarget(new THREE.PlaneGeometry(1.1, 1.5), [0, 0, 0.12]);
  group.add(target);

  return group;
}

/** 石刻 — 石碑浮雕 */
function createStoneCarving(color) {
  const group = new THREE.Group();

  // 石碑主体
  const stoneShape = new THREE.Shape();
  stoneShape.moveTo(-0.8, -1.0);
  stoneShape.lineTo(0.8, -1.0);
  stoneShape.quadraticCurveTo(0.85, 0.8, 0.5, 1.2);
  stoneShape.quadraticCurveTo(0, 1.5, -0.5, 1.2);
  stoneShape.quadraticCurveTo(-0.85, 0.8, -0.8, -1.0);

  const extrudeSettings = { depth: 0.3, bevelEnabled: true, bevelSegments: 3, bevelSize: 0.04, bevelThickness: 0.04 };
  const stoneGeo = new THREE.ExtrudeGeometry(stoneShape, extrudeSettings);
  stoneGeo.translate(0, 0, -0.15);
  const stone = new THREE.Mesh(stoneGeo, createStdMaterial(color, 0.65, 0.05));
  stone.castShadow = true;
  stone.receiveShadow = true;
  group.add(stone);

  // 贴图目标
  const target = createTextureTarget(new THREE.PlaneGeometry(1.3, 1.8), [0, 0.05, 0.17]);
  group.add(target);

  return group;
}

/** 木版年画 — 雕版 */
function createNewYearPrint(color) {
  const group = new THREE.Group();

  // 木板
  const boardGeo = new THREE.BoxGeometry(1.6, 2.0, 0.25);
  const board = new THREE.Mesh(boardGeo, createStdMaterial(0x8b6914, 0.55, 0.05));
  board.castShadow = true;
  board.receiveShadow = true;
  group.add(board);

  // 印刷面
  const printGeo = new THREE.PlaneGeometry(1.3, 1.7);
  addMesh(group, printGeo, createStdMaterial(color, 0.4, 0.1), [0, 0, 0.13]);

  // 贴图目标
  const target = createTextureTarget(new THREE.PlaneGeometry(1.2, 1.6), [0, 0, 0.14]);
  group.add(target);

  return group;
}

/** 唐卡 — 装裱画轴 */
function createThangka(color) {
  const group = new THREE.Group();

  // 画心
  const innerGeo = new THREE.PlaneGeometry(1.2, 1.6);
  addMesh(group, innerGeo, createStdMaterial(color, 0.5, 0.1), [0, 0, 0.01]);

  // 边框
  const outerShape = createRoundedRectShape(1.8, 2.2, 0.08);
  const innerHole = createRoundedRectShape(1.2, 1.6, 0.04);
  outerShape.holes.push(innerHole);
  const frameGeo = new THREE.ShapeGeometry(outerShape, 32);
  const frameMat = createStdMaterial(0xc99a2e, 0.3, 0.7);
  addMesh(group, frameGeo, frameMat, [0, 0, 0.02]);

  // 上下轴
  const rollerMat = createStdMaterial(0x5c3d2e, 0.5, 0.1);
  for (const y of [-1.15, 1.15]) {
    const rollerGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.9, 16);
    const roller = new THREE.Mesh(rollerGeo, rollerMat);
    roller.rotation.z = Math.PI / 2;
    roller.position.y = y;
    roller.position.z = 0.04;
    roller.castShadow = true;
    group.add(roller);
  }

  // 飘带
  const ribbonGeo = new THREE.PlaneGeometry(0.15, 0.8);
  addMesh(group, ribbonGeo, createStdMaterial(0xd3382f, 0.5, 0), [0, 1.3, 0.02]);

  // 贴图目标
  const target = createTextureTarget(new THREE.PlaneGeometry(1.1, 1.5), [0, 0, 0.03]);
  group.add(target);

  return group;
}

/** 玉雕 — 玉璧 */
function createJadeCarving(color) {
  const group = new THREE.Group();

  // 玉璧主体
  const outerShape = new THREE.Shape();
  outerShape.absellipse(0, 0, 1.0, 1.0, 0, Math.PI * 2, false, 0);
  const innerHole = new THREE.Path();
  innerHole.absellipse(0, 0, 0.25, 0.25, 0, Math.PI * 2, true, 0);
  outerShape.holes.push(innerHole);

  const biGeo = new THREE.ExtrudeGeometry(outerShape, {
    depth: 0.15, bevelEnabled: true, bevelSegments: 3, bevelSize: 0.03, bevelThickness: 0.03
  });
  biGeo.translate(0, 0, -0.075);
  const bi = new THREE.Mesh(biGeo, createStdMaterial(color, 0.15, 0.15));
  bi.castShadow = true;
  bi.receiveShadow = true;
  group.add(bi);

  // 底座
  const standGeo = new THREE.CylinderGeometry(0.35, 0.45, 0.3, 32);
  addMesh(group, standGeo, createStdMaterial(0x5c3d2e, 0.5, 0.05), [0, -1.0, 0]);

  // 支撑柱
  const pillarGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.5, 16);
  addMesh(group, pillarGeo, createStdMaterial(0x5c3d2e, 0.5, 0.05), [0, -0.65, 0]);

  // 贴图目标
  const target = createTextureTarget(new THREE.PlaneGeometry(1.6, 1.6), [0, 0, 0.09]);
  group.add(target);

  return group;
}

// ─── 模型工厂映射 ──────────────────────────────────────

/** 中国结 — 由环环相扣的绳圈 + 中心圆盘 + 流苏组成 */
function createChineseKnot(color) {
  const group = new THREE.Group();
  const ropeMat = createStdMaterial(color, 0.55, 0.05);

  // 中心圆盘（结心）
  const centerGeo = new THREE.TorusKnotGeometry(0.55, 0.16, 80, 12, 2, 3);
  const center = new THREE.Mesh(centerGeo, ropeMat);
  center.castShadow = true;
  center.receiveShadow = true;
  group.add(center);

  // 外围四个大环
  const ringGeo = new THREE.TorusGeometry(0.85, 0.14, 12, 48);
  const angles = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
  angles.forEach((angle) => {
    const ring = new THREE.Mesh(ringGeo, ropeMat);
    ring.position.set(Math.cos(angle) * 0.2, Math.sin(angle) * 0.2, 0);
    ring.rotation.set(Math.PI / 2, 0, angle);
    ring.castShadow = true;
    ring.receiveShadow = true;
    group.add(ring);
  });

  // 流苏挂绳
  const cordGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.5, 16);
  const cord = new THREE.Mesh(cordGeo, ropeMat);
  cord.position.set(0, 1.35, 0);
  cord.castShadow = true;
  group.add(cord);

  // 流苏穗子（多根细管）
  const tasselMat = createStdMaterial(0xf5d76e, 0.6, 0.1);
  for (let i = 0; i < 8; i += 1) {
    const tGeo = new THREE.CylinderGeometry(0.025, 0.018, 1.2, 8);
    const tassel = new THREE.Mesh(tGeo, tasselMat);
    const offset = (i - 3.5) * 0.05;
    tassel.position.set(offset, 0.45, 0);
    tassel.castShadow = true;
    group.add(tassel);
  }

  // 贴图目标 — 结心位置
  const targetGeo = new THREE.SphereGeometry(0.5, 24, 16);
  const target = createTextureTarget(targetGeo, [0, 0, 0]);
  group.add(target);

  return group;
}

const CRAFT_MODEL_FACTORIES = {
  'porcelain':   { fn: createPorcelainVase,    defaultColor: '#e8d5b7' },
  'tiger-head':  { fn: createTigerHead,        defaultColor: '#e8a020' },
  'papercut':    { fn: createPaperCut,         defaultColor: '#d3382f' },
  'shadow':      { fn: createShadowPuppet,     defaultColor: '#c99a2e' },
  'embroidery':  { fn: createEmbroideryHoop,   defaultColor: '#1f7a6d' },
  'tie-dye':     { fn: createTieDye,           defaultColor: '#2f5f9f' },
  'calligraphy': { fn: createCalligraphyBrush, defaultColor: '#1f2328' },
  'seal':        { fn: createSeal,             defaultColor: '#4a5568' },
  'brocade':     { fn: createBrocadeScroll,    defaultColor: '#c99a2e' },
  'clay':        { fn: createClaySculpture,    defaultColor: '#c99a2e' },
  'tea':         { fn: createTeapot,           defaultColor: '#8b4513' },
  'kites':       { fn: createKite,             defaultColor: '#2f5f9f' },
  'lanterns':    { fn: createLantern,          defaultColor: '#d3382f' },
  'wood-carving':{ fn: createWoodCarving,      defaultColor: '#8b5a2b' },
  'stone-carving':{ fn: createStoneCarving,    defaultColor: '#696969' },
  'new-year':    { fn: createNewYearPrint,     defaultColor: '#d3382f' },
  'tangka':      { fn: createThangka,          defaultColor: '#d3382f' },
  'jade':        { fn: createJadeCarving,      defaultColor: '#1f7a6d' },
  'chinese-knot':{ fn: createChineseKnot,      defaultColor: '#d3382f' }
};

/**
 * 根据 craftId 生成程序化3D模型
 * @param {string} craftId - 非遗技艺ID
 * @param {string} [color] - 可选主色调，覆盖默认色
 * @returns {THREE.Group|null}
 */
export function createProceduralModel(craftId, color) {
  const factory = CRAFT_MODEL_FACTORIES[craftId];
  if (!factory) return null;

  const group = factory.fn(color || factory.defaultColor);
  group.name = `procedural-${craftId}`;
  return group;
}

/**
 * 检查某个 craftId 是否有程序化模型
 */
export function hasProceduralModel(craftId) {
  return craftId in CRAFT_MODEL_FACTORIES;
}

/**
 * 获取所有支持程序化生成的 craftId 列表
 */
export function getProceduralCraftIds() {
  return Object.keys(CRAFT_MODEL_FACTORIES);
}