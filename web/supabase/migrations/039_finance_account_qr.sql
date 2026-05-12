-- Finance account details: account number + QR code (stored in public bucket).

alter table public.finance_accounts
  add column if not exists account_number text,
  add column if not exists qr_code_url text;

-- Public bucket for QR images
insert into storage.buckets (id, name, public)
select 'finance-qr', 'finance-qr', true
where not exists (select 1 from storage.buckets where id = 'finance-qr');

drop policy if exists "finance_qr_select" on storage.objects;
create policy "finance_qr_select"
  on storage.objects for select
  using (bucket_id = 'finance-qr');

drop policy if exists "finance_qr_insert" on storage.objects;
create policy "finance_qr_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'finance-qr'
    and public.is_admin_or_sub()
  );

drop policy if exists "finance_qr_update" on storage.objects;
create policy "finance_qr_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'finance-qr'
    and public.is_admin_or_sub()
  )
  with check (
    bucket_id = 'finance-qr'
    and public.is_admin_or_sub()
  );

drop policy if exists "finance_qr_delete" on storage.objects;
create policy "finance_qr_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'finance-qr'
    and public.is_admin_or_sub()
  );

