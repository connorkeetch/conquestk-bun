defmodule RiskGame.Games.Game do
  @moduledoc """
  Game schema representing a game room.
  2025 Best Practices:
  - Uses integer IDs (not UUID) for performance
  - Uses public_id string for URLs
  - Flags array instead of multiple booleans
  - Native JSONB type for config
  - Microsecond timestamps
  """
  use Ecto.Schema
  import Ecto.Changeset
  import Ecto.Query

  @schema_prefix "elixir_risk"

  schema "game_rooms" do
    field :public_id, :string
    field :name, :string
    field :status, :string, default: "lobby"
    field :phase, :string
    field :map_id, :integer

    # Flags array instead of multiple booleans (2025 pattern)
    field :flags, {:array, :string}, default: []
    # Examples: ["ranked", "tournament", "allows_spectators", "fog_of_war"]

    # Use Ecto's :map type (maps to JSONB in PostgreSQL)
    # In Phoenix 1.8+, :map automatically uses JSONB
    field :config, :map, default: %{}

    field :current_player_id, :binary_id
    field :turn_number, :integer, default: 0

    belongs_to :host, RiskGame.Accounts.User, foreign_key: :host_id, type: :binary_id
    has_many :game_players, RiskGame.Games.GamePlayer, foreign_key: :game_id
    has_many :players, through: [:game_players, :user]
    has_one :game_state, RiskGame.Games.GameState, foreign_key: :game_id
    has_many :game_events, RiskGame.Games.GameEvent, foreign_key: :game_id

    # Microsecond timestamps (2025 standard)
    timestamps(type: :utc_datetime_usec)
  end

  @doc """
  Changeset for creating/updating games.
  Validates constraints defined in migration.
  """
  def changeset(game, attrs) do
    game
    |> cast(attrs, [:public_id, :name, :status, :phase, :host_id, :map_id, :config, :flags, :current_player_id, :turn_number])
    |> validate_required([:name, :status, :host_id])
    |> validate_inclusion(:status, ~w(lobby playing completed abandoned))
    |> validate_inclusion(:phase, ~w(lobby reinforcement attack fortify game_over), allow_nil: true)
    |> unique_constraint(:public_id)
    |> foreign_key_constraint(:host_id)
    |> put_public_id()
  end

  # Helper functions for flag checks (clean API)
  def ranked?(game), do: "ranked" in game.flags
  def tournament?(game), do: "tournament" in game.flags
  def allows_spectators?(game), do: "allows_spectators" in game.flags
  def fog_of_war?(game), do: "fog_of_war" in game.flags

  # Query helpers using 2025 patterns
  def active_games do
    from g in __MODULE__,
      where: g.status in ["lobby", "playing"],
      order_by: [desc: g.updated_at]
  end

  def for_user(query \\ __MODULE__, user_id) do
    from g in query,
      join: gp in assoc(g, :game_players),
      where: gp.user_id == ^user_id
  end

  # JSONB querying example (2025 feature)
  def with_config_option(query \\ __MODULE__, key, value) do
    from g in query,
      where: fragment("? @> ?", g.config, ^%{key => value})
  end

  defp put_public_id(changeset) do
    case get_change(changeset, :public_id) do
      nil -> put_change(changeset, :public_id, generate_public_id())
      _ -> changeset
    end
  end

  defp generate_public_id do
    # Generate URL-safe public ID (not UUID)
    # Format: "game_" + 12 random alphanumeric chars
    "game_" <> (
      :crypto.strong_rand_bytes(9)
      |> Base.url_encode64(padding: false)
      |> binary_part(0, 12)
      |> String.downcase()
    )
  end
end
