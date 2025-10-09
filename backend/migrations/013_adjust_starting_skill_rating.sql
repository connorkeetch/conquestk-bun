-- 013_adjust_starting_skill_rating.sql
-- Purpose: Lower default starting CP so new players begin at 800 instead of 1000

BEGIN;

ALTER TABLE public.users
  ALTER COLUMN skill_rating SET DEFAULT 800;

COMMIT;
