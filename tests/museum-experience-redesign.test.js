import { existsSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CRAFTS_DATA } from '../src/utils/craftData.js';
import {
  getMuseumChapters,
  getMuseumExperienceMode
} from '../src/home.js';

const homeJs = readFileSync(new URL('../src/home.js', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
const museumCss = readFileSync(new URL('../src/museum-experience.css', import.meta.url), 'utf8');
const museumVideoUrl = new URL('../public/assets/generated/museum-night-loop.mp4', import.meta.url);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getCssBlocks(source, header) {
  const blocks = [];
  const headerPattern = new RegExp(`(?:^|\\n)\\s*${escapeRegExp(header)}\\s*\\{`, 'g');
  let match;

  while ((match = headerPattern.exec(source))) {
    const openingBrace = headerPattern.lastIndex - 1;
    let depth = 1;
    let cursor = openingBrace + 1;
    while (cursor < source.length && depth > 0) {
      if (source[cursor] === '{') depth += 1;
      if (source[cursor] === '}') depth -= 1;
      cursor += 1;
    }
    blocks.push(source.slice(openingBrace + 1, cursor - 1));
    headerPattern.lastIndex = cursor;
  }

  return blocks;
}

function getCssRule(source, selector) {
  return getCssBlocks(source, selector)[0] || '';
}

function getCssRuleWithinAny(source, container, selector) {
  return getCssBlocks(source, container)
    .map((block) => getCssRule(block, selector))
    .find(Boolean) || '';
}

function getNumericCssDeclaration(rule, property) {
  const match = rule.match(new RegExp(
    `(?:^|\\n)\\s*${escapeRegExp(property)}\\s*:\\s*(-?\\d+(?:\\.\\d+)?)\\s*;`
  ));
  return match ? Number(match[1]) : Number.NaN;
}

function installMuseumVideoHarness({ play = () => Promise.resolve() } = {}) {
  const calls = { play: 0, pause: 0 };
  const video = {
    dataset: {},
    play() {
      calls.play += 1;
      return play();
    },
    pause() {
      calls.pause += 1;
    }
  };
  const documentTarget = new EventTarget();
  documentTarget.body = { dataset: { experienceMode: 'cinematic' } };
  documentTarget.hidden = false;
  documentTarget.querySelector = (selector) => (
    selector === '[data-museum-background-video]' ? video : null
  );
  const reducedMotionQuery = new EventTarget();
  reducedMotionQuery.matches = false;
  const modeToggle = new EventTarget();
  const modeToggleAttributes = new Map();
  modeToggle.textContent = '';
  modeToggle.setAttribute = (name, value) => modeToggleAttributes.set(name, value);
  modeToggle.getAttribute = (name) => modeToggleAttributes.get(name) ?? null;
  documentTarget.getElementById = (id) => (
    id === 'experience-mode-toggle' ? modeToggle : null
  );
  documentTarget.querySelectorAll = () => [];

  vi.stubGlobal('document', documentTarget);
  vi.stubGlobal('window', {
    localStorage: { setItem() {} },
    matchMedia: () => reducedMotionQuery
  });

  return { calls, documentTarget, modeToggle, reducedMotionQuery, video };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

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
    const regularSerifFace = getCssBlocks(museumCss, '@font-face')
      .find((block) => block.includes('font-family: "Source Han Serif Regular"')) || '';
    const manifestoRule = getCssRule(museumCss, '.museum-manifesto blockquote p');

    expect(regularSerifFace).toContain('SourceHanSerifSC-Regular.woff2');
    expect(regularSerifFace).toContain('font-weight: 400;');
    expect(manifestoRule).toContain('font-family: "Source Han Serif Regular", serif;');
    expect(manifestoRule).toContain('font-weight: 400;');
  });

  it('keeps the museum hero title and manifesto visible before the 3D hall starts', () => {
    const heroTitle = indexHtml.match(/<h1[^>]*id="museum-stage-title"[^>]*>/)?.[0] || '';
    const stageCopyRule = getCssRule(museumCss, '.museum-stage-copy');
    const titleRule = getCssRule(museumCss, '#museum-stage-title');

    expect(heroTitle).not.toContain('sr-only');
    expect(indexHtml).toContain('museum-stage-copy');
    expect(indexHtml).toContain('一馆藏百艺，一念续千年');
    expect(indexHtml).not.toContain('museum-building-mask');
    expect(museumCss).not.toContain('.museum-building-mask');
    expect(getNumericCssDeclaration(stageCopyRule, 'z-index')).toBeGreaterThanOrEqual(5);
    expect(titleRule).toContain('padding-block:');
    expect(titleRule).toContain('line-height: 0.96;');
  });

  it('ships a muted inline museum-night video with the static exterior as its fallback', () => {
    const heroVideo = indexHtml.match(/<video[\s\S]*?<\/video>/)?.[0] || '';

    expect(heroVideo).toContain('data-museum-background-video');
    expect(heroVideo).toContain('autoplay');
    expect(heroVideo).toContain('muted');
    expect(heroVideo).toContain('loop');
    expect(heroVideo).toContain('playsinline');
    expect(heroVideo).toContain('poster="/assets/generated/museum-copper-exterior.webp"');
    expect(heroVideo).toContain('src="/assets/generated/museum-night-loop.mp4"');
  });

  it('ships a real non-empty MP4 container for the museum-night background', () => {
    const assetExists = existsSync(museumVideoUrl);

    expect(assetExists).toBe(true);
    if (!assetExists) return;

    const bytes = readFileSync(museumVideoUrl);
    expect(bytes.byteLength).toBeGreaterThan(1024);
    expect(bytes.subarray(4, 8).toString('ascii')).toBe('ftyp');
    expect(bytes.includes(Buffer.from('moov'))).toBe(true);
    expect(bytes.includes(Buffer.from('mdat'))).toBe(true);
  });

  it('plays the museum background only for an active cinematic experience', async () => {
    const homeModule = await import('../src/home.js');

    expect(typeof homeModule.shouldPlayMuseumBackgroundVideo).toBe('function');
    expect(homeModule.shouldPlayMuseumBackgroundVideo({
      experienceMode: 'cinematic',
      reducedMotion: false,
      documentHidden: false
    })).toBe(true);
    expect(homeModule.shouldPlayMuseumBackgroundVideo({
      experienceMode: 'still',
      reducedMotion: false,
      documentHidden: false
    })).toBe(false);
    expect(homeModule.shouldPlayMuseumBackgroundVideo({
      experienceMode: 'cinematic',
      reducedMotion: true,
      documentHidden: false
    })).toBe(false);
    expect(homeModule.shouldPlayMuseumBackgroundVideo({
      experienceMode: 'cinematic',
      reducedMotion: false,
      documentHidden: true
    })).toBe(false);
  });

  it('keeps a stale play rejection from overwriting a newer paused state', async () => {
    let rejectPlay;
    const playAttempt = new Promise((resolve, reject) => {
      rejectPlay = reject;
    });
    const { calls, documentTarget, video } = installMuseumVideoHarness({
      play: () => playAttempt
    });
    const homeModule = await import('../src/home.js');

    homeModule.syncMuseumBackgroundVideo();
    documentTarget.body.dataset.experienceMode = 'still';
    homeModule.syncMuseumBackgroundVideo();
    rejectPlay(new Error('delayed media rejection'));
    await playAttempt.catch(() => {});

    expect(calls.play).toBe(1);
    expect(calls.pause).toBe(1);
    expect(video.dataset.playbackState).toBe('paused');
  });

  it('pauses and resumes the museum video on document visibility changes', async () => {
    const { calls, documentTarget, video } = installMuseumVideoHarness();
    const homeModule = await import('../src/home.js');

    expect(typeof homeModule.bindMuseumBackgroundVideoLifecycle).toBe('function');
    const unbind = homeModule.bindMuseumBackgroundVideoLifecycle();
    documentTarget.hidden = true;
    documentTarget.dispatchEvent(new Event('visibilitychange'));
    documentTarget.hidden = false;
    documentTarget.dispatchEvent(new Event('visibilitychange'));
    unbind();

    expect(calls.play).toBe(2);
    expect(calls.pause).toBe(1);
    expect(video.dataset.playbackState).toBe('playing');
    expect(documentTarget.body.dataset.paused).toBe('false');
  });

  it('pauses and resumes the museum video when reduced-motion preference changes', async () => {
    const { calls, reducedMotionQuery, video } = installMuseumVideoHarness();
    const homeModule = await import('../src/home.js');

    expect(typeof homeModule.bindMuseumBackgroundVideoLifecycle).toBe('function');
    const unbind = homeModule.bindMuseumBackgroundVideoLifecycle();
    reducedMotionQuery.matches = true;
    reducedMotionQuery.dispatchEvent(new Event('change'));
    reducedMotionQuery.matches = false;
    reducedMotionQuery.dispatchEvent(new Event('change'));
    unbind();

    expect(calls.play).toBe(2);
    expect(calls.pause).toBe(1);
    expect(video.dataset.playbackState).toBe('playing');
  });

  it('pauses and resumes the museum video through real mode-toggle clicks', async () => {
    const { calls, documentTarget, modeToggle, video } = installMuseumVideoHarness();
    const homeModule = await import('../src/home.js');

    expect(typeof homeModule.bindModeToggle).toBe('function');
    homeModule.bindModeToggle();

    modeToggle.dispatchEvent(new Event('click'));
    expect(documentTarget.body.dataset.experienceMode).toBe('still');
    expect(calls.pause).toBe(1);
    expect(video.dataset.playbackState).toBe('paused');

    modeToggle.dispatchEvent(new Event('click'));
    expect(documentTarget.body.dataset.experienceMode).toBe('cinematic');
    expect(calls.play).toBe(1);
    expect(video.dataset.playbackState).toBe('playing');
  });

  it('keeps the mobile motion toggle reachable above the museum entry button', () => {
    const mobileModeToggleRule = getCssRuleWithinAny(
      museumCss,
      '@media (max-width: 760px)',
      '.mode-toggle'
    );

    expect(mobileModeToggleRule).toContain('display: inline-flex;');
    expect(mobileModeToggleRule).toContain('align-items: center;');
    expect(mobileModeToggleRule).toContain('justify-content: center;');
    expect(mobileModeToggleRule).toContain('right: 12px;');
    expect(mobileModeToggleRule).toContain('bottom: 122px;');
    expect(mobileModeToggleRule).toContain('min-height: 44px;');
    expect(mobileModeToggleRule).not.toContain('display: none;');
  });

  it('shows the moving layer only in cinematic mode without reduced motion', () => {
    const baseVideoRule = getCssRule(museumCss, '.museum-stage-video');
    const cinematicVideoRule = getCssRule(
      museumCss,
      'body[data-experience-mode="cinematic"] .museum-stage-video'
    );
    const stillVideoRule = getCssRule(
      museumCss,
      'body[data-experience-mode="still"] .museum-stage-video'
    );
    const reducedVideoRule = getCssRuleWithinAny(
      museumCss,
      '@media (prefers-reduced-motion: reduce)',
      '.museum-stage-video'
    );

    expect(baseVideoRule).toContain('object-fit: cover;');
    expect(cinematicVideoRule).toContain('opacity: 1;');
    expect(cinematicVideoRule).toContain('visibility: visible;');
    expect(stillVideoRule).toContain('opacity: 0;');
    expect(stillVideoRule).toContain('visibility: hidden;');
    expect(reducedVideoRule).toContain('opacity: 0 !important;');
    expect(reducedVideoRule).toContain('visibility: hidden !important;');
  });

  it('offers one explicit museum-entry action from the exterior hero', () => {
    expect(indexHtml).toContain('id="museum-entry-trigger"');
  });

  it('presents the shadow-puppet and cloth-tiger heritage guides as buttons', () => {
    const shadowKeyframes = getCssRule(museumCss, '@keyframes heritage-shadow-sway');
    const tigerKeyframes = getCssRule(museumCss, '@keyframes heritage-tiger-breathe');
    const shadowMotionRule = getCssRule(
      museumCss,
      'body[data-experience-mode="cinematic"][data-paused="false"] .heritage-guide-shadow .heritage-guide-figure'
    );
    const tigerMotionRule = getCssRule(
      museumCss,
      'body[data-experience-mode="cinematic"][data-paused="false"] .heritage-guide-tiger .heritage-guide-figure'
    );
    const reducedFigureRule = getCssRuleWithinAny(
      museumCss,
      '@media (prefers-reduced-motion: reduce)',
      '.heritage-guide-figure'
    );
    const stillFigureRule = getCssRule(
      museumCss,
      'body[data-experience-mode="still"] .heritage-guide-figure'
    );
    const shadowImageMotionRule = getCssRule(
      museumCss,
      'body[data-experience-mode="cinematic"][data-paused="false"] .heritage-guide-shadow img'
    );
    const tigerImageMotionRule = getCssRule(
      museumCss,
      'body[data-experience-mode="cinematic"][data-paused="false"] .heritage-guide-tiger img'
    );
    const hoverImageRule = getCssRule(museumCss, '.heritage-guide:hover img');
    const hoverFigureRule = getCssRule(museumCss, '.heritage-guide:hover .heritage-guide-figure');

    expect(indexHtml).toMatch(/<button[^>]*data-heritage-guide="shadow"/);
    expect(indexHtml).toMatch(/<button[^>]*data-heritage-guide="tiger-head"/);
    expect(indexHtml.match(/class="heritage-guide-figure"/g)).toHaveLength(2);
    expect(shadowKeyframes).toContain('translate3d(0, -3px, 0)');
    expect(tigerKeyframes).toContain('scale(1.015)');
    expect(shadowMotionRule).toContain('animation: heritage-shadow-sway 6.8s');
    expect(tigerMotionRule).toContain('animation: heritage-tiger-breathe 5.2s 620ms');
    expect(museumCss.match(/animation:\s*heritage-shadow-sway\b/g)).toHaveLength(1);
    expect(museumCss.match(/animation:\s*heritage-tiger-breathe\b/g)).toHaveLength(1);
    expect(stillFigureRule).toContain('animation: none !important;');
    expect(reducedFigureRule).toContain('animation: none !important;');
    expect(shadowImageMotionRule).toBe('');
    expect(tigerImageMotionRule).toBe('');
    expect(hoverImageRule).toContain('transform: rotate(-1.5deg) scale(1.025);');
    expect(hoverFigureRule).toBe('');
    expect(museumCss.match(/transform:\s*rotate\(-1\.5deg\) scale\(1\.025\);/g)).toHaveLength(1);
  });

  it('keeps the map and co-creation gallery reachable from top-level controls', () => {
    expect(indexHtml).toMatch(/<(?:a|button)[^>]*data-open-feature="map"/);
    expect(indexHtml).toMatch(/<(?:a|button)[^>]*data-open-feature="gallery"/);
  });
});
