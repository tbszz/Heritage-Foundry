import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

async function loadGuardrails() {
  const module = await import('../middleware/apiGuardrails.js').catch(() => ({}));
  return module.default || module;
}

afterEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
});

describe('paid API guardrails', () => {
  it('returns a stable 429 payload and Retry-After header after the IP limit is exhausted', async () => {
    const { createRateLimiter } = await loadGuardrails();
    expect(createRateLimiter).toBeTypeOf('function');

    const app = express();
    app.post('/generate', createRateLimiter({ max: 1, windowMs: 60_000 }), (_req, res) => {
      res.json({ success: true });
    });

    expect((await request(app).post('/generate')).status).toBe(200);
    const limited = await request(app).post('/generate');

    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toMatch(/^\d+$/);
    expect(limited.body).toMatchObject({
      success: false,
      error: '请求过于频繁，请稍后再试',
      code: 'RATE_LIMITED'
    });
    expect(limited.body.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('tracks different client IPs independently', async () => {
    const { createRateLimiter } = await loadGuardrails();
    expect(createRateLimiter).toBeTypeOf('function');

    const app = express();
    app.set('trust proxy', true);
    app.post('/generate', createRateLimiter({ max: 1, windowMs: 60_000 }), (_req, res) => {
      res.json({ success: true });
    });

    expect((await request(app).post('/generate').set('X-Forwarded-For', '198.51.100.10')).status).toBe(200);
    expect((await request(app).post('/generate').set('X-Forwarded-For', '198.51.100.10')).status).toBe(429);
    expect((await request(app).post('/generate').set('X-Forwarded-For', '198.51.100.11')).status).toBe(200);
  });

  it('keeps independent limiter instances in separate quota buckets', async () => {
    const { createRateLimiter } = await loadGuardrails();
    expect(createRateLimiter).toBeTypeOf('function');

    const imageLimiter = createRateLimiter({ max: 1, windowMs: 60_000 });
    const modelLimiter = createRateLimiter({ max: 1, windowMs: 60_000 });
    const app = express();
    app.post('/image', imageLimiter, (_req, res) => res.json({ success: true }));
    app.post('/model', modelLimiter, (_req, res) => res.json({ success: true }));

    expect((await request(app).post('/image')).status).toBe(200);
    expect((await request(app).post('/image')).status).toBe(429);
    expect((await request(app).post('/model')).status).toBe(200);
  });

  it('allows configured production origins and rejects other browser origins', async () => {
    const { createCorsOptions } = await loadGuardrails();
    expect(createCorsOptions).toBeTypeOf('function');

    const options = createCorsOptions({
      allowedOrigins: 'https://heritage.example, https://admin.heritage.example/',
      nodeEnv: 'production'
    });

    const checkOrigin = (origin) => new Promise((resolve) => {
      options.origin(origin, (error, allowed) => resolve({ error, allowed }));
    });

    await expect(checkOrigin('https://heritage.example')).resolves.toMatchObject({ error: null, allowed: true });
    await expect(checkOrigin('https://admin.heritage.example')).resolves.toMatchObject({ error: null, allowed: true });
    const denied = await checkOrigin('https://attacker.example');
    expect(denied.allowed).toBeUndefined();
    expect(denied.error).toMatchObject({ statusCode: 403, code: 'CORS_ORIGIN_DENIED' });
  });

  it('preserves localhost browser access in development without opening production CORS', async () => {
    const { createCorsOptions } = await loadGuardrails();
    expect(createCorsOptions).toBeTypeOf('function');

    const development = createCorsOptions({ allowedOrigins: '', nodeEnv: 'development' });
    const production = createCorsOptions({ allowedOrigins: '', nodeEnv: 'production' });
    const checkOrigin = (options, origin) => new Promise((resolve) => {
      options.origin(origin, (error, allowed) => resolve({ error, allowed }));
    });

    await expect(checkOrigin(development, 'http://localhost:5173')).resolves.toMatchObject({ error: null, allowed: true });
    await expect(checkOrigin(development, 'http://127.0.0.1:4173')).resolves.toMatchObject({ error: null, allowed: true });
    expect((await checkOrigin(production, 'http://localhost:5173')).error).toMatchObject({ statusCode: 403 });
  });
});
