import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createGLTFLoader } from '../utils/modelLoader.js';

const PRODUCT_EXPORT_MAX_DIMENSION_METERS = Object.freeze({
  keychain: 0.09,
  bag: 0.45,
  phone: 0.17,
  sticker: 0.08,
  magnet: 0.075,
  figurine: 0.18
});

export function getCraftRenderMode(craft) {
  return craft?.modelUrl ? 'glb' : 'default';
}

export function getPrintPixelAlpha(red, green, blue, alpha = 255) {
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const chroma = maximum - minimum;

  if (minimum >= 242 && chroma <= 18) return 0;
  if (minimum >= 218 && chroma <= 22) {
    return Math.round(alpha * ((242 - minimum) / 24));
  }
  return alpha;
}

export function removeConnectedLightBackground(pixels, width, height) {
  const pixelCount = Number(width) * Number(height);
  if (!pixels || pixelCount <= 0 || pixels.length < pixelCount * 4) return pixels;

  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let head = 0;
  let tail = 0;

  const getReducedAlpha = (pixelIndex) => {
    const offset = pixelIndex * 4;
    return getPrintPixelAlpha(
      pixels[offset],
      pixels[offset + 1],
      pixels[offset + 2],
      pixels[offset + 3]
    );
  };
  const enqueue = (pixelIndex) => {
    if (pixelIndex < 0 || pixelIndex >= pixelCount || visited[pixelIndex]) return;
    const alpha = pixels[(pixelIndex * 4) + 3];
    if (alpha !== 0 && getReducedAlpha(pixelIndex) >= alpha) return;
    visited[pixelIndex] = 1;
    queue[tail] = pixelIndex;
    tail += 1;
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue(((height - 1) * width) + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width);
    enqueue((y * width) + width - 1);
  }

  while (head < tail) {
    const pixelIndex = queue[head];
    head += 1;
    pixels[(pixelIndex * 4) + 3] = getReducedAlpha(pixelIndex);
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    if (x > 0) enqueue(pixelIndex - 1);
    if (x < width - 1) enqueue(pixelIndex + 1);
    if (y > 0) enqueue(pixelIndex - width);
    if (y < height - 1) enqueue(pixelIndex + width);
  }

  return pixels;
}

export class ThreeScene {
  constructor(container) {
    this.container = container;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.model = null;
    this.texture = null;
    this.currentCraft = null;
    this.animationId = null;
    this.gltfLoader = createGLTFLoader();
    this.gltfExporter = new GLTFExporter();
    this.loadingModel = false;
    this.currentModelUrl = null;
    this.currentCarrier = 'keychain';
    this.resizeHandler = null;
    this.visibilityHandler = null;
    this.modelLoadToken = 0;
    this.textureLoadToken = 0;
    this.environmentTarget = null;
    this.pendingModelLoad = null;
    this.pendingTextureLoad = null;
  }

  init() {
    this.scene = new THREE.Scene();
    this.scene.background = null;

    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
    this.camera.position.set(0, 0, 6);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.alpha = true;
    this.renderer.preserveDrawingBuffer = false;
    this.container.appendChild(this.renderer.domElement);

    this.addControls();
    this.addLighting();
    this.createModel();
    this.startAnimation();

    this.resizeHandler = () => this.onResize();
    this.visibilityHandler = () => {
      if (document.hidden) {
        this.stopAnimation();
      } else {
        this.startAnimation();
      }
    };
    window.addEventListener('resize', this.resizeHandler);
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  addControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.enableZoom = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 15;
    this.controls.autoRotate = false;
    this.controls.enableKeys = false;
    this.controls.enableScrollToZoom = false;
  }

  addLighting() {
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.environmentTarget = pmremGenerator.fromScene(roomEnv);
    this.scene.environment = this.environmentTarget.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(4, 6, 5);
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
    fillLight.position.set(-5, 3, -4);
    this.scene.add(fillLight);
  }

  createModel(modelUrl, loadHandlers = null) {
    this.cancelPendingModelLoad();
    const loadToken = ++this.modelLoadToken;
    this.currentModelUrl = modelUrl || null;
    this.loadingModel = Boolean(modelUrl);
    if (loadHandlers && modelUrl) {
      this.pendingModelLoad = { ...loadHandlers, token: loadToken, url: modelUrl };
    }

    if (this.model) {
      this.scene.remove(this.model);
      this.disposeObject(this.model);
      this.model = null;
    }

    this.model = new THREE.Group();
    this.scene.add(this.model);

    if (modelUrl) {
      this.loadGLBModel(modelUrl, loadToken);
    } else {
      this.createDefaultModel();
    }
  }

