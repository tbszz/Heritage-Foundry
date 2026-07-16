-- 作品图片存储桶：public = true，图片通过公开 URL 直接访问，
-- heritage_creations.image_url 从此存 URL 而非 base64（报告 4.3 P4）。
-- 写入由后端持有的 service_role key 完成（绕过 RLS），无需额外写策略。
insert into storage.buckets (id, name, public)
values ('heritage-creations', 'heritage-creations', true)
on conflict (id) do nothing;
