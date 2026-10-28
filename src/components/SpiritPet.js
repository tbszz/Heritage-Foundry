// 灵宠「小布」：馆藏 082 山东布老虎，在 Blender 里重绑了完整四足骨骼，带 idle / walk / run 三段原地循环
// （scripts/rig-spirit-pet-quadruped.py）。按速度混合三段动作：慢走迈四条腿，追人时换成小跑，
// 腿再快也跟不上的那部分速度用整只腾跃补上（起跳抬头、落地低头、触地压扁）。
// 头和尾巴在动作之上叠加张望、点头、摇尾；位移、转身、化光瞬移、开心蹦跳也在这里驱动。
import * as THREE from 'three';

export const PET = {
  url: '/models/spirit-pet/shandong-tiger-quad.glb',
  // 骨骼名来自重绑脚本；GLTFLoader 会去掉名字里的点（fore.L.paw → foreLpaw），这里用的几根没有点
  bones: { head: 'head', tail: ['tail_01', 'tail_02', 'tail_03'] },
  clips: { idle: 'idle', walk: 'walk', run: 'run' },
  size: 1.05,            // 归一化后最长边（米），相机眼高 1.7
  ahead: 4.2,            // 站位：相机前方；竖直视角 55°，再近脚就掉出画面下沿
  side: 0.8,             // 站位：相机右侧
  wallMargin: 0.7,       // 与墙保持的距离
  walkSpeed: 0.7,
  runSpeed: 1.8,         // 到这个速度完全换成小跑
  maxSpeed: 7,           // 滚轮一格相机就走好几米，小布要能追得上
  catchUp: 2.2,          // 每落后 1 米多跑 2.2 m/s
  runDistance: 1.6,      // 超过这个距离开始加速追
  arriveDistance: 0.15,
  acceleration: 12,      // 起步 / 刹车的速度变化率（m/s²）
  // 动作按原速播放时脚掌不打滑的地速（m/s，按 size 归一化后实测）：布偶腿短，走一步约 0.15 米
  walkClipSpeed: 0.19,
  runClipSpeed: 0.65,
  lookLimit: 0.35,       // 头最多先转多少（弧度）去看游客，再多就等身体转过来；转多了脖子会拉扯变形
  maxWalkScale: 3.2,     // 动作最多加速到几倍，再快腿就抡成残影
  maxRunScale: 2.6,
  teleportDistance: 14,  // 只有一下甩出很远（连续猛滚、跳到长廊另一头）才化光瞬移
  hopHeight: 0.22,       // 开心时原地蹦的高度
  hopDuration: 0.5,
  facingOffset: -Math.PI / 2 // Tripo 导出朝 +x，转到 +z 作为前方
};

// 模型空间的三个摆动轴（模型朝 +x、上为 +y）
const MODEL_FORWARD = new THREE.Vector3(1, 0, 0);
const MODEL_UP = new THREE.Vector3(0, 1, 0);
const MODEL_SIDE = new THREE.Vector3(0, 0, 1);

const SPARKLE_COUNT = 36;
const SPARKLE_LIFE = 0.9;

// 纯函数：根据相机位置与朝向算出灵宠的站位，并夹在可走区域内（可单测）。
// 相机 yaw = 0 时朝 -z，右手方向为 +x。
export function getPetTarget({ x, z, yaw }, bounds) {
  const forwardX = -Math.sin(yaw);
  const forwardZ = -Math.cos(yaw);
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);
  return {
    x: THREE.MathUtils.clamp(x + forwardX * PET.ahead + rightX * PET.side, bounds.minX, bounds.maxX),
    z: THREE.MathUtils.clamp(z + forwardZ * PET.ahead + rightZ * PET.side, bounds.minZ, bounds.maxZ)
  };
}

// 纯函数：跟随的巡航速度（可单测）。近处慢慢蹦，落后越多跑得越快，让游客看得到它一路追上来
export function getCruiseSpeed(distance) {
  if (distance <= PET.runDistance) return PET.walkSpeed;
  return Math.min(PET.walkSpeed + (distance - PET.runDistance) * PET.catchUp, PET.maxSpeed);
}

