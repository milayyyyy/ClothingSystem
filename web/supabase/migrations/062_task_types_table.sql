-- Migration 062: task_types management table
-- Replaces hardcoded CHECK constraint with a managed table.

-- 1. Drop the hardcoded CHECK so task_type accepts any value
alter table public.tasks
  drop constraint if exists tasks_task_type_check;

-- 2. Create managed task_types table
create table if not exists public.task_types (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  sort_order int  not null default 0,
  created_at timestamptz not null default now()
);

alter table public.task_types enable row level security;

drop policy if exists "staff read task_types" on public.task_types;
drop policy if exists "admin manage task_types" on public.task_types;

create policy "staff read task_types"
  on public.task_types for select
  using (true);

create policy "admin manage task_types"
  on public.task_types for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'sub_admin')
    )
  );

-- 3. Seed the 5 default types (safe to re-run)
insert into public.task_types (name, sort_order) values
  ('Maintenance', 1),
  ('Cleaning',    2),
  ('Stocking',    3),
  ('Editing',     4),
  ('Others',      5)
on conflict (name) do nothing;
