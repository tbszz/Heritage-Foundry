require('dotenv').config();

const supabaseService = require('../services/supabaseService');

function sendSupabaseResult(res, result, successStatus = 200) {
  if (result.error) {
    const status = result.error.code === 'SUPABASE_NOT_CONFIGURED' ? 503 : 500;
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(status).json({
      success: false,
      error: result.error
    });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.status(successStatus).json({
    success: true,
    data: result.data
  });
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    const creationId = req.query.id;
    
    try {
      if (creationId) {
        const result = await supabaseService.getCreation(creationId);
        return sendSupabaseResult(res, result);
      } else {
        const result = await supabaseService.listCreations({
          limit: req.query.limit
        });
        return sendSupabaseResult(res, result);
      }
    } catch (error) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(500).json({
        success: false,
        error: error.message || '获取作品失败'
      });
    }
  }

  if (req.method === 'POST') {
    try {
      if (!req.body || typeof req.body !== 'object') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_BODY',
            message: '请求体不能为空'
          }
        });
      }

      const result = await supabaseService.saveCreation(req.body);
      return sendSupabaseResult(res, result, 201);
    } catch (error) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(500).json({
        success: false,
        error: error.message || '保存作品失败'
      });
    }
  }

  return res.status(405).json({
    success: false,
    error: 'Method not allowed',
    code: 405
  });
};
