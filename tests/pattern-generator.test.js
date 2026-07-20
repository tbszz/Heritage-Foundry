import { describe, expect, it } from 'vitest';
import {
  createPatternFromImageData,
  summarizePattern,
  calculateStats,
  renderPatternHTML,
  serializePatternCSV,
  getPatternDetailProfile,
  getPatternExportLayout
} from '../src/utils/patternGenerator.js';
import { PALETTE_COLORS, colorDistance, hexToRgb } from '../src/utils/colorSystem.js';

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

function solidImageData(width, height, [r, g, b, a = 255]) {
  return makeImageData(
    width,
    height,
    Array.from({ length: width * height }, () => [r, g, b, a])
  );
}

function setPixel(imageData, x, y, [r, g, b, a = 255]) {
  const offset = (y * imageData.width + x) * 4;
  imageData.data[offset] = r;
  imageData.data[offset + 1] = g;
  imageData.data[offset + 2] = b;
  imageData.data[offset + 3] = a;
}

function fillRect(imageData, startX, startY, width, height, color) {
  for (let y = startY; y < startY + height; y += 1) {
    for (let x = startX; x < startX + width; x += 1) {
      setPixel(imageData, x, y, color);
    }
  }
}

function makeMultiScaleDetailFixture() {
  const imageData = solidImageData(384, 384, [237, 237, 237, 255]);
  fillRect(imageData, 42, 42, 300, 300, [0, 0, 0, 255]);
  for (let y = 60; y <= 324; y += 24) {
    for (let x = 60; x <= 324; x += 24) {
      const band = ((x + y) / 24) % 4;
      if (band === 0) fillRect(imageData, x, y, 3, 3, [252, 61, 70, 255]);
      if (band === 2) fillRect(imageData, x, y, 2, 3, [26, 96, 195, 255]);
    }
  }
  return imageData;
}

function countHex(pattern, hex) {
  return pattern.filter((cell) => !cell.isExternal && cell.hex === hex).length;
}

function getForegroundBounds(pattern, width) {
  const points = pattern
    .map((cell, index) => ({ cell, x: index % width, y: Math.floor(index / width) }))
    .filter(({ cell }) => cell && !cell.isExternal);

  if (!points.length) return null;

  const xs = points.map(({ x }) => x);
  const ys = points.map(({ y }) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  };
}

