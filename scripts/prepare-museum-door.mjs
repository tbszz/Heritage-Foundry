import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, textureCompress, draco } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'artifacts/tripo-batch/museum-door-20260912');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule()
});
const document = await io.read(path.join(source, 'door.glb'));
let triangles = 0;
for (const mesh of document.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
  const position = primitive.getAttribute('POSITION');
  if (primitive.getMode() !== 4 || !position?.getArray()?.every(Number.isFinite) || !primitive.getMaterial()?.getBaseColorTexture()) throw new Error('Invalid door geometry/material');
  triangles += (primitive.getIndices()?.getCount() ?? position.getCount()) / 3;
}
if (triangles <= 0 || triangles > 20000) throw new Error(`Door triangle budget exceeded: ${triangles}`);
await document.transform(dedup(), prune(), weld(), textureCompress({encoder: sharp, targetFormat: 'webp', quality: 90, resize: [2048, 2048]}), draco());
const output = path.join(root, 'public/models/architecture/museum-door.glb');
await fs.mkdir(path.dirname(output), { recursive: true });
await io.write(output, document);
await io.read(output);
const bytes = (await fs.stat(output)).size;
if (bytes > 8388608) throw new Error('Door download budget exceeded');
await fs.mkdir(path.join(root, 'public/assets/architecture'), { recursive: true });
await fs.copyFile(path.join(source, 'reference.png'), path.join(root, 'public/assets/architecture/museum-door-reference.png'));
const state = JSON.parse(await fs.readFile(path.join(source, 'task.json'), 'utf8'));
const report = { provider: 'tripo', taskId: state.taskId, triangles, bytes, modelUrl: '/models/architecture/museum-door.glb', referenceUrl: '/assets/architecture/museum-door-reference.png' };
await fs.writeFile(path.join(root, 'public/assets/architecture/museum-door.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
