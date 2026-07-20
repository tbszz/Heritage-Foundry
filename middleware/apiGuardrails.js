const DEFAULT_RATE_LIMIT_MESSAGE = '请求过于频繁，请稍后再试';

function readPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeOrigin(origin) {
  return String(origin || '').trim().replace(/\/$/, '');
}

function isLocalDevelopmentOrigin(origin, nodeEnv) {
  if (nodeEnv === 'production') return false;

  try {
    const url = new URL(origin);
    return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      && ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

function createCorsOptions({
  allowedOrigins = process.env.CORS_ALLOWED_ORIGINS || process.env.ALLOWED_ORIGINS || '',
  nodeEnv = process.env.NODE_ENV || 'development'
} = {}) {
  const allowlist = new Set(
    String(allowedOrigins)
      .split(',')
      .map(normalizeOrigin)
      .filter(Boolean)
  );

  return {
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      const normalizedOrigin = normalizeOrigin(origin);
      if (allowlist.has(normalizedOrigin) || isLocalDevelopmentOrigin(normalizedOrigin, nodeEnv)) {
        return callback(null, true);
      }

      const error = new Error('该来源不允许访问 API');
      error.statusCode = 403;
      error.code = 'CORS_ORIGIN_DENIED';
      return callback(error);
    }
  };
}

function createRateLimiter({
  max = 60,
  windowMs = 60_000,
  maxEntries = 10_000,
  keyGenerator = (req) => req.ip || req.socket?.remoteAddress || 'unknown'
} = {}) {
  const requestLimit = readPositiveInteger(max, 60);
  const durationMs = readPositiveInteger(windowMs, 60_000);
  const entryLimit = readPositiveInteger(maxEntries, 10_000);
  const buckets = new Map();
  let lastSweepAt = 0;

  function sweepExpired(now) {
    if (now - lastSweepAt < durationMs) return;
    lastSweepAt = now;
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }

  return function rateLimiter(req, res, next) {
    const now = Date.now();
    sweepExpired(now);

    const key = String(keyGenerator(req) || 'unknown');
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      if (!bucket && buckets.size >= entryLimit) {
        const oldestKey = buckets.keys().next().value;
        if (oldestKey !== undefined) buckets.delete(oldestKey);
      }
      bucket = { count: 0, resetAt: now + durationMs };
      buckets.set(key, bucket);
    }

    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    res.set('RateLimit-Limit', String(requestLimit));
    res.set('RateLimit-Remaining', String(Math.max(0, requestLimit - bucket.count - 1)));
    res.set('RateLimit-Reset', String(retryAfterSeconds));

    if (bucket.count >= requestLimit) {
      res.set('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        success: false,
        error: DEFAULT_RATE_LIMIT_MESSAGE,
        code: 'RATE_LIMITED',
        retryAfterSeconds
      });
    }

    bucket.count += 1;
    return next();
  };
}

module.exports = {
  createCorsOptions,
  createRateLimiter,
  readPositiveInteger
};
