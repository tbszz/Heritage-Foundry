import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const homeJs = readFileSync(new URL('../src/home.js', import.meta.url), 'utf8');
const museumCss = readFileSync(new URL('../src/museum-experience.css', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
const artifactStageJs = readFileSync(new URL('../src/components/ArtifactStage.js', import.meta.url), 'utf8');

describe('museum entry lifecycle', () => {
  it('reuses an open corridor without returning the stage to a stuck loading state', () => {
    const start = homeJs.indexOf('const enterMuseum = async');
    const end = homeJs.indexOf("document.querySelectorAll('[data-action=\"enter-museum\"]')", start);
    const entryBlock = homeJs.slice(start, end);

    expect(entryBlock).toContain('if (sketchCorridorScene)');
    expect(entryBlock.indexOf('if (sketchCorridorScene)')).toBeLessThan(
      entryBlock.indexOf("stage.dataset.museumState = 'loading'")
    );
    expect(entryBlock).toContain("stage.classList.add('is-corridor-live', 'has-entered')");
    expect(entryBlock).toContain('loader.hidden = true');
  });

  it('keeps the retry action visible in the error state and restores loading copy', () => {
    const errorRule = museumCss.match(/\.museum-stage\.is-corridor-error \.sketch-corridor-loader\s*\{([\s\S]*?)\}/)?.[1] || '';

    expect(errorRule).toContain('display: grid');
    expect(homeJs).toContain("retry?.addEventListener('click', () => enterMuseum(pendingChapterId))");
    expect(homeJs).toContain("copy.textContent = '馆门开启，正在点亮百工长廊…'");
  });

  it('resumes the exterior video after corridor initialization fails', () => {
    const start = homeJs.indexOf('const enterMuseum = async');
    const end = homeJs.indexOf("document.querySelectorAll('[data-action=\"enter-museum\"]')", start);
    const entryBlock = homeJs.slice(start, end);
    const catchBlock = entryBlock.slice(entryBlock.indexOf('} catch {'));
    const clearEnteringIndex = catchBlock.indexOf(
      "stage.classList.remove('is-entering', 'is-corridor-loading')"
    );
    const resumeVideoIndex = catchBlock.indexOf('syncMuseumBackgroundVideo()');

    expect(clearEnteringIndex).toBeGreaterThanOrEqual(0);
    expect(resumeVideoIndex).toBeGreaterThan(clearEnteringIndex);
  });
});

describe('museum mobile navigation', () => {
  it('keeps the map and co-creation destinations reachable from the top navigation', () => {
    const mobileRule = museumCss.match(/@media \(max-width: 760px\) \{([\s\S]*?)\n\}/)?.[1] || '';

    expect(mobileRule).toContain('.museum-nav-links');
    expect(mobileRule).toContain('display: flex');
    expect(mobileRule).toContain('overflow-x: auto');
    expect(mobileRule).toContain('min-height: 44px');
  });
});

describe('museum inclusive interaction and deferred content', () => {
  it('exposes the 3D stage only while the corridor is visibly active', () => {
    const corridor = indexHtml.match(/<div(?=[^>]*id="sketch-corridor")[^>]*>/)?.[0] || '';

    expect(corridor).toContain('tabindex="-1"');
    expect(corridor).toContain('role="application"');
    expect(corridor).toContain('aria-hidden="true"');
    expect(corridor).toContain('inert');
    expect(homeJs).toContain('setCorridorInteractionEnabled(true)');
    expect(homeJs).toContain('setCorridorInteractionEnabled(false)');
  });

  it('makes map regions keyboard operable and closes overlays on history back', () => {
    expect(homeJs).toContain("path.setAttribute('tabindex', '0')");
    expect(homeJs).toContain("svg.addEventListener('keydown'");
    expect(homeJs).toContain('if (openOverlayId) closeModalElement');
  });

  it('loads map and gallery data only when their overlay is opened', () => {
    const initBlock = homeJs.match(/async function initHomePage\(\) \{([\s\S]*?)\n\}/)?.[1] || '';

    expect(initBlock).not.toContain('loadCommunityGallery();');
    expect(initBlock).not.toContain('renderHeritageMap();');
    expect(homeJs).toContain('ensureFeatureOverlayContent(featureId)');
    expect(homeJs).toContain('communityLoadVersion');
    expect(homeJs).toContain("import('./data/province-paths.js')");
    expect(homeJs).not.toContain("from './data/province-paths.js'");
  });

  it('provides a recoverable artifact model error state', () => {
    expect(indexHtml).toContain('data-action="retry-artifact"');
    expect(homeJs).toContain("retryArtifact?.addEventListener('click'");
    expect(homeJs).toContain("copy.textContent = '三维馆藏未能载入，请重试。'");
  });

  it('reduces automatic artifact motion without freezing user rotation', () => {
    expect(artifactStageJs).toContain('this.autoMotionEnabled = true');
    expect(artifactStageJs).toContain('setAutoMotionEnabled(enabled)');
    expect(artifactStageJs).toContain('this.autoMotionEnabled');
    expect(homeJs).toContain('setAutoMotionEnabled(');
    expect(homeJs).not.toContain('artifact3dStage?.setMotionEnabled(');
  });

  it('keeps the mode toggle synchronized and can redirect an already open room', () => {
    expect(homeJs).toContain('syncExperienceModeToggle()');
    expect(homeJs).toContain('sketchCorridorScene.switchChapter(nextChapter)');
  });

  it('resumes the corridor after overlays in both cinematic and lite modes', () => {
    const resumeBlock = homeJs.match(/function resumeCorridorIfVisible\(\) \{([\s\S]*?)\n\}/)?.[1] || '';

    expect(resumeBlock).toContain("document.body.dataset.experienceMode === 'still'");
    expect(resumeBlock).not.toContain("!== 'cinematic'");
  });
});
