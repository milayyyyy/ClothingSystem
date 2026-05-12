-- =========================================================================
-- Migration 033: Per-item inventory quantity change history (audit trail).
-- Logs whenever on-hand quantity increases or decreases on public.inventory.
-- =========================================================================

create table if not exists public.inventory_quantity_movements (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references public.inventory (id) on delete cascade,
  previous_quantity numeric(12, 2) not null default 0,
  new_quantity numeric(12, 2) not null default 0,
  delta numeric(12, 2) not null,
  actor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists inventory_quantity_movements_inv_created_idx
  on public.inventory_quantity_movements (inventory_id, created_at desc);

comment on table public.inventory_quantity_movements is
  'Append-only log of inventory quantity changes (trigger on inventory).';

alter table public.inventory_quantity_movements enable row level security;

drop policy if exists inventory_quantity_movements_select on public.inventory_quantity_movements;
create policy inventory_quantity_movements_select on public.inventory_quantity_movements
  for select using (auth.role() = 'authenticated');

-- Inserts only from trigger (security definer); no client write policies.

create or replace function public.log_inventory_quantity_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  prev numeric(12, 2);
  newq numeric(12, 2);
  d    numeric(12, 2);
begin
  if tg_op = 'INSERT' then
    newq := coalesce(NEW.quantity, 0);
    prev := 0;
    d := newq - prev;
    if d = 0 then
      return NEW;
    end if;
    insert into public.inventory_quantity_movements (inventory_id, previous_quantity, new_quantity, delta, actor_id)
    values (NEW.id, prev, newq, d, auth.uid());
    return NEW;
  elsif tg_op = 'UPDATE' then
    prev := coalesce(OLD.quantity, 0);
    newq := coalesce(NEW.quantity, 0);
    if prev = newq then
      return NEW;
    end if;
    d := newq - prev;
    insert into public.inventory_quantity_movements (inventory_id, previous_quantity, new_quantity, delta, actor_id)
    values (NEW.id, prev, newq, d, auth.uid());
    return NEW;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_inventory_quantity_movement on public.inventory;
create trigger trg_inventory_quantity_movement
  after insert or update of quantity on public.inventory
  for each row
  execute function public.log_inventory_quantity_movement();
