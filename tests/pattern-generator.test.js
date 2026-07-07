import { describe, expect, it } from 'vitest';
import {
  createPatternFromImageData,
  summarizePattern,
  calculateStats
} from '../src/utils/patternGenerator.js';

function makeImageData(width, height, pixels) {
  const data = new Uint8ClampedArray(width * height * 4);
  pixels.forEach(([r, g, b, a], index) => {
    const offset = index * 4;
    data[offset] = r;
    data[offset + 1] = g;
    data[offset + 2] = b;
    data[offset + 3] = a;
  });

  return { width, height, data };
}

describe('pattern generation from image data', () => {
  it('maps source pixels into a bead grid with color keys and statistics', () => {
    const imageData = makeImageData(2, 2, [
      [211, 56, 47, 255],
      [31, 122, 109, 255],
      [201, 154, 46, 255],
      [255, 255, 255, 0]
    ]);

    const pattern = createPatternFromImageData(imageData, 2, 2, {
      mode: 'dominant',
      colorSystem: 'MARD',
      removeBackground: true
    });
    const summary = summarizePattern(pattern);
    const stats = calculateStats(summary);

    expect(pattern).toHaveLength(4);
    expect(pattern[0]).toMatchObject({ hex: expect.any(String), key: expect.any(String), isExternal: false });
    expect(pattern[3]).toMatchObject({ isExternal: true });
    expect(stats.beadCount).toBe(3);
    expect(stats.colorCount).toBe(3);
  });
});
