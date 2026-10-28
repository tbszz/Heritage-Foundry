// 讲解员知识检索层：向量（Supabase pgvector 主 / 仓库内 JSON 索引降级）+ 关键词
// 双路检索，RRF 融合；两级向量存储都不可用时退回纯关键词，保持可降级运行。
const fs = require('fs');
const path = require('path');
const craftsData = require('../src/data/crafts.json');
const embeddingService = require('./embeddingService');
const supabaseService = require('./supabaseService');

const CHUNK_CHAR_LIMIT = 600;
const CHUNK_OVERLAP_CHARS = 80;
// gemini-embedding-001 实测分布：相关问句 top1 ≈ 0.80+，无关问句 ≤ 0.68；0.72 为分界（env 可调）
const VECTOR_SIMILARITY_THRESHOLD = Number(process.env.DOCENT_VECTOR_THRESHOLD || 0.72);
const RRF_K = 60;

const LOCAL_INDEX_PATH = path.join(__dirname, '..', 'src', 'data', 'craft-embeddings.json');
let cachedLocalIndex;
let localIndexLoaded = false;

function getCraftById(id) {
  return craftsData.find((craft) => craft.id === id);
}

function splitIntoChunks(text, charLimit = CHUNK_CHAR_LIMIT, overlap = CHUNK_OVERLAP_CHARS) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  if (clean.length <= charLimit) return [clean];

  const chunks = [];
  let start = 0;
  while (start < clean.length) {
    chunks.push(clean.slice(start, start + charLimit));
    start += charLimit - overlap;
  }
  return chunks;
}

// 每项技艺 → 概览块（名称/类别/地域/简介）+ 若干故事块
function buildCraftChunks(craft) {
  const meta = [
    craft.name,
    craft.category,
    craft.regionLabel || craft.region,
    craft.blurb || craft.description
  ].filter(Boolean).join(' · ');

  const chunks = [];
  const overview = `${meta}。${craft.description || craft.blurb || ''}`.trim();
  for (const [index, content] of splitIntoChunks(overview).entries()) {
    chunks.push({ craftId: craft.id, chunkIndex: index, content });
  }

  const storyBase = chunks.length;
  for (const [index, content] of splitIntoChunks(craft.story).entries()) {
    chunks.push({ craftId: craft.id, chunkIndex: storyBase + index, content });
  }

  return chunks;
}

function buildAllCraftChunks() {
  return craftsData.flatMap((craft) => buildCraftChunks(craft));
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function loadLocalIndex(force = false) {
  if (localIndexLoaded && !force) return cachedLocalIndex || null;
  localIndexLoaded = true;
  cachedLocalIndex = null;

  if (!fs.existsSync(LOCAL_INDEX_PATH)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(LOCAL_INDEX_PATH, 'utf8'));
    if (!Array.isArray(parsed?.chunks) || !parsed.chunks.length) return null;
    if (Number(parsed.dimensions) !== embeddingService.getEmbeddingDimensions()) {
      console.warn('craft-embeddings.json 维度与当前嵌入配置不一致，忽略本地向量索引');
      return null;
    }
    cachedLocalIndex = parsed;
  } catch (error) {
    console.warn('读取 craft-embeddings.json 失败，忽略本地向量索引:', error.message);
  }
  return cachedLocalIndex;
}

function searchLocalIndex(index, queryEmbedding, limit) {
  const scored = index.chunks
    .map((chunk) => ({
      craftId: chunk.craftId,
      content: chunk.content,
      similarity: cosineSimilarity(queryEmbedding, chunk.embedding)
    }))
    .filter((item) => item.similarity >= VECTOR_SIMILARITY_THRESHOLD)
    .sort((a, b) => b.similarity - a.similarity);

  // 同一技艺只保留最相似块，避免单技艺刷屏
  const bestPerCraft = new Map();
  for (const item of scored) {
    if (!bestPerCraft.has(item.craftId)) bestPerCraft.set(item.craftId, item);
  }
  return [...bestPerCraft.values()].slice(0, limit);
}

async function searchSupabaseIndex(queryEmbedding, limit) {
  const client = supabaseService.getClient();
  if (!client) return null;

  const { data, error } = await client.rpc('match_craft_chunks', {
    query_embedding: queryEmbedding,
    match_count: limit * 2
  });
  if (error) throw new Error(`pgvector 检索失败：${error.message}`);

  const bestPerCraft = new Map();
  for (const row of data || []) {
    if (!bestPerCraft.has(row.craft_id)) {
      bestPerCraft.set(row.craft_id, {
        craftId: row.craft_id,
        content: row.content,
        similarity: Number(row.similarity) || 0
      });
    }
  }
  return [...bestPerCraft.values()]
    .filter((item) => item.similarity >= VECTOR_SIMILARITY_THRESHOLD)
    .slice(0, limit);
}

