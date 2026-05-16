-- Migration 068: repeat_mode for recurring tasks (daily / weekly / monthly / custom)
alter table public.tasks
  add column if not exists repeat_mode text;

alter table public.tasks
  drop constraint if exists tasks_repeat_mode_check;

alter table public.tasks
  add constraint tasks_repeat_mode_check
  check (
    repeat_mode is null
    or repeat_mode in ('daily', 'weekly', 'monthly', 'custom')
  );

comment on column public.tasks.repeat_mode is
  'Recurring schedule: daily, weekly, monthly (calendar), or custom (use repeat_interval_days).';
