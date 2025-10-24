defmodule RiskGame.Games.ArchivedGame do
  @moduledoc """
  ArchivedGame schema for completed games.
  Keeps the active games table small and fast.

  2025 Best Practices:
  - Separate table for completed games
  - No updated_at (archived games don't change)
  - Full game snapshot in JSONB
  """
  use Ecto.Schema
  import Ecto.Changeset
  import Ecto.Query

  @schema_prefix "elixir_risk"

  schema "archived_games" do
    field :public_id, :string
    field :game_data, :map  # Full game snapshot as JSONB
    field :completed_at, :utc_datetime_usec
    field :duration_seconds, :integer
    field :winner_id, :binary_id

    # Note: No updated_at - archived games are immutable
    timestamps(type: :utc_datetime_usec, updated_at: false)
  end

  @doc false
  def changeset(archived_game, attrs) do
    archived_game
    |> cast(attrs, [:public_id, :game_data, :completed_at, :duration_seconds, :winner_id])
    |> validate_required([:public_id, :game_data, :completed_at])
  end

  # Query helpers
  def by_winner(query \\ __MODULE__, user_id) do
    from ag in query, where: ag.winner_id == ^user_id
  end

  def recent(query \\ __MODULE__, limit \\ 10) do
    from ag in query,
      order_by: [desc: ag.completed_at],
      limit: ^limit
  end

  def by_duration(query \\ __MODULE__, min_seconds, max_seconds) do
    from ag in query,
      where: ag.duration_seconds >= ^min_seconds and ag.duration_seconds <= ^max_seconds
  end
end