  setCraft(craft) {
    this.currentCraft = craft;
    if (craft && craft.modelUrl) {
      this.createModel(craft.modelUrl);
    } else {
      this.createModel();
    }
  }

  loadGLBModel(url, loadToken = ++this.modelLoadToken) {
    this.currentModelUrl = url;

    this.gltfLoader.load(
      url,
      (gltf) => {
        if (loadToken !== this.modelLoadToken || this.currentModelUrl !== url) {
          this.disposeObject(gltf.scene);
          this.settlePendingModelLoad(loadToken, { status: 'stale', url });
          return;
        }

        this.disposeObject(this.model);
        this.model.clear();
        this.loadingModel = false;
        const scene = gltf.scene;

        scene.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            child.renderOrder = 0;
            
            if (child.material) {
              const materials = Array.isArray(child.material) ? child.material : [child.material];
              materials.forEach((mat) => {
                if (mat.map) {
                  mat.map.colorSpace = THREE.SRGBColorSpace;
                }
                if (mat.emissiveMap) {
                  mat.emissiveMap.colorSpace = THREE.SRGBColorSpace;
                }
                if (typeof mat.envMapIntensity !== 'undefined') {
                  mat.envMapIntensity = 1.0;
                }
                mat.needsUpdate = true;
              });
            }
          }
        });

        this.model.add(scene);
        this.centerModel();

