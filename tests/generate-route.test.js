import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
});

describe('generate route module', () => {
  it('can be imported without an AI key so the API server can still boot', async () => {
    vi.resetModules();
    const previousKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    await expect(import('../routes/generate.js')).resolves.toBeTruthy();

    if (previousKey) {
      process.env.GEMINI_API_KEY = previousKey;
    }
  });

  it('adds thangka-specific visual language to generated prompts', async () => {
    vi.resetModules();
    process.env.GEMINI_API_KEY = 'test-key';

    const routeModule = await import('../routes/generate.js');

    expect(routeModule.buildEnhancedPrompt('角色挂件', 'chinese', 'tangka')).toContain('唐卡');
    expect(routeModule.buildEnhancedPrompt('角色挂件', 'chinese', 'tangka')).toContain('矿物颜料');
  });

  it('rate-limits the image generation routes with the stable paid-API response', async () => {
    process.env.IMAGE_RATE_LIMIT_MAX = '1';
    process.env.IMAGE_RATE_LIMIT_WINDOW_MS = '60000';
    const routeModule = await import('../routes/generate.js');
    const app = express();
    app.use(express.json());
    app.use('/api', routeModule.default || routeModule);

    expect((await request(app).post('/api/generate-image').send({})).status).toBe(400);
    const limited = await request(app).post('/api/edit-image').send({});

    expect(limited.status).toBe(429);
    expect(limited.body).toMatchObject({
      success: false,
      code: 'RATE_LIMITED'
    });
  });
});
