-- =========================================================================
-- Migration 023: Scheduled machine maintenance + per-user dismissals
-- =========================================================================

create table if not exists public.maintenance_schedules (
  id uuid primary key default gen_random_uuid(),
  machine_name text not null,
  title text not null default 'Scheduled maintenance',
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  remind_at timestamptz not null,
  created_at timestamptz default now(),
  constraint maintenance_schedules_range check (ends_at > starts_at)
);

create table if not exists public.maintenance_schedule_dismissals (
  user_id uuid not null references public.profiles(id) on delete cascade,
  schedule_id uuid not null references public.maintenance_schedules(id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (user_id, schedule_id)
);

create index if not exists maintenance_schedules_remind_ends_idx
  on public.maintenance_schedules (remind_at, ends_at);

alter table public.maintenance_schedules enable row level security;
alter table public.maintenance_schedule_dismissals enable row level security;

drop policy if exists maintenance_schedules_select on public.maintenance_schedules;
create policy maintenance_schedules_select on public.maintenance_schedules
  for select using (auth.role() = 'authenticated');

drop policy if exists maintenance_schedules_write on public.maintenance_schedules;
create policy maintenance_schedules_write on public.maintenance_schedules
  for all using (public.is_admin_or_sub()) with check (public.is_admin_or_sub());

drop policy if exists maintenance_dismissals_select on public.maintenance_schedule_dismissals;
create policy maintenance_dismissals_select on public.maintenance_schedule_dismissals
  for select using (auth.uid() = user_id);

drop policy if exists maintenance_dismissals_insert on public.maintenance_schedule_dismissals;
create policy maintenance_dismissals_insert on public.maintenance_schedule_dismissals
  for insert with check (auth.uid() = user_id);

drop policy if exists maintenance_dismissals_delete on public.maintenance_schedule_dismissals;
create policy maintenance_dismissals_delete on public.maintenance_schedule_dismissals
  for delete using (auth.uid() = user_id);

do $$
declare t text;
begin
  for t in select unnest(array['maintenance_schedules', 'maintenance_schedule_dismissals']) loop
    execute format('drop trigger if exists trg_log_%I on public.%I', t, t);
    execute format(
      'create trigger trg_log_%I after insert or update or delete on public.%I for each row execute function public.log_activity()',
      t, t
    );
  end loop;
end $$;
