-- Add a customizable profile tagline for users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS tagline TEXT DEFAULT 'Commander of the Conquest Realms';

