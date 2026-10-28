require('dotenv').config();

const geminiService = require('../services/geminiService');
const reviewService = require('../services/reviewService');
const { buildEnhancedPrompt } = require('../services/promptService');
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
      prompt,
      aspect_ratio = '1:1',
      image_size = '1K',
      mime_type = 'image/jpeg',
      style = 'default',
      craft_type,
      ip,
      carrier,
      self_check: selfCheckSnake,
      selfCheck: selfCheckCamel,
      custom_prompt: customPromptSnake,
      customPrompt: customPromptCamel
    } = req.body;
    const customPrompt = customPromptCamel || customPromptSnake;
    const selfCheck = selfCheckCamel === true || selfCheckSnake === true;

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'prompt 不能为空',
        code: 400
      });
    }

    const enhancedPrompt = buildEnhancedPrompt(prompt, style, craft_type, { ip, carrier, customPrompt });

    const result = selfCheck
      ? await reviewService.generateImageWithSelfCheck({
        prompt: enhancedPrompt,
        options: { aspect_ratio, image_size, mime_type },
        carrier: carrier || 'keychain'
      })
      : await geminiService.generateImage(enhancedPrompt, {
        aspect_ratio,
        image_size,
        mime_type
      });

    res.json({
      success: true,
      image: result.base64Image,
      message: '生成成功',
      ...(selfCheck
        ? { review: result.review, retried: result.retried }
        : {}),
      metadata: {
        ...result.metadata,
        style
      }
    });
  } catch (error) {
    console.error('Generate image error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || '生成图片失败',
      code: error.code || error.statusCode || 500
    });
  }
};
