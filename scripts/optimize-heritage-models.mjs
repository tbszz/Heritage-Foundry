import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, draco, textureCompress } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import catalog from './heritage-model-catalog.cjs';
import dotenv from 'dotenv';
import { TRIANGLE_BUDGET, recoverMeshBudget } from './mesh-budget-recovery.mjs';
import { parseOptimizationIds, selectOptimizationItems, mergeOptimizationReports } from './optimization-selection.mjs';

const requestedIds = parseOptimizationIds(process.argv.slice(2));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env'), quiet: true });
const source = process.env.TRIPO_BATCH_DIR || path.join(root, 'artifacts/tripo-batch');
const destination = path.join(root, 'public/models/heritage');
const previews = path.join(root, 'public/assets/heritage');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule()
});

function inspect(document, { enforceBudget = true } = {}) {
  let triangles = 0;
  const meshes = document.getRoot().listMeshes();
  for (const mesh of meshes) {
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMode() !== 4) throw new Error('Only triangle meshes are accepted');
      const position = primitive.getAttribute('POSITION');
      if (!position) throw new Error('Missing vertex positions');
      const positions = position.getArray();
      if (!positions || !positions.every(Number.isFinite)) throw new Error('Non-finite vertex coordinates');
      const count = primitive.getIndices()?.getCount() ?? position.getCount();
      if (count % 3 !== 0) throw new Error('Triangle index count is not divisible by three');
      triangles += count / 3;
      if (!primitive.getMaterial()?.getBaseColorTexture()) throw new Error('Missing textured PBR material');
    }
  }
  if (triangles < 1 || (enforceBudget && triangles > TRIANGLE_BUDGET)) throw new Error(`Triangle budget violated: ${triangles}`);
  return { triangles, meshes: meshes.length, materials: document.getRoot().listMaterials().length, textures: document.getRoot().listTextures().length };
}

const state = JSON.parse(await readFile(path.join(source, 'state.json'), 'utf8'));
const jobs = selectOptimizationItems(requestedIds, state.items, catalog);
const reportPath = path.join(source, 'optimization-report.json');
let previousReports = [];
if (requestedIds !== null) {
  try {
    previousReports = JSON.parse(await readFile(reportPath, 'utf8'));
    if (!Array.isArray(previousReports)) throw new Error('Existing optimization report must be an array');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
await mkdir(destination, { recursive: true });
await mkdir(previews, { recursive: true });
const reports = [];
for (const { spec } of jobs) {
  const input = path.join(source, `${spec.id}.glb`);
  const output = path.join(destination, `${spec.id}.glb`);
  try {
    const document = await io.read(input);
    const before = inspectWithoutBudget(document);
    const recovery = recoverMeshBudget(document);
    await document.transform(dedup(), prune(), weld(), textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 88, resize: [2048, 2048] }), draco());
    await io.write(output, document);
    const after = inspect(await io.read(output));
    const outputBytes = (await stat(output)).size;
    if (outputBytes > 8 * 1024 * 1024) throw new Error(`Mobile download budget exceeded: ${outputBytes}`);
    await sharp(path.join(source, `${spec.id}.preview`)).resize(640, 640, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toFile(path.join(previews, `${spec.id}.webp`));
    reports.push({ id: spec.id, name: spec.name, inputBytes: (await stat(input)).size, outputBytes, before, after, recovery, modelUrl: `/models/heritage/${spec.id}.glb`, previewUrl: `/assets/heritage/${spec.id}.webp`, technicalCheck: 'passed', visualReview: 'pending' });
  } catch (error) {
    reports.push({ id: spec.id, name: spec.name, technicalCheck: 'failed', error: error.message });
    process.exitCode = 1;
  }
}
await writeFile(reportPath, JSON.stringify(mergeOptimizationReports(previousReports, reports, requestedIds), null, 2));
console.log(JSON.stringify(reports, null, 2));

function inspectWithoutBudget(document) {
  const result = inspect(document, { enforceBudget: false });
  if (result.triangles < 1) throw new Error(`Triangle budget violated: ${result.triangles}`);
  return result;
}
