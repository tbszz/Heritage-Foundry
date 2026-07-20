import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createGLTFLoader } from '../utils/modelLoader.js';
import { Easing, Tween, update as updateTweens } from '@tweenjs/tween.js/dist/tween.esm.js';

const GOLD = new THREE.Color('#c99a2e');
const PARCHMENT = new THREE.Color('#d8c39a');

const PARTICLE_PROFILES = {
  paper: { flow: 0.92, spread: 0.72, size: 1.12 },
  textile: { flow: 1.28, spread: 0.46, size: 0.82 },
  mineral: { flow: 0.72, spread: 0.38, size: 0.72 },
  earth: { flow: 0.64, spread: 0.58, size: 0.94 },
  ink: { flow: 1.42, spread: 0.82, size: 0.78 },
  pigment: { flow: 1.08, spread: 0.62, size: 0.88 }
};

const CRAFT_PARTICLE_FAMILIES = {
  papercut: 'paper', shadow: 'paper', kites: 'paper', lanterns: 'paper', 'new-year': 'paper',
  embroidery: 'textile', 'tiger-head': 'textile', 'tie-dye': 'textile', brocade: 'textile',
  porcelain: 'mineral', jade: 'mineral', 'stone-carving': 'mineral',
  'wood-carving': 'earth', clay: 'earth', tea: 'earth',
  calligraphy: 'ink', seal: 'ink',
  tangka: 'pigment'
};

export function getCraftParticleProfile(craftId) {
  const family = CRAFT_PARTICLE_FAMILIES[craftId] || 'ink';
  return { family, ...PARTICLE_PROFILES[family] };
}

export function getTransitionProfiles(outgoingCraftId, incomingCraftId) {
  return {
    release: getCraftParticleProfile(outgoingCraftId),
    arrival: getCraftParticleProfile(incomingCraftId)
  };
}

export function getSettledParticleOpacity() {
  return 0;
}

export function getHomeModelRotation(craftId) {
  if (craftId === 'embroidery') return -Math.PI / 2;
  if (craftId === 'tangka') return Math.PI / 2;
  return 0;
}

export function getHomeLightingProfile() {
  return { ambient: 0.24, key: 0.92, rim: 0.18, spot: 1.65, exposure: 1.05 };
}

export function getParticleRenderProfile() {
  return { screenScale: 12, releaseOpacity: 0.46, arrivalOpacity: 0.08 };
}

export function getMorphFrameState(
  rawProgress,
  transitionTo = 1,
  renderProfile = getParticleRenderProfile()
) {
  const arrivalProgress = smoothstep((rawProgress - 0.48) / 0.34);
  const revealProgress = smoothstep((rawProgress - 0.68) / 0.32);
  const releaseProgress = smoothstep(rawProgress / 0.32);
  return {
    particleOpacity: lerp(
      renderProfile.releaseOpacity,
      renderProfile.arrivalOpacity,
      arrivalProgress
    ),
    solidOpacity: transitionTo <= 0.5 ? 1 - releaseProgress : revealProgress
  };
}

export function getTransitionPhase(progress) {
  if (progress < 0.24) return 'release';
  if (progress < 0.56) return 'bridge';
  if (progress < 0.82) return 'arrival';
  return 'reveal';
}

export function getTransitionProgress(elapsed, duration, from = 0, to = 1) {
  const local = Math.min(Math.max(elapsed / Math.max(duration, 1), 0), 1);
  return from + (to - from) * local;
}

export function getInkTransitionPoint(start, target, halo, progress, profile) {
  const output = [0, 0, 0];
  writeInkTransitionPoint(output, 0, start, target, halo, 0, progress, profile);
  return output;
}

export function getMorphDuration(reducedMotion = false) {
  return reducedMotion ? 160 : 1080;
}

export function createModelAssetCache(loadAsset, {
  maxEntries = Number.POSITIVE_INFINITY,
  onEvict = null
} = {}) {
  const assets = new Map();
  const limit = normalizeCacheLimit(maxEntries);

  const touch = (url, asset) => {
    assets.delete(url);
    assets.set(url, asset);
  };

  const trim = () => {
    while (assets.size > limit) {
      const oldestUrl = assets.keys().next().value;
      const evicted = assets.get(oldestUrl);
      assets.delete(oldestUrl);
      onEvict?.(oldestUrl, evicted);
    }
  };

  return {
    load(url) {
      if (!assets.has(url)) {
        const loading = Promise.resolve().then(() => loadAsset(url));
        assets.set(url, loading);
        loading.catch(() => {
          if (assets.get(url) === loading) {
            assets.delete(url);
          }
        });
        trim();
      } else {
        touch(url, assets.get(url));
      }
      return assets.get(url);
    },
    has(url) {
      return assets.has(url);
    },
    values() {
      return assets.values();
    }
  };
}

