-- Migration 102: add order_id to finance_transactions for proper order-payment linking
-- Going forward, payment collections reference orders via order_id FK.
-- Legacy rows still have the notes "order:{id}" pattern which the app also queries.

alter table public.finance_transactions
  add column if not exists order_id uuid references public.orders(id) on delete cascade;

create index if not exists finance_tx_order_id_idx on public.finance_transactions (order_id)
  where order_id is not null;

comment on column public.finance_transactions.order_id is
  'Order that generated this payment. Set by Collect Payment dialog. CASCADE DELETE removes this transaction when the order is deleted, triggering automatic balance recalculation.';
