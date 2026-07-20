import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ThreeScene,
  getPrintPixelAlpha,
  removeConnectedLightBackground
} from '../src/components/ThreeScene.js';

function createBareScene(carrier = 'keychain') {
  const scene = new ThreeScene({});
  scene.scene = new THREE.Scene();
  scene.model = new THREE.Group();
  scene.scene.add(scene.model);
  scene.currentCarrier = carrier;
  return scene;
}

function getCarrierParts(scene) {
  const bodies = [];
  const printSurfaces = [];

  scene.model.traverse((child) => {
    if (child.userData?.isCarrierBody) bodies.push(child);
    if (child.userData?.isPrintSurface) printSurfaces.push(child);
  });

  return { bodies, printSurfaces };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('realistic product carrier contract', () => {
  it('removes a neutral white generation background while preserving colored artwork', () => {
    expect(getPrintPixelAlpha(252, 250, 246, 255)).toBe(0);
    expect(getPrintPixelAlpha(230, 82, 44, 255)).toBe(255);
    expect(getPrintPixelAlpha(15, 35, 55, 220)).toBe(220);
  });

  it('preserves enclosed white artwork while removing only edge-connected light background', () => {
    const width = 5;
    const height = 5;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let index = 0; index < width * height; index += 1) {
      pixels.set([250, 249, 246, 255], index * 4);
    }
    const coloredRing = [
      [2, 1], [1, 2], [3, 2], [2, 3],
      [1, 1], [3, 1], [1, 3], [3, 3]
    ];
    coloredRing.forEach(([x, y]) => pixels.set([190, 32, 45, 255], (y * width + x) * 4));

    removeConnectedLightBackground(pixels, width, height);

    expect(pixels[3]).toBe(0);
    expect(pixels[((2 * width + 2) * 4) + 3]).toBe(255);
  });

  it.each(['keychain', 'bag', 'phone', 'sticker', 'magnet', 'figurine'])(
    'builds %s from a dimensional silhouette with its own print surface',
    (carrier) => {
      const scene = createBareScene(carrier);

      scene.createDefaultModel();

      const { bodies, printSurfaces } = getCarrierParts(scene);
      expect(bodies.length).toBeGreaterThan(0);
      expect(bodies.every((body) => body.geometry.type !== 'BoxGeometry')).toBe(true);
      expect(printSurfaces).toHaveLength(1);
      expect(printSurfaces[0].name).toBe(`${carrier}-print-surface`);
      expect(printSurfaces[0].material.transparent).toBe(true);
      expect(printSurfaces[0].material.opacity).toBe(0);
      expect(printSurfaces[0].visible).toBe(false);
    }
  );

  it.each(['keychain', 'bag', 'phone', 'sticker', 'magnet', 'figurine'])(
    'frames the %s carrier consistently in the product stage',
    (carrier) => {
      const scene = createBareScene(carrier);
      scene.createDefaultModel();
      const size = new THREE.Box3().setFromObject(scene.model).getSize(new THREE.Vector3());

      expect(Math.max(size.x, size.y, size.z)).toBeCloseTo(4.5, 3);
    }
  );

  it('gives the figurine placeholder a readable full-body 3D silhouette', () => {
    const scene = createBareScene('figurine');

    scene.createDefaultModel();

    const meshes = [];
    scene.model.traverse((child) => {
      if (child.isMesh) meshes.push(child);
    });
    const bounds = new THREE.Box3().setFromObject(scene.model);
    const size = bounds.getSize(new THREE.Vector3());

    expect(meshes.length).toBeGreaterThanOrEqual(7);
    expect(size.y).toBeGreaterThan(size.x);
    expect(size.z).toBeGreaterThan(0.5);
  });

  it.each(['keychain', 'bag', 'phone', 'sticker', 'magnet', 'figurine'])(
    'normalizes the %s print UVs so artwork fills the full decal',
    (carrier) => {
      const scene = createBareScene(carrier);
      scene.createDefaultModel();
      const { printSurfaces } = getCarrierParts(scene);
      const uv = printSurfaces[0].geometry.getAttribute('uv');
      const uValues = [];
      const vValues = [];

      for (let index = 0; index < uv.count; index += 1) {
        uValues.push(uv.getX(index));
        vValues.push(uv.getY(index));
      }

      expect(Math.min(...uValues)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...uValues)).toBeLessThanOrEqual(1);
      expect(Math.max(...uValues) - Math.min(...uValues)).toBeCloseTo(1);
      expect(Math.min(...vValues)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...vValues)).toBeLessThanOrEqual(1);
      expect(Math.max(...vValues) - Math.min(...vValues)).toBeCloseTo(1);
    }
  );

  it('keeps the figurine print surface fully supported by the placeholder body', () => {
    const scene = createBareScene('figurine');
    scene.createDefaultModel();
    const { bodies, printSurfaces } = getCarrierParts(scene);
    const bodyBounds = new THREE.Box3();
    bodies.forEach((body) => bodyBounds.union(new THREE.Box3().setFromObject(body)));
    const printBounds = new THREE.Box3().setFromObject(printSurfaces[0]);

    expect(bodyBounds.containsBox(printBounds)).toBe(true);
  });

  it('applies generated artwork only to the decal and preserves the carrier material', () => {
    const scene = createBareScene('bag');
    scene.createDefaultModel();
    const { bodies, printSurfaces } = getCarrierParts(scene);
    const bodyMaterial = bodies[0].material;
    const originalPrintMaterial = printSurfaces[0].material;
    const texture = new THREE.Texture();
    scene.texture = texture;

    scene.applyTexture();

    expect(bodies[0].material).toBe(bodyMaterial);
    expect(bodies[0].material.map).toBeNull();
    expect(printSurfaces[0].material).not.toBe(originalPrintMaterial);
    expect(printSurfaces[0].material.map).toBe(texture);
    expect(printSurfaces[0].material.opacity).toBe(1);
    expect(printSurfaces[0].visible).toBe(true);
  });

  it('supports material arrays on print surfaces without mutating the originals', () => {
    const scene = createBareScene();
    const first = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const second = new THREE.MeshStandardMaterial({ color: 0xf7f1e7 });
    const printSurface = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), [first, second]);
    printSurface.name = 'custom-print-surface';
    printSurface.userData.isPrintSurface = true;
    scene.model.add(printSurface);
    scene.texture = new THREE.Texture();

    scene.applyTexture();

    expect(printSurface.material).toHaveLength(2);
    expect(printSurface.material[0]).not.toBe(first);
    expect(printSurface.material[1]).not.toBe(second);
    expect(printSurface.material.every((material) => material.map === scene.texture)).toBe(true);
  });

  it('does not dispose a decal source material that is still shared by the carrier body', () => {
    const scene = createBareScene();
    const sharedMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const body = new THREE.Mesh(new THREE.SphereGeometry(1), sharedMaterial);
    body.userData.isCarrierBody = true;
    const printSurface = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), sharedMaterial);
    printSurface.userData.isPrintSurface = true;
    scene.model.add(body, printSurface);
    scene.texture = new THREE.Texture();
    const materialDispose = vi.spyOn(sharedMaterial, 'dispose');

    scene.applyTexture();

    expect(body.material).toBe(sharedMaterial);
    expect(materialDispose).not.toHaveBeenCalled();
  });

  it('reapplies the current artwork when switching to a different carrier', () => {
    const scene = createBareScene('bag');
    const texture = new THREE.Texture();
    scene.texture = texture;

    scene.setCarrier('phone');

    const { printSurfaces } = getCarrierParts(scene);
    expect(printSurfaces).toHaveLength(1);
    expect(printSurfaces[0].material.map).toBe(texture);
  });

  it('uses a centered crop on tall carriers instead of stretching square artwork', () => {
    const scene = createBareScene('phone');
    scene.createDefaultModel();
    const { printSurfaces } = getCarrierParts(scene);
    const printBounds = new THREE.Box3().setFromObject(printSurfaces[0]);
    const printSize = printBounds.getSize(new THREE.Vector3());
    const texture = new THREE.Texture({ width: 1024, height: 1024 });
    scene.texture = texture;

    scene.applyTexture();

    const sampledImageAspect = (1024 / 1024) * (texture.repeat.x / texture.repeat.y);
    expect(sampledImageAspect).toBeCloseTo(printSize.x / printSize.y, 4);
    expect(texture.offset.x).toBeCloseTo((1 - texture.repeat.x) / 2, 4);
    expect(texture.offset.y).toBeCloseTo((1 - texture.repeat.y) / 2, 4);
  });

  it('clears the decal and invalidates an unfinished texture request without touching the carrier', () => {
    const callbacks = [];
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation((url, onLoad) => {
      callbacks.push({ url, onLoad });
      return new THREE.Texture();
    });
    const scene = createBareScene('magnet');
    scene.createDefaultModel();
    const { bodies, printSurfaces } = getCarrierParts(scene);
    const bodyMaterial = bodies[0].material;
    const currentTexture = new THREE.Texture();
    const currentDispose = vi.spyOn(currentTexture, 'dispose');
    scene.texture = currentTexture;
    scene.applyTexture();
    scene.setTexture('/pending.png');

    scene.clearTexture();
    const lateTexture = new THREE.Texture();
    const lateDispose = vi.spyOn(lateTexture, 'dispose');
    callbacks[0].onLoad(lateTexture);

    expect(scene.texture).toBeNull();
    expect(printSurfaces[0].material.map).toBeNull();
    expect(printSurfaces[0].material.opacity).toBe(0);
    expect(printSurfaces[0].visible).toBe(false);
    expect(bodies[0].material).toBe(bodyMaterial);
    expect(currentDispose).toHaveBeenCalledOnce();
    expect(lateDispose).toHaveBeenCalledOnce();
  });
});

