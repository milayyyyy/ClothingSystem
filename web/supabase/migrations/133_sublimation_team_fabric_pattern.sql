-- Fabric type and pattern type per jersey/service sheet, for employees and PDF export.

alter table public.sublimation_teams
  add column if not exists fabric_type text not null default '',
  add column if not exists pattern_type text not null default '';

comment on column public.sublimation_teams.fabric_type is
  'Free-text fabric type (e.g. dry fit) shown on the sheet and PDF.';

comment on column public.sublimation_teams.pattern_type is
  'Free-text pattern type shown on the sheet and PDF.';
