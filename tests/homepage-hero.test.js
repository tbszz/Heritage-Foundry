import { describe, expect, it } from 'vitest';
import { CRAFTS_DATA } from '../src/utils/craftData.js';
import {
  getHomepageCraftLinks,
  getHomepageCrafts,
  getHomepageCraftIntro,
  getInitialHomepageCraft,
  resolveHomepageSelection
} from '../src/home.js';
import * as Home from '../src/home.js';

describe('homepage heritage hero', () => {
  it('builds the selector from crafts that have GLB models', () => {
    const homepageCrafts = getHomepageCrafts(CRAFTS_DATA);

    expect(homepageCrafts.length).toBeGreaterThan(0);
    expect(homepageCrafts.every((craft) => Boolean(craft.modelUrl))).toBe(true);
    expect(homepageCrafts.map((craft) => craft.id)).toContain('heritage-001');
    expect(homepageCrafts.map((craft) => craft.id)).toContain('heritage-100');
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

    expect(initialCraft).toEqual(CRAFTS_DATA.find((craft) => craft.id === 'heritage-001'));
  });

  it('builds craft-specific homepage links for the selected craft', () => {
    expect(getHomepageCraftLinks('porcelain')).toEqual({
      craftHref: 'crafts.html?craft=porcelain',
      generatorHref: 'generator.html?craft=porcelain'
    });

    expect(getHomepageCraftLinks('lanterns')).toEqual({
      craftHref: 'crafts.html?craft=lanterns',
      generatorHref: 'generator.html?craft=lanterns'
    });
  });

  it('keeps the latest requested craft during rapid selection', () => {
    const crafts = getHomepageCrafts(CRAFTS_DATA);
    const currentCraft = crafts.find((craft) => craft.id === 'heritage-081');
    const requestedCraft = crafts.find((craft) => craft.id === 'heritage-001');

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

    expect(tourStops).toHaveLength(100);
    expect(tourStops[0]).toMatchObject({
      index: 0,
      id: 'heritage-001',
      iconUrl: '/assets/heritage/heritage-001.webp',
      stopLabel: '01'
    });

    const porcelainStop = tourStops.find((stop) => stop.id === 'heritage-001');
    expect(porcelainStop).toMatchObject({
      name: '景德镇青花梅瓶',
      assetKey: 'heritage-001',
      museumLine: expect.stringContaining('陶瓷'),
      camera: {
        x: expect.any(Number),
        y: expect.any(Number),
        z: expect.any(Number)
      }
    });
  });

});
