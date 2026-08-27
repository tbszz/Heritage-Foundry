import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  getMuseumRenderBudget,
  getMuseumTextureFallbackColors,
  loadManagedMuseumTexture
} from '../src/utils/museumTexture.js';

describe('museum texture fallback', () => {
  it('uses material-specific fallback colors instead of black canvases', () => {
    expect(getMuseumTextureFallbackColors('wall-cloud')).toMatchObject({
      base: expect.not.stringMatching(/^#0{3,6}$/i),
      accent: expect.any(String)
    });
    expect(getMuseumTextureFallbackColors('red-lacquer').base).not.toBe('#000000');
  });

  it('routes both museum scenes through the shared managed texture loader', () => {
    const sketchSource = readFileSync(new URL('../src/components/SketchCorridorScene.js', import.meta.url), 'utf8');
    expect(sketchSource).toContain('loadManagedMuseumTexture');
    expect(sketchSource).not.toContain('textureLoader.load(`${TEXTURE_BASE}${name}.webp`');
  });

  it('caps pixel density and anisotropy for lite museum sessions', () => {
    expect(getMuseumRenderBudget({
      experienceMode: 'lite',
      devicePixelRatio: 2,
      maxAnisotropy: 16
    })).toEqual({ pixelRatio: 1.15, anisotropy: 2 });

    expect(getMuseumRenderBudget({
      experienceMode: 'cinematic',
      devicePixelRatio: 2,
      maxAnisotropy: 16
    })).toEqual({ pixelRatio: 1.5, anisotropy: 4 });
  });

  it('reuses an exact managed texture request from the scene cache', () => {
    let loadCount = 0;
    const texture = {
      repeat: { set() {} },
      dispose() {},
      needsUpdate: false
    };
    const loader = {
      load() {
        loadCount += 1;
        return texture;
      }
    };
    const THREE = {
      SRGBColorSpace: 'srgb',
      RepeatWrapping: 'repeat'
    };
    const cache = new Map();
    const options = {
      THREE,
      loader,
      renderer: null,
      url: '/assets/textures/wall-cloud.webp',
      name: 'wall-cloud',
      repeat: [1.6, 1],
      anisotropy: 4,
      cache
    };

    const first = loadManagedMuseumTexture(options);
    const second = loadManagedMuseumTexture(options);

    expect(second).toBe(first);
    expect(loadCount).toBe(1);
  });
});
