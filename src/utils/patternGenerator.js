import {
  PALETTE_COLORS,
  hexToRgb,
  colorDistance,
  findClosestPaletteColor,
  getColorKeyByHex,
  getActiveColorSystem
} from './colorSystem.js';

export const PALETTE = {
  r: { key: 'A', name: '朱砂红', code: 'A-12', color: '#d3382f' },
  g: { key: 'B', name: '孔雀绿', code: 'C-34', color: '#1f7a6d' },
  y: { key: 'C', name: '鎏金黄', code: 'S-08', color: '#c99a2e' },
  b: { key: 'D', name: '靛青蓝', code: 'M-22', color: '#2f5f9f' }
};

export const COLOR_CLASSES = ['r', 'g', 'y', 'b'];

export const DEFAULT_PATTERN_SIZE = 96;

export function getPatternDetailProfile(width, height) {
  const largestDimension = Math.max(Number(width) || 0, Number(height) || 0);
  if (largestDimension >= 128) {
    return {
      sourceDecodeLimit: 1024,
      maxColors: 20,
      minComponentSize: 2,
      minimumForegroundCoverage: 0.08
    };
  }
  if (largestDimension >= 96) {
    return {
      sourceDecodeLimit: 768,
      maxColors: 16,
      minComponentSize: 2,
      minimumForegroundCoverage: 0.1
    };
  }
  if (largestDimension >= 64) {
    return {
      sourceDecodeLimit: 512,
      maxColors: 16,
      minComponentSize: 2,
      minimumForegroundCoverage: 0.12
    };
  }
  return {
    sourceDecodeLimit: 512,
    maxColors: 12,
    minComponentSize: 2,
    minimumForegroundCoverage: 0.14
  };
}

function createExternalCell() {
  return {
    key: '',
    name: '外部背景',
    hex: '#FFFFFF',
    isExternal: true
  };
}

export function buildPattern(width, height, seed = 1) {
  const center = (width - 1) / 2;
  return Array.from({ length: width * height }, (_, index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    const mirror = Math.abs(x - center);
    const wave = Math.sin((y + seed) * 0.65) * 1.7;
    const petal = mirror < 2.2 + wave && y > 1 && y < height - 1;
    const border = y > 2 && y < height - 2 && (x + y + seed) % 7 === 0;
    const eye = Math.abs(x - center) < 0.8 && y > 3 && y < height - 3;
    const wing = y > 4 && y < height - 3 && mirror > 4 && mirror < 7 && (x + seed) % 2 === 0;
    const active = petal || border || eye || wing;
    if (!active) return '';
    if (eye) return 'y';
    if (wing) return x < center ? 'g' : 'b';
    return COLOR_CLASSES[(x * 3 + y * 5 + seed) % COLOR_CLASSES.length];
  });
}

