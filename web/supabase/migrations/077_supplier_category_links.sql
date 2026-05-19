-- Many-to-many: suppliers can belong to multiple categories

create table if not exists public.supplier_category_links (
  supplier_id  uuid not null references public.suppliers(id) on delete cascade,
  category_id  uuid not null references public.supplier_categories(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (supplier_id, category_id)
);

create index if not exists supplier_category_links_category_id_idx
  on public.supplier_category_links(category_id);

-- Migrate legacy single category_id (migration 076) when column still exists
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'suppliers'
      and column_name = 'category_id'
  ) then
    insert into public.supplier_category_links (supplier_id, category_id)
    select id, category_id
    from public.suppliers
    where category_id is not null
    on conflict (supplier_id, category_id) do nothing;

    alter table public.suppliers drop column category_id;
  end if;
end $$;

alter table public.supplier_category_links enable row level security;

drop policy if exists supplier_category_links_select on public.supplier_category_links;
drop policy if exists supplier_category_links_write on public.supplier_category_links;

create policy supplier_category_links_select on public.supplier_category_links
  for select using (auth.role() = 'authenticated');

create policy supplier_category_links_write on public.supplier_category_links
  for all using (public.is_admin_or_sub()) with check (public.is_admin_or_sub());
