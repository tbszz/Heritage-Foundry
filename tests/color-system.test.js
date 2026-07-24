import { describe, expect, it } from 'vitest';
import { BEAD_COLOR_MAPPINGS } from '../src/utils/beadColorMappings.js';
import { COLOR_SYSTEMS, PALETTE_COLORS, getColorKeyByHex } from '../src/utils/colorSystem.js';

describe('bead brand color systems', () => {
  it('uses verified brand codes instead of synthetic index prefixes', () => {
    expect(getColorKeyByHex('#FAF4C8', 'MARD')).toBe('A01');
    expect(getColorKeyByHex('#FAF4C8', 'COCO')).toBe('E02');
    expect(getColorKeyByHex('#EDEDED', 'MARD')).toBe('H09');
    expect(getColorKeyByHex('#000000', '漫漫')).toBe('F7');
    expect(getColorKeyByHex('#D50D21', '咪小窝')).toBe('52');
  });

  it('returns a visible unknown marker for colors outside the verified mapping', () => {
    expect(getColorKeyByHex('#123456', 'MARD')).toBe('?');
  });

  it('covers every selectable palette color in every exposed brand system', () => {
    expect(Object.keys(BEAD_COLOR_MAPPINGS)).toHaveLength(PALETTE_COLORS.length);
    for (const { hex } of PALETTE_COLORS) {
      expect(BEAD_COLOR_MAPPINGS[hex.toUpperCase()]).toBeDefined();
      for (const system of COLOR_SYSTEMS) {
        expect(BEAD_COLOR_MAPPINGS[hex.toUpperCase()][system]).toBeTruthy();
      }
    }
  });
});
