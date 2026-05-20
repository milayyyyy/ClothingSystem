-- Extra product titles from marketplace Excel (same order id, rows 2+).

alter table public.orders
  add column if not exists bigseller_line_items jsonb not null default '[]'::jsonb;

comment on column public.orders.bigseller_line_items is
  'Additional product names from historical Excel import (first row is design_ref; same-order follow-up rows).';
