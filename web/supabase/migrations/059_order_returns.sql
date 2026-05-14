-- Add return tracking columns to orders
alter table public.orders
  add column if not exists return_status text check (return_status in ('returning','returned')),
  add column if not exists return_reason text,
  add column if not exists return_inventory_type text check (return_inventory_type in ('inventory','ready_made')),
  add column if not exists return_inventory_ref jsonb;
-- return_inventory_ref stores: { item_id, item_name, quantity, board_id, row_id, col_id } depending on type
