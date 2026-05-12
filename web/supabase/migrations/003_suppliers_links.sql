-- =========================================================================
-- Migration 003: supplier online links and pinned map url
-- Run AFTER 001_extend.sql. Idempotent — safe to re-run.
-- =========================================================================

alter table public.suppliers
  add column if not exists social_media_url text,
  add column if not exists online_store_url text,
  add column if not exists google_maps_pin_url text;
