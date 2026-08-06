import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createGLTFLoader } from '../utils/modelLoader.js';

const TARGET_SIZE = 2.35;
const DEFAULT_CAMERA_Z = 4.3;

export class ArtifactStage {
  constructor(container, {
    onLoadingChange = () => {},
    onProgress = () => {},
    onError = () => {}
  } = {}) {
    this.container = container;
    this.onLoadingChange = onLoadingChange;
    this.onProgress = onProgress;
    this.onError = onError;
    this.loader = createGLTFLoader();
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.model = null;
    this.modelBaseY = 0;
    this.visible = false;
    this.motionEnabled = true;
    this.interacting = false;
    this.animationId = 0;
    this.loadToken = 0;
    this.lastTime = 0;
    this.resizeObserver = null;
    this.intersectionObserver = null;
    this.visibilityHandler = null;
  }

  init() {
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 50);
    this.camera.position.set(0, 0.5, DEFAULT_CAMERA_Z);

    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.container.appendChild(this.renderer.domElement);

    const hemisphere = new THREE.HemisphereLight(0xdce8f5, 0x3b211c, 2.4);
    const key = new THREE.DirectionalLight(0xffead0, 5.5);
    key.position.set(3.5, 5, 4);
    const rim = new THREE.DirectionalLight(0xb8c7dd, 3);
    rim.position.set(-4, 2, -3);
    this.scene.add(hemisphere, key, rim);

    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(1.28, 1.48, 0.18, 64),
      new THREE.MeshStandardMaterial({
        color: 0x181a1e,
        roughness: 0.78,
        metalness: 0.18
      })
    );
    pedestal.position.y = -1.36;
    this.scene.add(pedestal);

    const halo = new THREE.Mesh(
      new THREE.CircleGeometry(1.6, 64),
      new THREE.MeshBasicMaterial({
        color: 0xa83b32,
        transparent: true,
        opacity: 0.13,
        depthWrite: false
      })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = -1.255;
    this.scene.add(halo);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.enablePan = false;
    this.controls.minDistance = 2.8;
    this.controls.maxDistance = 6.2;
    this.controls.minPolarAngle = Math.PI * 0.22;
    this.controls.maxPolarAngle = Math.PI * 0.72;
    this.controls.target.set(0, -0.05, 0);
    this.controls.addEventListener('start', () => {
      this.interacting = true;
    });
    this.controls.addEventListener('end', () => {
      this.interacting = false;
    });

    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(this.container);

    this.intersectionObserver = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      if (this.visible) this.startLoop();
      else this.stopLoop();
    }, { threshold: 0.05 });
    this.intersectionObserver.observe(this.container);

    this.visibilityHandler = () => {
      if (document.hidden) this.stopLoop();
      else if (this.visible) this.startLoop();
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
    this.renderOnce();
  }

  setMotionEnabled(enabled) {
    this.motionEnabled = Boolean(enabled);
    if (this.motionEnabled && this.visible) this.startLoop();
    else {
      this.stopLoop();
      this.renderOnce();
    }
  }

  setModel(url) {
    const token = ++this.loadToken;
    this.onLoadingChange(true);
    this.onProgress(0);

    this.loader.load(
      url,
      (gltf) => {
        if (token !== this.loadToken) {
          this.disposeObject(gltf.scene);
          return;
        }

        const nextModel = gltf.scene;
        normalizeObject(nextModel, TARGET_SIZE);
        nextModel.traverse((object) => {
          if (!object.isMesh) return;
          object.castShadow = false;
          object.receiveShadow = false;
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.filter(Boolean).forEach((material) => {
            if ('envMapIntensity' in material) material.envMapIntensity = 1.15;
          });
        });

        if (this.model) {
          this.scene.remove(this.model);
          this.disposeObject(this.model);
        }

        this.model = nextModel;
        this.model.rotation.y = -0.35;
        this.modelBaseY = -0.08;
        this.model.position.y = this.modelBaseY;
        this.scene.add(this.model);
        this.onLoadingChange(false);
        this.onProgress(1);
        this.camera.position.set(0, 0.5, DEFAULT_CAMERA_Z);
        this.controls.target.set(0, -0.05, 0);
        this.controls.update();
        this.renderOnce();
        if (this.visible) this.startLoop();
      },
      (event) => {
        if (!event.total) return;
        this.onProgress(Math.min(1, event.loaded / event.total));
      },
      (error) => {
        if (token !== this.loadToken) return;
        this.onLoadingChange(false);
        this.onError(error);
      }
    );
  }

  startLoop() {
    if (
      this.animationId
      || !this.visible
      || document.hidden
      || !this.motionEnabled
    ) {
      return;
    }

    this.lastTime = performance.now();
    const frame = (now) => {
      if (!this.visible || document.hidden || !this.motionEnabled) {
        this.stopLoop();
        return;
      }

      const delta = Math.min((now - this.lastTime) / 1000, 0.05);
      this.lastTime = now;
      if (this.model && !this.interacting) {
        this.model.rotation.y += delta * 0.28;
        this.model.position.y = this.modelBaseY + Math.sin(now * 0.0011) * 0.045;
      }
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this.animationId = requestAnimationFrame(frame);
    };
    this.animationId = requestAnimationFrame(frame);
  }

  stopLoop() {
    if (!this.animationId) return;
    cancelAnimationFrame(this.animationId);
    this.animationId = 0;
  }

  renderOnce() {
    if (!this.renderer || !this.scene || !this.camera) return;
    this.controls?.update();
    this.renderer.render(this.scene, this.camera);
  }

  onResize() {
    if (!this.renderer || !this.camera) return;
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.renderOnce();
  }

  disposeObject(root) {
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();

    root?.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
      objectMaterials.filter(Boolean).forEach((material) => {
        materials.add(material);
        Object.values(material).forEach((value) => {
          if (value?.isTexture) textures.add(value);
        });
      });
      object.skeleton?.dispose?.();
    });

    textures.forEach((texture) => texture.dispose());
    materials.forEach((material) => material.dispose());
    geometries.forEach((geometry) => geometry.dispose());
  }

  dispose() {
    this.loadToken += 1;
    this.stopLoop();
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    document.removeEventListener('visibilitychange', this.visibilityHandler);
    this.controls?.dispose();
    if (this.model) this.disposeObject(this.model);
    this.scene?.traverse((object) => {
      if (object === this.model) return;
      object.geometry?.dispose?.();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.filter(Boolean).forEach((material) => material.dispose?.());
    });
    this.renderer?.dispose();
    this.renderer?.domElement?.remove();
  }
}

function normalizeObject(object, targetSize) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(maxDimension) || maxDimension <= 0) return;

  const scale = targetSize / maxDimension;
  object.scale.setScalar(scale);
  object.position.copy(center).multiplyScalar(-scale);
  object.updateMatrixWorld(true);
}
