import { describe, expect, it } from 'vitest';

describe('creative prompt service', () => {
  it('builds an imaginative heritage + IP prompt that is suitable for perler beads', async () => {
    const { buildCreativePrompt } = await import('../services/promptService.js');

    const prompt = buildCreativePrompt({
      basePrompt: '角色挂件',
      style: 'chinese',
      craftType: 'tangka',
      ip: 'doraemon',
      carrier: 'keychain'
    });

    expect(prompt).toContain('脑洞');
    expect(prompt).toContain('唐卡');
    expect(prompt).toContain('矿物颜料');
    expect(prompt).toContain('哆啦A梦');
    expect(prompt).toContain('拼豆挂件');
    expect(prompt).toContain('18x12');
    expect(prompt).toContain('无文字');
    expect(prompt).toContain('干净背景');
  });

  it('keeps the original route helper compatible while adding craft language', async () => {
    const { buildEnhancedPrompt } = await import('../services/promptService.js');

    const prompt = buildEnhancedPrompt('角色挂件', 'chinese', 'tangka');

    expect(prompt).toContain('角色挂件');
    expect(prompt).toContain('唐卡');
    expect(prompt).toContain('矿物颜料');
  });
});
