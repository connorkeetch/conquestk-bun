defmodule RiskGame.Games.GameServer do
  @moduledoc """
  GenServer for managing individual game room state.

  One GenServer process per active game room.
  Handles lobby operations, game initialization, and state transitions.

  2025 Best Practices:
  - Uses Registry for process lookup
  - Broadcasts via PubSub
  - Pure functional game rules in separate modules
  - Persists to DB asynchronously
  - Telemetry for metrics
  """
  use GenServer
  require Logger

  alias RiskGame.Games
  alias RiskGame.Games.{Game, GamePlayer, GameState, GameEvent}
  alias RiskGame.Repo

  import Ecto.Query

  # Client API

  @doc """
  Starts a game server for the given game ID.
  Registers itself in the Registry for easy lookup.
  """
  def start_link(game_id) do
    GenServer.start_link(__MODULE__, game_id, name: via_tuple(game_id))
  end

  @doc """
  Get the current game state.
  """
  def get_state(game_id) do
    GenServer.call(via_tuple(game_id), :get_state)
  end

  @doc """
  Add a player to the game lobby.
  """
  def join_game(game_id, user_id, opts \\ []) do
    GenServer.call(via_tuple(game_id), {:join_game, user_id, opts})
  end

  @doc """
  Remove a player from the game lobby.
  """
  def leave_game(game_id, user_id) do
    GenServer.call(via_tuple(game_id), {:leave_game, user_id})
  end

  @doc """
  Toggle a player's ready status.
  """
  def toggle_ready(game_id, user_id) do
    GenServer.call(via_tuple(game_id), {:toggle_ready, user_id})
  end

  @doc """
  Start the game (transition from lobby to playing).
  Only the host can start the game.
  """
  def start_game(game_id, user_id) do
    GenServer.call(via_tuple(game_id), {:start_game, user_id})
  end

  @doc """
  Get the PID of a game server by game ID.
  Returns {:ok, pid} or {:error, :not_found}.
  """
  def whereis(game_id) do
    case Registry.lookup(RiskGame.GameRegistry, game_id) do
      [{pid, _}] -> {:ok, pid}
      [] -> {:error, :not_found}
    end
  end

  # Registry helper
  defp via_tuple(game_id) do
    {:via, Registry, {RiskGame.GameRegistry, game_id}}
  end

  # Server Callbacks

  @impl true
  def init(game_id) do
    # Load game data from database
    case load_game(game_id) do
      {:ok, game_data} ->
        # Subscribe to PubSub for this game
        Phoenix.PubSub.subscribe(RiskGame.PubSub, "game:#{game_id}")

        # Set up periodic state persistence (every 30 seconds)
        schedule_persistence()

        # Emit telemetry
        :telemetry.execute([:risk_game, :game_server, :started], %{count: 1}, %{game_id: game_id})

        Logger.info("GameServer started for game #{game_id}")

        state = %{
          game: game_data.game,
          players: game_data.players,
          game_state: game_data.game_state,
          dirty: false,  # Track if state needs persistence
          last_event_version: 0
        }

        {:ok, state}

      {:error, reason} ->
        Logger.error("Failed to start GameServer for game #{game_id}: #{inspect(reason)}")
        {:stop, reason}
    end
  end

  @impl true
  def handle_call(:get_state, _from, state) do
    {:reply, {:ok, sanitize_state_for_client(state)}, state}
  end

  @impl true
  def handle_call({:join_game, user_id, opts}, _from, state) do
    case validate_join(state, user_id) do
      :ok ->
        # Create GamePlayer record
        player_attrs = %{
          game_id: state.game.id,
          user_id: user_id,
          color: opts[:color] || assign_color(state),
          turn_order: length(state.players) + 1,
          is_ready: false
        }

        case Games.create_game_player(player_attrs) do
          {:ok, game_player} ->
            # Load user data
            game_player = Repo.preload(game_player, :user)

            # Update state
            new_state = %{state |
              players: state.players ++ [game_player],
              dirty: true
            }

            # Record event and capture updated state
            new_state = record_event(new_state, "player_joined", %{user_id: user_id})

            # Broadcast update
            broadcast_state_update(new_state)

            {:reply, {:ok, game_player}, new_state}

          {:error, changeset} ->
            {:reply, {:error, changeset}, state}
        end

      {:error, reason} ->
        {:reply, {:error, reason}, state}
    end
  end

  @impl true
  def handle_call({:leave_game, user_id}, _from, state) do
    case find_player(state, user_id) do
      nil ->
        {:reply, {:error, :not_in_game}, state}

      player ->
        # Remove player
        Repo.delete(player)

        new_state = %{state |
          players: Enum.reject(state.players, &(&1.user_id == user_id)),
          dirty: true
        }

        # Record event and capture updated state
        new_state = record_event(new_state, "player_left", %{user_id: user_id})

        # Broadcast update
        broadcast_state_update(new_state)

        # If host left, maybe end the game or assign new host
        new_state = maybe_handle_host_leaving(new_state, user_id)

        {:reply, :ok, new_state}
    end
  end

  @impl true
  def handle_call({:toggle_ready, user_id}, _from, state) do
    case find_player(state, user_id) do
      nil ->
        {:reply, {:error, :not_in_game}, state}

      player ->
        # Toggle ready status
        {:ok, updated_player} = Games.update_game_player(player, %{is_ready: !player.is_ready})

        new_state = %{state |
          players: Enum.map(state.players, fn p ->
            if p.id == player.id, do: updated_player, else: p
          end),
          dirty: true
        }

        # Record event and capture updated state
        new_state = record_event(new_state, "player_ready_toggled", %{
          user_id: user_id,
          is_ready: updated_player.is_ready
        })

        # Broadcast update
        broadcast_state_update(new_state)

        {:reply, {:ok, updated_player}, new_state}
    end
  end

  @impl true
  def handle_call({:start_game, user_id}, _from, state) do
    cond do
      state.game.host_id != user_id ->
        {:reply, {:error, :not_host}, state}

      state.game.status != "lobby" ->
        {:reply, {:error, :already_started}, state}

      !all_players_ready?(state) ->
        {:reply, {:error, :not_all_ready}, state}

      length(state.players) < 2 ->
        {:reply, {:error, :not_enough_players}, state}

      true ->
        # Transition to playing state
        {:ok, updated_game} = Games.update_game(state.game, %{
          status: "playing",
          phase: "reinforcement"
        })

        # Initialize game state
        initial_state = initialize_game_state(state)

        new_state = %{state |
          game: updated_game,
          game_state: initial_state,
          dirty: true
        }

        # Record event and capture updated state
        new_state = record_event(new_state, "game_started", %{started_by: user_id})

        # Broadcast update
        broadcast_state_update(new_state)

        {:reply, :ok, new_state}
    end
  end

  @impl true
  def handle_info(:persist_state, state) do
    if state.dirty do
      persist_state(state)
      schedule_persistence()
      {:noreply, %{state | dirty: false}}
    else
      schedule_persistence()
      {:noreply, state}
    end
  end

  @impl true
  def handle_info({:state_update, _from_game_id}, state) do
    # Another process updated state, reload from DB
    case load_game(state.game.id) do
      {:ok, game_data} ->
        {:noreply, %{state |
          game: game_data.game,
          players: game_data.players,
          game_state: game_data.game_state
        }}
      {:error, _} ->
        {:noreply, state}
    end
  end

  @impl true
  def terminate(reason, state) do
    Logger.info("GameServer terminating for game #{state.game.id}, reason: #{inspect(reason)}")

    # Persist final state
    if state.dirty do
      persist_state(state)
    end

    :telemetry.execute([:risk_game, :game_server, :terminated], %{count: 1}, %{
      game_id: state.game.id,
      reason: reason
    })

    :ok
  end

  # Private Functions

  defp load_game(game_id) do
    game = Repo.get(Game, game_id) |> Repo.preload(:host)

    if game do
      players =
        GamePlayer
        |> where(game_id: ^game_id)
        |> order_by(:turn_order)
        |> Repo.all()
        |> Repo.preload(:user)

      game_state =
        GameState
        |> where(game_id: ^game_id)
        |> order_by(desc: :updated_at)
        |> limit(1)
        |> Repo.one()

      {:ok, %{game: game, players: players, game_state: game_state}}
    else
      {:error, :not_found}
    end
  end

  defp validate_join(state, user_id) do
    cond do
      state.game.status != "lobby" ->
        {:error, :game_already_started}

      find_player(state, user_id) != nil ->
        {:error, :already_in_game}

      length(state.players) >= 6 ->  # Max players
        {:error, :game_full}

      true ->
        :ok
    end
  end

  defp find_player(state, user_id) do
    Enum.find(state.players, &(&1.user_id == user_id))
  end

  defp assign_color(state) do
    available_colors = ["red", "blue", "green", "yellow", "purple", "orange"]
    used_colors = Enum.map(state.players, & &1.color)

    available_colors
    |> Enum.reject(&(&1 in used_colors))
    |> List.first()
    || "gray"
  end

  defp all_players_ready?(state) do
    Enum.all?(state.players, & &1.is_ready)
  end

  defp initialize_game_state(_state) do
    # TODO: Implement full game initialization in Phase 3
    # This will load the map, distribute territories, etc.
    %{
      phase: "reinforcement",
      territories: %{},
      current_player_index: 0
    }
  end

  defp persist_state(state) do
    # Update game record
    Games.update_game(state.game, %{
      phase: state.game_state[:phase],
      updated_at: DateTime.utc_now()
    })

    # Update or create game state
    if state.game_state do
      case Repo.get_by(GameState, game_id: state.game.id) do
        nil ->
          %GameState{}
          |> GameState.changeset(%{
            game_id: state.game.id,
            state_data: state.game_state,
            version: state.last_event_version + 1
          })
          |> Repo.insert()

        existing ->
          existing
          |> GameState.changeset(%{
            state_data: state.game_state,
            version: state.last_event_version + 1
          })
          |> Repo.update()
      end
    end
  end

  defp record_event(state, event_type, data) do
    # Record game event for audit trail
    version = state.last_event_version + 1

    %GameEvent{}
    |> GameEvent.changeset(%{
      game_id: state.game.id,
      user_id: data[:user_id],
      type: event_type,
      data: data,
      version: version,
      occurred_at: DateTime.utc_now()
    })
    |> Repo.insert()

    # Update state with new version
    %{state | last_event_version: version}
  end

  defp broadcast_state_update(state) do
    Phoenix.PubSub.broadcast(
      RiskGame.PubSub,
      "game:#{state.game.id}",
      {:game_updated, sanitize_state_for_client(state)}
    )
  end

  defp sanitize_state_for_client(state) do
    # Return only what clients need (no internal state)
    %{
      game: state.game,
      players: state.players,
      game_state: state.game_state
    }
  end

  defp maybe_handle_host_leaving(state, user_id) do
    if state.game.host_id == user_id do
      # Assign new host (first remaining player)
      case List.first(state.players) do
        nil ->
          # No players left, mark game as abandoned
          {:ok, updated_game} = Games.update_game(state.game, %{status: "abandoned"})
          %{state | game: updated_game}

        new_host ->
          # Transfer host to next player
          {:ok, updated_game} = Games.update_game(state.game, %{host_id: new_host.user_id})
          %{state | game: updated_game}
      end
    else
      state
    end
  end

  defp schedule_persistence do
    Process.send_after(self(), :persist_state, 30_000)  # 30 seconds
  end
end
