-- =========================================================================
-- Migration 128: Add attendance role
-- A kiosk-style account for Face ID employee time-in/out recording.
-- The attendance account can read attendance rows and profiles (for face
-- matching) but cannot modify anything else.
-- Do NOT add attendance to is_admin_or_sub().
-- =========================================================================

-- 1. Add attendance to the user_role enum
do $$ begin
  if not exists (select 1 from pg_enum where enumlabel = 'attendance' and enumtypid = 'user_role'::regtype) then
    alter type user_role add value 'attendance';
  end if;
end $$;
commit;

-- 2. Helper function
create or replace function public.is_attendance_role()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'attendance'
  );
$$;

-- 3. Attendance accounts need SELECT on attendance (to show today's list)
-- and INSERT/UPDATE to record time-in/out.
-- Existing RLS policies already allow admin/sub; add attendance-specific ones.
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'attendance') then
    execute 'drop policy if exists attendance_kiosk_select on public.attendance';
    execute $p$
      create policy attendance_kiosk_select on public.attendance
        for select using (public.is_attendance_role())
    $p$;

    execute 'drop policy if exists attendance_kiosk_insert on public.attendance';
    execute $p$
      create policy attendance_kiosk_insert on public.attendance
        for insert with check (public.is_attendance_role())
    $p$;

    execute 'drop policy if exists attendance_kiosk_update on public.attendance';
    execute $p$
      create policy attendance_kiosk_update on public.attendance
        for update using (public.is_attendance_role())
    $p$;
  end if;
end $$;

-- 4. Attendance accounts need SELECT on profiles to read face descriptors
--    and employee names. A read-only policy is safe.
do $$
begin
  execute 'drop policy if exists profiles_attendance_select on public.profiles';
  execute $p$
    create policy profiles_attendance_select on public.profiles
      for select using (public.is_attendance_role())
  $p$;
end $$;
