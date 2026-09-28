-- Link money-in ledger rows to a Sales list (manual_sales) record.

alter table public.finance_transactions
  add column if not exists manual_sale_id uuid references public.manual_sales(id) on delete set null;

create index if not exists finance_tx_manual_sale_id_idx
  on public.finance_transactions (manual_sale_id)
  where manual_sale_id is not null;

comment on column public.finance_transactions.manual_sale_id is
  'Sales list row created with this money-in entry. Deleting the sale unlinks the transaction; deleting the transaction does not remove the sale.';
