const {
  createServiceError,
  normalizeStatus,
  normalizeTask,
  readPositiveInteger
} = require('./taskContract');

const DEFAULT_BASE_URL = 'https://api.meshy.ai/openapi/v1';

function meshyError(message, statusCode, code, category, retryable = false) {
  return createServiceError(message, statusCode, code, {
    provider: 'meshy',
    category,
    retryable
  });
}

function getConfig() {
  const apiKey = process.env.MESHY_API_KEY;
  if (!apiKey) {
    throw meshyError(
      'MESHY_API_KEY 未配置，无法生成真实 3D 模型',
      503,
      'MESHY_NOT_CONFIGURED',
      'not_configured'
    );
  }

  return {
    apiKey,
    baseUrl: (process.env.MESHY_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '')
  };
}

function isConfigured() {
  return Boolean(process.env.MESHY_API_KEY);
}

function getCapabilities() {
  return {
    provider: 'meshy',
    configured: isConfigured(),
    ready: isConfigured(),
    outputFormat: 'glb',
    textured: true,
    pbr: true
  };
}

function normalizeMeshyStatus(status) {
  return normalizeStatus(status);
}

function normalizeMeshyTask(task, fallbackId = null) {
  return normalizeTask({
    id: task?.id || fallbackId,
    status: task?.status,
    progress: task?.progress,
    modelUrl: task?.model_urls?.glb || task?.modelUrls?.glb || null,
    previewUrl: task?.thumbnail_url || task?.thumbnailUrl || task?.previewUrl || null
  }, {
    provider: 'meshy',
    invalidResponseCode: 'MESHY_INVALID_RESPONSE'
  });
}

function getRequestSignal() {
  const timeoutMs = readPositiveInteger(process.env.MESHY_TIMEOUT_MS, 30000);
  return typeof AbortSignal?.timeout === 'function'
    ? AbortSignal.timeout(timeoutMs)
    : undefined;
}

async function requestMeshy(path, options = {}) {
  const { apiKey, baseUrl } = getConfig();

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...options.headers
      },
      redirect: 'error',
      signal: getRequestSignal()
    });

    if (!response.ok) {
      if (response.status === 400) {
        throw meshyError('3D 生成参数无效', 400, 'MESHY_INVALID_REQUEST', 'invalid_request');
      }
      if (response.status === 401 || response.status === 403) {
        throw meshyError('3D 生成服务鉴权失败', 502, 'MESHY_AUTH_FAILED', 'auth');
      }
      if (response.status === 402) {
        throw meshyError('3D 生成额度不足', 402, 'MESHY_CREDITS_EXHAUSTED', 'credits');
      }
      if (response.status === 404) {
        throw meshyError('3D 生成任务不存在', 404, 'MESHY_TASK_NOT_FOUND', 'not_found');
      }
      if (response.status === 429) {
        throw meshyError('3D 生成服务繁忙，请稍后重试', 503, 'MESHY_RATE_LIMITED', 'rate_limited', true);
      }
      throw meshyError('3D 生成服务暂时不可用', 502, 'MESHY_UPSTREAM_ERROR', 'upstream', true);
    }

    try {
      return await response.json();
    } catch (_error) {
      throw meshyError('3D 生成服务返回了无效数据', 502, 'MESHY_INVALID_RESPONSE', 'invalid_response');
    }
  } catch (error) {
    if (error?.statusCode) throw error;
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw meshyError('3D 生成服务响应超时', 504, 'MESHY_TIMEOUT', 'timeout', true);
    }
    throw meshyError('无法连接 3D 生成服务', 503, 'MESHY_NETWORK_ERROR', 'network', true);
  }
}

function validateTargetPolycount(value) {
  const requested = value ?? 100000;
  if (
    !Number.isInteger(Number(requested))
    || Number(requested) < 10000
    || Number(requested) > 300000
  ) {
    throw createServiceError(
      'target_polycount 必须是 10000 到 300000 之间的整数',
      400,
      'INVALID_POLYCOUNT',
      { category: 'invalid_request', retryable: false }
    );
  }
  return Number(requested);
}

function buildCreatePayload(imageUrl, options = {}) {
  const payload = {
    image_url: imageUrl,
    ai_model: 'latest',
    model_type: 'standard',
    should_texture: true,
    enable_pbr: true,
    hd_texture: true,
    remove_lighting: true,
    should_remesh: true,
    target_polycount: validateTargetPolycount(options.target_polycount),
    auto_size: true,
    origin_at: 'bottom',
    target_formats: ['glb']
  };

  if (['a-pose', 't-pose'].includes(options.pose_mode)) payload.pose_mode = options.pose_mode;
  return payload;
}

async function createImageTo3DTask(imageUrl, options = {}) {
  const result = await requestMeshy('/image-to-3d', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildCreatePayload(imageUrl, options))
  });
  const taskId = result?.result || result?.id;
  if (!taskId) {
    throw meshyError('3D 生成服务未返回任务编号', 502, 'MESHY_INVALID_RESPONSE', 'invalid_response');
  }
  return normalizeMeshyTask({ id: taskId, status: 'PENDING', progress: 0 });
}

async function getImageTo3DTask(taskId) {
  const task = await requestMeshy(`/image-to-3d/${encodeURIComponent(taskId)}`);
  return normalizeMeshyTask(task, taskId);
}

module.exports = {
  id: 'meshy',
  isConfigured,
  getCapabilities,
  createImageTo3DTask,
  getImageTo3DTask,
  normalizeMeshyStatus,
  normalizeMeshyTask,
  buildCreatePayload,
  validateTargetPolycount
};
