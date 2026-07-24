import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const generatorHtml = readFileSync(new URL('../src/generator.html', import.meta.url), 'utf8');
const generatorCss = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const generatorJs = readFileSync(new URL('../src/generator.js', import.meta.url), 'utf8');
const patternGeneratorJs = readFileSync(new URL('../src/utils/patternGenerator.js', import.meta.url), 'utf8');
const threeSceneJs = readFileSync(new URL('../src/components/ThreeScene.js', import.meta.url), 'utf8');

describe('generator museum workspace', () => {
  it('uses the homepage visual shell and preserves the workflow landmarks', () => {
    expect(generatorHtml).toContain('body class="generator-shell"');
    expect(generatorHtml).toContain('data-component="GeneratorWorkbench"');
    expect(generatorHtml).toContain('data-component="InspirationConsole"');
    expect(generatorHtml).toContain('data-component="CreationStage"');
    expect(generatorHtml).toContain('id="generateBtn"');
    expect(generatorHtml).toContain('id="patternBtn"');
  });

  it('exposes a real 3D figurine workflow instead of presenting the reference image as 3D', () => {
    expect(generatorHtml).toContain('<option value="figurine">');
    expect(generatorHtml).toContain('id="generate3dBtn"');
    expect(generatorHtml).toContain('id="three-d-status"');
    expect(generatorHtml).toContain('id="download-glb-link"');
    expect(generatorHtml).toContain('生成真实 3D');
    expect(generatorHtml).toContain('disabled');
  });

  it('offers a downloadable GLB for generated non-figurine products', () => {
    expect(generatorHtml).toContain('id="export-product-glb-btn"');
    expect(generatorHtml).toContain('下载产品 GLB');
  });

  it('offers high-density bead-board detail levels and defaults to 96 by 96', () => {
    expect(generatorHtml).toContain('id="pattern-resolution-select"');
    expect(generatorHtml).toContain('<option value="29x29">');
    expect(generatorHtml).toContain('<option value="48x48">');
    expect(generatorHtml).toContain('<option value="64x64">');
    expect(generatorHtml).toContain('<option value="96x96" selected>');
    expect(generatorHtml).toContain('<option value="128x128">');
    expect(patternGeneratorJs).toContain('DEFAULT_PATTERN_SIZE = 96');
    expect(generatorJs).toContain('DEFAULT_PATTERN_SIZE');
    expect(generatorJs).not.toContain('maxColors: 12');
    expect(generatorJs).not.toContain('const PATTERN_WIDTH = 18');
    expect(generatorJs).not.toContain('const PATTERN_HEIGHT = 12');
  });

  it('renders compact beads, transparent external positions, and hover-only color labels', () => {
    expect(generatorCss).toContain('.bead-cell.is-external');
    expect(generatorCss).toContain('content: attr(data-key)');
    expect(generatorCss).toContain('gap: var(--bead-gap, 1px)');
    expect(generatorCss).toContain('border: var(--bead-border, 1px)');
    expect(generatorCss).not.toContain('width: 24px;\n  height: 24px;');
    expect(patternGeneratorJs).toContain("width <= 96 ? 6 : 5");
    expect(patternGeneratorJs).toContain('canvas.toBlob');
  });

  it('never substitutes a random demo pattern when the source image cannot be read', () => {
    expect(generatorJs).not.toContain('buildPattern(');
    expect(patternGeneratorJs).toContain("reject(new Error('无法读取生成图，未创建伪造拼豆图纸'))");
    expect(patternGeneratorJs).not.toContain('using generated pattern');
  });

  it('keeps the pattern, dimensions, and color system in one committed result object', () => {
    expect(generatorJs).toContain('let currentPatternResult = null');
    expect(generatorJs).not.toContain('let currentPatternWidth');
    expect(generatorJs).not.toContain('let currentPatternHeight');
    expect(generatorJs).toContain('currentPatternResult.width');
    expect(generatorJs).toContain('currentPatternResult.colorSystem');
  });

  it('updates one edited bead locally and prevents overlapping PNG exports', () => {
    const cycleBlock = generatorJs.match(/function cyclePatternCell\([\s\S]*?\n\}/)?.[0] || '';

    expect(generatorJs).toContain('function updatePatternCellElement');
    expect(cycleBlock).not.toContain('renderPattern(currentPatternResult)');
    expect(generatorJs).toContain('let patternImageExportActive = false');
    expect(generatorJs).toContain('await downloadPatternImage(');
  });

  it('uses a neutral product stage so the canvas background does not cast cyan over the model', () => {
    const stageBlock = generatorCss.match(/body\.generator-shell \.three-container \{([\s\S]*?)\n\}/)?.[1] || '';

    expect(generatorCss).toContain('.three-d-workflow');
    expect(stageBlock).toContain('rgba(255, 239, 207');
    expect(stageBlock).not.toContain('rgba(38, 198, 218');
    expect(generatorCss).not.toContain('.three-container::after');
    expect(threeSceneJs).toContain('this.scene.background = null');
    expect(threeSceneJs).not.toContain('new THREE.GridHelper');
  });
});
