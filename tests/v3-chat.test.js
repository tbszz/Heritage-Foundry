import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

async function buildApp() {
  vi.resetModules();
  delete process.env.GEMINI_API_KEY;

  const chatHandler = await import('../api/chat.js');
  const app = express();
  app.use(express.json());
  const handler = chatHandler.default || chatHandler;
  app.post('/api/chat', handler);
  return app;
}

describe('F4 POST /api/chat', () => {
  it('rejects empty message with 400', async () => {
    const app = await buildApp();
    for (const body of [{}, { message: '' }, { message: '   ' }]) {
      const response = await request(app).post('/api/chat').send(body);
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ success: false, code: 400 });
    }
  });

  it('returns 405 for non-POST methods', async () => {
    const app = await buildApp();
    const response = await request(app).get('/api/chat');
    // 未注册 GET，Express 默认 404；直接调用 handler 验证 405 逻辑
    expect([404, 405]).toContain(response.status);

    const handlerModule = await import('../api/chat.js');
    const handler = handlerModule.default || handlerModule;
    const app2 = express();
    app2.use(express.json());
    app2.all('/api/chat', handler);
    const response2 = await request(app2).get('/api/chat');
    expect(response2.status).toBe(405);
  });

  it('returns 503 NOT_CONFIGURED when GEMINI_API_KEY is missing', async () => {
    const app = await buildApp();
    const response = await request(app)
      .post('/api/chat')
      .send({ message: '剪纸的历史是什么？' });

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      success: false,
      code: 'NOT_CONFIGURED'
    });
  });
});
