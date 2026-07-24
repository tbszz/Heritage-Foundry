require('dotenv').config();

const { getServerless3DPolicy } = require('./runtime-policy');
const { createServerlessGuard } = require('./serverless-guardrails');

const guard = createServerlessGuard({
  max: process.env.THREE_D_CAPABILITY_RATE_LIMIT_MAX || 30,
  windowMs: process.env.THREE_D_CAPABILITY_RATE_LIMIT_WINDOW_MS || 60_000
});

function loadThreeDService() {
  try {
    return require('../services/threeDService');
  } catch (error) {
    if (error?.code === 'MODULE_NOT_FOUND' && error.message.includes('services/threeDService')) return null;
    throw error;
  }
}

function sendError(res, error) {
  const status = error?.statusCode || 500;
  return res.status(status).json({
    success: false,
    error: error?.message || '3D 服务查询失败',
    code: error?.code || status,
    provider: error?.provider || undefined,
    category: error?.category || undefined,
    retryable: typeof error?.retryable === 'boolean' ? error.retryable : undefined
  });
}

module.exports = async (req, res) => {
  const guarded = await guard(req, res);
  if (guarded.handled) return guarded.result;

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
      code: 405
    });
  }

  try {
    const policy = getServerless3DPolicy();
    if (!policy.allowed) {
      return res.status(policy.statusCode).json({
        success: false,
        capabilities: {
          provider: policy.provider,
          configured: false,
          ready: false,
          unavailableReason: policy.code
        },
        error: policy.message,
        code: policy.code
      });
    }
    const threeDService = loadThreeDService();
    if (!threeDService) {
      return res.status(503).json({
        success: false,
        error: '3D 服务暂不可用',
        code: 'THREE_D_SERVICE_UNAVAILABLE',
        provider: policy.provider,
        retryable: true
      });
    }
    return res.json({
      success: true,
      capabilities: await threeDService.getCapabilities()
    });
  } catch (error) {
    return sendError(res, error);
  }
};
