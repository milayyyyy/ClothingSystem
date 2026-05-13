-- Payroll salaries: align RLS with other admin modules (sub_admin could not insert/select salaries).

drop policy if exists salaries_select on public.salaries;
create policy salaries_select on public.salaries
  for select using (user_id = auth.uid() or public.is_admin_or_sub());

drop policy if exists salaries_admin_write on public.salaries;
create policy salaries_admin_write on public.salaries
  for all using (public.is_admin_or_sub()) with check (public.is_admin_or_sub());
