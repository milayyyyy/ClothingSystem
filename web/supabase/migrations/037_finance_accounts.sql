-- Finance accounts (bank / ewallet / cash) for balance snapshots.

create table if not exists public.finance_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('bank','ewallet','cash')),
  balance numeric(12,2) not null default 0,
  notes text,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists finance_accounts_kind_idx on public.finance_accounts (kind);
create index if not exists finance_accounts_name_idx on public.finance_accounts (name);

alter table public.finance_accounts enable row level security;

drop policy if exists finance_accounts_select on public.finance_accounts;
create policy finance_accounts_select on public.finance_accounts
  for select using (public.is_admin_or_sub());

drop policy if exists finance_accounts_write on public.finance_accounts;
create policy finance_accounts_write on public.finance_accounts
  for all using (public.is_admin_or_sub()) with check (public.is_admin_or_sub());

-- Seed defaults (safe to re-run)
insert into public.finance_accounts (name, kind, balance)
select v.name, v.kind, 0
from (values
  ('Bank', 'bank'),
  ('E-wallet', 'ewallet'),
  ('Cash', 'cash')
) as v(name, kind)
where not exists (
  select 1 from public.finance_accounts fa where fa.kind = v.kind and fa.name = v.name
);

do $$
declare t text := 'finance_accounts';
begin
  execute format('drop trigger if exists trg_log_%I on public.%I', t, t);
  execute format(
    'create trigger trg_log_%I after insert or update or delete on public.%I for each row execute function public.log_activity()',
    t, t
  );
end $$;

