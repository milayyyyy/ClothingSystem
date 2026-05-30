-- Migration 090: align jersey-designs storage RLS with finance-qr (is_admin_or_sub + order editors)

drop policy if exists "jersey_designs_insert" on storage.objects;
create policy "jersey_designs_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'jersey-designs'
    and (
      public.is_admin_or_sub()
      or public.can_upload_jersey_designs()
    )
  );

drop policy if exists "jersey_designs_update" on storage.objects;
create policy "jersey_designs_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'jersey-designs'
    and (
      public.is_admin_or_sub()
      or public.can_upload_jersey_designs()
    )
  )
  with check (
    bucket_id = 'jersey-designs'
    and (
      public.is_admin_or_sub()
      or public.can_upload_jersey_designs()
    )
  );

drop policy if exists "jersey_designs_delete" on storage.objects;
create policy "jersey_designs_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'jersey-designs'
    and (
      public.is_admin_or_sub()
      or public.can_upload_jersey_designs()
    )
  );
