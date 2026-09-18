import { Accessor, Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { draco, textureCompress } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { buildHarmonyArModels, collectArModelTargets, inspectGlb } from '../scripts/build-harmony-ar-models.mjs';

const tempRoots = [];

function sha256(bytes) {
  return createHash('sha256').update(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)).digest('hex');
}

afterEach(async () => {
  await Promise.all(tempRoots.map(root => rm(root, { recursive: true, force: true })));
  tempRoots.length = 0;
});

async function createTempRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'heritage-ar-'));
  tempRoots.push(root);
  await mkdir(path.join(root, 'src/data'), { recursive: true });
  await mkdir(path.join(root, 'public/data'), { recursive: true });
  await mkdir(path.join(root, 'public/models/heritage'), { recursive: true });
  return root;
}

function createAccessor(document, name, array, type) {
  const buffer = document.getRoot().listBuffers()[0] ?? document.createBuffer('buffer');
  return document.createAccessor(name).setArray(array).setType(type).setBuffer(buffer);
}

async function writeCompressedWebpGlb(filePath, imageOverride) {
  const document = new Document();
  const position = createAccessor(document, 'position', new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), Accessor.Type.VEC3);
  const normal = createAccessor(document, 'normal', new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), Accessor.Type.VEC3);
  const uv = createAccessor(document, 'uv', new Float32Array([0, 0, 1, 0, 0, 1]), Accessor.Type.VEC2);
  const indices = createAccessor(document, 'indices', new Uint16Array([0, 1, 2]), Accessor.Type.SCALAR);
  const image = imageOverride ?? await sharp({
    create: {
      width: 2,
      height: 2,
      channels: 4,
      background: { r: 214, g: 48, b: 37, alpha: 1 }
    }
  }).png().toBuffer();
  const texture = document.createTexture('albedo').setMimeType('image/png').setImage(image);
  const material = document.createMaterial('material').setBaseColorTexture(texture);
  const primitive = document.createPrimitive()
    .setAttribute('POSITION', position)
    .setAttribute('NORMAL', normal)
    .setAttribute('TEXCOORD_0', uv)
    .setIndices(indices)
    .setMaterial(material);
  const mesh = document.createMesh('mesh').addPrimitive(primitive);
  document.createScene('scene').addChild(document.createNode('node').setMesh(mesh));

  const io = await createDracoIo();
  await document.transform(textureCompress({ encoder: sharp, targetFormat: 'webp' }), draco());
  await io.write(filePath, document);
}

async function createDracoIo() {
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule()
  });
}

function inspectPrimitiveGeometry(primitive) {
  const attributes = {};
  for (const semantic of primitive.listSemantics()) {
    const array = primitive.getAttribute(semantic).getArray();
    attributes[semantic] = { count: array.length, sha256: sha256(array) };
  }
  const indices = primitive.getIndices().getArray();
  return {
    indices: { count: indices.length, sha256: sha256(indices) },
    attributes
  };
}

function materialTextureSignature(material) {
  return {
    baseColor: material.getBaseColorTexture()?.getName() ?? null,
    metallicRoughness: material.getMetallicRoughnessTexture()?.getName() ?? null,
    normal: material.getNormalTexture()?.getName() ?? null,
    occlusion: material.getOcclusionTexture()?.getName() ?? null,
    emissive: material.getEmissiveTexture()?.getName() ?? null
  };
}

async function textureRgbaSignature(texture) {
  const image = texture.getImage();
  const metadata = await sharp(image).metadata();
  return {
    name: texture.getName(),
    mimeType: texture.getMimeType(),
    width: metadata.width,
    height: metadata.height,
    rgbaBytes: metadata.width * metadata.height * 4,
    rgbaSha256: sha256(await sharp(image).ensureAlpha().raw().toBuffer())
  };
}

async function writeFixtureManifests(root) {
  await writeFile(path.join(root, 'src/data/crafts.json'), JSON.stringify([
    { id: 'tiger-head', modelUrl: '/models/embroidered-tiger.glb' }
  ], null, 2));
  await writeFile(path.join(root, 'public/data/heritage-collection.json'), JSON.stringify({
    version: 1,
    items: [
      { id: 'heritage-001', modelUrl: '/models/heritage/heritage-001.glb', visualReview: 'approved' },
      { id: 'heritage-004', modelUrl: '/models/heritage/heritage-004.glb', visualReview: 'pending' }
    ]
  }, null, 2));
}

