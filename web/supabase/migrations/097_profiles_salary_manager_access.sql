-- =========================================================================
-- Migration 097: Allow admin and manager to update salary fields on profiles
-- The default profiles RLS only allows users to update their own row.
-- This adds a policy so admin/manager can set pay rates for any employee.
-- =========================================================================

-- Allow admin and manager to read all profiles (needed to list employees on salary page)
drop policy if exists "admin_manager_profiles_select" on public.profiles;
create policy "admin_manager_profiles_select"
  on public.profiles for select
  using (public.is_admin_or_sub());

-- Allow admin and manager to update salary-related fields on any profile
drop policy if exists "admin_manager_profiles_update" on public.profiles;
create policy "admin_manager_profiles_update"
  on public.profiles for update
  using  (public.is_admin_or_sub())
  with check (public.is_admin_or_sub());
