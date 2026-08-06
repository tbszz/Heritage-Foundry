import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const museumSceneJs = readFileSync(
  new URL('../src/components/MuseumScene.js', import.meta.url),
  'utf8'
);

describe('museum entrance signboard', () => {
  it('shows the temporary brand name 遗见 centered on the signboard', () => {
    expect(museumSceneJs).toContain("const chars = '遗见'.split('');");
    expect(museumSceneJs).toContain("const titleSpacing = 220;");
    expect(museumSceneJs).toContain(
      "512 + (index - (chars.length - 1) / 2) * titleSpacing"
    );
    expect(museumSceneJs).not.toContain("const chars = '非遗造物局'.split('');");
  });
});
