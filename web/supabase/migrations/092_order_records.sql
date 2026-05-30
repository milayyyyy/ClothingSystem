-- Migration 092: employee order records — PDF/photos + stock usage sheets for admin review

create table if not exists public.order_records (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid not null references public.profiles(id) on delete cascade,
  record_date date not null default (current_date),
  title text,
  notes text,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'approved', 'rejected')),
  stock_lines jsonb not null default '[]'::jsonb,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists order_records_submitted_by_idx on public.order_records (submitted_by);
create index if not exists order_records_status_idx on public.order_records (status);
create index if not exists order_records_record_date_idx on public.order_records (record_date desc);

comment on table public.order_records is 'Daily employee submissions: attachments + stock used; admin approves to deduct inventory.';
comment on column public.order_records.stock_lines is 'JSON array of manual usage sheets: {id, name, columns:[{id,label}], rows:[{id, cells:{colId:text}}]} — not linked to inventory';

create table if not exists public.order_record_attachments (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.order_records(id) on delete cascade,
  path text not null,
  file_name text not null,
  mime_type text,
  kind text not null check (kind in ('pdf', 'photo')),
  created_at timestamptz not null default now()
);

create index if not exists order_record_attachments_record_idx on public.order_record_attachments (record_id);

alter table public.order_records enable row level security;
alter table public.order_record_attachments enable row level security;

drop policy if exists order_records_select on public.order_records;
create policy order_records_select on public.order_records
  for select to authenticated
  using (submitted_by = auth.uid() or public.is_admin_or_sub());

drop policy if exists order_records_insert on public.order_records;
create policy order_records_insert on public.order_records
  for insert to authenticated
  with check (submitted_by = auth.uid());

drop policy if exists order_records_update_own on public.order_records;
create policy order_records_update_own on public.order_records
  for update to authenticated
  using (submitted_by = auth.uid() and status in ('draft', 'rejected'))
  with check (submitted_by = auth.uid() and status in ('draft', 'submitted'));

drop policy if exists order_records_update_admin on public.order_records;
create policy order_records_update_admin on public.order_records
  for update to authenticated
  using (public.is_admin_or_sub())
  with check (public.is_admin_or_sub());

drop policy if exists order_record_attachments_select on public.order_record_attachments;
create policy order_record_attachments_select on public.order_record_attachments
  for select to authenticated
  using (
    exists (
      select 1 from public.order_records r
      where r.id = record_id
        and (r.submitted_by = auth.uid() or public.is_admin_or_sub())
    )
  );

drop policy if exists order_record_attachments_insert on public.order_record_attachments;
create policy order_record_attachments_insert on public.order_record_attachments
  for insert to authenticated
  with check (
    exists (
      select 1 from public.order_records r
      where r.id = record_id
        and r.submitted_by = auth.uid()
        and r.status in ('draft', 'rejected')
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
        and r.status in ('draft', 'rejected')
    )
  );

insert into storage.buckets (id, name, public)
select 'order-record-attachments', 'order-record-attachments', false
where not exists (select 1 from storage.buckets where id = 'order-record-attachments');

drop policy if exists order_record_files_select on storage.objects;
create policy order_record_files_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'order-record-attachments'
    and (
      public.is_admin_or_sub()
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );

drop policy if exists order_record_files_insert on storage.objects;
create policy order_record_files_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'order-record-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists order_record_files_delete on storage.objects;
create policy order_record_files_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'order-record-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
