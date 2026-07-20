require('dotenv').config();

const threeDService = require('../services/threeDService');
const { getServerless3DPolicy } = require('./runtime-policy');

function sendError(res, error) {
  const status = error?.statusCode || 500;
  res.setHeader('Access-Control-Allow-Origin', '*');
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
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
      code: 405
    });
  }

  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
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
    return res.json({
      success: true,
      capabilities: await threeDService.getCapabilities()
    });
  } catch (error) {
    return sendError(res, error);
  }
};
