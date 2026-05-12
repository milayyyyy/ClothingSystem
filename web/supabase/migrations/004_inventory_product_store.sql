-- =========================================================================
-- Migration 004: inventory product store (Shopee / TikTok Shop / etc.)
-- Run AFTER prior migrations. Idempotent — safe to re-run.
-- =========================================================================

alter table public.inventory
  add column if not exists product_store text;
