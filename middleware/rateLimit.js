// 简单内存滑动窗口限流（报告 GAP 03：生图 API 无鉴权无限流，公开部署即烧钱）。
// 单进程内存实现，够竞赛演示用；多实例部署时应换 Redis 等共享存储。
function createRateLimiter({ windowMs = 60_000, max = 10, message = '请求过于频繁，请稍后再试' } = {}) {
  const hits = new Map();

  const cleanupTimer = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, timestamps] of hits) {
      const alive = timestamps.filter((t) => t > cutoff);
      if (alive.length === 0) {
        hits.delete(key);
      } else {
        hits.set(key, alive);
      }
    }
  }, windowMs);
  cleanupTimer.unref?.();

  return function rateLimit(req, res, next) {
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    const cutoff = now - windowMs;
    const timestamps = (hits.get(key) || []).filter((t) => t > cutoff);

    if (timestamps.length >= max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((timestamps[0] + windowMs - now) / 1000));
      res.set('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        success: false,
        error: message,
        code: 429
      });
    }

    timestamps.push(now);
    hits.set(key, timestamps);
    next();
  };
}

module.exports = createRateLimiter;
