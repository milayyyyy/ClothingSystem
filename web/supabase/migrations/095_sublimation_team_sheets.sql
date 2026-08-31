-- =========================================================================
-- Migration 095: sublimation_teams — add team grouping and sheet name
-- Enables multiple jersey type sheets per team.
-- team_group_key: groups multiple sheets belonging to the same team
-- sheet_name: the jersey type label for each sheet (e.g. "Jersey", "Hoodie")
-- =========================================================================

alter table public.sublimation_teams
  add column if not exists team_group_key text,
  add column if not exists sheet_name     text;

-- Existing rows: each team becomes its own group; sheet name = team name
update public.sublimation_teams
set team_group_key = id::text,
    sheet_name     = name
where team_group_key is null;

create index if not exists sublimation_teams_group_key_idx
  on public.sublimation_teams(team_group_key);
