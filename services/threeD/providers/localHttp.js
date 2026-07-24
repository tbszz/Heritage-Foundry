const {
  createServiceError,
  normalizeTask,
  readPositiveInteger
} = require('./taskContract');
const { validateTargetPolycount } = require('./meshy');

const DEFAULT_ALLOWED_HOSTS = ['127.0.0.1', 'localhost', '[::1]', '::1'];
const DEFAULT_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_MODEL_BYTES = 100 * 1024 * 1024;

function localError(message, statusCode, code, category, retryable = false) {
  return createServiceError(message, statusCode, code, {
    provider: 'local',
    category,
    retryable
  });
}

function getAllowedHosts() {
  const configured = String(process.env.LOCAL_3D_ALLOWED_HOSTS || '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  return new Set(configured.length ? configured : DEFAULT_ALLOWED_HOSTS);
}

function getConfig() {
  const configuredUrl = String(process.env.LOCAL_3D_BASE_URL || '').trim();
  if (!configuredUrl) {
    throw localError(
      'LOCAL_3D_BASE_URL 未配置，无法连接本地 3D 引擎',
      503,
      'LOCAL_3D_NOT_CONFIGURED',
      'not_configured'
    );
  }

  let parsed;
  try {
    parsed = new URL(configuredUrl);
  } catch (_error) {
    throw localError('本地 3D 服务地址无效', 503, 'LOCAL_3D_INVALID_BASE_URL', 'configuration');
  }

  const allowedHosts = getAllowedHosts();
  const hostname = parsed.hostname.toLowerCase();
  const isValid = ['http:', 'https:'].includes(parsed.protocol)
    && !parsed.username
    && !parsed.password
    && !parsed.search
    && !parsed.hash
    && allowedHosts.has(hostname);
  if (!isValid) {
    throw localError('本地 3D 服务地址未通过安全校验', 503, 'LOCAL_3D_INVALID_BASE_URL', 'configuration');
  }

  return {
    baseUrl: parsed.href.replace(/\/+$/, ''),
    origin: parsed.origin,
    apiKey: String(process.env.LOCAL_3D_API_KEY || '').trim(),
    timeoutMs: readPositiveInteger(process.env.LOCAL_3D_TIMEOUT_MS, 30000),
    maxImageBytes: readPositiveInteger(
      process.env.LOCAL_3D_MAX_IMAGE_BYTES,
      DEFAULT_MAX_IMAGE_BYTES
    ),
    maxModelBytes: readPositiveInteger(
      process.env.LOCAL_3D_MAX_MODEL_BYTES,
      DEFAULT_MAX_MODEL_BYTES
    )
  };
}

function isConfigured() {
  try {
    getConfig();
    return true;
  } catch (_error) {
    return false;
  }
}

async function getCapabilities() {
  const configured = isConfigured();
  let ready = false;
  let textured = false;
  let vertexColored = false;
  if (configured) {
    try {
      const { data } = await requestLocal('/v1/capabilities');
      textured = data?.imageTo3D?.texturing === true;
      vertexColored = data?.imageTo3D?.vertexColors === true;
      ready = data?.apiVersion === '1'
        && data?.ready === true
        && Array.isArray(data?.imageTo3D?.formats)
        && data.imageTo3D.formats.includes('glb')
        && data.imageTo3D.pbr === true
        && (textured || vertexColored);
    } catch (_error) {
      ready = false;
    }
  }
  return {
    provider: 'local',
    configured,
    ready,
    outputFormat: 'glb',
    textured,
    ...(vertexColored ? { vertexColored: true } : {}),
    pbr: true
  };
}

function validateLocalImage(imageUrl, maxImageBytes) {
  const match = /^data:image\/(png|jpeg|webp);base64,([a-z0-9+/]+={0,2})$/i.exec(imageUrl);
  if (!match) {
    throw localError(
      '本地 3D 引擎只接受 PNG、JPEG 或 WebP 的 base64 参考图',
      400,
      'LOCAL_3D_INVALID_IMAGE',
      'invalid_request'
    );
  }
  if (Buffer.from(match[2], 'base64').byteLength > maxImageBytes) {
    throw localError(
      '3D 参考图超过本地引擎大小限制',
      413,
      'LOCAL_3D_IMAGE_TOO_LARGE',
      'invalid_request'
    );
  }
  return imageUrl;
}

function resolveArtifactUrl(value, config) {
  if (!value) return null;
  let resolved;
  try {
    resolved = new URL(value, `${config.baseUrl}/`);
  } catch (_error) {
    throw localError('本地 3D 引擎返回了无效资源地址', 502, 'LOCAL_3D_INVALID_RESPONSE', 'invalid_response');
  }
  if (!['http:', 'https:'].includes(resolved.protocol) || resolved.origin !== config.origin) {
    throw localError('本地 3D 资源地址未通过安全校验', 502, 'LOCAL_3D_INVALID_RESPONSE', 'invalid_response');
  }
  return resolved.href;
}

function normalizeLocalTask(task, fallbackId = null, config = getConfig()) {
  return normalizeTask({
    id: task?.id || fallbackId,
    status: task?.status,
    progress: task?.progress,
    modelUrl: resolveArtifactUrl(task?.model_url || task?.modelUrl, config),
    previewUrl: resolveArtifactUrl(task?.preview_url || task?.previewUrl, config),
    error: typeof task?.error === 'string' ? task.error.trim().slice(0, 400) : null
  }, {
    provider: 'local',
    invalidResponseCode: 'LOCAL_3D_INVALID_RESPONSE'
  });
}

function getSignal(timeoutMs) {
  return typeof AbortSignal?.timeout === 'function'
    ? AbortSignal.timeout(timeoutMs)
    : undefined;
}

function isRedirectError(error) {
  return /redirect/i.test([
    error?.message,
    error?.cause?.message,
    error?.cause?.code
  ].filter(Boolean).join(' '));
}

function mapReadError(error, label = '本地 3D 服务') {
  if (error?.statusCode) return error;
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
    return localError(`读取${label}响应超时`, 504, 'LOCAL_3D_TIMEOUT', 'timeout', true);
  }
  return localError(`无法读取${label}的响应`, 503, 'LOCAL_3D_NETWORK_ERROR', 'network', true);
}

