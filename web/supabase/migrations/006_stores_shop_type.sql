-- =========================================================================
-- Migration 006: store shop type (physical vs online)
-- Run AFTER 005_stores.sql. Idempotent — safe to re-run.
-- =========================================================================

alter table public.stores add column if not exists shop_type text;

update public.stores
   set shop_type = 'physical'
 where shop_type is null
   and lower(trim(name)) = 'physical store';

update public.stores
   set shop_type = 'online'
 where shop_type is null;

alter table public.stores alter column shop_type set default 'online';
alter table public.stores alter column shop_type set not null;

do $$ begin
  alter table public.stores add constraint stores_shop_type_check check (shop_type in ('physical', 'online'));
exception when duplicate_object then null; end $$;
