import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

async function loadRoute() {
  const module = await import('../routes/creativeBrief.js');
  return module.default || module;
}

function createApp(router) {
  const app = express();
  app.use(express.json());
  app.use('/api', router);
  return app;
}

afterEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
});

describe('creative brief route', () => {
  it('rejects an empty message with 400 before any AI call', async () => {
    delete process.env.GEMINI_API_KEY;
    const route = await loadRoute();

    const response = await request(createApp(route))
      .post('/api/creative-brief')
      .send({ message: '   ' });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ success: false, code: 'BRIEF_MESSAGE_REQUIRED' });
  });

  it('reports a clear unconfigured status when no AI key is present', async () => {
    delete process.env.GEMINI_API_KEY;
    const route = await loadRoute();

    const response = await request(createApp(route))
      .post('/api/creative-brief')
      .send({ message: '送表弟的生日礼物' });

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ success: false, code: 'GEMINI_NOT_CONFIGURED' });
  });

  it('passes the snake_case current brief through to the service', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const fetchStub = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                craft: 'papercut',
                ip: 'pikachu',
                carrier: 'keychain',
                style: 'cute',
                customPrompt: '加入生日帽子',
                reasoning: '按送礼场景选择'
              })
            }]
          }
        }]
      })
    });
    vi.stubGlobal('fetch', fetchStub);
    const route = await loadRoute();

    const response = await request(createApp(route))
      .post('/api/creative-brief')
      .send({ message: '送表弟的生日礼物', current_brief: { craftId: 'papercut' } });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.brief).toMatchObject({
      craftId: 'papercut',
      ipId: 'pikachu',
      carrierId: 'keychain',
      styleId: 'cute'
    });

    const requestBody = JSON.parse(fetchStub.mock.calls[0][1].body);
    const contentsText = JSON.stringify(requestBody.contents);
    expect(contentsText).toContain('送表弟的生日礼物');
    expect(contentsText).toContain('当前简报：技艺=papercut');
  });

  it('rate-limits repeated requests with the shared paid-API response', async () => {
    process.env.IMAGE_RATE_LIMIT_MAX = '1';
    process.env.IMAGE_RATE_LIMIT_WINDOW_MS = '60000';
    const route = await loadRoute();

    expect(
      (await request(createApp(route)).post('/api/creative-brief').send({ message: '' })).status
    ).toBe(400);
    const limited = await request(createApp(route))
      .post('/api/creative-brief')
      .send({ message: '再来一个' });

    expect(limited.status).toBe(429);
    expect(limited.body).toMatchObject({ success: false, code: 'RATE_LIMITED' });
  });
});
