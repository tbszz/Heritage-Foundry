const {
  createServiceError,
  normalizeTask,
  readPositiveInteger
} = require('./taskContract');

const DEFAULT_BASE_URL = 'https://openapi.tripo3d.ai/v3';
const DEFAULT_MODEL = 'v3.1-20260211';
const DEFAULT_FACE_LIMIT = 10000;
const DEFAULT_MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const PAID_CREATE_ENDPOINT = '/generation/image-to-model';
const PAID_TEXTURE_ENDPOINT = '/models/texture';
const TRIPO_STATUS_ALIASES = Object.freeze({
  running: 'processing',
  cancelled: 'canceled'
});

function tripoError(message, statusCode, code, category, retryable = false) {
  return createServiceError(message, statusCode, code, {
    provider: 'tripo',
    category,
    retryable
  });
}

function annotateCreateStage(error, stage, paidCreateAttempted, endpoint = PAID_CREATE_ENDPOINT) {
  error.tripoStage = stage;
  error.tripoPaidCreateAttempted = paidCreateAttempted;
  error.tripoPaidCreateEndpoint = endpoint;
  return error;
}

function getConfig() {
  const apiKey = process.env.TRIPO_API_KEY;
  if (!apiKey) {
    throw tripoError(
      'TRIPO_API_KEY 未配置，无法生成真实 3D 模型',
      503,
      'TRIPO_NOT_CONFIGURED',
      'not_configured'
    );
  }

  return {
    apiKey,
    baseUrl: (process.env.TRIPO_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ''),
    timeoutMs: readPositiveInteger(process.env.TRIPO_TIMEOUT_MS, 30000),
    maxImageBytes: readPositiveInteger(process.env.TRIPO_MAX_IMAGE_BYTES, DEFAULT_MAX_IMAGE_BYTES)
  };
}

function isConfigured() {
  return Boolean(process.env.TRIPO_API_KEY);
}

function getSignal(timeoutMs) {
  return typeof AbortSignal?.timeout === 'function'
    ? AbortSignal.timeout(timeoutMs)
    : undefined;
}

function mapTripoStatusCode(status) {
  if (status === 400 || status === 413 || status === 422) {
    return tripoError('3D 生成参数无效', 400, 'TRIPO_INVALID_REQUEST', 'invalid_request');
  }
  if (status === 401 || status === 403) {
    return tripoError('3D 生成服务鉴权失败', 502, 'TRIPO_AUTH_FAILED', 'auth');
  }
  if (status === 402) {
    return tripoError('3D 生成额度不足', 402, 'TRIPO_CREDITS_EXHAUSTED', 'credits');
  }
  if (status === 404) {
    return tripoError('3D 生成任务不存在', 404, 'TRIPO_TASK_NOT_FOUND', 'not_found');
  }
  if (status === 429) {
    return tripoError('3D 生成服务繁忙，请稍后重试', 503, 'TRIPO_RATE_LIMITED', 'rate_limited', true);
  }
  return tripoError('3D 生成服务暂时不可用', 502, 'TRIPO_UPSTREAM_ERROR', 'upstream', true);
}

async function parseJsonResponse(response) {
  try {
    return await response.json();
  } catch (_error) {
    throw tripoError('3D 生成服务返回了无效数据', 502, 'TRIPO_INVALID_RESPONSE', 'invalid_response');
  }
}

async function requestTripo(path, options = {}) {
  const config = getConfig();

  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        ...options.headers
      },
      redirect: 'error',
      signal: getSignal(config.timeoutMs)
    });

    if (!response.ok) throw mapTripoStatusCode(response.status);

    const payload = await parseJsonResponse(response);
    if (Number(payload?.code) !== 0) {
      throw tripoError('3D 生成服务暂时不可用', 502, 'TRIPO_UPSTREAM_ERROR', 'upstream', true);
    }
    return payload.data;
  } catch (error) {
    if (error?.statusCode) throw error;
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw tripoError('3D 生成服务响应超时', 504, 'TRIPO_TIMEOUT', 'timeout', true);
    }
    throw tripoError('无法连接 3D 生成服务', 503, 'TRIPO_NETWORK_ERROR', 'network', true);
  }
}

async function getCapabilities() {
  if (!isConfigured()) {
    return {
      provider: 'tripo',
      configured: false,
      ready: false,
      outputFormat: 'glb',
      textured: true,
      pbr: true,
      lowPoly: true
    };
  }

  let ready = true;
  try {
    const account = await requestTripo('/account/balance');
    ready = Number(account?.balance) > 0;
  } catch (_error) {
    ready = false;
  }

  return {
    provider: 'tripo',
    configured: true,
    ready,
    outputFormat: 'glb',
    textured: true,
    pbr: true,
    lowPoly: true,
    model: process.env.TRIPO_MODEL || DEFAULT_MODEL
  };
}

