-- Migration 107: Color-coded, customizable content types for the Content Planner.

create table if not exists public.content_types (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  color      text not null default '#64748B',
  sort_order int  not null default 0,
  created_at timestamptz not null default now(),
  constraint content_types_name_not_blank check (length(trim(name)) > 0),
  constraint content_types_color_hex check (color ~* '^#[0-9a-f]{6}$')
);

create unique index if not exists content_types_name_lower_uidx
  on public.content_types (lower(trim(name)));

insert into public.content_types (name, color, sort_order)
select v.name, v.color, v.sort_order
from (values
  ('Video', '#8B5CF6', 1),
  ('Photo', '#3B82F6', 2),
  ('Text',  '#64748B', 3),
  ('Ads',   '#F59E0B', 4),
  ('Plug',  '#10B981', 5)
) as v(name, color, sort_order)
where not exists (
  select 1 from public.content_types t where lower(t.name) = lower(v.name)
);

alter table public.content_schedules
  add column if not exists content_type_id uuid references public.content_types(id) on delete set null;

create index if not exists content_schedules_type_idx
  on public.content_schedules (content_type_id);

alter table public.content_types enable row level security;

drop policy if exists content_types_select on public.content_types;
create policy content_types_select on public.content_types
  for select using (auth.role() = 'authenticated');

drop policy if exists content_types_write on public.content_types;
create policy content_types_write on public.content_types
  for all using (public.is_admin_or_sub()) with check (public.is_admin_or_sub());

do $$
begin
  if exists (select 1 from pg_proc where proname = 'log_activity') then
    execute 'drop trigger if exists trg_log_content_types on public.content_types';
    execute $t$
      create trigger trg_log_content_types
        after insert or update or delete on public.content_types
        for each row execute function public.log_activity()
    $t$;
  end if;
end $$;

comment on table public.content_types is
  'Customizable Content Planner types (Video, Photo, Text, Ads, Plug, plus user-defined) with hex colors.';
