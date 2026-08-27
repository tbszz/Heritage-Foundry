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

const SEAMLESS = 'seamless tileable square material texture, orthographic flat front view, even diffuse lighting, no shadows, no perspective, no objects, no frame, no text, no watermark, high material detail';

const TEXTURES = [
  {
    name: 'floor-stone',
    size: '2K',
    prompt: `Grand heritage museum floor: charcoal and warm grey honed stone slabs, large rectangular slab rhythm, restrained pale stone joints, subtle mineral variation and gentle age patina, no gold grout, ${SEAMLESS}`
  },
  {
    name: 'wall-cloud',
    size: '2K',
    prompt: `Warm grey mineral plaster museum wall with handmade horizontal variation, sparse shallow tone-on-tone relief inspired by woven threads and abstract cloud bands, mostly plain, slightly antique, ${SEAMLESS}`
  },
  {
    name: 'carpet-runner',
    size: '2K',
    prompt: `Restrained heritage museum runner: dark warm charcoal handwoven textile, mostly plain central field, narrow muted cinnabar and indigo brocade borders, tiny aged bronze thread accents, no medallions, ${SEAMLESS}`
  },
  {
    name: 'feature-wall',
    size: '2K',
    prompt: `Square museum feature panel inspired by Chinese intangible heritage: layered woven copper threads forming an abstract landscape and flowing craft rhythm, dark walnut and warm charcoal ground, muted cinnabar and indigo silk details, aged bronze rather than bright gold, balanced ceremonial composition, flat front view, no frame, no text, no watermark`
  },
  {
    name: 'wood-beam',
    size: '2K',
    prompt: `Deep smoked walnut architectural beam, straight fine grain, hand-rubbed matte oil finish, dark aged edges, minimal muted mineral-pigment traces, no glossy lacquer, ${SEAMLESS}`
  },
  {
    name: 'ceiling-coffer',
    size: '2K',
    prompt: `Simplified contemporary Chinese coffer ceiling: smoked walnut square ribs, warm ivory acoustic inset panels, very thin aged bronze reveals, occasional restrained woven geometric detail, dignified museum craftsmanship, ${SEAMLESS}`
  },
  {
    name: 'red-lacquer',
    size: '2K',
    prompt: `Muted cinnabar lacquer over aged walnut, deep restrained red-brown color, visible fine vertical wood grain, subtle hand-layered lacquer depth, faint edge patina and tiny crackle, matte museum finish, ${SEAMLESS}`
  },
  {
    name: 'pedestal-stone',
    size: '2K',
    prompt: `Graphite grey museum pedestal stone, fine-grained basalt with subtle warm mineral flecks, honed matte finish, quiet and substantial, no border ornament, ${SEAMLESS}`
  },
  {
    name: 'banner-silk',
    size: '2K',
    prompt: `Heritage museum banner silk: deep indigo-charcoal brocade, fine visible weave, sparse muted cinnabar thread and aged bronze geometric weaving accents, restrained soft sheen, ${SEAMLESS}`
  }
];

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
  // 暗色大贴图统一压到 1024,控制页面体积
  pipeline = pipeline.resize(1024, 1024, { fit: 'cover' });
  await pipeline.webp({ quality: 76, effort: 5 }).toFile(outPath);
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
