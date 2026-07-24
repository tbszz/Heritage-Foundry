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
    expect(prompt).toContain('96x96');
    expect(prompt).toContain('16–20 色');
    expect(prompt).not.toContain('粗轮廓');
    expect(prompt).toContain('纯色背景');
    expect(prompt).toContain('纯白或浅灰');
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

  it.each([
    ['bag', '帆布包'],
    ['phone', '手机壳'],
    ['magnet', '冰箱贴']
  ])('builds standalone print artwork for %s without perler constraints', async (carrier, carrierName) => {
    const { buildCreativePrompt } = await import('../services/promptService.js');

    const prompt = buildCreativePrompt({
      craftType: 'embroidery',
      ip: 'nezha',
      carrier
    });

    expect(prompt).toContain(carrierName);
    expect(prompt).toContain('独立印花图案');
    expect(prompt).toContain('不要生成商品 mockup');
    expect(prompt).not.toContain('18x12');
    expect(prompt).not.toContain('拼豆转译约束');
    expect(prompt).not.toContain('产品摄影');
  });

  it('builds a clean full-subject reference image for image-to-3D figurines', async () => {
    const { buildCreativePrompt } = await import('../services/promptService.js');

    const prompt = buildCreativePrompt({
      craftType: 'clay',
      ip: 'monkey',
      carrier: 'figurine'
    });

    expect(prompt).toContain('3D手办');
    expect(prompt).toContain('完整主体');
    expect(prompt).toContain('干净背景');
    expect(prompt).toContain('image-to-3D');
    expect(prompt).toContain('单体参考图');
    expect(prompt).not.toContain('18x12');
    expect(prompt).not.toContain('商品 mockup');
    expect(prompt).not.toContain('产品摄影');
  });
});
