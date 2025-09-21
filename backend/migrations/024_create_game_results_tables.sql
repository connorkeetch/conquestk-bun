-- Create tables to store completed game results and per-player outcomes
CREATE TABLE IF NOT EXISTS game_results (
  room_id UUID PRIMARY KEY REFERENCES game_rooms(id) ON DELETE CASCADE,
  map_id UUID REFERENCES maps(id),
  winner_id UUID REFERENCES users(id),
  duration_seconds INTEGER,
  total_turns INTEGER NOT NULL,
  final_state JSONB NOT NULL,
  player_summary JSONB NOT NULL,
  battle_log JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS player_game_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES game_results(room_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  is_winner BOOLEAN NOT NULL,
  eliminated BOOLEAN NOT NULL,
  territories INTEGER NOT NULL,
  armies INTEGER NOT NULL,
  elimination_order INTEGER,
  rating_before INTEGER,
  rating_after INTEGER,
  rating_change INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  UNIQUE (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_player_game_results_room_position
  ON player_game_results(room_id, position);

CREATE INDEX IF NOT EXISTS idx_player_game_results_user
  ON player_game_results(user_id);
