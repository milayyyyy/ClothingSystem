-- Balance = opening_balance + sum(in) − sum(out). Transaction triggers already recalc
-- after money-flow changes; opening_balance edits did not, so the UI "Save" looked broken.

create or replace function public.trg_finance_account_recalc_from_opening()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recalc_finance_account_balance(new.id);
  return new;
end;
$$;

drop trigger if exists trg_finance_account_recalc_balance on public.finance_accounts;
create trigger trg_finance_account_recalc_balance
  after insert or update of opening_balance on public.finance_accounts
  for each row
  execute function public.trg_finance_account_recalc_from_opening();
