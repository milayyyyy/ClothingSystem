-- Migration 106: Pending inventory / ready-made restock orders.
-- Admin and manager only.

create table if not exists public.restock_orders (
  id                    uuid primary key default gen_random_uuid(),
  status                text not null default 'pending'
                        check (status in ('pending', 'completed')),
  kind                  text not null
                        check (kind in ('inventory', 'ready_made')),
  inventory_id          uuid references public.inventory(id) on delete set null,
  ready_made_row_id     uuid references public.ready_made_rows(id) on delete set null,
  ready_made_column_id  uuid references public.ready_made_columns(id) on delete set null,
  item_label            text not null,
  qty                   numeric(12,2) not null check (qty > 0),
  notes                 text,
  created_by            uuid references public.profiles(id) on delete set null,
  completed_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint restock_orders_target_check check (
    (kind = 'inventory' and inventory_id is not null)
    or (kind = 'ready_made' and ready_made_row_id is not null and ready_made_column_id is not null)
  )
);

create index if not exists restock_orders_status_idx on public.restock_orders (status);
create index if not exists restock_orders_kind_idx on public.restock_orders (kind);
create index if not exists restock_orders_created_idx on public.restock_orders (created_at desc);

alter table public.restock_orders enable row level security;

create policy "restock_orders_select"
  on public.restock_orders for select
  using (public.is_admin_or_sub());

create policy "restock_orders_insert"
  on public.restock_orders for insert
  with check (public.is_admin_or_sub());

create policy "restock_orders_update"
  on public.restock_orders for update
  using (public.is_admin_or_sub())
  with check (public.is_admin_or_sub());

create policy "restock_orders_delete"
  on public.restock_orders for delete
  using (public.is_admin_or_sub());

comment on table public.restock_orders is
  'Items currently on order / pending restock. Completing adds qty to inventory or a ready-made cell.';

do $$
begin
  if exists (select 1 from pg_proc where proname = 'log_activity') then
    execute 'drop trigger if exists trg_log_restock_orders on public.restock_orders';
    execute $t$
      create trigger trg_log_restock_orders
        after insert or update or delete on public.restock_orders
        for each row execute function public.log_activity()
    $t$;
  end if;
end $$;
