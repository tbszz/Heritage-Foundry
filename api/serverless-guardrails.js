const { createCorsOptions, createRateLimiter, readPositiveInteger } = require('../middleware/apiGuardrails');

function createServerlessGuard({ max, windowMs } = {}) {
  const corsOptions = createCorsOptions();
  const limiter = createRateLimiter({ max, windowMs });

  return async function guard(req, res) {
    const origin = req.headers?.origin;
    const corsResult = await new Promise((resolve) => {
      corsOptions.origin(origin, (error, allowed) => resolve({ error, allowed }));
    });

    if (corsResult.error) {
      return {
        handled: true,
        result: res.status(corsResult.error.statusCode || 403).json({
          success: false,
          error: corsResult.error.message,
          code: corsResult.error.code || 'CORS_ORIGIN_DENIED'
        })
      };
    }

    if (origin && corsResult.allowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      return { handled: true, result: res.status(204).end() };
    }

    if (typeof res.set !== 'function') {
      res.set = (name, value) => {
        res.setHeader(name, value);
        return res;
      };
    }

    const limited = await new Promise((resolve) => {
      limiter(req, res, () => resolve(false));
      if (res.statusCode === 429) resolve(true);
    });
    return { handled: limited, result: limited ? res : undefined };
  };
}

function imageGuardrailConfig() {
  return {
    max: readPositiveInteger(process.env.IMAGE_RATE_LIMIT_MAX || process.env.GENERATE_RATE_MAX, 12),
    windowMs: readPositiveInteger(process.env.IMAGE_RATE_LIMIT_WINDOW_MS || process.env.GENERATE_RATE_WINDOW_MS, 600_000)
  };
}

module.exports = { createServerlessGuard, imageGuardrailConfig };
