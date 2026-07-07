import {
  PALETTE_COLORS,
  hexToRgb,
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

export function renderPatternHTML(pattern, width) {
  const rows = [];
  for (let y = 0; y < Math.ceil(pattern.length / width); y++) {
    const rowCells = [];
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const colorClass = pattern[idx];
      let bgColor = '#fff8e9';
      let textColor = 'rgba(31, 35, 40, 0.5)';
      let dataKey = '';
      
      if (typeof colorClass === 'string' && PALETTE[colorClass]) {
        bgColor = PALETTE[colorClass].color;
        textColor = '#fff';
        dataKey = PALETTE[colorClass].key;
      } else if (typeof colorClass === 'object' && colorClass.hex && !colorClass.isExternal) {
        bgColor = colorClass.hex;
        dataKey = colorClass.key || '';
        const rgb = hexToRgb(bgColor);
        if (rgb) {
          const luma = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
          textColor = luma > 0.5 ? '#000' : '#fff';
        }
      }
      
      rowCells.push(`<div class="bead-cell" style="background: ${bgColor}; color: ${textColor}" data-key="${dataKey}">${dataKey}</div>`);
    }
    rows.push(`<div class="bead-row">${rowCells.join('')}</div>`);
  }
  return `<div class="bead-grid">${rows.join('')}</div>`;
}

export function calculateStats(summary) {
  const beadCount = Object.values(summary).reduce((sum, count) => sum + getSummaryCount(count), 0);
  const colorCount = getSummaryColorCount(summary);
  const timeCost = beadCount > 180 ? '90 分钟' : beadCount > 95 ? '45 分钟' : '30 分钟';
  const difficulty = beadCount > 180 ? '高阶' : beadCount > 105 ? '进阶' : '入门';
  
  return { beadCount, colorCount, timeCost, difficulty };
}

function getCellRepresentativeColor(imageData, startX, startY, width, height, mode) {
  const { data, width: imageWidth } = imageData;
  const colorCounts = new Map();
  let maxCount = 0;
  let dominantColor = null;
  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let totalPixels = 0;

  for (let y = startY; y < startY + height; y++) {
    for (let x = startX; x < startX + width; x++) {
      const offset = (y * imageWidth + x) * 4;
      const alpha = data[offset + 3];

      if (alpha < 128) {
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

  if (totalPixels === 0) {
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

function isNearPaperColor(cell) {
  if (!cell || cell.isExternal || !cell.hex) return true;
  const rgb = hexToRgb(cell.hex);
  if (!rgb) return false;

  const max = Math.max(rgb.r, rgb.g, rgb.b);
  const min = Math.min(rgb.r, rgb.g, rgb.b);
  return max > 238 && max - min < 24;
}

function markExternalBackground(pattern, width, height) {
  const result = pattern.map((cell) => ({ ...cell }));
  const visited = new Set();
  const stack = [];

  for (let x = 0; x < width; x += 1) {
    stack.push(x, (height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    stack.push(y * width, y * width + width - 1);
  }

  while (stack.length > 0) {
    const index = stack.pop();
    if (index < 0 || index >= result.length || visited.has(index)) continue;
    visited.add(index);

    const cell = result[index];
    if (!cell?.isExternal && !isNearPaperColor(cell)) continue;

    result[index] = {
      ...cell,
      key: '',
      name: '外部背景',
      hex: '#FFFFFF',
      isExternal: true
    };

    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) stack.push(index - 1);
    if (x < width - 1) stack.push(index + 1);
    if (y > 0) stack.push(index - width);
    if (y < height - 1) stack.push(index + width);
  }

  return result;
}

export function createPatternFromImageData(imageData, width = 18, height = 12, options = {}) {
  const {
    mode = 'dominant',
    colorSystem = getActiveColorSystem(),
    removeBackground = true
  } = options;

  const cellWidth = imageData.width / width;
  const cellHeight = imageData.height / height;
  const pattern = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const startX = Math.floor(x * cellWidth);
      const startY = Math.floor(y * cellHeight);
      const endX = Math.min(imageData.width, Math.ceil((x + 1) * cellWidth));
      const endY = Math.min(imageData.height, Math.ceil((y + 1) * cellHeight));
      const representative = getCellRepresentativeColor(
        imageData,
        startX,
        startY,
        Math.max(1, endX - startX),
        Math.max(1, endY - startY),
        mode
      );

      if (!representative) {
        pattern.push({
          key: '',
          name: '外部背景',
          hex: '#FFFFFF',
          isExternal: true
        });
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

  return removeBackground ? markExternalBackground(pattern, width, height) : pattern;
}

export async function imageToPattern(imageUrl, width = 18, height = 12) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      
      const imageData = ctx.getImageData(0, 0, width, height);
      resolve(createPatternFromImageData(imageData, width, height));
    };
    
    img.onerror = () => {
      console.warn('Failed to load image, using generated pattern');
      resolve(buildPattern(width, height, Math.random() * 100));
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

export function downloadPatternImage(pattern, width, height, colorSystem = 'MARD') {
  const downloadCellSize = 30;
  const axisLabelSize = 30;
  const extraMargin = 20;
  
  const gridWidth = width * downloadCellSize;
  const gridHeight = height * downloadCellSize;
  const downloadWidth = gridWidth + axisLabelSize * 2 + extraMargin * 2;
  const downloadHeight = gridHeight + axisLabelSize * 2 + extraMargin * 2 + 100;
  
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
  
  ctx.font = 'bold 10px sans-serif';
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const cell = pattern[idx];
      const drawX = startX + x * downloadCellSize;
      const drawY = startY + y * downloadCellSize;
      
      let bgColor = '#FFFFFF';
      let textColor = '#000000';
      let cellKey = '';
      
      if (typeof cell === 'object' && cell.hex) {
        bgColor = cell.hex;
        cellKey = cell.key || '';
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
  
  const dataURL = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.download = `bead-pattern-${width}x${height}-${colorSystem}.png`;
  link.href = dataURL;
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    document.body.removeChild(link);
  }, 0);
}

export function downloadPatternCSV(pattern, width, height) {
  const lines = [];
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const cell = pattern[idx];
      if (typeof cell === 'object' && cell.hex && !cell.isExternal) {
        row.push(cell.hex);
      } else if (typeof cell === 'string' && cell && PALETTE[cell]) {
        row.push(PALETTE[cell].color);
      } else {
        row.push('');
      }
    }
    lines.push(row.join(','));
  }
  
  const csvContent = lines.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `bead-pattern-${width}x${height}.csv`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 0);
}
