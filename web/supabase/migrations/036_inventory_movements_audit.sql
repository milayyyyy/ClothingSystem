-- =========================================================================
-- Migration 036: Stock movement audit — item name, change kind, item delete.
-- Keeps history rows when an inventory item is deleted (FK set null).
-- =========================================================================

alter table public.inventory_quantity_movements
  add column if not exists item_name text,
  add column if not exists change_kind text not null default 'adjust';

comment on column public.inventory_quantity_movements.item_name is
  'Item label at time of event (survives after inventory row is deleted).';
comment on column public.inventory_quantity_movements.change_kind is
  'initial = first stock on create; adjust = quantity edit; item_deleted = row removed.';

-- Replace FK so delete audit rows are kept with inventory_id cleared.
alter table public.inventory_quantity_movements
  drop constraint if exists inventory_quantity_movements_inventory_id_fkey;

alter table public.inventory_quantity_movements
  alter column inventory_id drop not null;

alter table public.inventory_quantity_movements
  add constraint inventory_quantity_movements_inventory_id_fkey
  foreign key (inventory_id) references public.inventory (id) on delete set null;

-- Backfill names and kinds for existing rows
update public.inventory_quantity_movements m
set item_name = i.name
from public.inventory i
where m.inventory_id = i.id
  and (m.item_name is null or btrim(m.item_name) = '');

update public.inventory_quantity_movements
set change_kind = 'initial'
where coalesce(previous_quantity, 0) = 0
  and coalesce(new_quantity, 0) <> 0
  and change_kind = 'adjust';

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
    insert into public.inventory_quantity_movements (
      inventory_id, previous_quantity, new_quantity, delta, actor_id, item_name, change_kind
    )
    values (NEW.id, prev, newq, d, auth.uid(), NEW.name, 'initial');
    return NEW;
  elsif tg_op = 'UPDATE' then
    prev := coalesce(OLD.quantity, 0);
    newq := coalesce(NEW.quantity, 0);
    if prev = newq then
      return NEW;
    end if;
    d := newq - prev;
    insert into public.inventory_quantity_movements (
      inventory_id, previous_quantity, new_quantity, delta, actor_id, item_name, change_kind
    )
    values (NEW.id, prev, newq, d, auth.uid(), NEW.name, 'adjust');
    return NEW;
  end if;
  return NEW;
end;
$$;

create or replace function public.log_inventory_item_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  prevq numeric(12, 2);
begin
  prevq := coalesce(OLD.quantity, 0);
  insert into public.inventory_quantity_movements (
    inventory_id,
    previous_quantity,
    new_quantity,
    delta,
    actor_id,
    item_name,
    change_kind
  )
  values (
    OLD.id,
    prevq,
    0,
    -prevq,
    auth.uid(),
    OLD.name,
    'item_deleted'
  );
  return OLD;
end;
$$;

drop trigger if exists trg_inventory_deleted on public.inventory;
create trigger trg_inventory_deleted
  before delete on public.inventory
  for each row
  execute function public.log_inventory_item_deleted();
