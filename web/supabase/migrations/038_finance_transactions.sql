-- Finance transactions (money flow in/out) + account management fields.

alter table public.finance_accounts
  add column if not exists description text,
  add column if not exists opening_balance numeric(12,2) not null default 0;

-- Backfill opening_balance for existing rows where balance was manually set.
update public.finance_accounts
   set opening_balance = balance
 where opening_balance = 0 and balance <> 0;

do $$ begin
  create type public.finance_flow_direction as enum ('in','out');
exception when duplicate_object then null; end $$;

create table if not exists public.finance_transactions (
  id uuid primary key default gen_random_uuid(),
  occurred_at date not null default current_date,
  account_id uuid not null references public.finance_accounts(id) on delete cascade,
  direction public.finance_flow_direction not null,
  amount numeric(12,2) not null check (amount >= 0),
  description text not null default '',
  notes text,
  created_at timestamptz default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create index if not exists finance_tx_account_date_idx on public.finance_transactions (account_id, occurred_at desc);
create index if not exists finance_tx_occurred_at_idx on public.finance_transactions (occurred_at desc);

alter table public.finance_transactions enable row level security;

drop policy if exists finance_tx_select on public.finance_transactions;
create policy finance_tx_select on public.finance_transactions
  for select using (public.is_admin_or_sub());

drop policy if exists finance_tx_write on public.finance_transactions;
create policy finance_tx_write on public.finance_transactions
  for all using (public.is_admin_or_sub()) with check (public.is_admin_or_sub());

-- Keep finance_accounts.balance in sync: opening_balance + sum(in) - sum(out)
create or replace function public.recalc_finance_account_balance(p_account_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  ob numeric(12,2);
  net numeric(12,2);
begin
  select opening_balance into ob from public.finance_accounts where id = p_account_id;
  if ob is null then return; end if;

  select
    coalesce(sum(case
      when direction = 'in' then amount
      when direction = 'out' then -amount
      else 0
    end), 0)
  into net
  from public.finance_transactions
  where account_id = p_account_id;

  update public.finance_accounts
     set balance = (ob + net),
         updated_at = now()
   where id = p_account_id;
end $$;

create or replace function public.on_finance_tx_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT') then
    perform public.recalc_finance_account_balance(new.account_id);
    return new;
  elsif (tg_op = 'UPDATE') then
    if old.account_id <> new.account_id then
      perform public.recalc_finance_account_balance(old.account_id);
    end if;
    perform public.recalc_finance_account_balance(new.account_id);
    return new;
  elsif (tg_op = 'DELETE') then
    perform public.recalc_finance_account_balance(old.account_id);
    return old;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_finance_tx_recalc on public.finance_transactions;
create trigger trg_finance_tx_recalc
  after insert or update or delete on public.finance_transactions
  for each row execute function public.on_finance_tx_changed();

-- Recalc all balances once (safe)
do $$
declare r record;
begin
  for r in select id from public.finance_accounts loop
    perform public.recalc_finance_account_balance(r.id);
  end loop;
end $$;

do $$
declare t text := 'finance_transactions';
begin
  execute format('drop trigger if exists trg_log_%I on public.%I', t, t);
  execute format(
    'create trigger trg_log_%I after insert or update or delete on public.%I for each row execute function public.log_activity()',
    t, t
  );
end $$;

