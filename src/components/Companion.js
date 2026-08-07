// 小天犬灵宠 — 暗夜展厅导览员（非遗博物馆风）
// 金色瑞兽形态：云卷耳尾 + 朱砂飘带 + 祥云环绕 + 暖金光晕，全程漂浮不落地。
// 平滑跟随相机前方偏左的悬浮点，飘带与祥云各自有独立的缓动节律。零外部资源依赖。
import * as THREE from 'three';

const GOLD = 0xc99a2e;
const GOLD_DEEP = 0x8a6a2a;
const GOLD_LIGHT = 0xf8e5b8;
const CINNABAR = 0xc44d42;
const INK = 0x17130c;

const FOLLOW_SMOOTHING = 1.7;  // 跟随平滑系数（越大越跟手）
const BOB_HEIGHT = 0.09;       // 呼吸浮沉幅度
const BOB_SPEED = 1.6;

export class Companion {
  constructor(scene) {
    this.scene = scene;
    this.mesh = null;          // 外层组：位置与朝向
    this.body = null;          // 内层组：浮沉与摇摆
    this.ribbons = [];
    this.wisps = [];
    this.time = Math.random() * 10;
    this._followPos = new THREE.Vector3();
    this._velocity = new THREE.Vector3();
    this._prevPos = new THREE.Vector3();
    this._targetYaw = 0;

    this.mesh = this._buildSpiritDog();
    this.mesh.position.set(0, 1.35, 5);
    this._followPos.copy(this.mesh.position);
    this._prevPos.copy(this.mesh.position);
    this.scene.add(this.mesh);
  }

