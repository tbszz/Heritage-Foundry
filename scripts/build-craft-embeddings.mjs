// 生成 AI 讲解员知识库索引：
// 1. 用 Gemini embedding 对 118 项技艺分块嵌入，写入 src/data/craft-embeddings.json（降级用本地索引）
// 2. 若配置了 Supabase，同时全量重建 public.craft_embeddings（pgvector 主索引）
// 用法：node scripts/build-craft-embeddings.mjs [--no-supabase]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import 'dotenv/config';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 复用 CommonJS 服务层
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const knowledgeService = require(path.join(repoRoot, 'services', 'craftKnowledgeService.js'));
const embeddingService = require(path.join(repoRoot, 'services', 'embeddingService.js'));
const supabaseService = require(path.join(repoRoot, 'services', 'supabaseService.js'));

const args = process.argv.slice(2);
const skipSupabase = args.includes('--no-supabase');

if (!process.env.GEMINI_API_KEY) {
  console.error('缺少 GEMINI_API_KEY，无法生成嵌入。请在 .env 中配置后重试。');
  process.exit(1);
}

const chunks = knowledgeService.buildAllCraftChunks();
const contents = chunks.map((chunk) => chunk.content);
console.log(`共 ${chunks.length} 个技艺分块待嵌入（${embeddingService.getEmbeddingModelName()}，${embeddingService.getEmbeddingDimensions()} 维）…`);

const embeddings = await embeddingService.embedTexts(contents, { taskType: 'RETRIEVAL_DOCUMENT' });
const rounded = embeddings.map((vector) => vector.map((value) => Number(value.toFixed(5))));

const index = {
  model: embeddingService.getEmbeddingModelName(),
  dimensions: embeddingService.getEmbeddingDimensions(),
  generatedAt: new Date().toISOString(),
  chunks: chunks.map((chunk, indexPosition) => ({
    craftId: chunk.craftId,
    chunkIndex: chunk.chunkIndex,
    content: chunk.content,
    embedding: rounded[indexPosition]
  }))
};

const indexPath = path.join(repoRoot, 'src', 'data', 'craft-embeddings.json');
writeFileSync(indexPath, JSON.stringify(index));
console.log(`本地降级索引已写入 src/data/craft-embeddings.json（${(readFileSync(indexPath).length / 1024).toFixed(0)} KB）`);

if (!skipSupabase) {
  if (supabaseService.isEnabled()) {
    const client = supabaseService.getClient();

    const { error: truncateError } = await client
      .from('craft_embeddings')
      .delete()
      .gte('id', 0);
    if (truncateError) {
      console.warn(`pgvector 清空失败（可先执行 supabase/migrations/202610220001_create_craft_embeddings.sql）：${truncateError.message}`);
    } else {
      const nameMap = knowledgeServiceBuildNameMap();
      const rows = index.chunks.map((chunk, indexPosition) => ({
        craft_id: chunk.craftId,
        craft_name: nameMap[chunk.craftId] || chunk.craftId,
        chunk_index: chunk.chunkIndex,
        content: chunk.content,
        embedding: rounded[indexPosition]
      }));

      const { error: insertError } = await client.from('craft_embeddings').insert(rows);
      if (insertError) {
        console.warn(`pgvector 写入失败：${insertError.message}`);
        process.exitCode = 1;
      } else {
        console.log(`pgvector 主索引已重建：public.craft_embeddings 写入 ${rows.length} 行。`);
      }
    }
  } else {
    console.log('未配置 Supabase，跳过 pgvector 上传（当前运行时将使用本地 JSON 索引）。');
  }
}

function knowledgeServiceBuildNameMap() {
  const crafts = JSON.parse(readFileSync(path.join(repoRoot, 'src', 'data', 'crafts.json'), 'utf8'));
  return Object.fromEntries(crafts.map((craft) => [craft.id, craft.name]));
}
