-- =========================================================================
-- Migration 007: task repeat interval (every N days; 1 = daily, 7 = weekly)
-- Run AFTER prior migrations. Idempotent — safe to re-run.
-- =========================================================================

alter table public.tasks
  add column if not exists repeat_interval_days int;

comment on column public.tasks.repeat_interval_days is
  'NULL = non-repeating. Positive integer = repeat every N days (1=daily, 7=weekly).';
