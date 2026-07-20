import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { CRAFTS_DATA } from '../src/utils/craftData.js';
import {
  getHomepageCraftLinks,
  getHomepageCrafts,
  getHomepageCraftIntro,
  getHomepageStageErrorStatus,
  getHomepageStageStatus,
  getInitialHomepageCraft,
  resolveHomepageSelection
} from '../src/home.js';
import {
  ParticleMorphScene,
  createParticleColors,
  createModelAssetCache,
  createPreparedModelCache,
  getCraftParticleProfile,
  getHomeModelRotation,
  getHomeLightingProfile,
  getMorphFrameState,
  getParticleRenderProfile,
  getModelTargetSize,
  getMorphDuration,
  getParticleCount,
  getTransitionPhase,
  getTransitionProfiles,
  getTransitionProgress,
  getInkTransitionPoint,
  getSettledParticleOpacity,
  sampleSurfacePositionsAsync
} from '../src/components/ParticleMorphScene.js';
import { readFileSync } from 'node:fs';
import * as Home from '../src/home.js';

describe('homepage heritage hero', () => {
  it('builds the selector from crafts that have GLB models', () => {
    const homepageCrafts = getHomepageCrafts(CRAFTS_DATA);

    expect(homepageCrafts.length).toBeGreaterThan(0);
    expect(homepageCrafts.every((craft) => Boolean(craft.modelUrl))).toBe(true);
    expect(homepageCrafts.map((craft) => craft.id)).toContain('papercut');
    expect(homepageCrafts.map((craft) => craft.id)).toContain('porcelain');
  });

  it('uses the selected heritage description and story as the hero copy', () => {
    const craft = CRAFTS_DATA.find((item) => item.id === 'porcelain');

    expect(getHomepageCraftIntro(craft)).toEqual({
      name: '景德镇陶瓷',
      category: '传统陶瓷',
      description: craft.description,
      story: craft.story
    });
  });

  it('falls back to porcelain as the museum-style default when a requested craft is missing', () => {
    const initialCraft = getInitialHomepageCraft('missing-id', CRAFTS_DATA);

    expect(initialCraft).toEqual(CRAFTS_DATA.find((craft) => craft.id === 'porcelain'));
  });

  it('builds craft-specific homepage links for the selected craft', () => {
    expect(getHomepageCraftLinks('porcelain')).toEqual({
      craftHref: 'crafts.html?craft=porcelain',
      generatorHref: 'generator.html?craft=porcelain'
    });

    expect(getHomepageCraftLinks('lanterns')).toEqual({
      craftHref: 'crafts.html?craft=lanterns',
      generatorHref: 'generator.html?craft=papercut'
    });
  });

  it('keeps the latest requested craft during rapid selection', () => {
    const crafts = getHomepageCrafts(CRAFTS_DATA);
    const currentCraft = crafts.find((craft) => craft.id === 'tiger-head');
    const requestedCraft = crafts.find((craft) => craft.id === 'porcelain');

    expect(resolveHomepageSelection(currentCraft, requestedCraft)).toEqual({
      nextCraft: requestedCraft,
      shouldUpdate: true
    });

    expect(resolveHomepageSelection(requestedCraft, requestedCraft)).toEqual({
      nextCraft: requestedCraft,
      shouldUpdate: false
    });
  });

  it('builds a museum tour stop for every modeled craft', () => {
    expect(typeof Home.getMuseumTourStops).toBe('function');

    const tourStops = Home.getMuseumTourStops(CRAFTS_DATA);

    expect(tourStops).toHaveLength(18);
    expect(tourStops[0]).toMatchObject({
      index: 0,
      id: 'tiger-head',
      iconUrl: '/assets/generated/craft-icons/tiger-head.png',
      stopLabel: '01'
    });

    const porcelainStop = tourStops.find((stop) => stop.id === 'porcelain');
    expect(porcelainStop).toMatchObject({
      name: '景德镇陶瓷',
      assetKey: 'porcelain',
      museumLine: expect.stringContaining('白如玉'),
      camera: {
        x: expect.any(Number),
        y: expect.any(Number),
        z: expect.any(Number)
      }
    });
    expect(Math.max(...tourStops.map((stop) => Math.abs(stop.camera.x)))).toBeLessThanOrEqual(0.45);
  });

  it('reduces particle count for mobile and reduced-motion users', () => {
    const desktopCount = getParticleCount({ width: 1600, hardwareConcurrency: 12 });
    const mobileCount = getParticleCount({ width: 420, hardwareConcurrency: 4 });
    const reducedCount = getParticleCount({ width: 1400, hardwareConcurrency: 8, reducedMotion: true });

    expect(desktopCount).toBeGreaterThanOrEqual(18000);
    expect(desktopCount).toBeLessThanOrEqual(30000);
    expect(mobileCount).toBeLessThanOrEqual(12000);
    expect(reducedCount).toBeLessThanOrEqual(5000);
    expect(desktopCount).toBeGreaterThan(mobileCount);
    expect(mobileCount).toBeGreaterThan(reducedCount);
  });

  it('uses a smaller GLB target size on narrow screens', () => {
    expect(getModelTargetSize(390)).toBeLessThan(getModelTargetSize(1280));
  });

  it('reuses a single in-flight model request across rapid selections', async () => {
    let loadCount = 0;
    const cache = createModelAssetCache(async (url) => {
      loadCount += 1;
      return { url };
    });

    const [first, second] = await Promise.all([
      cache.load('/models/porcelain.glb'),
      cache.load('/models/porcelain.glb')
    ]);

    expect(loadCount).toBe(1);
    expect(first).toEqual(second);
  });

  it('bounds decoded GLB retention while keeping recently reused assets hot', async () => {
    const evicted = [];
    const cache = createModelAssetCache(
      async (url) => ({ url }),
      {
        maxEntries: 2,
        onEvict: (url) => evicted.push(url)
      }
    );

    await cache.load('/models/a.glb');
    await cache.load('/models/b.glb');
    await cache.load('/models/a.glb');
    await cache.load('/models/c.glb');

    expect(cache.has('/models/a.glb')).toBe(true);
    expect(cache.has('/models/b.glb')).toBe(false);
    expect(cache.has('/models/c.glb')).toBe(true);
    expect(evicted).toEqual(['/models/b.glb']);
  });

  it('allows a transient GLB load failure to retry on the next selection', async () => {
    let attempts = 0;
    const cache = createModelAssetCache(async (url) => {
      attempts += 1;
      if (attempts === 1) throw new Error('temporary network failure');
      return { url };
    });

    await expect(cache.load('/models/retry.glb')).rejects.toThrow('temporary network failure');
    await expect(cache.load('/models/retry.glb')).resolves.toEqual({ url: '/models/retry.glb' });
    expect(attempts).toBe(2);
  });

  it('commits only the latest A-to-B-to-A selection when an older A request resolves', async () => {
    const deferred = new Map();
    const getDeferred = (url) => {
      if (!deferred.has(url)) {
        let resolve;
        const promise = new Promise((done) => { resolve = done; });
        deferred.set(url, { promise, resolve });
      }
      return deferred.get(url);
    };
    const container = {
      clientWidth: 1200,
      classList: { toggle: vi.fn() }
    };
    const scene = new ParticleMorphScene(container);
    scene.positions = new Float32Array(6);
    scene.modelAssets = { load: (url) => getDeferred(url).promise };
    scene.preparedModels = {
      get: (_url, model) => ({ model, positions: new Float32Array(6) }),
      values: () => []
    };
    scene.focusMuseumStop = vi.fn();
    scene.updateParticleColors = vi.fn();
    scene.beginInkRelease = vi.fn();
    scene.setLoading = vi.fn();
    scene.replaceSolidModel = vi.fn();
    scene.startMorph = vi.fn((_positions, complete) => complete());

    const craftA = { id: 'porcelain', modelUrl: '/models/a.glb' };
    const craftB = { id: 'embroidery', modelUrl: '/models/b.glb' };
    const firstA = scene.setCraft(craftA);
    const middleB = scene.setCraft(craftB);
    const latestA = scene.setCraft(craftA);

    getDeferred(craftA.modelUrl).resolve({ scene: { id: 'latest-a' } });
    await Promise.all([firstA, latestA]);
    expect(scene.replaceSolidModel).toHaveBeenCalledTimes(1);
    expect(scene.replaceSolidModel).toHaveBeenLastCalledWith({ id: 'latest-a' });

    getDeferred(craftB.modelUrl).resolve({ scene: { id: 'stale-b' } });
    await middleB;
    expect(scene.replaceSolidModel).toHaveBeenCalledTimes(1);
  });

  it('keeps the particle fallback but rejects and reports a current GLB load failure', async () => {
    const failure = new Error('broken GLB');
    const container = {
      clientWidth: 1200,
      classList: { toggle: vi.fn() }
    };
    const scene = new ParticleMorphScene(container);
    scene.positions = new Float32Array(6);
    scene.modelAssets = { load: vi.fn().mockRejectedValue(failure) };
    scene.focusMuseumStop = vi.fn();
    scene.updateParticleColors = vi.fn();
    scene.beginInkRelease = vi.fn();
    scene.setLoading = vi.fn();
    scene.startMorph = vi.fn((_positions, complete) => complete());
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(scene.setCraft({ id: 'porcelain', modelUrl: '/models/broken.glb' }))
      .rejects.toBe(failure);

    expect(scene.startMorph).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to load heritage model:',
      expect.objectContaining({ craftId: 'porcelain', url: '/models/broken.glb', error: failure })
    );
    errorSpy.mockRestore();
  });

  it('time-slices model point sampling instead of blocking one synchronous task', async () => {
    const model = new THREE.Group();
    model.add(new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    ));
    let returnedToCaller = false;
    const scheduler = vi.fn(() => Promise.resolve().then(() => {
      expect(returnedToCaller).toBe(true);
    }));

    const sampling = sampleSurfacePositionsAsync(model, 12, {
      chunkSize: 3,
      random: () => 0.5,
      scheduler
    });
    returnedToCaller = true;
    const positions = await sampling;

    expect(scheduler).toHaveBeenCalledTimes(3);
    expect(positions).toBeInstanceOf(Float32Array);
    expect(positions).toHaveLength(36);
    expect(Array.from(positions).every(Number.isFinite)).toBe(true);
  });

  it('keeps transition particles craft-toned instead of adding a cyan veil', () => {
    const colors = createParticleColors(28, new THREE.Color('#d3382f'));

    for (let index = 0; index < colors.length; index += 3) {
      expect(colors[index]).toBeGreaterThanOrEqual(colors[index + 2]);
    }
  });

  it('lets Three.js inject the vertex-color attribute exactly once', () => {
    const source = readFileSync(new URL('../src/components/ParticleMorphScene.js', import.meta.url), 'utf8');

    expect(source).not.toContain('attribute vec3 color;');
    expect(source).toContain('vertexColors: true');
  });

  it('renders distinct soft particles instead of one overexposed glowing block', () => {
    const profile = getParticleRenderProfile();

    expect(profile.screenScale).toBeLessThanOrEqual(16);
    expect(profile.releaseOpacity).toBeLessThanOrEqual(0.5);
    expect(profile.arrivalOpacity).toBeLessThan(profile.releaseOpacity);
  });

  it('fades transition particles monotonically through the reveal tail', () => {
    const samples = [0.82, 0.9, 0.99, 1].map((progress) => getMorphFrameState(progress));

    expect(samples.map((sample) => sample.particleOpacity)).toEqual(
      [...samples.map((sample) => sample.particleOpacity)].sort((a, b) => b - a)
    );
    expect(samples.every((sample) => sample.particleOpacity >= 0 && sample.particleOpacity <= 0.5)).toBe(true);
    expect(samples.at(-1).solidOpacity).toBe(1);
  });

  it('uses a defined GLSL smoothstep edge order for round particle falloff', () => {
    const source = readFileSync(new URL('../src/components/ParticleMorphScene.js', import.meta.url), 'utf8');

    expect(source).toContain('1.0 - smoothstep(0.08, 0.5, length(centered))');
    expect(source).not.toContain('smoothstep(0.5, 0.08');
  });

  it('keeps normal morphs concise while preserving reduced-motion behavior', () => {
    expect(getMorphDuration(false)).toBeLessThanOrEqual(1200);
    expect(getMorphDuration(true)).toBeLessThan(getMorphDuration(false));
  });

  it('maps crafts to bounded material particle families', () => {
    expect(getCraftParticleProfile('papercut')).toMatchObject({ family: 'paper' });
    expect(getCraftParticleProfile('embroidery')).toMatchObject({ family: 'textile' });
    expect(getCraftParticleProfile('porcelain')).toMatchObject({ family: 'mineral' });
    expect(getCraftParticleProfile('calligraphy')).toMatchObject({ family: 'ink' });
    expect(getCraftParticleProfile('wood-carving')).toMatchObject({ family: 'earth' });
    expect(getCraftParticleProfile('tangka')).toMatchObject({ family: 'pigment' });
  });

  it('uses a four-stage ink-flow transition timeline', () => {
    expect(getTransitionPhase(0.1)).toBe('release');
    expect(getTransitionPhase(0.35)).toBe('bridge');
    expect(getTransitionPhase(0.7)).toBe('arrival');
    expect(getTransitionPhase(0.95)).toBe('reveal');
  });

  it('does not build the hard rectangular museum back wall', () => {
    const source = readFileSync(new URL('../src/components/ParticleMorphScene.js', import.meta.url), 'utf8');
    expect(source).not.toContain('const backWall = new THREE.Mesh');
  });

  it('keeps the solid model stage free of decorative geometry so particles own the transition', () => {
    const source = readFileSync(new URL('../src/components/ParticleMorphScene.js', import.meta.url), 'utf8');

    expect(source).not.toContain('new THREE.TorusGeometry');
    expect(source).not.toContain('this.ringGroup');
  });

  it('desaturates the illustrated backdrop instead of casting cyan over the model stage', () => {
    const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');

    expect(css).toContain('body.home-shell .app::before');
    expect(css).toContain('filter: grayscale(1) sepia(0.45) saturate(0.55) brightness(0.42) contrast(1.06);');
    expect(css).toContain('.museum-progress-rail::before');
  });

  it('uses particles for transitions without a horizontal scan band', () => {
    const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
    const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');

    expect(html).not.toContain('home-scanline');
    expect(css).not.toContain('.home-scanline');
  });

  it('supports an immediate release segment and a later arrival segment', () => {
    expect(getTransitionProgress(270, 540, 0, 0.5)).toBeCloseTo(0.25, 2);
    expect(getTransitionProgress(270, 540, 0.5, 1)).toBeCloseTo(0.75, 2);
    expect(getTransitionProgress(900, 540, 0, 0.5)).toBe(0.5);
  });

  it('does not recolor authored GLB materials with cyan emissive light', () => {
    const source = readFileSync(new URL('../src/components/ParticleMorphScene.js', import.meta.url), 'utf8');
    expect(source).not.toContain('clone.emissive.copy(accent).lerp(CYAN');
  });

  it('uses truthful stage copy for transforming and settled states', () => {
    expect(getHomepageStageStatus(true)).toEqual({ label: '墨流转化', value: '化生中' });
    expect(getHomepageStageStatus(false)).toEqual({ label: '数字入藏', value: '已完成' });
    expect(getHomepageStageErrorStatus()).toEqual({ label: '模型载入失败', value: '请重试' });
  });

  it('front-aligns locally side-facing textile assets', () => {
    expect(getHomeModelRotation('tangka')).toBeCloseTo(Math.PI / 2, 4);
    expect(getHomeModelRotation('embroidery')).toBeCloseTo(-Math.PI / 2, 4);
    expect(getHomeModelRotation('porcelain')).toBe(0);
  });

  it('samples the visible in-flight particle position before an interruption', () => {
    const point = getInkTransitionPoint(
      [0, 0, 0],
      [4, 2, 0],
      [2, 3, 0],
      0.7,
      getCraftParticleProfile('embroidery')
    );

    expect(point[0]).toBeGreaterThan(1);
    expect(point[0]).toBeLessThan(4.5);
    expect(point).not.toEqual([0, 0, 0]);
  });

  it('uses the same stable seed formula for CPU interruption capture as the shader', () => {
    const profile = getCraftParticleProfile('papercut');
    const args = [[1, 2, 3], [4, 5, 6], [2, 4, 3], 0.63, profile];
    expect(getInkTransitionPoint(...args)).toEqual(getInkTransitionPoint(...args));
  });

  it('uses outgoing material for release and incoming material for arrival', () => {
    const profiles = getTransitionProfiles('papercut', 'embroidery');
    expect(profiles.release.family).toBe('paper');
    expect(profiles.arrival.family).toBe('textile');
  });

  it('prepares one stable scene instance per cached model URL', () => {
    let prepareCount = 0;
    const cache = createPreparedModelCache((scene) => {
      prepareCount += 1;
      return { model: scene, positions: new Float32Array([1, 2, 3]) };
    });
    const scene = { id: 'porcelain-scene' };

    const first = cache.get('/models/porcelain.glb', scene);
    const second = cache.get('/models/porcelain.glb', { id: 'replacement-scene' });

    expect(second).toBe(first);
    expect(second.model).toBe(scene);
    expect(prepareCount).toBe(1);
  });

  it('keeps only a bounded working set of prepared heavyweight models', () => {
    const evicted = [];
    const cache = createPreparedModelCache(
      (scene) => ({ model: scene, positions: new Float32Array([1, 2, 3]) }),
      {
        maxEntries: 2,
        onEvict: (url) => evicted.push(url)
      }
    );

    cache.get('/models/a.glb', { id: 'a' });
    cache.get('/models/b.glb', { id: 'b' });
    cache.get('/models/a.glb', { id: 'a-reload' });
    cache.get('/models/c.glb', { id: 'c' });

    expect(cache.has('/models/a.glb')).toBe(true);
    expect(cache.has('/models/b.glb')).toBe(false);
    expect(cache.has('/models/c.glb')).toBe(true);
    expect(evicted).toEqual(['/models/b.glb']);
  });

  it('removes transition particles completely after the solid artifact settles', () => {
    expect(getSettledParticleOpacity()).toBe(0);
  });

  it('uses restrained museum lighting that does not wash out porcelain detail', () => {
    const lighting = getHomeLightingProfile();
    expect(lighting.ambient).toBeLessThanOrEqual(0.3);
    expect(lighting.key).toBeLessThanOrEqual(1);
    expect(lighting.spot).toBeLessThanOrEqual(2);
  });
});