function validateFaceLimit(value) {
  const requested = value ?? process.env.TRIPO_FACE_LIMIT ?? DEFAULT_FACE_LIMIT;
  if (
    !Number.isInteger(Number(requested))
    || Number(requested) < 500
    || Number(requested) > 20000
  ) {
    throw createServiceError(
      'face_limit 必须是 500 到 20000 之间的整数',
      400,
      'INVALID_FACE_LIMIT',
      { provider: 'tripo', category: 'invalid_request', retryable: false }
    );
  }
  return Number(requested);
}

function resolveFaceLimit(options = {}) {
  const providerDefault = validateFaceLimit(process.env.TRIPO_FACE_LIMIT ?? DEFAULT_FACE_LIMIT);
  const requested = options.target_polycount ?? options.face_limit;
  if (requested == null) return providerDefault;
  const numeric = Number(requested);
  if (!Number.isInteger(numeric) || numeric < 500) return validateFaceLimit(requested);
  return Math.min(numeric, providerDefault);
}

function parseDataUrl(imageUrl, maxImageBytes) {
  const match = /^data:image\/(png|jpeg|jpg);base64,([a-z0-9+/]+={0,2})$/i.exec(imageUrl);
  if (!match) {
    if (/^data:image\//i.test(imageUrl)) {
      throw tripoError(
        'Tripo 文件上传只接受 PNG 或 JPEG 的 base64 参考图',
        400,
        'TRIPO_INVALID_IMAGE',
        'invalid_request'
      );
    }
    return null;
  }
  const extension = match[1].toLowerCase() === 'jpeg' ? 'jpeg' : match[1].toLowerCase();
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.byteLength > maxImageBytes) {
    throw tripoError('3D 参考图超过 Tripo 大小限制', 413, 'TRIPO_IMAGE_TOO_LARGE', 'invalid_request');
  }
  return {
    extension,
    contentType: `image/${extension === 'jpg' ? 'jpeg' : extension}`,
    bytes
  };
}

async function uploadDataUrl(imageUrl, config) {
  const image = parseDataUrl(imageUrl, config.maxImageBytes);
  if (!image) return imageUrl;

  const form = new FormData();
  form.append('file', new Blob([image.bytes], { type: image.contentType }), `reference.${image.extension}`);
  let data;
  try {
    data = await requestTripo('/files', {
      method: 'POST',
      body: form
    });
  } catch (error) {
    throw annotateCreateStage(error, 'upload', false);
  }
  const token = data?.file_token || data?.token;
  if (!token) {
    throw annotateCreateStage(
      tripoError('3D 生成服务未返回文件令牌', 502, 'TRIPO_INVALID_RESPONSE', 'invalid_response'),
      'upload',
      false
    );
  }
  return token;
}

async function resolveInput(imageUrl) {
  try {
    const config = getConfig();
    return await uploadDataUrl(imageUrl, config);
  } catch (error) {
    if (error.tripoStage) throw error;
    throw annotateCreateStage(error, 'preflight', false);
  }
}

function buildCreatePayload(input, options = {}) {
  const payload = {
    input,
    model: process.env.TRIPO_MODEL || DEFAULT_MODEL,
    face_limit: resolveFaceLimit(options),
    texture: true,
    pbr: true,
    texture_quality: process.env.TRIPO_TEXTURE_QUALITY || 'detailed',
    geometry_quality: process.env.TRIPO_GEOMETRY_QUALITY || 'detailed',
    smart_low_poly: true,
    auto_size: true,
    export_uv: true
  };

  if (['default', 'align_image'].includes(options.orientation)) {
    payload.orientation = options.orientation;
  }
  if (process.env.TRIPO_ENABLE_IMAGE_AUTOFIX === 'true') {
    payload.enable_image_autofix = true;
  }
  return payload;
}

function normalizeTripoTask(task, fallbackId = null) {
  const rawStatus = String(task?.status || '').trim().toLowerCase();
  const status = TRIPO_STATUS_ALIASES[rawStatus] || rawStatus || task?.status;
  const message = typeof task?.error_message === 'string'
    ? task.error_message.trim().slice(0, 400)
    : (typeof task?.error === 'string' ? task.error.trim().slice(0, 400) : null);
  const code = task?.error_code == null ? null : String(task.error_code).trim();
  const error = [code, message].filter(Boolean).join(': ') || null;

  return normalizeTask({
    id: task?.task_id || task?.id || fallbackId,
    status,
    progress: task?.progress,
    modelUrl: task?.output?.model_url || task?.output?.model || null,
    previewUrl: task?.output?.rendered_image_url || task?.output?.preview_url || null,
    error
  }, {
    provider: 'tripo',
    invalidResponseCode: 'TRIPO_INVALID_RESPONSE'
  });
}

