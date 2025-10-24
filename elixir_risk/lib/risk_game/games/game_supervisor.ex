defmodule RiskGame.Games.GameSupervisor do
  @moduledoc """
  DynamicSupervisor for managing GameServer processes.

  Spawns one GameServer per active game.
  Handles crashes and restarts.

  2025 Best Practices:
  - DynamicSupervisor for on-demand process creation
  - One supervisor per game type (could scale to multiple supervisors)
  - Proper restart strategies
  """
  use DynamicSupervisor
  require Logger

  alias RiskGame.Games.GameServer

  def start_link(init_arg) do
    DynamicSupervisor.start_link(__MODULE__, init_arg, name: __MODULE__)
  end

  @impl true
  def init(_init_arg) do
    DynamicSupervisor.init(strategy: :one_for_one)
  end

  @doc """
  Start a GameServer for the given game ID.
  Returns {:ok, pid} or {:error, reason}.
  """
  def start_game_server(game_id) do
    # Check if game server already exists
    case GameServer.whereis(game_id) do
      {:ok, pid} ->
        Logger.info("GameServer already running for game #{game_id}")
        {:ok, pid}

      {:error, :not_found} ->
        spec = {GameServer, game_id}

        case DynamicSupervisor.start_child(__MODULE__, spec) do
          {:ok, pid} ->
            Logger.info("Started GameServer for game #{game_id}")
            {:ok, pid}

          {:error, {:already_started, pid}} ->
            Logger.info("GameServer already started for game #{game_id}")
            {:ok, pid}

          {:error, reason} = error ->
            Logger.error("Failed to start GameServer for game #{game_id}: #{inspect(reason)}")
            error
        end
    end
  end

  @doc """
  Stop a GameServer for the given game ID.
  """
  def stop_game_server(game_id) do
    case GameServer.whereis(game_id) do
      {:ok, pid} ->
        DynamicSupervisor.terminate_child(__MODULE__, pid)

      {:error, :not_found} ->
        {:error, :not_found}
    end
  end

  @doc """
  List all running game servers.
  """
  def list_game_servers do
    DynamicSupervisor.which_children(__MODULE__)
  end

  @doc """
  Count running game servers.
  """
  def count_game_servers do
    DynamicSupervisor.count_children(__MODULE__)
  end
end
