const express = require('express');
const threeDService = require('../services/threeDService');
const { createRateLimiter, readPositiveInteger } = require('../middleware/apiGuardrails');

const router = express.Router();
const createModelLimiter = createRateLimiter({
  max: readPositiveInteger(process.env.THREE_D_RATE_LIMIT_MAX, 4),
  windowMs: readPositiveInteger(process.env.THREE_D_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000)
});
const modelStatusLimiter = createRateLimiter({
  max: readPositiveInteger(process.env.THREE_D_STATUS_RATE_LIMIT_MAX, 120),
  windowMs: readPositiveInteger(process.env.THREE_D_STATUS_RATE_LIMIT_WINDOW_MS, 60 * 1000)
});
const capabilityLimiter = createRateLimiter({
  max: readPositiveInteger(process.env.THREE_D_CAPABILITY_RATE_LIMIT_MAX, 30),
  windowMs: readPositiveInteger(process.env.THREE_D_CAPABILITY_RATE_LIMIT_WINDOW_MS, 60 * 1000)
});

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

router.get('/3d-capabilities', capabilityLimiter, async (req, res) => {
  try {
    return res.json({
      success: true,
      capabilities: await threeDService.getCapabilities()
    });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/generate-3d', createModelLimiter, async (req, res) => {
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
});

router.get('/generate-3d/:id/artifacts/model.glb', modelStatusLimiter, async (req, res) => {
  try {
    const artifact = await threeDService.getModelArtifact(req.params.id);
    res.set({
      'Content-Type': artifact.contentType,
      'Content-Length': String(artifact.bytes.byteLength),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    return res.send(artifact.bytes);
  } catch (error) {
    return sendError(res, error);
  }
});

router.get('/generate-3d/:id', modelStatusLimiter, async (req, res) => {
  try {
    const task = await threeDService.getImageTo3DTask(req.params.id);
    return res.json({
      success: true,
      task
    });
  } catch (error) {
    return sendError(res, error);
  }
});

module.exports = router;
