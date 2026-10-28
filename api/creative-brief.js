require('dotenv').config();

const { parseCreativeBrief } = require('../services/briefService');
const { createServerlessGuard, imageGuardrailConfig } = require('./serverless-guardrails');

const guard = createServerlessGuard(imageGuardrailConfig());

module.exports = async (req, res) => {
  const guarded = await guard(req, res);
  if (guarded.handled) return guarded.result;

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
      code: 405
    });
  }

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
};
