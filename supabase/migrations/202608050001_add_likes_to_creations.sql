-- F3 共创画廊：给 heritage_creations 新增 likes 字段 + 点赞表
alter table public.heritage_creations
  add column if not exists likes integer not null default 0;

create index if not exists heritage_creations_likes_idx
  on public.heritage_creations (likes desc);

create table if not exists public.creation_likes (
  id uuid primary key default gen_random_uuid(),
  creation_id uuid not null references public.heritage_creations(id) on delete cascade,
  visitor_id text not null,
  created_at timestamptz not null default now(),
  unique(creation_id, visitor_id)
);

create index if not exists creation_likes_creation_idx
  on public.creation_likes (creation_id);