-- Migration 104: Content Planner — schedule social media content by date/time and platform.

create table if not exists public.content_schedules (
  id           uuid primary key default gen_random_uuid(),
  title        text not null default 'Untitled post',
  platform     text not null default 'facebook'
                 check (platform in ('facebook', 'instagram', 'tiktok', 'youtube', 'twitter', 'other')),
  scheduled_at timestamptz not null,
  status       text not null default 'scheduled'
                 check (status in ('draft', 'scheduled', 'posted', 'cancelled')),
  caption      text,
  notes        text,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create index if not exists content_schedules_scheduled_at_idx on public.content_schedules (scheduled_at);
create index if not exists content_schedules_platform_idx    on public.content_schedules (platform);

alter table public.content_schedules enable row level security;

drop policy if exists content_schedules_select on public.content_schedules;
create policy content_schedules_select on public.content_schedules
  for select using (auth.role() = 'authenticated');

drop policy if exists content_schedules_write on public.content_schedules;
create policy content_schedules_write on public.content_schedules
  for all using (public.is_admin_or_sub()) with check (public.is_admin_or_sub());

-- Ensure updated_at is kept current
create or replace function public.set_content_schedules_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_content_schedules_updated_at on public.content_schedules;
create trigger trg_content_schedules_updated_at
  before update on public.content_schedules
  for each row execute function public.set_content_schedules_updated_at();
