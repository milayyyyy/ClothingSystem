-- Allow expense money-flow rows with no finance account (Paid through = None).
-- Those rows appear in Finance In/Out with blank amounts and do not change balances.

alter table public.finance_transactions
  alter column account_id drop not null;

comment on column public.finance_transactions.account_id is
  'Finance account for this flow. Null when an expense is recorded with Paid through = None (ledger row only, amount 0, no balance change).';

create or replace function public.recalc_finance_account_balance(p_account_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  ob numeric(12,2);
  net numeric(12,2);
begin
  if p_account_id is null then return; end if;
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
    if new.account_id is not null then
      perform public.recalc_finance_account_balance(new.account_id);
    end if;
    return new;
  elsif (tg_op = 'UPDATE') then
    if old.account_id is not null and (new.account_id is null or old.account_id <> new.account_id) then
      perform public.recalc_finance_account_balance(old.account_id);
    end if;
    if new.account_id is not null then
      perform public.recalc_finance_account_balance(new.account_id);
    end if;
    return new;
  elsif (tg_op = 'DELETE') then
    if old.account_id is not null then
      perform public.recalc_finance_account_balance(old.account_id);
    end if;
    return old;
  end if;
  return coalesce(new, old);
end $$;

-- Existing expenses logged with Paid through None had no finance row.
insert into public.finance_transactions (
  occurred_at, account_id, direction, amount, description, notes, expense_id
)
select
  e.expense_date,
  null,
  'out',
  0,
  concat(
    'Expense: ',
    e.category,
    case
      when coalesce(trim(e.description), '') <> '' then concat(' — ', left(trim(e.description), 120))
      else ''
    end
  ),
  concat('expense:', e.id),
  e.id
from public.expenses e
where e.finance_account_id is null
  and not exists (
    select 1 from public.finance_transactions t where t.expense_id = e.id
  );
