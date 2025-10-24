defmodule RiskGame.Games.Player do
  @moduledoc """
  Player schema representing a player in a game room.
  """
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  # Use elixir_risk schema
  @schema_prefix "elixir_risk"

  schema "room_players" do
    field :color, :string
    field :is_ready, :boolean, default: false
    field :placement, :integer
    field :is_alive, :boolean, default: true

    belongs_to :room, RiskGame.Games.Game, foreign_key: :room_id, references: :id
    belongs_to :user, RiskGame.Accounts.User, foreign_key: :user_id, references: :id

    timestamps(type: :utc_datetime)
  end

  @doc false
  def changeset(player, attrs) do
    player
    |> cast(attrs, [:room_id, :user_id, :color, :is_ready, :placement, :is_alive])
    |> validate_required([:room_id, :user_id])
    |> foreign_key_constraint(:room_id)
    |> foreign_key_constraint(:user_id)
    |> unique_constraint([:room_id, :user_id])
  end
end
