-- Ensure the users table has a bio column for profile data
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS bio TEXT;
