import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

async function loadKnowledgeService() {
  const module = await import('../services/craftKnowledgeService.js');
  return module.default || module;
}

afterEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
});

describe('craft knowledge chunking', () => {
  it('splits long text into overlapping chunks and keeps short text whole', async () => {
    const service = await loadKnowledgeService();

    expect(service.splitIntoChunks('短文本')).toEqual(['短文本']);
    expect(service.splitIntoChunks('')).toEqual([]);

    const long = '字'.repeat(1000);
    const chunks = service.splitIntoChunks(long);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].length).toBe(600);
    // 第二块从 520（=600-80 重叠）开始，长度为剩余 480
    expect(chunks[1]).toBe(long.slice(520));
    expect(chunks[1].length).toBe(480);
  });

  it('covers every craft with at least one chunk', async () => {
    const service = await loadKnowledgeService();
    const craftsModule = await import('../src/data/crafts.json');
    const crafts = craftsModule.default || craftsModule;

    const chunks = service.buildAllCraftChunks();
    const covered = new Set(chunks.map((chunk) => chunk.craftId));
    expect(chunks.length).toBeGreaterThan(crafts.length);
    for (const craft of crafts) {
      expect(covered.has(craft.id)).toBe(true);
    }
  });
});

describe('craft knowledge vector search', () => {
  it('ranks by cosine similarity, filters by threshold and dedupes per craft', async () => {
    const service = await loadKnowledgeService();
    const index = {
      dimensions: 2,
      chunks: [
        { craftId: 'a', content: '块1', embedding: [1, 0] },
        { craftId: 'a', content: '块2', embedding: [0.99, 0.01] },
        { craftId: 'b', content: '块3', embedding: [0, 1] },
        { craftId: 'c', content: '块4', embedding: [1, 1] }
      ]
    };

    const results = service.searchLocalIndex(index, [1, 0], 5);
    // 正交向量（相似度 0）与斜向向量（0.707 < 0.72）都被阈值过滤
    expect(results.map((item) => item.craftId)).toEqual(['a']);
    expect(results[0].similarity).toBeCloseTo(1, 5);

    expect(service.cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(service.cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });

  it('loads the committed local index file when dimensions match', async () => {
    const service = await loadKnowledgeService();
    const index = service.loadLocalIndex(true);

    if (index) {
      expect(index.chunks.length).toBeGreaterThan(100);
      expect(index.chunks[0].embedding.length).toBe(256);
    }
  });
});

describe('craft knowledge hybrid retrieval', () => {
  it('fuses vector and keyword rankings with RRF', async () => {
    const service = await loadKnowledgeService();

    const fused = service.fuseRankings([['a', 'b', 'c'], ['b', 'c', 'a']], 3);
    // b 两路均排前二，融合分应高于只在单路领先的 a 与 c
    expect(fused[0]).toBe('b');
    expect(fused).toEqual(['b', 'a', 'c']);
    expect(service.fuseRankings([null, []], 3)).toEqual([]);
  });

  it('keyword search finds exact names and stays empty for unmatched questions', async () => {
    const service = await loadKnowledgeService();

    const hits = service.keywordSearch('布老虎有什么寓意？', 6);
    expect(hits[0]).toBe('tiger-head');
    expect(service.keywordSearch('量子力学和区块链', 6)).toEqual([]);
  });

  it('combines the vector provider with keyword ranking and pins the craft', async () => {
    const service = await loadKnowledgeService();
    const vectorProvider = vi.fn().mockResolvedValue(['new-year', 'tiger-head']);

    const contexts = await service.retrieveContextCrafts('布老虎和年画有什么区别', {
      craftId: 'papercut',
      vectorProvider
    });

    expect(vectorProvider).toHaveBeenCalledTimes(1);
    expect(contexts[0].id).toBe('papercut');
    expect(contexts.map((craft) => craft.id)).toContain('tiger-head');
    expect(contexts.map((craft) => craft.id)).toContain('new-year');
  });

  it('returns no contexts when both legs find nothing', async () => {
    const service = await loadKnowledgeService();

    const contexts = await service.retrieveContextCrafts('量子力学和区块链', {
      vectorProvider: async () => []
    });
    expect(contexts).toEqual([]);
  });

  it('skips the vector leg entirely when embeddings are not configured', async () => {
    delete process.env.GEMINI_API_KEY;
    const service = await loadKnowledgeService();

    const ranking = await service.defaultVectorProvider('布老虎', 6);
    expect(ranking).toBe(null);

    const contexts = await service.retrieveContextCrafts('布老虎有什么寓意？', {});
    expect(contexts[0].id).toBe('tiger-head');
  });

  it('degrades to keyword when the query embedding call fails', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const service = await loadKnowledgeService();
    const failingModel = {
      models: {
        embedContent: vi.fn().mockRejectedValue(new Error('嵌入超时'))
      }
    };

    const ranking = await service.defaultVectorProvider('布老虎', 6, { modelClient: failingModel });
    expect(ranking).toBe(null);
  });
});
