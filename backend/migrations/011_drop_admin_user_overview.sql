-- Drop unused admin view; not referenced by application code
-- Safe to re-create later if needed for analytics

DROP VIEW IF EXISTS public.admin_user_overview;

