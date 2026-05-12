-- Optional classification and free-text notes per inventory row.
alter table public.inventory add column if not exists item_type text;
alter table public.inventory add column if not exists notes text;
