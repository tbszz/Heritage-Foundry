export const COLOR_SYSTEMS = ['MARD', 'COCO', '漫漫', '盼盼', '咪小窝'];

export const COLOR_SYSTEM_LABELS = {
  'MARD': 'MARD 拼豆',
  'COCO': 'COCO 拼豆',
  '漫漫': '漫漫拼豆',
  '盼盼': '盼盼拼豆',
  '咪小窝': '咪小窝拼豆'
};

let activeColorSystem = 'MARD';

export function setActiveColorSystem(system) {
  if (COLOR_SYSTEMS.includes(system)) {
    activeColorSystem = system;
  }
}

export function getActiveColorSystem() {
  return activeColorSystem;
}

export const PALETTE_COLORS = [
  { hex: '#FAF4C8', name: '浅米黄' },
  { hex: '#FFFFD5', name: '奶白' },
  { hex: '#FEFF8B', name: '柠檬黄' },
  { hex: '#FBED56', name: '亮黄' },
  { hex: '#F4D738', name: '金黄' },
  { hex: '#FEAC4C', name: '浅橙' },
  { hex: '#FE8B4C', name: '橙红' },
  { hex: '#FFDA45', name: '蛋黄' },
  { hex: '#FF995B', name: '珊瑚橙' },
  { hex: '#F77C31', name: '橙棕' },
  { hex: '#FFDD99', name: '杏色' },
  { hex: '#FE9F72', name: '肉粉' },
  { hex: '#FFC365', name: '浅金橙' },
  { hex: '#FD543D', name: '火红' },
  { hex: '#E6EE31', name: '黄绿' },
  { hex: '#63F347', name: '亮绿' },
  { hex: '#9EF780', name: '浅绿' },
  { hex: '#5DE035', name: '翠绿' },
  { hex: '#35E352', name: '草绿' },
  { hex: '#65E2A6', name: '薄荷绿' },
  { hex: '#3DAF80', name: '橄榄绿' },
  { hex: '#1C9C4F', name: '深绿' },
  { hex: '#27523A', name: '墨绿' },
  { hex: '#A9F9FC', name: '天蓝' },
  { hex: '#A0E2FB', name: '浅蓝' },
  { hex: '#41CCFF', name: '亮蓝' },
  { hex: '#01ACEB', name: '电光蓝' },
  { hex: '#50AAF0', name: '天蓝' },
  { hex: '#3677D2', name: '深蓝' },
  { hex: '#0F54C0', name: '靛蓝' },
  { hex: '#AEB4F2', name: '淡紫' },
  { hex: '#858EDD', name: '紫蓝' },
  { hex: '#B843C5', name: '亮紫' },
  { hex: '#AC7BDE', name: '紫' },
  { hex: '#8854B3', name: '深紫' },
  { hex: '#E2D3FF', name: '淡紫' },
  { hex: '#D5B9F8', name: '浅紫粉' },
  { hex: '#FDD3CC', name: '浅粉' },
  { hex: '#FEC0DF', name: '亮粉' },
  { hex: '#FFB7E7', name: '粉紫' },
  { hex: '#E8649E', name: '玫红' },
  { hex: '#F551A2', name: '粉红' },
  { hex: '#F13D74', name: '珊瑚粉' },
  { hex: '#FD957B', name: '珊瑚红' },
  { hex: '#FC3D46', name: '鲜红' },
  { hex: '#F74941', name: '橙红' },
  { hex: '#FC283C', name: '亮红' },
  { hex: '#E7002F', name: '深红' },
  { hex: '#FFE2CE', name: '浅橙' },
  { hex: '#FFC4AA', name: '肤色' },
  { hex: '#F4C3A5', name: '浅棕' },
  { hex: '#E1B383', name: '浅黄褐' },
  { hex: '#EDB045', name: '金棕' },
  { hex: '#E99C17', name: '棕黄' },
  { hex: '#9D5B3E', name: '深棕' },
  { hex: '#753832', name: '棕红' },
  { hex: '#FDFBFF', name: '纯白' },
  { hex: '#FEFFFF', name: '纯白' },
  { hex: '#B6B1BA', name: '浅紫灰' },
  { hex: '#89858C', name: '灰' },
  { hex: '#48464E', name: '深灰' },
  { hex: '#2F2B2F', name: '黑灰' },
  { hex: '#000000', name: '黑' },
  { hex: '#EDEDED', name: '灰白' },
  { hex: '#CECDD5', name: '灰蓝' },
  { hex: '#CFD7D3', name: '灰绿' },
  { hex: '#98A6A8', name: '灰青' },
  { hex: '#D50D21', name: '大红' },
  { hex: '#F92F83', name: '玫红' },
  { hex: '#FD8324', name: '橙红' },
  { hex: '#F8EC31', name: '亮黄' },
  { hex: '#35C75B', name: '亮绿' },
  { hex: '#1A60C3', name: '深蓝' },
  { hex: '#9A56B4', name: '紫' },
];

