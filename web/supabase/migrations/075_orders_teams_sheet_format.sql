-- Remember Walk-in/Online sheet tab (teams vs services) per order

alter table public.orders
  add column if not exists teams_sheet_format text not null default 'teams'
  check (teams_sheet_format in ('teams', 'services'));
