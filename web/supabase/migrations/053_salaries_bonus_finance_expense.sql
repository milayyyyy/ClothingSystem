-- Payroll payout: optional bonus, finance account used, link to expense row.

alter table public.salaries
  add column if not exists bonus_amount numeric(12,2) not null default 0;

alter table public.salaries
  add column if not exists finance_account_id uuid references public.finance_accounts(id) on delete set null;

alter table public.salaries
  add column if not exists expense_id uuid references public.expenses(id) on delete set null;

comment on column public.salaries.bonus_amount is 'Extra pay included in gross/net for this period (also reflected in linked expense).';
comment on column public.salaries.finance_account_id is 'Account debited when expense/finance transaction was recorded.';
comment on column public.salaries.expense_id is 'Salary expense row paired with this payout; deleting expense removes finance tx per app rules.';
