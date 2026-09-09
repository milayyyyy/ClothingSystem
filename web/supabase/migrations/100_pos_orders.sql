-- =========================================================================
-- Migration 100: POS (Point of Sale) orders
-- Adds 'pos' to the order_kind enum and creates the pos_order_items table
-- to store individual line items for each POS sale.
-- =========================================================================

-- 1. Extend order_kind enum with 'pos'
do $$
begin
  if exists (select 1 from pg_type where typname = 'order_kind') then
    if not exists (
      select 1
      from pg_enum e
      join pg_type t on e.enumtypid = t.oid
      where t.typname = 'order_kind' and e.enumlabel = 'pos'
    ) then
      alter type order_kind add value 'pos';
    end if;
  end if;
end $$;

-- 2. POS order line items
create table if not exists public.pos_order_items (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders(id) on delete cascade,
  product_name    text not null default '',
  product_source  text not null default 'custom',  -- 'inventory' | 'custom'
  inventory_id    uuid references public.inventory(id) on delete set null,
  quantity        numeric(12, 2) not null default 1,
  unit_price      numeric(12, 2) not null default 0,
  line_total      numeric(12, 2) generated always as (quantity * unit_price) stored,
  notes           text,
  sort_order      int not null default 0,
  created_at      timestamptz default now()
);

create index if not exists pos_order_items_order_id_idx
  on public.pos_order_items (order_id);

create index if not exists pos_order_items_inventory_id_idx
  on public.pos_order_items (inventory_id);

-- 3. RLS
alter table public.pos_order_items enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'pos_order_items' and policyname = 'pos_order_items_select'
  ) then
    execute 'create policy "pos_order_items_select"
      on public.pos_order_items for select
      using (auth.role() = ''authenticated'')';
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'pos_order_items' and policyname = 'pos_order_items_write'
  ) then
    execute 'create policy "pos_order_items_write"
      on public.pos_order_items for all
      using (
        exists (
          select 1 from public.profiles
          where id = auth.uid() and role in (''admin'', ''manager'', ''employee'')
        )
      )
      with check (
        exists (
          select 1 from public.profiles
          where id = auth.uid() and role in (''admin'', ''manager'', ''employee'')
        )
      )';
  end if;
end $$;
