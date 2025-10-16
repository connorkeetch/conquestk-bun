CREATE TABLE IF NOT EXISTS client_metrics (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255),
  session_id VARCHAR(255) NOT NULL,
  game_id VARCHAR(255),
  metrics JSONB NOT NULL,
  stats JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_metrics_user ON client_metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_client_metrics_session ON client_metrics(session_id);
CREATE INDEX IF NOT EXISTS idx_client_metrics_created ON client_metrics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_metrics_game ON client_metrics(game_id);
