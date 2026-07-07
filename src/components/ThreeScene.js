import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export function getCraftRenderMode(craft) {
  return craft?.modelUrl ? 'glb' : 'default';
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
    this.gltfLoader = new GLTFLoader();
    this.loadingModel = false;
    this.currentModelUrl = null;
    this.currentCarrier = 'keychain';
    this.resizeHandler = null;
    this.visibilityHandler = null;
  }

  init() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xfaf8f5);

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
    this.renderer.toneMappingExposure = 1.4;
    this.renderer.alpha = true;
    this.renderer.preserveDrawingBuffer = false;
    this.container.appendChild(this.renderer.domElement);

    this.addControls();
    this.addLighting();
    this.addBackgroundElements();
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
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.8;
    this.controls.enableKeys = false;
    this.controls.enableScrollToZoom = false;
  }

  addLighting() {
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.scene.environment = pmremGenerator.fromScene(roomEnv).texture;
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

  addBackgroundElements() {
    const gridHelper = new THREE.GridHelper(20, 40, 0x444444, 0x222222);
    gridHelper.position.y = -2.5;
    this.scene.add(gridHelper);
  }

  createModel(modelUrl) {
    if (this.model) {
      this.scene.remove(this.model);
      this.disposeObject(this.model);
      this.model = null;
    }

    this.model = new THREE.Group();
    this.scene.add(this.model);

    if (modelUrl) {
      this.loadingModel = true;
      this.loadGLBModel(modelUrl);
    } else {
      this.createDefaultModel();
    }
  }

  setCraft(craft) {
    this.currentCraft = craft;
    if (craft && craft.modelUrl) {
      this.createModel(craft.modelUrl);
    } else {
      this.createDefaultModel();
    }
  }

  loadGLBModel(url) {
    this.currentModelUrl = url;
    
    this.gltfLoader.load(
      url,
      (gltf) => {
        if (this.currentModelUrl !== url) return;
        
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
                const usesAlpha = mat.transparent || mat.opacity < 1 || Boolean(mat.alphaMap);
                mat.side = THREE.FrontSide;
                mat.depthWrite = !usesAlpha;
                mat.depthTest = true;
                mat.alphaTest = usesAlpha ? 0.08 : 0;
                mat.polygonOffset = usesAlpha;
                mat.polygonOffsetFactor = -1;
                mat.polygonOffsetUnits = -1;
                mat.needsUpdate = true;
              });
              
              if (child.name === 'texture-target' && this.texture) {
                const material = child.material.clone();
                material.map = this.texture;
                material.map.colorSpace = THREE.SRGBColorSpace;
                if (typeof material.envMapIntensity !== 'undefined') {
                  material.envMapIntensity = 1.0;
                }
                material.side = THREE.FrontSide;
                material.depthWrite = !material.transparent;
                material.depthTest = true;
                material.needsUpdate = true;
                child.material = material;
              }
            }
          }
        });

        this.model.add(scene);
        this.centerModel();
        
        let triangleCount = 0;
        scene.traverse((child) => {
          if (child.isMesh && child.geometry) {
            triangleCount += child.geometry.attributes.position.count / 3;
          }
        });
        console.log(`Model loaded: ${triangleCount.toFixed(0)} triangles`);
        
        if (this.texture) {
          this.applyTexture();
        }
      },
      () => {},
      (error) => {
        this.loadingModel = false;
        console.warn('GLB model not found, using default geometry:', error);
        this.createDefaultModel();
      }
    );
  }

  centerModel() {
    if (!this.model || this.model.children.length === 0) return;
    
    const box = new THREE.Box3().setFromObject(this.model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 4.5 / maxDim;
    
    this.model.scale.set(scale, scale, scale);
    this.model.position.sub(center);
    this.model.position.multiplyScalar(scale);
    
    this.model.traverse((child) => {
      if (child.isMesh) {
        child.rotation.set(0, 0, 0);
      }
    });
  }

  createDefaultModel() {
    if (!this.currentCraft && this.currentCarrier) {
      const carrierFactory = {
        keychain: () => this.createKeychainModel(),
        bag: () => this.createBagModel(),
        phone: () => this.createPhoneModel(),
        sticker: () => this.createStickerModel(),
        magnet: () => this.createMagnetModel()
      };

      if (carrierFactory[this.currentCarrier]) {
        carrierFactory[this.currentCarrier]();
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
    const baseGeometry = new THREE.BoxGeometry(1.6, 1.6, 0.25);
    const baseMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.3,
      metalness: 0.1,
      side: THREE.DoubleSide
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.castShadow = true;
    base.receiveShadow = true;
    base.name = 'texture-target';
    this.model.add(base);

    const ringGeometry = new THREE.TorusGeometry(0.45, 0.06, 16, 32);
    const ringMaterial = new THREE.MeshStandardMaterial({
      color: 0xc99a2e,
      roughness: 0.2,
      metalness: 0.9
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.position.set(0, 0.95, 0);
    ring.castShadow = true;
    this.model.add(ring);

    const chainGeometry = new THREE.TorusGeometry(0.12, 0.04, 8, 16);
    const chainMaterial = new THREE.MeshStandardMaterial({
      color: 0xc99a2e,
      roughness: 0.2,
      metalness: 0.9
    });
    const chainLink1 = new THREE.Mesh(chainGeometry, chainMaterial);
    const chainLink2 = new THREE.Mesh(chainGeometry.clone(), chainMaterial);
    chainLink2.rotation.z = Math.PI / 2;
    const chainGroup = new THREE.Group();
    chainGroup.add(chainLink1);
    chainGroup.add(chainLink2);
    chainGroup.position.set(0, 1.5, 0);
    chainGroup.scale.set(0.8, 0.8, 0.8);
    this.model.add(chainGroup);

    const frameMaterial = new THREE.MeshStandardMaterial({
      color: 0x1f2328,
      roughness: 0.3,
      metalness: 0.8
    });
    const bars = [
      { size: [1.75, 0.08, 0.08], position: [0, 0.84, 0.16] },
      { size: [1.75, 0.08, 0.08], position: [0, -0.84, 0.16] },
      { size: [0.08, 1.75, 0.08], position: [-0.84, 0, 0.16] },
      { size: [0.08, 1.75, 0.08], position: [0.84, 0, 0.16] }
    ];
    bars.forEach((bar) => {
      const frameGeometry = new THREE.BoxGeometry(...bar.size);
      const frame = new THREE.Mesh(frameGeometry, frameMaterial);
      frame.position.set(...bar.position);
      frame.castShadow = true;
      this.model.add(frame);
    });
  }

  createBagModel() {
    const bagGeometry = new THREE.BoxGeometry(3, 2.8, 0.6);
    const bagMaterial = new THREE.MeshStandardMaterial({
      color: 0xf4e5c9,
      roughness: 0.7,
      metalness: 0,
      side: THREE.DoubleSide
    });
    const bag = new THREE.Mesh(bagGeometry, bagMaterial);
    bag.castShadow = true;
    bag.receiveShadow = true;
    this.model.add(bag);

    const pocketGeometry = new THREE.BoxGeometry(1.8, 1.5, 0.08);
    const pocketMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.55,
      metalness: 0,
      side: THREE.DoubleSide
    });
    const pocket = new THREE.Mesh(pocketGeometry, pocketMaterial);
    pocket.position.set(0, -0.25, 0.34);
    pocket.castShadow = true;
    pocket.name = 'texture-target';
    this.model.add(pocket);

    const strapGeometry = new THREE.TorusGeometry(1.05, 0.055, 12, 48, Math.PI);
    const strapMaterial = new THREE.MeshStandardMaterial({
      color: 0x8b7355,
      roughness: 0.6,
      metalness: 0.1
    });
    const strap = new THREE.Mesh(strapGeometry, strapMaterial);
    strap.rotation.x = Math.PI;
    strap.position.set(0, 1.36, -0.2);
    strap.scale.y = 1.25;
    this.model.add(strap);
  }

  createPhoneModel() {
    const phoneGeometry = new THREE.BoxGeometry(1.15, 2.25, 0.2);
    const phoneMaterial = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.2,
      metalness: 0.18
    });
    const phone = new THREE.Mesh(phoneGeometry, phoneMaterial);
    phone.castShadow = true;
    phone.receiveShadow = true;
    this.model.add(phone);

    const caseGeometry = new THREE.BoxGeometry(1.02, 2.02, 0.06);
    const caseMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.2,
      metalness: 0.05
    });
    const phoneCase = new THREE.Mesh(caseGeometry, caseMaterial);
    phoneCase.position.set(0, 0, 0.14);
    phoneCase.name = 'texture-target';
    this.model.add(phoneCase);

    const cameraDotGeometry = new THREE.SphereGeometry(0.05, 16, 16);
    const cameraDotMaterial = new THREE.MeshStandardMaterial({
      color: 0x000000,
      roughness: 0.1,
      metalness: 0.8
    });
    const cameraDot = new THREE.Mesh(cameraDotGeometry, cameraDotMaterial);
    cameraDot.position.set(0.32, 0.82, 0.18);
    this.model.add(cameraDot);
  }

  createStickerModel() {
    const baseGeometry = new THREE.BoxGeometry(2, 2, 0.05);
    const baseMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.1,
      metalness: 0,
      side: THREE.DoubleSide
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.castShadow = true;
    base.receiveShadow = true;
    base.name = 'texture-target';
    this.model.add(base);

    const shadowGeometry = new THREE.BoxGeometry(2.08, 2.08, 0.03);
    const shadowMaterial = new THREE.MeshStandardMaterial({
      color: 0xc99a2e,
      roughness: 0.3,
      metalness: 0.4
    });
    const border = new THREE.Mesh(shadowGeometry, shadowMaterial);
    border.position.set(0, 0, -0.04);
    this.model.add(border);
  }

  createMagnetModel() {
    const baseGeometry = new THREE.BoxGeometry(1.85, 1.45, 0.18);
    const baseMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.3,
      metalness: 0.1,
      side: THREE.DoubleSide
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.castShadow = true;
    base.receiveShadow = true;
    base.name = 'texture-target';
    this.model.add(base);

    const magnetGeometry = new THREE.BoxGeometry(1.55, 1.15, 0.1);
    const magnetMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a5568,
      roughness: 0.5,
      metalness: 0.8
    });
    const magnet = new THREE.Mesh(magnetGeometry, magnetMaterial);
    magnet.position.set(0, 0, -0.16);
    this.model.add(magnet);
  }

  setCarrier(carrier) {
    this.currentCarrier = carrier;
    this.currentCraft = null;
    this.createModel();
    if (this.texture) {
      this.applyTexture();
    }
  }

  setTexture(imageUrl) {
    const loader = new THREE.TextureLoader();
    loader.load(imageUrl, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = true;
      if (this.renderer) {
        texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
      }
      texture.needsUpdate = true;
      if (this.texture) {
        this.texture.dispose();
      }
      this.texture = texture;
      this.applyTexture();
    });
  }

  applyTexture() {
    if (!this.texture || !this.model) return;

    this.model.traverse((child) => {
      if (child.name === 'texture-target' && child.material) {
        const previousMaterial = child.material;
        const material = previousMaterial.clone();
        material.map = this.texture;
        material.map.colorSpace = THREE.SRGBColorSpace;
        material.needsUpdate = true;
        child.material = material;
        this.disposeMaterial(previousMaterial);
      }
    });
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
    this.stopAnimation();
    if (this.model) {
      this.disposeObject(this.model);
    }
    if (this.texture) {
      this.texture.dispose();
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
    object.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        this.disposeMaterial(child.material);
      }
    });
  }

  disposeMaterial(material) {
    const materials = Array.isArray(material) ? material : [material];
    materials.forEach((mat) => {
      if (!mat) return;
      [
        'map',
        'normalMap',
        'roughnessMap',
        'metalnessMap',
        'aoMap',
        'emissiveMap',
        'alphaMap',
        'bumpMap',
        'displacementMap'
      ].forEach((key) => {
        if (mat[key] && mat[key] !== this.texture) mat[key].dispose();
      });
      mat.dispose();
    });
  }

  destroy() {
    this.dispose();
  }
}
