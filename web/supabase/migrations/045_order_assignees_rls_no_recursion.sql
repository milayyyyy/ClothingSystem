-- Fix: "infinite recursion detected in policy for relation order_assignees"
-- RLS policies must not subquery the same table (or orders↔order_assignees) in a way that
-- re-enters policy evaluation. Use SECURITY DEFINER helpers with row_security off for checks.

create or replace function public.order_assignee_row_visible(p_order_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select
    auth.uid() is not null
    and (
      public.is_admin_or_sub()
      or p_user_id = auth.uid()
      or exists (
        select 1 from public.order_assignees oa
        where oa.order_id = p_order_id and oa.user_id = auth.uid()
      )
    );
$$;

grant execute on function public.order_assignee_row_visible(uuid, uuid) to authenticated;

drop policy if exists order_assignees_select on public.order_assignees;
create policy order_assignees_select on public.order_assignees
  for select using (public.order_assignee_row_visible(order_id, user_id));

-- Same pattern on maintenance junction (avoids latent recursion).
create or replace function public.maintenance_schedule_assignee_row_visible(p_schedule_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select
    auth.uid() is not null
    and (
      public.is_admin_or_sub()
      or p_user_id = auth.uid()
      or exists (
        select 1 from public.maintenance_schedule_assignees ms
        where ms.schedule_id = p_schedule_id and ms.user_id = auth.uid()
      )
    );
$$;

grant execute on function public.maintenance_schedule_assignee_row_visible(uuid, uuid) to authenticated;

drop policy if exists maintenance_schedule_assignees_select on public.maintenance_schedule_assignees;
create policy maintenance_schedule_assignees_select on public.maintenance_schedule_assignees
  for select using (public.maintenance_schedule_assignee_row_visible(schedule_id, user_id));
