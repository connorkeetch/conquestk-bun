defmodule RiskGame.Games.GameEvent do
  @moduledoc """
  GameEvent schema for event sourcing light.
  Tracks all game events for replay and audit trail.

  2025 Best Practices:
  - Event sourcing pattern for auditability
  - JSONB for flexible event data
  - Versioned for replay
  - No updated_at (events are immutable)
  """
  use Ecto.Schema
  import Ecto.Changeset
  import Ecto.Query

  @schema_prefix "elixir_risk"

  schema "game_events" do
    field :user_id, :binary_id
    field :type, :string
    field :data, :map, default: %{}  # JSONB
    field :version, :integer
    field :occurred_at, :utc_datetime_usec

    belongs_to :game, RiskGame.Games.Game, foreign_key: :game_id

    # Note: No updated_at - events are immutable
    timestamps(type: :utc_datetime_usec, updated_at: false)
  end

  @doc false
  def changeset(game_event, attrs) do
    game_event
    |> cast(attrs, [:game_id, :user_id, :type, :data, :version, :occurred_at])
    |> validate_required([:game_id, :type, :version, :occurred_at])
    |> foreign_key_constraint(:game_id)
    |> unique_constraint([:game_id, :version])
  end

  # Query helpers
  def for_game(query \\ __MODULE__, game_id) do
    from ge in query,
      where: ge.game_id == ^game_id,
      order_by: [asc: ge.version]
  end

  def by_type(query \\ __MODULE__, type) do
    from ge in query, where: ge.type == ^type
  end

  def since_version(query \\ __MODULE__, version) do
    from ge in query, where: ge.version > ^version
  end

  # Event types (for reference)
  @event_types ~w(
    game_created
    player_joined
    player_left
    player_ready
    game_started
    armies_deployed
    attack_initiated
    territory_conquered
    armies_fortified
    turn_ended
    player_eliminated
    game_completed
  )

  def valid_event_types, do: @event_types
end
