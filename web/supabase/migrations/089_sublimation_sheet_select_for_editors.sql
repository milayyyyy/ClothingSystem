-- Migration 089: let order-sheet editors read sublimation rows (needed for design gallery save)

drop policy if exists sublimation_teams_select on public.sublimation_teams;
create policy sublimation_teams_select on public.sublimation_teams
  for select using (
    public.can_manage_order_sheet(order_id)
    or exists (
      select 1 from public.orders o
      where o.id = order_id
        and (public.is_admin_or_sub() or o.assigned_to = auth.uid())
    )
  );

drop policy if exists sublimation_team_players_select on public.sublimation_team_players;
create policy sublimation_team_players_select on public.sublimation_team_players
  for select using (
    exists (
      select 1 from public.sublimation_teams t
      where t.id = team_id and public.can_manage_order_sheet(t.order_id)
    )
    or exists (
      select 1 from public.sublimation_teams t
      join public.orders o on o.id = t.order_id
      where t.id = team_id
        and (public.is_admin_or_sub() or o.assigned_to = auth.uid())
    )
  );