async function createImageTo3DTask(imageUrl, options = {}) {
  const input = await resolveInput(imageUrl);
  let body;
  try {
    body = JSON.stringify(buildCreatePayload(input, options));
    if (options.onPrepared) await options.onPrepared(JSON.parse(body), PAID_CREATE_ENDPOINT);
  } catch (error) {
    throw annotateCreateStage(error, 'preflight', false);
  }
  let data;
  try {
    data = await requestTripo(PAID_CREATE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    });
  } catch (error) {
    throw annotateCreateStage(error, 'paid_create', true);
  }
  const taskId = data?.task_id || data?.id;
  if (!taskId) {
    throw annotateCreateStage(
      tripoError('3D 生成服务未返回任务编号', 502, 'TRIPO_INVALID_RESPONSE', 'invalid_response'),
      'paid_create',
      true
    );
  }
  return normalizeTripoTask({ task_id: taskId, status: 'queued', progress: 0 });
}

function buildTexturePayload(sourceTaskId, fileToken, options = {}) {
  if (typeof sourceTaskId !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(sourceTaskId)) {
    throw tripoError('Texture revision requires the original Tripo task ID', 400, 'TRIPO_INVALID_TEXTURE_SOURCE', 'invalid_request');
  }
  if (typeof fileToken !== 'string' || !fileToken.trim() || /[:/\s]/.test(fileToken)) {
    throw tripoError('Texture revision requires an uploaded file token', 400, 'TRIPO_INVALID_IMAGE', 'invalid_request');
  }
  if (options.text !== undefined && (typeof options.text !== 'string' || !options.text.trim())) {
    throw tripoError('Texture text prompt must not be empty', 400, 'TRIPO_INVALID_REQUEST', 'invalid_request');
  }
  return {
    input: sourceTaskId,
    model: 'v3.0-20250812',
    texture_prompt: options.text === undefined
      ? { image: { file_token: fileToken } }
      : { text: options.text.trim(), style_image: { file_token: fileToken } },
    pbr: true,
    texture_quality: 'detailed',
    texture_alignment: 'geometry',
    bake: false
  };
}

async function createTextureTask(sourceTaskId, imageDataUrl, options = {}) {
  let payload;
  try {
    // Validate locally before upload; resolveInput retains the upload/paid boundary.
    buildTexturePayload(sourceTaskId, 'validation-token', options);
    if (typeof imageDataUrl !== 'string' || !imageDataUrl.startsWith('data:image/')) {
      throw tripoError('Texture revision requires a local PNG/JPEG data URL', 400, 'TRIPO_INVALID_IMAGE', 'invalid_request');
    }
    const fileToken = await resolveInput(imageDataUrl);
    payload = buildTexturePayload(sourceTaskId, fileToken, options);
    // Persist the exact paid payload before crossing the irreversible POST boundary.
    if (options.onPrepared) await options.onPrepared(payload, PAID_TEXTURE_ENDPOINT);
  } catch (error) {
    throw annotateCreateStage(error, error.tripoStage || 'preflight', false, PAID_TEXTURE_ENDPOINT);
  }
  let data;
  try {
    data = await requestTripo(PAID_TEXTURE_ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
  } catch (error) {
    throw annotateCreateStage(error, 'paid_create', true, PAID_TEXTURE_ENDPOINT);
  }
  const taskId = data?.task_id || data?.id;
  if (!taskId) {
    throw annotateCreateStage(tripoError('3D 生成服务未返回任务编号', 502, 'TRIPO_INVALID_RESPONSE', 'invalid_response'), 'paid_create', true, PAID_TEXTURE_ENDPOINT);
  }
  return normalizeTripoTask({ task_id: taskId, status: 'queued', progress: 0 });
}

async function getImageTo3DTask(taskId) {
  const data = await requestTripo(`/tasks/${encodeURIComponent(taskId)}`);
  return normalizeTripoTask(data, taskId);
}

module.exports = {
  id: 'tripo',
  isConfigured,
  getCapabilities,
  createImageTo3DTask,
  createTextureTask,
  buildTexturePayload,
  getImageTo3DTask,
  normalizeTripoTask,
  buildCreatePayload,
  validateFaceLimit,
  resolveFaceLimit
};
