-- BigSeller pick list header "Printed Time: …" captured at PDF import for filtering and audit.

alter table public.orders add column if not exists bigseller_printed_at timestamptz;

comment on column public.orders.bigseller_printed_at is 'Wall time from BigSeller PDF "Printed Time:" line when the order was imported from a pick list.';
