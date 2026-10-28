const { GoogleGenAI } = require('@google/genai');

// 讲解员知识库嵌入层：与生图/文本模型共用 GEMINI_API_KEY。
// 118 项技艺 × 少量分块，用 Matryoshka 截断到 256 维足够，索引体量小、检索快。
const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';
const EMBEDDING_DIMENSIONS = Number(process.env.GEMINI_EMBEDDING_DIMENSIONS || 256);
const EMBEDDING_BATCH_SIZE = 50;
const EMBEDDING_TIMEOUT_MS = Number(process.env.GEMINI_EMBEDDING_TIMEOUT_MS || 60000);

let embeddingClient = null;

function getEmbeddingModelName() {
  return EMBEDDING_MODEL;
}

function getEmbeddingDimensions() {
  return EMBEDDING_DIMENSIONS;
}

function isEmbeddingConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

function getEmbeddingClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const error = new Error('GEMINI_API_KEY 未配置，无法生成知识库嵌入');
    error.statusCode = 503;
    error.code = 'GEMINI_NOT_CONFIGURED';
    throw error;
  }
  if (!embeddingClient) {
    embeddingClient = new GoogleGenAI({
      apiKey,
      httpOptions: { timeout: EMBEDDING_TIMEOUT_MS }
    });
  }
  return embeddingClient;
}

function extractEmbeddings(response, expectedCount) {
  const embeddings = response?.embeddings || [];
  const values = embeddings
    .map((item) => (Array.isArray(item?.values) ? item.values : null))
    .filter(Boolean);

  if (values.length !== expectedCount) {
    const error = new Error(`嵌入模型返回数量不匹配（期望 ${expectedCount}，实际 ${values.length}）`);
    error.statusCode = 502;
    error.code = 'EMBEDDING_COUNT_MISMATCH';
    throw error;
  }
  return values;
}

// taskType: 'RETRIEVAL_DOCUMENT'（建索引）或 'RETRIEVAL_QUERY'（查询）
async function embedTexts(texts, { taskType = 'RETRIEVAL_DOCUMENT', modelClient } = {}) {
  const input = texts.map((text) => String(text || '')).filter((text) => text.trim());
  if (!input.length) return [];

  const ai = modelClient || getEmbeddingClient();
  const results = [];

  for (let start = 0; start < input.length; start += EMBEDDING_BATCH_SIZE) {
    const batch = input.slice(start, start + EMBEDDING_BATCH_SIZE);
    const response = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: batch,
      config: {
        outputDimensionality: EMBEDDING_DIMENSIONS,
        taskType
      }
    });
    results.push(...extractEmbeddings(response, batch.length));
  }

  return results;
}

module.exports = {
  getEmbeddingModelName,
  getEmbeddingDimensions,
  isEmbeddingConfigured,
  embedTexts
};
