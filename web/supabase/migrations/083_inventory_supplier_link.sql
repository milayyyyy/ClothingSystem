-- Product link for items sourced from Shopee / online ecommerce suppliers.

alter table public.inventory
  add column if not exists supplier_link text;

comment on column public.inventory.supplier_link is
  'Optional product URL (e.g. Shopee listing) when the supplier is an online store.';
