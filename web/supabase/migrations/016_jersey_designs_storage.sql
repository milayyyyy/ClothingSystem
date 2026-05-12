-- =========================================================================
-- Migration 016: public storage bucket for sublimation jersey design images
-- design_image_url continues to store the public object URL after upload.
-- =========================================================================

insert into storage.buckets (id, name, public)
select 'jersey-designs', 'jersey-designs', true
where not exists (select 1 from storage.buckets where id = 'jersey-designs');

drop policy if exists "jersey_designs_select" on storage.objects;
create policy "jersey_designs_select"
  on storage.objects for select
  using (bucket_id = 'jersey-designs');

drop policy if exists "jersey_designs_insert" on storage.objects;
create policy "jersey_designs_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'jersey-designs'
    and public.is_admin_or_sub()
  );

drop policy if exists "jersey_designs_update" on storage.objects;
create policy "jersey_designs_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'jersey-designs'
    and public.is_admin_or_sub()
  )
  with check (
    bucket_id = 'jersey-designs'
    and public.is_admin_or_sub()
  );

drop policy if exists "jersey_designs_delete" on storage.objects;
create policy "jersey_designs_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'jersey-designs'
    and public.is_admin_or_sub()
  );
