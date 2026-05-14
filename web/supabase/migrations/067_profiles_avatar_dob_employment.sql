-- Migration 067: employee profile picture, date of birth, employment start

alter table public.profiles
  add column if not exists avatar_url        text,
  add column if not exists date_of_birth     date,
  add column if not exists employment_start  date;

-- Storage bucket for profile avatars
insert into storage.buckets (id, name, public)
select 'avatars', 'avatars', true
where not exists (select 1 from storage.buckets where id = 'avatars');

drop policy if exists "avatars_select"    on storage.objects;
drop policy if exists "avatars_insert"    on storage.objects;
drop policy if exists "avatars_update"    on storage.objects;
drop policy if exists "avatars_delete"    on storage.objects;

create policy "avatars_select"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "avatars_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars');

create policy "avatars_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars');

create policy "avatars_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatars');
