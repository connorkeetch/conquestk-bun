defmodule RiskGame.Games.GamePlayer do
  @moduledoc """
  GamePlayer join schema - the proper many-to-many pattern with metadata.
  This holds game-specific player data (color, stats, placement, etc.)

  2025 Best Practices:
  - Explicit join schema with game-specific metadata
  - Integer IDs for performance
  - Stats stored here, not in separate table
  - Microsecond timestamps
  """
  use Ecto.Schema
  import Ecto.Changeset
  import Ecto.Query

  @schema_prefix "elixir_risk"

  schema "game_players" do
    # Game-specific player state
    field :color, :string
    field :turn_order, :integer
    field :is_ready, :boolean, default: false
    field :placement, :integer
    field :is_alive, :boolean, default: true
    field :eliminated_at, :utc_datetime_usec

    # Per-game stats (not in a separate table!)
    field :territories_conquered, :integer, default: 0
    field :armies_deployed, :integer, default: 0
    field :attacks_won, :integer, default: 0
    field :attacks_lost, :integer, default: 0

    belongs_to :game, RiskGame.Games.Game, foreign_key: :game_id
    belongs_to :user, RiskGame.Accounts.User, foreign_key: :user_id, type: :binary_id

    timestamps(type: :utc_datetime_usec)
  end

  @doc false
  def changeset(game_player, attrs) do
    game_player
    |> cast(attrs, [
      :game_id, :user_id, :color, :turn_order, :is_ready,
      :placement, :is_alive, :eliminated_at,
      :territories_conquered, :armies_deployed, :attacks_won, :attacks_lost
    ])
    |> validate_required([:game_id, :user_id])
    |> foreign_key_constraint(:game_id)
    |> foreign_key_constraint(:user_id)
    |> unique_constraint([:game_id, :user_id])
  end

  # Query helpers
  def for_game(query \\ __MODULE__, game_id) do
    from gp in query,
      where: gp.game_id == ^game_id,
      order_by: [asc: gp.turn_order]
  end

  def alive_players(query \\ __MODULE__) do
    from gp in query, where: gp.is_alive == true
  end

  def eliminated_players(query \\ __MODULE__) do
    from gp in query, where: gp.is_alive == false
  end
end
