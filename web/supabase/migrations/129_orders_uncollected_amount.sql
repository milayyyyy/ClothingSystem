-- Remaining balance the owner agrees not to collect (goodwill / write-off).
-- Does not credit a finance account; cash collected still lives in down_payment.

alter table public.orders
  add column if not exists uncollected_amount numeric(12,2) not null default 0;

alter table public.orders
  add column if not exists uncollected_note text;

comment on column public.orders.uncollected_amount is
  'Balance the owner chose not to collect (goodwill). Collectible remaining = total - down_payment - uncollected_amount.';

comment on column public.orders.uncollected_note is
  'Optional reason for the uncollected/goodwill write-off.';
