import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import createRateLimiter from '../middleware/rateLimit.js';

function buildApp(options) {
  const app = express();
  app.use('/api/generate-image', createRateLimiter(options));
  app.post('/api/generate-image', (req, res) => {
    res.json({ success: true });
  });
  return app;
}

describe('generate API rate limiter', () => {
  it('allows requests within the window and rejects the overflow with 429', async () => {
    const app = buildApp({ windowMs: 60_000, max: 3 });

    for (let i = 0; i < 3; i += 1) {
      const response = await request(app).post('/api/generate-image');
      expect(response.status).toBe(200);
    }

    const blocked = await request(app).post('/api/generate-image');
    expect(blocked.status).toBe(429);
    expect(blocked.body.success).toBe(false);
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('frees the quota after the window slides past old requests', async () => {
    const app = buildApp({ windowMs: 50, max: 1 });

    expect((await request(app).post('/api/generate-image')).status).toBe(200);
    expect((await request(app).post('/api/generate-image')).status).toBe(429);

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect((await request(app).post('/api/generate-image')).status).toBe(200);
  });
});
