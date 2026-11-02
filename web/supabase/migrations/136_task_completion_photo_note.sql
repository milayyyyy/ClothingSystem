-- Completion notes + photo when a task is marked done.
-- Private bucket; admin/sub_admin and the task's assignees can read/write.

alter table public.tasks
  add column if not exists completion_note text;

alter table public.tasks
  add column if not exists completion_photo_path text;

comment on column public.tasks.completion_note is 'Optional note recorded when the task is marked done';
comment on column public.tasks.completion_photo_path is 'Object path inside storage bucket task-completions';

insert into storage.buckets (id, name, public)
select 'task-completions', 'task-completions', false
where not exists (select 1 from storage.buckets where id = 'task-completions');

create or replace function public.can_access_task_completion_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin_or_sub()
    or exists (
      select 1
      from public.task_assignees ta
      where ta.user_id = auth.uid()
        and ta.task_id::text = split_part(object_name, '/', 1)
    );
$$;

revoke all on function public.can_access_task_completion_object(text) from public;
grant execute on function public.can_access_task_completion_object(text) to authenticated;

drop policy if exists "task_completions_select" on storage.objects;
create policy "task_completions_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'task-completions'
    and public.can_access_task_completion_object(name)
  );

drop policy if exists "task_completions_insert" on storage.objects;
create policy "task_completions_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'task-completions'
    and public.can_access_task_completion_object(name)
  );

drop policy if exists "task_completions_update" on storage.objects;
create policy "task_completions_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'task-completions'
    and public.can_access_task_completion_object(name)
  )
  with check (
    bucket_id = 'task-completions'
    and public.can_access_task_completion_object(name)
  );

drop policy if exists "task_completions_delete" on storage.objects;
create policy "task_completions_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'task-completions'
    and public.can_access_task_completion_object(name)
  );