  _buildSpiritDog() {
    const group = new THREE.Group();
    group.name = 'companion-spirit-dog';
    this.body = new THREE.Group();
    group.add(this.body);

    const goldMat = new THREE.MeshStandardMaterial({
      color: GOLD,
      roughness: 0.42,
      metalness: 0.35,
      emissive: GOLD_DEEP,
      emissiveIntensity: 0.25
    });
    const cinnabarMat = new THREE.MeshStandardMaterial({
      color: CINNABAR,
      roughness: 0.55,
      metalness: 0.1,
      emissive: CINNABAR,
      emissiveIntensity: 0.12
    });

    // 身体：饱满的瑞兽身形（坐姿漂浮，无腿）
    const bodyGeo = new THREE.SphereGeometry(0.26, 24, 18);
    bodyGeo.scale(1.05, 0.95, 1.18);
    const torso = new THREE.Mesh(bodyGeo, goldMat);
    this.body.add(torso);

    // 胸口云纹护心镜（朱砂圆牌 + 金圈）
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), cinnabarMat);
    chest.position.set(0, -0.06, 0.26);
    chest.scale.set(1, 1, 0.45);
    this.body.add(chest);
    const chestRim = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.014, 8, 28), goldMat);
    chestRim.position.copy(chest.position);
    this.body.add(chestRim);

    // 头
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 24, 18), goldMat);
    head.position.set(0, 0.28, 0.14);
    this.body.add(head);

    // 吻部
    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 12), goldMat);
    snout.position.set(0, 0.235, 0.3);
    snout.scale.set(1.05, 0.8, 1.0);
    this.body.add(snout);
    const nose = new THREE.Mesh(
      new THREE.SphereGeometry(0.028, 10, 8),
      new THREE.MeshBasicMaterial({ color: INK })
    );
    nose.position.set(0, 0.25, 0.385);
    this.body.add(nose);

    // 云卷耳（瑞兽耳 = 小圆锥 + 内卷云纹球）
    [-1, 1].forEach((sign) => {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.16, 8), goldMat);
      ear.position.set(sign * 0.115, 0.44, 0.1);
      ear.rotation.z = -sign * 0.35;
      this.body.add(ear);
      const curl = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), cinnabarMat);
      curl.position.set(sign * 0.16, 0.37, 0.12);
      this.body.add(curl);
    });

    // 眉心朱砂印记
    const mark = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), cinnabarMat);
    mark.position.set(0, 0.375, 0.27);
    this.body.add(mark);

    // 眼睛：暖琥珀色发光球（深色展厅里一眼能找到灵宠）
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffe9b0 });
    [-1, 1].forEach((sign) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 10), eyeMat);
      eye.position.set(sign * 0.075, 0.3, 0.295);
      this.body.add(eye);
    });

    // 云卷尾：上翘的环形卷尾
    const tail = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.035, 10, 24, Math.PI * 1.5), goldMat);
    tail.position.set(0, 0.12, -0.3);
    tail.rotation.set(0.4, 0, -0.6);
    this.body.add(tail);
    const tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), cinnabarMat);
    tailTip.position.set(0.07, 0.22, -0.31);
    this.body.add(tailTip);

    // 朱砂飘带：两条分段平面，逐帧做正弦波动（飞天飘带感）
    for (let i = 0; i < 2; i += 1) {
      const ribbonGeo = new THREE.PlaneGeometry(0.085, 0.72, 1, 12);
      const ribbon = new THREE.Mesh(ribbonGeo, new THREE.MeshStandardMaterial({
        color: CINNABAR,
        roughness: 0.5,
        metalness: 0.08,
        emissive: CINNABAR,
        emissiveIntensity: 0.18,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.94
      }));
      // 几何平躺向后：沿 -z 延伸
      ribbon.geometry.rotateX(-Math.PI / 2);
      ribbon.position.set(i === 0 ? -0.07 : 0.07, 0.06, -0.28 - 0.36);
      ribbon.userData.phase = i * 1.9;
      this.body.add(ribbon);
      this.ribbons.push(ribbon);
    }

    // 祥云环绕：三朵手绘云纹 sprite 缓慢公转
    const cloudTexture = this._makeAuspiciousCloudTexture();
    for (let i = 0; i < 3; i += 1) {
      const wisp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: cloudTexture,
        transparent: true,
        opacity: 0.85,
        depthWrite: false
      }));
      wisp.scale.set(0.3, 0.19, 1);
      wisp.userData.angle = (i / 3) * Math.PI * 2;
      wisp.userData.radius = 0.42 + i * 0.05;
      wisp.userData.speed = 0.45 + i * 0.12;
      this.body.add(wisp);
      this.wisps.push(wisp);
    }

    // 周身暖金光晕（加色混合，暗场中像笼着一层瑞光）
    const aura = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this._makeGlowTexture(),
      color: GOLD_LIGHT,
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    }));
    aura.scale.set(1.5, 1.5, 1);
    this.body.add(aura);

    // 灵宠随身小灯：照亮它身边的一小片地面/展台
    const glow = new THREE.PointLight(GOLD_LIGHT, 0.7, 3.2, 1.6);
    glow.position.set(0, 0.1, 0.1);
    this.body.add(glow);

    return group;
  }

  // 祥云纹理：双卷祥云（金线云头 + 云尾）
  _makeAuspiciousCloudTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 160;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#e6cd8f';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    // 云头螺旋
    ctx.beginPath();
    ctx.arc(96, 84, 34, Math.PI * 0.7, Math.PI * 2.55);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(96, 84, 16, Math.PI * 0.6, Math.PI * 2.5);
    ctx.stroke();
    // 云尾飘线
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(122, 100);
    ctx.quadraticCurveTo(170, 108, 208, 88);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(118, 116);
    ctx.quadraticCurveTo(160, 128, 196, 116);
    ctx.stroke();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  // 径向光晕纹理
  _makeGlowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    gradient.addColorStop(0, 'rgba(255, 240, 200, 0.9)');
    gradient.addColorStop(0.4, 'rgba(230, 205, 143, 0.35)');
    gradient.addColorStop(1, 'rgba(230, 205, 143, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  // 跟随目标点漂浮（target 为相机前方的悬浮点），呼吸浮沉 + 飘带/祥云节律
  update(delta, targetPos) {
    if (!this.mesh) return;
    this.time += delta;
    const t = this.time;

    // 平滑逼近悬浮目标
    this._followPos.set(targetPos.x, targetPos.y, targetPos.z);
    const k = Math.min(1, FOLLOW_SMOOTHING * delta);
    this.mesh.position.lerp(this._followPos, k);

    // 依据水平速度转向（瑞兽始终面朝行进方向）
    this._velocity.subVectors(this.mesh.position, this._prevPos);
    this._prevPos.copy(this.mesh.position);
    if (this._velocity.lengthSq() > 0.00004) {
      this._targetYaw = Math.atan2(this._velocity.x, this._velocity.z);
    }
    let yawDelta = this._targetYaw - this.mesh.rotation.y;
    yawDelta = Math.atan2(Math.sin(yawDelta), Math.cos(yawDelta));
    this.mesh.rotation.y += yawDelta * Math.min(1, delta * 5);

    // 呼吸浮沉 + 轻微侧摆
    this.body.position.y = Math.sin(t * BOB_SPEED) * BOB_HEIGHT;
    this.body.rotation.z = Math.sin(t * 0.9) * 0.05;
    this.body.rotation.x = Math.sin(t * 0.7 + 1.2) * 0.04;

    // 飘带：越靠尾端摆幅越大，双带相位错开
    this.ribbons.forEach((ribbon) => {
      const pos = ribbon.geometry.attributes.position;
      const phase = ribbon.userData.phase;
      for (let i = 0; i < pos.count; i += 1) {
        const depth = pos.getZ(i) + 0.36; // 0（根部）→ 0.72（尾端）
        const sway = Math.sin(t * 3.1 + phase + depth * 4.6) * 0.16 * depth;
        const lift = Math.sin(t * 2.3 + phase * 1.4 + depth * 3.2) * 0.1 * depth;
        pos.setX(i, (i % 2 === 0 ? -0.0425 : 0.0425) + sway);
        pos.setY(i, lift);
      }
      pos.needsUpdate = true;
    });

    // 祥云缓慢公转 + 各自微微起伏
    this.wisps.forEach((wisp) => {
      const angle = wisp.userData.angle + t * wisp.userData.speed;
      const radius = wisp.userData.radius;
      wisp.position.set(
        Math.cos(angle) * radius,
        0.08 + Math.sin(t * 1.3 + wisp.userData.angle) * 0.07,
        Math.sin(angle) * radius
      );
    });
  }

  // 获取灵宠 mesh 供 raycaster 检测点击
  getMesh() {
    return this.mesh;
  }

  dispose() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.traverse((child) => {
        if (child.material) {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
        if (child.geometry) child.geometry.dispose();
      });
      this.mesh = null;
    }
    this.ribbons = [];
    this.wisps = [];
  }
}