export function summarizePattern(pattern) {
  return pattern.reduce((acc, name) => {
    if (!name) return acc;

    if (typeof name === 'object') {
      if (name.isExternal || !name.hex) return acc;
      const key = name.hex.toUpperCase();
      acc[key] = acc[key] || {
        key: name.key || '',
        name: name.name || '拼豆色',
        color: key,
        count: 0
      };
      acc[key].count += 1;
      return acc;
    }

    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {});
}

function getSummaryCount(value) {
  return typeof value === 'number' ? value : value?.count || 0;
}

function getSummaryColorCount(summary) {
  return Object.values(summary).filter((value) => getSummaryCount(value) > 0).length;
}

function escapeAttribute(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function renderPatternHTML(pattern, width) {
  const rows = [];
  const firstInteractiveIndex = pattern.findIndex((cell) => (
    typeof cell === 'string'
      ? Boolean(PALETTE[cell])
      : Boolean(cell?.hex && !cell.isExternal)
  ));
  const cellSize = width <= 29 ? 14 : width <= 48 ? 10 : width <= 64 ? 8 : width <= 96 ? 6 : 5;
  const cellGap = width <= 64 ? 1 : width <= 96 ? 0.75 : 0.5;
  const cellBorder = width <= 64 ? 1 : width <= 96 ? 0.75 : 0.5;
  const cellHole = width <= 64 ? 30 : width <= 96 ? 26 : 22;
  for (let y = 0; y < Math.ceil(pattern.length / width); y++) {
    const rowCells = [];
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const colorClass = pattern[idx];
      let bgColor = 'transparent';
      let dataKey = '';
      let colorName = '空位';
      let isExternal = !colorClass || colorClass?.isExternal;
      
      if (typeof colorClass === 'string' && PALETTE[colorClass]) {
        bgColor = PALETTE[colorClass].color;
        dataKey = PALETTE[colorClass].key;
        colorName = PALETTE[colorClass].name;
        isExternal = false;
      } else if (typeof colorClass === 'object' && colorClass.hex && !colorClass.isExternal) {
        bgColor = colorClass.hex;
        dataKey = colorClass.key || '';
        colorName = colorClass.name || '拼豆色';
        isExternal = false;
      }

      const classes = `bead-cell${isExternal ? ' is-external' : ''}`;
      const label = isExternal ? `第 ${y + 1} 行，第 ${x + 1} 列，空位` : `${dataKey} · ${colorName}`;
      const title = isExternal ? '' : `${dataKey} · ${colorName}`;
      rowCells.push(
        `<div class="${classes}" style="--bead-color: ${escapeAttribute(bgColor)}" data-index="${idx}" data-key="${escapeAttribute(dataKey)}" aria-label="${escapeAttribute(label)}" tabindex="${idx === firstInteractiveIndex ? '0' : '-1'}"${title ? ` title="${escapeAttribute(title)}"` : ''}></div>`
      );
    }
    rows.push(`<div class="bead-row">${rowCells.join('')}</div>`);
  }
  return `<div class="bead-grid" style="--bead-size: ${cellSize}px; --bead-gap: ${cellGap}px; --bead-border: ${cellBorder}px; --bead-hole: ${cellHole}%">${rows.join('')}</div>`;
}

export function calculateStats(summary) {
  const beadCount = Object.values(summary).reduce((sum, count) => sum + getSummaryCount(count), 0);
  const colorCount = getSummaryColorCount(summary);
  const timeCost = beadCount > 600
    ? `约 ${Math.max(2, Math.ceil(beadCount / 600))} 小时`
    : beadCount > 180 ? '90 分钟' : beadCount > 95 ? '45 分钟' : '30 分钟';
  const difficulty = beadCount > 6000
    ? '大师级'
    : beadCount > 2000 ? '高阶' : beadCount > 105 ? '进阶' : '入门';
  
  return { beadCount, colorCount, timeCost, difficulty };
}

function getCellRepresentativeColor(
  imageData,
  startX,
  startY,
  endX,
  endY,
  mode,
  backgroundMask,
  minimumForegroundCoverage
) {
  const { data, width: imageWidth } = imageData;
  const colorCounts = new Map();
  let maxCount = 0;
  let dominantColor = null;
  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let totalPixels = 0;
  let sampledPixels = 0;

  const minX = Math.max(0, Math.floor(startX));
  const minY = Math.max(0, Math.floor(startY));
  const maxX = Math.min(imageData.width, Math.max(minX + 1, Math.ceil(endX)));
  const maxY = Math.min(imageData.height, Math.max(minY + 1, Math.ceil(endY)));

  for (let y = minY; y < maxY; y += 1) {
    for (let x = minX; x < maxX; x += 1) {
      const offset = (y * imageWidth + x) * 4;
      const alpha = data[offset + 3];
      const pixelIndex = y * imageWidth + x;
      sampledPixels += 1;

      if (alpha < 128 || backgroundMask[pixelIndex]) {
        continue;
      }

      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      totalPixels += 1;

      if (mode === 'average') {
        totalR += r;
        totalG += g;
        totalB += b;
      } else {
        const bucket = `${Math.round(r / 8) * 8},${Math.round(g / 8) * 8},${Math.round(b / 8) * 8}`;
        const nextCount = (colorCounts.get(bucket) || 0) + 1;
        colorCounts.set(bucket, nextCount);
        if (nextCount > maxCount) {
          maxCount = nextCount;
          dominantColor = { r, g, b };
        }
      }
    }
  }

  if (totalPixels === 0 || totalPixels / Math.max(1, sampledPixels) < minimumForegroundCoverage) {
    return null;
  }

  if (mode === 'average') {
    return {
      r: Math.round(totalR / totalPixels),
      g: Math.round(totalG / totalPixels),
      b: Math.round(totalB / totalPixels)
    };
  }

  return dominantColor;
}

function getPixelRgb(imageData, index) {
  const offset = index * 4;
  return {
    r: imageData.data[offset],
    g: imageData.data[offset + 1],
    b: imageData.data[offset + 2]
  };
}

function getBorderIndices(width, height) {
  const border = new Set();
  for (let x = 0; x < width; x += 1) {
    border.add(x);
    border.add((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    border.add(y * width);
    border.add(y * width + width - 1);
  }
  return [...border];
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function estimateEdgeBackgroundColor(imageData) {
  const neutralSamples = [];
  let opaqueBorderPixels = 0;
  for (const index of getBorderIndices(imageData.width, imageData.height)) {
    const offset = index * 4;
    if (imageData.data[offset + 3] < 128) continue;
    opaqueBorderPixels += 1;
    const rgb = getPixelRgb(imageData, index);
    const channelRange = Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b);
    if (channelRange <= 48) neutralSamples.push(rgb);
  }

  // Generated references are requested on neutral paper. A robust median keeps
  // JPEG texture/noise from splitting that paper into many unrelated color bins,
  // while the neutral-coverage gate protects saturated full-frame artwork.
  if (!neutralSamples.length || neutralSamples.length / Math.max(1, opaqueBorderPixels) < 0.6) return null;
  const color = {
    r: Math.round(median(neutralSamples.map((sample) => sample.r))),
    g: Math.round(median(neutralSamples.map((sample) => sample.g))),
    b: Math.round(median(neutralSamples.map((sample) => sample.b)))
  };
  const distances = neutralSamples
    .map((sample) => colorDistance(sample, color))
    .sort((a, b) => a - b);
  // Ignore a single isolated border outlier without losing legitimate paper
  // texture that occupies a meaningful part of the frame edge.
  const robustEdgeIndex = Math.max(0, distances.length - 2);
  const robustEdgeDistance = distances[Math.max(0, robustEdgeIndex)] || 0;
  return {
    color,
    adaptiveTolerance: Math.min(14, robustEdgeDistance + 0.75)
  };
}

function isBackgroundCandidate(imageData, index, backgroundColor, tolerance) {
  const offset = index * 4;
  if (imageData.data[offset + 3] < 128) return true;
  if (!backgroundColor) return false;

  const rgb = getPixelRgb(imageData, index);
  return colorDistance(rgb, backgroundColor) <= tolerance;
}

function markEnclosedBackgroundRegions(imageData, mask, backgroundColor, tolerance, minimumSize) {
  if (!backgroundColor) return;
  const visited = new Uint8Array(mask.length);

  for (let start = 0; start < mask.length; start += 1) {
    if (mask[start] || visited[start] || !isBackgroundCandidate(imageData, start, backgroundColor, tolerance)) continue;
    const component = [];
    const stack = [start];
    visited[start] = 1;

    while (stack.length) {
      const index = stack.pop();
      component.push(index);
      const x = index % imageData.width;
      const y = Math.floor(index / imageData.width);
      const neighbors = [];
      if (x > 0) neighbors.push(index - 1);
      if (x < imageData.width - 1) neighbors.push(index + 1);
      if (y > 0) neighbors.push(index - imageData.width);
      if (y < imageData.height - 1) neighbors.push(index + imageData.width);
      for (const neighbor of neighbors) {
        if (
          !mask[neighbor]
          && !visited[neighbor]
          && isBackgroundCandidate(imageData, neighbor, backgroundColor, tolerance)
        ) {
          visited[neighbor] = 1;
          stack.push(neighbor);
        }
      }
    }

    if (component.length >= minimumSize) {
      for (const index of component) mask[index] = 1;
    }
  }
}

function createBackgroundMask(imageData, removeBackground, tolerance, targetWidth, targetHeight) {
  const pixelCount = imageData.width * imageData.height;
  const mask = new Uint8Array(pixelCount);

  for (let index = 0; index < pixelCount; index += 1) {
    if (imageData.data[index * 4 + 3] < 128) mask[index] = 1;
  }

  if (!removeBackground) return mask;

  const backgroundEstimate = estimateEdgeBackgroundColor(imageData);
  const backgroundColor = backgroundEstimate?.color || null;
  const effectiveTolerance = Math.max(tolerance, backgroundEstimate?.adaptiveTolerance || 0);
  const stack = [];
  for (const index of getBorderIndices(imageData.width, imageData.height)) {
    if (isBackgroundCandidate(imageData, index, backgroundColor, effectiveTolerance)) stack.push(index);
  }

  while (stack.length > 0) {
    const index = stack.pop();
    if (index < 0 || index >= pixelCount || mask[index] === 2) continue;
    if (!isBackgroundCandidate(imageData, index, backgroundColor, effectiveTolerance)) continue;
    mask[index] = 2;

    const x = index % imageData.width;
    const y = Math.floor(index / imageData.width);
    if (x > 0) stack.push(index - 1);
    if (x < imageData.width - 1) stack.push(index + 1);
    if (y > 0) stack.push(index - imageData.width);
    if (y < imageData.height - 1) stack.push(index + imageData.width);
  }

  for (let index = 0; index < pixelCount; index += 1) {
    mask[index] = mask[index] ? 1 : 0;
  }
  const sourcePixelsPerBead = pixelCount / Math.max(1, targetWidth * targetHeight);
  markEnclosedBackgroundRegions(
    imageData,
    mask,
    backgroundColor,
    effectiveTolerance,
    Math.max(4, Math.round(sourcePixelsPerBead * 0.5))
  );
  return mask;
}

function getForegroundBounds(imageData, backgroundMask) {
  let minX = imageData.width;
  let minY = imageData.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < imageData.height; y += 1) {
    for (let x = 0; x < imageData.width; x += 1) {
      if (backgroundMask[y * imageData.width + x]) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) return null;
  return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function getSamplingLayout(imageData, foregroundBounds, width, height, fitSubject, subjectPadding) {
  if (!fitSubject) {
    return {
      source: { minX: 0, minY: 0, width: imageData.width, height: imageData.height },
      target: { x: 0, y: 0, width, height }
    };
  }

  const margin = Math.min(
    Math.floor((Math.min(width, height) - 1) / 2),
    Math.max(width >= 10 && height >= 10 ? 1 : 0, Math.round(Math.min(width, height) * subjectPadding))
  );
  const availableWidth = Math.max(1, width - margin * 2);
  const availableHeight = Math.max(1, height - margin * 2);
  const scale = Math.min(availableWidth / foregroundBounds.width, availableHeight / foregroundBounds.height);
  const targetWidth = Math.max(1, Math.min(availableWidth, Math.round(foregroundBounds.width * scale)));
  const targetHeight = Math.max(1, Math.min(availableHeight, Math.round(foregroundBounds.height * scale)));

  return {
    source: foregroundBounds,
    target: {
      x: Math.floor((width - targetWidth) / 2),
      y: Math.floor((height - targetHeight) / 2),
      width: targetWidth,
      height: targetHeight
    }
  };
}

function removeSmallComponents(pattern, width, height, minimumSize) {
  if (minimumSize <= 1) return pattern;
  const result = pattern.map((cell) => ({ ...cell }));
  const visited = new Uint8Array(result.length);

  for (let start = 0; start < result.length; start += 1) {
    if (visited[start] || result[start]?.isExternal) continue;
    const component = [];
    const stack = [start];
    visited[start] = 1;

    while (stack.length) {
      const index = stack.pop();
      component.push(index);
      const x = index % width;
      const y = Math.floor(index / width);
      const neighbors = [];
      if (x > 0) neighbors.push(index - 1);
      if (x < width - 1) neighbors.push(index + 1);
      if (y > 0) neighbors.push(index - width);
      if (y < height - 1) neighbors.push(index + width);
      for (const neighbor of neighbors) {
        if (!visited[neighbor] && result[neighbor] && !result[neighbor].isExternal) {
          visited[neighbor] = 1;
          stack.push(neighbor);
        }
      }
    }

    if (component.length < minimumSize) {
      for (const index of component) result[index] = createExternalCell();
    }
  }

  return result;
}

function limitPatternColors(pattern, maxColors, colorSystem) {
  if (!Number.isFinite(maxColors) || maxColors <= 0) return pattern;
  const counts = new Map();
  const colorByHex = new Map();
  for (const cell of pattern) {
    if (!cell || cell.isExternal || !cell.hex) continue;
    const hex = cell.hex.toUpperCase();
    counts.set(hex, (counts.get(hex) || 0) + 1);
    colorByHex.set(hex, cell);
  }

  if (counts.size <= maxColors) return pattern;
  const candidates = [...counts.entries()]
    .map(([hex, count]) => ({ hex, count, rgb: hexToRgb(hex) }))
    .sort((a, b) => (b.count - a.count) || a.hex.localeCompare(b.hex));
  const retainedHexes = [candidates[0].hex];
  const retainedSet = new Set(retainedHexes);
  const maxCount = candidates[0].count;

  while (retainedHexes.length < Math.min(Math.floor(maxColors), candidates.length)) {
    let best = null;
    for (const candidate of candidates) {
      if (retainedSet.has(candidate.hex)) continue;
      const nearestDistance = Math.min(...retainedHexes.map((hex) => (
        colorDistance(candidate.rgb, hexToRgb(hex))
      )));
      const frequencyWeight = 0.55 + 0.45 * Math.sqrt(candidate.count / maxCount);
      const score = nearestDistance * frequencyWeight;
      if (!best || score > best.score) best = { candidate, score };
    }
    if (!best) break;
    retainedHexes.push(best.candidate.hex);
    retainedSet.add(best.candidate.hex);
  }
  const retained = retainedHexes.map((hex) => colorByHex.get(hex));

  return pattern.map((cell) => {
    if (!cell || cell.isExternal || retainedSet.has(cell.hex.toUpperCase())) return cell;
    const sourceRgb = hexToRgb(cell.hex);
    const closest = retained.reduce((best, candidate) => {
      const distance = colorDistance(sourceRgb, hexToRgb(candidate.hex));
      return !best || distance < best.distance ? { candidate, distance } : best;
    }, null)?.candidate;
    if (!closest) return cell;
    return {
      key: getColorKeyByHex(closest.hex, colorSystem),
      name: closest.name,
      hex: closest.hex.toUpperCase(),
      isExternal: false
    };
  });
}

export function createPatternFromImageData(
  imageData,
  width = DEFAULT_PATTERN_SIZE,
  height = DEFAULT_PATTERN_SIZE,
  options = {}
) {
  const detailProfile = getPatternDetailProfile(width, height);
  const {
    mode = 'dominant',
    colorSystem = getActiveColorSystem(),
    removeBackground = true,
    fitSubject = true,
    subjectPadding = 0.08,
    minComponentSize = detailProfile.minComponentSize,
    maxColors = detailProfile.maxColors,
    minimumForegroundCoverage = detailProfile.minimumForegroundCoverage,
    backgroundTolerance = 3.8
  } = options;

  const backgroundMask = createBackgroundMask(
    imageData,
    removeBackground,
    backgroundTolerance,
    width,
    height
  );
  const foregroundBounds = getForegroundBounds(imageData, backgroundMask);
  if (!foregroundBounds) {
    return Array.from({ length: width * height }, createExternalCell);
  }
  const layout = getSamplingLayout(imageData, foregroundBounds, width, height, fitSubject, subjectPadding);
  const pattern = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const targetX = x - layout.target.x;
      const targetY = y - layout.target.y;
      if (targetX < 0 || targetY < 0 || targetX >= layout.target.width || targetY >= layout.target.height) {
        pattern.push(createExternalCell());
        continue;
      }

      const startX = layout.source.minX + (targetX / layout.target.width) * layout.source.width;
      const startY = layout.source.minY + (targetY / layout.target.height) * layout.source.height;
      const endX = layout.source.minX + ((targetX + 1) / layout.target.width) * layout.source.width;
      const endY = layout.source.minY + ((targetY + 1) / layout.target.height) * layout.source.height;
      const representative = getCellRepresentativeColor(
        imageData,
        startX,
        startY,
        endX,
        endY,
        mode,
        backgroundMask,
        minimumForegroundCoverage
      );

      if (!representative) {
        pattern.push(createExternalCell());
        continue;
      }

      const closestColor = findClosestPaletteColor(representative);
      pattern.push({
        key: getColorKeyByHex(closestColor.hex, colorSystem),
        name: closestColor.name,
        hex: closestColor.hex.toUpperCase(),
        isExternal: false
      });
    }
  }

  const cleanedPattern = removeSmallComponents(pattern, width, height, minComponentSize);
  return limitPatternColors(cleanedPattern, maxColors, colorSystem);
}

export async function imageToPattern(
  imageUrl,
  width = DEFAULT_PATTERN_SIZE,
  height = DEFAULT_PATTERN_SIZE,
  options = {}
) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const detailProfile = getPatternDetailProfile(width, height);
        const sourceDecodeLimit = options.sourceDecodeLimit || detailProfile.sourceDecodeLimit;
        const canvas = document.createElement('canvas');
        const sourceWidth = img.naturalWidth || img.width;
        const sourceHeight = img.naturalHeight || img.height;
        const scale = Math.min(1, sourceDecodeLimit / Math.max(sourceWidth, sourceHeight));
        canvas.width = Math.max(1, Math.round(sourceWidth * scale));
        canvas.height = Math.max(1, Math.round(sourceHeight * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('浏览器无法创建图像画布');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        resolve(createPatternFromImageData(imageData, width, height, options));
      } catch (error) {
        reject(error instanceof Error ? error : new Error('拼豆图像解码失败'));
      }
    };
    
    img.onerror = () => {
      reject(new Error('无法读取生成图，未创建伪造拼豆图纸'));
    };
    
    img.src = imageUrl;
  });
}