function extractQuestionSegments(question) {
  return String(question || '')
    .split(/[\s，。？！、；：,.?!;:·"'“”‘’（）()【】\[\]]+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length >= 2)
    .slice(0, 12);
}

function scoreCraft(craft, segments, question) {
  let score = 0;
  const name = craft.name || '';
  if (name && question.includes(name)) score += 30;
  if (name && name.length >= 2 && segments.some((segment) => name.includes(segment))) score += 8;
  if (craft.category && segments.includes(craft.category)) score += 12;
  const region = craft.regionLabel || craft.region || '';
  if (region && question.includes(region)) score += 12;
  const haystack = `${craft.blurb || ''}${craft.description || ''}`;
  for (const segment of segments) {
    if (haystack.includes(segment)) score += 4;
  }
  return score;
}

function keywordSearch(question, limit) {
  const segments = extractQuestionSegments(question);
  const query = String(question || '');
  return craftsData
    .map((craft) => ({ craftId: craft.id, score: scoreCraft(craft, segments, query) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.craftId.localeCompare(b.craftId))
    .slice(0, limit)
    .map((item) => item.craftId);
}

// 默认向量通道：pgvector → 本地 JSON 索引 → null（不可用）
async function defaultVectorProvider(question, limit, { modelClient } = {}) {
  if (!embeddingService.isEmbeddingConfigured()) return null;

  let embeddings;
  try {
    embeddings = await embeddingService.embedTexts([question], {
      taskType: 'RETRIEVAL_QUERY',
      modelClient
    });
  } catch (error) {
    console.warn('问题嵌入失败，本轮退回关键词检索:', error.message);
    return null;
  }
  const queryEmbedding = embeddings[0];

  if (supabaseService.isEnabled()) {
    try {
      const rows = await searchSupabaseIndex(queryEmbedding, limit);
      if (rows) return rows.map((row) => row.craftId);
    } catch (error) {
      console.warn('pgvector 检索失败，退回本地索引:', error.message);
    }
  }

  const localIndex = loadLocalIndex();
  if (!localIndex) return null;
  return searchLocalIndex(localIndex, queryEmbedding, limit).map((row) => row.craftId);
}

// Reciprocal Rank Fusion：多路排名 → 融合排名（混合检索标准做法）
function fuseRankings(rankings, limit) {
  const scores = new Map();
  for (const ranking of rankings) {
    if (!Array.isArray(ranking)) continue;
    ranking.forEach((craftId, index) => {
      const current = scores.get(craftId) || 0;
      scores.set(craftId, current + 1 / (RRF_K + index + 1));
    });
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([craftId]) => craftId);
}

async function retrieveContextCrafts(question, {
  craftId,
  limit = 6,
  modelClient,
  vectorProvider
} = {}) {
  const resolveVector = vectorProvider || defaultVectorProvider;

  const vectorRanking = await resolveVector(String(question || ''), limit, { modelClient });
  const keywordRanking = keywordSearch(String(question || ''), limit);
  const fused = fuseRankings([vectorRanking, keywordRanking], limit);

  const contexts = [];
  const seen = new Set();
  const pinned = craftId ? getCraftById(craftId) : null;
  if (pinned) {
    contexts.push(pinned);
    seen.add(pinned.id);
  }
  for (const id of fused) {
    if (contexts.length >= limit) break;
    if (seen.has(id)) continue;
    const craft = getCraftById(id);
    if (craft) {
      contexts.push(craft);
      seen.add(craft.id);
    }
  }
  return contexts;
}

function getRetrievalStatus() {
  return {
    vector: {
      supabase: supabaseService.isEnabled(),
      localIndex: Boolean(loadLocalIndex())
    },
    threshold: VECTOR_SIMILARITY_THRESHOLD
  };
}

module.exports = {
  buildCraftChunks,
  buildAllCraftChunks,
  splitIntoChunks,
  cosineSimilarity,
  loadLocalIndex,
  searchLocalIndex,
  searchSupabaseIndex,
  extractQuestionSegments,
  scoreCraft,
  keywordSearch,
  fuseRankings,
  defaultVectorProvider,
  retrieveContextCrafts,
  getRetrievalStatus
};
