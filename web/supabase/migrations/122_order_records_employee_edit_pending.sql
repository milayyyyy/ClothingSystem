-- Employees can edit their own order records while pending review (submitted).
-- Once approved, only admin/manager can update.

drop policy if exists order_records_update_own on public.order_records;
create policy order_records_update_own on public.order_records
  for update to authenticated
  using (submitted_by = auth.uid() and status in ('draft', 'submitted', 'rejected'))
  with check (submitted_by = auth.uid() and status in ('draft', 'submitted'));

drop policy if exists order_record_attachments_insert on public.order_record_attachments;
create policy order_record_attachments_insert on public.order_record_attachments
  for insert to authenticated
  with check (
    exists (
      select 1 from public.order_records r
      where r.id = record_id
        and r.submitted_by = auth.uid()
        and r.status in ('draft', 'submitted', 'rejected')
    )
  );

drop policy if exists order_record_attachments_delete on public.order_record_attachments;
create policy order_record_attachments_delete on public.order_record_attachments
  for delete to authenticated
  using (
    exists (
      select 1 from public.order_records r
      where r.id = record_id
        and r.submitted_by = auth.uid()
        and r.status in ('draft', 'submitted', 'rejected')
    )
  );
