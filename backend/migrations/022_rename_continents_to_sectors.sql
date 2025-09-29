-- Migration 022: Rename continents → sectors across schema
-- Date: 2025-09-29
-- Description: Renames continent-related tables/columns to sector terminology while preserving data.

BEGIN;

-- map_territories.continent → sector
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'map_territories' AND column_name = 'continent'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'map_territories' AND column_name = 'sector'
  ) THEN
    ALTER TABLE map_territories RENAME COLUMN continent TO sector;
  END IF;
END $$;

-- map_continents → map_sectors
DO $$
BEGIN
  IF to_regclass('public.map_continents') IS NOT NULL AND to_regclass('public.map_sectors') IS NULL THEN
    ALTER TABLE map_continents RENAME TO map_sectors;
  END IF;
END $$;

-- Rename common indexes if they exist
DO $$
BEGIN
  IF to_regclass('public.idx_map_continents_map_id') IS NOT NULL THEN
    ALTER INDEX idx_map_continents_map_id RENAME TO idx_map_sectors_map_id;
  END IF;
  IF to_regclass('public.idx_map_continents_requirements_gin') IS NOT NULL THEN
    ALTER INDEX idx_map_continents_requirements_gin RENAME TO idx_map_sectors_requirements_gin;
  END IF;
END $$;

-- map_drafts.continents → sectors
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'map_drafts' AND column_name = 'continents'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'map_drafts' AND column_name = 'sectors'
  ) THEN
    ALTER TABLE map_drafts RENAME COLUMN continents TO sectors;
  END IF;
END $$;

-- map_versions.continents → sectors
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'map_versions' AND column_name = 'continents'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'map_versions' AND column_name = 'sectors'
  ) THEN
    ALTER TABLE map_versions RENAME COLUMN continents TO sectors;
  END IF;
END $$;

COMMIT;

