import { describe, expect, it } from 'vitest';
import { CRAFTS_DATA } from '../src/utils/craftData.js';
import {
  getHomepageCraftLinks,
  getHomepageCrafts,
  getHomepageCraftIntro,
  getInitialHomepageCraft,
  resolveHomepageSelection
} from '../src/home.js';
import { getModelTargetSize, getParticleCount } from '../src/components/ParticleMorphScene.js';
import * as Home from '../src/home.js';

describe('homepage heritage hero', () => {
  it('builds the selector from crafts that have GLB models', () => {
    const homepageCrafts = getHomepageCrafts(CRAFTS_DATA);

    expect(homepageCrafts.length).toBeGreaterThan(0);
    expect(homepageCrafts.every((craft) => Boolean(craft.modelUrl))).toBe(true);
    expect(homepageCrafts.map((craft) => craft.id)).toContain('papercut');
    expect(homepageCrafts.map((craft) => craft.id)).toContain('porcelain');
  });

  it('uses the selected heritage description and story as the hero copy', () => {
    const craft = CRAFTS_DATA.find((item) => item.id === 'porcelain');

    expect(getHomepageCraftIntro(craft)).toEqual({
      name: '景德镇陶瓷',
      category: '传统陶瓷',
      description: craft.description,
      story: craft.story
    });
  });

  it('falls back to porcelain as the museum-style default when a requested craft is missing', () => {
    const initialCraft = getInitialHomepageCraft('missing-id', CRAFTS_DATA);

    expect(initialCraft).toEqual(CRAFTS_DATA.find((craft) => craft.id === 'porcelain'));
  });

  it('builds craft-specific homepage links for the selected craft', () => {
    expect(getHomepageCraftLinks('porcelain')).toEqual({
      craftHref: 'crafts.html?craft=porcelain',
      generatorHref: 'generator.html?craft=porcelain'
    });

    expect(getHomepageCraftLinks('lanterns')).toEqual({
      craftHref: 'crafts.html?craft=lanterns',
      generatorHref: 'generator.html?craft=papercut'
    });
  });

  it('keeps the latest requested craft during rapid selection', () => {
    const crafts = getHomepageCrafts(CRAFTS_DATA);
    const currentCraft = crafts.find((craft) => craft.id === 'tiger-head');
    const requestedCraft = crafts.find((craft) => craft.id === 'porcelain');

    expect(resolveHomepageSelection(currentCraft, requestedCraft)).toEqual({
      nextCraft: requestedCraft,
      shouldUpdate: true
    });

    expect(resolveHomepageSelection(requestedCraft, requestedCraft)).toEqual({
      nextCraft: requestedCraft,
      shouldUpdate: false
    });
  });

  it('builds a museum tour stop for every modeled craft', () => {
    expect(typeof Home.getMuseumTourStops).toBe('function');

    const tourStops = Home.getMuseumTourStops(CRAFTS_DATA);

    expect(tourStops).toHaveLength(18);
    expect(tourStops[0]).toMatchObject({
      index: 0,
      id: 'tiger-head',
      iconUrl: '/assets/generated/craft-icons/tiger-head.png',
      stopLabel: '01'
    });

    const porcelainStop = tourStops.find((stop) => stop.id === 'porcelain');
    expect(porcelainStop).toMatchObject({
      name: '景德镇陶瓷',
      assetKey: 'porcelain',
      museumLine: expect.stringContaining('白如玉'),
      camera: {
        x: expect.any(Number),
        y: expect.any(Number),
        z: expect.any(Number)
      }
    });
  });

  it('reduces particle count for mobile and reduced-motion users', () => {
    const desktopCount = getParticleCount({ width: 1600, hardwareConcurrency: 12 });
    const mobileCount = getParticleCount({ width: 420, hardwareConcurrency: 4 });
    const reducedCount = getParticleCount({ width: 1400, hardwareConcurrency: 8, reducedMotion: true });

    expect(desktopCount).toBeGreaterThanOrEqual(56000);
    expect(mobileCount).toBeLessThanOrEqual(22000);
    expect(reducedCount).toBeLessThanOrEqual(10000);
    expect(desktopCount).toBeGreaterThan(mobileCount);
    expect(mobileCount).toBeGreaterThan(reducedCount);
  });

  it('uses a smaller GLB target size on narrow screens', () => {
    expect(getModelTargetSize(390)).toBeLessThan(getModelTargetSize(1280));
  });
});
