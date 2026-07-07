import { describe, expect, it, vi } from 'vitest';

describe('supabase service', () => {
  it('reports disabled state and returns a structured error when env is missing', async () => {
    vi.resetModules();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_ANON_KEY;

    const service = await import('../services/supabaseService.js');
    const result = await service.saveCreation({ title: '测试作品' });

    expect(service.isEnabled()).toBe(false);
    expect(result).toMatchObject({
      data: null,
      error: {
        code: 'SUPABASE_NOT_CONFIGURED'
      }
    });
  });
});
