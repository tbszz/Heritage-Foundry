import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

async function createServerApp() {
  const serverModule = await import('../server.js');
  const exported = serverModule.default || serverModule;
  const createApp = serverModule.createApp || exported.createApp;
  expect(createApp).toBeTypeOf('function');
  return createApp();
}

afterEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
});

describe('API server guardrail configuration', () => {
  it('treats common false-like trust-proxy settings as disabled', async () => {
    const serverModule = await import('../server.js');
    const exported = serverModule.default || serverModule;
    const parseTrustProxy = serverModule.parseTrustProxy || exported.parseTrustProxy;

    expect(parseTrustProxy).toBeTypeOf('function');
    expect(['false', '0', 'off', 'no'].map(parseTrustProxy)).toEqual([false, false, false, false]);
  });

  it('enforces the configured JSON body limit before a paid route runs', async () => {
    process.env.API_JSON_BODY_LIMIT = '1kb';
    const app = await createServerApp();

    const response = await request(app)
      .post('/api/generate-image')
      .send({ prompt: 'x'.repeat(2048) });

    expect(response.status).toBe(413);
    expect(response.body).toMatchObject({ success: false, code: 413 });
  });

  it('applies the configured CORS allowlist at the server boundary', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ALLOWED_ORIGINS = 'https://heritage.example';
    const app = await createServerApp();

    const allowed = await request(app).get('/api/health').set('Origin', 'https://heritage.example');
    const denied = await request(app).get('/api/health').set('Origin', 'https://attacker.example');

    expect(allowed.status).toBe(200);
    expect(allowed.headers['access-control-allow-origin']).toBe('https://heritage.example');
    expect(denied.status).toBe(403);
  });
});
