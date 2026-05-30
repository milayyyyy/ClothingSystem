-- Migration 091: sheet write policies match finance (is_admin_or_sub OR order editors)

drop policy if exists sublimation_teams_write on public.sublimation_teams;
create policy sublimation_teams_write on public.sublimation_teams
  for all using (
    public.is_admin_or_sub()
    or public.can_manage_order_sheet(order_id)
  )
  with check (
    public.is_admin_or_sub()
    or public.can_manage_order_sheet(order_id)
  );

drop policy if exists sublimation_team_players_write on public.sublimation_team_players;
create policy sublimation_team_players_write on public.sublimation_team_players
  for all using (
    exists (
      select 1 from public.sublimation_teams t
      where t.id = team_id
        and (
          public.is_admin_or_sub()
          or public.can_manage_order_sheet(t.order_id)
        )
    )
  )
  with check (
    exists (
      select 1 from public.sublimation_teams t
      where t.id = team_id
        and (
          public.is_admin_or_sub()
          or public.can_manage_order_sheet(t.order_id)
        )
    )
  );
