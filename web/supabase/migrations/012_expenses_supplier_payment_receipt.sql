-- =========================================================================
-- Migration 012: expenses — supplier, paid-through, receipt file path
-- + private storage bucket for receipt images / PDFs
-- =========================================================================

alter table public.expenses
  add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;

alter table public.expenses
  add column if not exists paid_through text;

alter table public.expenses
  add column if not exists receipt_path text;

comment on column public.expenses.supplier_id is 'Optional vendor this expense was paid to';
comment on column public.expenses.paid_through is 'Payment channel (Cash, GCash, etc.)';
comment on column public.expenses.receipt_path is 'Object path inside storage bucket expense-receipts';

-- Storage bucket (private; 5 MB limit can be set in Dashboard if needed)
insert into storage.buckets (id, name, public)
select 'expense-receipts', 'expense-receipts', false
where not exists (select 1 from storage.buckets where id = 'expense-receipts');

-- RLS on storage.objects (admin / sub_admin only, same as expenses_write)
drop policy if exists "expense_receipts_select" on storage.objects;
create policy "expense_receipts_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'expense-receipts'
    and public.is_admin_or_sub()
  );

drop policy if exists "expense_receipts_insert" on storage.objects;
create policy "expense_receipts_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'expense-receipts'
    and public.is_admin_or_sub()
  );

drop policy if exists "expense_receipts_update" on storage.objects;
create policy "expense_receipts_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'expense-receipts'
    and public.is_admin_or_sub()
  )
  with check (
    bucket_id = 'expense-receipts'
    and public.is_admin_or_sub()
  );

drop policy if exists "expense_receipts_delete" on storage.objects;
create policy "expense_receipts_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'expense-receipts'
    and public.is_admin_or_sub()
  );