export function createPreparedModelCache(prepareModel, {
  maxEntries = Number.POSITIVE_INFINITY,
  onEvict = null
} = {}) {
  const prepared = new Map();
  const limit = normalizeCacheLimit(maxEntries);

  const trim = () => {
    while (prepared.size > limit) {
      const oldestUrl = prepared.keys().next().value;
      const evicted = prepared.get(oldestUrl);
      prepared.delete(oldestUrl);
      onEvict?.(oldestUrl, evicted);
    }
  };

  return {
    get(url, scene, ...context) {
      if (!prepared.has(url)) {
        prepared.set(url, prepareModel(scene, ...context));
        trim();
      } else {
        const cached = prepared.get(url);
        prepared.delete(url);
        prepared.set(url, cached);
      }
      return prepared.get(url);
    },
    has(url) {
      return prepared.has(url);
    },
    values() {
      return prepared.values();
    }
  };
}

function normalizeCacheLimit(maxEntries) {
  if (!Number.isFinite(maxEntries)) return Number.POSITIVE_INFINITY;
  return Math.max(1, Math.floor(maxEntries));
}

export function getParticleCount({
  width = 1200,
  hardwareConcurrency = 4,
  reducedMotion = false
} = {}) {
  if (reducedMotion) return 4000;
  if (hardwareConcurrency <= 4 || width < 640) return 10000;
  if (width < 1100) return 16000;
  if (hardwareConcurrency >= 10 && width >= 1500) return 26000;
  return 22000;
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
    this.particleGeometry = null;
    this.particleMaterial = null;
    this.particles = null;
    this.backgroundParticles = null;
    this.disposedModels = new WeakSet();
    this.loader = createGLTFLoader();
    this.modelAssets = createModelAssetCache((url) => new Promise((resolve, reject) => {
      this.loader.load(url, resolve, undefined, reject);
    }), { maxEntries: 3 });
    this.preparedModels = createPreparedModelCache((model, craft) => {
      model.rotation.y += getHomeModelRotation(craft.id);
      model.updateMatrixWorld(true);
      normalizeObject(model, getModelTargetSize(this.container.clientWidth));
      prepareSolidModel(model);
      return sampleSurfacePositionsAsync(model, this.positions.length / 3)
        .then((positions) => ({ model, positions }));
    }, {
      maxEntries: 3,
      onEvict: (_url, prepared) => this.retirePreparedEntry(prepared)
    });
    this.animationId = null;
    this.currentModelUrl = null;
    this.craftRequestId = 0;
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
    this.transitionFrom = 0;
    this.transitionTo = 1;
    this.particleProfile = getCraftParticleProfile('porcelain');
    this.pendingParticleProfile = this.particleProfile;
    this.particleRenderProfile = getParticleRenderProfile();
    this.transitionTimer = null;
    this.pendingTransitionResolve = null;
    this.cameraTween = null;
    this.lookTween = null;
    this.artifactLight = null;
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
    this.renderer.toneMappingExposure = getHomeLightingProfile().exposure;
    this.container.appendChild(this.renderer.domElement);

    this.scene.add(this.stageGroup);
    this.addControls();
    this.addLighting();
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
    const lighting = getHomeLightingProfile();
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const roomEnvironment = new RoomEnvironment();
    this.scene.environment = pmremGenerator.fromScene(roomEnvironment).texture;
    roomEnvironment.dispose();
    pmremGenerator.dispose();

    this.scene.add(new THREE.AmbientLight(0xffffff, lighting.ambient));

    const keyLight = new THREE.DirectionalLight(0xfff1d2, lighting.key);
    keyLight.position.set(4, 5, 5);
    this.scene.add(keyLight);

    const fillLight = new THREE.PointLight(0xfff1dc, lighting.rim, 9);
    fillLight.position.set(-3.5, 1.6, 2.6);
    this.scene.add(fillLight);

    this.artifactLight = new THREE.SpotLight(0xffd28a, lighting.spot, 13, Math.PI / 5, 0.45, 1.1);
    this.artifactLight.position.set(0, 5.8, 3.2);
    this.artifactLight.target.position.set(0, 0.4, 0);
    this.scene.add(this.artifactLight);
    this.scene.add(this.artifactLight.target);
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
      new THREE.BufferAttribute(this.positions, 3)
    );
    this.particleGeometry.setAttribute('aStart', new THREE.BufferAttribute(this.startPositions, 3).setUsage(THREE.DynamicDrawUsage));
    this.particleGeometry.setAttribute('aTarget', new THREE.BufferAttribute(this.targetPositions, 3).setUsage(THREE.DynamicDrawUsage));
    this.particleGeometry.setAttribute('aHalo', new THREE.BufferAttribute(new Float32Array(this.positions), 3).setUsage(THREE.DynamicDrawUsage));
    this.particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    this.particleMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uProgress: { value: 1 },
        uOpacity: { value: this.particleRenderProfile.arrivalOpacity },
        uFlow: { value: 1 },
        uSpread: { value: 0.6 },
        uPointSize: { value: 2.3 },
        uPointScale: { value: this.particleRenderProfile.screenScale }
      },
      vertexShader: `
        attribute vec3 aStart;
        attribute vec3 aTarget;
        attribute vec3 aHalo;
        varying vec3 vColor;
        uniform float uProgress;
        uniform float uFlow;
        uniform float uSpread;
        uniform float uPointSize;
        uniform float uPointScale;
        float ease(float t) { return t * t * (3.0 - 2.0 * t); }
        void main() {
          float release = ease(clamp(uProgress / 0.24, 0.0, 1.0));
          float arrival = ease(clamp((uProgress - 0.48) / 0.34, 0.0, 1.0));
          vec3 inkFlow = mix(aStart, aHalo, release);
          float seed = aStart.x * 2.17 + aStart.y * 3.31 + aStart.z * 1.73;
          float arc = sin(seed * 2.0 + uProgress * 6.283) * uSpread * (1.0 - arrival);
          inkFlow.x += arc * uFlow;
          inkFlow.y += sin(seed + uProgress * 3.1415) * uSpread * 0.36 * (1.0 - arrival);
          inkFlow.z += cos(seed * 1.4 + uProgress * 4.2) * uSpread * 0.22 * (1.0 - arrival);
          vec3 transformed = mix(inkFlow, aTarget, arrival);
          vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = uPointSize * (uPointScale / max(1.0, -mvPosition.z));
          vColor = color;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        uniform float uOpacity;
        void main() {
          vec2 centered = gl_PointCoord - 0.5;
          float alpha = (1.0 - smoothstep(0.08, 0.5, length(centered))) * uOpacity;
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      vertexColors: true,
      transparent: true,
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
      const color = index % 4 === 0 ? GOLD : PARCHMENT;
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
      opacity: 0.2,
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
    const requestId = ++this.craftRequestId;
    const isLatestRequest = () => requestId === this.craftRequestId;
    this.currentModelUrl = url;
    this.focusMuseumStop(craft);
    const incomingProfile = getCraftParticleProfile(craft.id);
    this.updateParticleColors(craft.color || '#d3382f');
    this.setLoading(true);
    this.beginInkRelease(this.particleProfile);
    this.pendingParticleProfile = incomingProfile;

    return this.modelAssets.load(url)
      .then(async (gltf) => {
          if (!isLatestRequest()) {
            return;
          }
          const prepared = await this.preparedModels.get(url, gltf.scene, craft);
          if (!isLatestRequest()) {
            return;
          }
          this.setLoading(false);
          const { model, positions: sampledPositions } = prepared;
          this.replaceSolidModel(model);
          return new Promise((resolve) => {
            this.startMorph(sampledPositions, resolve);
          });
        })
      .catch((error) => {
          if (!isLatestRequest()) {
            return;
          }
          this.setLoading(false);
          console.error('Failed to load heritage model:', {
            craftId: craft.id,
            url,
            error
          });
          const cloud = createRandomCloud(this.positions.length / 3, 3.4);
          return new Promise((resolve) => {
            this.startMorph(cloud, resolve);
          }).then(() => Promise.reject(error));
        });
  }

  updateParticleColors(colorValue) {
    if (!this.particleGeometry) return;
    const colors = this.particleGeometry.getAttribute('color');
    const craftColor = new THREE.Color(colorValue);
    const palette = createCraftParticlePalette(craftColor);
    for (let index = 0; index < colors.count; index += 1) {
      const color = palette[index % palette.length];
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

  }

  replaceSolidModel(model) {
    const previousModel = this.solidModel;
    if (previousModel) {
      this.stageGroup.remove(previousModel);
      if (previousModel.userData.homeCacheEvicted) {
        this.disposePreparedModel(previousModel);
      }
    }
    this.solidModel = model;
    this.solidMaterials = collectMaterials(model);
    this.solidMaterials.forEach((material) => {
      material.opacity = 0;
      material.userData.homeFinalOpacity = material.userData.homeFinalOpacity ?? 1;
    });
    this.stageGroup.add(model);
  }

  retirePreparedEntry(prepared) {
    Promise.resolve(prepared)
      .then((entry) => {
        const model = entry?.model;
        if (!model) return;
        if (model === this.solidModel) {
          model.userData.homeCacheEvicted = true;
          return;
        }
        this.disposePreparedModel(model);
      })
      .catch(() => {});
  }

  disposePreparedModel(model) {
    if (!model || this.disposedModels.has(model)) return;
    this.disposedModels.add(model);
    disposeObject(model);
  }

  fadeCurrentModel() {
    if (!this.solidMaterials.length) return;
    this.solidMaterials.forEach((material) => {
      material.transparent = true;
      material.depthWrite = false;
      material.opacity = material.userData.homeFinalOpacity ?? material.opacity ?? 1;
      material.needsUpdate = true;
    });
    if (this.particleMaterial) {
      this.particleMaterial.uniforms.uOpacity.value = this.particleRenderProfile.releaseOpacity * 0.84;
    }
  }

  startMorph(modelPositions, onComplete) {
    this.finishPendingTransition();
    this.modelPositions = modelPositions;
    this.targetPositions = modelPositions;
    this.particleGeometry.getAttribute('aTarget').array.set(modelPositions);
    this.particleGeometry.getAttribute('aTarget').needsUpdate = true;
    const currentProgress = Math.max(this.particleMaterial.uniforms.uProgress.value, 0.5);
    this.particleMaterial.uniforms.uProgress.value = currentProgress;
    this.particleMaterial.uniforms.uOpacity.value = this.particleRenderProfile.releaseOpacity;
    this.particleMaterial.uniforms.uFlow.value = this.pendingParticleProfile.flow;
    this.particleMaterial.uniforms.uSpread.value = this.pendingParticleProfile.spread;
    this.particleMaterial.uniforms.uPointSize.value = 2.3 * this.pendingParticleProfile.size;
    this.morphStartedAt = performance.now();
    this.transitionFrom = currentProgress;
    this.transitionTo = 1;
    this.morphDuration = getMorphDuration(this.reducedMotion) * (1 - currentProgress);
    this.morphing = true;
    this.pendingTransitionResolve = onComplete || null;
    this.transitionTimer = window.setTimeout(() => {
      this.transitionTimer = null;
      const resolve = this.pendingTransitionResolve;
      this.pendingTransitionResolve = null;
      resolve?.();
    }, this.morphDuration);
  }

  beginInkRelease(releaseProfile) {
    if (!this.particleGeometry || !this.particleMaterial) return;
    this.finishPendingTransition();

    this.captureCurrentParticlePositions();
    const bridgePositions = createInkFlowPositions(this.positions, releaseProfile);
    this.startPositions.set(this.positions);
    this.haloPositions = bridgePositions;
    this.particleGeometry.getAttribute('aStart').array.set(this.startPositions);
    this.particleGeometry.getAttribute('aTarget').array.set(bridgePositions);
    this.particleGeometry.getAttribute('aHalo').array.set(bridgePositions);
    this.particleGeometry.getAttribute('aStart').needsUpdate = true;
    this.particleGeometry.getAttribute('aTarget').needsUpdate = true;
    this.particleGeometry.getAttribute('aHalo').needsUpdate = true;
    this.particleMaterial.uniforms.uProgress.value = 0;
    this.particleMaterial.uniforms.uOpacity.value = this.particleRenderProfile.releaseOpacity;
    this.particleMaterial.uniforms.uFlow.value = releaseProfile.flow;
    this.particleMaterial.uniforms.uSpread.value = releaseProfile.spread;
    this.particleMaterial.uniforms.uPointSize.value = 2.3 * releaseProfile.size;
    this.morphStartedAt = performance.now();
    this.transitionFrom = 0;
    this.transitionTo = 0.5;
    this.morphDuration = getMorphDuration(this.reducedMotion) * 0.5;
    this.morphing = true;
    this.fadeCurrentModel();
  }

  finishPendingTransition() {
    if (this.transitionTimer) {
      window.clearTimeout(this.transitionTimer);
      this.transitionTimer = null;
    }
    const resolve = this.pendingTransitionResolve;
    this.pendingTransitionResolve = null;
    resolve?.();
  }

  captureCurrentParticlePositions() {
    const progress = this.particleMaterial?.uniforms?.uProgress?.value;
    if (!Number.isFinite(progress) || progress >= 1) return;
    const start = this.particleGeometry.getAttribute('aStart').array;
    const target = this.particleGeometry.getAttribute('aTarget').array;
    const halo = this.particleGeometry.getAttribute('aHalo').array;
    const profile = {
      flow: this.particleMaterial.uniforms.uFlow.value,
      spread: this.particleMaterial.uniforms.uSpread.value
    };
    for (let index = 0; index < this.positions.length; index += 3) {
      writeInkTransitionPoint(
        this.positions,
        index,
        start,
        target,
        halo,
        index,
        progress,
        profile
      );
    }
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
      const rawProgress = getTransitionProgress(
        now - this.morphStartedAt,
        this.morphDuration,
        this.transitionFrom,
        this.transitionTo
      );
      const segmentDone = rawProgress >= this.transitionTo;
      const frameState = getMorphFrameState(
        rawProgress,
        this.transitionTo,
        this.particleRenderProfile
      );
      this.particleMaterial.uniforms.uProgress.value = rawProgress;
      this.particleMaterial.uniforms.uOpacity.value = frameState.particleOpacity;
      setSolidOpacity(this.solidMaterials, frameState.solidOpacity);

      if (segmentDone) {
        this.morphing = false;
        if (this.transitionTo >= 1) {
          this.positions.set(this.modelPositions);
          this.startPositions.set(this.modelPositions);
          this.haloPositions = null;
          this.particleProfile = this.pendingParticleProfile;
          this.particleMaterial.uniforms.uProgress.value = 1;
          this.particleMaterial.uniforms.uOpacity.value = getSettledParticleOpacity();
          setSolidOpacity(this.solidMaterials, 1);
        }
      }
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
    this.craftRequestId += 1;
    this.stopAnimation();
    if (this.resizeHandler) window.removeEventListener('resize', this.resizeHandler);
    if (this.pointerHandler) this.container.removeEventListener('pointermove', this.pointerHandler);
    if (this.visibilityHandler) document.removeEventListener('visibilitychange', this.visibilityHandler);
    this.finishPendingTransition();
    this.cameraTween?.stop();
    this.lookTween?.stop();
    for (const prepared of this.preparedModels.values()) {
      Promise.resolve(prepared)
        .then((entry) => this.disposePreparedModel(entry.model))
        .catch(() => {});
    }
    this.disposePreparedModel(this.solidModel);
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

function createCraftParticlePalette(color) {
  return Array.from({ length: 7 }, (_, band) => {
    const mixed = color.clone();
    if (band === 0 || band === 3) mixed.lerp(GOLD, 0.68);
    if (band === 1) mixed.lerp(PARCHMENT, 0.54);
    return mixed;
  });
}

export function createParticleColors(count, color) {
  const colors = new Float32Array(count * 3);
  const palette = createCraftParticlePalette(color);
  for (let index = 0; index < count; index += 1) {
    const mixed = palette[index % palette.length];
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

function prepareSolidModel(object) {
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
      if (typeof clone.envMapIntensity !== 'undefined') {
        clone.envMapIntensity = material.envMapIntensity ?? 1;
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

export async function sampleSurfacePositionsAsync(object, count, {
  chunkSize = 1024,
  random = Math.random,
  scheduler = yieldToMainThread
} = {}) {
  object.updateMatrixWorld(true);
  const entries = [];
  object.traverse((child) => {
    if (!child.isMesh || !child.geometry?.attributes?.position) return;
    const position = child.geometry.attributes.position;
    const index = child.geometry.index;
    const triangleCount = index
      ? Math.floor(index.count / 3)
      : Math.floor(position.count / 3);
    if (triangleCount <= 0) return;
    entries.push({
      position,
      index,
      matrixWorld: child.matrixWorld.clone(),
      triangleCount
    });
  });

  if (!entries.length) {
    return createRandomCloud(count, 3.2);
  }

  const totalTriangles = entries.reduce((sum, entry) => sum + entry.triangleCount, 0);
  const positions = new Float32Array(count * 3);
  const vertexA = new THREE.Vector3();
  const vertexB = new THREE.Vector3();
  const vertexC = new THREE.Vector3();
  const edgeAB = new THREE.Vector3();
  const edgeAC = new THREE.Vector3();
  const sampled = new THREE.Vector3();
  const safeChunkSize = Math.max(1, Math.floor(chunkSize));

  for (let start = 0; start < count; start += safeChunkSize) {
    const end = Math.min(start + safeChunkSize, count);
    for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
      let cursor = random() * totalTriangles;
      let entry = entries[entries.length - 1];
      for (const candidate of entries) {
        cursor -= candidate.triangleCount;
        if (cursor <= 0) {
          entry = candidate;
          break;
        }
      }

      const triangle = Math.min(
        Math.floor(random() * entry.triangleCount),
        entry.triangleCount - 1
      );
      const triangleOffset = triangle * 3;
      const aIndex = entry.index ? entry.index.getX(triangleOffset) : triangleOffset;
      const bIndex = entry.index ? entry.index.getX(triangleOffset + 1) : triangleOffset + 1;
      const cIndex = entry.index ? entry.index.getX(triangleOffset + 2) : triangleOffset + 2;
      vertexA.fromBufferAttribute(entry.position, aIndex);
      vertexB.fromBufferAttribute(entry.position, bIndex);
      vertexC.fromBufferAttribute(entry.position, cIndex);

      let barycentricU = random();
      let barycentricV = random();
      if (barycentricU + barycentricV > 1) {
        barycentricU = 1 - barycentricU;
        barycentricV = 1 - barycentricV;
      }
      edgeAB.subVectors(vertexB, vertexA);
      edgeAC.subVectors(vertexC, vertexA);
      sampled.copy(vertexA)
        .addScaledVector(edgeAB, barycentricU)
        .addScaledVector(edgeAC, barycentricV)
        .applyMatrix4(entry.matrixWorld);
      const outputIndex = sampleIndex * 3;
      positions[outputIndex] = sampled.x;
      positions[outputIndex + 1] = sampled.y;
      positions[outputIndex + 2] = sampled.z;
    }

    if (end < count) {
      await scheduler();
    }
  }

  return positions;
}

function yieldToMainThread() {
  return new Promise((resolve) => {
    if (typeof globalThis.requestIdleCallback === 'function') {
      globalThis.requestIdleCallback(() => resolve(), { timeout: 24 });
      return;
    }
    globalThis.setTimeout(resolve, 0);
  });
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

function createInkFlowPositions(sourcePositions, profile) {
  const positions = new Float32Array(sourcePositions.length);
  for (let index = 0; index < sourcePositions.length; index += 3) {
    const seed = index / 3;
    const y = sourcePositions[index + 1];
    const ribbon = Math.sin(seed * 0.013 + y * 1.7) * profile.flow;
    positions[index] = sourcePositions[index] * 0.34 + ribbon * 1.25;
    positions[index + 1] = y * 0.52 + Math.sin(seed * 0.007) * profile.spread;
    positions[index + 2] = sourcePositions[index + 2] * 0.24 + Math.cos(seed * 0.009) * profile.spread * 0.6;
  }
  return positions;
}

function writeInkTransitionPoint(output, outputIndex, start, target, halo, sourceIndex, progress, profile) {
  const release = smoothstep(Math.min(Math.max(progress / 0.24, 0), 1));
  const arrival = smoothstep(Math.min(Math.max((progress - 0.48) / 0.34, 0), 1));
  const startX = start[sourceIndex];
  const startY = start[sourceIndex + 1];
  const startZ = start[sourceIndex + 2];
  const seed = startX * 2.17 + startY * 3.31 + startZ * 1.73;
  const arc = Math.sin(seed * 2 + progress * Math.PI * 2) * profile.spread * (1 - arrival);
  const flowX = lerp(startX, halo[sourceIndex], release) + arc * profile.flow;
  const flowY = lerp(startY, halo[sourceIndex + 1], release)
    + Math.sin(seed + progress * Math.PI) * profile.spread * 0.36 * (1 - arrival);
  const flowZ = lerp(startZ, halo[sourceIndex + 2], release)
    + Math.cos(seed * 1.4 + progress * 4.2) * profile.spread * 0.22 * (1 - arrival);
  output[outputIndex] = lerp(flowX, target[sourceIndex], arrival);
  output[outputIndex + 1] = lerp(flowY, target[sourceIndex + 1], arrival);
  output[outputIndex + 2] = lerp(flowZ, target[sourceIndex + 2], arrival);
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
  const clamped = Math.min(Math.max(value, 0), 1);
  return clamped * clamped * (3 - 2 * clamped);
}

function lerp(from, to, progress) {
  return from + (to - from) * progress;
}
