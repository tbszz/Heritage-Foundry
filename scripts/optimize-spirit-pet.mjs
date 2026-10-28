#!/usr/bin/env node
// 灵宠 GLB 网页化：4K 贴图缩至 2048 并转 WebP；蒙皮几何不做 Draco，避免量化骨骼权重。
// 输入为 rig-spirit-pet.cjs 下载的原始文件（artifacts/ 不进站点），输出到 public/models/spirit-pet/。
import path from 'node:path';
import { mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'artifacts', 'spirit-pet', 'heritage-082', 'rigged.raw.glb');
const OUT = path.join(ROOT, 'public', 'models', 'spirit-pet', 'shandong-tiger.glb');

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const document = await io.read(SRC);
await document.transform(
  dedup(),
  prune({ keepAttributes: true }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 85, resize: [2048, 2048] })
);
await mkdir(path.dirname(OUT), { recursive: true });
await io.write(OUT, document);

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(2);
const root = document.getRoot();
console.log(`✓ ${mb((await stat(SRC)).size)}MB → ${mb((await stat(OUT)).size)}MB`);
console.log(`  动画：${root.listAnimations().map((clip) => clip.getName()).join(' / ')}`);
