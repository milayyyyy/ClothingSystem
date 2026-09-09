-- Migration 101: add source column to order_records to separate manual vs POS entries
-- This lets Daily Order Records show a dedicated "POS Sales" section without conflicts.

alter table public.order_records
  add column if not exists source text not null default 'manual'
    check (source in ('manual', 'pos'));

create index if not exists order_records_source_idx on public.order_records (source);
