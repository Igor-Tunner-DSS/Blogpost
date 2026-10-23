-- Execute DEPOIS de criar o usuário administrador (Authentication > Users).
-- Substitua pelo UID (UUID) do usuário. Para trocar de administrador, execute de novo.
insert into private.app_config (key, value)
values ('admin_uid', '00000000-0000-0000-0000-000000000000')
on conflict (key) do update set value = excluded.value;
