-- =========================================================================
-- Migration 096: reminders
-- Notes and reminders with optional due date/time, priority, and status.
-- Admin and Manager only — employees have no access.
-- =========================================================================

create table if not exists public.reminders (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  notes       text,
  due_at      timestamptz,
  priority    text not null default 'medium'
              check (priority in ('low', 'medium', 'high', 'urgent')),
  status      text not null default 'pending'
              check (status in ('pending', 'done')),
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists reminders_created_by_idx on public.reminders(created_by);
create index if not exists reminders_due_at_idx     on public.reminders(due_at);
create index if not exists reminders_status_idx     on public.reminders(status);

alter table public.reminders enable row level security;

create policy "reminders_select"
  on public.reminders for select
  using (public.is_admin_or_sub());

create policy "reminders_insert"
  on public.reminders for insert
  with check (public.is_admin_or_sub());

create policy "reminders_update"
  on public.reminders for update
  using  (public.is_admin_or_sub())
  with check (public.is_admin_or_sub());

create policy "reminders_delete"
  on public.reminders for delete
  using (public.is_admin_or_sub());
