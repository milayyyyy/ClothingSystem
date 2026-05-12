-- Align orders SELECT policy with staff roles (sub_admin) and assignee read access.
-- Previously orders_select used is_admin() only; orders_write already used is_admin_or_sub().
-- Assignees still only see rows where assigned_to = auth.uid().

drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders
  for select using (
    public.is_admin_or_sub()
    or assigned_to = auth.uid()
  );