describe('HarmonyOS AR model builder', () => {
  it('collects core craft models and approved manifest models without pending entries', async () => {
    const root = await createTempRoot();
    await writeFixtureManifests(root);

    const targets = await collectArModelTargets(root);

    expect(targets.map(target => target.relativePath)).toEqual([
      'embroidered-tiger.glb',
      'heritage/heritage-001.glb'
    ]);
  });

  it('writes AR GLBs without required Draco or WebP extensions while preserving textured geometry', async () => {
    const root = await createTempRoot();
    await writeFixtureManifests(root);
    await writeCompressedWebpGlb(path.join(root, 'public/models/embroidered-tiger.glb'));
    await writeCompressedWebpGlb(path.join(root, 'public/models/heritage/heritage-001.glb'));
    await writeCompressedWebpGlb(path.join(root, 'public/models/heritage/heritage-004.glb'));

    const result = await buildHarmonyArModels({ root });

    expect(result.errors).toEqual([]);
    expect(result.built.map(item => item.relativePath)).toEqual([
      'embroidered-tiger.glb',
      'heritage/heritage-001.glb'
    ]);
    expect(result.built.every(item => item.triangles === 1 && item.outputBytes > 0)).toBe(true);

    const outputPath = path.join(root, 'public/models-ar/embroidered-tiger.glb');
    const glb = await inspectGlb(outputPath);
    expect(glb.extensionsRequired).not.toContain('KHR_draco_mesh_compression');
    expect(glb.extensionsRequired).not.toContain('EXT_texture_webp');
    expect(glb.imageMimeTypes).toEqual(['image/png']);

    const document = await new NodeIO().read(outputPath);
    const primitive = document.getRoot().listMeshes()[0].listPrimitives()[0];
    expect(primitive.getIndices().getCount()).toBe(3);
    expect(primitive.getAttribute('POSITION').getCount()).toBe(3);
    expect(primitive.getAttribute('NORMAL').getCount()).toBe(3);
    expect(primitive.getAttribute('TEXCOORD_0').getCount()).toBe(3);
    await expect(stat(path.join(root, 'public/models-ar/heritage/heritage-004.glb'))).rejects.toThrow();
  });

  it('losslessly optimizes PNG bytes without changing texture dimensions, alpha or geometry', async () => {
    const root = await createTempRoot();
    const width = 96, height = 64;
    const pixels = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      pixels[offset] = (x * 2 + y) % 256;
      pixels[offset + 1] = (x + y * 3) % 256;
      pixels[offset + 2] = (x * 3 + y * 2) % 256;
      pixels[offset + 3] = x < width / 2 ? 80 : 255;
    }
    const image = await sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
    const inputPath = path.join(root, 'public/models/alpha-fixture.glb');
    await writeCompressedWebpGlb(inputPath, image);
    const io = await createDracoIo();
    const source = await io.read(inputPath);
    const sourceImage = source.getRoot().listTextures()[0].getImage();
    const previousPng = await sharp(sourceImage).png().toBuffer();
    const expectedPixels = await sharp(sourceImage).ensureAlpha().raw().toBuffer();

    const result = await buildHarmonyArModels({ root, targets: [{ relativePath: 'alpha-fixture.glb', source: 'test' }] });
    expect(result.errors).toEqual([]);
    const outputPath = path.join(root, 'public/models-ar/alpha-fixture.glb');
    const output = await new NodeIO().read(outputPath);
    const texture = output.getRoot().listTextures()[0];
    const outputImage = texture.getImage();
    expect(texture.getMimeType()).toBe('image/png');
    expect(await sharp(outputImage).metadata()).toMatchObject({ width, height, hasAlpha: true });
    expect(await sharp(outputImage).ensureAlpha().raw().toBuffer()).toEqual(expectedPixels);
    expect(outputImage.byteLength).toBeLessThan(previousPng.byteLength);
    expect(result.built[0].outputBytes).toBe((await stat(outputPath)).size);
    const before = source.getRoot().listMeshes()[0].listPrimitives()[0];
    const after = output.getRoot().listMeshes()[0].listPrimitives()[0];
    for (const semantic of before.listSemantics()) {
      expect(after.getAttribute(semantic).getArray()).toEqual(before.getAttribute(semantic).getArray());
    }
    expect(after.getIndices().getArray()).toEqual(before.getIndices().getArray());
    expect(after.getMaterial().getBaseColorTexture()).toBe(texture);
    const glb = await inspectGlb(outputPath);
    expect(glb.extensionsUsed).not.toContain('KHR_draco_mesh_compression');
    expect(glb.extensionsUsed).not.toContain('EXT_texture_webp');
  });

  it('converts the repaired heritage-047 asset without changing decoded textures, geometry or material bindings', async () => {
    const root = await createTempRoot();
    const sourcePath = path.resolve('public/models/heritage/heritage-047.glb');
    const inputPath = path.join(root, 'public/models/heritage/heritage-047.glb');
    await copyFile(sourcePath, inputPath);

    const io = await createDracoIo();
    const source = await io.read(inputPath);
    const result = await buildHarmonyArModels({
      root,
      targets: [{ relativePath: 'heritage/heritage-047.glb', source: 'heritage-047-regression' }]
    });

    expect(result.errors).toEqual([]);
    expect(result.built[0]).toMatchObject({
      relativePath: 'heritage/heritage-047.glb',
      triangles: 19487,
      meshes: 1,
      materials: 2,
      textures: 3
    });

    const outputPath = path.join(root, 'public/models-ar/heritage/heritage-047.glb');
    const glb = await inspectGlb(outputPath);
    expect(glb.extensionsRequired).toEqual([]);
    expect(glb.extensionsUsed).toEqual([]);
    expect(glb.imageMimeTypes).toEqual(['image/png', 'image/png', 'image/png']);

    const output = await new NodeIO().read(outputPath);
    const sourceTextures = await Promise.all(source.getRoot().listTextures().map(textureRgbaSignature));
    const outputTextures = await Promise.all(output.getRoot().listTextures().map(textureRgbaSignature));
    expect(outputTextures.map(texture => ({
      name: texture.name,
      mimeType: texture.mimeType,
      width: texture.width,
      height: texture.height
    }))).toEqual(sourceTextures.map(texture => ({
      name: texture.name,
      mimeType: 'image/png',
      width: texture.width,
      height: texture.height
    })));
    for (let i = 0; i < sourceTextures.length; i++) {
      expect(outputTextures[i].rgbaBytes).toBe(sourceTextures[i].rgbaBytes);
      expect(outputTextures[i].rgbaSha256).toBe(sourceTextures[i].rgbaSha256);
    }

    const sourcePrimitives = source.getRoot().listMeshes()[0].listPrimitives();
    const outputPrimitives = output.getRoot().listMeshes()[0].listPrimitives();
    expect(outputPrimitives).toHaveLength(sourcePrimitives.length);
    for (let i = 0; i < sourcePrimitives.length; i++) {
      expect(inspectPrimitiveGeometry(outputPrimitives[i])).toEqual(inspectPrimitiveGeometry(sourcePrimitives[i]));
      expect(outputPrimitives[i].getMaterial()?.getName()).toBe(sourcePrimitives[i].getMaterial()?.getName());
    }
    expect(output.getRoot().listMaterials().map(materialTextureSignature)).toEqual(
      source.getRoot().listMaterials().map(materialTextureSignature)
    );
  });

  it('rejects output over the AR size budget instead of silently keeping it', async () => {
    const root = await createTempRoot();
    await writeFixtureManifests(root);
    await writeCompressedWebpGlb(path.join(root, 'public/models/embroidered-tiger.glb'));
    await writeCompressedWebpGlb(path.join(root, 'public/models/heritage/heritage-001.glb'));

    const result = await buildHarmonyArModels({ root, maxBytes: 128 });

    expect(result.built).toEqual([]);
    expect(result.errors).toHaveLength(2);
    expect(result.errors.every(error => error.error.includes('AR model size budget exceeded'))).toBe(true);
  });
});
