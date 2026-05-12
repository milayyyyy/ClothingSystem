-- Expenses: optional link to finance account; transactions link back for balance + delete cascade.

alter table public.expenses
  add column if not exists finance_account_id uuid references public.finance_accounts(id) on delete set null;

create index if not exists expenses_finance_account_id_idx on public.expenses (finance_account_id);

comment on column public.expenses.finance_account_id is 'Finance account debited when the expense is recorded (paired finance_transactions row).';

alter table public.finance_transactions
  add column if not exists expense_id uuid references public.expenses(id) on delete cascade;

create unique index if not exists finance_transactions_one_row_per_expense
  on public.finance_transactions (expense_id)
  where expense_id is not null;

comment on column public.finance_transactions.expense_id is 'Expense that created this flow; deleting the expense removes this transaction and recalculates the account balance.';
