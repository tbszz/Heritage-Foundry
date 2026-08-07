import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CRAFTS_DATA } from '../src/utils/craftData.js';
import {
  getMuseumChapters,
  getMuseumExperienceMode
} from '../src/home.js';

const homeJs = readFileSync(new URL('../src/home.js', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
const museumCss = readFileSync(new URL('../src/museum-experience.css', import.meta.url), 'utf8');

describe('cinematic digital museum redesign', () => {
  it('keeps Three.js and GLB prefetching out of the homepage entry bundle', () => {
    expect(homeJs).not.toContain("from './components/MuseumScene.js'");
    expect(homeJs).not.toContain("from './utils/modelLoader.js'");
    expect(homeJs).not.toContain('new MuseumScene');
    expect(homeJs).not.toContain('prefetchModels');
  });

  it('uses a single-screen sketch corridor museum with no scrollable landing sections', () => {
    expect(indexHtml).toContain('id="museum-stage"');
    expect(indexHtml).toContain('id="sketch-corridor"');
    expect(indexHtml).toContain('id="artifact-dialog"');
    expect(indexHtml).not.toContain('id="museum-container"');
    expect(indexHtml).not.toContain('WASD');
    // 首页不再有任何下滑区块：活态展厅 / 馆藏轨道 / 章节落地页全部移除
    expect(indexHtml).not.toContain('id="live-gallery"');
    expect(indexHtml).not.toContain('id="collection-track"');
    expect(indexHtml).not.toContain('id="chapters"');
  });

  it('groups every modeled craft into a curated museum chapter', () => {
    const chapters = getMuseumChapters(CRAFTS_DATA);
    const craftIds = chapters.flatMap((chapter) => chapter.crafts.map((craft) => craft.id));
    const modeledIds = CRAFTS_DATA.filter((craft) => craft.modelUrl).map((craft) => craft.id);

    expect(chapters).toHaveLength(4);
    expect(new Set(craftIds)).toEqual(new Set(modeledIds));
    expect(chapters.every((chapter) => chapter.crafts.length > 0)).toBe(true);
  });

  it('automatically degrades motion on constrained devices', () => {
    expect(getMuseumExperienceMode({
      reducedMotion: true,
      saveData: false,
      hardwareConcurrency: 12,
      deviceMemory: 8
    })).toBe('still');

    expect(getMuseumExperienceMode({
      reducedMotion: false,
      saveData: true,
      hardwareConcurrency: 12,
      deviceMemory: 8
    })).toBe('still');

    expect(getMuseumExperienceMode({
      reducedMotion: false,
      saveData: false,
      hardwareConcurrency: 2,
      deviceMemory: 2
    })).toBe('lite');

    expect(getMuseumExperienceMode({
      reducedMotion: false,
      saveData: false,
      hardwareConcurrency: 12,
      deviceMemory: 8
    })).toBe('cinematic');
  });

  it('uses a dedicated regular serif face for the hero and manifesto copy', () => {
    expect(museumCss).toMatch(/font-family:\s*"Source Han Serif Regular";[\s\S]*?SourceHanSerifSC-Regular\.woff2[\s\S]*?font-weight:\s*400;/);
    expect(museumCss).toMatch(/\.museum-manifesto blockquote p\s*\{[\s\S]*?font-family:\s*"Source Han Serif Regular", serif;[\s\S]*?font-weight:\s*400;/);
  });

  it('lets the 3D corridor own the first screen, keeping only a screen-reader title', () => {
    // 左侧营销文案块已移除：首屏由 3D 长廊本身呈现，标题仅供无障碍朗读
    expect(indexHtml).not.toContain('museum-stage-copy');
    expect(indexHtml).toContain('id="museum-stage-title" class="sr-only"');
    expect(indexHtml).toContain('aria-labelledby="museum-stage-title"');
  });
});
