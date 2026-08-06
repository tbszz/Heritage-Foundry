import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const museumHtml = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
const generatorHtml = readFileSync(new URL('../src/generator.html', import.meta.url), 'utf8');
const homeJs = readFileSync(new URL('../src/home.js', import.meta.url), 'utf8');
const creationPanelJs = readFileSync(new URL('../src/components/creationPanel.js', import.meta.url), 'utf8');

describe('museum creation panel parity and performance', () => {
  it('keeps high-density pattern creation in the dedicated generator workspace', () => {
    expect(museumHtml).toContain('href="generator.html"');
    expect(museumHtml).not.toContain('id="pattern-resolution-select"');
    expect(generatorHtml).toContain('id="pattern-resolution-select"');
    expect(generatorHtml).toContain('<option value="96x96" selected>');
    expect(creationPanelJs).toContain('DEFAULT_PATTERN_SIZE');
    expect(creationPanelJs).toContain('function getPatternSize()');
    expect(creationPanelJs).not.toContain('const PATTERN_WIDTH = 18');
    expect(creationPanelJs).not.toContain('const PATTERN_HEIGHT = 12');
  });

  it('uses the detailed image conversion pipeline and keeps pattern dimensions in one result', () => {
    expect(creationPanelJs).toContain('currentPatternResult');
    expect(creationPanelJs).toContain('removeBackground: true');
    expect(creationPanelJs).toContain('fitSubject: true');
    expect(creationPanelJs).toContain('subjectPadding: 0.06');
    expect(creationPanelJs).not.toContain('buildPattern(');
  });

  it('uses event delegation and local cell replacement for large pattern grids', () => {
    expect(creationPanelJs).toContain("grid?.addEventListener('click'");
    expect(creationPanelJs).toContain('function updatePatternCellElement');
    expect(creationPanelJs).not.toContain("patternContainer.querySelectorAll('.bead-cell').forEach");
  });

  it('keeps all four inspiration controls as native dropdowns in the generator workspace', () => {
    ['craft', 'ip', 'carrier', 'style'].forEach((id) => {
      expect(generatorHtml).toContain(`id="${id}"`);
    });
    expect(creationPanelJs).not.toContain('enhanceSelects();');
    expect(creationPanelJs).not.toContain("switcher.className = 'choice-switch'");
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
