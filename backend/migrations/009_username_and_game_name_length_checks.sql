-- Add DB-enforced length limits for usernames and game room names
-- Notes:
-- - Use NOT VALID to avoid scanning existing rows during migration.
--   The constraints still apply to new/updated rows. You can VALIDATE later
--   after verifying there are no legacy violations.

-- Usernames: clamp to 3–20 characters (min already enforced by users_username_length)
ALTER TABLE public.users
  ADD CONSTRAINT users_username_max_length
  CHECK (length((username)::text) <= 20) NOT VALID;

-- Game room names: 3–50 characters to align with UI and API expectations
ALTER TABLE public.game_rooms
  ADD CONSTRAINT game_rooms_name_length
  CHECK (length(name) >= 3 AND length(name) <= 50) NOT VALID;

