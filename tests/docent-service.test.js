import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadDocentService() {
  const module = await import('../services/docentService.js');
  return module.default || module;
}

const keywordOnly = async () => null;

afterEach(() => {
  vi.resetModules();
});

describe('docent service retrieval', () => {
  it('answers from the grounded prompt and reports retrieval sources', async () => {
    const docentService = await loadDocentService();
    const modelClient = {
      generatePlainText: vi.fn().mockResolvedValue('布老虎源自虎图腾崇拜，寓意镇宅辟邪。')
    };

    const result = await docentService.answerQuestion({
      question: '布老虎有什么寓意？',
      history: [{ role: 'user', text: '你好' }, { role: 'docent', text: '欢迎来到非遗造物局' }],
      modelClient,
      vectorProvider: keywordOnly
    });

    const request = modelClient.generatePlainText.mock.calls[0][0];
    expect(request.prompt).toContain('布老虎');
    expect(request.prompt).toContain('游客：你好');
    expect(request.prompt).toContain('讲解员：欢迎来到非遗造物局');
    expect(result.answer).toContain('布老虎');
    expect(result.sources[0]).toMatchObject({ id: 'tiger-head', name: '布老虎' });
  });

  it('pins the requested craft first and pads with same-category neighbours', async () => {
    const docentService = await loadDocentService();

    const contexts = await docentService.retrieveContextCraftsAsync('这 个 是 什 么', {
      craftId: 'papercut',
      vectorProvider: keywordOnly
    });
    expect(contexts[0].id).toBe('papercut');
    // 剪纸所属「传统美术」类别本身只有 2 项，补齐后应包含同类的年画
    expect(contexts.length).toBeGreaterThanOrEqual(2);
    expect(contexts.map((craft) => craft.id)).toContain('new-year');
    expect(contexts.slice(1).every((craft) => craft.category === contexts[0].category)).toBe(true);
  });

  it('fuses the vector leg with the keyword leg for semantic questions', async () => {
    const docentService = await loadDocentService();
    const vectorProvider = vi.fn().mockResolvedValue(['tiger-head', 'new-year']);

    const contexts = await docentService.retrieveContextCraftsAsync('送小朋友的老虎玩偶有什么讲究', {
      vectorProvider
    });

    expect(vectorProvider).toHaveBeenCalledTimes(1);
    expect(contexts.map((craft) => craft.id)).toContain('tiger-head');
  });

  it('still answers honestly when nothing matches the question', async () => {
    const docentService = await loadDocentService();
    const modelClient = {
      generatePlainText: vi.fn().mockResolvedValue('馆藏资料里暂时没有这方面内容。')
    };

    const result = await docentService.answerQuestion({
      question: '量子力学和非遗有什么关系',
      modelClient,
      vectorProvider: async () => []
    });

    const request = modelClient.generatePlainText.mock.calls[0][0];
    expect(request.prompt).toContain('本轮没有检索到直接相关的馆藏资料');
    expect(result.sources).toEqual([]);
  });

  it('speaks as the spirit pet with the visitor hall when persona is pet', async () => {
    const docentService = await loadDocentService();
    const modelClient = {
      generatePlainText: vi.fn().mockResolvedValue('嗷呜，布老虎寓意镇宅辟邪！')
    };

    await docentService.answerQuestion({
      question: '布老虎有什么寓意？',
      history: [{ role: 'docent', text: '我是小布' }],
      persona: 'pet',
      hall: '经纬成章展厅',
      modelClient,
      vectorProvider: keywordOnly
    });

    const { prompt } = modelClient.generatePlainText.mock.calls[0][0];
    expect(prompt).toContain('灵宠「小布」');
    expect(prompt).toContain('120 字以内');
    expect(prompt).toContain('游客当前所在：经纬成章展厅');
    expect(prompt).toContain('小布：我是小布');
  });

  it('falls back to the docent voice for unknown personas', async () => {
    const docentService = await loadDocentService();
    const prompt = docentService.buildDocentPrompt({
      question: '你好', contexts: [], history: [], persona: '__proto__'
    });
    expect(prompt).toContain('AI 讲解员');
    expect(prompt).not.toContain('游客当前所在');
  });

  it('rejects an empty question with a 400 DOCENT_QUESTION_REQUIRED error', async () => {
    const docentService = await loadDocentService();

    await expect(docentService.answerQuestion({ question: '' }))
      .rejects.toMatchObject({ statusCode: 400, code: 'DOCENT_QUESTION_REQUIRED' });
  });
});
