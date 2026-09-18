import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import manifest from '../public/data/heritage-collection.json';
import { getCraftById, getGeneratorCraftId, getGeneratorCrafts } from '../src/utils/craftData.js';
import { getMuseumChapters } from '../src/home.js';
const { buildEnhancedPrompt } = createRequire(import.meta.url)('../services/promptService.js');

describe('shared 100-exhibit collection', () => {
  it('keeps every manifest model selectable and uses its own server prompt', () => {
    expect(manifest.items).toHaveLength(100);
    const selectable = new Set(getGeneratorCrafts().map(item => item.id));
    for (const item of manifest.items) {
      expect(getCraftById(item.id).modelUrl).toBe(item.modelUrl);
      expect(selectable.has(item.id)).toBe(true);
      expect(getGeneratorCraftId(item.id)).toBe(item.id);
      expect(buildEnhancedPrompt('test', 'modern', item.id, {})).toContain(item.name);
    }
  });
  it('places each exhibit exactly once in a room within the twenty-stand capacity', () => {
    const rooms = getMuseumChapters();
    const ids = rooms.flatMap(room => room.crafts.map(item => item.id));
    expect(ids).toHaveLength(100);
    expect(new Set(ids)).toEqual(new Set(manifest.items.map(item => item.id)));
    expect(rooms.every(room => room.crafts.length > 0 && room.crafts.length === 20)).toBe(true);
  });
});
