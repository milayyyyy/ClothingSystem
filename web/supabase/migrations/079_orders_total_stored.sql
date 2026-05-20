-- Allow order total to differ from quantity × unit_price (e.g. Shopee historical import:
-- unit_price = Products' Price Paid by Buyer, quantity = Number of Items in Order, total = buyer amount).

alter table public.orders
  alter column total drop expression if exists;

alter table public.orders
  alter column total set default 0;

create or replace function public.orders_sync_total()
returns trigger
language plpgsql
as $$
begin
  if new.total is null or new.total = 0 then
    new.total := coalesce(new.quantity, 0) * coalesce(new.unit_price, 0);
  end if;
  return new;
end;
$$;

drop trigger if exists orders_sync_total on public.orders;
create trigger orders_sync_total
  before insert or update of quantity, unit_price, total
  on public.orders
  for each row
  execute function public.orders_sync_total();

comment on column public.orders.total is
  'Order sale total. Usually quantity × unit_price; marketplace historical imports may set total to the buyer product amount.';
