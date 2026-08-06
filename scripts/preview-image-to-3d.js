// 预览验证脚本：Nano Banana 生成非遗器物参考图
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { generateImage } = require('../services/geminiService');

const prompt = process.argv[2] ||
  'A traditional Chinese porcelain vase with blue and white qinghua patterns, elegant meiping shape, single object centered, product photography, pure white background, soft even lighting, no shadow, no text, no watermark, full object visible';

const outPath = path.resolve(__dirname, '../public/assets/generated/preview-ref-vase.png');

(async () => {
  const { base64Image, metadata } = await generateImage(prompt, { aspect_ratio: '1:1', image_size: '1K', mime_type: 'image/png' });
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.from(base64Image, 'base64'));
  console.log('saved:', outPath, metadata);
})().catch((err) => {
  console.error('generate failed:', err.message || err);
  process.exit(1);
});
