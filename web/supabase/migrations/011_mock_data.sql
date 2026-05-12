-- =========================================================================
-- Migration 011: optional demo / mock rows for local UI (idempotent).
-- Safe to re-run: each insert is guarded by WHERE NOT EXISTS on a stable key.
-- =========================================================================

-- Suppliers ----------------------------------------------------------------
insert into public.suppliers (name, contact_person, phone, email, address, notes)
select 'Demo Fabrics Manila', 'Luis Cruz', '+63281230001', 'orders@demofabrics.test', 'Quezon City', 'Mock supplier for development'
where not exists (select 1 from public.suppliers where name = 'Demo Fabrics Manila');

insert into public.suppliers (name, contact_person, phone, email, notes)
select 'Demo Trim & Zipper Co.', 'Pat Reyes', '+63284445555', 'sales@demotrim.test', 'Mock supplier for development'
where not exists (select 1 from public.suppliers where name = 'Demo Trim & Zipper Co.');

insert into public.suppliers (name, contact_person, phone, notes)
select 'Demo Ink Supply PH', 'Alex Ng', '+639171234567', 'Mock supplier for development'
where not exists (select 1 from public.suppliers where name = 'Demo Ink Supply PH');

-- Inventory: Product / Material / Ready made product -----------------------
insert into public.inventory (
  name, category, item_type, quantity, unit, min_level, unit_cost, supplier, notes,
  store_id, product_store
)
select
  'Demo: Team jersey — sublimation print',
  'Product',
  'Jersey',
  24,
  'pcs',
  10,
  480,
  'Demo Fabrics Manila',
  'Shopee listing; mock data for filters.',
  (select id from public.stores where name = 'Shopee' limit 1),
  'Shopee'
where not exists (select 1 from public.inventory where name = 'Demo: Team jersey — sublimation print');

insert into public.inventory (
  name, category, item_type, quantity, unit, min_level, unit_cost, supplier, notes,
  store_id, product_store
)
select
  'Demo: Oversized tee — blank',
  'Product',
  'T-shirt',
  80,
  'pcs',
  40,
  185,
  'Demo Fabrics Manila',
  'Physical shop rack stock.',
  (select id from public.stores where name = 'Physical store' limit 1),
  null
where not exists (select 1 from public.inventory where name = 'Demo: Oversized tee — blank');

insert into public.inventory (
  name, category, item_type, quantity, unit, min_level, unit_cost, supplier, notes
)
select
  'Demo: Polyester fabric roll',
  'Material',
  'Fabric',
  3,
  'rolls',
  5,
  3200,
  'Demo Fabrics Manila',
  'Low vs minimum → shows Low Stock in UI.'
where not exists (select 1 from public.inventory where name = 'Demo: Polyester fabric roll');

insert into public.inventory (
  name, category, item_type, quantity, unit, min_level, unit_cost, supplier, notes
)
select
  'Demo: CMYK sublimation ink',
  'Material',
  'Ink',
  14,
  'liters',
  6,
  890,
  'Demo Ink Supply PH',
  'Between min and 1.5× min → Watch status.'
where not exists (select 1 from public.inventory where name = 'Demo: CMYK sublimation ink');

insert into public.inventory (
  name, category, item_type, quantity, unit, min_level, unit_cost, supplier, notes
)
select
  'Demo: Heavyweight hoodie — blank',
  'Ready made product',
  'Hoodie',
  18,
  'pcs',
  12,
  520,
  'Demo Fabrics Manila',
  'Ready-made blanks for rush orders.'
where not exists (select 1 from public.inventory where name = 'Demo: Heavyweight hoodie — blank');

insert into public.inventory (
  name, category, item_type, quantity, unit, min_level, unit_cost, supplier, notes
)
select
  'Demo: YKK zipper 8" black',
  'Material',
  'Trim',
  220,
  'pcs',
  100,
  12,
  'Demo Trim & Zipper Co.',
  'Consumables; healthy stock.'
where not exists (select 1 from public.inventory where name = 'Demo: YKK zipper 8" black');

insert into public.inventory (
  name, category, item_type, quantity, unit, min_level, unit_cost, supplier, notes
)
select
  'Demo: Dad cap — plain',
  'Ready made product',
  'Headwear',
  45,
  'pcs',
  20,
  95,
  'Demo Trim & Zipper Co.',
  'Caps for embroidery add-on.'
where not exists (select 1 from public.inventory where name = 'Demo: Dad cap — plain');

-- Orders -------------------------------------------------------------------
insert into public.orders (
  customer_name, customer_phone, order_type, kind, quantity, unit_price, status, notes, stage, sub_stage
)
select
  'Demo — Juana dela Cruz',
  '+639178889900',
  'sublimation',
  'sublimation',
  1,
  1250.00,
  'printing',
  'Mock sublimation order for dashboard.',
  'preparing',
  'printing'::sublimation_stage
where not exists (select 1 from public.orders where customer_name = 'Demo — Juana dela Cruz');

insert into public.orders (
  customer_name, customer_phone, order_type, kind, quantity, unit_price, status, notes, stage
)
select
  'Demo — Rico Mendoza',
  '+639199900011',
  'local',
  'local',
  12,
  350.00,
  'ready',
  'Mock local bulk order.',
  'preparing'
where not exists (select 1 from public.orders where customer_name = 'Demo — Rico Mendoza');

insert into public.orders (
  customer_name, customer_phone, order_type, kind, quantity, unit_price, status, notes, stage
)
select
  'Demo — Shopee Buyer 8821',
  '+639155500022',
  'online',
  'online',
  2,
  599.00,
  'pending',
  'Mock online channel order.',
  'preparing'
where not exists (select 1 from public.orders where customer_name = 'Demo — Shopee Buyer 8821');

-- Expenses -----------------------------------------------------------------
insert into public.expenses (expense_date, category, description, amount, notes)
select current_date - 5, 'Utilities', 'Demo: electricity (partial month)', 4180.50, 'mock-seed'
where not exists (select 1 from public.expenses where description = 'Demo: electricity (partial month)');

insert into public.expenses (expense_date, category, description, amount, notes)
select current_date - 2, 'Marketing', 'Demo: boosted post — FB', 1500.00, 'mock-seed'
where not exists (select 1 from public.expenses where description = 'Demo: boosted post — FB');

-- Tasks --------------------------------------------------------------------
insert into public.tasks (title, description, due_date, priority, status)
select
  'Demo: Receiving — count fabric rolls',
  'Mock task for task list UI.',
  current_date + 2,
  'normal',
  'open'
where not exists (select 1 from public.tasks where title = 'Demo: Receiving — count fabric rolls');

insert into public.tasks (title, description, due_date, priority, status)
select
  'Demo: Shopee — reply to 3 inquiries',
  'Mock ops task.',
  current_date,
  'high',
  'in_progress'
where not exists (select 1 from public.tasks where title = 'Demo: Shopee — reply to 3 inquiries');
