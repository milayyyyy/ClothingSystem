-- Reseller catalog: Shopee-style product listings for the Reseller Product page.

create table if not exists public.reseller_products (
  id           uuid primary key default gen_random_uuid(),
  name         text not null default '',
  category     text,
  description  text,
  images       jsonb not null default '[]'::jsonb,
  specs        jsonb not null default '{}'::jsonb,
  variations   jsonb not null default '[]'::jsonb,
  skus         jsonb not null default '[]'::jsonb,
  size_chart   jsonb not null default '{}'::jsonb,
  shipping     jsonb not null default '{}'::jsonb,
  preorder     boolean not null default false,
  status       text not null default 'draft',
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint reseller_products_name_len check (char_length(name) <= 100),
  constraint reseller_products_status_ok check (status in ('draft', 'listed'))
);

create index if not exists reseller_products_updated_idx
  on public.reseller_products (updated_at desc);

create or replace function public.touch_reseller_products_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_reseller_products_updated_at on public.reseller_products;
create trigger trg_reseller_products_updated_at
  before update on public.reseller_products
  for each row execute function public.touch_reseller_products_updated_at();

alter table public.reseller_products enable row level security;

drop policy if exists reseller_products_select on public.reseller_products;
create policy reseller_products_select on public.reseller_products
  for select using (auth.role() = 'authenticated');

drop policy if exists reseller_products_write on public.reseller_products;
create policy reseller_products_write on public.reseller_products
  for all using (public.is_admin_or_sub()) with check (public.is_admin_or_sub());

do $$
begin
  if exists (select 1 from pg_proc where proname = 'log_activity') then
    execute 'drop trigger if exists trg_log_reseller_products on public.reseller_products';
    execute $t$
      create trigger trg_log_reseller_products
        after insert or update or delete on public.reseller_products
        for each row execute function public.log_activity()
    $t$;
  end if;
end $$;

insert into storage.buckets (id, name, public)
select 'reseller-products', 'reseller-products', true
where not exists (select 1 from storage.buckets where id = 'reseller-products');

drop policy if exists reseller_products_storage_select on storage.objects;
create policy reseller_products_storage_select
  on storage.objects for select
  using (bucket_id = 'reseller-products');

drop policy if exists reseller_products_storage_insert on storage.objects;
create policy reseller_products_storage_insert
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'reseller-products' and public.is_admin_or_sub());

drop policy if exists reseller_products_storage_update on storage.objects;
create policy reseller_products_storage_update
  on storage.objects for update
  to authenticated
  using (bucket_id = 'reseller-products' and public.is_admin_or_sub())
  with check (bucket_id = 'reseller-products' and public.is_admin_or_sub());

drop policy if exists reseller_products_storage_delete on storage.objects;
create policy reseller_products_storage_delete
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'reseller-products' and public.is_admin_or_sub());

comment on table public.reseller_products is
  'Reseller Product listings (images, specs, variations, SKUs, size chart).';
