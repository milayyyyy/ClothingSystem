-- Migration 099: Allow admins to delete any order record
-- Employees can only delete their own draft/rejected records (handled by existing update policy).
-- Attachments are deleted automatically via ON DELETE CASCADE on order_record_attachments.record_id.

drop policy if exists order_records_delete_admin on public.order_records;
create policy order_records_delete_admin on public.order_records
  for delete to authenticated
  using (public.is_admin_or_sub() and (
    -- allow deletion of any status; caller is responsible for confirming
    true
  ));

-- Attachments: also allow admins to delete (cascade covers it, but belt-and-suspenders)
drop policy if exists order_record_attachments_delete_admin on public.order_record_attachments;
create policy order_record_attachments_delete_admin on public.order_record_attachments
  for delete to authenticated
  using (
    public.is_admin_or_sub()
  );
