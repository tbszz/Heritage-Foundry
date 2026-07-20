require('dotenv').config();

const geminiService = require('../services/geminiService');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
      code: 405
    });
  }

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

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || '编辑图片失败',
      code: error.code || error.statusCode || 500
    });
  }
};
