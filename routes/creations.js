const express = require('express');
const supabaseService = require('../services/supabaseService');

const router = express.Router();

function sendSupabaseResult(res, result, successStatus = 200) {
  if (result.error) {
    const status = result.error.code === 'SUPABASE_NOT_CONFIGURED' ? 503 : 500;
    return res.status(status).json({
      success: false,
      error: result.error
    });
  }

  return res.status(successStatus).json({
    success: true,
    data: result.data
  });
}

router.get('/', async (req, res, next) => {
  try {
    const result = await supabaseService.listCreations({
      limit: req.query.limit,
      sort: req.query.sort
    });
    return sendSupabaseResult(res, result);
  } catch (error) {
    return next(error);
  }
});

// F1 统计面板：注意必须注册在 /:id 之前
router.get('/stats', async (req, res, next) => {
  try {
    const result = await supabaseService.getCreationStats();
    return sendSupabaseResult(res, result);
  } catch (error) {
    return next(error);
  }
});

router.post('/:id/like', async (req, res, next) => {
  try {
    const visitorId = req.body?.visitorId || req.body?.visitor_id;
    if (!visitorId || typeof visitorId !== 'string' || !visitorId.trim()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_BODY',
          message: '缺少 visitorId'
        }
      });
    }

    const result = await supabaseService.likeCreation(req.params.id, visitorId.trim());
    return sendSupabaseResult(res, result);
  } catch (error) {
    return next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const result = await supabaseService.getCreation(req.params.id);
    return sendSupabaseResult(res, result);
  } catch (error) {
    return next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
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
    return next(error);
  }
});

module.exports = router;
