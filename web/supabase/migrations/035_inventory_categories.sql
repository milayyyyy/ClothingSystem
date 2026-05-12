-- =========================================================================
-- Migration 035: Inventory categories (dynamic filter tabs + item labels).
-- =========================================================================

create table if not exists public.inventory_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint inventory_categories_slug_key unique (slug)
);

-- Expression uniqueness is not allowed inside CREATE TABLE; use a unique index.
create unique index if not exists inventory_categories_name_lower_uidx
  on public.inventory_categories (lower(trim(name)));

comment on table public.inventory_categories is
  'Labels for inventory.category; slug is used in ?kind= URL filters.';

insert into public.inventory_categories (name, slug, sort_order) values
  ('Product', 'product', 0),
  ('Material', 'material', 1),
  ('Ready made product', 'ready_made', 2)
on conflict (slug) do nothing;

create index if not exists inventory_categories_sort_idx on public.inventory_categories (sort_order, name);

alter table public.inventory_categories enable row level security;

drop policy if exists inventory_categories_select on public.inventory_categories;
create policy inventory_categories_select on public.inventory_categories
  for select using (auth.role() = 'authenticated');

drop policy if exists inventory_categories_write on public.inventory_categories;
create policy inventory_categories_write on public.inventory_categories
  for all using (public.is_admin_or_sub()) with check (public.is_admin_or_sub());
