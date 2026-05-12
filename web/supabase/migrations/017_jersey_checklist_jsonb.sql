-- =========================================================================
-- Migration 017: custom jersey line items per player (named checklist)
-- Replaces fixed jersey_types slugs in the app; legacy jersey_types kept [].
-- =========================================================================

alter table public.sublimation_team_players
  add column if not exists jersey_checklist jsonb not null default '[]'::jsonb;

comment on column public.sublimation_team_players.jersey_checklist is
  'Ordered [{id, name, checked}] — user-defined jersey lines for this player.';
