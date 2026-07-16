const express = require('express');
const router = express.Router();
const geminiService = require('../services/geminiService');
const { buildEnhancedPrompt } = require('../services/promptService');

router.post('/generate-image', async (req, res) => {
  try {
    const {
      prompt,
      aspect_ratio = '1:1',
      image_size = '1K',
      mime_type = 'image/jpeg',
      style = 'default',
      craft_type,
      ip,
      carrier
    } = req.body;

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'prompt 不能为空',
        code: 400
      });
    }

    const enhancedPrompt = buildEnhancedPrompt(prompt, style, craft_type, { ip, carrier });

    const result = await geminiService.generateImage(enhancedPrompt, {
      aspect_ratio,
      image_size,
      mime_type
    });

    res.json({
      success: true,
      image: result.base64Image,
      message: '生成成功',
      metadata: {
        ...result.metadata,
        style
      }
    });
  } catch (error) {
    console.error('Generate image error:', error);
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || '生成图片失败',
      code: statusCode
    });
  }
});

router.post('/edit-image', async (req, res) => {
  try {
    const { image, prompt, aspect_ratio = '1:1', mime_type = 'image/jpeg' } = req.body;

    if (!image || typeof image !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'image 不能为空',
        code: 400
      });
    }

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'prompt 不能为空',
        code: 400
      });
    }

    const result = await geminiService.editImage(image, prompt, {
      aspect_ratio,
      mime_type
    });

    res.json({
      success: true,
      image: result.base64Image,
      message: '编辑成功',
      metadata: {
        ...result.metadata
      }
    });
  } catch (error) {
    console.error('Edit image error:', error);
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || '编辑图片失败',
      code: statusCode
    });
  }
});

router.get('/styles', (req, res) => {
  res.json({
    success: true,
    styles: [
      { id: 'default', name: '默认', description: '标准生成风格' },
      { id: 'poster', name: '非遗海报', description: '适合海报设计' },
      { id: 'product', name: '文创产品', description: '适合产品展示' },
      { id: 'chinese', name: '国潮风格', description: '中国风设计' },
      { id: 'cute', name: '可爱校园', description: '可爱卡通风格' },
      { id: 'vintage', name: '复古市集', description: '怀旧文艺风格' }
    ]
  });
});

module.exports = router;
module.exports.buildEnhancedPrompt = buildEnhancedPrompt;
