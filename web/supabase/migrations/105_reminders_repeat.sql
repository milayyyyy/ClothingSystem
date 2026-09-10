-- Migration 105: Recurring reminders — daily / weekly / monthly / custom days.

alter table public.reminders
  add column if not exists repeat_mode text,
  add column if not exists repeat_interval_days int;

alter table public.reminders
  drop constraint if exists reminders_repeat_mode_check;

alter table public.reminders
  add constraint reminders_repeat_mode_check
  check (
    repeat_mode is null
    or repeat_mode in ('daily', 'weekly', 'monthly', 'custom')
  );

comment on column public.reminders.repeat_mode is
  'Recurring schedule: daily, weekly, monthly, or custom (use repeat_interval_days).';
comment on column public.reminders.repeat_interval_days is
  'Used when repeat_mode is custom — number of days between occurrences.';
