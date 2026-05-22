-- Revenue workbook imports (Business Bookkeeping 2.1 Revenue sheet).

alter table public.manual_sales
  add column if not exists revenue_channel text,
  add column if not exists product_service text,
  add column if not exists external_id text,
  add column if not exists import_key text;

create unique index if not exists manual_sales_import_key_uidx
  on public.manual_sales (import_key)
  where import_key is not null;

comment on column public.manual_sales.revenue_channel is 'Original REVENUE CHANNEL label from bookkeeping import.';
comment on column public.manual_sales.import_key is 'Dedupe key for Excel re-imports.';
