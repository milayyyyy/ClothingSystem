-- Store parsed BigSeller variation split into normalized shirt type and size.
alter table public.orders
  add column if not exists shirt_type text,
  add column if not exists shirt_size text;

