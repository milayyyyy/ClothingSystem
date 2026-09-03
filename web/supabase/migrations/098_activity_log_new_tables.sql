-- =========================================================================
-- Migration 098: Add activity log triggers for newer tables
-- Covers: profiles (accounts), inventory_sub_items, reminders
-- The log_activity() trigger function already exists (migration 085).
-- =========================================================================

do $$
declare t text;
begin
  for t in select unnest(array[
    'profiles',
    'inventory_sub_items',
    'reminders'
  ]) loop
    execute format(
      'drop trigger if exists trg_log_%I on public.%I',
      t, t
    );
    execute format(
      'create trigger trg_log_%I
       after insert or update or delete on public.%I
       for each row execute function public.log_activity()',
      t, t
    );
  end loop;
end $$;
