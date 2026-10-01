-- Reseller order process indicator + send-to-account (assigned_to).
-- Admin/manager assign an account when leaving pending/checking for processing.
-- Employees see the checking queue plus orders sent to them.
-- Do NOT add employee to is_admin_or_sub().

alter table public.reseller_orders
  add column if not exists process text not null default 'pending_checking';
alter table public.reseller_orders
  add column if not exists assigned_to uuid references public.profiles(id) on delete set null;

alter table public.reseller_orders
  drop constraint if exists reseller_orders_process_ok;
alter table public.reseller_orders
  add constraint reseller_orders_process_ok
  check (process in (
    'draft',
    'pending_checking',
    'processing',
    'ready_to_ship',
    'completed',
    'cancelled'
  ));

create index if not exists reseller_orders_assigned_idx
  on public.reseller_orders (assigned_to, process);

update public.reseller_orders
  set process = 'cancelled'
  where status = 'cancelled' and process is distinct from 'cancelled';

update public.reseller_orders
  set process = 'processing'
  where status = 'confirmed' and process = 'pending_checking';

comment on column public.reseller_orders.process is
  'draft, pending_checking, processing, ready_to_ship, completed, cancelled.';
comment on column public.reseller_orders.assigned_to is
  'Staff account the order was sent to when moved into processing.';

create or replace function public.reseller_order_status_for_process(p text)
returns text language sql immutable as $$
  select case
    when p = 'cancelled' then 'cancelled'
    when p in ('processing', 'ready_to_ship', 'completed') then 'confirmed'
    else 'pending'
  end;
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
  new.process := 'pending_checking';
  new.assigned_to := null;
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

create or replace function public.reseller_orders_before_update()
returns trigger language plpgsql as $$
begin
  if public.is_reseller() and new.reseller_id = auth.uid() and not public.can_work_reseller_desk() then
    if old.status is distinct from new.status
       or old.process is distinct from new.process
       or old.assigned_to is distinct from new.assigned_to
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

  if not public.is_admin_or_sub() then
    if old.payment_status is distinct from new.payment_status
       or old.receipt_path is distinct from new.receipt_path
       or old.downpayment_percent is distinct from new.downpayment_percent
       or old.downpayment_amount is distinct from new.downpayment_amount then
      raise exception 'Only admin or manager can review downpayment';
    end if;
    if old.assigned_to is distinct from new.assigned_to then
      raise exception 'Only admin or manager can send an order to an account';
    end if;
    if old.process in ('draft', 'pending_checking')
       and new.process in ('processing', 'ready_to_ship', 'completed') then
      raise exception 'Only admin or manager can send this order to processing';
    end if;
  end if;

  if new.process in ('processing', 'ready_to_ship', 'completed')
     and new.payment_status is distinct from 'approved' then
    raise exception 'Downpayment receipt must be approved before this process';
  end if;

  if new.process in ('processing', 'ready_to_ship', 'completed')
     and old.process in ('draft', 'pending_checking', 'cancelled')
     and new.assigned_to is null then
    raise exception 'Select an account to send this order to';
  end if;

  new.status := public.reseller_order_status_for_process(new.process);
  return new;
end;
$$;

drop policy if exists reseller_orders_select on public.reseller_orders;
create policy reseller_orders_select on public.reseller_orders
  for select using (
    reseller_id = auth.uid()
    or public.is_admin_or_sub()
    or (
      public.is_employee()
      and (
        assigned_to = auth.uid()
        or process in ('draft', 'pending_checking')
      )
    )
  );

drop policy if exists reseller_orders_update on public.reseller_orders;
create policy reseller_orders_update on public.reseller_orders
  for update
  using (
    public.is_admin_or_sub()
    or (
      public.is_employee()
      and (
        assigned_to = auth.uid()
        or process in ('draft', 'pending_checking')
      )
    )
  )
  with check (
    public.is_admin_or_sub()
    or (
      public.is_employee()
      and (
        assigned_to = auth.uid()
        or process in ('draft', 'pending_checking', 'cancelled')
      )
    )
  );
