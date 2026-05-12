-- =========================================================================
-- Migration 005: stores (channels) for product inventory
-- Run AFTER 004_inventory_product_store.sql. Idempotent — safe to re-run.
-- =========================================================================

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  notes text,
  created_at timestamptz default now(),
  constraint stores_name_unique unique (name)
);

alter table public.inventory
  add column if not exists store_id uuid references public.stores(id) on delete set null;

create index if not exists inventory_store_id_idx on public.inventory (store_id);

alter table public.stores enable row level security;

drop policy if exists stores_read on public.stores;
create policy stores_read on public.stores
  for select using (auth.role() = 'authenticated');

drop policy if exists stores_write on public.stores;
create policy stores_write on public.stores
  for all using (public.is_admin_or_sub()) with check (public.is_admin_or_sub());

-- Activity log trigger: include stores
do $$
declare t text;
begin
  for t in select unnest(array['orders','inventory','expenses','suppliers','stores','salaries','tasks']) loop
    execute format('drop trigger if exists trg_log_%I on public.%I', t, t);
    execute format('create trigger trg_log_%I after insert or update or delete on public.%I for each row execute function public.log_activity()', t, t);
  end loop;
end $$;

-- Starter stores (skip if name exists)
insert into public.stores (name) values
  ('Shopee'),
  ('TikTok Shop'),
  ('Lazada'),
  ('Physical store')
on conflict (name) do nothing;
