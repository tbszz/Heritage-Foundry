import { describe, expect, it, vi } from 'vitest';

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
});
