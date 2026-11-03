// 压缩并重新读取主题展厅交付 GLB，校验节点、包围盒、材质和纹理。
// node scripts/prepare-hall.mjs <earth|thread|carving|lacquer|paper>
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRMaterialsEmissiveStrength } from '@gltf-transform/extensions';
import { dedup, prune, weld, textureCompress, draco } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// 每个厅：烘焙出的 8 个节点、局部包围盒（x 横向 ±6，y 向上，-z 朝厅内）、只靠 emissive 显色的自发光件
const SHELL = ['floor_a', 'floor_b', 'wall_left', 'wall_right'];
const HALLS = {
  earth: {
    nodes: [...SHELL, 'vault', 'ends', 'tiers', 'props'],
    bounds: { min: [-6.01, -0.06, -25.86], max: [6.01, 5.85, -0.11] }, // 窑膛在尽头墙后 0.8m
    glow: {
      hall_ember: { color: [1, 0.34, 0.06], strength: 2.2 },
      hall_lamp: { color: [1, 0.68, 0.34], strength: 1.6 }
    }
  },
  thread: {
    nodes: [...SHELL, 'roof', 'ends', 'displays', 'props'],
    bounds: { min: [-6.06, -0.06, -25.12], max: [6.06, 5.75, -0.11] }, // 花窗外框凸出墙外
    glow: {
      hall_window: { color: [1, 0.86, 0.62], strength: 1.3 },
      hall_lamp: { color: [1, 0.62, 0.3], strength: 1.6 }
    }
  },
  carving: {
    nodes: [...SHELL, 'ceiling', 'ends', 'displays', 'props'],
    bounds: { min: [-6.06, -0.3, -28.1], max: [6.06, 4.75, -0.11] }, // 月洞门后的小院；太湖石根部埋进地面
    glow: {
      hall_sky: { color: [0.8, 0.92, 0.86], strength: 1.2 },
      hall_window: { color: [0.86, 0.95, 0.84], strength: 1.0 },
      hall_lamp: { color: [1, 0.8, 0.55], strength: 1.4 }
    }
  },
  lacquer: {
    nodes: [...SHELL, 'ceiling', 'ends', 'displays', 'props'],
    bounds: { min: [-6.06, -0.06, -25.35], max: [6.06, 5.25, -0.11] }, // 柱础贴墙半露；末根天花枋插进尽头墙
    glow: {
      hall_lamp: { color: [1, 0.3, 0.12], strength: 1.6 }
    }
  },
  paper: {
    nodes: [...SHELL, 'ceiling', 'ends', 'displays', 'props'],
    bounds: { min: [-6.1, -0.06, -25.12], max: [6.1, 5.05, -0.11] }, // 柱础、雀替贴墙半露
    glow: {
      hall_screen: { color: [1, 0.72, 0.38], strength: 1.5 },
      hall_lamp: { color: [1, 0.3, 0.1], strength: 1.8 }
    }
  }
};
const hall = process.argv[2] || 'earth';
const config = HALLS[hall];
assert(config, `unknown hall ${hall}`);
const out = path.join(root, `artifacts/${hall}-hall`);
const destination = path.join(root, `public/models/architecture/${hall}-hall.glb`);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule()
});
const document = await io.read(path.join(out, 'hall-raw.glb'));
const strength = document.createExtension(KHRMaterialsEmissiveStrength);
for (const material of document.getRoot().listMaterials()) {
  material.setName(material.getName().replace(/\.\d+$/, ''));
  // 自发光件只靠 emissive 显色，网页环境光不会把它们打灰
  const glow = config.glow[material.getName()];
  if (glow) {
    material.setBaseColorFactor([0, 0, 0, 1]);
    material.setMetallicFactor(0);
    material.setEmissiveFactor(glow.color);
    material.setExtension('KHR_materials_emissive_strength', strength.createEmissiveStrength().setEmissiveStrength(glow.strength));
  }
}
await document.transform(dedup(), prune(), weld(), textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 92, resize: [2048, 2048] }),
  draco({ quantizePosition: 16, quantizeTexcoord: 16 }));
await fs.mkdir(path.dirname(destination), { recursive: true });
await io.write(destination, document);

const checked = await io.read(destination);
const expectedNodes = config.nodes.map(name => `hall_${name}`).sort();
const nodes = checked.getRoot().listNodes();
assert.deepEqual(nodes.map(node => node.getName()).sort(), expectedNodes);
const { bounds } = config;
const nodeReport = nodes.map(node => {
  assert.deepEqual(node.getTranslation(), [0, 0, 0]);
  assert.deepEqual(node.getRotation(), [0, 0, 0, 1]);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  let triangles = 0;
  for (const primitive of node.getMesh().listPrimitives()) {
    const positions = primitive.getAttribute('POSITION');
    triangles += (primitive.getIndices()?.getCount() ?? positions.getCount()) / 3;
    const vertex = [];
    for (let i = 0; i < positions.getCount(); i++) {
      positions.getElement(i, vertex);
      vertex.forEach((value, axis) => { assert(Number.isFinite(value)); min[axis] = Math.min(min[axis], value); max[axis] = Math.max(max[axis], value); });
    }
  }
  min.forEach((value, axis) => assert(value >= bounds.min[axis], `${node.getName()} min[${axis}] ${value}`));
  max.forEach((value, axis) => assert(value <= bounds.max[axis], `${node.getName()} max[${axis}] ${value}`));
  return { name: node.getName(), min, max, triangles };
});
const materials = checked.getRoot().listMaterials().map(material => {
  const unlit = !!material.getExtension('KHR_materials_unlit');
  assert.equal(unlit, material.getName().endsWith('_baked'), material.getName());
  return { name: material.getName(), unlit, emissive: material.getEmissiveFactor() };
});
assert.equal(materials.filter(material => material.unlit).length, expectedNodes.length);
if (hall === 'earth') assert(!materials.some(material => material.name === 'hall_fire'), 'kiln fire is drawn at runtime');
const textures = await Promise.all(checked.getRoot().listTextures().map(async texture => {
  const metadata = await sharp(texture.getImage()).metadata();
  assert.equal(metadata.width, 2048);
  assert.equal(metadata.height, 2048);
  return { name: texture.getName(), mimeType: texture.getMimeType(), bytes: texture.getImage().length };
}));
assert.equal(textures.length, expectedNodes.length);
const bytes = (await fs.stat(destination)).size;
assert(bytes <= 8 * 1024 * 1024, `GLB exceeds 8 MiB: ${bytes}`);
const report = { bytes, nodes: nodeReport, materials, textures };
await fs.writeFile(path.join(out, 'glb-validation.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ bytes, triangles: nodeReport.reduce((sum, node) => sum + node.triangles, 0), textures: textures.length }, null, 2));
