-- Managers (is_admin_or_sub) can save Returns BigSeller login in app_settings.
drop policy if exists "admin manage app_settings" on public.app_settings;
create policy "admin manage app_settings"
  on public.app_settings for all
  to authenticated
  using (public.is_admin_or_sub())
  with check (public.is_admin_or_sub());

insert into public.app_settings (key, value) values
  ('returns_bigseller_url', ''),
  ('returns_bigseller_username', ''),
  ('returns_bigseller_password', '')
on conflict (key) do nothing;
