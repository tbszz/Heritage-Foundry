const meshyProvider = require('./threeD/providers/meshy');
const localProvider = require('./threeD/providers/localHttp');
const tripoProvider = require('./threeD/providers/tripo');
const {
  createServiceError,
  readPositiveInteger
} = require('./threeD/providers/taskContract');

const MAX_UPSTREAM_TASK_ID_BYTES = 256;
const MAX_LOCAL_PUBLIC_TASK_ID_LENGTH = 'local:'.length + Math.ceil(MAX_UPSTREAM_TASK_ID_BYTES * 4 / 3);
const MAX_TRIPO_PUBLIC_TASK_ID_LENGTH = 'tripo:'.length + Math.ceil(MAX_UPSTREAM_TASK_ID_BYTES * 4 / 3);
let capabilityCache = null;
let capabilityInFlight = null;

const PROVIDERS = Object.freeze({
  meshy: meshyProvider,
  local: localProvider,
  tripo: tripoProvider
});

function getProviderName() {
  const providerName = String(process.env.THREE_D_PROVIDER || 'meshy').trim().toLowerCase();
  if (!PROVIDERS[providerName]) {
    throw createServiceError(
      'THREE_D_PROVIDER 必须是 meshy、local 或 tripo',
      503,
      'THREE_D_PROVIDER_INVALID',
      { category: 'configuration', retryable: false }
    );
  }
  return providerName;
}

function getSelectedProvider() {
  return PROVIDERS[getProviderName()];
}

function isConfigured() {
  try {
    return getSelectedProvider().isConfigured();
  } catch (_error) {
    return false;
  }
}

function getCapabilityCacheKey(providerName) {
  if (providerName === 'local') {
    return [
      providerName,
      process.env.LOCAL_3D_BASE_URL || '',
      process.env.LOCAL_3D_ALLOWED_HOSTS || '',
      Boolean(process.env.LOCAL_3D_API_KEY)
    ].join('|');
  }
  if (providerName === 'tripo') {
    return [
      providerName,
      process.env.TRIPO_API_BASE_URL || '',
      process.env.TRIPO_MODEL || '',
      process.env.TRIPO_FACE_LIMIT || '',
      process.env.TRIPO_TEXTURE_QUALITY || '',
      process.env.TRIPO_GEOMETRY_QUALITY || '',
      Boolean(process.env.TRIPO_API_KEY)
    ].join('|');
  }
  return [
    providerName,
    process.env.MESHY_API_BASE_URL || '',
    Boolean(process.env.MESHY_API_KEY)
  ].join('|');
}

async function getCapabilities() {
  const providerName = getProviderName();
  const cacheKey = getCapabilityCacheKey(providerName);
  const now = Date.now();
  if (capabilityCache?.key === cacheKey && capabilityCache.expiresAt > now) {
    return capabilityCache.value;
  }
  if (capabilityInFlight?.key === cacheKey) {
    return capabilityInFlight.promise;
  }

  const ttlMs = readPositiveInteger(process.env.THREE_D_CAPABILITY_CACHE_MS, 5000);
  const promise = Promise.resolve(PROVIDERS[providerName].getCapabilities())
    .then((capabilities) => {
      const value = Object.freeze({ ...capabilities });
      capabilityCache = {
        key: cacheKey,
        value,
        expiresAt: Date.now() + ttlMs
      };
      return value;
    });
  capabilityInFlight = { key: cacheKey, promise };
  try {
    return await promise;
  } finally {
    if (capabilityInFlight?.promise === promise) capabilityInFlight = null;
  }
}

function validateImageUrl(imageUrl) {
  if (typeof imageUrl !== 'string' || imageUrl.trim().length === 0) {
    throw createServiceError('image_url 不能为空', 400, 'INVALID_IMAGE', {
      category: 'invalid_request',
      retryable: false
    });
  }
  return imageUrl.trim();
}

function validateUpstreamTaskId(taskId) {
  if (typeof taskId !== 'string' || taskId.trim().length === 0) {
    throw createServiceError('taskId 不能为空', 400, 'INVALID_TASK_ID', {
      category: 'invalid_request',
      retryable: false
    });
  }
  const normalized = taskId.trim();
  if (
    Buffer.byteLength(normalized, 'utf8') > MAX_UPSTREAM_TASK_ID_BYTES
    || /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw createServiceError('taskId 格式无效', 400, 'INVALID_TASK_ID', {
      category: 'invalid_request',
      retryable: false
    });
  }
  return normalized;
}

