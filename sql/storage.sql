-- 3/3 — Bucket público de imagens e políticas de escrita restritas ao administrador.
-- Limite de 2 MB por arquivo e apenas tipos de imagem (reforçado pelo próprio bucket).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-images', 'post-images', true, 2097152,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Leitura: bucket público serve os arquivos por URL; não há política SELECT (sem listagem pública).
drop policy if exists post_images_insert_admin on storage.objects;
drop policy if exists post_images_update_admin on storage.objects;
drop policy if exists post_images_delete_admin on storage.objects;

create policy post_images_insert_admin on storage.objects
  for insert to authenticated
  with check (bucket_id = 'post-images' and (select public.is_admin()));

create policy post_images_update_admin on storage.objects
  for update to authenticated
  using (bucket_id = 'post-images' and (select public.is_admin()))
  with check (bucket_id = 'post-images' and (select public.is_admin()));

create policy post_images_delete_admin on storage.objects
  for delete to authenticated
  using (bucket_id = 'post-images' and (select public.is_admin()));
