const express = require('express');
const router = express.Router();
const { parseCreativeBrief } = require('../services/briefService');
const { createRateLimiter, readPositiveInteger } = require('../middleware/apiGuardrails');

const briefLimiter = createRateLimiter({
  max: readPositiveInteger(process.env.IMAGE_RATE_LIMIT_MAX, 12),
  windowMs: readPositiveInteger(process.env.IMAGE_RATE_LIMIT_WINDOW_MS, 10 * 60 * 1000)
});

router.post('/creative-brief', briefLimiter, async (req, res) => {
  try {
    const {
      message,
      current_brief: currentBriefSnake,
      currentBrief: currentBriefCamel
    } = req.body || {};
    const currentBrief = currentBriefCamel || currentBriefSnake;

    const brief = await parseCreativeBrief({ message, currentBrief });

    res.json({
      success: true,
      brief,
      message: '解析成功'
    });
  } catch (error) {
    console.error('Creative brief error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || '解析创作需求失败',
      code: error.code || error.statusCode || 500
    });
  }
});

module.exports = router;