function validatePublicTaskId(taskId) {
  if (typeof taskId !== 'string' || taskId.trim().length === 0) {
    throw createServiceError('taskId 不能为空', 400, 'INVALID_TASK_ID', {
      category: 'invalid_request',
      retryable: false
    });
  }
  const normalized = taskId.trim();
  if (normalized.startsWith('local:')) {
    if (
      normalized.length > MAX_LOCAL_PUBLIC_TASK_ID_LENGTH
      || /[\u0000-\u001f\u007f]/.test(normalized)
    ) {
      throw createServiceError('taskId 格式无效', 400, 'INVALID_TASK_ID', {
        category: 'invalid_request',
        retryable: false
      });
    }
    return normalized;
  }
  if (normalized.startsWith('tripo:')) {
    if (
      normalized.length > MAX_TRIPO_PUBLIC_TASK_ID_LENGTH
      || /[\u0000-\u001f\u007f]/.test(normalized)
    ) {
      throw createServiceError('taskId 格式无效', 400, 'INVALID_TASK_ID', {
        category: 'invalid_request',
        retryable: false
      });
    }
    return normalized;
  }
  return validateUpstreamTaskId(normalized);
}

function encodePrefixedTaskId(prefix, taskId) {
  return `${prefix}:${Buffer.from(validateUpstreamTaskId(taskId), 'utf8').toString('base64url')}`;
}

function decodePrefixedTaskId(publicTaskId, prefix) {
  const encoded = publicTaskId.slice(`${prefix}:`.length);
  if (!encoded || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    throw createServiceError('taskId 格式无效', 400, 'INVALID_TASK_ID', {
      category: 'invalid_request',
      retryable: false
    });
  }
  const decoded = Buffer.from(encoded, 'base64url').toString('utf8');
  if (Buffer.from(decoded, 'utf8').toString('base64url') !== encoded) {
    throw createServiceError('taskId 格式无效', 400, 'INVALID_TASK_ID', {
      category: 'invalid_request',
      retryable: false
    });
  }
  return validateUpstreamTaskId(decoded);
}

function toPublicTask(task, providerName) {
  if (providerName === 'tripo') {
    const publicId = encodePrefixedTaskId('tripo', task.id);
    return {
      ...task,
      id: publicId,
      provider: 'tripo'
    };
  }
  if (providerName !== 'local') return task;
  const publicId = encodePrefixedTaskId('local', task.id);
  return {
    ...task,
    id: publicId,
    provider: 'local',
    modelUrl: task.modelUrl
      ? `/api/generate-3d/${encodeURIComponent(publicId)}/artifacts/model.glb`
      : null,
    previewUrl: null
  };
}

function resolveTaskProvider(publicTaskId) {
  if (publicTaskId.startsWith('local:')) {
    return {
      providerName: 'local',
      provider: localProvider,
      upstreamTaskId: decodePrefixedTaskId(publicTaskId, 'local')
    };
  }
  if (publicTaskId.startsWith('tripo:')) {
    return {
      providerName: 'tripo',
      provider: tripoProvider,
      upstreamTaskId: decodePrefixedTaskId(publicTaskId, 'tripo')
    };
  }
  const providerName = getProviderName();
  return {
    providerName,
    provider: PROVIDERS[providerName],
    upstreamTaskId: publicTaskId
  };
}

async function createImageTo3DTask(imageUrl, options = {}) {
  const providerName = getProviderName();
  const task = await PROVIDERS[providerName].createImageTo3DTask(
    validateImageUrl(imageUrl),
    options
  );
  return toPublicTask(task, providerName);
}

async function getImageTo3DTask(taskId) {
  const publicTaskId = validatePublicTaskId(taskId);
  const resolved = resolveTaskProvider(publicTaskId);
  const task = await resolved.provider.getImageTo3DTask(resolved.upstreamTaskId);
  return toPublicTask(task, resolved.providerName);
}

async function getModelArtifact(taskId) {
  const publicTaskId = validatePublicTaskId(taskId);
  const resolved = resolveTaskProvider(publicTaskId);
  if (resolved.providerName !== 'local' || typeof resolved.provider.getModelArtifact !== 'function') {
    throw createServiceError(
      '当前 3D provider 不使用本地模型代理',
      400,
      'THREE_D_ARTIFACT_PROXY_UNSUPPORTED',
      { category: 'invalid_request', retryable: false }
    );
  }
  return resolved.provider.getModelArtifact(resolved.upstreamTaskId);
}

module.exports = {
  isConfigured,
  getCapabilities,
  getProviderName,
  createImageTo3DTask,
  getImageTo3DTask,
  getModelArtifact,
  normalizeMeshyStatus: meshyProvider.normalizeMeshyStatus,
  normalizeMeshyTask: meshyProvider.normalizeMeshyTask,
  buildCreatePayload: meshyProvider.buildCreatePayload,
  normalizeTripoTask: tripoProvider.normalizeTripoTask,
  buildTripoCreatePayload: tripoProvider.buildCreatePayload
};
