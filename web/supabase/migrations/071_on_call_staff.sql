-- On-call workers: contact details only (no auth account, no app access).
create table if not exists public.on_call_staff (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  position text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists on_call_staff_full_name_idx on public.on_call_staff (full_name);

alter table public.on_call_staff enable row level security;

drop policy if exists on_call_staff_select on public.on_call_staff;
create policy on_call_staff_select on public.on_call_staff
  for select using (public.is_admin_or_sub());

drop policy if exists on_call_staff_write on public.on_call_staff;
create policy on_call_staff_write on public.on_call_staff
  for all using (public.is_admin_or_sub())
  with check (public.is_admin_or_sub());

comment on table public.on_call_staff is
  'On-call technicians, sewers, and staff — directory only; no login accounts.';
