import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const museumHtml = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
const generatorHtml = readFileSync(new URL('../src/generator.html', import.meta.url), 'utf8');
const homeJs = readFileSync(new URL('../src/home.js', import.meta.url), 'utf8');

describe('museum and generator workspace boundaries', () => {
  it('keeps high-density pattern creation in the dedicated generator workspace', () => {
    expect(museumHtml).toContain('href="generator.html"');
    expect(museumHtml).not.toContain('id="pattern-resolution-select"');
    expect(generatorHtml).toContain('id="pattern-resolution-select"');
    expect(generatorHtml).toContain('<option value="96x96" selected>');
  });

  it('keeps all four inspiration controls as native dropdowns in the generator workspace', () => {
    ['craft', 'ip', 'carrier', 'style'].forEach((id) => {
      expect(generatorHtml).toContain(`id="${id}"`);
    });
  });

  it('pauses the sketch corridor WebGL loop while artifact details are open', () => {
    expect(homeJs).not.toContain('MuseumScene');
    expect(homeJs).not.toContain('requestAnimationFrame(() => this.animate())');
    expect(homeJs).toContain('dialog.showModal()');
    // 弹窗打开即暂停走廊渲染，关闭后按视口可见性恢复
    expect(homeJs).toContain('sketchCorridorScene?.setRenderPaused(true)');
    expect(homeJs).toContain('resumeCorridorIfVisible');
  });
});