describe('pattern generation from image data', () => {
  it('increases source sampling and usable colors for 96 and 128 high-density boards', () => {
    expect(getPatternDetailProfile(64, 64)).toMatchObject({
      sourceDecodeLimit: 512,
      maxColors: 16,
      minComponentSize: 2,
      minimumForegroundCoverage: 0.12
    });
    expect(getPatternDetailProfile(96, 96)).toMatchObject({
      sourceDecodeLimit: 768,
      maxColors: 16,
      minComponentSize: 2,
      minimumForegroundCoverage: 0.1
    });
    expect(getPatternDetailProfile(128, 128)).toMatchObject({
      sourceDecodeLimit: 1024,
      maxColors: 20,
      minComponentSize: 2,
      minimumForegroundCoverage: 0.08
    });
  });

  it('keeps a 128 by 128 PNG export below a practical 3200 pixel canvas edge', () => {
    const layout = getPatternExportLayout(128, 128);

    expect(layout.downloadCellSize).toBeLessThan(30);
    expect(layout.downloadWidth).toBeLessThanOrEqual(3200);
    expect(layout.downloadHeight).toBeLessThanOrEqual(3200);
  });

  it('recovers genuine micro-details at 96 and 128 instead of only enlarging the 64 grid', () => {
    const imageData = makeMultiScaleDetailFixture();
    const options = {
      removeBackground: true,
      fitSubject: true,
      subjectPadding: 0.06,
      mode: 'dominant'
    };
    const pattern64 = createPatternFromImageData(imageData, 64, 64, options);
    const pattern96 = createPatternFromImageData(imageData, 96, 96, options);
    const pattern128 = createPatternFromImageData(imageData, 128, 128, options);
    const red = '#FC3D46';
    const blue = '#1A60C3';

    expect(countHex(pattern64, red)).toBe(0);
    expect(countHex(pattern64, blue)).toBe(0);
    expect(countHex(pattern96, red)).toBeGreaterThan(0);
    expect(countHex(pattern128, red)).toBeGreaterThan(countHex(pattern96, red));
    expect(countHex(pattern128, blue)).toBeGreaterThan(countHex(pattern96, blue));
  });

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

  it('reports a realistic multi-hour estimate for a high-density board', () => {
    const stats = calculateStats({
      '#FC3D46': { key: 'F02', name: '鲜红', color: '#FC3D46', count: 9216 }
    });

    expect(stats.timeCost).toBe('约 16 小时');
    expect(stats.difficulty).toBe('大师级');
  });

  it('removes an opaque grey paper background before it becomes M-064 beads', () => {
    const imageData = solidImageData(7, 7, [237, 237, 237, 255]);
    fillRect(imageData, 2, 2, 3, 3, [252, 61, 70, 255]);

    const pattern = createPatternFromImageData(imageData, 7, 7, {
      fitSubject: false,
      minComponentSize: 1,
      maxColors: 0
    });
    const summary = summarizePattern(pattern);

    expect(pattern.filter((cell) => cell.isExternal)).toHaveLength(40);
    expect(pattern.filter((cell) => !cell.isExternal)).toHaveLength(9);
    expect(summary['#EDEDED']).toBeUndefined();
    expect(calculateStats(summary).beadCount).toBe(9);
  });

  it('still removes an opaque paper background when one border pixel is transparent', () => {
    const imageData = solidImageData(7, 7, [237, 237, 237, 255]);
    setPixel(imageData, 0, 0, [0, 0, 0, 0]);
    fillRect(imageData, 2, 2, 3, 3, [252, 61, 70, 255]);

    const pattern = createPatternFromImageData(imageData, 7, 7, {
      fitSubject: false,
      minComponentSize: 1,
      maxColors: 0
    });

    expect(pattern.filter((cell) => !cell.isExternal)).toHaveLength(9);
    expect(summarizePattern(pattern)['#EDEDED']).toBeUndefined();
  });

  it('preserves a low-contrast subject instead of absorbing it into a neutral background', () => {
    const imageData = solidImageData(7, 7, [237, 237, 237, 255]);
    fillRect(imageData, 2, 2, 3, 3, [220, 220, 220, 255]);

    const pattern = createPatternFromImageData(imageData, 7, 7, {
      fitSubject: false,
      minComponentSize: 1,
      maxColors: 0
    });

    expect(pattern.filter((cell) => !cell.isExternal)).toHaveLength(9);
  });

  it('ignores a single neutral edge outlier instead of swallowing a low-contrast subject', () => {
    const imageData = solidImageData(41, 41, [237, 237, 237, 255]);
    fillRect(imageData, 12, 12, 17, 17, [220, 220, 220, 255]);
    setPixel(imageData, 20, 0, [200, 210, 210, 255]);

    const pattern = createPatternFromImageData(imageData, 41, 41, {
      fitSubject: false,
      minComponentSize: 2,
      maxColors: 0
    });

    expect(pattern.filter((cell) => !cell.isExternal)).toHaveLength(17 * 17);
  });

  it('removes a textured dark neutral background without turning it into fake black beads', () => {
    for (const amplitude of [15, 20]) {
      const imageData = solidImageData(41, 41, [35, 35, 35, 255]);
      const span = amplitude * 2 + 1;
      for (let y = 0; y < imageData.height; y += 1) {
        for (let x = 0; x < imageData.width; x += 1) {
          const redNoise = ((x * 17 + y * 31) % span) - amplitude;
          const greenNoise = ((x * 23 + y * 13) % span) - amplitude;
          const blueNoise = ((x * 11 + y * 29) % span) - amplitude;
          setPixel(imageData, x, y, [35 + redNoise, 35 + greenNoise, 35 + blueNoise, 255]);
        }
      }
      fillRect(imageData, 13, 10, 15, 21, [213, 13, 33, 255]);

      const pattern = createPatternFromImageData(imageData, 41, 41, {
        minComponentSize: 2,
        maxColors: 0
      });
      const foregroundCount = pattern.filter((cell) => !cell.isExternal).length;
      const bounds = getForegroundBounds(pattern, 41);

      expect(foregroundCount).toBeGreaterThanOrEqual(800);
      expect(foregroundCount).toBeLessThanOrEqual(1100);
      expect(bounds.height).toBeGreaterThanOrEqual(34);
      expect(bounds.width / bounds.height).toBeCloseTo(15 / 21, 1);
    }
  });

  it('keeps enclosed negative space empty in a ring-shaped subject', () => {
    const imageData = solidImageData(11, 11, [237, 237, 237, 255]);
    fillRect(imageData, 3, 3, 5, 5, [252, 61, 70, 255]);
    fillRect(imageData, 4, 4, 3, 3, [237, 237, 237, 255]);

    const pattern = createPatternFromImageData(imageData, 11, 11, {
      fitSubject: false,
      minComponentSize: 1,
      maxColors: 0
    });

    expect(pattern.filter((cell) => !cell.isExternal)).toHaveLength(16);
    expect(pattern[5 * 11 + 5].isExternal).toBe(true);
  });

  it('does not erase a saturated full-frame artwork as if it were neutral paper', () => {
    const imageData = solidImageData(7, 7, [213, 13, 33, 255]);
    fillRect(imageData, 2, 2, 3, 3, [244, 215, 56, 255]);

    const pattern = createPatternFromImageData(imageData, 7, 7, {
      fitSubject: false,
      minComponentSize: 1,
      maxColors: 0
    });

    expect(pattern.filter((cell) => !cell.isExternal)).toHaveLength(49);
  });

  it('auto-crops a small subject, preserves its aspect ratio, and centers it in the board', () => {
    const imageData = solidImageData(20, 20, [0, 0, 0, 0]);
    fillRect(imageData, 8, 6, 4, 8, [252, 61, 70, 255]);

    const pattern = createPatternFromImageData(imageData, 32, 32, {
      subjectPadding: 0.08,
      minComponentSize: 1,
      maxColors: 0
    });
    const bounds = getForegroundBounds(pattern, 32);

    expect(bounds).not.toBeNull();
    expect(bounds.height).toBeGreaterThanOrEqual(26);
    expect(bounds.width / bounds.height).toBeCloseTo(0.5, 1);
    expect(Math.abs((bounds.minX + bounds.maxX) / 2 - 15.5)).toBeLessThanOrEqual(1);
    expect(Math.abs((bounds.minY + bounds.maxY) / 2 - 15.5)).toBeLessThanOrEqual(1);
  });

  it('removes disconnected one-bead noise without erasing the connected subject', () => {
    const imageData = solidImageData(9, 9, [0, 0, 0, 0]);
    fillRect(imageData, 3, 3, 3, 3, [252, 61, 70, 255]);
    setPixel(imageData, 0, 0, [252, 61, 70, 255]);

    const pattern = createPatternFromImageData(imageData, 9, 9, {
      fitSubject: false,
      minComponentSize: 2,
      maxColors: 0
    });

    expect(pattern[0].isExternal).toBe(true);
    expect(pattern.filter((cell) => !cell.isExternal)).toHaveLength(9);
  });

  it('caps the material palette while retaining every bead position', () => {
    const colors = [
      [244, 215, 56, 255],
      [254, 139, 76, 255],
      [252, 61, 70, 255],
      [53, 199, 91, 255],
      [26, 96, 195, 255],
      [154, 86, 180, 255]
    ];
    const imageData = makeImageData(6, 1, colors);

    const pattern = createPatternFromImageData(imageData, 6, 1, {
      removeBackground: false,
      fitSubject: false,
      minComponentSize: 1,
      maxColors: 3
    });
    const summary = summarizePattern(pattern);

    expect(pattern.filter((cell) => !cell.isExternal)).toHaveLength(6);
    expect(Object.keys(summary)).toHaveLength(3);
  });

  it('selects a color-diverse limited palette instead of keeping the first equal-frequency colors', () => {
    const sourceColors = PALETTE_COLORS.slice(0, 20).map(({ hex }) => {
      const rgb = hexToRgb(hex);
      return [rgb.r, rgb.g, rgb.b, 255];
    });
    const imageData = makeImageData(sourceColors.length, 1, sourceColors);

    const pattern = createPatternFromImageData(imageData, sourceColors.length, 1, {
      removeBackground: false,
      fitSubject: false,
      minComponentSize: 1,
      maxColors: 12
    });
    const maximumError = Math.max(...pattern.map((cell, index) => {
      const [r, g, b] = sourceColors[index];
      return colorDistance({ r, g, b }, hexToRgb(cell.hex));
    }));

    expect(Object.keys(summarizePattern(pattern))).toHaveLength(12);
    expect(maximumError).toBeLessThan(12);
  });

  it('renders empty board positions without visible color codes over the artwork', () => {
    const html = renderPatternHTML([
      { key: '', name: '外部背景', hex: '#FFFFFF', isExternal: true },
      { key: 'F02', name: '鲜红', hex: '#FC3D46', isExternal: false }
    ], 2);

    expect(html).toContain('bead-cell is-external');
    expect(html).toContain('data-key="F02"');
    expect(html).toContain('title="F02 · 鲜红"');
    expect(html).not.toContain('>F02</div>');
  });

  it('keeps a 128 by 128 board visually compact instead of making an oversized preview', () => {
    const html = renderPatternHTML(
      Array.from({ length: 128 * 128 }, () => ({
        key: 'F02',
        name: '鲜红',
        hex: '#FC3D46',
        isExternal: false
      })),
      128
    );

    expect(html).toContain('--bead-size: 5px');
    expect(html).toContain('--bead-gap: 0.5px');
    expect(html).toContain('--bead-border: 0.5px');
    expect(html).toContain('--bead-hole: 22%');
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    expect(html.match(/tabindex="-1"/g)).toHaveLength(128 * 128 - 1);
  });

  it('serializes an actionable color-code matrix and ignores external cells', () => {
    const csv = serializePatternCSV([
      { key: '', name: '外部背景', hex: '#FFFFFF', isExternal: true },
      { key: 'F02', name: '鲜红', hex: '#FC3D46', isExternal: false },
      { key: 'F02', name: '鲜红', hex: '#FC3D46', isExternal: false },
      { key: '', name: '外部背景', hex: '#FFFFFF', isExternal: true }
    ], 2, 2, 'MARD');

    expect(csv).toContain('色号体系,MARD');
    expect(csv).toContain('图纸尺寸,2x2');
    expect(csv).toContain(',F02');
    expect(csv).toContain('F02,鲜红,#FC3D46,2,3');
    expect(csv).not.toContain('#FFFFFF');
  });

  it('derives export codes from the requested brand rather than a stale cached key', () => {
    const csv = serializePatternCSV([
      { key: 'A01', name: '浅米黄', hex: '#FAF4C8', isExternal: false }
    ], 1, 1, 'COCO');

    expect(csv).toContain('色号体系,COCO');
    expect(csv).toContain('E02');
    expect(csv).not.toContain('A01');
  });

  it('serializes a complete 128 by 128 color matrix without truncating rows or columns', () => {
    const pattern = Array.from({ length: 128 * 128 }, () => ({
      key: 'F02',
      name: '鲜红',
      hex: '#FC3D46',
      isExternal: false
    }));
    const csv = serializePatternCSV(pattern, 128, 128, 'MARD');
    const matrix = csv
      .split('\n')
      .slice(csv.split('\n').indexOf('色号矩阵') + 1, csv.split('\n').indexOf('材料清单') - 1);

    expect(matrix).toHaveLength(128);
    expect(matrix.every((row) => row.split(',').length === 128)).toBe(true);
  });
});
