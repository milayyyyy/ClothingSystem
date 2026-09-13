-- =========================================================================
-- Migration 109: Media Management account
-- Limited employee-style workspace + Content Planner write access.
-- Do NOT add media to is_admin_or_sub() — that would open inventory/finance.
-- =========================================================================

-- 1. Add media to the user_role enum
do $$ begin
  if not exists (select 1 from pg_enum where enumlabel = 'media' and enumtypid = 'user_role'::regtype) then
    alter type user_role add value 'media';
  end if;
end $$;
commit;

-- 2. Helpers for Content Planner tables only
create or replace function public.is_media()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'media'
  );
$$;

create or replace function public.is_content_planner()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin_or_sub() or public.is_media();
$$;

-- 3. Content Planner write policies (tables may be missing if 104–108 were not run)
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'content_schedules') then
    execute 'drop policy if exists content_schedules_write on public.content_schedules';
    execute $p$
      create policy content_schedules_write on public.content_schedules
        for all using (public.is_content_planner()) with check (public.is_content_planner())
    $p$;
  end if;

  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'content_types') then
    execute 'drop policy if exists content_types_write on public.content_types';
    execute $p$
      create policy content_types_write on public.content_types
        for all using (public.is_content_planner()) with check (public.is_content_planner())
    $p$;
  end if;

  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'content_stores') then
    execute 'drop policy if exists content_stores_write on public.content_stores';
    execute $p$
      create policy content_stores_write on public.content_stores
        for all using (public.is_content_planner()) with check (public.is_content_planner())
    $p$;
  end if;

  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'reminders') then
    execute 'drop policy if exists "reminders_select" on public.reminders';
    execute $p$
      create policy "reminders_select"
        on public.reminders for select
        using (public.is_content_planner())
    $p$;
    execute 'drop policy if exists "reminders_insert" on public.reminders';
    execute $p$
      create policy "reminders_insert"
        on public.reminders for insert
        with check (public.is_content_planner())
    $p$;
    execute 'drop policy if exists "reminders_update" on public.reminders';
    execute $p$
      create policy "reminders_update"
        on public.reminders for update
        using  (public.is_content_planner())
        with check (public.is_content_planner())
    $p$;
    execute 'drop policy if exists "reminders_delete" on public.reminders';
    execute $p$
      create policy "reminders_delete"
        on public.reminders for delete
        using (public.is_content_planner())
    $p$;
  end if;
end $$;
