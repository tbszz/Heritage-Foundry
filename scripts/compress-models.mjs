#!/usr/bin/env node
/**
 * GLB 模型压缩管线（报告 4.3 P1：420MB → ~60MB）。
 *
 * 从 assets-src/models/ 读取原始模型，执行：
 *   dedup → prune → weld → 纹理缩至 1024 并转 WebP → Draco 几何压缩
 * 输出同名文件到 public/models/（前端 modelUrl 无需改动）。
 *
 * 用法：node scripts/compress-models.mjs [模型名.glb ...]
 * 不带参数时处理 assets-src/models/ 下全部 .glb。
 */
import { readdir, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, draco, textureCompress } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = path.join(ROOT, 'assets-src', 'models');
const OUT_DIR = path.join(ROOT, 'public', 'models');

const TEXTURE_MAX_SIZE = 1024;
const WEBP_QUALITY = 82;

async function createIO() {
  return new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'draco3d.decoder': await draco3d.createDecoderModule(),
      'draco3d.encoder': await draco3d.createEncoderModule(),
    });
}

async function compressModel(io, filename) {
  const srcPath = path.join(SRC_DIR, filename);
  const outPath = path.join(OUT_DIR, filename);
  const before = (await stat(srcPath)).size;

  const document = await io.read(srcPath);
  await document.transform(
    dedup(),
    prune(),
    weld(),
    textureCompress({
      encoder: sharp,
      targetFormat: 'webp',
      quality: WEBP_QUALITY,
      resize: [TEXTURE_MAX_SIZE, TEXTURE_MAX_SIZE],
    }),
    draco(),
  );
  await io.write(outPath, document);

  const after = (await stat(outPath)).size;
  const mb = (n) => (n / 1024 / 1024).toFixed(1);
  console.log(`✓ ${filename}: ${mb(before)}MB → ${mb(after)}MB (${Math.round((after / before) * 100)}%)`);
  return { before, after };
}

async function main() {
  const requested = process.argv.slice(2);
  const all = (await readdir(SRC_DIR)).filter((f) => f.endsWith('.glb'));
  const targets = requested.length > 0 ? requested : all;

  await mkdir(OUT_DIR, { recursive: true });
  const io = await createIO();

  let totalBefore = 0;
  let totalAfter = 0;
  for (const filename of targets) {
    try {
      const { before, after } = await compressModel(io, filename);
      totalBefore += before;
      totalAfter += after;
    } catch (error) {
      console.error(`✗ ${filename} 压缩失败:`, error.message);
      process.exitCode = 1;
    }
  }

  const mb = (n) => (n / 1024 / 1024).toFixed(1);
  console.log(`\n合计: ${mb(totalBefore)}MB → ${mb(totalAfter)}MB`);
}

main();
