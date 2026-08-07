import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
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
    end() {
      return this;
    }
  };
}

async function loadHandler() {
  vi.resetModules();
  delete process.env.SUPABASE_URL;
  delete process.env.VITE_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.SUPABASE_ANON_KEY;
  const module = await import('../api/creations.js');
  delete process.env.SUPABASE_URL;
  delete process.env.VITE_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.SUPABASE_ANON_KEY;
  return module.default || module;
}

afterEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
});

describe('V3 serverless creations handler', () => {
  it('routes /api/creations/stats to zeroed stats when Supabase is not configured', async () => {
    const handler = await loadHandler();
    const res = createResponse();

    await handler({ method: 'GET', query: { id: 'stats' } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: {
        totalCreations: 0,
        totalWithImage: 0,
        craftDistribution: {}
      }
    });
  });

  it('routes /api/creations/:id/like and validates visitorId before touching Supabase', async () => {
    const handler = await loadHandler();
    const res = createResponse();

    await handler({ method: 'POST', query: { id: 'creation-1/like' }, body: {} }, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      success: false,
      error: { code: 'INVALID_BODY' }
    });
  });

  it('passes sort through to the list endpoint on Vercel', async () => {
    const source = readFileSync(new URL('../api/creations.js', import.meta.url), 'utf8');

    expect(source).toContain('sort: req.query.sort');
  });
});
