import { describe, expect, it } from 'vitest';
import { CRAFTS_DATA } from '../src/utils/craftData.js';
import { getCraftRenderMode } from '../src/components/ThreeScene.js';

describe('craft model render mode', () => {
  it('uses the external GLB assets for crafts that have user-provided models', () => {
    const modelCrafts = ['tea', 'kites', 'wood-carving', 'tangka'];

    const modes = modelCrafts.map((id) => {
      const craft = CRAFTS_DATA.find((item) => item.id === id);
      return [id, getCraftRenderMode(craft)];
    });

    expect(Object.fromEntries(modes)).toEqual({
      tea: 'glb',
      kites: 'glb',
      'wood-carving': 'glb',
      tangka: 'glb'
    });
  });
});
