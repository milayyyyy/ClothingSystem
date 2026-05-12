-- BigSeller online order metadata fields for pick-list style imports.
alter table public.orders
  add column if not exists external_order_no text,
  add column if not exists waybill_no text,
  add column if not exists courier text,
  add column if not exists buyer_alias text,
  add column if not exists sku_code text,
  add column if not exists variation text;

