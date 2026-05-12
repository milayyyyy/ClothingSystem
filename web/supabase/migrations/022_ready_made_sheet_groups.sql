-- =========================================================================
-- Migration 022: Groups for ready made inventory sheets
-- =========================================================================

create table if not exists public.ready_made_sheet_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Group',
  sort_order int not null default 0,
  created_at timestamptz default now()
);

alter table public.ready_made_boards
  add column if not exists group_id uuid references public.ready_made_sheet_groups(id) on delete set null;

create index if not exists ready_made_boards_group_id_idx on public.ready_made_boards (group_id);

alter table public.ready_made_sheet_groups enable row level security;

drop policy if exists ready_made_sheet_groups_select on public.ready_made_sheet_groups;
create policy ready_made_sheet_groups_select on public.ready_made_sheet_groups
  for select using (auth.role() = 'authenticated');

drop policy if exists ready_made_sheet_groups_write on public.ready_made_sheet_groups;
create policy ready_made_sheet_groups_write on public.ready_made_sheet_groups
  for all using (public.is_admin_or_sub()) with check (public.is_admin_or_sub());

-- One default group + attach existing sheets (if any)
insert into public.ready_made_sheet_groups (name, sort_order)
select 'General', 0
where not exists (select 1 from public.ready_made_sheet_groups);

update public.ready_made_boards b
set group_id = coalesce(
  b.group_id,
  (select id from public.ready_made_sheet_groups g where g.name = 'General' order by g.sort_order limit 1)
)
where b.group_id is null;

do $$
declare t text;
begin
  for t in select unnest(array['ready_made_sheet_groups']) loop
    execute format('drop trigger if exists trg_log_%I on public.%I', t, t);
    execute format(
      'create trigger trg_log_%I after insert or update or delete on public.%I for each row execute function public.log_activity()',
      t, t
    );
  end loop;
end $$;
