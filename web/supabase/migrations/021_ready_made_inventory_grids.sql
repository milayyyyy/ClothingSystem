-- =========================================================================
-- Migration 021: Ready made inventory — named boards with spreadsheet-style
-- rows, columns, and cells (customizable headers and row labels).
-- =========================================================================

create table if not exists public.ready_made_boards (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Untitled sheet',
  sort_order int not null default 0,
  created_at timestamptz default now()
);

create table if not exists public.ready_made_columns (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.ready_made_boards(id) on delete cascade,
  header_name text not null default 'Column',
  sort_order int not null default 0
);

create table if not exists public.ready_made_rows (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.ready_made_boards(id) on delete cascade,
  row_label text not null default 'Row',
  sort_order int not null default 0
);

create table if not exists public.ready_made_cells (
  id uuid primary key default gen_random_uuid(),
  row_id uuid not null references public.ready_made_rows(id) on delete cascade,
  column_id uuid not null references public.ready_made_columns(id) on delete cascade,
  value text not null default '',
  unique (row_id, column_id)
);

create index if not exists ready_made_columns_board_idx on public.ready_made_columns (board_id);
create index if not exists ready_made_rows_board_idx on public.ready_made_rows (board_id);
create index if not exists ready_made_cells_row_idx on public.ready_made_cells (row_id);
create index if not exists ready_made_cells_col_idx on public.ready_made_cells (column_id);

alter table public.ready_made_boards enable row level security;
alter table public.ready_made_columns enable row level security;
alter table public.ready_made_rows enable row level security;
alter table public.ready_made_cells enable row level security;

drop policy if exists ready_made_boards_select on public.ready_made_boards;
create policy ready_made_boards_select on public.ready_made_boards
  for select using (auth.role() = 'authenticated');

drop policy if exists ready_made_boards_write on public.ready_made_boards;
create policy ready_made_boards_write on public.ready_made_boards
  for all using (public.is_admin_or_sub()) with check (public.is_admin_or_sub());

drop policy if exists ready_made_columns_select on public.ready_made_columns;
create policy ready_made_columns_select on public.ready_made_columns
  for select using (auth.role() = 'authenticated');

drop policy if exists ready_made_columns_write on public.ready_made_columns;
create policy ready_made_columns_write on public.ready_made_columns
  for all using (public.is_admin_or_sub()) with check (public.is_admin_or_sub());

drop policy if exists ready_made_rows_select on public.ready_made_rows;
create policy ready_made_rows_select on public.ready_made_rows
  for select using (auth.role() = 'authenticated');

drop policy if exists ready_made_rows_write on public.ready_made_rows;
create policy ready_made_rows_write on public.ready_made_rows
  for all using (public.is_admin_or_sub()) with check (public.is_admin_or_sub());

drop policy if exists ready_made_cells_select on public.ready_made_cells;
create policy ready_made_cells_select on public.ready_made_cells
  for select using (auth.role() = 'authenticated');

drop policy if exists ready_made_cells_write on public.ready_made_cells;
create policy ready_made_cells_write on public.ready_made_cells
  for all using (public.is_admin_or_sub()) with check (public.is_admin_or_sub());

-- Activity log triggers
do $$
declare t text;
begin
  for t in select unnest(array[
    'ready_made_boards',
    'ready_made_columns',
    'ready_made_rows',
    'ready_made_cells'
  ]) loop
    execute format('drop trigger if exists trg_log_%I on public.%I', t, t);
    execute format(
      'create trigger trg_log_%I after insert or update or delete on public.%I for each row execute function public.log_activity()',
      t, t
    );
  end loop;
end $$;
