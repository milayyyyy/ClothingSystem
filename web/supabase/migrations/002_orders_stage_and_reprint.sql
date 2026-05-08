-- =========================================================================
-- Migration 002: order stage (local/online) + sublimation reprint stage
-- Run AFTER 001_extend.sql. Idempotent — safe to re-run.
-- =========================================================================

-- 1) Add "reprint_error" to sublimation_stage enum (if missing)
do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'sublimation_stage'
      and e.enumlabel = 'reprint_error'
  ) then
    alter type sublimation_stage add value 'reprint_error' after 'cut_sew';
  end if;
end $$;
commit;

-- 2) Add stage column for local/online fulfillment stages
alter table public.orders
  add column if not exists stage text;

-- 3) Backfill defaults for existing rows
update public.orders
   set stage = coalesce(stage, 'preparing')
 where (kind in ('local','online') or order_type in ('local','online'))
   and stage is null;

update public.orders
   set sub_stage = coalesce(sub_stage, 'design_layout'::sublimation_stage)
 where (kind = 'sublimation' or order_type = 'sublimation')
   and sub_stage is null;

