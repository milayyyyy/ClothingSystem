-- Manual sales (cash, walk-ins, adjustments) attributed to a channel; rolls into Sales & expenses totals.

create table if not exists public.manual_sales (
  id uuid primary key default gen_random_uuid(),
  sale_date date not null default (current_date),
  amount numeric(12,2) not null check (amount >= 0),
  description text not null default '',
  channel public.order_kind not null default 'local',
  notes text,
  created_at timestamptz default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create index if not exists manual_sales_sale_date_idx on public.manual_sales (sale_date desc);

alter table public.manual_sales enable row level security;

drop policy if exists manual_sales_select on public.manual_sales;
create policy manual_sales_select on public.manual_sales
  for select using (public.is_admin_or_sub());

drop policy if exists manual_sales_write on public.manual_sales;
create policy manual_sales_write on public.manual_sales
  for all using (public.is_admin_or_sub()) with check (public.is_admin_or_sub());

do $$
declare t text := 'manual_sales';
begin
  execute format('drop trigger if exists trg_log_%I on public.%I', t, t);
  execute format(
    'create trigger trg_log_%I after insert or update or delete on public.%I for each row execute function public.log_activity()',
    t, t
  );
end $$;