// 纯函数：按当前速度混合 idle / walk / run 三段动作（可单测）。三个权重之和为 1；
// scale 为动作播放倍速，让脚掌尽量贴地不打滑；leap 为 0~1 的腾跃强度，补上腿跟不上的那部分速度
export function getGait(speed) {
  const { clamp, smoothstep } = THREE.MathUtils;
  const move = smoothstep(speed, 0.02, 0.25);
  const run = smoothstep(speed, PET.walkSpeed, PET.runSpeed);
  return {
    idle: 1 - move,
    walk: move * (1 - run),
    run: move * run,
    walkScale: clamp(speed / PET.walkClipSpeed, 0.6, PET.maxWalkScale),
    runScale: clamp(speed / PET.runClipSpeed, 1, PET.maxRunScale),
    leap: run * smoothstep(speed, PET.runClipSpeed * PET.maxRunScale, PET.maxSpeed / 2)
  };
}

// 纯函数：一跃之内的整体姿态（可单测）。progress 为这一跃的进度 0~1，amount 为 0~1 的腾跃强度，run 为 0~1 的奔跑强度。
// 全身同相位运动：progress = 0 / 1 时四脚着地，中途腾空；pitch 为正时低头（绕 x 轴，前方为 +z）
export function getHopPose(progress, amount, run = 0) {
  const air = Math.sin(progress * Math.PI);
  const contact = (1 - air) ** 3;
  return {
    lift: air * (0.09 + run * 0.08) * amount,
    // 上升段抬头、下落段低头，着地瞬间回正，避免前后脚陷进地面
    pitch: -Math.sin(progress * Math.PI * 2) * (0.12 + run * 0.06) * amount,
    stretch: air * 0.04 * amount,                                         // 腾空时略拉长
    squash: contact * 0.07 * amount                                       // 触地时压扁
  };
}

function dampAngle(current, target, rate, dt) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * (1 - Math.exp(-rate * dt));
}

