require('dotenv').config();

const { answerQuestion } = require('../services/docentService');
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
};
