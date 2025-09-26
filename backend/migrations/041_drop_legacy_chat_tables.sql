-- 041_drop_legacy_chat_tables.sql
-- Remove legacy chat tables that are no longer used by the application.

-- Drop dependent tables first
DROP TABLE IF EXISTS message_link_previews;
DROP TABLE IF EXISTS message_reactions;

-- Drop core legacy chat tables
DROP TABLE IF EXISTS chat_messages;
DROP TABLE IF EXISTS unread_message_counts;

