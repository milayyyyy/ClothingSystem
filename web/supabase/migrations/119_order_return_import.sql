-- Store BigSeller Order-Return Excel fields on the matched (or created) order.
alter table public.orders
  add column if not exists return_import jsonb;

comment on column public.orders.return_import is
  'BigSeller Order-Return Excel snapshot: { fileName, importedAt, rows: [{ platform, bigsellerStore, afterSalesType, packageNo, orderNo, afterSalesId, ... }] }';
