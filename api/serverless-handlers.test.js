import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    set(name, value) {
      this.headers[String(name).toLowerCase()] = String(value);
      return this;
    },
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = String(value);
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    }
  };
}

async function loadHandler(path) {
  vi.resetModules();
  const module = await import(path);
  return module.default || module;
}

afterEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
});

describe('Vercel paid endpoint guardrails', () => {
  it('rejects disallowed browser origins before invoking paid image generation', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ALLOWED_ORIGINS = 'https://heritage.example';
    const handler = await loadHandler('./generate-image.js');
    const res = createResponse();

    await handler({
      method: 'POST',
      headers: { origin: 'https://attacker.example' },
      body: { prompt: 'do not invoke provider' },
      ip: '198.51.100.1'
    }, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ success: false, code: 'CORS_ORIGIN_DENIED' });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('accepts the legacy ALLOWED_ORIGINS alias and echoes the allowed origin', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CORS_ALLOWED_ORIGINS;
    process.env.ALLOWED_ORIGINS = 'https://legacy.example';
    const handler = await loadHandler('./generate-image.js');
    const res = createResponse();

    await handler({
      method: 'POST',
      headers: { origin: 'https://legacy.example' },
      body: {},
      ip: '198.51.100.2'
    }, res);

    expect(res.statusCode).toBe(400);
    expect(res.headers['access-control-allow-origin']).toBe('https://legacy.example');
  });

  it('rate limits repeated paid image requests', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ALLOWED_ORIGINS = 'https://heritage.example';
    process.env.IMAGE_RATE_LIMIT_MAX = '1';
    process.env.IMAGE_RATE_LIMIT_WINDOW_MS = '60000';
    const handler = await loadHandler('./generate-image.js');
    const request = {
      method: 'POST',
      headers: { origin: 'https://heritage.example' },
      body: {},
      ip: '198.51.100.3'
    };

    const first = createResponse();
    await handler(request, first);
    const second = createResponse();
    await handler(request, second);

    expect(first.statusCode).toBe(400);
    expect(second.statusCode).toBe(429);
    expect(second.body).toMatchObject({ success: false, code: 'RATE_LIMITED' });
  });
});

describe('3D serverless service availability', () => {
  it('returns a normalized 503 when Meshy service code has not landed yet', async () => {
    process.env.VERCEL = '1';
    process.env.THREE_D_PROVIDER = 'meshy';
    process.env.NODE_ENV = 'production';
    const handler = await loadHandler('./3d-capabilities.js');
    const res = createResponse();

    await handler({ method: 'GET', headers: {}, ip: '198.51.100.4' }, res);

    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({
      success: false,
      code: 'THREE_D_SERVICE_UNAVAILABLE',
      provider: 'meshy',
      retryable: true
    });
  });
});
