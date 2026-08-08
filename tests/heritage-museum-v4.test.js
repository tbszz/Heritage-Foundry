import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const indexHtml = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
const homeJs = readFileSync(new URL('../src/home.js', import.meta.url), 'utf8');
const corridorJs = readFileSync(
  new URL('../src/components/SketchCorridorScene.js', import.meta.url),
  'utf8'
);

describe('heritage museum v4 production boundaries', () => {
  it('does not import the retired Companion into the 3D corridor', () => {
    expect(corridorJs).not.toMatch(/import\s+\{\s*Companion\s*\}\s+from/);
  });

  it('does not ship the companion chat DOM on the museum homepage', () => {
    expect(indexHtml).not.toContain('id="companion-chat"');
  });

  it('does not initialize the retired companion chat from the homepage entry', () => {
    expect(homeJs).not.toContain('bindCompanionChat');
  });

  it('does not expose a companion callback across the home-to-corridor protocol', () => {
    expect(`${homeJs}\n${corridorJs}`).not.toContain('onCompanion');
  });
});
