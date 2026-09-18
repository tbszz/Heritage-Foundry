import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

export const AR_MODEL_SIZE_BUDGET_BYTES = 24 * 1024 * 1024;
const MODEL_PREFIX = '/models/';
const DISALLOWED_REQUIRED_EXTENSIONS = new Set(['KHR_draco_mesh_compression', 'EXT_texture_webp']);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function collectArModelTargets(projectRoot = root) {
  const crafts = JSON.parse(await readFile(path.join(projectRoot, 'src/data/crafts.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(path.join(projectRoot, 'public/data/heritage-collection.json'), 'utf8'));
  const targets = [];
  const seen = new Set();

  for (const item of crafts) {
    addTarget(targets, seen, item.modelUrl, 'core');
  }

  for (const item of manifest.items ?? []) {
    if (item.visualReview === 'approved') {
      addTarget(targets, seen, item.modelUrl, 'approved-manifest');
    }
  }

  return targets;
}

export async function buildHarmonyArModels(options = {}) {
  const projectRoot = options.root ?? root;
  const maxBytes = options.maxBytes ?? AR_MODEL_SIZE_BUDGET_BYTES;
  const targets = options.targets ?? await collectArModelTargets(projectRoot);
  const io = await createIo();
  const built = [];
  const errors = [];

  for (const target of targets) {
    try {
      built.push(await buildOneModel(projectRoot, target, io, maxBytes));
    } catch (error) {
      errors.push({ ...target, error: error.message });
    }
  }

  return { built, errors, count: built.length, errorCount: errors.length };
}

export async function inspectGlb(filePath) {
  const buffer = await readFile(filePath);
  if (buffer.readUInt32LE(0) !== 0x46546c67) throw new Error('Invalid GLB magic');
  const jsonLength = buffer.readUInt32LE(12);
  const jsonType = buffer.readUInt32LE(16);
  if (jsonType !== 0x4e4f534a) throw new Error('Invalid GLB JSON chunk');
  const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8').trim());
  return {
    json,
    extensionsRequired: json.extensionsRequired ?? [],
    extensionsUsed: json.extensionsUsed ?? [],
    imageMimeTypes: (json.images ?? []).map(image => image.mimeType).filter(Boolean)
  };
}

async function buildOneModel(projectRoot, target, io, maxBytes) {
  const input = path.join(projectRoot, 'public/models', target.relativePath);
  const output = path.join(projectRoot, 'public/models-ar', target.relativePath);
  const document = await io.read(input);
  const before = inspectDocumentGeometry(document);

  // Convert texture payloads one by one. The generic textureCompress()
  // transform can leave invalid image buffers on some Tripo GLBs after
  // geometry access; direct sharp conversion keeps the material bindings while
  // producing AR-compatible PNG textures.
  for (const texture of document.getRoot().listTextures()) {
    const image = texture.getImage();
    if (!image) continue;
    const png = await sharp(image).png({ compressionLevel: 9, adaptiveFiltering: true, palette: false }).toBuffer();
    texture.setImage(png).setMimeType('image/png');
  }
  removeCompatibilityExtensions(document);
  assertNoWebpTextures(document);

  await mkdir(path.dirname(output), { recursive: true });
  await io.write(output, document);

  const outputBytes = (await stat(output)).size;
  if (outputBytes > maxBytes) {
    await rm(output, { force: true });
    throw new Error(`AR model size budget exceeded: ${outputBytes} > ${maxBytes}`);
  }

  const glb = await inspectGlb(output);
  assertCompatibleGlb(glb);
  const after = inspectDocumentGeometry(await new NodeIO().read(output));

  return {
    ...target,
    inputBytes: (await stat(input)).size,
    outputBytes,
    triangles: after.triangles,
    meshes: after.meshes,
    materials: after.materials,
    textures: after.textures,
    before
  };
}

async function createIo() {
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule()
  });
}

function addTarget(targets, seen, modelUrl, source) {
  if (!modelUrl) return;
  const relativePath = normalizeModelUrl(modelUrl);
  if (seen.has(relativePath)) return;
  seen.add(relativePath);
  targets.push({ relativePath, modelUrl, source });
}

function normalizeModelUrl(modelUrl) {
  if (!modelUrl.startsWith(MODEL_PREFIX) || !modelUrl.endsWith('.glb')) {
    throw new Error(`Unsupported model URL for AR export: ${modelUrl}`);
  }
  const relativePath = modelUrl.slice(MODEL_PREFIX.length).replaceAll('\\', '/');
  if (relativePath.startsWith('/') || relativePath.includes('..')) {
    throw new Error(`Unsafe model URL for AR export: ${modelUrl}`);
  }
  return relativePath;
}

function removeCompatibilityExtensions(document) {
  for (const extension of document.getRoot().listExtensionsUsed()) {
    if (DISALLOWED_REQUIRED_EXTENSIONS.has(extension.extensionName)) {
      extension.setRequired(false);
      extension.dispose();
    }
  }
}

function assertNoWebpTextures(document) {
  for (const texture of document.getRoot().listTextures()) {
    if (texture.getMimeType() === 'image/webp') {
      throw new Error('AR model still contains image/webp texture');
    }
  }
}

function assertCompatibleGlb(glb) {
  for (const extension of DISALLOWED_REQUIRED_EXTENSIONS) {
    if (glb.extensionsRequired.includes(extension) || glb.extensionsUsed.includes(extension)) {
      throw new Error(`AR GLB still references ${extension}`);
    }
  }
  if (glb.imageMimeTypes.includes('image/webp')) {
    throw new Error('AR GLB still contains image/webp');
  }
}

function inspectDocumentGeometry(document) {
  let triangles = 0;
  const meshes = document.getRoot().listMeshes();
  for (const mesh of meshes) {
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMode() !== 4) throw new Error('Only triangle meshes are accepted for AR export');
      const position = primitive.getAttribute('POSITION');
      if (!position) throw new Error('Missing vertex positions');
      const positions = position.getArray();
      if (!positions || !positions.every(Number.isFinite)) throw new Error('Non-finite vertex coordinates');
      const count = primitive.getIndices()?.getCount() ?? position.getCount();
      if (count % 3 !== 0) throw new Error('Triangle index count is not divisible by three');
      triangles += count / 3;
      if (primitive.getAttribute('TEXCOORD_0') && primitive.getAttribute('TEXCOORD_0').getCount() !== position.getCount()) {
        throw new Error('UV count does not match vertex count');
      }
      if (primitive.getAttribute('NORMAL') && primitive.getAttribute('NORMAL').getCount() !== position.getCount()) {
        throw new Error('Normal count does not match vertex count');
      }
      if (!primitive.getMaterial()) throw new Error('Missing material');
    }
  }
  if (triangles < 1) throw new Error('No triangles found for AR export');
  return {
    triangles,
    meshes: meshes.length,
    materials: document.getRoot().listMaterials().length,
    textures: document.getRoot().listTextures().length
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await buildHarmonyArModels();
  console.log(JSON.stringify(result, null, 2));
  if (result.errors.length > 0) process.exitCode = 1;
}
