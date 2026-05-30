-- Migration 087: allow staff with order edit permission to upload jersey design photos and save sheets

create or replace function public.can_upload_jersey_designs()
returns boolean language sql stable security definer set search_path = public as $$
  select
    public.is_admin_or_sub()
    or exists (
      select 1
      from public.profiles p
      inner join public.roles r on r.name = p.role::text
      where p.id = auth.uid()
        and (
          coalesce((r.permissions->>'all')::boolean, false)
          or coalesce((r.permissions->'orders'->>'edit')::boolean, false)
        )
    );
$$;

create or replace function public.can_manage_order_sheet(target_order_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    public.is_admin_or_sub()
    or exists (
      select 1
      from public.profiles p
      inner join public.roles r on r.name = p.role::text
      where p.id = auth.uid()
        and (
          coalesce((r.permissions->>'all')::boolean, false)
          or coalesce((r.permissions->'orders'->>'edit')::boolean, false)
        )
    );
$$;

comment on function public.can_upload_jersey_designs() is
  'Staff who may upload to the jersey-designs storage bucket.';
comment on function public.can_manage_order_sheet(uuid) is
  'Staff who may create/update sublimation team sheets for an order.';

-- Storage: jersey-designs bucket
drop policy if exists "jersey_designs_insert" on storage.objects;
create policy "jersey_designs_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'jersey-designs'
    and public.can_upload_jersey_designs()
  );

drop policy if exists "jersey_designs_update" on storage.objects;
create policy "jersey_designs_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'jersey-designs'
    and public.can_upload_jersey_designs()
  )
  with check (
    bucket_id = 'jersey-designs'
    and public.can_upload_jersey_designs()
  );

drop policy if exists "jersey_designs_delete" on storage.objects;
create policy "jersey_designs_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'jersey-designs'
    and public.can_upload_jersey_designs()
  );

-- Sublimation sheet tables
drop policy if exists sublimation_teams_write on public.sublimation_teams;
create policy sublimation_teams_write on public.sublimation_teams
  for all using (public.can_manage_order_sheet(order_id))
  with check (public.can_manage_order_sheet(order_id));

drop policy if exists sublimation_team_players_write on public.sublimation_team_players;
create policy sublimation_team_players_write on public.sublimation_team_players
  for all using (
    exists (
      select 1 from public.sublimation_teams t
      where t.id = team_id and public.can_manage_order_sheet(t.order_id)
    )
  )
  with check (
    exists (
      select 1 from public.sublimation_teams t
      where t.id = team_id and public.can_manage_order_sheet(t.order_id)
    )
  );
