-- Finance account holder name (e.g. business/person name on the account).

alter table public.finance_accounts
  add column if not exists account_name text;

