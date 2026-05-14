-- Migration 064: managed employee_positions table
-- Replaces hardcoded positions list with a DB-managed one.

create table if not exists public.employee_positions (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  sort_order int  not null default 0,
  created_at timestamptz not null default now()
);

alter table public.employee_positions enable row level security;

create policy "staff read employee_positions"
  on public.employee_positions for select
  using (true);

create policy "admin manage employee_positions"
  on public.employee_positions for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'sub_admin')
    )
  );

-- Seed the 4 original positions (safe to re-run)
insert into public.employee_positions (name, sort_order) values
  ('Sales',   1),
  ('Artist',  2),
  ('Staff',   3),
  ('Sewer',   4)
on conflict (name) do nothing;