export function generatePatternSummary(pattern) {
  const summary = {};
  for (const cell of pattern) {
    if (typeof cell === 'object' && cell.hex && !cell.isExternal) {
      const key = cell.hex;
      summary[key] = summary[key] || { count: 0, color: cell.hex, name: cell.name };
      summary[key].count++;
    } else if (typeof cell === 'string' && cell) {
      const key = cell;
      summary[key] = (summary[key] || 0) + 1;
    }
  }
  return summary;
}

export function generateColorCounts(pattern) {
  const colorCounts = {};
  for (const cell of pattern) {
    if (typeof cell === 'object' && cell.hex && !cell.isExternal) {
      colorCounts[cell.hex] = colorCounts[cell.hex] || { count: 0, color: cell.hex, name: cell.name };
      colorCounts[cell.hex].count++;
    } else if (typeof cell === 'string' && cell && PALETTE[cell]) {
      const palette = PALETTE[cell];
      colorCounts[palette.color] = colorCounts[palette.color] || { count: 0, color: palette.color, name: palette.name };
      colorCounts[palette.color].count++;
    }
  }
  return colorCounts;
}

export function getPatternExportLayout(width, height) {
  const axisLabelSize = 30;
  const extraMargin = 20;
  const largestDimension = Math.max(1, width, height);
  const downloadCellSize = Math.max(12, Math.min(30, Math.floor(3000 / largestDimension)));
  const gridWidth = width * downloadCellSize;
  const gridHeight = height * downloadCellSize;
  return {
    downloadCellSize,
    axisLabelSize,
    extraMargin,
    gridWidth,
    gridHeight,
    downloadWidth: gridWidth + axisLabelSize * 2 + extraMargin * 2,
    downloadHeight: gridHeight + axisLabelSize * 2 + extraMargin * 2 + 100
  };
}

