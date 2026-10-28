import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

async function loadBriefService() {
  const module = await import('../services/briefService.js');
  return module.default || module;
}

function createModelStub(resolvedJson) {
  return { generateStructuredJson: vi.fn().mockResolvedValue(resolvedJson) };
}

afterEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
});

describe('creative brief service', () => {
  it('rejects an empty user message with a 400 BRIEF_MESSAGE_REQUIRED error', async () => {
    const briefService = await loadBriefService();

    await expect(briefService.parseCreativeBrief({ message: '   ' }))
      .rejects.toMatchObject({ statusCode: 400, code: 'BRIEF_MESSAGE_REQUIRED' });
  });

  it('normalizes model output onto the generator form candidate sets', async () => {
    const briefService = await loadBriefService();

    const brief = briefService.normalizeBrief(
      {
        craft: 'suzhou-embroidery-does-not-exist',
        ip: '皮卡丘',
        carrier: 'phone',
        style: 'cute',
        customPrompt: '  加入生日蛋糕元素  ',
        reasoning: '用户提到生日与皮卡丘'
      },
      {}
    );

    expect(brief.ipId).toBe('pikachu');
    expect(brief.ipName).toBe('皮卡丘');
    expect(brief.carrierId).toBe('phone');
    expect(brief.styleId).toBe('cute');
    expect(brief.customPrompt).toBe('加入生日蛋糕元素');
    // 非法技艺 id 应回退到候选集首个技艺，而不是透传给表单
    expect(brief.craftId).toBe(briefService.getCraftCandidates()[0].id);
  });

  it('keeps the current brief for dimensions the model left invalid', async () => {
    const briefService = await loadBriefService();
    const fallbackCraft = briefService.getCraftCandidates()[0];

    const brief = briefService.normalizeBrief(
      { craft: '', ip: 'unknown-ip', carrier: '', style: '', customPrompt: '', reasoning: '' },
      { craftId: fallbackCraft.id, ipId: 'nezha', carrierId: 'bag', styleId: 'vintage' }
    );

    expect(brief.craftId).toBe(fallbackCraft.id);
    expect(brief.ipId).toBe('nezha');
    expect(brief.carrierId).toBe('bag');
    expect(brief.styleId).toBe('vintage');
  });

  it('builds a prompt containing all candidate libraries and the current brief', async () => {
    const briefService = await loadBriefService();
    const prompt = briefService.buildBriefPrompt({
      message: '送表弟的生日礼物',
      currentBrief: { craftId: 'papercut', ipId: 'pikachu' }
    });

    expect(prompt).toContain('候选·非遗技艺');
    expect(prompt).toContain('候选·流行 IP');
    expect(prompt).toContain('候选·文创载体');
    expect(prompt).toContain('候选·作品气质');
    expect(prompt).toContain('pikachu：皮卡丘');
    expect(prompt).toContain('当前简报：技艺=papercut，流行 IP=pikachu');
    expect(prompt).toContain('用户新需求：送表弟的生日礼物');
  });

  it('returns the normalized brief from the structured model call', async () => {
    const briefService = await loadBriefService();
    const modelClient = createModelStub({
      craft: 'papercut',
      ip: 'pikachu',
      carrier: 'keychain',
      style: 'cute',
      customPrompt: '加入生日帽子',
      reasoning: '按送礼场景选择可爱气质'
    });

    const brief = await briefService.parseCreativeBrief({
      message: '做皮卡丘生日挂件',
      currentBrief: {},
      modelClient
    });

    expect(modelClient.generateStructuredJson).toHaveBeenCalledTimes(1);
    expect(brief).toMatchObject({
      craftId: 'papercut',
      ipId: 'pikachu',
      carrierId: 'keychain',
      styleId: 'cute',
      customPrompt: '加入生日帽子'
    });
  });

  it('clamps oversized custom prompts and reasoning', async () => {
    const briefService = await loadBriefService();

    const brief = briefService.normalizeBrief(
      { craft: 'papercut', ip: 'pikachu', carrier: 'bag', style: 'cute', customPrompt: '长'.repeat(600), reasoning: '理'.repeat(500) },
      {}
    );

    expect(brief.customPrompt.length).toBe(500);
    expect(brief.reasoning.length).toBe(400);
  });
});
