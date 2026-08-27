-- 点赞记录只允许服务端访问，浏览器统一通过 /api/creations/:id/like。
alter table public.creation_likes enable row level security;

revoke all privileges on table public.creation_likes from anon, authenticated;
