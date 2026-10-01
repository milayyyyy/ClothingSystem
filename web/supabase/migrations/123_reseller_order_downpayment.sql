-- Reseller orders require a downpayment (default 30%) and a receipt photo
-- reviewed by admin/manager. Percent is per reseller account on profiles.
-- Do NOT add employee to is_admin_or_sub().

alter table public.profiles
  add column if not exists downpayment_percent numeric(5,2) not null default 30;

alter table public.profiles
  drop constraint if exists profiles_downpayment_percent_ok;
alter table public.profiles
  add constraint profiles_downpayment_percent_ok
  check (downpayment_percent >= 0 and downpayment_percent <= 100);

comment on column public.profiles.downpayment_percent is
  'Reseller downpayment percent of order total. Default 30. Admin/manager editable.';

alter table public.reseller_orders
  add column if not exists downpayment_percent numeric(5,2) not null default 30;
alter table public.reseller_orders
  add column if not exists downpayment_amount numeric(12,2) not null default 0;
alter table public.reseller_orders
  add column if not exists receipt_path text;
alter table public.reseller_orders
  add column if not exists payment_status text not null default 'pending_review';

alter table public.reseller_orders
  drop constraint if exists reseller_orders_payment_status_ok;
alter table public.reseller_orders
  add constraint reseller_orders_payment_status_ok
  check (payment_status in ('pending_review', 'approved', 'rejected'));

alter table public.reseller_orders
  drop constraint if exists reseller_orders_downpayment_percent_ok;
alter table public.reseller_orders
  add constraint reseller_orders_downpayment_percent_ok
  check (downpayment_percent >= 0 and downpayment_percent <= 100);

-- Existing orders already placed without this flow can still be confirmed.
update public.reseller_orders
  set payment_status = 'approved'
  where receipt_path is null
    and payment_status = 'pending_review';

create or replace function public.reseller_order_items_total(items jsonb)
returns numeric language sql immutable as $$
  select coalesce(sum(
    coalesce((e->>'price')::numeric, 0) * coalesce((e->>'qty')::numeric, 0)
  ), 0)
  from jsonb_array_elements(coalesce(items, '[]'::jsonb)) e
$$;

create or replace function public.reseller_orders_before_insert()
returns trigger language plpgsql as $$
declare
  pct numeric;
  total numeric;
begin
  select downpayment_percent into pct from public.profiles where id = new.reseller_id;
  if pct is null then pct := 30; end if;
  if pct < 0 then pct := 0; end if;
  if pct > 100 then pct := 100; end if;
  total := public.reseller_order_items_total(new.items);
  new.downpayment_percent := pct;
  new.downpayment_amount := round(total * pct / 100.0, 2);
  new.status := 'pending';
  if new.downpayment_amount > 0 then
    if new.receipt_path is null or length(trim(new.receipt_path)) = 0 then
      raise exception 'Upload a downpayment receipt to place this order';
    end if;
    new.payment_status := 'pending_review';
  else
    new.payment_status := 'approved';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reseller_orders_before_insert on public.reseller_orders;
create trigger trg_reseller_orders_before_insert
  before insert on public.reseller_orders
  for each row execute function public.reseller_orders_before_insert();

create or replace function public.reseller_orders_before_update()
returns trigger language plpgsql as $$
begin
  if new.status = 'confirmed' and new.payment_status is distinct from 'approved' then
    raise exception 'Downpayment receipt must be approved before confirming this order';
  end if;

  if public.is_admin_or_sub() then
    return new;
  end if;

  if public.is_reseller() and new.reseller_id = auth.uid() then
    if old.status is distinct from new.status
       or old.items is distinct from new.items
       or old.notes is distinct from new.notes
       or old.reseller_id is distinct from new.reseller_id
       or old.downpayment_percent is distinct from new.downpayment_percent
       or old.downpayment_amount is distinct from new.downpayment_amount then
      raise exception 'Resellers can only replace a rejected downpayment receipt';
    end if;
    if old.payment_status is distinct from 'rejected' then
      raise exception 'Resellers can only replace a rejected downpayment receipt';
    end if;
    if new.payment_status is distinct from 'pending_review' then
      raise exception 'Replacement receipt goes back to pending review';
    end if;
    if new.receipt_path is null or length(trim(new.receipt_path)) = 0 then
      raise exception 'Receipt photo is required';
    end if;
    return new;
  end if;

  if old.payment_status is distinct from new.payment_status
     or old.receipt_path is distinct from new.receipt_path
     or old.downpayment_percent is distinct from new.downpayment_percent
     or old.downpayment_amount is distinct from new.downpayment_amount then
    raise exception 'Only admin or manager can review downpayment';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reseller_orders_before_update on public.reseller_orders;
create trigger trg_reseller_orders_before_update
  before update on public.reseller_orders
  for each row execute function public.reseller_orders_before_update();

drop policy if exists reseller_orders_update_own_receipt on public.reseller_orders;
create policy reseller_orders_update_own_receipt on public.reseller_orders
  for update
  using (public.is_reseller() and reseller_id = auth.uid() and payment_status = 'rejected' and status = 'pending')
  with check (public.is_reseller() and reseller_id = auth.uid() and payment_status = 'pending_review' and status = 'pending');

create or replace function public.profiles_downpayment_guard()
returns trigger language plpgsql as $$
begin
  if old.downpayment_percent is not distinct from new.downpayment_percent then
    return new;
  end if;
  if public.is_admin_or_sub() or auth.uid() is null then
    return new;
  end if;
  raise exception 'Only admin or manager can change downpayment percent';
end;
$$;

drop trigger if exists trg_profiles_downpayment_guard on public.profiles;
create trigger trg_profiles_downpayment_guard
  before update on public.profiles
  for each row execute function public.profiles_downpayment_guard();

insert into storage.buckets (id, name, public)
select 'reseller-order-receipts', 'reseller-order-receipts', false
where not exists (select 1 from storage.buckets where id = 'reseller-order-receipts');

drop policy if exists reseller_order_receipts_select on storage.objects;
create policy reseller_order_receipts_select
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'reseller-order-receipts'
    and (
      public.can_work_reseller_desk()
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );

drop policy if exists reseller_order_receipts_insert on storage.objects;
create policy reseller_order_receipts_insert
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'reseller-order-receipts'
    and public.is_reseller()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists reseller_order_receipts_update on storage.objects;
create policy reseller_order_receipts_update
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'reseller-order-receipts'
    and public.is_reseller()
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'reseller-order-receipts'
    and public.is_reseller()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists reseller_order_receipts_delete on storage.objects;
create policy reseller_order_receipts_delete
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'reseller-order-receipts'
    and (
      public.is_admin_or_sub()
      or (public.is_reseller() and (storage.foldername(name))[1] = auth.uid()::text)
    )
  );

comment on column public.reseller_orders.payment_status is
  'Downpayment receipt review: pending_review, approved, or rejected.';
comment on column public.reseller_orders.receipt_path is
  'Object path inside storage bucket reseller-order-receipts.';
