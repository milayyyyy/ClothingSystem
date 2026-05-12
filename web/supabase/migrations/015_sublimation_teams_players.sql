-- =========================================================================
-- Migration 015: sublimation teams / players (jersey types, design preview)
-- Idempotent where possible.
-- =========================================================================

create table if not exists public.sublimation_teams (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  name text not null default 'Team',
  sort_order int not null default 0,
  created_at timestamptz default now()
);

create index if not exists sublimation_teams_order_id_idx on public.sublimation_teams (order_id);

create table if not exists public.sublimation_team_players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.sublimation_teams(id) on delete cascade,
  surname text not null default '',
  jersey_number text not null default '',
  jersey_types text[] not null default '{}',
  design_approved boolean not null default false,
  design_image_url text,
  sort_order int not null default 0,
  created_at timestamptz default now()
);

create index if not exists sublimation_team_players_team_id_idx on public.sublimation_team_players (team_id);

alter table public.sublimation_teams enable row level security;
alter table public.sublimation_team_players enable row level security;

drop policy if exists sublimation_teams_select on public.sublimation_teams;
create policy sublimation_teams_select on public.sublimation_teams
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (public.is_admin_or_sub() or o.assigned_to = auth.uid())
    )
  );

drop policy if exists sublimation_teams_write on public.sublimation_teams;
create policy sublimation_teams_write on public.sublimation_teams
  for all using (
    exists (
      select 1 from public.orders o
      where o.id = order_id and public.is_admin_or_sub()
    )
  )
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_id and public.is_admin_or_sub()
    )
  );

drop policy if exists sublimation_team_players_select on public.sublimation_team_players;
create policy sublimation_team_players_select on public.sublimation_team_players
  for select using (
    exists (
      select 1 from public.sublimation_teams t
      join public.orders o on o.id = t.order_id
      where t.id = team_id
        and (public.is_admin_or_sub() or o.assigned_to = auth.uid())
    )
  );

drop policy if exists sublimation_team_players_write on public.sublimation_team_players;
create policy sublimation_team_players_write on public.sublimation_team_players
  for all using (
    exists (
      select 1 from public.sublimation_teams t
      join public.orders o on o.id = t.order_id
      where t.id = team_id and public.is_admin_or_sub()
    )
  )
  with check (
    exists (
      select 1 from public.sublimation_teams t
      join public.orders o on o.id = t.order_id
      where t.id = team_id and public.is_admin_or_sub()
    )
  );

-- Activity log triggers
do $$
declare t text;
begin
  for t in select unnest(array['sublimation_teams','sublimation_team_players']) loop
    execute format('drop trigger if exists trg_log_%I on public.%I', t, t);
    execute format(
      'create trigger trg_log_%I after insert or update or delete on public.%I for each row execute function public.log_activity()',
      t, t
    );
  end loop;
end $$;

-- Optional demo roster (when migration 011 mock sublimation order exists)
do $$
declare
  oid uuid;
  tid uuid;
begin
  select o.id into oid
  from public.orders o
  where o.customer_name = 'Demo — Juana dela Cruz'
    and (o.kind = 'sublimation'::order_kind or lower(coalesce(o.order_type, '')) like 'sublim%')
  limit 1;
  if oid is null then return; end if;
  if exists (select 1 from public.sublimation_teams t where t.order_id = oid) then return; end if;
  insert into public.sublimation_teams (order_id, name, sort_order)
  values (oid, 'Demo Varsity', 0)
  returning id into tid;
  insert into public.sublimation_team_players (
    team_id, surname, jersey_number, jersey_types, design_approved, design_image_url, sort_order
  ) values
    (tid, 'Reyes', '7', array['basketball_upper', 'warmer']::text[], true, 'https://placehold.co/120x120/png?text=Jersey+7', 0),
    (tid, 'Torres', '23', array['basketball_lower']::text[], false, null, 1);
end $$;

