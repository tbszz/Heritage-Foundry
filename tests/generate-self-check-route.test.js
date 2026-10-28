import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

async function loadRoute() {
  const module = await import('../routes/generate.js');
  return module.default || module;
}

function createApp(router) {
  const app = express();
  app.use(express.json());
  app.use('/api', router);
  return app;
}

// 用 fetch stub 区分两类模型调用：生图（responseModalities）与自审（responseMimeType=json）。
function createGeminiFetchStub() {
  return vi.fn(async (url, init = {}) => {
    const body = JSON.parse(init.body || '{}');
    const isJsonReview = body?.generationConfig?.responseMimeType === 'application/json';
    const payload = isJsonReview
      ? {
        candidates: [{
          content: {
            parts: [{ text: JSON.stringify({ verdict: 'pass', issues: [], revisionHint: '' }) }]
          }
        }]
      }
      : {
        candidates: [{
          content: {
            parts: [{ inlineData: { mimeType: 'image/png', data: 'aW1hZ2Ux' } }]
          }
        }]
      };
    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => payload
    };
  });
}

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('generate-image self check integration', () => {
  it('runs generate → vision review end to end and returns the verdict', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.GEMINI_MODEL = 'gemini-2.5-flash-image';
    process.env.GEMINI_TEXT_MODEL = 'gemini-2.5-flash';
    const fetchStub = createGeminiFetchStub();
    vi.stubGlobal('fetch', fetchStub);
    const route = await loadRoute();

    const response = await request(createApp(route))
      .post('/api/generate-image')
      .send({
        prompt: '剪纸 × 皮卡丘',
        craft_type: 'papercut',
        ip: 'pikachu',
        carrier: 'keychain',
        self_check: true
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.image).toContain('aW1hZ2Ux');
    expect(response.body.review).toMatchObject({ verdict: 'pass', issues: [] });
    expect(response.body.retried).toBe(false);

    // 两次模型调用：第一次生图，第二次带图的 JSON 自审
    expect(fetchStub).toHaveBeenCalledTimes(2);
    const reviewBody = JSON.parse(fetchStub.mock.calls[1][1].body);
    expect(reviewBody.generationConfig.responseMimeType).toBe('application/json');
    const reviewContents = JSON.stringify(reviewBody.contents);
    expect(reviewContents).toContain('aW1hZ2Ux');
    expect(reviewContents).toContain('单个主体居中且占画面约 88%');
  });

  it('keeps the legacy single-shot path and omits review fields by default', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.GEMINI_MODEL = 'gemini-2.5-flash-image';
    const fetchStub = createGeminiFetchStub();
    vi.stubGlobal('fetch', fetchStub);
    const route = await loadRoute();

    const response = await request(createApp(route))
      .post('/api/generate-image')
      .send({ prompt: '剪纸 × 皮卡丘', craft_type: 'papercut' });

    expect(response.status).toBe(200);
    expect(response.body).not.toHaveProperty('review');
    expect(response.body).not.toHaveProperty('retried');
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it('propagates the unconfigured status when the key is missing', async () => {
    delete process.env.GEMINI_API_KEY;
    const route = await loadRoute();

    const response = await request(createApp(route))
      .post('/api/generate-image')
      .send({ prompt: '剪纸 × 皮卡丘', self_check: true });

    expect(response.status).toBe(503);
    expect(response.body.success).toBe(false);
  });
});
