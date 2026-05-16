-- Migration 069: machine types for maintenance tasks

create table if not exists public.machine_types (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  sort_order int  not null default 0,
  created_at timestamptz not null default now()
);

alter table public.machine_types enable row level security;

drop policy if exists "staff read machine_types" on public.machine_types;
drop policy if exists "admin manage machine_types" on public.machine_types;

create policy "staff read machine_types"
  on public.machine_types for select
  using (true);

create policy "admin manage machine_types"
  on public.machine_types for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'sub_admin')
    )
  );

alter table public.tasks
  add column if not exists machine_type_id uuid references public.machine_types(id) on delete set null;

create index if not exists tasks_machine_type_id_idx on public.tasks (machine_type_id);

comment on column public.tasks.machine_type_id is
  'Required for maintenance tasks — which machine this task applies to.';

insert into public.machine_types (name, sort_order) values
  ('DTF Printer',     1),
  ('Heat Press',      2),
  ('Embroidery Machine', 3),
  ('Sublimation Printer', 4),
  ('Cutting Machine', 5)
on conflict (name) do nothing;
