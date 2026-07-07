import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

describe('creations routes', () => {
  it('returns a clear 503 when Supabase is not configured', async () => {
    vi.resetModules();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_ANON_KEY;

    const routes = await import('../routes/creations.js');
    const app = express();
    app.use(express.json());
    app.use('/api/creations', routes.default || routes);

    const response = await request(app)
      .post('/api/creations')
      .send({ title: '苗绣拼豆挂件' });

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: 'SUPABASE_NOT_CONFIGURED'
      }
    });
  });
});
