-- Driver-returned packages attached to a daily order record.
-- After manager/admin approval, these orders move to Returned to seller.

alter table public.order_records
  add column if not exists driver_returns jsonb not null default '[]'::jsonb;

comment on column public.order_records.driver_returns is
  'Selected returns the driver marked returned: [{ orderId, orderNo, trackingNo, productName, customerName, from, to }]';
