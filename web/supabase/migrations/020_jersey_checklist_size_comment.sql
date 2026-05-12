-- =========================================================================
-- Migration 020: document optional `size` on jersey_checklist JSON items.
-- =========================================================================

comment on column public.sublimation_team_players.jersey_checklist is
  'Ordered [{id, name, size, checked}] — jersey lines per player; size is free text (e.g. S, XL).';
