-- 2/3 — Identificação do administrador e RLS da tabela posts.

-- O UID do administrador fica em uma tabela de um schema NÃO exposto pela API (private),
-- sem nenhum acesso para anon/authenticated. Só a função is_admin() (SECURITY DEFINER) a lê.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.app_config (
  key   text primary key,
  value text not null
);
revoke all on private.app_config from public, anon, authenticated;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select auth.uid() = value::uuid from private.app_config where key = 'admin_uid'),
    false);
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- RLS
alter table public.posts enable row level security;

drop policy if exists posts_select_public on public.posts;
drop policy if exists posts_insert_admin  on public.posts;
drop policy if exists posts_update_admin  on public.posts;
drop policy if exists posts_delete_admin  on public.posts;

create policy posts_select_public on public.posts
  for select to anon, authenticated using (true);

create policy posts_insert_admin on public.posts
  for insert to authenticated with check ((select public.is_admin()));

create policy posts_update_admin on public.posts
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy posts_delete_admin on public.posts
  for delete to authenticated using ((select public.is_admin()));

revoke all on public.posts from anon, authenticated;
grant select on public.posts to anon, authenticated;
grant insert, update, delete on public.posts to authenticated;
