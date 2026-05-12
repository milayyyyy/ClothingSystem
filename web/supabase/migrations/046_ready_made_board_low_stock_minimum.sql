-- Per-sheet toggle: use Qty vs Min column headers for low-stock counts / filter / row highlight.
alter table public.ready_made_boards
  add column if not exists low_stock_minimum_enabled boolean not null default true;

comment on column public.ready_made_boards.low_stock_minimum_enabled is
  'When true, this sheet participates in low-stock detection (Qty/Min-style columns). When false, counts and highlighting are off.';
