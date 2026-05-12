-- =========================================================================
-- Migration 034: Saved inventory "Type" presets (item_type suggestions).
-- =========================================================================

create table if not exists public.inventory_type_options (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- One canonical label per spelling-insensitive preset (trim + lower).
create unique index if not exists inventory_type_options_name_lower_uidx
  on public.inventory_type_options (lower(trim(name)));

comment on table public.inventory_type_options is
  'Preset labels for inventory.item_type; seeded from existing rows; extended when items are saved.';

-- Seed from distinct non-empty item_type values already on inventory.
insert into public.inventory_type_options (name)
select distinct trim(i.item_type)
from public.inventory i
where trim(coalesce(i.item_type, '')) <> ''
  and not exists (
    select 1
    from public.inventory_type_options o
    where lower(trim(o.name)) = lower(trim(i.item_type))
  );

alter table public.inventory_type_options enable row level security;

drop policy if exists inventory_type_options_select on public.inventory_type_options;
create policy inventory_type_options_select on public.inventory_type_options
  for select using (auth.role() = 'authenticated');

drop policy if exists inventory_type_options_write on public.inventory_type_options;
create policy inventory_type_options_write on public.inventory_type_options
  for all using (public.is_admin_or_sub()) with check (public.is_admin_or_sub());
