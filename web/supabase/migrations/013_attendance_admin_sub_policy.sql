-- Let sub_admin manage attendance the same as other admin-area tables.
drop policy if exists attendance_self on public.attendance;
create policy attendance_self on public.attendance
  for all
  using (user_id = auth.uid() or public.is_admin_or_sub())
  with check (user_id = auth.uid() or public.is_admin_or_sub());
