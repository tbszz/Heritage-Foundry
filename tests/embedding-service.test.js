import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

async function loadEmbeddingService() {
  const module = await import('../services/embeddingService.js');
  return module.default || module;
}

function createModelStub() {
  return {
    models: {
      embedContent: vi.fn(async ({ contents }) => ({
        embeddings: contents.map((_, index) => ({
          values: Array.from({ length: 8 }, (_, dim) => index + dim / 100)
        }))
      }))
    }
  };
}

afterEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
});

describe('embedding service', () => {
  it('embeds every text in order and batches large inputs', async () => {
    const service = await loadEmbeddingService();
    const modelClient = createModelStub();

    const small = await service.embedTexts(['布老虎', '剪纸'], { modelClient });
    expect(small).toHaveLength(2);
    expect(small[0][0]).toBeCloseTo(0, 5);
    expect(small[1][0]).toBeCloseTo(1, 5);
    expect(modelClient.models.embedContent).toHaveBeenCalledTimes(1);

    const many = Array.from({ length: 120 }, (_, index) => `文本${index}`);
    const result = await service.embedTexts(many, { modelClient });
    expect(result).toHaveLength(120);
    // 50 条/批 → 120 条应分 3 批
    expect(modelClient.models.embedContent).toHaveBeenCalledTimes(1 + 3);
  });

  it('requests retrieval task type and the configured dimensions', async () => {
    const service = await loadEmbeddingService();
    const modelClient = createModelStub();

    await service.embedTexts(['问题'], { taskType: 'RETRIEVAL_QUERY', modelClient });

    const call = modelClient.models.embedContent.mock.calls[0][0];
    expect(call.config.taskType).toBe('RETRIEVAL_QUERY');
    expect(call.config.outputDimensionality).toBe(service.getEmbeddingDimensions());
    expect(call.contents).toEqual(['问题']);
  });

  it('returns an empty array for empty input without calling the model', async () => {
    const service = await loadEmbeddingService();
    const modelClient = createModelStub();

    expect(await service.embedTexts(['   ', ''], { modelClient })).toEqual([]);
    expect(modelClient.models.embedContent).not.toHaveBeenCalled();
  });

  it('fails loudly when the model returns a mismatched count', async () => {
    const service = await loadEmbeddingService();
    const modelClient = {
      models: {
        embedContent: vi.fn().mockResolvedValue({ embeddings: [{ values: [1, 2] }] })
      }
    };

    await expect(service.embedTexts(['a', 'b'], { modelClient }))
      .rejects.toMatchObject({ code: 'EMBEDDING_COUNT_MISMATCH' });
  });

  it('reports unconfigured status without a key', async () => {
    delete process.env.GEMINI_API_KEY;
    const service = await loadEmbeddingService();

    expect(service.isEmbeddingConfigured()).toBe(false);
    await expect(service.embedTexts(['a'])).rejects.toMatchObject({
      statusCode: 503,
      code: 'GEMINI_NOT_CONFIGURED'
    });
  });
});