        if (this.texture) {
          this.applyTexture();
        }
        this.settlePendingModelLoad(loadToken, { status: 'loaded', url });
      },
      undefined,
      (error) => {
        if (loadToken !== this.modelLoadToken || this.currentModelUrl !== url) {
          this.settlePendingModelLoad(loadToken, { status: 'stale', url });
          return;
        }
        this.loadingModel = false;
        this.currentModelUrl = null;
        console.warn('GLB model not found, using default geometry:', error);
        this.createDefaultModel();
        if (this.texture) {
          this.applyTexture();
        }
        const loadError = new Error('Generated GLB failed to load');
        loadError.code = 'GLB_LOAD_FAILED';
        loadError.cause = error;
        this.settlePendingModelLoad(loadToken, loadError, true);
      }
    );
  }

  centerModel() {
    if (!this.model || this.model.children.length === 0) return;
    
    const box = new THREE.Box3().setFromObject(this.model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    
    const maxDim = Math.max(size.x, size.y, size.z);
    if (!Number.isFinite(maxDim) || maxDim <= 0) return;
    const scale = 4.5 / maxDim;

    this.model.scale.set(scale, scale, scale);
    this.model.position.copy(center).multiplyScalar(-scale);
  }

  createDefaultModel() {
    if (!this.currentCraft && this.currentCarrier) {
      const carrierFactory = {
        keychain: () => this.createKeychainModel(),
        bag: () => this.createBagModel(),
        phone: () => this.createPhoneModel(),
        sticker: () => this.createStickerModel(),
        magnet: () => this.createMagnetModel(),
        figurine: () => this.createFigurineModel()
      };

      if (carrierFactory[this.currentCarrier]) {
        carrierFactory[this.currentCarrier]();
        this.centerModel();
        return;
      }
    }

    if (!this.currentCraft) {
      const sphereGeometry = new THREE.SphereGeometry(1, 32, 32);
      const sphereMaterial = new THREE.MeshStandardMaterial({
        color: 0xe8d5b7,
        roughness: 0.3,
        metalness: 0.1
      });
      const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
      sphere.castShadow = true;
      sphere.receiveShadow = true;
      this.model.add(sphere);
      return;
    }

    const color = this.currentCraft.color || '#d3382f';
    const craftGeometry = new THREE.BoxGeometry(1.5, 1.5, 1.5);
    const craftMaterial = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.3,
      metalness: 0.1
    });
    const craftMesh = new THREE.Mesh(craftGeometry, craftMaterial);
    craftMesh.castShadow = true;
    craftMesh.receiveShadow = true;
    craftMesh.name = 'texture-target';
    this.model.add(craftMesh);
  }

  createKeychainModel() {
    const plaqueShape = this.createRoundedRectangleShape(1.78, 1.5, 0.28);
    const plaque = this.createCarrierBody(
      this.createExtrudedGeometry(plaqueShape, 0.22, 0.055),
      new THREE.MeshPhysicalMaterial({
        color: 0xf4efe5,
        roughness: 0.24,
        metalness: 0,
        clearcoat: 0.65,
        clearcoatRoughness: 0.2
      })
    );
    plaque.position.y = -0.06;
    this.model.add(plaque);

    this.addPrintSurface('keychain', new THREE.PlaneGeometry(1.5, 1.22), [0, -0.06, 0.175]);

    const metal = new THREE.MeshStandardMaterial({ color: 0xc7a35a, roughness: 0.2, metalness: 0.92 });
    const eyelet = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.045, 12, 36), metal);
    eyelet.position.set(0, 0.88, 0);
    eyelet.castShadow = true;
    this.model.add(eyelet);

    const connector = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.035, 10, 28), metal);
    connector.position.set(0, 1.13, 0);
    connector.rotation.y = Math.PI / 2;
    connector.castShadow = true;
    this.model.add(connector);

    const splitRing = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.055, 12, 52), metal);
    splitRing.position.set(0, 1.58, 0);
    splitRing.castShadow = true;
    this.model.add(splitRing);
  }

  createBagModel() {
    const bagShape = new THREE.Shape();
    bagShape.moveTo(-1.42, -1.24);
    bagShape.quadraticCurveTo(-1.5, -0.1, -1.22, 1.2);
    bagShape.quadraticCurveTo(0, 1.34, 1.22, 1.2);
    bagShape.quadraticCurveTo(1.5, -0.1, 1.42, -1.24);
    bagShape.quadraticCurveTo(0, -1.38, -1.42, -1.24);

    const bag = this.createCarrierBody(
      this.createExtrudedGeometry(bagShape, 0.38, 0.075),
      new THREE.MeshStandardMaterial({ color: 0xd8c6a4, roughness: 0.86, metalness: 0 })
    );
    this.model.add(bag);
    this.addPrintSurface('bag', new THREE.PlaneGeometry(1.76, 1.52), [0, -0.18, 0.275], {
      roughness: 0.76
    });

    const handleMaterial = new THREE.MeshStandardMaterial({ color: 0xb69a70, roughness: 0.9, metalness: 0 });
    [-0.11, 0.11].forEach((z, index) => {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.83, 1.02, z),
        new THREE.Vector3(-0.74, 1.8, z),
        new THREE.Vector3(0, 2.08 + index * 0.03, z),
        new THREE.Vector3(0.74, 1.8, z),
        new THREE.Vector3(0.83, 1.02, z)
      ]);
      const handle = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.055, 10, false), handleMaterial);
      handle.castShadow = true;
      this.model.add(handle);
    });

  }

  createPhoneModel() {
    const caseShape = this.createRoundedRectangleShape(1.34, 2.62, 0.25);
    const phoneCase = this.createCarrierBody(
      this.createExtrudedGeometry(caseShape, 0.18, 0.045),
      new THREE.MeshPhysicalMaterial({
        color: 0x302e2b,
        roughness: 0.36,
        metalness: 0.08,
        clearcoat: 0.35,
        clearcoatRoughness: 0.3
      })
    );
    this.model.add(phoneCase);
    this.addPrintSurface('phone', new THREE.PlaneGeometry(1.16, 2.36), [0, 0, 0.145], {
      roughness: 0.34
    });

    const cameraShape = this.createRoundedRectangleShape(0.5, 0.58, 0.13);
    const cameraIsland = new THREE.Mesh(
      this.createExtrudedGeometry(cameraShape, 0.08, 0.025),
      new THREE.MeshStandardMaterial({ color: 0x272522, roughness: 0.28, metalness: 0.12 })
    );
    cameraIsland.position.set(-0.35, 0.91, 0.18);
    this.model.add(cameraIsland);

    const lensMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x161616,
      roughness: 0.12,
      metalness: 0.35,
      clearcoat: 1
    });
    [[-0.45, 1.02], [-0.25, 0.81]].forEach(([x, y]) => {
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.055, 24), lensMaterial);
      lens.rotation.x = Math.PI / 2;
      lens.position.set(x, y, 0.265);
      this.model.add(lens);
    });
  }

  createStickerModel() {
    const stickerShape = this.createOrganicBadgeShape(1.08, 32);
    const backing = this.createCarrierBody(
      this.createExtrudedGeometry(stickerShape, 0.045, 0.028),
      new THREE.MeshPhysicalMaterial({
        color: 0xfdfbf6,
        roughness: 0.22,
        metalness: 0,
        clearcoat: 0.72,
        clearcoatRoughness: 0.18
      })
    );
    this.model.add(backing);

    const printShape = this.createOrganicBadgeShape(0.99, 32);
    this.addPrintSurface('sticker', new THREE.ShapeGeometry(printShape, 24), [0, 0, 0.075], {
      roughness: 0.28
    });
  }

  createMagnetModel() {
    const medallionShape = new THREE.Shape();
    medallionShape.absellipse(0, 0, 1.04, 0.78, 0, Math.PI * 2, false, 0);
    const medallion = this.createCarrierBody(
      this.createExtrudedGeometry(medallionShape, 0.2, 0.065),
      new THREE.MeshPhysicalMaterial({
        color: 0xc9a16f,
        roughness: 0.44,
        metalness: 0.06,
        clearcoat: 0.32,
        clearcoatRoughness: 0.3
      })
    );
    this.model.add(medallion);

    const printShape = new THREE.Shape();
    printShape.absellipse(0, 0, 0.91, 0.65, 0, Math.PI * 2, false, 0);
    this.addPrintSurface('magnet', new THREE.ShapeGeometry(printShape, 32), [0, 0, 0.17], {
      roughness: 0.42
    });

    const magneticDisc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.55, 0.09, 48),
      new THREE.MeshStandardMaterial({ color: 0x343434, roughness: 0.68, metalness: 0.65 })
    );
    magneticDisc.rotation.x = Math.PI / 2;
    magneticDisc.position.z = -0.18;
    this.model.add(magneticDisc);
  }

  createFigurineModel() {
    const clay = new THREE.MeshStandardMaterial({ color: 0xc9825b, roughness: 0.58, metalness: 0 });
    const darkClay = new THREE.MeshStandardMaterial({ color: 0x4b382f, roughness: 0.66, metalness: 0 });
    const garment = new THREE.MeshStandardMaterial({ color: 0xefe2cc, roughness: 0.72, metalness: 0 });

    const base = this.createCarrierBody(new THREE.CylinderGeometry(0.84, 0.94, 0.24, 48), darkClay);
    base.position.y = -1.72;
    this.model.add(base);

    const torso = this.createCarrierBody(new THREE.CapsuleGeometry(0.39, 0.72, 10, 24), garment);
    torso.position.y = -0.25;
    torso.scale.set(1.05, 1, 0.72);
    this.model.add(torso);

    const head = this.createCarrierBody(new THREE.SphereGeometry(0.5, 32, 24), clay);
    head.position.y = 0.94;
    head.scale.set(0.94, 1.05, 0.92);
    this.model.add(head);

    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.515, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.52), darkClay);
    hair.position.y = 1.01;
    hair.scale.set(0.96, 1, 0.94);
    this.model.add(hair);

    [-1, 1].forEach((side) => {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.115, 0.66, 8, 16), garment);
      arm.position.set(side * 0.54, -0.2, 0);
      arm.rotation.z = side * -0.32;
      this.model.add(arm);

      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.145, 0.62, 8, 18), darkClay);
      leg.position.set(side * 0.22, -1.12, 0);
      this.model.add(leg);
    });

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), clay);
    nose.position.set(0, 0.91, 0.47);
    this.model.add(nose);

    this.addPrintSurface('figurine', new THREE.CircleGeometry(0.22, 40), [0, -0.25, 0.29], {
      roughness: 0.5
    });
  }

  createRoundedRectangleShape(width, height, radius) {
    const shape = new THREE.Shape();
    const left = -width / 2;
    const right = width / 2;
    const bottom = -height / 2;
    const top = height / 2;

    shape.moveTo(left + radius, bottom);
    shape.lineTo(right - radius, bottom);
    shape.quadraticCurveTo(right, bottom, right, bottom + radius);
    shape.lineTo(right, top - radius);
    shape.quadraticCurveTo(right, top, right - radius, top);
    shape.lineTo(left + radius, top);
    shape.quadraticCurveTo(left, top, left, top - radius);
    shape.lineTo(left, bottom + radius);
    shape.quadraticCurveTo(left, bottom, left + radius, bottom);
    return shape;
  }

  createOrganicBadgeShape(radius, segments) {
    const shape = new THREE.Shape();
    for (let index = 0; index <= segments; index += 1) {
      const angle = (index / segments) * Math.PI * 2;
      const ripple = 1 + Math.sin(angle * 5) * 0.035 + Math.cos(angle * 3) * 0.025;
      const x = Math.cos(angle) * radius * ripple;
      const y = Math.sin(angle) * radius * 0.88 * ripple;
      if (index === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    shape.closePath();
    return shape;
  }

  createExtrudedGeometry(shape, depth, bevelSize) {
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth,
      steps: 1,
      curveSegments: 20,
      bevelEnabled: true,
      bevelSegments: 4,
      bevelSize,
      bevelThickness: bevelSize
    });
    geometry.translate(0, 0, -depth / 2);
    geometry.computeVertexNormals();
    return geometry;
  }

  createCarrierBody(geometry, material) {
    const body = new THREE.Mesh(geometry, material);
    body.castShadow = true;
    body.receiveShadow = true;
    body.userData.isCarrierBody = true;
    return body;
  }

  addPrintSurface(carrier, geometry, position, options = {}) {
    this.normalizePrintSurfaceUVs(geometry);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: options.roughness ?? 0.46,
      metalness: 0,
      transparent: true,
      opacity: 0,
      alphaTest: 0.02,
      depthWrite: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });
    const printSurface = new THREE.Mesh(geometry, material);
    printSurface.name = `${carrier}-print-surface`;
    printSurface.userData.isPrintSurface = true;
    printSurface.visible = false;
    const bounds = geometry.boundingBox;
    if (bounds) {
      const width = bounds.max.x - bounds.min.x;
      const height = bounds.max.y - bounds.min.y;
      if (width > Number.EPSILON && height > Number.EPSILON) {
        printSurface.userData.printAspect = width / height;
      }
    }
    printSurface.position.set(...position);
    printSurface.renderOrder = 2;
    this.model.add(printSurface);
    return printSurface;
  }

  normalizePrintSurfaceUVs(geometry) {
    const position = geometry.getAttribute('position');
    const uv = geometry.getAttribute('uv');
    if (!position || !uv || position.count !== uv.count) return;

    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    const width = bounds.max.x - bounds.min.x;
    const height = bounds.max.y - bounds.min.y;
    if (width <= Number.EPSILON || height <= Number.EPSILON) return;

    for (let index = 0; index < position.count; index += 1) {
      uv.setXY(
        index,
        (position.getX(index) - bounds.min.x) / width,
        (position.getY(index) - bounds.min.y) / height
      );
    }
    uv.needsUpdate = true;
  }

  fitTextureToPrintSurface(texture, printAspect) {
    const image = texture.image;
    const imageWidth = image?.naturalWidth || image?.videoWidth || image?.width;
    const imageHeight = image?.naturalHeight || image?.videoHeight || image?.height;
    if (!imageWidth || !imageHeight || !Number.isFinite(printAspect) || printAspect <= 0) return;

    const imageAspect = imageWidth / imageHeight;
    let repeatX = 1;
    let repeatY = 1;
    if (imageAspect > printAspect) {
      repeatX = printAspect / imageAspect;
    } else if (imageAspect < printAspect) {
      repeatY = imageAspect / printAspect;
    }

    texture.repeat.set(repeatX, repeatY);
    texture.offset.set((1 - repeatX) / 2, (1 - repeatY) / 2);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
  }

  setCarrier(carrier) {
    this.currentCarrier = carrier;
    this.currentCraft = null;
    this.createModel();
    if (this.texture) {
      this.applyTexture();
    }
  }

  setGeneratedModel(url) {
    if (!url) return Promise.reject(new Error('A generated GLB URL is required'));
    return new Promise((resolve, reject) => {
      this.currentCraft = null;
      try {
        this.createModel(url, { resolve, reject });
      } catch (error) {
        if (this.pendingModelLoad?.resolve === resolve) {
          this.pendingModelLoad = null;
        }
        reject(error);
      }
    });
  }

  clearGeneratedModel() {
    this.currentCraft = null;
    this.createModel();
    if (this.texture) this.applyTexture();
  }

  cancelPendingModelLoad() {
    if (!this.pendingModelLoad) return;
    const pending = this.pendingModelLoad;
    this.pendingModelLoad = null;
    pending.resolve({ status: 'stale', url: pending.url });
  }

  settlePendingModelLoad(token, result, isError = false) {
    if (!this.pendingModelLoad || this.pendingModelLoad.token !== token) return;
    const pending = this.pendingModelLoad;
    this.pendingModelLoad = null;
    if (isError) pending.reject(result);
    else pending.resolve(result);
  }

  setTexture(imageUrl) {
    if (!imageUrl) return Promise.reject(new Error('A generated artwork URL is required'));
    this.cancelPendingTextureLoad();
    const loadToken = ++this.textureLoadToken;

    return new Promise((resolve, reject) => {
      this.pendingTextureLoad = { token: loadToken, url: imageUrl, resolve, reject };
      const loader = new THREE.TextureLoader();
      try {
        loader.load(
          imageUrl,
          (loadedTexture) => {
            if (loadToken !== this.textureLoadToken) {
              loadedTexture.dispose();
              return;
            }

            const texture = this.createPrintTexture(loadedTexture);
            if (texture !== loadedTexture) loadedTexture.dispose();
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.minFilter = THREE.LinearMipmapLinearFilter;
            texture.magFilter = THREE.LinearFilter;
            texture.generateMipmaps = true;
            if (this.renderer) {
              texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
            }
            texture.needsUpdate = true;
            const previousTexture = this.texture;
            this.texture = texture;
            const disposedTextures = this.applyTexture();
            this.focusFrontView();
            if (
              previousTexture
              && previousTexture !== texture
              && !disposedTextures.has(previousTexture)
              && !this.modelUsesTexture(previousTexture)
            ) {
              previousTexture.dispose();
            }
            this.settlePendingTextureLoad(loadToken, { status: 'loaded', url: imageUrl });
          },
          undefined,
          (cause) => {
            if (loadToken !== this.textureLoadToken) return;
            console.warn('Generated artwork texture could not be loaded:', imageUrl);
            const error = new Error('Generated artwork texture failed to load');
            error.cause = cause;
            this.settlePendingTextureLoad(loadToken, error, true);
          }
        );
      } catch (cause) {
        const error = new Error('Generated artwork texture failed to load');
        error.cause = cause;
        this.settlePendingTextureLoad(loadToken, error, true);
      }
    });
  }

  cancelPendingTextureLoad() {
    if (!this.pendingTextureLoad) return;
    const pending = this.pendingTextureLoad;
    this.pendingTextureLoad = null;
    pending.resolve({ status: 'stale', url: pending.url });
  }

  settlePendingTextureLoad(token, result, isError = false) {
    if (!this.pendingTextureLoad || this.pendingTextureLoad.token !== token) return;
    const pending = this.pendingTextureLoad;
    this.pendingTextureLoad = null;
    if (isError) pending.reject(result);
    else pending.resolve(result);
  }

  createPrintTexture(sourceTexture) {
    const image = sourceTexture?.image;
    const width = image?.naturalWidth || image?.videoWidth || image?.width;
    const height = image?.naturalHeight || image?.videoHeight || image?.height;
    if (!image || !width || !height || typeof document === 'undefined') return sourceTexture;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return sourceTexture;

      context.drawImage(image, 0, 0, width, height);
      const imageData = context.getImageData(0, 0, width, height);
      removeConnectedLightBackground(imageData.data, width, height);
      context.putImageData(imageData, 0, 0);
      return new THREE.CanvasTexture(canvas);
    } catch (error) {
      console.warn('Print background cleanup was skipped:', error);
      return sourceTexture;
    }
  }

  focusFrontView() {
    if (!this.camera || !this.controls) return;
    this.camera.position.set(0, 0, 6);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  applyTexture() {
    const disposedTextures = new Set();
    if (!this.texture || !this.model) return disposedTextures;
    return this.replacePrintSurfaceTexture(this.texture);
  }

  clearTexture() {
    this.cancelPendingTextureLoad();
    this.textureLoadToken += 1;
    const previousTexture = this.texture;
    this.texture = null;
    const disposedTextures = this.replacePrintSurfaceTexture(null);
    if (
      previousTexture
      && !disposedTextures.has(previousTexture)
      && !this.modelUsesTexture(previousTexture)
    ) {
      previousTexture.dispose();
    }
  }

  hasAppliedArtwork() {
    if (!this.texture || !this.model) return false;
    let applied = false;
    this.model.traverse((child) => {
      if (applied || !child.visible || !child.userData?.isPrintSurface || !child.material) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      applied = materials.some((material) => material?.map === this.texture && material.opacity > 0);
    });
    return applied;
  }

  async exportCurrentModel(exporter = this.gltfExporter) {
    if (this.loadingModel) throw new Error('The 3D model is still loading');
    if (!this.model) throw new Error('No 3D product is available to export');

    let hasVisibleMesh = false;
    this.model.traverse((child) => {
      if (child.isMesh && child.visible && child.geometry) hasVisibleMesh = true;
    });
    if (!hasVisibleMesh) throw new Error('No visible 3D product is available to export');
    if (!this.hasAppliedArtwork()) {
      throw new Error('Generated artwork has not finished loading');
    }

    const exportModel = this.createProductExportModel();
    const result = await exporter.parseAsync(exportModel, {
      binary: true,
      onlyVisible: true,
      trs: true,
      maxTextureSize: 2048
    });
    if (!(result instanceof ArrayBuffer)) {
      throw new Error('The 3D exporter did not return a binary GLB');
    }
    return new Blob([result], { type: 'model/gltf-binary' });
  }

  createProductExportModel() {
    const exportModel = this.model.clone(true);
    exportModel.position.set(0, 0, 0);
    exportModel.quaternion.identity();
    exportModel.scale.set(1, 1, 1);
    exportModel.updateMatrixWorld(true);

    const bounds = new THREE.Box3().setFromObject(exportModel);
    if (bounds.isEmpty()) throw new Error('No measurable 3D product is available to export');
    const size = bounds.getSize(new THREE.Vector3());
    const maximumDimension = Math.max(size.x, size.y, size.z);
    if (!Number.isFinite(maximumDimension) || maximumDimension <= 0) {
      throw new Error('The 3D product has invalid dimensions');
    }

    const targetDimension = PRODUCT_EXPORT_MAX_DIMENSION_METERS[this.currentCarrier] || 0.1;
    const meterScale = targetDimension / maximumDimension;
    const center = bounds.getCenter(new THREE.Vector3());
    exportModel.scale.setScalar(meterScale);
    exportModel.position.set(
      -center.x * meterScale,
      -bounds.min.y * meterScale,
      -center.z * meterScale
    );
    exportModel.name = `${this.currentCarrier || 'heritage'}-product-asset`;
    exportModel.updateMatrixWorld(true);
    return exportModel;
  }

  replacePrintSurfaceTexture(texture) {
    const disposedTextures = new Set();
    if (!this.model) return disposedTextures;

    const materialUseCount = new Map();
    const printSurfaces = [];
    this.model.traverse((child) => {
      const isPrintSurface = child.userData?.isPrintSurface || child.name === 'texture-target';
      if (isPrintSurface && child.material) printSurfaces.push(child);
      if (!child.material) return;

      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        materialUseCount.set(material, (materialUseCount.get(material) || 0) + 1);
      });
    });

    printSurfaces.forEach((child) => {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        materialUseCount.set(material, materialUseCount.get(material) - 1);
      });
    });

    const disposedSources = new Set();
    printSurfaces.forEach((child) => {
      const previousMaterial = child.material;
      const materials = Array.isArray(previousMaterial) ? previousMaterial : [previousMaterial];
      if (texture && child.userData?.printAspect) {
        this.fitTextureToPrintSurface(texture, child.userData.printAspect);
      }
      const texturedMaterials = materials.map((sourceMaterial) => {
        const material = sourceMaterial.clone();
        material.map = texture;
        if (texture) texture.colorSpace = THREE.SRGBColorSpace;
        material.transparent = true;
        material.opacity = texture ? 1 : 0;
        material.alphaTest = Math.max(material.alphaTest || 0, 0.02);
        material.depthTest = true;
        material.depthWrite = Boolean(texture);
        material.polygonOffset = true;
        material.polygonOffsetFactor = -2;
        material.polygonOffsetUnits = -2;
        material.needsUpdate = true;
        return material;
      });
      child.material = Array.isArray(previousMaterial) ? texturedMaterials : texturedMaterials[0];
      child.visible = Boolean(texture);

      materials.forEach((sourceMaterial) => {
        if (materialUseCount.get(sourceMaterial) === 0 && !disposedSources.has(sourceMaterial)) {
          disposedSources.add(sourceMaterial);
        }
      });
    });

    const retainedTextures = this.collectModelTextures();
    const orphanedTextures = new Set();
    disposedSources.forEach((sourceMaterial) => {
      this.getMaterialTextures(sourceMaterial).forEach((texture) => orphanedTextures.add(texture));
      this.disposeMaterial(sourceMaterial, false);
    });
    orphanedTextures.forEach((texture) => {
      const isProtected = texture === this.texture || texture === this.scene?.environment;
      if (!isProtected && !retainedTextures.has(texture)) {
        disposedTextures.add(texture);
        texture.dispose();
      }
    });

    return disposedTextures;
  }

  getMaterialTextures(material) {
    const textures = new Set();
    Object.values(material || {}).forEach((value) => {
      if (value?.isTexture) textures.add(value);
    });

    Object.values(material?.uniforms || {}).forEach((uniform) => {
      const value = uniform?.value;
      if (value?.isTexture) textures.add(value);
      if (Array.isArray(value)) {
        value.forEach((item) => {
          if (item?.isTexture) textures.add(item);
        });
      }
    });
    return textures;
  }

  collectModelTextures() {
    const textures = new Set();
    if (!this.model) return textures;

    this.model.traverse((child) => {
      if (!child.material) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        this.getMaterialTextures(material).forEach((texture) => textures.add(texture));
      });
    });
    return textures;
  }

  modelUsesTexture(texture) {
    return Boolean(texture) && this.collectModelTextures().has(texture);
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
    if (this.controls) {
      this.controls.update();
    }
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  onResize() {
    if (!this.container || !this.camera || !this.renderer) return;

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  dispose() {
    this.cancelPendingModelLoad();
    this.cancelPendingTextureLoad();
    this.modelLoadToken += 1;
    this.textureLoadToken += 1;
    this.currentModelUrl = null;
    this.loadingModel = false;
    this.stopAnimation();
    if (this.model) {
      this.disposeObject(this.model);
      this.model = null;
    }
    if (this.texture) {
      this.texture.dispose();
      this.texture = null;
    }
    if (this.controls) {
      this.controls.dispose();
      this.controls = null;
    }
    if (this.environmentTarget) {
      this.environmentTarget.dispose();
      this.environmentTarget = null;
    }
    if (this.scene) {
      this.scene.environment = null;
    }
    if (this.renderer) {
      this.renderer.dispose();
    }
    if (this.container && this.renderer && this.renderer.domElement) {
      this.container.removeChild(this.renderer.domElement);
    }
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
    }
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
    }
  }

  disposeObject(object) {
    const disposedGeometries = new Set();
    const disposedMaterials = new Set();
    const disposedTextures = new Set();
    const disposedSkeletons = new Set();

    object.traverse((child) => {
      if (child.skeleton && !disposedSkeletons.has(child.skeleton)) {
        disposedSkeletons.add(child.skeleton);
        child.skeleton.dispose();
      }
      if (child.geometry && !disposedGeometries.has(child.geometry)) {
        disposedGeometries.add(child.geometry);
        child.geometry.dispose();
      }
      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => {
          if (!material || disposedMaterials.has(material)) return;
          disposedMaterials.add(material);
          this.disposeMaterial(material, true, disposedTextures);
        });
      }
    });
  }

  disposeMaterial(material, disposeTextures = true, disposedTextures = new Set()) {
    const materials = Array.isArray(material) ? material : [material];
    materials.forEach((mat) => {
      if (!mat) return;
      this.getMaterialTextures(mat).forEach((texture) => {
        const isProtected = texture === this.texture || texture === this.scene?.environment;
        if (disposeTextures && !isProtected && !disposedTextures.has(texture)) {
          disposedTextures.add(texture);
          texture.dispose();
        }
      });
      mat.dispose();
    });
  }

  destroy() {
    this.dispose();
  }
}
