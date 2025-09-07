-- Migration 007: Add link preview support for chat messages

-- Table to store link previews for messages
CREATE TABLE IF NOT EXISTS message_link_previews (
  id SERIAL PRIMARY KEY,
  message_id VARCHAR(36) NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT,
  description TEXT,
  image TEXT,
  site_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(message_id, url)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_message_link_previews_message_id ON message_link_previews(message_id);

-- Add setting for link preview preferences
ALTER TABLE user_preferences 
ADD COLUMN IF NOT EXISTS show_link_previews BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS auto_load_previews BOOLEAN DEFAULT TRUE;