-- Migration: Add direct message notification preference toggles
-- Tags: notifications, chat

ALTER TABLE user_preferences
ADD COLUMN IF NOT EXISTS dm_notifications_browser BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS dm_notifications_email BOOLEAN DEFAULT false;

UPDATE user_preferences
SET
  dm_notifications_browser = COALESCE(dm_notifications_browser, true),
  dm_notifications_email = COALESCE(dm_notifications_email, false);
