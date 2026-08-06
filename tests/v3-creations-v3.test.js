import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

async function buildApp() {
  vi.resetModules();
  delete process.env.SUPABASE_URL;
  delete process.env.VITE_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.SUPABASE_ANON_KEY;

  const routes = await import('../routes/creations.js');
  const app = express();
  app.use(express.json());
  app.use('/api/creations', routes.default || routes);
  return app;
}

describe('F1 GET /api/creations/stats', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns zeroed stats instead of erroring when Supabase is not configured', async () => {
    const app = await buildApp();
    const response = await request(app).get('/api/creations/stats');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        totalCreations: 0,
        totalWithImage: 0,
        craftDistribution: {}
      }
    });
  });

  it('does not collide with the /:id route', async () => {
    const app = await buildApp();
    const response = await request(app).get('/api/creations/stats');
    // 命中 /stats 而非 /:id（后者在未配置 Supabase 时会返回 503）
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});

describe('F3 POST /api/creations/:id/like', () => {
  it('rejects missing visitorId with 400', async () => {
    const app = await buildApp();
    const response = await request(app)
      .post('/api/creations/abc/like')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'INVALID_BODY' }
    });
  });

  it('returns 503 when Supabase is not configured', async () => {
    const app = await buildApp();
    const response = await request(app)
      .post('/api/creations/abc/like')
      .send({ visitorId: 'visitor-1' });

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'SUPABASE_NOT_CONFIGURED' }
    });
  });
});

describe('F3 GET /api/creations?sort=', () => {
  it('still returns 503 when Supabase is not configured, regardless of sort', async () => {
    const app = await buildApp();
    for (const sort of ['latest', 'likes', 'bogus']) {
      const response = await request(app).get(`/api/creations?sort=${sort}`);
      expect(response.status).toBe(503);
    }
  });
});