export function downloadPatternImage(pattern, width, height, colorSystem = 'MARD') {
  const {
    downloadCellSize,
    axisLabelSize,
    extraMargin,
    gridWidth,
    gridHeight,
    downloadWidth,
    downloadHeight
  } = getPatternExportLayout(width, height);
  
  const canvas = document.createElement('canvas');
  canvas.width = downloadWidth;
  canvas.height = downloadHeight;
  const ctx = canvas.getContext('2d');
  
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, downloadWidth, downloadHeight);
  
  ctx.fillStyle = '#1F2937';
  ctx.fillRect(0, 0, downloadWidth, 60);
  
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('非遗造物局 - 拼豆图纸', 20, 30);
  
  ctx.fillStyle = '#6B7280';
  ctx.font = '14px system-ui, -apple-system, sans-serif';
  ctx.fillText(`尺寸: ${width} × ${height} | 色号系统: ${colorSystem}`, 20, 50);
  
  const startX = axisLabelSize + extraMargin;
  const startY = 80 + extraMargin;
  
  ctx.fillStyle = '#F5F5F5';
  ctx.fillRect(startX - axisLabelSize, startY - axisLabelSize, gridWidth + axisLabelSize * 2, gridHeight + axisLabelSize * 2);
  
  ctx.fillStyle = '#333333';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  for (let i = 0; i < width; i++) {
    if ((i + 1) % 5 === 0 || i === 0 || i === width - 1) {
      const numX = startX + i * downloadCellSize + downloadCellSize / 2;
      ctx.fillText((i + 1).toString(), numX, startY - axisLabelSize / 2);
      ctx.fillText((i + 1).toString(), numX, startY + gridHeight + axisLabelSize / 2);
    }
  }
  
  for (let j = 0; j < height; j++) {
    if ((j + 1) % 5 === 0 || j === 0 || j === height - 1) {
      const numY = startY + j * downloadCellSize + downloadCellSize / 2;
      ctx.fillText((j + 1).toString(), startX - axisLabelSize / 2, numY);
      ctx.fillText((j + 1).toString(), startX + gridWidth + axisLabelSize / 2, numY);
    }
  }
  
  ctx.strokeStyle = '#AAAAAA';
  ctx.lineWidth = 1;
  ctx.strokeRect(startX, startY, gridWidth, gridHeight);
  
  ctx.font = `bold ${Math.max(6, Math.min(10, Math.floor(downloadCellSize * 0.32)))}px sans-serif`;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const cell = pattern[idx];
      const drawX = startX + x * downloadCellSize;
      const drawY = startY + y * downloadCellSize;
      
      let bgColor = '#FFFFFF';
      let textColor = '#000000';
      let cellKey = '';
      
      if (typeof cell === 'object' && cell.hex && !cell.isExternal) {
        bgColor = cell.hex;
        cellKey = getColorKeyByHex(cell.hex, colorSystem);
        const rgb = hexToRgb(bgColor);
        if (rgb) {
          const luma = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
          textColor = luma > 0.5 ? '#000' : '#fff';
        }
      } else if (typeof cell === 'string' && cell && PALETTE[cell]) {
        bgColor = PALETTE[cell].color;
        cellKey = PALETTE[cell].key;
        textColor = '#fff';
      }
      
      ctx.fillStyle = bgColor;
      ctx.fillRect(drawX, drawY, downloadCellSize, downloadCellSize);
      
      ctx.strokeStyle = '#DDDDDD';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(drawX + 0.5, drawY + 0.5, downloadCellSize, downloadCellSize);
      
      if (cellKey) {
        ctx.fillStyle = textColor;
        ctx.fillText(cellKey, drawX + downloadCellSize / 2, drawY + downloadCellSize / 2);
      }
    }
  }
  
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(startX + 0.5, startY + 0.5, gridWidth, gridHeight);
  
  canvas.toBlob((blob) => {
    if (!blob) {
      console.error('拼豆图纸导出失败：浏览器未能编码 PNG');
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `bead-pattern-${width}x${height}-${colorSystem}.png`;
    link.href = objectUrl;
    document.body.appendChild(link);
    link.click();
    window.setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
    }, 0);
  }, 'image/png');
}

