defmodule RiskGame.Games do
  @moduledoc """
  The Games context - public API for game operations.

  This module provides high-level functions for:
  - Creating and managing games
  - Player operations
  - Querying game state

  2025 Best Practices:
  - Context pattern for clean boundaries
  - Delegates to GenServers for active games
  - Direct DB access for queries
  """

  import Ecto.Query
  alias RiskGame.Repo
  alias RiskGame.Games.{Game, GamePlayer, GameState, GameEvent, ArchivedGame}
  alias RiskGame.Games.{GameServer, GameSupervisor}

  # Game CRUD

  @doc """
  Create a new game.
  Automatically starts a GameServer for it.
  """
  def create_game(attrs \\ %{}) do
    %Game{}
    |> Game.changeset(attrs)
    |> Repo.insert()
    |> case do
      {:ok, game} ->
        # Start GameServer
        {:ok, _pid} = GameSupervisor.start_game_server(game.id)
        {:ok, game}

      error ->
        error
    end
  end

  @doc """
  Get a game by ID (raises if not found).
  """
  def get_game!(id), do: Repo.get!(Game, id)

  @doc """
  Get a game by ID (returns {:ok, game} or {:error, :not_found}).
  """
  def get_game(id) do
    case Repo.get(Game, id) do
      nil -> {:error, :not_found}
      game -> {:ok, game}
    end
  end

  @doc """
  Get a game by public_id.
  """
  def get_game_by_public_id!(public_id) do
    Repo.get_by!(Game, public_id: public_id)
  end

  @doc """
  Update a game.
  """
  def update_game(%Game{} = game, attrs) do
    game
    |> Game.changeset(attrs)
    |> Repo.update()
  end

  @doc """
  Delete a game.
  """
  def delete_game(%Game{} = game) do
    # Stop GameServer if running
    GameSupervisor.stop_game_server(game.id)

    Repo.delete(game)
  end

  @doc """
  List all active games.
  """
  def list_active_games do
    Game.active_games()
    |> Repo.all()
    |> Repo.preload(:host)
  end

  @doc """
  List games for a specific user.
  """
  def list_user_games(user_id) do
    Game
    |> Game.for_user(user_id)
    |> Repo.all()
    |> Repo.preload(:host)
  end

  # GamePlayer CRUD

  @doc """
  Create a game player.
  """
  def create_game_player(attrs \\ %{}) do
    %GamePlayer{}
    |> GamePlayer.changeset(attrs)
    |> Repo.insert()
  end

  @doc """
  Update a game player.
  """
  def update_game_player(%GamePlayer{} = game_player, attrs) do
    game_player
    |> GamePlayer.changeset(attrs)
    |> Repo.update()
  end

  @doc """
  Get players for a game.
  """
  def list_game_players(game_id) do
    GamePlayer
    |> GamePlayer.for_game(game_id)
    |> Repo.all()
    |> Repo.preload(:user)
  end

  # GameServer operations (delegates to GenServer)

  @doc """
  Join a game (adds player to lobby).
  Delegates to GameServer if running, otherwise starts it.
  """
  def join_game(game_id, user_id, opts \\ []) do
    ensure_game_server_running(game_id)
    GameServer.join_game(game_id, user_id, opts)
  end

  @doc """
  Leave a game.
  """
  def leave_game(game_id, user_id) do
    with {:ok, _pid} <- GameServer.whereis(game_id) do
      GameServer.leave_game(game_id, user_id)
    else
      {:error, :not_found} -> {:error, :game_not_running}
    end
  end

  @doc """
  Toggle ready status.
  """
  def toggle_ready(game_id, user_id) do
    with {:ok, _pid} <- GameServer.whereis(game_id) do
      GameServer.toggle_ready(game_id, user_id)
    else
      {:error, :not_found} -> {:error, :game_not_running}
    end
  end

  @doc """
  Start a game (transition from lobby to playing).
  """
  def start_game(game_id, user_id) do
    with {:ok, _pid} <- GameServer.whereis(game_id) do
      GameServer.start_game(game_id, user_id)
    else
      {:error, :not_found} -> {:error, :game_not_running}
    end
  end

  @doc """
  Get current game state from GameServer.
  """
  def get_game_state(game_id) do
    with {:ok, _pid} <- GameServer.whereis(game_id) do
      GameServer.get_state(game_id)
    else
      {:error, :not_found} ->
        # Fallback to DB
        {:ok, %{
          game: get_game!(game_id) |> Repo.preload(:host),
          players: list_game_players(game_id),
          game_state: Repo.get_by(GameState, game_id: game_id)
        }}
    end
  end

  # Event sourcing

  @doc """
  Get events for a game.
  """
  def list_game_events(game_id, opts \\ []) do
    query = GameEvent.for_game(game_id)

    query =
      if since_version = opts[:since_version] do
        GameEvent.since_version(query, since_version)
      else
        query
      end

    Repo.all(query)
  end

  # Archived games

  @doc """
  Archive a completed game.
  """
  def archive_game(game_id) do
    game = get_game!(game_id) |> Repo.preload(:host)
    players = list_game_players(game_id)
    game_state = Repo.get_by(GameState, game_id: game_id)

    duration_seconds =
      if game.inserted_at && game.updated_at do
        DateTime.diff(game.updated_at, game.inserted_at)
      else
        0
      end

    # Find winner
    winner_id =
      Enum.find(players, fn p -> p.placement == 1 end)
      |> case do
        nil -> nil
        player -> player.user_id
      end

    # Create archived game
    %ArchivedGame{}
    |> ArchivedGame.changeset(%{
      public_id: game.public_id,
      game_data: %{
        game: game,
        players: players,
        game_state: game_state
      },
      completed_at: DateTime.utc_now(),
      duration_seconds: duration_seconds,
      winner_id: winner_id
    })
    |> Repo.insert()
    |> case do
      {:ok, archived} ->
        # Delete from active games
        delete_game(game)
        {:ok, archived}

      error ->
        error
    end
  end

  # Private helpers

  defp ensure_game_server_running(game_id) do
    case GameServer.whereis(game_id) do
      {:ok, _pid} ->
        :ok

      {:error, :not_found} ->
        {:ok, _pid} = GameSupervisor.start_game_server(game_id)
        :ok
    end
  end
end
