create extension if not exists "pgcrypto";

create table if not exists public.heritage_creations (
  id uuid primary key default gen_random_uuid(),
  title text not null default '未命名非遗文创方案',
  craft_id text,
  craft_name text,
  ip_id text,
  ip_name text,
  carrier_id text,
  carrier_name text,
  style_id text,
  style_name text,
  prompt text,
  image_url text,
  pattern jsonb,
  materials jsonb,
  stats jsonb,
  story text,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists heritage_creations_created_at_idx
  on public.heritage_creations (created_at desc);

create index if not exists heritage_creations_public_created_at_idx
  on public.heritage_creations (is_public, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists heritage_creations_set_updated_at on public.heritage_creations;
create trigger heritage_creations_set_updated_at
before update on public.heritage_creations
for each row
execute function public.set_updated_at();

alter table public.heritage_creations enable row level security;

drop policy if exists "Public creations are readable" on public.heritage_creations;
create policy "Public creations are readable"
on public.heritage_creations
for select
to anon, authenticated
using (is_public = true);

-- Inserts are expected to go through the Express backend using a server-side
-- secret/service role key. Do not expose elevated keys in browser bundles.