describe('downloadable product GLB contract', () => {
  it('exports the visible product and its applied artwork as a binary GLB', async () => {
    const scene = createBareScene('magnet');
    scene.createDefaultModel();
    scene.texture = new THREE.Texture();
    scene.applyTexture();
    const binary = new Uint8Array([0x67, 0x6c, 0x54, 0x46]).buffer;
    const exporter = {
      parseAsync: vi.fn().mockResolvedValue(binary)
    };

    const blob = await scene.exportCurrentModel(exporter);

    const [exportedModel, exportOptions] = exporter.parseAsync.mock.calls[0];
    const exportSize = new THREE.Box3().setFromObject(exportedModel).getSize(new THREE.Vector3());
    expect(exportedModel).not.toBe(scene.model);
    expect(Math.max(exportSize.x, exportSize.y, exportSize.z)).toBeCloseTo(0.075, 4);
    expect(exportOptions).toEqual({
      binary: true,
      onlyVisible: true,
      trs: true,
      maxTextureSize: 2048
    });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('model/gltf-binary');
    expect(blob.size).toBe(binary.byteLength);
  });

  it('refuses to export a product before generated artwork is applied', async () => {
    const scene = createBareScene('bag');
    scene.createDefaultModel();

    await expect(scene.exportCurrentModel({ parseAsync: vi.fn() }))
      .rejects.toThrow('Generated artwork has not finished loading');
  });
});

