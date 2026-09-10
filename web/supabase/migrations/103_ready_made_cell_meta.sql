-- Migration 103: Cell description — one free-text description per cell
-- so the activity log can show what each cell represents without extra JOINs.

alter table public.ready_made_cells
  add column if not exists description       text,
  -- Denormalised caches: updated whenever the cell value is saved from the client
  add column if not exists board_name_cache  text,
  add column if not exists row_label_cache   text,
  add column if not exists col_header_cache  text;

comment on column public.ready_made_cells.description      is 'Optional description for this cell (e.g. "Jersey XS Blue").';
comment on column public.ready_made_cells.board_name_cache is 'Cached board name at last save — used for readable activity log context.';
comment on column public.ready_made_cells.row_label_cache  is 'Cached row label at last save — used for readable activity log context.';
comment on column public.ready_made_cells.col_header_cache is 'Cached column header at last save — used for readable activity log context.';
