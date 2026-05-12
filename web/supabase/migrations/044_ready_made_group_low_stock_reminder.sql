-- Per sheet group: enable/disable low-stock reminders on Ready made inventory.

alter table public.ready_made_sheet_groups
  add column if not exists low_stock_reminder_enabled boolean not null default true;

comment on column public.ready_made_sheet_groups.low_stock_reminder_enabled is
  'When true, the Ready made UI highlights rows and lists alerts where numeric qty <= min columns (header name heuristics).';
