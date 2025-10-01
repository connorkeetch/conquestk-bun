-- Sync users.is_admin with user_admin_roles via triggers
-- This reduces redundancy by keeping the denormalized boolean in sync automatically.

-- Function to recompute is_admin for a single user
CREATE OR REPLACE FUNCTION public.recalc_user_is_admin(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE users u
  SET is_admin = u.is_admin OR EXISTS (
    SELECT 1
    FROM user_admin_roles uar
    WHERE uar.user_id = _user_id
      AND COALESCE(uar.is_active, TRUE) = TRUE
      AND (uar.expires_at IS NULL OR uar.expires_at > CURRENT_TIMESTAMP)
  )
  WHERE u.id = _user_id;
END;
$$;

-- Trigger function to respond to changes on user_admin_roles
CREATE OR REPLACE FUNCTION public.user_admin_roles_sync_is_admin()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.recalc_user_is_admin(NEW.user_id);
  ELSIF TG_OP = 'UPDATE' THEN
    -- If a record moved users, recalc both old and new
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      PERFORM public.recalc_user_is_admin(OLD.user_id);
    END IF;
    PERFORM public.recalc_user_is_admin(NEW.user_id);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.recalc_user_is_admin(OLD.user_id);
  END IF;
  RETURN NULL;
END;
$$;

-- Create trigger on user_admin_roles
DROP TRIGGER IF EXISTS user_admin_roles_sync_is_admin_trg ON public.user_admin_roles;
CREATE TRIGGER user_admin_roles_sync_is_admin_trg
AFTER INSERT OR UPDATE OR DELETE ON public.user_admin_roles
FOR EACH ROW
EXECUTE FUNCTION public.user_admin_roles_sync_is_admin();

-- Backfill to ensure current rows are consistent
UPDATE users u
SET is_admin = is_admin OR EXISTS (
  SELECT 1
  FROM user_admin_roles uar
  WHERE uar.user_id = u.id
    AND COALESCE(uar.is_active, TRUE) = TRUE
    AND (uar.expires_at IS NULL OR uar.expires_at > CURRENT_TIMESTAMP)
);
