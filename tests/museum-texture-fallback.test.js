import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getMuseumTextureFallbackColors } from '../src/utils/museumTexture.js';

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
    const museumSource = readFileSync(new URL('../src/components/MuseumScene.js', import.meta.url), 'utf8');

    expect(sketchSource).toContain('loadManagedMuseumTexture');
    expect(museumSource).toContain('loadManagedMuseumTexture');
    expect(sketchSource).not.toContain('textureLoader.load(`${TEXTURE_BASE}${name}.webp`');
    expect(museumSource).not.toContain('textureLoader.load(`${TEXTURE_BASE}${name}.webp`');
  });
});
