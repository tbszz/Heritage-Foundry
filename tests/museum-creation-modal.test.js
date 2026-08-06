import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const museumHtml = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
const museumCss = readFileSync(new URL('../src/museum-experience.css', import.meta.url), 'utf8');
const homeJs = readFileSync(new URL('../src/home.js', import.meta.url), 'utf8');

describe('museum artifact dialog', () => {
  it('uses the native accessible dialog with a dismissible backdrop', () => {
    expect(museumHtml).toContain('<dialog id="artifact-dialog"');
    expect(museumHtml).toContain('aria-labelledby="artifact-name"');
    expect(museumHtml).toContain('data-close-dialog');
    expect(homeJs).toContain('dialog.showModal()');
    expect(homeJs).toContain("if (event.target === dialog) dialog.close()");
    expect(homeJs).toContain("dialog.addEventListener('close'");
  });

  it('centers a wide artifact card instead of opening a full creation workspace', () => {
    const panelBlock = museumCss.match(/\.artifact-dialog \{([\s\S]*?)\n\}/)?.[1] || '';

    expect(panelBlock).toContain('width: min(1080px, calc(100vw - 40px))');
    expect(panelBlock).toContain('max-height: min(760px, calc(100dvh - 40px))');
    expect(museumHtml).not.toContain('class="panel-creation"');
    expect(museumHtml).not.toContain('id="pattern-container"');
  });

  it('collapses the artifact dialog into a vertical mobile composition', () => {
    expect(museumCss).toContain('.artifact-dialog[open]');
    expect(museumCss).toContain('grid-template-columns: minmax(0, 1.05fr) minmax(340px, 0.95fr)');
    expect(museumCss).toContain('@media (max-width: 700px)');
    expect(museumCss).toContain('max-height: calc(100dvh - 20px)');
  });
});
