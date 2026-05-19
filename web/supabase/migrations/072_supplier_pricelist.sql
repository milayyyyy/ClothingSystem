-- Supplier pricelist: reference image + line items (product, price, description).

alter table public.suppliers
  add column if not exists pricelist_image_url text;

comment on column public.suppliers.pricelist_image_url is
  'Photo/scan of the supplier price list (public URL in supplier-pricelist bucket).';

create table if not exists public.supplier_pricelist_items (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  product_name text not null,
  price numeric(12, 2) not null default 0,
  description text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists supplier_pricelist_items_supplier_id_idx
  on public.supplier_pricelist_items (supplier_id);

alter table public.supplier_pricelist_items enable row level security;

drop policy if exists supplier_pricelist_items_select on public.supplier_pricelist_items;
create policy supplier_pricelist_items_select on public.supplier_pricelist_items
  for select using (auth.role() = 'authenticated');

drop policy if exists supplier_pricelist_items_write on public.supplier_pricelist_items;
create policy supplier_pricelist_items_write on public.supplier_pricelist_items
  for all using (public.is_admin_or_sub())
  with check (public.is_admin_or_sub());

-- Public bucket for pricelist photos
insert into storage.buckets (id, name, public)
select 'supplier-pricelist', 'supplier-pricelist', true
where not exists (select 1 from storage.buckets where id = 'supplier-pricelist');

drop policy if exists supplier_pricelist_storage_select on storage.objects;
create policy supplier_pricelist_storage_select on storage.objects
  for select using (bucket_id = 'supplier-pricelist');

drop policy if exists supplier_pricelist_storage_insert on storage.objects;
create policy supplier_pricelist_storage_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'supplier-pricelist' and public.is_admin_or_sub());

drop policy if exists supplier_pricelist_storage_update on storage.objects;
create policy supplier_pricelist_storage_update on storage.objects
  for update to authenticated
  using (bucket_id = 'supplier-pricelist' and public.is_admin_or_sub())
  with check (bucket_id = 'supplier-pricelist' and public.is_admin_or_sub());

drop policy if exists supplier_pricelist_storage_delete on storage.objects;
create policy supplier_pricelist_storage_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'supplier-pricelist' and public.is_admin_or_sub());
