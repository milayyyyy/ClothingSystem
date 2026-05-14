-- Migration 066: app_settings key-value table for global configuration

create table if not exists public.app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists "staff read app_settings" on public.app_settings;
drop policy if exists "admin manage app_settings" on public.app_settings;

-- All authenticated staff can read settings
create policy "staff read app_settings"
  on public.app_settings for select
  to authenticated using (true);

-- Only admin / sub_admin can upsert
create policy "admin manage app_settings"
  on public.app_settings for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'sub_admin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'sub_admin')
    )
  );

-- Seed defaults (safe to re-run)
insert into public.app_settings (key, value) values
  ('clock_mode', 'manual')   -- "manual" | "face"
on conflict (key) do nothing;
