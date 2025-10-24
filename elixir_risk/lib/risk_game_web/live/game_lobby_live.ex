defmodule RiskGameWeb.GameLobbyLive do
  @moduledoc """
  LiveView for game lobby - handles player joining, ready status, and game start.
  2025 Best Practice: Use LiveView for real-time UI instead of traditional templates.
  """
  use RiskGameWeb, :live_view

  alias RiskGame.Games
  alias Phoenix.PubSub

  @impl true
  def mount(%{"game_id" => game_id}, _session, socket) do
    # Subscribe to game updates
    if connected?(socket) do
      PubSub.subscribe(RiskGame.PubSub, "game:#{game_id}")
    end

    case Games.get_game(game_id) do
      {:ok, game} ->
        game_players = Games.list_game_players(game_id)

        socket =
          socket
          |> assign(:game, game)
          |> assign(:game_players, game_players)
          |> assign(:game_id, game_id)
          |> assign(:current_user_id, get_user_id(socket))
          |> assign(:error, nil)

        {:ok, socket}

      {:error, :not_found} ->
        {:ok,
         socket
         |> put_flash(:error, "Game not found")
         |> redirect(to: ~p"/")}
    end
  end

  @impl true
  def handle_event("join_game", _params, socket) do
    user_id = socket.assigns.current_user_id
    game_id = socket.assigns.game_id

    case Games.join_game(game_id, user_id) do
      {:ok, _game_player} ->
        {:noreply, assign(socket, :error, nil)}

      {:error, reason} ->
        {:noreply, assign(socket, :error, format_error(reason))}
    end
  end

  @impl true
  def handle_event("leave_game", _params, socket) do
    user_id = socket.assigns.current_user_id
    game_id = socket.assigns.game_id

    case Games.leave_game(game_id, user_id) do
      :ok ->
        {:noreply,
         socket
         |> put_flash(:info, "Left game")
         |> redirect(to: ~p"/")}

      {:error, reason} ->
        {:noreply, assign(socket, :error, format_error(reason))}
    end
  end

  @impl true
  def handle_event("toggle_ready", _params, socket) do
    user_id = socket.assigns.current_user_id
    game_id = socket.assigns.game_id

    case Games.toggle_ready(game_id, user_id) do
      {:ok, _game_player} ->
        {:noreply, assign(socket, :error, nil)}

      {:error, reason} ->
        {:noreply, assign(socket, :error, format_error(reason))}
    end
  end

  @impl true
  def handle_event("start_game", _params, socket) do
    user_id = socket.assigns.current_user_id
    game_id = socket.assigns.game_id

    case Games.start_game(game_id, user_id) do
      {:ok, _game} ->
        {:noreply,
         socket
         |> put_flash(:info, "Game started!")
         |> assign(:error, nil)}

      {:error, reason} ->
        {:noreply, assign(socket, :error, format_error(reason))}
    end
  end

  @impl true
  def handle_info({:game_updated, game}, socket) do
    {:noreply, assign(socket, :game, game)}
  end

  @impl true
  def handle_info({:player_joined, game_player}, socket) do
    game_players = [game_player | socket.assigns.game_players]
    {:noreply, assign(socket, :game_players, game_players)}
  end

  @impl true
  def handle_info({:player_left, user_id}, socket) do
    game_players = Enum.reject(socket.assigns.game_players, &(&1.user_id == user_id))
    {:noreply, assign(socket, :game_players, game_players)}
  end

  @impl true
  def handle_info({:player_ready_changed, game_player}, socket) do
    game_players =
      Enum.map(socket.assigns.game_players, fn gp ->
        if gp.user_id == game_player.user_id, do: game_player, else: gp
      end)

    {:noreply, assign(socket, :game_players, game_players)}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div class="max-w-4xl mx-auto p-6">
      <div class="bg-white rounded-lg shadow-lg p-6">
        <div class="flex justify-between items-start mb-6">
          <div>
            <h1 class="text-3xl font-bold mb-2"><%= @game.name %></h1>
            <p class="text-gray-600">
              Status: <span class="font-semibold"><%= String.capitalize(@game.status) %></span>
            </p>
            <p class="text-gray-600">
              Game ID: <span class="font-mono text-sm"><%= @game.public_id %></span>
            </p>
          </div>

          <%= if is_player?(@game_players, @current_user_id) do %>
            <button
              phx-click="leave_game"
              class="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition"
            >
              Leave Game
            </button>
          <% else %>
            <button
              phx-click="join_game"
              class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
            >
              Join Game
            </button>
          <% end %>
        </div>

        <%= if @error do %>
          <div class="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
            <%= @error %>
          </div>
        <% end %>

        <div class="mb-6">
          <h2 class="text-xl font-bold mb-4">
            Players (<%= length(@game_players) %> / <%= Map.get(@game.config, "max_players", 6) %>)
          </h2>

          <div class="space-y-3">
            <%= for game_player <- @game_players do %>
              <div class="flex items-center justify-between p-4 bg-gray-50 rounded border">
                <div class="flex items-center space-x-3">
                  <div
                    class="w-8 h-8 rounded-full"
                    style={"background-color: #{game_player.color || "#gray"}"}
                  >
                  </div>
                  <div>
                    <p class="font-semibold">
                      Player <%= game_player.user_id %>
                      <%= if game_player.user_id == @game.host_id do %>
                        <span class="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">HOST</span>
                      <% end %>
                    </p>
                    <p class="text-sm text-gray-600">Turn order: <%= game_player.turn_order || "—" %></p>
                  </div>
                </div>

                <div class="flex items-center space-x-4">
                  <%= if game_player.is_ready do %>
                    <span class="px-3 py-1 bg-green-100 text-green-800 rounded font-semibold">
                      Ready
                    </span>
                  <% else %>
                    <span class="px-3 py-1 bg-gray-200 text-gray-600 rounded">
                      Not Ready
                    </span>
                  <% end %>

                  <%= if game_player.user_id == @current_user_id && @game.status == "lobby" do %>
                    <button
                      phx-click="toggle_ready"
                      class="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition text-sm"
                    >
                      Toggle Ready
                    </button>
                  <% end %>
                </div>
              </div>
            <% end %>
          </div>
        </div>

        <%= if @game.status == "lobby" && @game.host_id == @current_user_id do %>
          <div class="mt-6 p-4 bg-blue-50 rounded border border-blue-200">
            <h3 class="font-bold mb-2">Host Controls</h3>
            <p class="text-sm text-gray-600 mb-3">
              All players must be ready and there must be at least 2 players to start.
            </p>
            <button
              phx-click="start_game"
              class="px-6 py-3 bg-green-500 text-white rounded hover:bg-green-600 transition font-bold"
            >
              Start Game
            </button>
          </div>
        <% end %>
      </div>
    </div>
    """
  end

  # Helper functions
  defp is_player?(game_players, user_id) do
    Enum.any?(game_players, &(&1.user_id == user_id))
  end

  defp get_user_id(_socket) do
    # TODO: Get from session/auth
    # For now, generate a test UUID
    Ecto.UUID.generate()
  end

  defp format_error(:game_full), do: "Game is full"
  defp format_error(:already_joined), do: "You have already joined this game"
  defp format_error(:not_in_game), do: "You are not in this game"
  defp format_error(:game_already_started), do: "Game has already started"
  defp format_error(:not_host), do: "Only the host can start the game"
  defp format_error(:not_enough_players), do: "Need at least 2 players to start"
  defp format_error(:players_not_ready), do: "All players must be ready"
  defp format_error(reason), do: "Error: #{inspect(reason)}"
end
