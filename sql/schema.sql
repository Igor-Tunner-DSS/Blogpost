-- 1/3 — Tabela posts, índice e triggers. Execute no SQL Editor do Supabase.

create table if not exists public.posts (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  title      text not null check (length(btrim(title)) > 0 and length(title) <= 200),
  subtitle   text check (subtitle is null or length(subtitle) <= 300),
  body       text not null check (length(btrim(body)) > 0 and length(body) <= 200000)
);

-- Paginação por cursor (created_at, id): lista em ordem decrescente sem repetir/omitir registros.
create index if not exists posts_created_at_id_idx on public.posts (created_at desc, id desc);

-- Datas sempre geradas pelo banco; o cliente não consegue forjá-las.
create or replace function public.set_post_timestamps()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
  else
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  return new;
end $$;

drop trigger if exists posts_set_timestamps on public.posts;
create trigger posts_set_timestamps
  before insert or update on public.posts
  for each row execute function public.set_post_timestamps();