export function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

function srgbChannelToLinear(channel) {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

function rgbToOklab(rgb) {
  const r = srgbChannelToLinear(rgb.r);
  const g = srgbChannelToLinear(rgb.g);
  const b = srgbChannelToLinear(rgb.b);

  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);

  return {
    l: 0.2104542553 * lRoot + 0.7936177850 * mRoot - 0.0040720468 * sRoot,
    a: 1.9779984951 * lRoot - 2.4285922050 * mRoot + 0.4505937099 * sRoot,
    b: 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.8086757660 * sRoot,
  };
}

const oklabCache = new Map();

function getOklabColor(rgb) {
  const cacheKey = `${rgb.r},${rgb.g},${rgb.b}`;
  const cached = oklabCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const oklab = rgbToOklab(rgb);
  oklabCache.set(cacheKey, oklab);
  return oklab;
}

export function colorDistance(rgb1, rgb2) {
  const oklab1 = getOklabColor(rgb1);
  const oklab2 = getOklabColor(rgb2);

  const dl = oklab1.l - oklab2.l;
  const da = oklab1.a - oklab2.a;
  const db = oklab1.b - oklab2.b;

  return Math.sqrt(dl * dl + da * da + db * db) * 100;
}

export function findClosestPaletteColor(targetRgb) {
  if (!PALETTE_COLORS || PALETTE_COLORS.length === 0) {
    return { hex: '#000000', name: '黑色' };
  }

  let minDistance = Infinity;
  let closestColor = PALETTE_COLORS[0];

  for (const paletteColor of PALETTE_COLORS) {
    const rgb = hexToRgb(paletteColor.hex);
    if (!rgb) continue;
    
    const distance = colorDistance(targetRgb, rgb);
    if (distance < minDistance) {
      minDistance = distance;
      closestColor = paletteColor;
    }
    if (distance === 0) break;
  }
  return closestColor;
}

export function getColorKeyByHex(hexValue, colorSystem) {
  const normalizedHex = hexValue.toUpperCase();
  const paletteIndex = PALETTE_COLORS.findIndex((color) => color.hex.toUpperCase() === normalizedHex);

  if (paletteIndex === -1) {
    return '?';
  }

  const prefixes = {
    MARD: 'M',
    COCO: 'C',
    '漫漫': 'MM',
    '盼盼': 'PP',
    '咪小窝': 'MX'
  };
  const prefix = prefixes[colorSystem] || prefixes[activeColorSystem] || 'M';

  return `${prefix}-${String(paletteIndex + 1).padStart(3, '0')}`;
}

export function sortColorsByHue(colors) {
  return colors.slice().sort((a, b) => {
    const rgbA = hexToRgb(a.hex);
    const rgbB = hexToRgb(b.hex);
    if (!rgbA || !rgbB) return 0;

    const maxA = Math.max(rgbA.r, rgbA.g, rgbA.b);
    const minA = Math.min(rgbA.r, rgbA.g, rgbA.b);
    const maxB = Math.max(rgbB.r, rgbB.g, rgbB.b);
    const minB = Math.min(rgbB.r, rgbB.g, rgbB.b);

    let hA = 0, hB = 0;
    const diffA = maxA - minA;
    const diffB = maxB - minB;

    if (diffA !== 0) {
      if (maxA === rgbA.r) hA = ((rgbA.g - rgbA.b) / diffA + (rgbA.g < rgbA.b ? 6 : 0)) / 6;
      else if (maxA === rgbA.g) hA = ((rgbA.b - rgbA.r) / diffA + 2) / 6;
      else hA = ((rgbA.r - rgbA.g) / diffA + 4) / 6;
    }

    if (diffB !== 0) {
      if (maxB === rgbB.r) hB = ((rgbB.g - rgbB.b) / diffB + (rgbB.g < rgbB.b ? 6 : 0)) / 6;
      else if (maxB === rgbB.g) hB = ((rgbB.b - rgbB.r) / diffB + 2) / 6;
      else hB = ((rgbB.r - rgbB.g) / diffB + 4) / 6;
    }

    if (Math.abs(hA - hB) > 5 / 360) return hA - hB;

    const lA = (maxA + minA) / 510;
    const lB = (maxB + minB) / 510;
    if (Math.abs(lA - lB) > 0.03) return lB - lA;

    const sA = diffA !== 0 ? (lA > 0.5 ? diffA / (2 - maxA / 255 - minA / 255) : diffA / (maxA / 255 + minA / 255)) : 0;
    const sB = diffB !== 0 ? (lB > 0.5 ? diffB / (2 - maxB / 255 - minB / 255) : diffB / (maxB / 255 + minB / 255)) : 0;
    return sB - sA;
  });
}