describe('asynchronous asset replacement contract', () => {
  it('ignores and disposes a stale GLB callback after a newer model request wins', () => {
    const pending = [];
    const scene = createBareScene();
    scene.gltfLoader = {
      load: (url, onLoad, _onProgress, onError) => pending.push({ url, onLoad, onError })
    };

    scene.createModel('/old.glb');
    scene.createModel('/new.glb');

    const oldGeometry = new THREE.SphereGeometry(1);
    const oldMaterial = new THREE.MeshStandardMaterial();
    const oldDispose = vi.spyOn(oldGeometry, 'dispose');
    const staleRoot = new THREE.Group();
    staleRoot.add(new THREE.Mesh(oldGeometry, oldMaterial));
    const freshRoot = new THREE.Group();
    freshRoot.name = 'fresh-model';

    pending.find((request) => request.url === '/new.glb').onLoad({ scene: freshRoot });
    pending.find((request) => request.url === '/old.glb').onLoad({ scene: staleRoot });

    expect(scene.model.children).toEqual([freshRoot]);
    expect(oldDispose).toHaveBeenCalledOnce();
    expect(scene.loadingModel).toBe(false);
  });

  it('settles texture promises while keeping the latest callback result', async () => {
    const callbacks = [];
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation((url, onLoad) => {
      callbacks.push({ url, onLoad });
      return new THREE.Texture();
    });
    const scene = createBareScene('magnet');
    scene.createDefaultModel();
    const oldPromise = scene.setTexture('/old.png');
    const newPromise = scene.setTexture('/new.png');
    const staleTexture = new THREE.Texture();
    const staleDispose = vi.spyOn(staleTexture, 'dispose');
    const freshTexture = new THREE.Texture();

    callbacks.find((request) => request.url === '/new.png').onLoad(freshTexture);
    callbacks.find((request) => request.url === '/old.png').onLoad(staleTexture);

    await expect(oldPromise).resolves.toEqual({ status: 'stale', url: '/old.png' });
    await expect(newPromise).resolves.toEqual({ status: 'loaded', url: '/new.png' });
    expect(scene.texture).toBe(freshTexture);
    expect(staleDispose).toHaveBeenCalledOnce();
  });

  it('resolves the generated-model promise only after the GLB enters the scene', async () => {
    const scene = createBareScene('figurine');
    const pending = [];
    scene.gltfLoader = {
      load: (url, onLoad, _onProgress, onError) => pending.push({ url, onLoad, onError })
    };

    const resultPromise = scene.setGeneratedModel('/generated/figurine.glb');
    let settled = false;
    resultPromise.finally(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.MeshStandardMaterial()));
    pending[0].onLoad({ scene: root });

    await expect(resultPromise).resolves.toEqual({
      status: 'loaded',
      url: '/generated/figurine.glb'
    });
    expect(scene.currentModelUrl).toBe('/generated/figurine.glb');
  });

  it('rejects the generated-model promise after an active GLB load fails', async () => {
    const pending = [];
    const scene = createBareScene('figurine');
    scene.gltfLoader = {
      load: (url, onLoad, _onProgress, onError) => pending.push({ url, onLoad, onError })
    };
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const resultPromise = scene.setGeneratedModel('/broken-generated.glb');
    const rejection = expect(resultPromise).rejects.toThrow('Generated GLB failed to load');
    pending[0].onError(new Error('network failed'));

    await rejection;
  });

  it('settles a generated-model promise as stale when a newer model replaces it', async () => {
    const pending = [];
    const scene = createBareScene('figurine');
    scene.gltfLoader = {
      load: (url, onLoad, _onProgress, onError) => pending.push({ url, onLoad, onError })
    };

    const resultPromise = scene.setGeneratedModel('/superseded.glb');
    scene.setCarrier('magnet');

    await expect(resultPromise).resolves.toEqual({
      status: 'stale',
      url: '/superseded.glb'
    });
  });

  it('restores the figurine placeholder when a new reference image supersedes a generated GLB', async () => {
    const pending = [];
    const scene = createBareScene('figurine');
    scene.gltfLoader = {
      load: (url, onLoad, _onProgress, onError) => pending.push({ url, onLoad, onError })
    };
    const resultPromise = scene.setGeneratedModel('/generated/old.glb');

    scene.clearGeneratedModel();

    await expect(resultPromise).resolves.toMatchObject({ status: 'stale' });
    expect(scene.currentModelUrl).toBeNull();
    expect(scene.currentCarrier).toBe('figurine');
    expect(scene.model.children.length).toBeGreaterThan(0);
  });

  it('reapplies the current artwork when an active GLB request falls back to a carrier', () => {
    const pending = [];
    const scene = createBareScene('figurine');
    scene.texture = new THREE.Texture();
    scene.gltfLoader = {
      load: (url, onLoad, _onProgress, onError) => pending.push({ url, onLoad, onError })
    };
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    scene.createModel('/broken.glb');
    pending[0].onError(new Error('broken'));

    const { printSurfaces } = getCarrierParts(scene);
    expect(printSurfaces).toHaveLength(1);
    expect(printSurfaces[0].material.map).toBe(scene.texture);
    expect(scene.loadingModel).toBe(false);
  });

  it('does not let a stale GLB error replace a newer in-flight model request', () => {
    const pending = [];
    const scene = createBareScene('figurine');
    scene.gltfLoader = {
      load: (url, onLoad, _onProgress, onError) => pending.push({ url, onLoad, onError })
    };

    scene.createModel('/old.glb');
    scene.createModel('/new.glb');
    pending.find((request) => request.url === '/old.glb').onError(new Error('stale failure'));

    expect(scene.currentModelUrl).toBe('/new.glb');
    expect(scene.loadingModel).toBe(true);
    expect(scene.model.children).toHaveLength(0);
  });

  it('preserves authored GLB double-sided and alpha material semantics', () => {
    const pending = [];
    const scene = createBareScene();
    scene.gltfLoader = {
      load: (url, onLoad) => pending.push({ url, onLoad })
    };
    const material = new THREE.MeshStandardMaterial({
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      alphaTest: 0.42,
      polygonOffset: false
    });
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material));

    scene.createModel('/authored.glb');
    pending[0].onLoad({ scene: root });

    expect(material.side).toBe(THREE.DoubleSide);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.alphaTest).toBeCloseTo(0.42);
    expect(material.polygonOffset).toBe(false);
  });

  it('centers imported GLBs without destroying authored child rotations', () => {
    const scene = createBareScene();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial());
    mesh.rotation.set(0.2, 0.7, -0.3);
    scene.model.add(mesh);

    scene.centerModel();

    expect(mesh.rotation.x).toBeCloseTo(0.2);
    expect(mesh.rotation.y).toBeCloseTo(0.7);
    expect(mesh.rotation.z).toBeCloseTo(-0.3);
  });

  it('invalidates pending model and texture callbacks when the scene is disposed', () => {
    const modelRequests = [];
    const textureRequests = [];
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation((url, onLoad) => {
      textureRequests.push({ url, onLoad });
      return new THREE.Texture();
    });
    const scene = createBareScene();
    scene.gltfLoader = {
      load: (url, onLoad) => modelRequests.push({ url, onLoad })
    };
    scene.createModel('/late.glb');
    scene.setTexture('/late.png');
    scene.dispose();
    const lateGeometry = new THREE.SphereGeometry(1);
    const lateGeometryDispose = vi.spyOn(lateGeometry, 'dispose');
    const lateRoot = new THREE.Group();
    lateRoot.add(new THREE.Mesh(lateGeometry, new THREE.MeshStandardMaterial()));
    const lateTexture = new THREE.Texture();
    const lateTextureDispose = vi.spyOn(lateTexture, 'dispose');

    modelRequests[0].onLoad({ scene: lateRoot });
    textureRequests[0].onLoad(lateTexture);

    expect(lateGeometryDispose).toHaveBeenCalledOnce();
    expect(lateTextureDispose).toHaveBeenCalledOnce();
    expect(scene.texture).toBeNull();
  });
});

