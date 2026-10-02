-- =========================================================================
-- Migration 127: sublimation_teams — add notes column
-- A free-text note per team that acts as a guide for employees.
-- Appears in the teams sheet UI and in the exported PDF team list.
-- =========================================================================

alter table public.sublimation_teams
  add column if not exists notes text not null default '';

comment on column public.sublimation_teams.notes is
  'Free-text note / guide for employees visible on the teams sheet and PDF export.';
