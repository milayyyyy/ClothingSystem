-- Store per-jersey-line-type prices for walk-in & online orders that use the
-- Teams & Jerseys sheet.  The key is "<name>|||<size>" and the value is the
-- unit price (numeric stored as float in JSON).

alter table public.orders
  add column if not exists jersey_line_prices jsonb not null default '{}'::jsonb;
