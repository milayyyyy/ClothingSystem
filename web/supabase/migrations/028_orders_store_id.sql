-- Link orders to a channel store (e.g. BigSeller PDF "Likha. Tiktok" → stores row).
alter table public.orders
  add column if not exists store_id uuid references public.stores(id) on delete set null;

create index if not exists orders_store_id_idx on public.orders (store_id);
