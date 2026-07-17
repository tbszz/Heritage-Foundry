// 用 Gemini 图像模型(Nano Banana Pro)为 3D 博物馆生成无缝贴图,输出 WebP 到 public/assets/textures/。
// 用法:在 .env 配置 GEMINI_API_KEY 后运行 `node scripts/generate-textures.mjs`(可重复运行)。
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

import { fileURLToPath } from 'node:url';

const MODEL = process.env.GEMINI_TEXTURE_MODEL || 'gemini-3-pro-image-preview';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const OUT_DIR = fileURLToPath(new URL('../public/assets/textures/', import.meta.url));

const SEAMLESS = 'seamless tileable texture, orthographic flat top-down view, even diffuse lighting, no shadows, no perspective, no text, no watermark, high detail';

const TEXTURES = [
  {
    name: 'floor-stone',
    prompt: `Museum floor texture: dark blue-black polished stone tiles in a regular grid, thin elegant gold grout lines, subtle natural stone veins, ${SEAMLESS}`
  },
  {
    name: 'wall-cloud',
    prompt: `Museum interior wall texture: dark charcoal matte wall with subtle embossed Chinese auspicious cloud (xiangyun) relief pattern, tone-on-tone, elegant and understated, ${SEAMLESS}`
  },
  {
    name: 'carpet-runner',
    prompt: `Long ceremonial carpet runner texture, vertical orientation: deep crimson red fabric with ornate golden border stripes along both long edges, subtle Chinese cloud brocade pattern in the center field, top-down flat view, even lighting, no shadows, no perspective, no text`
  },
  {
    name: 'brick-gate',
    prompt: `Traditional Chinese dark grey qing brick wall texture, weathered ancient bricks with thin mortar lines, subtle age stains, ${SEAMLESS}`
  },
  {
    name: 'feature-wall',
    prompt: `Museum feature wall panel: golden paper-cut style phoenix, crane and auspicious cloud motifs arranged symmetrically on deep black lacquer background with a faint dark red gradient glow in the center, elegant, ceremonial, flat front view, no text, no watermark`
  },
  {
    name: 'wood-beam',
    prompt: `Dark red-brown lacquered wood texture, fine straight grain with subtle golden shimmer, traditional Chinese architectural beam, ${SEAMLESS}`
  },
  {
    name: 'ceiling-coffer',
    size: '2K',
    prompt: `Traditional Chinese museum ceiling texture: dark coffered ceiling (zaojing) with deep charcoal and dark bronze square coffers, thin aged gold trim lines between coffers, very dark and elegant, ${SEAMLESS}, intricate craftsmanship`
  },
  {
    name: 'red-lacquer',
    size: '2K',
    prompt: `Traditional Chinese vermilion red lacquered wooden planks texture: deep rich red lacquer with subtle vertical wood grain, faint aged patina and fine crackle, dignified and dark, ${SEAMLESS}, fine material detail`
  },
  {
    name: 'roof-tiles',
    size: '2K',
    prompt: `Traditional Chinese dark grey glazed roof tiles texture: neat overlapping rows of curved clay tiles with subtle sheen, faint moss and age stains, top-down flat view, ${SEAMLESS}, fine craftsmanship detail`
  },
  {
    name: 'pedestal-stone',
    size: '2K',
    prompt: `Dark museum pedestal stone texture: fine-grained black basalt with very subtle silver mineral flecks and a honed matte finish, elegant and quiet, ${SEAMLESS}, fine mineral detail`
  },
  {
    name: 'banner-silk',
    size: '2K',
    prompt: `Dark silk brocade fabric texture: deep charcoal-black silk with a faint woven auspicious-cloud damask pattern and a soft restrained sheen, ${SEAMLESS}, fine woven detail`
  }
];

// 部分贴图需要裁掉生成图自带的留白/装裱边框
const CROPS = {
  'carpet-runner': { left: 210, top: 0, width: 600, height: 1024 },
  'feature-wall': { left: 35, top: 165, width: 950, height: 780 }
};

async function generateOne({ name, prompt, size = '1K' }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY 未配置(写入 .env 或环境变量)');

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: { aspectRatio: '1:1', imageSize: size }
      }
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`${name}: API ${response.status} ${JSON.stringify(data.error?.message || data).slice(0, 200)}`);
  }

  const parts = data.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((part) => part.inlineData?.data);
  if (!imagePart) {
    throw new Error(`${name}: 响应中没有图片(${parts.map((part) => part.text || '?').join(' ').slice(0, 160)})`);
  }

  const buffer = Buffer.from(imagePart.inlineData.data, 'base64');
  const outPath = path.join(OUT_DIR, `${name}.webp`);
  let pipeline = sharp(buffer);
  if (CROPS[name]) pipeline = pipeline.extract(CROPS[name]);
  // 暗色大贴图统一压到 1024,控制页面体积
  pipeline = pipeline.resize(1024, 1024, { fit: 'inside' });
  await pipeline.webp({ quality: 82 }).toFile(outPath);
  const stats = fs.statSync(outPath);
  console.log(`✓ ${name}.webp  ${(stats.size / 1024).toFixed(0)}KB`);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const only = process.argv[2];
const queue = only ? TEXTURES.filter((item) => item.name === only) : TEXTURES;
if (!queue.length) {
  console.error(`未知贴图名:${only},可选:${TEXTURES.map((item) => item.name).join(', ')}`);
  process.exit(1);
}

for (const texture of queue) {
  try {
    await generateOne(texture);
  } catch (error) {
    console.warn(`第一次失败,重试一次:${error.message}`);
    await generateOne(texture); // 失败直接抛出,便于 CI/人工发现
  }
}

console.log(`全部贴图已输出到 ${OUT_DIR}`);
