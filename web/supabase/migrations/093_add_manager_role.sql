-- =========================================================================
-- Migration 093: Add manager role, remove sub_admin
-- Introduces 'manager' as a first-class role between admin and employee.
-- Managers have salary, can access /admin, but cannot see the activity log.
-- Existing sub_admin accounts are migrated to manager.
-- =========================================================================

-- 1. Add manager to the user_role enum
do $$ begin
  if not exists (select 1 from pg_enum where enumlabel = 'manager' and enumtypid = 'user_role'::regtype) then
    alter type user_role add value 'manager';
  end if;
end $$;
commit;

-- 2. Update is_admin_or_sub() to include manager (sub_admin kept for DB compat only)
create or replace function public.is_admin_or_sub()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'manager')
  );
$$;

-- 3. Migrate existing sub_admin accounts to manager
update public.profiles
set role = 'manager'
where role = 'sub_admin';
