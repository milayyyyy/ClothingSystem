-- Migration 086: shop equipment / assets (DTF printer, sublimation machine, etc.)

create table if not exists public.inventory_assets (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  machine_type_id  uuid references public.machine_types(id) on delete set null,
  location         text,
  serial_number    text,
  status           text not null default 'active'
    check (status in ('active', 'repair', 'retired')),
  purchase_date    date,
  purchase_cost    numeric(12, 2),
  warranty_expires date,
  notes            text,
  sort_order       int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists inventory_assets_machine_type_idx on public.inventory_assets (machine_type_id);
create index if not exists inventory_assets_status_idx on public.inventory_assets (status);
create index if not exists inventory_assets_sort_idx on public.inventory_assets (sort_order, name);

alter table public.inventory_assets enable row level security;

drop policy if exists inventory_assets_select on public.inventory_assets;
create policy inventory_assets_select on public.inventory_assets
  for select using (auth.role() = 'authenticated');

drop policy if exists inventory_assets_write on public.inventory_assets;
create policy inventory_assets_write on public.inventory_assets
  for all using (public.is_admin_or_sub()) with check (public.is_admin_or_sub());

drop trigger if exists trg_log_inventory_assets on public.inventory_assets;
create trigger trg_log_inventory_assets
  after insert or update or delete on public.inventory_assets
  for each row execute function public.log_activity();

comment on table public.inventory_assets is
  'Shop equipment and capital assets (printers, heat presses, etc.) — separate from consumable stock inventory.';
