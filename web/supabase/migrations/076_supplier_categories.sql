-- Supplier categories (custom labels for filtering and assignment)

create table if not exists public.supplier_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  sort_order int  not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists supplier_categories_name_lower_uidx
  on public.supplier_categories (lower(trim(name)));

alter table public.supplier_categories enable row level security;

drop policy if exists supplier_categories_select on public.supplier_categories;
drop policy if exists supplier_categories_write on public.supplier_categories;

create policy supplier_categories_select on public.supplier_categories
  for select using (auth.role() = 'authenticated');

create policy supplier_categories_write on public.supplier_categories
  for all using (public.is_admin_or_sub()) with check (public.is_admin_or_sub());

alter table public.suppliers
  add column if not exists category_id uuid references public.supplier_categories(id) on delete set null;

create index if not exists suppliers_category_id_idx on public.suppliers(category_id);
