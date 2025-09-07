-- Remove duplicate is_verified field, keeping email_verified
-- The code uses email_verified, so is_verified is redundant

ALTER TABLE users DROP COLUMN IF EXISTS is_verified;

-- Add comment to document this change
COMMENT ON COLUMN users.email_verified IS 'Boolean indicating if user has verified their email address via verification link';