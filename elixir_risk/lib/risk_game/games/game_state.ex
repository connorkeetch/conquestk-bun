defmodule RiskGame.Games.GameState do
  @moduledoc """
  GameState schema for storing the full game state as JSONB.
  2025 Best Practices:
  - Native JSONB type with GIN index for querying
  - Version field for event sourcing
  - Microsecond timestamps
  """
  use Ecto.Schema
  import Ecto.Changeset
  import Ecto.Query

  @schema_prefix "elixir_risk"

  schema "game_states" do
    field :state_data, :map, default: %{}  # Maps to JSONB in PostgreSQL
    field :version, :integer, default: 1

    belongs_to :game, RiskGame.Games.Game, foreign_key: :game_id

    timestamps(type: :utc_datetime_usec)
  end

  @doc false
  def changeset(game_state, attrs) do
    game_state
    |> cast(attrs, [:game_id, :state_data, :version])
    |> validate_required([:game_id, :state_data])
    |> foreign_key_constraint(:game_id)
  end

  # Query helpers for JSONB queries (2025 feature)
  def with_phase(query \\ __MODULE__, phase) do
    from gs in query,
      where: fragment("? @> ?", gs.state_data, ^%{phase: phase})
  end

  def current_player(query \\ __MODULE__, player_id) do
    from gs in query,
      where: fragment("? @> ?", gs.state_data, ^%{current_player_id: player_id})
  end
end
