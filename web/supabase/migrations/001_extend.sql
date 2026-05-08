-- =========================================================================
-- Migration 001: extend roles, order types, suppliers, tasks, activity logs
-- Run AFTER schema.sql. Idempotent — safe to re-run.
-- =========================================================================

-- 1. Add sub_admin role (must commit before being usable in policies) ---
do $$ begin
  if not exists (select 1 from pg_enum where enumlabel = 'sub_admin' and enumtypid = 'user_role'::regtype) then
    alter type user_role add value 'sub_admin';
  end if;
end $$;
commit;

-- 2. Helper functions (define BEFORE any policy that uses them) ---------
create or replace function public.is_admin_or_sub()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','sub_admin'));
$$;

-- 3. Order type & sublimation stage enums -------------------------------
do $$ begin
  create type order_kind as enum ('local', 'online', 'sublimation');
exception when duplicate_object then null; end $$;

do $$ begin
  create type sublimation_stage as enum (
    'design_layout','printing','heatpress','cut_sew','quality_control','for_pickup'
  );
exception when duplicate_object then null; end $$;

-- 4. Extend orders ------------------------------------------------------
alter table public.orders
  add column if not exists kind order_kind default 'local',
  add column if not exists source text,
  add column if not exists customer_email text,
  add column if not exists customer_social text,
  add column if not exists sub_stage sublimation_stage;

update public.orders
   set kind = case
                when order_type ilike 'sublim%' then 'sublimation'::order_kind
                when order_type = 'online' then 'online'::order_kind
                else 'local'::order_kind
              end
 where kind is null;

-- 5. Add notes column to expenses ---------------------------------------
alter table public.expenses add column if not exists notes text;

-- 6. Suppliers ----------------------------------------------------------
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_person text,
  phone text,
  email text,
  address text,
  notes text,
  created_at timestamptz default now()
);

alter table public.suppliers enable row level security;
drop policy if exists suppliers_read on public.suppliers;
create policy suppliers_read on public.suppliers
  for select using (auth.role() = 'authenticated');
drop policy if exists suppliers_write on public.suppliers;
create policy suppliers_write on public.suppliers
  for all using (public.is_admin_or_sub()) with check (public.is_admin_or_sub());

-- 7. Activity log -------------------------------------------------------
create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role user_role,
  action text not null,
  entity text not null,
  entity_id text,
  summary text,
  payload jsonb,
  created_at timestamptz default now()
);

alter table public.activity_logs enable row level security;

drop policy if exists activity_select on public.activity_logs;
create policy activity_select on public.activity_logs
  for select using (public.is_admin_or_sub());

drop policy if exists activity_insert on public.activity_logs;
create policy activity_insert on public.activity_logs
  for insert with check (auth.uid() is not null);

drop policy if exists activity_delete on public.activity_logs;
create policy activity_delete on public.activity_logs
  for delete using (public.is_admin());

-- 8. Tasks --------------------------------------------------------------
do $$ begin
  create type task_status as enum ('open','in_progress','done','cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  due_date date,
  priority text default 'normal',
  status task_status default 'open',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  completed_at timestamptz
);

create table if not exists public.task_assignees (
  task_id uuid references public.tasks(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  primary key (task_id, user_id)
);

alter table public.tasks enable row level security;
alter table public.task_assignees enable row level security;

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select using (
    public.is_admin_or_sub() or
    exists (select 1 from public.task_assignees ta where ta.task_id = id and ta.user_id = auth.uid())
  );

drop policy if exists tasks_admin_write on public.tasks;
create policy tasks_admin_write on public.tasks
  for all using (public.is_admin_or_sub()) with check (public.is_admin_or_sub());

drop policy if exists tasks_assignee_status on public.tasks;
create policy tasks_assignee_status on public.tasks
  for update using (exists (select 1 from public.task_assignees ta where ta.task_id = id and ta.user_id = auth.uid()))
            with check (exists (select 1 from public.task_assignees ta where ta.task_id = id and ta.user_id = auth.uid()));

drop policy if exists task_assignees_select on public.task_assignees;
create policy task_assignees_select on public.task_assignees
  for select using (public.is_admin_or_sub() or user_id = auth.uid());

drop policy if exists task_assignees_admin on public.task_assignees;
create policy task_assignees_admin on public.task_assignees
  for all using (public.is_admin_or_sub()) with check (public.is_admin_or_sub());

-- 9. Activity log trigger ----------------------------------------------
create or replace function public.log_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  rolev user_role;
  pid text;
  summ text;
begin
  if uid is null then return coalesce(new, old); end if;
  select role into rolev from public.profiles where id = uid;
  pid := coalesce((to_jsonb(new)->>'id'), (to_jsonb(old)->>'id'));
  summ := tg_table_name || ' ' || lower(tg_op);
  insert into public.activity_logs (actor_id, actor_role, action, entity, entity_id, summary, payload)
  values (
    uid, rolev, tg_op, tg_table_name, pid, summ,
    case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  for t in select unnest(array['orders','inventory','expenses','suppliers','salaries','tasks']) loop
    execute format('drop trigger if exists trg_log_%I on public.%I', t, t);
    execute format('create trigger trg_log_%I after insert or update or delete on public.%I for each row execute function public.log_activity()', t, t);
  end loop;
end $$;

-- 10. Expand existing policies for sub_admin ---------------------------
drop policy if exists inventory_admin_write on public.inventory;
drop policy if exists inventory_write on public.inventory;
create policy inventory_write on public.inventory
  for all using (public.is_admin_or_sub()) with check (public.is_admin_or_sub());

drop policy if exists orders_admin_write on public.orders;
drop policy if exists orders_write on public.orders;
create policy orders_write on public.orders
  for all using (public.is_admin_or_sub()) with check (public.is_admin_or_sub());

drop policy if exists expenses_admin on public.expenses;
drop policy if exists expenses_write on public.expenses;
create policy expenses_write on public.expenses
  for all using (public.is_admin_or_sub()) with check (public.is_admin_or_sub());

-- 11. Seed suppliers ---------------------------------------------------
insert into public.suppliers (name, contact_person, phone, email)
values
  ('TexMart',     'Anna Cruz',   '0917-555-0111', 'sales@texmart.ph'),
  ('InkPro',      'Mark Santos', '0917-555-0222', 'orders@inkpro.ph'),
  ('PaperHub',    'Liza Reyes',  '0917-555-0333', 'paperhub@gmail.com'),
  ('TrimWorld',   'Ben Lopez',   '0917-555-0444', 'trimworld@gmail.com')
on conflict do nothing;
