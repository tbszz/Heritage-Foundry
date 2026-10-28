import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadReviewService() {
  const module = await import('../services/reviewService.js');
  return module.default || module;
}

const fakeImage = (label) => ({
  base64Image: `data:image/jpeg;base64,${label}`,
  metadata: { model: 'test' }
});

const passReview = () => ({ verdict: 'pass', issues: [], revisionHint: '' });

afterEach(() => {
  vi.resetModules();
});

describe('self review service', () => {
  it('derives carrier-specific checklists with the common watermark rule', async () => {
    const reviewService = await loadReviewService();

    const keychain = reviewService.buildReviewChecklist('keychain').join('\n');
    const figurine = reviewService.buildReviewChecklist('figurine').join('\n');
    const bag = reviewService.buildReviewChecklist('bag').join('\n');
    expect(keychain).toContain('单个主体居中且占画面约 88%');
    expect(figurine).toContain('完整单体从头到脚全部入镜');
    expect(bag).toContain('主体边界完整，是独立印花图案而非商品照片');
    for (const carrier of ['keychain', 'bag', 'phone', 'sticker', 'magnet', 'figurine']) {
      expect(reviewService.buildReviewChecklist(carrier).join('\n'))
        .toContain('画面中没有文字、水印、logo 或 UI 界面');
    }
  });

  it('treats revise without concrete issues as a pass', async () => {
    const reviewService = await loadReviewService();

    expect(reviewService.normalizeReview({ verdict: 'revise', issues: [], revisionHint: 'x' }).verdict).toBe('pass');
    expect(reviewService.normalizeReview({ verdict: 'revise', issues: ['  ', ''], revisionHint: 'x' }).verdict).toBe('pass');
    const normalized = reviewService.normalizeReview({
      verdict: 'revise',
      issues: ['a', 'b', 'c', 'd', 'e', 'f'],
      revisionHint: '  让主体更居中  '
    });
    expect(normalized.issues).toHaveLength(5);
    expect(normalized.revisionHint).toBe('让主体更居中');
  });

  it('returns the first image untouched when the review passes', async () => {
    const reviewService = await loadReviewService();
    const imageGenerator = vi.fn().mockResolvedValue(fakeImage('first'));
    const modelClient = { generateStructuredJson: vi.fn().mockResolvedValue(passReview()) };

    const result = await reviewService.generateImageWithSelfCheck({
      prompt: '原提示词',
      options: { aspect_ratio: '1:1' },
      carrier: 'keychain',
      imageGenerator,
      modelClient
    });

    expect(result.base64Image).toContain('first');
    expect(result.retried).toBe(false);
    expect(result.review.verdict).toBe('pass');
    expect(imageGenerator).toHaveBeenCalledTimes(1);
  });

  it('regenerates once with the revision hint appended when the review demands fixes', async () => {
    const reviewService = await loadReviewService();
    const imageGenerator = vi.fn()
      .mockResolvedValueOnce(fakeImage('first'))
      .mockResolvedValueOnce(fakeImage('second'));
    const modelClient = {
      generateStructuredJson: vi.fn()
        .mockResolvedValueOnce({
          verdict: 'revise',
          issues: ['主体太小'],
          revisionHint: '让单个主体居中并占画面约 88%'
        })
        .mockResolvedValueOnce(passReview())
    };

    const result = await reviewService.generateImageWithSelfCheck({
      prompt: '原提示词',
      options: {},
      carrier: 'keychain',
      imageGenerator,
      modelClient
    });

    expect(imageGenerator).toHaveBeenCalledTimes(2);
    const secondPrompt = imageGenerator.mock.calls[1][0];
    expect(secondPrompt).toContain('自审修正要求：让单个主体居中并占画面约 88%');
    expect(secondPrompt).toContain('原提示词');
    expect(result.base64Image).toContain('second');
    expect(result.retried).toBe(true);
    expect(result.firstReview.issues).toEqual(['主体太小']);
  });

  it('keeps the first image when the automatic retry generation fails', async () => {
    const reviewService = await loadReviewService();
    const imageGenerator = vi.fn()
      .mockResolvedValueOnce(fakeImage('first'))
      .mockRejectedValueOnce(new Error('生成服务超时'));
    const modelClient = {
      generateStructuredJson: vi.fn().mockResolvedValue({
        verdict: 'revise',
        issues: ['主体太小'],
        revisionHint: '让主体更居中'
      })
    };

    const result = await reviewService.generateImageWithSelfCheck({
      prompt: 'p',
      options: {},
      carrier: 'bag',
      imageGenerator,
      modelClient
    });

    expect(result.base64Image).toContain('first');
    expect(result.retried).toBe(false);
    expect(result.review.note).toContain('保留首版');
  });

  it('degrades to skipped instead of failing the delivery when the review model errors', async () => {
    const reviewService = await loadReviewService();
    const imageGenerator = vi.fn().mockResolvedValue(fakeImage('first'));
    const modelClient = {
      generateStructuredJson: vi.fn().mockRejectedValue(new Error('模型超时'))
    };

    const result = await reviewService.generateImageWithSelfCheck({
      prompt: 'p',
      options: {},
      carrier: 'magnet',
      imageGenerator,
      modelClient
    });

    expect(result.base64Image).toContain('first');
    expect(result.review.verdict).toBe('skipped');
    expect(result.review.reason).toContain('模型超时');
    expect(imageGenerator).toHaveBeenCalledTimes(1);
  });

  it('sends the generated image to the review model as inline data', async () => {
    const reviewService = await loadReviewService();
    const modelClient = { generateStructuredJson: vi.fn().mockResolvedValue(passReview()) };

    await reviewService.reviewImage({
      imageBase64: 'data:image/png;base64,QUJD',
      carrier: 'sticker',
      modelClient
    });

    const call = modelClient.generateStructuredJson.mock.calls[0][0];
    expect(call.images).toEqual([{ mimeType: 'image/png', data: 'QUJD' }]);
    expect(call.prompt).toContain('贴纸');
    expect(call.prompt).toContain('水印');
  });
});
