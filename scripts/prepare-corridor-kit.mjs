// 压缩并重新读取交付 GLB，校验节点、尺寸、材质和纹理。
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
const out = path.join(root, 'artifacts/corridor-kit');
const destination = path.join(root, 'public/models/architecture/corridor-kit.glb');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule()
});
const document = await io.read(path.join(out, 'corridor-kit-raw.glb'));
const strength = document.createExtension(KHRMaterialsEmissiveStrength);
for (const material of document.getRoot().listMaterials()) {
  material.setName(material.getName().replace(/\.\d+$/, ''));
  if (material.getName() === 'kit_glow') {
    // 纸面只用自发光显色，避免网页环境光把暖纸打成白色。
    material.setBaseColorFactor([0, 0, 0, 1]);
    material.setEmissiveFactor([0.8, 0.5, 0.22]);
    material.setExtension('KHR_materials_emissive_strength', strength.createEmissiveStrength().setEmissiveStrength(1.5));
  }
}
await document.transform(dedup(), prune(), weld(), textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 94, resize: [2048, 2048] }),
  draco({ quantizePosition: 16, quantizeTexcoord: 16 }));
await fs.mkdir(path.dirname(destination), { recursive: true });
await io.write(destination, document);
const checked = await io.read(destination);
const expected = { kit_wall: [3, 4.6, 0.21], kit_portal: [3, 4.63, 0.3], kit_ceiling: [10, 1.31, 3], kit_floor: [10, 0.062, 3] };
const nodes = checked.getRoot().listNodes();
assert.deepEqual(nodes.map(node => node.getName()).sort(), Object.keys(expected).sort());
const nodeReport = nodes.map(node => {
  assert.deepEqual(node.getTranslation(), [0, 0, 0]);
  assert.deepEqual(node.getRotation(), [0, 0, 0, 1]);
  assert.equal(node.getCamera(), null);
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
  const dimensions = max.map((value, axis) => value - min[axis]);
  dimensions.forEach((value, axis) => assert(Math.abs(value - expected[node.getName()][axis]) < 0.002));
  return { name: node.getName(), min, max, dimensions, triangles };
});
const materials = checked.getRoot().listMaterials().map(material => {
  const unlit = !!material.getExtension('KHR_materials_unlit');
  if (material.getName().includes('_baked')) assert(unlit);
  else assert(!unlit);
  if (material.getName() === 'kit_gilt') assert.equal(material.getMetallicFactor(), 1);
  if (material.getName() === 'kit_glow') assert.equal(material.getExtension('KHR_materials_emissive_strength').getEmissiveStrength(), 1.5);
  return { name: material.getName(), unlit, metallic: material.getMetallicFactor(), emissive: material.getEmissiveFactor(), emissiveStrength: material.getExtension('KHR_materials_emissive_strength')?.getEmissiveStrength() };
});
assert.equal(materials.filter(material => material.unlit).length, 4);
const textures = await Promise.all(checked.getRoot().listTextures().map(async texture => {
  const metadata = await sharp(texture.getImage()).metadata();
  assert.equal(metadata.width, 2048); assert.equal(metadata.height, 2048);
  return { name: texture.getName(), mimeType: texture.getMimeType(), width: metadata.width, height: metadata.height, bytes: texture.getImage().length };
}));
assert.equal(textures.length, 4);
const bytes = (await fs.stat(destination)).size;
assert(bytes <= 6 * 1024 * 1024, `GLB exceeds 6 MiB: ${bytes}`);
const report = { bytes, nodes: nodeReport, materials, textures, extensions: checked.getRoot().listExtensionsUsed().map(extension => extension.extensionName) };
await fs.writeFile(path.join(out, 'glb-validation.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
