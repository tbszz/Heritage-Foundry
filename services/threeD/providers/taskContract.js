const CANONICAL_STATUSES = new Map([
  ['PENDING', 'queued'],
  ['QUEUED', 'queued'],
  ['IN_PROGRESS', 'processing'],
  ['PROCESSING', 'processing'],
  ['SUCCEEDED', 'succeeded'],
  ['SUCCESS', 'succeeded'],
  ['COMPLETED', 'succeeded'],
  ['FAILED', 'failed'],
  ['ERROR', 'failed'],
  ['EXPIRED', 'failed'],
  ['CANCELED', 'canceled'],
  ['CANCELLED', 'canceled']
]);

function createServiceError(message, statusCode, code, metadata = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  Object.assign(error, metadata);
  return error;
}

function normalizeStatus(status) {
  return CANONICAL_STATUSES.get(String(status || '').trim().toUpperCase()) || null;
}

function normalizeProgress(progress, status) {
  const numericProgress = Number(progress);
  if (Number.isFinite(numericProgress)) {
    return Math.min(100, Math.max(0, numericProgress));
  }
  return status === 'succeeded' ? 100 : 0;
}

function normalizeTask(task, options) {
  const {
    provider,
    invalidResponseCode,
    missingGlbMessage = '3D 任务已完成，但没有返回 GLB 模型',
    failedMessage = '3D 模型生成失败',
    canceledMessage = '3D 模型生成已取消'
  } = options;
  const status = normalizeStatus(task?.status);
  if (!status || !task?.id) {
    throw createServiceError(
      '3D 生成服务返回了无效任务数据',
      502,
      invalidResponseCode,
      { provider, category: 'invalid_response', retryable: false }
    );
  }

  const missingCompletedGlb = status === 'succeeded' && !task.modelUrl;
  const normalizedStatus = missingCompletedGlb ? 'failed' : status;

  return {
    id: String(task.id),
    provider,
    status: normalizedStatus,
    progress: normalizeProgress(task.progress, normalizedStatus),
    modelUrl: task.modelUrl || null,
    previewUrl: task.previewUrl || null,
    error: missingCompletedGlb
      ? missingGlbMessage
      : (normalizedStatus === 'failed'
        ? (task.error || failedMessage)
        : (normalizedStatus === 'canceled' ? (task.error || canceledMessage) : null))
  };
}

function readPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

module.exports = {
  createServiceError,
  normalizeStatus,
  normalizeProgress,
  normalizeTask,
  readPositiveInteger
};
