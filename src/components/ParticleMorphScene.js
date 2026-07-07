import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Easing, Tween, update as updateTweens } from '@tweenjs/tween.js/dist/tween.esm.js';

const GOLD = new THREE.Color('#c99a2e');
const CYAN = new THREE.Color('#26c6da');
const INK = new THREE.Color('#06080d');

export function getParticleCount({
  width = 1200,
  hardwareConcurrency = 4,
  reducedMotion = false
} = {}) {
  if (reducedMotion) return 9000;
  if (hardwareConcurrency <= 4 || width < 640) return 18000;
  if (width < 1100) return 30000;
  if (hardwareConcurrency >= 10 && width >= 1500) return 60000;
  return 48000;
}

export function getModelTargetSize(width = 1200) {
  if (width < 480) return 2.7;
  if (width < 760) return 3.25;
  if (width < 1100) return 3.9;
  return 4.35;
}

export class ParticleMorphScene {
  constructor(container) {
    this.container = container;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.stageGroup = new THREE.Group();
    this.museumGroup = new THREE.Group();
    this.ringGroup = new THREE.Group();
    this.particleGeometry = null;
    this.particleMaterial = null;
    this.particles = null;
    this.backgroundParticles = null;
    this.loader = new GLTFLoader();
    this.animationId = null;
    this.currentModelUrl = null;
    this.solidModel = null;
    this.solidMaterials = [];
    this.positions = null;
    this.startPositions = null;
    this.targetPositions = null;
    this.modelPositions = null;
    this.haloPositions = null;
    this.morphStartedAt = 0;
    this.morphDuration = 1500;
    this.morphing = false;
    this.transitionTimer = null;
    this.cameraTween = null;
    this.lookTween = null;
    this.artifactLight = null;
    this.galleryMarkers = [];
    this.pointer = new THREE.Vector2();
    this.reducedMotion = false;
    this.resizeHandler = null;
    this.visibilityHandler = null;
    this.pointerHandler = null;
  }

  init() {
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
    this.scene = new THREE.Scene();
    this.scene.background = null;

    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    this.camera = new THREE.PerspectiveCamera(46, width / height, 0.1, 1000);
    this.camera.position.set(0, 1.15, 7.45);

    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.container.appendChild(this.renderer.domElement);

    this.scene.add(this.museumGroup);
    this.scene.add(this.stageGroup);
    this.addControls();
    this.addLighting();
    this.addMuseumEnvironment();
    this.createParticles();
    this.createBackgroundParticles();
    this.bindEvents();
    this.startAnimation();
  }

  addControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.enablePan = false;
    this.controls.target.set(0, 0.42, 0);
    this.controls.minDistance = 4.2;
    this.controls.maxDistance = 10;
    this.controls.autoRotate = !this.reducedMotion;
    this.controls.autoRotateSpeed = 0.55;
    this.controls.enableKeys = false;
  }

  addLighting() {
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const roomEnvironment = new RoomEnvironment();
    this.scene.environment = pmremGenerator.fromScene(roomEnvironment).texture;
    roomEnvironment.dispose();
    pmremGenerator.dispose();

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.34));

    const keyLight = new THREE.DirectionalLight(0xf7dfaa, 1.35);
    keyLight.position.set(4, 5, 5);
    this.scene.add(keyLight);

    const cyanLight = new THREE.PointLight(0x26c6da, 2.8, 10);
    cyanLight.position.set(-3.5, 1.6, 2.6);
    this.scene.add(cyanLight);

    this.artifactLight = new THREE.SpotLight(0xffd28a, 4.2, 13, Math.PI / 5, 0.45, 1.1);
    this.artifactLight.position.set(0, 5.8, 3.2);
    this.artifactLight.target.position.set(0, 0.4, 0);
    this.scene.add(this.artifactLight);
    this.scene.add(this.artifactLight.target);
  }

  addMuseumEnvironment() {
    const floorMaterial = new THREE.MeshBasicMaterial({
      color: 0x061016,
      transparent: true,
      opacity: 0.48,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(4.4, 128), floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2.18;
    this.museumGroup.add(floor);

    const railMaterial = new THREE.MeshBasicMaterial({
      color: 0xc99a2e,
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const cyanRailMaterial = new THREE.MeshBasicMaterial({
      color: 0x26c6da,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    [1.35, 1.82, 2.34, 2.92].forEach((radius, index) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(radius, index % 2 === 0 ? 0.006 : 0.004, 8, 180),
        index % 2 === 0 ? railMaterial.clone() : cyanRailMaterial.clone()
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -2.05 + index * 0.012;
      ring.userData.spin = index % 2 === 0 ? 0.00012 : -0.00016;
      this.ringGroup.add(ring);
    });

    const markerGeometry = new THREE.BoxGeometry(0.028, 0.72, 0.028);
    for (let index = 0; index < 18; index += 1) {
      const angle = (index / 18) * Math.PI * 2;
      const marker = new THREE.Mesh(
        markerGeometry,
        new THREE.MeshBasicMaterial({
          color: index % 2 === 0 ? 0xc99a2e : 0x26c6da,
          transparent: true,
          opacity: 0.2,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
      marker.position.set(Math.cos(angle) * 3.45, -1.72, Math.sin(angle) * 1.18);
      marker.userData.index = index;
      this.galleryMarkers.push(marker);
      this.museumGroup.add(marker);
    }

    const backWall = new THREE.Mesh(
      new THREE.PlaneGeometry(9.6, 3.6),
      new THREE.MeshBasicMaterial({
        color: 0x020509,
        transparent: true,
        opacity: 0.38,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    backWall.position.set(0, 0.05, -2.9);
    this.museumGroup.add(backWall);
    this.stageGroup.add(this.ringGroup);
  }

  createParticles() {
    const count = getParticleCount({
      width: this.container.clientWidth,
      hardwareConcurrency: navigator.hardwareConcurrency || 4,
      reducedMotion: this.reducedMotion
    });

    this.positions = createRandomCloud(count, 4.8);
    this.startPositions = new Float32Array(this.positions);
    this.targetPositions = new Float32Array(this.positions);
    const colors = createParticleColors(count, new THREE.Color('#d3382f'));

    this.particleGeometry = new THREE.BufferGeometry();
    this.particleGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage)
    );
    this.particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    this.particleMaterial = new THREE.PointsMaterial({
      size: 0.021,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.particles = new THREE.Points(this.particleGeometry, this.particleMaterial);
    this.stageGroup.add(this.particles);
  }

  createBackgroundParticles() {
    const count = 900;
    const positions = createRandomCloud(count, 8.5);
    const colors = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const color = index % 3 === 0 ? GOLD : CYAN;
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.012,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.backgroundParticles = new THREE.Points(geometry, material);
    this.scene.add(this.backgroundParticles);
  }

  bindEvents() {
    this.resizeHandler = () => this.onResize();
    this.pointerHandler = (event) => {
      const rect = this.container.getBoundingClientRect();
      this.pointer.x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      this.pointer.y = -((event.clientY - rect.top) / rect.height - 0.5) * 2;
    };
    this.visibilityHandler = () => {
      if (document.hidden) {
        this.stopAnimation();
      } else {
        this.startAnimation();
      }
    };

    window.addEventListener('resize', this.resizeHandler);
    this.container.addEventListener('pointermove', this.pointerHandler);
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  setCraft(craft) {
    if (!craft?.modelUrl || !this.loader) return Promise.resolve();

    const url = craft.modelUrl;
    this.currentModelUrl = url;
    this.focusMuseumStop(craft);
    this.updateParticleColors(craft.color || '#d3382f');
    this.setLoading(true);
    this.fadeCurrentModel();

    return new Promise((resolve) => {
      this.loader.load(
        url,
        (gltf) => {
          if (this.currentModelUrl !== url) {
            resolve();
            return;
          }
          this.setLoading(false);
          const model = gltf.scene;
        normalizeObject(model, getModelTargetSize(this.container.clientWidth));
          prepareSolidModel(model, craft.color || '#d3382f');
          const sampledPositions = sampleSurfacePositions(model, this.positions.length / 3);
          this.replaceSolidModel(model);
          this.startMorph(sampledPositions, createHaloPositions(sampledPositions, 1.9), resolve);
        },
        undefined,
        () => {
          if (this.currentModelUrl !== url) {
            resolve();
            return;
          }
          this.setLoading(false);
          const cloud = createRandomCloud(this.positions.length / 3, 3.4);
          this.startMorph(cloud, createRandomCloud(this.positions.length / 3, 4.6), resolve);
        }
      );
    });
  }

  updateParticleColors(colorValue) {
    if (!this.particleGeometry) return;
    const colors = this.particleGeometry.getAttribute('color');
    const craftColor = new THREE.Color(colorValue);
    for (let index = 0; index < colors.count; index += 1) {
      const color = craftColor.clone();
      const band = index % 7;
      if (band === 0 || band === 3) color.lerp(GOLD, 0.68);
      if (band === 1) color.lerp(CYAN, 0.72);
      colors.setXYZ(index, color.r, color.g, color.b);
    }
    colors.needsUpdate = true;
  }

  focusMuseumStop(craft) {
    if (!this.camera || !this.controls) return;
    const cameraTarget = craft?.camera || { x: 0, y: 1.74, z: 7.55 };
    const spotlightTarget = craft?.spotlight || { x: 0, y: 2.4, z: 0 };
    const lookTarget = {
      x: spotlightTarget.x * 0.16,
      y: 0.42,
      z: spotlightTarget.z * 0.12
    };
    const duration = this.reducedMotion ? 120 : 1280;

    this.cameraTween?.stop();
    this.lookTween?.stop();
    this.cameraTween = new Tween(this.camera.position)
      .to(cameraTarget, duration)
      .easing(Easing.Cubic.InOut)
      .start();

    const currentLook = {
      x: this.controls.target.x,
      y: this.controls.target.y,
      z: this.controls.target.z
    };
    this.lookTween = new Tween(currentLook)
      .to(lookTarget, duration)
      .easing(Easing.Cubic.InOut)
      .onUpdate((value) => {
        this.controls.target.set(value.x, value.y, value.z);
        this.camera.lookAt(this.controls.target);
      })
      .start();

    if (this.artifactLight) {
      this.artifactLight.position.set(spotlightTarget.x * 0.6, 5.8, 3.1 + spotlightTarget.z * 0.18);
      this.artifactLight.target.position.set(lookTarget.x, 0.35, lookTarget.z);
    }

    this.galleryMarkers.forEach((marker) => {
      const isActive = marker.userData.index === craft.index;
      marker.material.opacity = isActive ? 0.72 : 0.16;
      marker.scale.setScalar(isActive ? 1.55 : 1);
    });
  }

  replaceSolidModel(model) {
    if (this.solidModel) {
      this.stageGroup.remove(this.solidModel);
      disposeObject(this.solidModel);
    }
    this.solidModel = model;
    this.solidMaterials = collectMaterials(model);
    this.solidMaterials.forEach((material) => {
      material.opacity = 0;
      material.userData.homeFinalOpacity = material.userData.homeFinalOpacity ?? 1;
    });
    this.stageGroup.add(model);
  }

  fadeCurrentModel() {
    if (!this.solidMaterials.length) return;
    this.solidMaterials.forEach((material) => {
      material.transparent = true;
      material.depthWrite = false;
      material.opacity = Math.min(material.opacity ?? 1, 0.18);
      if (material.emissive) {
        material.emissiveIntensity = Math.max(material.emissiveIntensity || 0, 0.16);
      }
      material.needsUpdate = true;
    });
    if (this.particleMaterial) {
      this.particleMaterial.opacity = 0.5;
    }
  }

  startMorph(modelPositions, haloPositions, onComplete) {
    if (this.transitionTimer) {
      window.clearTimeout(this.transitionTimer);
      this.transitionTimer = null;
    }
    this.startPositions.set(this.positions);
    this.modelPositions = modelPositions;
    this.haloPositions = haloPositions;
    this.targetPositions = modelPositions;
    this.morphStartedAt = performance.now();
    this.morphDuration = this.reducedMotion ? 180 : 2200;
    this.morphing = true;
    this.transitionTimer = window.setTimeout(() => {
      this.transitionTimer = null;
      onComplete?.();
    }, Math.min(this.morphDuration, 1200));
  }

  setLoading(isLoading) {
    this.container.classList.toggle('is-loading', isLoading);
  }

  startAnimation() {
    if (!this.animationId) {
      this.animate();
    }
  }

  stopAnimation() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  animate() {
    this.animationId = requestAnimationFrame(() => this.animate());
    const now = performance.now();

    updateTweens(now);

    if (this.controls) {
      this.controls.update();
    }

    if (this.morphing) {
      const rawProgress = Math.min((now - this.morphStartedAt) / this.morphDuration, 1);
      const progress = smoothstep(rawProgress);
      const formProgress = smoothstep(Math.min(rawProgress / 0.68, 1));
      const releaseProgress = smoothstep(Math.max(0, (rawProgress - 0.58) / 0.42));
      for (let index = 0; index < this.positions.length; index += 3) {
        const particleIndex = index / 3;
        const swirl = Math.sin(rawProgress * Math.PI * 2.4 + particleIndex * 0.017) * (1 - progress) * 0.24;
        const modelX = lerp(this.startPositions[index], this.modelPositions[index], formProgress) + swirl;
        const modelY = lerp(this.startPositions[index + 1], this.modelPositions[index + 1], formProgress);
        const modelZ = lerp(this.startPositions[index + 2], this.modelPositions[index + 2], formProgress) - swirl * 0.55;
        this.positions[index] = lerp(modelX, this.haloPositions[index], releaseProgress);
        this.positions[index + 1] = lerp(modelY, this.haloPositions[index + 1], releaseProgress);
        this.positions[index + 2] = lerp(modelZ, this.haloPositions[index + 2], releaseProgress);
      }
      this.particleGeometry.attributes.position.needsUpdate = true;

      this.particleMaterial.opacity = lerp(0.66, 0.12, releaseProgress);
      setSolidOpacity(this.solidMaterials, smoothstep(Math.max(0, (rawProgress - 0.18) / 0.58)));

      if (rawProgress >= 1) {
        this.morphing = false;
        this.particleMaterial.opacity = 0.12;
        setSolidOpacity(this.solidMaterials, 1);
      }
    }

    if (this.ringGroup && !this.reducedMotion) {
      this.ringGroup.children.forEach((ring, index) => {
        ring.rotation.z += ring.userData.spin || 0.0001;
        ring.material.opacity = (index % 2 === 0 ? 0.32 : 0.22) + Math.sin(now * 0.0012 + index) * 0.06;
      });
    }

    if (this.backgroundParticles && !this.reducedMotion) {
      this.backgroundParticles.rotation.y = now * 0.00004;
      this.backgroundParticles.rotation.x = Math.sin(now * 0.0002) * 0.05;
    }

    this.stageGroup.rotation.y += (this.pointer.x * 0.12 - this.stageGroup.rotation.y) * 0.025;
    this.stageGroup.rotation.x += (this.pointer.y * 0.06 - this.stageGroup.rotation.x) * 0.025;

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  onResize() {
    if (!this.container || !this.camera || !this.renderer) return;
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  dispose() {
    this.stopAnimation();
    if (this.resizeHandler) window.removeEventListener('resize', this.resizeHandler);
    if (this.pointerHandler) this.container.removeEventListener('pointermove', this.pointerHandler);
    if (this.visibilityHandler) document.removeEventListener('visibilitychange', this.visibilityHandler);
    if (this.transitionTimer) window.clearTimeout(this.transitionTimer);
    this.cameraTween?.stop();
    this.lookTween?.stop();
    if (this.solidModel) disposeObject(this.solidModel);
    if (this.museumGroup) disposeObject(this.museumGroup);
    if (this.particleGeometry) this.particleGeometry.dispose();
    if (this.particleMaterial) this.particleMaterial.dispose();
    if (this.backgroundParticles) {
      this.backgroundParticles.geometry.dispose();
      this.backgroundParticles.material.dispose();
    }
    if (this.controls) this.controls.dispose();
    if (this.renderer) this.renderer.dispose();
    if (this.renderer?.domElement?.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}

function createRandomCloud(count, radius) {
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const distance = radius * (0.25 + Math.random() * 0.75);
    positions[index * 3] = Math.sin(phi) * Math.cos(theta) * distance;
    positions[index * 3 + 1] = Math.cos(phi) * distance * 0.78;
    positions[index * 3 + 2] = Math.sin(phi) * Math.sin(theta) * distance;
  }
  return positions;
}

function createParticleColors(count, color) {
  const colors = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const mixed = color.clone();
    if (index % 5 === 0) mixed.lerp(GOLD, 0.72);
    if (index % 7 === 0) mixed.lerp(CYAN, 0.68);
    colors[index * 3] = mixed.r;
    colors[index * 3 + 1] = mixed.g;
    colors[index * 3 + 2] = mixed.b;
  }
  return colors;
}

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

function prepareSolidModel(object, accentColor) {
  const accent = new THREE.Color(accentColor);
  object.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const originalWasArray = Array.isArray(child.material);
    const materials = originalWasArray ? child.material : [child.material];
    const preparedMaterials = materials.map((material) => {
      const clone = material.clone();
      clone.userData.homeFinalOpacity = typeof material.opacity === 'number' ? material.opacity : 1;
      clone.transparent = true;
      clone.opacity = 0;
      clone.depthWrite = true;
      if (clone.emissive) {
        clone.emissive.copy(accent).lerp(CYAN, 0.35);
        clone.emissiveIntensity = 0.12;
      }
      if (typeof clone.envMapIntensity !== 'undefined') {
        clone.envMapIntensity = 1.18;
      }
      clone.needsUpdate = true;
      return clone;
    });
    child.material = originalWasArray ? preparedMaterials : preparedMaterials[0];
  });
}

function setSolidOpacity(materials, progress) {
  materials.forEach((material) => {
    material.opacity = (material.userData.homeFinalOpacity ?? 1) * progress;
    material.transparent = material.opacity < 0.999;
    material.depthWrite = material.opacity > 0.72;
    material.needsUpdate = true;
  });
}

function sampleSurfacePositions(object, count) {
  object.updateMatrixWorld(true);
  const entries = [];
  object.traverse((child) => {
    if (!child.isMesh || !child.geometry?.attributes?.position) return;
    const sampler = new MeshSurfaceSampler(child).build();
    const area = sampler.distribution?.[sampler.distribution.length - 1] || 1;
    entries.push({ sampler, matrixWorld: child.matrixWorld.clone(), area });
  });

  if (!entries.length) {
    return createRandomCloud(count, 3.2);
  }

  const totalArea = entries.reduce((sum, entry) => sum + entry.area, 0);
  const positions = new Float32Array(count * 3);
  const sampled = new THREE.Vector3();

  for (let index = 0; index < count; index += 1) {
    let cursor = Math.random() * totalArea;
    let entry = entries[entries.length - 1];
    for (const candidate of entries) {
      cursor -= candidate.area;
      if (cursor <= 0) {
        entry = candidate;
        break;
      }
    }

    entry.sampler.sample(sampled);
    sampled.applyMatrix4(entry.matrixWorld);
    positions[index * 3] = sampled.x;
    positions[index * 3 + 1] = sampled.y;
    positions[index * 3 + 2] = sampled.z;
  }

  return positions;
}

function collectMaterials(object) {
  const materials = [];
  object.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    if (Array.isArray(child.material)) {
      materials.push(...child.material);
    } else {
      materials.push(child.material);
    }
  });
  return materials;
}

function createHaloPositions(modelPositions, radiusMultiplier) {
  const positions = new Float32Array(modelPositions.length);
  const direction = new THREE.Vector3();
  const point = new THREE.Vector3();

  for (let index = 0; index < modelPositions.length; index += 3) {
    point.set(modelPositions[index], modelPositions[index + 1], modelPositions[index + 2]);
    direction.copy(point);
    if (direction.lengthSq() < 0.0001) {
      direction.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
    }
    direction.normalize();
    const lift = 0.18 + Math.random() * 0.34;
    const orbit = 0.1 + Math.random() * 0.45;
    positions[index] = point.x * radiusMultiplier + direction.x * orbit;
    positions[index + 1] = point.y * radiusMultiplier + direction.y * orbit + lift;
    positions[index + 2] = point.z * radiusMultiplier + direction.z * orbit;
  }

  return positions;
}

function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        Object.keys(material).forEach((key) => {
          if (material[key]?.isTexture) material[key].dispose();
        });
        material.dispose();
      });
    }
  });
}

function smoothstep(value) {
  return value * value * (3 - 2 * value);
}

function lerp(from, to, progress) {
  return from + (to - from) * progress;
}
