import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
});

describe('shared Express guardrails', () => {
  it('allows same-origin production requests when no explicit allowlist is configured', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CORS_ALLOWED_ORIGINS;
    delete process.env.ALLOWED_ORIGINS;
    const serverModule = await import('../server.js');
    const app = serverModule.createApp();

    const response = await request(app)
      .get('/api/health')
      .set('Origin', 'https://heritage.example')
      .set('Host', 'heritage.example')
      .set('X-Forwarded-Proto', 'https');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('https://heritage.example');
  });

  it('rejects a cross-origin production request when no allowlist is configured', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CORS_ALLOWED_ORIGINS;
    delete process.env.ALLOWED_ORIGINS;
    const serverModule = await import('../server.js');
    const app = serverModule.createApp();

    const response = await request(app)
      .get('/api/health')
      .set('Origin', 'https://attacker.example')
      .set('Host', 'heritage.example')
      .set('X-Forwarded-Proto', 'https');

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('CORS_ORIGIN_DENIED');
  });
});
