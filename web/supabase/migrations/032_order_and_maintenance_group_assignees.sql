-- Group assignees: orders (order_assignees) + maintenance schedules (maintenance_schedule_assignees).
-- Replaces single maintenance.assigned_employee_id with junction (data migrated then column dropped).

-- ---------------------------------------------------------------------------
-- Orders: multiple assignees (employees see order if listed here or legacy assigned_to)
-- ---------------------------------------------------------------------------
create table if not exists public.order_assignees (
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (order_id, user_id)
);

create index if not exists order_assignees_user_id_idx on public.order_assignees (user_id);

alter table public.order_assignees enable row level security;

drop policy if exists order_assignees_select on public.order_assignees;
create policy order_assignees_select on public.order_assignees
  for select using (
    public.is_admin_or_sub()
    or exists (
      select 1 from public.order_assignees oa_self
      where oa_self.order_id = order_assignees.order_id
        and oa_self.user_id = auth.uid()
    )
    or exists (
      select 1 from public.orders o
      where o.id = order_assignees.order_id
        and o.assigned_to = auth.uid()
    )
  );

drop policy if exists order_assignees_write on public.order_assignees;
create policy order_assignees_write on public.order_assignees
  for all using (public.is_admin_or_sub()) with check (public.is_admin_or_sub());

drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders
  for select using (
    public.is_admin_or_sub()
    or assigned_to = auth.uid()
    or exists (
      select 1 from public.order_assignees oa
      where oa.order_id = orders.id and oa.user_id = auth.uid()
    )
  );

-- Backfill: mirror legacy assigned_to into junction (idempotent)
insert into public.order_assignees (order_id, user_id)
select o.id, o.assigned_to
from public.orders o
where o.assigned_to is not null
on conflict (order_id, user_id) do nothing;

-- Activity log
drop trigger if exists trg_log_order_assignees on public.order_assignees;
create trigger trg_log_order_assignees
  after insert or update or delete on public.order_assignees
  for each row execute function public.log_activity();

-- ---------------------------------------------------------------------------
-- Maintenance schedules: group assignees (migrate from assigned_employee_id)
-- ---------------------------------------------------------------------------
create table if not exists public.maintenance_schedule_assignees (
  schedule_id uuid not null references public.maintenance_schedules(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (schedule_id, user_id)
);

create index if not exists maintenance_schedule_assignees_user_id_idx
  on public.maintenance_schedule_assignees (user_id);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'maintenance_schedules' and column_name = 'assigned_employee_id'
  ) then
    insert into public.maintenance_schedule_assignees (schedule_id, user_id)
    select m.id, m.assigned_employee_id
    from public.maintenance_schedules m
    where m.assigned_employee_id is not null
    on conflict (schedule_id, user_id) do nothing;
    alter table public.maintenance_schedules drop column assigned_employee_id;
  end if;
end $$;

drop index if exists maintenance_schedules_assigned_employee_id_idx;

alter table public.maintenance_schedule_assignees enable row level security;

drop policy if exists maintenance_schedule_assignees_select on public.maintenance_schedule_assignees;
create policy maintenance_schedule_assignees_select on public.maintenance_schedule_assignees
  for select using (
    public.is_admin_or_sub()
    or exists (
      select 1 from public.maintenance_schedule_assignees ms
      where ms.schedule_id = maintenance_schedule_assignees.schedule_id
        and ms.user_id = auth.uid()
    )
  );

drop policy if exists maintenance_schedule_assignees_write on public.maintenance_schedule_assignees;
create policy maintenance_schedule_assignees_write on public.maintenance_schedule_assignees
  for all using (public.is_admin_or_sub()) with check (public.is_admin_or_sub());

drop trigger if exists trg_log_maintenance_schedule_assignees on public.maintenance_schedule_assignees;
create trigger trg_log_maintenance_schedule_assignees
  after insert or update or delete on public.maintenance_schedule_assignees
  for each row execute function public.log_activity();
