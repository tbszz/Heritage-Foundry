-- AI 讲解员知识库：非遗技艺分块嵌入（向量 + 关键词混合检索的向量侧）
-- 架构参考 supabase-community/chatgpt-your-files 的 pgvector 模式：
-- 表 + HNSW 余弦索引 + match_craft_chunks RPC，仅服务端 service role 访问。

create extension if not exists vector;

create table if not exists public.craft_embeddings (
  id bigint primary key generated always as identity,
  craft_id text not null,
  craft_name text not null,
  chunk_index int not null default 0,
  content text not null,
  embedding vector(256) not null,
  created_at timestamptz not null default now(),
  unique (craft_id, chunk_index)
);

create index if not exists craft_embeddings_hnsw_idx
  on public.craft_embeddings using hnsw (embedding vector_cosine_ops);

-- 检索 RPC：按余弦距离取最近邻，返回 1 - distance 作为相似度
create or replace function public.match_craft_chunks(
  query_embedding vector(256),
  match_count int default 6
)
returns table (
  craft_id text,
  craft_name text,
  content text,
  similarity double precision
)
language sql
stable
as $$
  select ce.craft_id,
         ce.craft_name,
         ce.content,
         1 - (ce.embedding <=> query_embedding) as similarity
  from public.craft_embeddings ce
  order by ce.embedding <=> query_embedding
  limit greatest(1, match_count);
$$;

-- 知识库只允许服务端（service role 绕过 RLS）访问，浏览器角色一律拒绝
alter table public.craft_embeddings enable row level security;

revoke all on table public.craft_embeddings from anon, authenticated;

revoke all on function public.match_craft_chunks(vector(256), int) from anon, authenticated;