describe('resource disposal contract', () => {
  it('disposes shared geometry, material and texture resources only once', () => {
    const scene = createBareScene();
    const root = new THREE.Group();
    const geometry = new THREE.SphereGeometry(1);
    const texture = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ map: texture });
    root.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');
    const textureDispose = vi.spyOn(texture, 'dispose');

    scene.disposeObject(root);

    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(textureDispose).toHaveBeenCalledOnce();
  });

  it('releases controls and the PMREM environment target on scene disposal', () => {
    const scene = createBareScene();
    const controlsDispose = vi.fn();
    const environmentDispose = vi.fn();
    scene.controls = { dispose: controlsDispose };
    scene.environmentTarget = { dispose: environmentDispose };
    scene.scene.environment = new THREE.Texture();

    scene.dispose();

    expect(controlsDispose).toHaveBeenCalledOnce();
    expect(environmentDispose).toHaveBeenCalledOnce();
    expect(scene.scene.environment).toBeNull();
  });

  it('disposes physical-material texture slots that are not part of the legacy map list', () => {
    const scene = createBareScene();
    const clearcoatMap = new THREE.Texture();
    const transmissionMap = new THREE.Texture();
    const material = new THREE.MeshPhysicalMaterial({ clearcoatMap, transmissionMap });
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.SphereGeometry(1), material));
    const clearcoatDispose = vi.spyOn(clearcoatMap, 'dispose');
    const transmissionDispose = vi.spyOn(transmissionMap, 'dispose');

    scene.disposeObject(root);

    expect(clearcoatDispose).toHaveBeenCalledOnce();
    expect(transmissionDispose).toHaveBeenCalledOnce();
  });

  it('disposes orphaned decal textures but preserves textures still used by the carrier', () => {
    const scene = createBareScene();
    const orphanedBaseMap = new THREE.Texture();
    const sharedRoughnessMap = new THREE.Texture();
    const printMaterial = new THREE.MeshStandardMaterial({
      map: orphanedBaseMap,
      roughnessMap: sharedRoughnessMap
    });
    const bodyMaterial = new THREE.MeshStandardMaterial({ roughnessMap: sharedRoughnessMap });
    const printSurface = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), printMaterial);
    printSurface.userData.isPrintSurface = true;
    const body = new THREE.Mesh(new THREE.SphereGeometry(1), bodyMaterial);
    body.userData.isCarrierBody = true;
    scene.model.add(body, printSurface);
    scene.texture = new THREE.Texture();
    const orphanedDispose = vi.spyOn(orphanedBaseMap, 'dispose');
    const sharedDispose = vi.spyOn(sharedRoughnessMap, 'dispose');

    scene.applyTexture();

    expect(orphanedDispose).toHaveBeenCalledOnce();
    expect(sharedDispose).not.toHaveBeenCalled();
  });

  it('disposes skeleton GPU resources from generated skinned GLBs', () => {
    const scene = createBareScene();
    const root = new THREE.Group();
    const skinnedMesh = new THREE.SkinnedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial()
    );
    const bone = new THREE.Bone();
    skinnedMesh.add(bone);
    skinnedMesh.bind(new THREE.Skeleton([bone]));
    root.add(skinnedMesh);
    const skeletonDispose = vi.spyOn(skinnedMesh.skeleton, 'dispose');

    scene.disposeObject(root);

    expect(skeletonDispose).toHaveBeenCalledOnce();
  });
});
