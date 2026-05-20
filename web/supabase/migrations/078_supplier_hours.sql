-- Supplier business hours (days open + open/close times)

alter table public.suppliers
  add column if not exists days_open text[] not null default '{}',
  add column if not exists opens_at text,
  add column if not exists closes_at text;

comment on column public.suppliers.days_open is 'Weekdays open: mon, tue, wed, thu, fri, sat, sun';
comment on column public.suppliers.opens_at is 'Opening time in 24h HH:MM';
comment on column public.suppliers.closes_at is 'Closing time in 24h HH:MM';
