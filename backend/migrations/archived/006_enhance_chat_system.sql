-- Enhance chat messages table for game, team, and DM support
ALTER TABLE chat_messages 
  ADD COLUMN IF NOT EXISTS message_type VARCHAR(20) DEFAULT 'game' CHECK (message_type IN ('game', 'team', 'dm')),
  ADD COLUMN IF NOT EXISTS game_id UUID REFERENCES game_rooms(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS team_id INTEGER,
  ADD COLUMN IF NOT EXISTS recipient_id UUID REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE;

-- Create index for faster message queries
CREATE INDEX IF NOT EXISTS idx_chat_messages_game_id ON chat_messages(game_id) WHERE game_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_messages_recipient_id ON chat_messages(recipient_id) WHERE recipient_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_id ON chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at DESC);

-- Message reactions table
CREATE TABLE IF NOT EXISTS message_reactions (
  message_id UUID REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  reaction VARCHAR(10) NOT NULL, -- emoji character
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (message_id, user_id, reaction)
);

-- Unread message counts for optimization
CREATE TABLE IF NOT EXISTS unread_message_counts (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  conversation_type VARCHAR(20) CHECK (conversation_type IN ('game', 'dm')),
  conversation_id UUID, -- game_id or sender_id for DMs
  unread_count INTEGER DEFAULT 0,
  last_read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, conversation_type, conversation_id)
);

-- User message preferences
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS dm_privacy VARCHAR(20) DEFAULT 'friends' CHECK (dm_privacy IN ('anyone', 'friends', 'nobody')),
  ADD COLUMN IF NOT EXISTS message_notifications BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS profanity_filter BOOLEAN DEFAULT TRUE;

-- Archived messages table for retention policy
CREATE TABLE IF NOT EXISTS archived_messages (
  LIKE chat_messages INCLUDING ALL,
  archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create a function to archive old game messages
CREATE OR REPLACE FUNCTION archive_old_game_messages() RETURNS void AS $$
BEGIN
  -- Archive messages from games that ended more than 30 days ago
  INSERT INTO archived_messages 
  SELECT m.*, CURRENT_TIMESTAMP as archived_at
  FROM chat_messages m
  JOIN game_rooms g ON m.game_id = g.id
  WHERE m.message_type IN ('game', 'team')
    AND g.status = 'ended'
    AND g.ended_at < CURRENT_TIMESTAMP - INTERVAL '30 days';
    
  -- Delete the archived messages from main table
  DELETE FROM chat_messages
  WHERE id IN (
    SELECT m.id 
    FROM chat_messages m
    JOIN game_rooms g ON m.game_id = g.id
    WHERE m.message_type IN ('game', 'team')
      AND g.status = 'ended'
      AND g.ended_at < CURRENT_TIMESTAMP - INTERVAL '30 days'
  );
END;
$$ LANGUAGE plpgsql;