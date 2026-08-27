import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const textureNames = [
  'banner-silk',
  'carpet-runner',
  'ceiling-coffer',
  'feature-wall',
  'floor-stone',
  'pedestal-stone',
  'red-lacquer',
  'wall-cloud',
  'wood-beam'
];

describe('museum production textures', () => {
  it('keeps the regeneration prompts aligned with the approved warm heritage gallery', () => {
    const generatorSource = readFileSync(
      new URL('../scripts/generate-textures.mjs', import.meta.url),
      'utf8'
    );

    const normalizedSource = generatorSource.toLowerCase();

    expect(normalizedSource).toContain('warm grey mineral plaster');
    expect(normalizedSource).toContain('smoked walnut');
    expect(normalizedSource).toContain('muted cinnabar');
    expect(normalizedSource).toContain('aged bronze');
    expect(normalizedSource).not.toContain('golden dragon');
  });

  it('ships nine bounded power-of-two WebP assets', async () => {
    let totalBytes = 0;

    for (const name of textureNames) {
      const url = new URL(`../public/assets/textures/${name}.webp`, import.meta.url);
      const filePath = fileURLToPath(url);
      const stats = statSync(url);
      const metadata = await sharp(filePath).metadata();

      totalBytes += stats.size;
      expect(metadata.format, name).toBe('webp');
      expect(metadata.width, name).toBe(1024);
      expect(metadata.height, name).toBe(1024);
      expect(stats.size, name).toBeLessThan(320 * 1024);
    }

    expect(totalBytes).toBeLessThan(2.2 * 1024 * 1024);
  });
});
