-- Optional per-sheet low-stock floor when the grid has Qty but no Min/Reorder column.
alter table public.ready_made_boards
  add column if not exists low_stock_sheet_minimum integer;

alter table public.ready_made_boards
  drop constraint if exists ready_made_boards_low_stock_sheet_minimum_nonneg;

alter table public.ready_made_boards
  add constraint ready_made_boards_low_stock_sheet_minimum_nonneg
  check (low_stock_sheet_minimum is null or low_stock_sheet_minimum >= 0);

comment on column public.ready_made_boards.low_stock_sheet_minimum is
  'When set and the sheet has a quantity-style column but no min-style column, rows with qty at or below this value count as low stock. Ignored when a Min/Reorder column is present (per-row min is used).';
