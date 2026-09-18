import { Accessor, Document } from '@gltf-transform/core';
import { describe, expect, it } from 'vitest';
import { PlaneGeometry } from 'three';
import { recoverMeshBudget, triangleCount } from '../scripts/mesh-budget-recovery.mjs';

function createAccessor(document, name, array, type) {
  const buffer = document.getRoot().listBuffers()[0] ?? document.createBuffer('buffer');
  return document.createAccessor(name).setArray(array).setType(type).setBuffer(buffer);
}

function createTexturedPlaneDocument({ widthSegments, heightSegments, withColor = false }) {
  const document = new Document();
  const geometry = new PlaneGeometry(1, 1, widthSegments, heightSegments);
  const primitive = document.createPrimitive()
    .setAttribute('POSITION', createAccessor(document, 'position', geometry.attributes.position.array.slice(), Accessor.Type.VEC3))
    .setAttribute('NORMAL', createAccessor(document, 'normal', geometry.attributes.normal.array.slice(), Accessor.Type.VEC3))
    .setAttribute('TEXCOORD_0', createAccessor(document, 'uv', geometry.attributes.uv.array.slice(), Accessor.Type.VEC2))
    .setIndices(createAccessor(document, 'indices', geometry.index.array.slice(), Accessor.Type.SCALAR));
  if (withColor) {
    primitive.setAttribute('COLOR_0', createAccessor(document, 'color', new Float32Array(geometry.attributes.position.count * 3).fill(1), Accessor.Type.VEC3));
  }
  const texture = document.createTexture('albedo').setMimeType('image/png').setImage(new Uint8Array([1, 2, 3, 4]));
  const material = document.createMaterial('textured').setBaseColorTexture(texture);
  primitive.setMaterial(material);
  const mesh = document.createMesh('mesh').addPrimitive(primitive);
  document.createScene('scene').addChild(document.createNode('node').setMesh(mesh));
  return { document, material, primitive };
}

describe('mesh budget recovery', () => {
  it('reduces a slightly over-budget textured mesh while preserving render-critical attributes', () => {
    const { document, material, primitive } = createTexturedPlaneDocument({ widthSegments: 25, heightSegments: 20 });
    const beforeTriangles = triangleCount(document);

    const result = recoverMeshBudget(document, { budget: 980 });

    expect(beforeTriangles).toBe(1000);
    expect(result).toMatchObject({ recovered: true, beforeTriangles: 1000 });
    expect(result.afterTriangles).toBeGreaterThan(0);
    expect(result.afterTriangles).toBeLessThanOrEqual(980);
    expect(primitive.getMaterial()).toBe(material);
    expect(primitive.getMaterial()?.getBaseColorTexture()).toBeTruthy();
    expect(primitive.getAttribute('TEXCOORD_0')?.getCount()).toBe(primitive.getAttribute('POSITION')?.getCount());
    expect(primitive.getAttribute('NORMAL')?.getCount()).toBe(primitive.getAttribute('POSITION')?.getCount());
    expect(primitive.getIndices()?.getCount() % 3).toBe(0);
    expect([...primitive.getAttribute('POSITION').getArray()]).toEqual(expect.arrayContaining([expect.any(Number)]));
    expect([...primitive.getAttribute('POSITION').getArray()].every(Number.isFinite)).toBe(true);
  });

  it('rejects meshes too far over the cap instead of broad simplification', () => {
    const { document } = createTexturedPlaneDocument({ widthSegments: 25, heightSegments: 20 });

    expect(() => recoverMeshBudget(document, { budget: 500 })).toThrow('too far over');
  });

  it('rejects vertex colors because the selected simplifier cannot safely preserve them in Node', () => {
    const { document } = createTexturedPlaneDocument({ widthSegments: 25, heightSegments: 20, withColor: true });

    expect(() => recoverMeshBudget(document, { budget: 980 })).toThrow('COLOR_0');
  });
});
