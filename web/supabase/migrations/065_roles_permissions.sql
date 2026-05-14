-- Migration 065: role permissions management table

create table if not exists public.roles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  is_system   boolean not null default false,
  permissions jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

alter table public.roles enable row level security;

drop policy if exists "staff read roles" on public.roles;
drop policy if exists "admin manage roles" on public.roles;

create policy "staff read roles"
  on public.roles for select using (true);

create policy "admin manage roles"
  on public.roles for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'sub_admin')
    )
  );

-- Seed system roles (safe to re-run)
insert into public.roles (name, is_system, permissions) values
(
  'admin',
  true,
  '{"all":true}'
),
(
  'employee',
  true,
  '{
    "dashboard":     {"view":true,  "edit":false},
    "orders":        {"view":true,  "edit":false},
    "inventory":     {"view":true,  "edit":false},
    "ready_made":    {"view":true,  "edit":false},
    "reports":       {"view":false, "edit":false},
    "suppliers":     {"view":false, "edit":false},
    "returns":       {"view":false, "edit":false},
    "sales_expenses":{"view":false, "edit":false},
    "finance":       {"view":false, "edit":false},
    "employees":     {"view":false, "edit":false},
    "attendance":    {"view":true,  "edit":false},
    "salary":        {"view":true,  "edit":false},
    "tasks":         {"view":true,  "edit":true},
    "stores":        {"view":false, "edit":false},
    "activity_log":  {"view":false, "edit":false},
    "settings":      {"view":true,  "edit":true}
  }'
)
on conflict (name) do nothing;
