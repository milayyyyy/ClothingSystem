-- Migration 108: Customizable content-planner stores (Likha, Mensahe, etc.).

create table if not exists public.content_stores (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  sort_order int  not null default 0,
  created_at timestamptz not null default now(),
  constraint content_stores_name_not_blank check (length(trim(name)) > 0)
);

create unique index if not exists content_stores_name_lower_uidx
  on public.content_stores (lower(trim(name)));

insert into public.content_stores (name, sort_order)
select v.name, v.sort_order
from (values
  ('Likha. Apparel', 1),
  ('Mensahe. Apparel', 2),
  ('Padayon. Apparel', 3),
  ('Drips. Apparel', 4)
) as v(name, sort_order)
where not exists (
  select 1 from public.content_stores t where lower(t.name) = lower(v.name)
);

alter table public.content_schedules
  add column if not exists content_store_id uuid references public.content_stores(id) on delete set null;

create index if not exists content_schedules_store_idx
  on public.content_schedules (content_store_id);

alter table public.content_stores enable row level security;

drop policy if exists content_stores_select on public.content_stores;
create policy content_stores_select on public.content_stores
  for select using (auth.role() = 'authenticated');

drop policy if exists content_stores_write on public.content_stores;
create policy content_stores_write on public.content_stores
  for all using (public.is_admin_or_sub()) with check (public.is_admin_or_sub());

do $$
begin
  if exists (select 1 from pg_proc where proname = 'log_activity') then
    execute 'drop trigger if exists trg_log_content_stores on public.content_stores';
    execute $t$
      create trigger trg_log_content_stores
        after insert or update or delete on public.content_stores
        for each row execute function public.log_activity()
    $t$;
  end if;
end $$;

comment on table public.content_stores is
  'Customizable Content Planner stores (Likha. Apparel, Mensahe. Apparel, plus user-defined).';