async function requestLocal(path, options = {}) {
  const config = getConfig();
  const headers = { ...options.headers };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      ...options,
      headers,
      redirect: 'error',
      signal: getSignal(config.timeoutMs)
    });

    if (!response.ok) {
      if (response.status === 400 || response.status === 413 || response.status === 422) {
        throw localError('本地 3D 生成参数无效', 400, 'LOCAL_3D_INVALID_REQUEST', 'invalid_request');
      }
      if (response.status === 401 || response.status === 403) {
        throw localError('本地 3D 服务鉴权失败', 502, 'LOCAL_3D_AUTH_FAILED', 'auth');
      }
      if (response.status === 404) {
        throw localError('本地 3D 任务不存在', 404, 'LOCAL_3D_TASK_NOT_FOUND', 'not_found');
      }
      if (response.status === 429) {
        throw localError('本地 3D 服务繁忙，请稍后重试', 503, 'LOCAL_3D_RATE_LIMITED', 'rate_limited', true);
      }
      throw localError('本地 3D 服务暂时不可用', 502, 'LOCAL_3D_UPSTREAM_ERROR', 'upstream', true);
    }

    try {
      return { data: await response.json(), config };
    } catch (error) {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        throw mapReadError(error);
      }
      if (error instanceof SyntaxError) {
        throw localError('本地 3D 服务返回了无效数据', 502, 'LOCAL_3D_INVALID_RESPONSE', 'invalid_response');
      }
      throw mapReadError(error);
    }
  } catch (error) {
    if (error?.statusCode) throw error;
    if (isRedirectError(error)) {
      throw localError('本地 3D 服务拒绝跨地址重定向', 502, 'LOCAL_3D_REDIRECT_REJECTED', 'security');
    }
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw localError('本地 3D 服务响应超时', 504, 'LOCAL_3D_TIMEOUT', 'timeout', true);
    }
    throw localError('无法连接本地 3D 服务', 503, 'LOCAL_3D_NETWORK_ERROR', 'network', true);
  }
}

function buildCreatePayload(imageUrl, options, config) {
  const payload = {
    image_url: validateLocalImage(imageUrl, config.maxImageBytes),
    output_format: 'glb',
    texture: true,
    pbr: true,
    remesh: true,
    target_polycount: validateTargetPolycount(options.target_polycount)
  };
  if (['a-pose', 't-pose'].includes(options.pose_mode)) payload.pose_mode = options.pose_mode;
  return payload;
}

async function createImageTo3DTask(imageUrl, options = {}) {
  const config = getConfig();
  const { data } = await requestLocal('/v1/image-to-3d', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildCreatePayload(imageUrl, options, config))
  });
  return normalizeLocalTask(data, null, config);
}

async function getImageTo3DTask(taskId) {
  const { data, config } = await requestLocal(`/v1/image-to-3d/${encodeURIComponent(taskId)}`);
  return normalizeLocalTask(data, taskId, config);
}

