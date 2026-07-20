require('dotenv').config();

const { getServerless3DPolicy } = require('./runtime-policy');
const { createServerlessGuard } = require('./serverless-guardrails');

const createGuard = createServerlessGuard({
  max: process.env.THREE_D_RATE_LIMIT_MAX || 4,
  windowMs: process.env.THREE_D_RATE_LIMIT_WINDOW_MS || 900_000
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
    error: error?.message || '3D 模型生成失败',
    code: error?.code || status,
    provider: error?.provider || undefined,
    category: error?.category || undefined,
    retryable: typeof error?.retryable === 'boolean' ? error.retryable : undefined
  });
}

module.exports = async (req, res) => {
  const guarded = await createGuard(req, res);
  if (guarded.handled) return guarded.result;

  const policy = getServerless3DPolicy();
  if (!policy.allowed) {
    return res.status(policy.statusCode).json({
      success: false,
      error: policy.message,
      code: policy.code,
      provider: policy.provider,
      retryable: false
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

  if (req.method === 'GET') {
    const taskId = req.query.id || req.query.task_id;
    
    if (!taskId) {
      return res.status(400).json({
        success: false,
        error: '缺少任务编号',
        code: 'INVALID_TASK_ID'
      });
    }

    try {
      if (req.query.artifact === 'model.glb') {
        const artifact = await threeDService.getModelArtifact(taskId);
        res.setHeader('Content-Type', artifact.contentType);
        res.setHeader('Content-Length', String(artifact.bytes.byteLength));
        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        return res.send(artifact.bytes);
      }
      const task = await threeDService.getImageTo3DTask(taskId);
      return res.json({
        success: true,
        task
      });
    } catch (error) {
      return sendError(res, error);
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
      code: 405
    });
  }

  const imageUrl = req.body?.image_url || req.body?.image;

  if (typeof imageUrl !== 'string' || imageUrl.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'image_url 不能为空',
      code: 'INVALID_IMAGE'
    });
  }

  try {
    const task = await threeDService.createImageTo3DTask(imageUrl, {
      ai_model: req.body?.ai_model,
      model_type: req.body?.model_type,
      should_texture: req.body?.should_texture,
      enable_pbr: req.body?.enable_pbr,
      should_remesh: req.body?.should_remesh,
      target_polycount: req.body?.target_polycount,
      pose_mode: req.body?.pose_mode,
      target_formats: ['glb']
    });

    return res.status(202).json({
      success: true,
      task,
      message: '真实 3D 模型生成任务已创建'
    });
  } catch (error) {
    return sendError(res, error);
  }
};
