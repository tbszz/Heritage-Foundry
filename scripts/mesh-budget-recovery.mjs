import { Accessor } from '@gltf-transform/core';
import { BufferAttribute, BufferGeometry } from 'three';
import { SimplifyModifier } from 'three/examples/jsm/modifiers/SimplifyModifier.js';

export const TRIANGLE_BUDGET = 20000;
export const MAX_RECOVERY_OVERAGE_TRIANGLES = 500;
export const MAX_RECOVERY_OVERAGE_RATIO = 0.025;

const SUPPORTED_SEMANTICS = new Set(['POSITION', 'NORMAL', 'TEXCOORD_0', 'TANGENT']);
const ATTRIBUTE_TO_THREE = {
  POSITION: 'position',
  NORMAL: 'normal',
  TEXCOORD_0: 'uv',
  TANGENT: 'tangent'
};
const THREE_TO_ATTRIBUTE = {
  position: ['POSITION', Accessor.Type.VEC3],
  normal: ['NORMAL', Accessor.Type.VEC3],
  uv: ['TEXCOORD_0', Accessor.Type.VEC2],
  tangent: ['TANGENT', Accessor.Type.VEC4]
};

export function triangleCount(document) {
  let triangles = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      triangles += primitiveTriangleCount(primitive);
    }
  }
  return triangles;
}

export function recoverMeshBudget(document, options = {}) {
  const budget = options.budget ?? TRIANGLE_BUDGET;
  const beforeTriangles = triangleCount(document);
  if (beforeTriangles <= budget) {
    return { recovered: false, beforeTriangles, afterTriangles: beforeTriangles, reduction: 0 };
  }

  const overage = beforeTriangles - budget;
  const maxOverage = Math.min(MAX_RECOVERY_OVERAGE_TRIANGLES, Math.floor(budget * MAX_RECOVERY_OVERAGE_RATIO));
  if (overage > maxOverage) {
    throw new Error(`Triangle budget recovery refused: ${beforeTriangles} is too far over ${budget}`);
  }

  assertDocumentSupported(document);

  const targetTriangles = budget - Math.max(3, Math.ceil(budget * 0.001));
  const primitives = document.getRoot().listMeshes().flatMap(mesh => mesh.listPrimitives());
  let afterTriangles = beforeTriangles;
  let passes = 0;

  while (afterTriangles > targetTriangles && passes < 8) {
    const largest = primitives
      .map(primitive => ({ primitive, triangles: primitiveTriangleCount(primitive) }))
      .sort((a, b) => b.triangles - a.triangles)[0];
    if (!largest || largest.triangles < 4) break;

    const remainingReduction = afterTriangles - targetTriangles;
    const beforePrimitiveTriangles = largest.triangles;
    simplifyPrimitive(document, largest.primitive, Math.max(1, Math.ceil(remainingReduction / 2)));
    const afterPrimitiveTriangles = primitiveTriangleCount(largest.primitive);
    if (afterPrimitiveTriangles >= beforePrimitiveTriangles) {
      throw new Error('Triangle budget recovery failed: simplifier did not reduce mesh');
    }

    afterTriangles = triangleCount(document);
    passes += 1;
  }

  if (afterTriangles > budget) {
    throw new Error(`Triangle budget recovery failed: ${afterTriangles} remains over ${budget}`);
  }

  return {
    recovered: true,
    beforeTriangles,
    afterTriangles,
    reduction: beforeTriangles - afterTriangles
  };
}

function assertDocumentSupported(document) {
  if (document.getRoot().listAnimations().length > 0) {
    throw new Error('Triangle budget recovery refused: animated meshes are unsupported');
  }

  for (const node of document.getRoot().listNodes()) {
    if (node.getMesh() && node.getSkin()) {
      throw new Error('Triangle budget recovery refused: skinned meshes are unsupported');
    }
  }

  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      assertPrimitiveSupported(primitive);
    }
  }
}

function assertPrimitiveSupported(primitive) {
  if (primitive.getMode() !== 4) {
    throw new Error('Triangle budget recovery refused: only triangle meshes are supported');
  }
  if (primitive.listTargets().length > 0) {
    throw new Error('Triangle budget recovery refused: morph targets are unsupported');
  }
  if (!primitive.getMaterial()?.getBaseColorTexture()) {
    throw new Error('Triangle budget recovery refused: textured PBR material is required');
  }
  if (!primitive.getAttribute('POSITION') || !primitive.getAttribute('NORMAL') || !primitive.getAttribute('TEXCOORD_0')) {
    throw new Error('Triangle budget recovery refused: POSITION, NORMAL, and TEXCOORD_0 are required');
  }

  for (const semantic of primitive.listSemantics()) {
    if (semantic === 'COLOR_0') {
      throw new Error('Triangle budget recovery refused: COLOR_0 cannot be safely preserved by SimplifyModifier in Node');
    }
    if (semantic.startsWith('JOINTS_') || semantic.startsWith('WEIGHTS_')) {
      throw new Error('Triangle budget recovery refused: skinned vertex attributes are unsupported');
    }
    if (!SUPPORTED_SEMANTICS.has(semantic)) {
      throw new Error(`Triangle budget recovery refused: unsupported vertex attribute ${semantic}`);
    }
  }
}

function simplifyPrimitive(document, primitive, preferredCollapses) {
  const geometry = primitiveToGeometry(primitive);
  const vertexCount = geometry.getAttribute('position').count;
  const maxCollapses = Math.max(1, Math.floor(vertexCount * 0.015));
  const collapseCount = Math.min(Math.max(1, preferredCollapses), maxCollapses);
  const simplified = new SimplifyModifier().modify(geometry, collapseCount);
  writeGeometryToPrimitive(document, primitive, simplified);
}

function primitiveTriangleCount(primitive) {
  const position = primitive.getAttribute('POSITION');
  if (!position) throw new Error('Missing vertex positions');
  const indices = primitive.getIndices();
  const count = indices?.getCount() ?? position.getCount();
  if (count % 3 !== 0) throw new Error('Triangle index count is not divisible by three');
  return count / 3;
}

function primitiveToGeometry(primitive) {
  const geometry = new BufferGeometry();
  for (const semantic of primitive.listSemantics()) {
    const threeName = ATTRIBUTE_TO_THREE[semantic];
    if (!threeName) continue;
    const accessor = primitive.getAttribute(semantic);
    geometry.setAttribute(threeName, new BufferAttribute(accessor.getArray().slice(), accessor.getElementSize()));
  }

  const indices = primitive.getIndices();
  if (indices) {
    geometry.setIndex(new BufferAttribute(indices.getArray().slice(), 1));
  }

  return geometry;
}

function writeGeometryToPrimitive(document, primitive, geometry) {
  const buffer = document.getRoot().listBuffers()[0] ?? document.createBuffer('buffer');

  for (const semantic of primitive.listSemantics()) {
    if (SUPPORTED_SEMANTICS.has(semantic)) {
      primitive.setAttribute(semantic, null);
    }
  }

  for (const [threeName, [semantic, type]] of Object.entries(THREE_TO_ATTRIBUTE)) {
    const attribute = geometry.getAttribute(threeName);
    if (!attribute) continue;
    primitive.setAttribute(
      semantic,
      document.createAccessor(semantic.toLowerCase()).setArray(attribute.array.slice()).setType(type).setBuffer(buffer)
    );
  }

  const index = geometry.getIndex();
  primitive.setIndices(
    index
      ? document.createAccessor('indices').setArray(index.array.slice()).setType(Accessor.Type.SCALAR).setBuffer(buffer)
      : null
  );
}