function makeRadialTexture(stops) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  stops.forEach(([offset, color]) => gradient.addColorStop(offset, color));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class SpiritPet {
  constructor(scene, loader) {
    this.scene = scene;
    this.loader = loader;
    this.root = new THREE.Group();
    this.root.name = 'spirit-pet';
    this.root.visible = false;
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.scene.add(this.root);

    this.holder = null;
    this.baseScale = 1;
    this.mixer = null;
    this.actions = {};      // idle / walk / run
    this.sway = [];          // 在动作上叠加摆动的骨骼：{ bone, kind }
    this.loaded = false;
    this.disposed = false;
    this.talking = false;
    this.placed = false;
    this.presence = 0;      // 0 = 化光隐去，1 = 完全现身
    this.forceVanish = false;
    this.heading = 0;
    this.speed = 0;
    this.hopT = -1;
    this.elapsed = 0;
    this.hopProgress = 0;   // 腾跃进度 0~1，跟着 run 动作的循环走，0 为四脚着地
    this.hitProxy = null;
    this.swayQuat = new THREE.Quaternion();

    this.buildShadow();
    this.buildSparkles();
  }

  buildShadow() {
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 32),
      new THREE.MeshBasicMaterial({
        map: makeRadialTexture([[0, 'rgba(0,0,0,0.55)'], [0.6, 'rgba(0,0,0,0.22)'], [1, 'rgba(0,0,0,0)']]),
        transparent: true,
        depthWrite: false
      })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(0.7, 1, 1);
    shadow.position.y = 0.012;
    this.shadow = shadow;
    this.root.add(shadow);
  }

  // 化光瞬移时的金色光点：世界坐标粒子，不跟随灵宠缩放
  buildSparkles() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARKLE_COUNT * 3), 3));
    this.sparkleState = Array.from({ length: SPARKLE_COUNT }, () => ({
      life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0
    }));
    this.sparkles = new THREE.Points(geometry, new THREE.PointsMaterial({
      map: makeRadialTexture([[0, 'rgba(255,236,180,1)'], [0.4, 'rgba(255,196,96,0.55)'], [1, 'rgba(255,180,80,0)']]),
      size: 0.16,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false
    }));
    this.sparkles.frustumCulled = false;
    this.sparkles.visible = false;
    this.scene.add(this.sparkles);
  }

  load(url = PET.url) {
    return new Promise((resolve, reject) => {
      this.loader.load(url, resolve, undefined, reject);
    }).then((gltf) => {
      if (this.disposed) return;
      this.setupModel(gltf);
    });
  }

  setupModel(gltf) {
    const model = gltf.scene;
    model.traverse((child) => {
      if (!child.isMesh) return;
      // 原地动画的蒙皮包围盒按绑定姿态计算，关掉视锥裁剪避免动作中途消失
      child.frustumCulled = false;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        if ('envMapIntensity' in material) material.envMapIntensity = 1.1;
      });
    });

    this.collectSwayBones(model);
    this.mixer = new THREE.AnimationMixer(model);
    Object.entries(PET.clips).forEach(([key, name]) => {
      const clip = THREE.AnimationClip.findByName(gltf.animations, name);
      if (!clip) return;
      // 三段一直在播，只调权重和倍速，切换时不会跳帧
      this.actions[key] = this.mixer.clipAction(clip).play().setEffectiveWeight(key === 'idle' ? 1 : 0);
    });

    // 蒙皮网格的 Box3 要按骨骼变换后的顶点算（precise），否则会被骨架缩放骗到
    const holder = new THREE.Group();
    holder.rotation.y = PET.facingOffset;
    holder.add(model);
    this.body.add(holder);
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder, true);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    this.baseScale = maxDim > 0 ? PET.size / maxDim : 1;
    holder.scale.setScalar(this.baseScale);
    holder.updateMatrixWorld(true);
    box.setFromObject(holder, true);
    const center = box.getCenter(new THREE.Vector3());
    holder.position.set(-center.x, -box.min.y, -center.z);
    this.holder = holder;
    this.height = box.max.y - box.min.y;

    // 点击代理：不可见的包围盒，避免每帧对蒙皮网格逐顶点求交
    box.setFromObject(holder, true);
    const proxySize = box.getSize(new THREE.Vector3());
    this.hitProxy = new THREE.Mesh(
      new THREE.BoxGeometry(proxySize.x * 1.1, proxySize.y * 1.1, proxySize.z * 1.1),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    this.hitProxy.position.y = proxySize.y / 2;
    this.body.add(this.hitProxy);
    this.loaded = true;
  }

  // 头和尾巴骨骼在动作之上叠加程序摆动；找不到就跳过。
  // 摆动轴先从模型空间换算到每根骨骼的局部空间，旋转才会是「左右摇尾、转头点头」而不是乱拧
  collectSwayBones(model) {
    model.updateMatrixWorld(true);
    const modelInverse = model.getWorldQuaternion(new THREE.Quaternion()).invert();
    const localAxis = (bone, axis) => {
      const toBone = modelInverse.clone().multiply(bone.getWorldQuaternion(new THREE.Quaternion())).invert();
      return axis.clone().applyQuaternion(toBone).normalize();
    };
    const add = (name, kind, index = 0) => {
      const bone = model.getObjectByName(name);
      if (!bone?.isBone) return;
      this.sway.push({
        bone,
        kind,
        index,
        yawAxis: localAxis(bone, MODEL_UP),
        nodAxis: localAxis(bone, MODEL_SIDE),
        wagAxis: localAxis(bone, MODEL_FORWARD)
      });
    };
    add(PET.bones.head, 'head');
    PET.bones.tail.forEach((name, index) => add(name, 'tail', index));
  }

  // 回答到达或被点到时蹦一下
  cheer() {
    if (!this.loaded || this.presence < 0.9 || this.hopT >= 0) return;
    this.hopT = 0;
  }

  setTalking(talking) {
    this.talking = Boolean(talking);
  }

  intersects(raycaster) {
    if (!this.hitProxy || !this.root.visible || this.presence < 0.6) return false;
    return raycaster.intersectObject(this.hitProxy, false).length > 0;
  }

  // 头顶上方一点的世界坐标，供对话气泡定位
  getHeadPosition(target = new THREE.Vector3()) {
    return target.set(0, (this.height || PET.size * 0.7) + 0.16, 0).applyMatrix4(this.root.matrixWorld);
  }

  isVisible() {
    return this.loaded && this.root.visible && this.presence > 0.5;
  }

  // settled：相机处于走廊或展厅的稳定状态；穿门过程中灵宠化光隐去，落定后在新位置现身
  update(dt, { camera, yaw, bounds, settled }) {
    this.updateSparkles(dt);
    if (!this.loaded) return;
    this.elapsed += dt;

    const target = getPetTarget({ x: camera.position.x, z: camera.position.z, yaw }, bounds);
    const position = this.root.position;
    const dx = target.x - position.x;
    const dz = target.z - position.z;
    const distance = Math.hypot(dx, dz);
    // 一般落后靠加速跑追上；只有一下被甩得很远才化光隐去，完全隐去后清掉标记，下一帧在新站位现身
    if (this.placed && distance > PET.teleportDistance && this.presence > 0) this.forceVanish = true;

    const wantPresence = settled && !this.forceVanish ? 1 : 0;
    if (wantPresence === 0 && this.presence > 0.98) this.burst();
    if (wantPresence === 1 && this.presence < 0.02) {
      // 隐去后在新站位现身，面向游客
      position.set(target.x, 0, target.z);
      this.heading = Math.atan2(camera.position.x - target.x, camera.position.z - target.z);
      this.speed = 0;
      this.placed = true;
      this.forceVanish = false;
      this.burst();
    }
    const presenceRate = wantPresence ? 3.2 : 5;
    this.presence += (wantPresence - this.presence) * (1 - Math.exp(-presenceRate * dt));
    if (wantPresence === 0 && this.presence < 0.02) {
      this.presence = 0;
      this.forceVanish = false;
    }
    if (!this.placed) {
      this.root.visible = false;
      return;
    }
    this.root.visible = this.presence > 0.01;

    // 跟随：说话时原地不动（游客走远了就边说边跟）；速度有加减速，接近站位时提前刹车
    const holdForTalk = this.talking && distance < PET.runDistance;
    const canMove = this.presence > 0.6 && !holdForTalk && distance > PET.arriveDistance;
    const cruise = getCruiseSpeed(distance);
    const brake = Math.sqrt(2 * PET.acceleration * Math.max(distance - PET.arriveDistance, 0));
    const wantSpeed = canMove ? Math.min(cruise, brake) : 0;
    this.speed += THREE.MathUtils.clamp(wantSpeed - this.speed, -PET.acceleration * dt, PET.acceleration * dt);
    if (this.speed > 0.001 && distance > 0.0001) {
      const step = Math.min(distance, this.speed * dt);
      position.x += (dx / distance) * step;
      position.z += (dz / distance) * step;
    }
    const moving = this.speed > 0.08;
    const facing = moving
      ? Math.atan2(dx, dz)
      : Math.atan2(camera.position.x - position.x, camera.position.z - position.z);
    this.heading = dampAngle(this.heading, facing, moving ? 9 : 3.5, dt);
    this.root.rotation.y = this.heading;

    // 头先转过来看游客，身体随后跟上
    const toCamera = Math.atan2(camera.position.x - position.x, camera.position.z - position.z);
    const lookYaw = THREE.MathUtils.clamp(
      Math.atan2(Math.sin(toCamera - this.heading), Math.cos(toCamera - this.heading)),
      -PET.lookLimit,
      PET.lookLimit
    );

    const gait = getGait(this.speed);
    this.playGait(gait, dt);
    this.applySway(1 - gait.idle, lookYaw);
    this.updateBody(dt, gait);
  }

  playGait(gait, dt) {
    const { idle, walk, run } = this.actions;
    idle?.setEffectiveWeight(gait.idle);
    walk?.setEffectiveWeight(gait.walk).setEffectiveTimeScale(gait.walkScale);
    run?.setEffectiveWeight(gait.run).setEffectiveTimeScale(gait.runScale);
    this.mixer.update(dt);
    // 腾跃和小跑同一个节拍：每跑一个循环跃一次
    this.hopProgress = run ? run.time / run.getClip().duration : 0;
  }

  // 在动作姿态上叠加（mixer 每帧都会重写骨骼，所以直接乘上去）：停下时看着游客、偶尔小幅张望，说话时点头、尾巴摇得欢
  applySway(move, lookYaw = 0) {
    const t = this.elapsed;
    const still = 1 - move;
    this.sway.forEach((item) => {
      const { bone } = item;
      if (item.kind === 'head') {
        const look = (lookYaw + Math.sin(t * 0.6) * 0.12) * still;
        const nod = this.talking ? Math.sin(t * 7) * 0.14 : 0;
        bone.quaternion.multiply(this.swayQuat.setFromAxisAngle(item.yawAxis, look));
        bone.quaternion.multiply(this.swayQuat.setFromAxisAngle(item.nodAxis, nod));
      } else if (this.talking) {
        // idle 里尾巴已经在慢摇；说话时逐节延迟加一层快摇，甩起来是一条波
        const wag = Math.sin(t * 9 - item.index * 0.5) * 0.22 * still;
        bone.quaternion.multiply(this.swayQuat.setFromAxisAngle(item.wagAxis, wag));
      }
    });
  }

  updateBody(dt, gait) {
    // 蹦跳：抛物线起落，落地时轻微压扁
    let hop = 0;
    let squash = 0;
    if (this.hopT >= 0) {
      this.hopT += dt;
      const p = this.hopT / PET.hopDuration;
      if (p >= 1.25) {
        this.hopT = -1;
      } else if (p <= 1) {
        hop = Math.sin(p * Math.PI) * PET.hopHeight;
      } else {
        squash = Math.sin((p - 1) / 0.25 * Math.PI) * 0.08;
      }
    }

    // 现身时回弹放大
    const eased = this.presence < 1 ? THREE.MathUtils.smootherstep(this.presence, 0, 1) : 1;
    const pop = 1 + Math.sin(eased * Math.PI) * 0.12;
    this.body.scale.setScalar(Math.max(eased * pop, 0.0001));
    // 追得急时整只腾跃：起跳抬头、落地低头，腾空拉长、触地压扁
    const pose = getHopPose(this.hopProgress, gait.leap, 1);
    const flatten = squash + pose.squash - pose.stretch;
    this.holder.scale.set(
      this.baseScale * (1 + flatten * 0.5),
      this.baseScale * (1 - flatten),
      this.baseScale * (1 + flatten * 0.5)
    );
    this.body.rotation.x = pose.pitch;
    const lift = hop + pose.lift;
    this.body.position.y = lift;
    this.shadow.material.opacity = eased * (1 - Math.min(lift / PET.hopHeight, 1) * 0.5);
  }

  burst() {
    const origin = this.root.position;
    this.sparkleState.forEach((particle) => {
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.1 + Math.random() * 0.35;
      particle.life = SPARKLE_LIFE * (0.6 + Math.random() * 0.4);
      particle.x = origin.x + Math.cos(angle) * radius;
      particle.y = 0.1 + Math.random() * 0.6;
      particle.z = origin.z + Math.sin(angle) * radius;
      particle.vx = Math.cos(angle) * 0.4;
      particle.vy = 0.5 + Math.random() * 0.9;
      particle.vz = Math.sin(angle) * 0.4;
    });
    this.sparkles.visible = true;
  }

  updateSparkles(dt) {
    if (!this.sparkles.visible) return;
    const positions = this.sparkles.geometry.attributes.position;
    let alive = 0;
    this.sparkleState.forEach((particle, index) => {
      if (particle.life > 0) {
        particle.life -= dt;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.z += particle.vz * dt;
        alive += 1;
      }
      // 寿命耗尽的粒子沉到地下隐藏
      positions.setXYZ(index, particle.x, particle.life > 0 ? particle.y : -10, particle.z);
    });
    positions.needsUpdate = true;
    this.sparkles.material.opacity = Math.min(1, alive / SPARKLE_COUNT * 1.5);
    if (!alive) this.sparkles.visible = false;
  }

  dispose() {
    this.disposed = true;
    this.mixer?.stopAllAction();
    this.scene.remove(this.root);
    this.scene.remove(this.sparkles);
    [this.root, this.sparkles].forEach((object) => object.traverse((child) => {
      child.geometry?.dispose?.();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.filter(Boolean).forEach((material) => {
        Object.keys(material).forEach((key) => {
          if (material[key]?.isTexture) material[key].dispose();
        });
        material.dispose();
      });
    }));
  }
}
