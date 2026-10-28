import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

async function loadRoute() {
  const module = await import('../routes/docent.js');
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

describe('docent route', () => {
  it('rejects a missing question with 400 before any AI call', async () => {
    delete process.env.GEMINI_API_KEY;
    const route = await loadRoute();

    const response = await request(createApp(route)).post('/api/docent').send({});

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ success: false, code: 'DOCENT_QUESTION_REQUIRED' });
  });

  it('reports a clear unconfigured status when no AI key is present', async () => {
    delete process.env.GEMINI_API_KEY;
    const route = await loadRoute();

    const response = await request(createApp(route))
      .post('/api/docent')
      .send({ question: '布老虎有什么寓意？' });

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ success: false, code: 'GEMINI_NOT_CONFIGURED' });
  });

  it('answers with grounded content and sources through the real service stack', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const fetchStub = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '布老虎源自虎图腾崇拜，寓意镇宅辟邪。' }] } }]
      })
    });
    vi.stubGlobal('fetch', fetchStub);
    const route = await loadRoute();

    const response = await request(createApp(route))
      .post('/api/docent')
      .send({ question: '布老虎有什么寓意？', craftId: 'tiger-head', history: [] });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.answer).toContain('布老虎');
    expect(response.body.sources[0]).toMatchObject({ id: 'tiger-head', name: '布老虎' });

    // 问题嵌入会先探测一次 embedContent（失败后自动降级关键词检索），回答走 generateContent
    const generateContentCall = fetchStub.mock.calls
      .find((call) => String(call[0]).includes(':generateContent'));
    expect(generateContentCall).toBeTruthy();
    const requestBody = JSON.parse(generateContentCall[1].body);
    const contentsText = JSON.stringify(requestBody.contents);
    expect(contentsText).toContain('布老虎有什么寓意？');
    expect(contentsText).toContain('【布老虎】id=tiger-head');
  });
});
