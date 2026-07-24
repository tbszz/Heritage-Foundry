import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
});

describe('guardrail environment compatibility', () => {
  it('uses the legacy ALLOWED_ORIGINS variable when the new name is absent', async () => {
    delete process.env.CORS_ALLOWED_ORIGINS;
    process.env.ALLOWED_ORIGINS = 'https://legacy.example';
    process.env.NODE_ENV = 'production';
    const guardrails = await import('../middleware/apiGuardrails.js');
    const options = guardrails.createCorsOptions();

    const result = await new Promise((resolve) => {
      options.origin('https://legacy.example', (error, allowed) => resolve({ error, allowed }));
    });

    expect(result).toEqual({ error: null, allowed: true });
  });
});
