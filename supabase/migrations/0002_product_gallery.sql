-- ============================================================================
-- MAESTROVOLTA — Migration 0002: Product gallery images
-- Replaces the single slika_glavna column with an array (up to 3 images,
-- enforced in the admin API) managed from a dedicated panel on the product
-- detail page, independent of product creation.
-- ============================================================================

alter table proizvodi
  add column slike text[] not null default '{}';

alter table proizvodi
  drop column if exists slika_glavna;
