const express = require('express');
const router = express.Router();
const { answerQuestion } = require('../services/docentService');
const { createRateLimiter, readPositiveInteger } = require('../middleware/apiGuardrails');

const docentLimiter = createRateLimiter({
  max: readPositiveInteger(process.env.IMAGE_RATE_LIMIT_MAX, 12),
  windowMs: readPositiveInteger(process.env.IMAGE_RATE_LIMIT_WINDOW_MS, 10 * 60 * 1000)
});

router.post('/docent', docentLimiter, async (req, res) => {
  try {
    const { question, craftId, history, persona, hall } = req.body || {};

    const result = await answerQuestion({ question, craftId, history, persona, hall });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Docent error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || '讲解员暂时无法回答',
      code: error.code || error.statusCode || 500
    });
  }
});

module.exports = router;