export function downloadPatternCSV(pattern, width, height, colorSystem = getActiveColorSystem()) {
  const csvContent = serializePatternCSV(pattern, width, height, colorSystem);
  const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', `bead-pattern-${width}x${height}-${colorSystem}.csv`);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 0);
}

function escapeCsvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function serializePatternCSV(pattern, width, height, colorSystem = getActiveColorSystem()) {
  const lines = [];
  lines.push('非遗造物局拼豆图纸');
  lines.push(`色号体系,${escapeCsvCell(colorSystem)}`);
  lines.push(`图纸尺寸,${width}x${height}`);
  lines.push('');
  lines.push('色号矩阵');
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const cell = pattern[idx];
      if (typeof cell === 'object' && cell.hex && !cell.isExternal) {
        row.push(escapeCsvCell(getColorKeyByHex(cell.hex, colorSystem)));
      } else if (typeof cell === 'string' && cell && PALETTE[cell]) {
        row.push(escapeCsvCell(PALETTE[cell].key));
      } else {
        row.push('');
      }
    }
    lines.push(row.join(','));
  }

  const summary = Object.values(summarizePattern(pattern))
    .sort((a, b) => b.count - a.count);
  lines.push('');
  lines.push('材料清单');
  lines.push('色号,名称,HEX,准确用量,建议备料');
  for (const item of summary) {
    lines.push([
      getColorKeyByHex(item.color, colorSystem),
      item.name,
      item.color,
      item.count,
      Math.ceil(item.count * 1.05)
    ].map(escapeCsvCell).join(','));
  }

  return lines.join('\n');
}
