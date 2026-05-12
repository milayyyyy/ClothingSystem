-- =========================================================================
-- Migration 018: team-level design reference images (gallery URLs)
-- =========================================================================

alter table public.sublimation_teams
  add column if not exists design_image_urls text[] not null default '{}'::text[];

comment on column public.sublimation_teams.design_image_urls is
  'Public URLs of design reference images for this team (e.g. jersey-designs bucket).';
