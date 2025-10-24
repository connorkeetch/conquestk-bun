defmodule RiskGame.Repo.Migrations.CreateGameRooms do
  use Ecto.Migration

  def up do
    # Create our schema if it doesn't exist
    execute "CREATE SCHEMA IF NOT EXISTS elixir_risk"

    # Enable extensions we'll need
    execute "CREATE EXTENSION IF NOT EXISTS btree_gin"  # For JSONB indexes
    execute "CREATE EXTENSION IF NOT EXISTS pg_trgm"     # For fuzzy text search

    # Create game_rooms table with INTEGER IDs (not UUIDs everywhere)
    create table(:game_rooms, prefix: "elixir_risk") do
      add :public_id, :string, null: false  # For URLs, human-readable
      add :name, :string, null: false
      add :status, :string, null: false, default: "lobby"
      add :phase, :string
      add :host_id, references(:users, type: :uuid, prefix: "public"), null: false
      add :map_id, :integer

      # Use flags array instead of multiple booleans
      add :flags, {:array, :string}, default: fragment("ARRAY[]::text[]")
      # Examples: ["ranked", "tournament", "allows_spectators", "fog_of_war"]

      # JSONB for flexible configuration
      add :config, :jsonb, default: fragment("'{}'::jsonb")

      add :current_player_id, :uuid
      add :turn_number, :integer, default: 0

      # Use microseconds for precision
      timestamps(type: :utc_datetime_usec)
    end

    # Performance indexes
    create unique_index(:game_rooms, [:public_id], prefix: "elixir_risk")
    create index(:game_rooms, [:status, :updated_at], prefix: "elixir_risk")
    create index(:game_rooms, [:host_id], prefix: "elixir_risk")
    create index(:game_rooms, [:flags], prefix: "elixir_risk", using: :gin)  # For array queries

    # Constraints
    execute """
      ALTER TABLE elixir_risk.game_rooms
      ADD CONSTRAINT valid_status
      CHECK (status IN ('lobby', 'playing', 'completed', 'abandoned'))
    """

    execute """
      ALTER TABLE elixir_risk.game_rooms
      ADD CONSTRAINT valid_phase
      CHECK (phase IN ('lobby', 'reinforcement', 'attack', 'fortify', 'game_over') OR phase IS NULL)
    """

    # Set fillfactor for update-heavy table
    execute "ALTER TABLE elixir_risk.game_rooms SET (fillfactor = 90)"

    # Create game_players join table (NOT room_players - proper naming)
    # This holds game-specific player data with metadata
    create table(:game_players, prefix: "elixir_risk") do
      add :game_id, references(:game_rooms, prefix: "elixir_risk", on_delete: :delete_all), null: false
      add :user_id, references(:users, type: :uuid, prefix: "public"), null: false

      # Game-specific player state
      add :color, :string
      add :turn_order, :integer
      add :is_ready, :boolean, default: false
      add :placement, :integer  # Final placement (1st, 2nd, 3rd, etc.)
      add :is_alive, :boolean, default: true
      add :eliminated_at, :utc_datetime_usec

      # Player stats for this game
      add :territories_conquered, :integer, default: 0
      add :armies_deployed, :integer, default: 0
      add :attacks_won, :integer, default: 0
      add :attacks_lost, :integer, default: 0

      timestamps(type: :utc_datetime_usec)
    end

    create index(:game_players, [:game_id], prefix: "elixir_risk")
    create index(:game_players, [:user_id], prefix: "elixir_risk")
    create unique_index(:game_players, [:game_id, :user_id], prefix: "elixir_risk")
    create index(:game_players, [:game_id, :turn_order], prefix: "elixir_risk")

    # Create game_states table for storing full game state
    create table(:game_states, prefix: "elixir_risk") do
      add :game_id, references(:game_rooms, prefix: "elixir_risk", on_delete: :delete_all), null: false
      add :state_data, :jsonb  # Native JSONB type
      add :version, :integer, default: 1  # For event versioning

      timestamps(type: :utc_datetime_usec)
    end

    create index(:game_states, [:game_id], prefix: "elixir_risk")
    # JSONB index for querying inside state
    create index(:game_states, [:state_data], prefix: "elixir_risk", using: :gin)

    # Event sourcing light - keep a log of game events
    create table(:game_events, prefix: "elixir_risk") do
      add :game_id, references(:game_rooms, prefix: "elixir_risk", on_delete: :delete_all), null: false
      add :user_id, :uuid  # Who triggered this event
      add :type, :string, null: false
      add :data, :jsonb, default: fragment("'{}'::jsonb")
      add :version, :integer, null: false
      add :occurred_at, :utc_datetime_usec, null: false

      timestamps(type: :utc_datetime_usec, updated_at: false)
    end

    # Unique index to ensure version uniqueness per game (also serves as regular index)
    create unique_index(:game_events, [:game_id, :version], prefix: "elixir_risk")
    create index(:game_events, [:game_id, :occurred_at], prefix: "elixir_risk")
    create index(:game_events, [:type], prefix: "elixir_risk")

    # Archived games table for completed games (keep active games table small)
    create table(:archived_games, prefix: "elixir_risk") do
      add :public_id, :string, null: false
      add :game_data, :jsonb  # Full game snapshot
      add :completed_at, :utc_datetime_usec
      add :duration_seconds, :integer
      add :winner_id, :uuid

      timestamps(type: :utc_datetime_usec, updated_at: false)
    end

    create index(:archived_games, [:public_id], prefix: "elixir_risk")
    create index(:archived_games, [:completed_at], prefix: "elixir_risk")
    create index(:archived_games, [:winner_id], prefix: "elixir_risk")
  end

  def down do
    drop table(:archived_games, prefix: "elixir_risk")
    drop table(:game_events, prefix: "elixir_risk")
    drop table(:game_states, prefix: "elixir_risk")
    drop table(:game_players, prefix: "elixir_risk")
    drop table(:game_rooms, prefix: "elixir_risk")
  end
end
