-- =========================================================================
-- Migration 094: inventory sub-items (variants per inventory item)
-- Each inventory item can have a list of specific items with
-- name, color, dimensions, size, and quantity.
-- =========================================================================

create table if not exists public.inventory_sub_items (
  id          uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references public.inventory(id) on delete cascade,
  name        text not null default '',
  color       text,
  dimensions  text,
  size        text,
  quantity    numeric(12,2) default 0,
  sort_order  int default 0,
  created_at  timestamptz default now()
);

create index if not exists inventory_sub_items_inventory_id_idx
  on public.inventory_sub_items(inventory_id);

-- RLS: same access pattern as inventory
alter table public.inventory_sub_items enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'inventory_sub_items' and policyname = 'inventory_sub_items_select'
  ) then
    execute 'create policy "inventory_sub_items_select"
      on public.inventory_sub_items for select
      using (public.is_admin_or_sub() or auth.role() = ''authenticated'')';
  end if;
  if not exists (
    select 1 from pg_policies where tablename = 'inventory_sub_items' and policyname = 'inventory_sub_items_insert'
  ) then
    execute 'create policy "inventory_sub_items_insert"
      on public.inventory_sub_items for insert
      with check (public.is_admin_or_sub())';
  end if;
  if not exists (
    select 1 from pg_policies where tablename = 'inventory_sub_items' and policyname = 'inventory_sub_items_update'
  ) then
    execute 'create policy "inventory_sub_items_update"
      on public.inventory_sub_items for update
      using (public.is_admin_or_sub()) with check (public.is_admin_or_sub())';
  end if;
  if not exists (
    select 1 from pg_policies where tablename = 'inventory_sub_items' and policyname = 'inventory_sub_items_delete'
  ) then
    execute 'create policy "inventory_sub_items_delete"
      on public.inventory_sub_items for delete
      using (public.is_admin_or_sub())';
  end if;
end $$;