function validateGlb(bytes) {
  if (bytes.byteLength < 20) return false;
  if (
    bytes.readUInt32LE(0) !== 0x46546c67
    || bytes.readUInt32LE(4) !== 2
    || bytes.readUInt32LE(8) !== bytes.byteLength
  ) {
    return false;
  }

  let offset = 12;
  let chunkIndex = 0;
  let document = null;
  while (offset < bytes.byteLength) {
    if (offset + 8 > bytes.byteLength) return false;
    const chunkLength = bytes.readUInt32LE(offset);
    const chunkType = bytes.readUInt32LE(offset + 4);
    const chunkEnd = offset + 8 + chunkLength;
    if (chunkLength % 4 !== 0 || chunkEnd > bytes.byteLength) return false;
    if (chunkIndex === 0) {
      if (chunkType !== 0x4e4f534a || chunkLength === 0) return false;
      try {
        const json = bytes.subarray(offset + 8, chunkEnd)
          .toString('utf8')
          .replace(/[\u0000 ]+$/g, '');
        document = JSON.parse(json);
        if (document?.asset?.version !== '2.0') return false;
      } catch (_error) {
        return false;
      }
    }
    offset = chunkEnd;
    chunkIndex += 1;
  }
  if (chunkIndex === 0 || offset !== bytes.byteLength || !document) return false;
  const meshes = document.meshes;
  const accessors = document.accessors;
  const scenes = document.scenes;
  const nodes = document.nodes;
  if (![meshes, accessors, scenes, nodes].every((value) => Array.isArray(value) && value.length)) {
    return false;
  }
  const sceneIndex = Number.isInteger(document.scene) ? document.scene : 0;
  if (sceneIndex < 0 || sceneIndex >= scenes.length || !Array.isArray(scenes[sceneIndex]?.nodes)) {
    return false;
  }
  const pending = [...scenes[sceneIndex].nodes];
  const visited = new Set();
  while (pending.length) {
    const nodeIndex = pending.pop();
    if (!Number.isInteger(nodeIndex) || nodeIndex < 0 || nodeIndex >= nodes.length) return false;
    if (visited.has(nodeIndex)) continue;
    visited.add(nodeIndex);
    const node = nodes[nodeIndex] || {};
    if (Array.isArray(node.children)) pending.push(...node.children);
    if (!Number.isInteger(node.mesh) || node.mesh < 0 || node.mesh >= meshes.length) continue;
    for (const primitive of meshes[node.mesh]?.primitives || []) {
      const positionIndex = primitive?.attributes?.POSITION;
      if (!Number.isInteger(positionIndex) || positionIndex < 0 || positionIndex >= accessors.length) {
        continue;
      }
      const position = accessors[positionIndex];
      if (
        position?.componentType === 5126
        && position?.type === 'VEC3'
        && Number.isInteger(position?.count)
        && position.count >= 3
      ) {
        return true;
      }
    }
  }
  return false;
}

async function readLimitedBody(response, maxBytes) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    throw localError(
      '本地 3D 服务未返回可读取的 GLB 数据流',
      502,
      'LOCAL_3D_INVALID_RESPONSE',
      'invalid_response'
    );
  }

  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      total += chunk.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw localError(
          '本地 GLB 超过代理大小限制',
          502,
          'LOCAL_3D_INVALID_RESPONSE',
          'invalid_response'
        );
      }
      chunks.push(chunk);
    }
  } catch (error) {
    throw mapReadError(error, '本地 GLB');
  }
  return Buffer.concat(chunks, total);
}

async function getModelArtifact(taskId) {
  const task = await getImageTo3DTask(taskId);
  if (task.status !== 'succeeded' || !task.modelUrl) {
    throw localError(
      '本地 3D 模型尚未生成完成',
      409,
      'LOCAL_3D_ARTIFACT_NOT_READY',
      'not_ready'
    );
  }

  const config = getConfig();
  const artifactUrl = resolveArtifactUrl(task.modelUrl, config);
  const headers = {};
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

  let response;
  try {
    response = await fetch(artifactUrl, {
      method: 'GET',
      headers,
      redirect: 'error',
      signal: getSignal(config.timeoutMs)
    });
  } catch (error) {
    if (isRedirectError(error)) {
      throw localError('本地 GLB 拒绝跨地址重定向', 502, 'LOCAL_3D_REDIRECT_REJECTED', 'security');
    }
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw localError('本地 GLB 读取超时', 504, 'LOCAL_3D_TIMEOUT', 'timeout', true);
    }
    throw localError('无法读取本地 GLB', 503, 'LOCAL_3D_NETWORK_ERROR', 'network', true);
  }

  if (!response.ok) {
    throw localError('本地 GLB 暂时不可用', 502, 'LOCAL_3D_UPSTREAM_ERROR', 'upstream', true);
  }
  const declaredSize = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declaredSize) && declaredSize > config.maxModelBytes) {
    throw localError('本地 GLB 超过代理大小限制', 502, 'LOCAL_3D_INVALID_RESPONSE', 'invalid_response');
  }

  const bytes = await readLimitedBody(response, config.maxModelBytes);
  if (bytes.byteLength > config.maxModelBytes || !validateGlb(bytes)) {
    throw localError('本地 3D 服务返回了无效 GLB', 502, 'LOCAL_3D_INVALID_RESPONSE', 'invalid_response');
  }
  return {
    bytes,
    contentType: 'model/gltf-binary'
  };
}

module.exports = {
  id: 'local',
  isConfigured,
  getCapabilities,
  createImageTo3DTask,
  getImageTo3DTask,
  getModelArtifact,
  normalizeLocalTask,
  validateLocalImage,
  validateGlb,
  buildCreatePayload
};
