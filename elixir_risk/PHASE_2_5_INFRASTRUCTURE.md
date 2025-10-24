# Phase 2.5: Infrastructure & Reality Check

## Critical Questions Answered

### Q1: Database Strategy - Shared or Separate?

**Answer: SEPARATE databases during migration, then migrate data when ready**

#### Current Setup (Node.js)
```
PostgreSQL Database: railway
Schema: public.*
Tables: users, games, game_players, territories, etc.
```

#### Elixir Setup (Experiment Phase)
```
PostgreSQL Database: railway (SAME server, different schema)
Schema: elixir_risk.*
Tables: game_rooms, game_players, game_events, etc.
```

#### Configuration

**Node.js** (`backend/.env`):
```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE
# Uses public schema by default
```

**Elixir** (`elixir_risk/config/dev.exs`):
```elixir
config :risk_game, RiskGame.Repo,
  username: "postgres",
  password: "REMOVED_INACTIVE_DATABASE_PASSWORD",
  hostname: "yamanote.proxy.rlwy.net",
  port: 46553,
  database: "railway",
  # CRITICAL: Use separate schema prefix
  after_connect: {RiskGame.Repo, :set_search_path, []}

# In lib/risk_game/repo.ex:
def set_search_path(conn) do
  Postgrex.query!(conn, "SET search_path TO elixir_risk,public", [])
end
```

#### Migration Strategy

**Phase 2.5a**: Parallel development (NOW)
- Elixir uses `elixir_risk.*` schema
- Node.js uses `public.*` schema
- NO shared tables (no accidental corruption)
- Can test both systems simultaneously

**Phase 2.5b**: User authentication bridge (LATER)
- Create `elixir_risk.users` view that reads from `public.users`
- Share authentication tokens (JWT with shared secret)
- Allow Elixir to authenticate existing users

**Phase 2.5c**: Data migration (GO-LIVE)
- Write migration scripts to copy data from `public.*` to `elixir_risk.*`
- Test thoroughly in staging
- Switch DNS to Elixir app
- Archive Node.js app

---

## Phase 2.5: The Reality Check Phase

### Things AI Assistants Pretend Don't Exist

#### 1. Oban - Background Jobs & Turn Timers

**Problem**: Turn timers that survive crashes, database-backed queues

**Solution**: Add Oban

```elixir
# mix.exs
defp deps do
  [
    {:oban, "~> 2.18"},
    # ... existing deps
  ]
end

# config/config.exs
config :risk_game, Oban,
  repo: RiskGame.Repo,
  plugins: [
    Oban.Plugins.Pruner,
    {Oban.Plugins.Cron,
     crontab: [
       {"* * * * *", RiskGame.Workers.TurnTimerWorker},
       {"0 * * * *", RiskGame.Workers.GameCleanupWorker}
     ]}
  ],
  queues: [
    default: 10,
    turn_timers: 50,
    notifications: 20
  ]

# Migration
mix ecto.gen.migration add_oban_jobs_table
# Then run Oban.Migrations.up(version: 12)

# Create workers
# lib/risk_game/workers/turn_timer_worker.ex
defmodule RiskGame.Workers.TurnTimerWorker do
  use Oban.Worker, queue: :turn_timers, max_attempts: 3

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"game_id" => game_id, "player_id" => player_id}}) do
    case RiskGame.Games.check_turn_expired(game_id, player_id) do
      {:ok, :turn_ended} -> :ok
      {:error, :not_expired} -> :ok
      {:error, reason} -> {:error, reason}
    end
  end
end

# Schedule turn timer when turn starts
def start_player_turn(game, player) do
  turn_timeout_seconds = game.turn_timer_seconds || 60
  scheduled_at = DateTime.utc_now() |> DateTime.add(turn_timeout_seconds, :second)

  %{game_id: game.id, player_id: player.id}
  |> RiskGame.Workers.TurnTimerWorker.new(scheduled_at: scheduled_at)
  |> Oban.insert()
end
```

#### 2. Phoenix.Presence - Player Presence Tracking

**Problem**: Knowing who's actually online vs. just "in the game"

**Solution**: Add Presence

```elixir
# lib/risk_game_web/presence.ex
defmodule RiskGameWeb.Presence do
  use Phoenix.Presence,
    otp_app: :risk_game,
    pubsub_server: RiskGame.PubSub
end

# lib/risk_game/application.ex - Add to supervision tree
children = [
  RiskGame.Repo,
  {Phoenix.PubSub, name: RiskGame.PubSub},
  {Registry, keys: :unique, name: RiskGame.GameRegistry},
  RiskGame.Games.GameSupervisor,
  RiskGameWeb.Presence,  # <-- ADD THIS
  RiskGameWeb.Endpoint
]

# In LiveView
def mount(_params, _session, socket) do
  if connected?(socket) do
    # Track user presence
    RiskGameWeb.Presence.track(
      self(),
      "game:#{game_id}",
      user_id,
      %{
        online_at: DateTime.utc_now(),
        username: user.username,
        status: "idle"  # or "playing", "spectating"
      }
    )

    # Subscribe to presence changes
    Phoenix.PubSub.subscribe(RiskGame.PubSub, "game:#{game_id}")
  end
  {:ok, socket}
end

def handle_info(%{event: "presence_diff"}, socket) do
  # Update UI when players join/leave
  {:noreply, assign(socket, :online_players, get_online_count())}
end
```

#### 3. Data Migration Scripts

**File**: `lib/mix/tasks/migrate_from_node.ex`

```elixir
defmodule Mix.Tasks.MigrateFromNode do
  @moduledoc """
  Migrates data from Node.js public schema to Elixir elixir_risk schema.

  Usage:
    mix migrate_from_node --dry-run
    mix migrate_from_node --migrate users
    mix migrate_from_node --migrate games
    mix migrate_from_node --migrate all
  """
  use Mix.Task

  @shortdoc "Migrate data from Node.js schema to Elixir schema"

  def run(args) do
    Mix.Task.run("app.start")

    case args do
      ["--dry-run"] -> dry_run()
      ["--migrate", "users"] -> migrate_users()
      ["--migrate", "games"] -> migrate_games()
      ["--migrate", "all"] -> migrate_all()
      _ -> Mix.shell().info("Usage: mix migrate_from_node [--dry-run | --migrate users|games|all]")
    end
  end

  defp dry_run do
    # Count records in each table
    users_count = Ecto.Adapters.SQL.query!(RiskGame.Repo, "SELECT COUNT(*) FROM public.users", [])
    games_count = Ecto.Adapters.SQL.query!(RiskGame.Repo, "SELECT COUNT(*) FROM public.games", [])

    Mix.shell().info("Found #{users_count.rows |> hd() |> hd()} users to migrate")
    Mix.shell().info("Found #{games_count.rows |> hd() |> hd()} games to migrate")
  end

  defp migrate_users do
    Mix.shell().info("Migrating users from public.users to elixir_risk.users...")

    # Insert users from Node.js schema into Elixir schema
    sql = """
    INSERT INTO elixir_risk.users (id, username, email, password_hash, inserted_at, updated_at)
    SELECT id, username, email, password, created_at, updated_at
    FROM public.users
    ON CONFLICT (id) DO NOTHING
    """

    case Ecto.Adapters.SQL.query(RiskGame.Repo, sql, []) do
      {:ok, %{num_rows: count}} ->
        Mix.shell().info("Migrated #{count} users successfully!")
      {:error, reason} ->
        Mix.shell().error("Migration failed: #{inspect(reason)}")
    end
  end

  defp migrate_games do
    Mix.shell().info("Migrating games from public.games to elixir_risk.game_rooms...")
    # Similar INSERT INTO ... SELECT ... logic
  end

  defp migrate_all do
    migrate_users()
    migrate_games()
    # ... other tables
  end
end
```

#### 4. Parallel Authentication System

**Strategy**: Share JWT secret between Node.js and Elixir

**Node.js** (`backend/.env`):
```bash
JWT_SECRET=your_32_char_secret_shared_with_elixir
```

**Elixir** (`config/config.exs`):
```elixir
config :risk_game, RiskGameWeb.Auth,
  jwt_secret: System.get_env("JWT_SECRET") || "your_32_char_secret_shared_with_elixir"
```

**Auth Plug** (`lib/risk_game_web/plugs/auth.ex`):
```elixir
defmodule RiskGameWeb.Plugs.Auth do
  import Plug.Conn
  alias RiskGame.Accounts

  def init(opts), do: opts

  def call(conn, _opts) do
    with ["Bearer " <> token] <- get_req_header(conn, "authorization"),
         {:ok, claims} <- verify_jwt(token),
         {:ok, user} <- Accounts.get_user(claims["user_id"]) do
      assign(conn, :current_user, user)
    else
      _ -> conn
    end
  end

  defp verify_jwt(token) do
    secret = Application.get_env(:risk_game, RiskGameWeb.Auth)[:jwt_secret]
    # Use Joken or similar to verify JWT
    # Must match Node.js JWT format exactly
  end
end
```

---

## Phase 3.5: The "Oh Shit, Multiplayer" Phase

### Actual Multiplayer Features (Not Just "PubSub Exists")

#### 1. Lobby System for Finding Games

**Already started in Phase 2!** But enhance with:

```elixir
# lib/risk_game/games.ex
def list_public_games(filters \\ %{}) do
  from(g in Game,
    where: "public" in g.flags,
    where: g.status == "lobby",
    order_by: [desc: g.inserted_at]
  )
  |> apply_filters(filters)
  |> Repo.all()
  |> Repo.preload([:players, :map])
end

defp apply_filters(query, %{game_mode: mode}) when not is_nil(mode) do
  from g in query, where: fragment("? @> ?", g.config, ^%{game_mode: mode})
end
```

**LiveView** (`lib/risk_game_web/live/lobby_live.ex`):
```elixir
def mount(_params, _session, socket) do
  if connected?(socket) do
    # Subscribe to lobby updates
    Phoenix.PubSub.subscribe(RiskGame.PubSub, "lobby:updates")

    # Track presence in lobby
    RiskGameWeb.Presence.track(self(), "lobby", socket.assigns.current_user.id, %{
      browsing: true
    })
  end

  games = Games.list_public_games()
  {:ok, assign(socket, games: games)}
end

def handle_info({:game_created, game}, socket) do
  # Real-time: new game appears instantly
  {:noreply, update(socket, :games, fn games -> [game | games] end)}
end

def handle_info({:game_started, game_id}, socket) do
  # Real-time: remove started game from lobby
  {:noreply, update(socket, :games, fn games ->
    Enum.reject(games, &(&1.id == game_id))
  end)}
end
```

#### 2. Spectator Mode

**Problem**: Let users watch games without playing

**Solution**: Add spectator flag to presence + read-only game view

```elixir
# In GameServer
def add_spectator(game_id, user_id) do
  GenServer.call(via_tuple(game_id), {:add_spectator, user_id})
end

def handle_call({:add_spectator, user_id}, _from, state) do
  # Track spectator in presence
  RiskGameWeb.Presence.track(
    self(),
    "game:#{state.game.id}",
    user_id,
    %{role: "spectator", joined_at: DateTime.utc_now()}
  )

  # Broadcast spectator joined
  Phoenix.PubSub.broadcast(
    RiskGame.PubSub,
    "game:#{state.game.id}",
    {:spectator_joined, user_id}
  )

  {:reply, {:ok, state.game}, state}
end

# In LiveView
def handle_event("spectate", _params, socket) do
  game_id = socket.assigns.game.id
  user_id = socket.assigns.current_user.id

  case Games.add_spectator(game_id, user_id) do
    {:ok, _} ->
      {:noreply,
       socket
       |> assign(:is_spectator, true)
       |> put_flash(:info, "You are now spectating this game")}
    {:error, reason} ->
      {:noreply, put_flash(socket, :error, "Cannot spectate: #{reason}")}
  end
end
```

#### 3. Reconnection Handling That Actually Works

**Problem**: User disconnects mid-game, needs to rejoin seamlessly

**Solution**: Track connection state + automatic rejoin

```elixir
# In LiveView
def mount(%{"game_id" => game_id}, _session, socket) do
  if connected?(socket) do
    case Games.get_game(game_id) do
      {:ok, game} ->
        user_id = socket.assigns.current_user.id

        # Check if user was previously in this game
        case Games.get_game_player(game_id, user_id) do
          {:ok, game_player} ->
            # User is reconnecting - restore state
            Phoenix.PubSub.subscribe(RiskGame.PubSub, "game:#{game_id}")

            # Track presence (replaces old disconnected presence)
            RiskGameWeb.Presence.track(self(), "game:#{game_id}", user_id, %{
              online_at: DateTime.utc_now(),
              status: "reconnected"
            })

            # Notify others user reconnected
            Phoenix.PubSub.broadcast(
              RiskGame.PubSub,
              "game:#{game_id}",
              {:player_reconnected, user_id}
            )

            {:ok, assign(socket, game: game, game_player: game_player, reconnected: true)}

          {:error, :not_found} ->
            # New user joining
            {:ok, assign(socket, game: game, reconnected: false)}
        end

      {:error, :not_found} ->
        {:ok,
         socket
         |> put_flash(:error, "Game not found")
         |> redirect(to: ~p"/lobby")}
    end
  else
    # Initial HTTP render
    {:ok, assign(socket, game: nil)}
  end
end

# Handle disconnect gracefully
def terminate(_reason, socket) do
  if socket.assigns[:game] do
    # Mark user as disconnected (but don't remove from game yet)
    # Give them 5 minutes to reconnect before kicking
    %{game_id: socket.assigns.game.id, user_id: socket.assigns.current_user.id}
    |> RiskGame.Workers.DisconnectTimeoutWorker.new(schedule_in: 300)  # 5 minutes
    |> Oban.insert()
  end
  :ok
end
```

#### 4. Chat (Remember Chat? That Thing Humans Do?)

**Problem**: Players need to communicate

**Solution**: Chat system with PubSub

```elixir
# Schema
defmodule RiskGame.Chat.Message do
  use Ecto.Schema

  schema "chat_messages" do
    belongs_to :game, RiskGame.Games.Game
    belongs_to :user, RiskGame.Accounts.User, type: :binary_id
    field :content, :string
    field :type, :string, default: "chat"  # or "system", "game_event"

    timestamps(type: :utc_datetime_usec, updated_at: false)
  end
end

# Context
defmodule RiskGame.Chat do
  def send_message(game_id, user_id, content) do
    %Message{}
    |> Message.changeset(%{game_id: game_id, user_id: user_id, content: content})
    |> Repo.insert()
    |> case do
      {:ok, message} ->
        message = Repo.preload(message, :user)

        # Broadcast to all players/spectators
        Phoenix.PubSub.broadcast(
          RiskGame.PubSub,
          "game:#{game_id}:chat",
          {:new_message, message}
        )

        {:ok, message}
      error -> error
    end
  end

  def list_messages(game_id, limit \\ 50) do
    from(m in Message,
      where: m.game_id == ^game_id,
      order_by: [desc: m.inserted_at],
      limit: ^limit,
      preload: :user
    )
    |> Repo.all()
    |> Enum.reverse()  # Show oldest first
  end
end

# LiveView Component
defmodule RiskGameWeb.ChatComponent do
  use RiskGameWeb, :live_component

  def mount(socket) do
    {:ok, assign(socket, messages: [], message_input: "")}
  end

  def update(%{game_id: game_id}, socket) do
    if connected?(socket) do
      Phoenix.PubSub.subscribe(RiskGame.PubSub, "game:#{game_id}:chat")
    end

    messages = RiskGame.Chat.list_messages(game_id)
    {:ok, assign(socket, messages: messages, game_id: game_id)}
  end

  def handle_event("send_message", %{"content" => content}, socket) do
    game_id = socket.assigns.game_id
    user_id = socket.assigns.current_user.id

    case RiskGame.Chat.send_message(game_id, user_id, content) do
      {:ok, _message} ->
        {:noreply, assign(socket, :message_input, "")}
      {:error, _} ->
        {:noreply, put_flash(socket, :error, "Failed to send message")}
    end
  end

  def handle_info({:new_message, message}, socket) do
    {:noreply, update(socket, :messages, fn messages -> messages ++ [message] end)}
  end

  def render(assigns) do
    ~H"""
    <div class="chat-container">
      <div class="messages" phx-update="append" id="chat-messages">
        <%= for message <- @messages do %>
          <div class="message" id={"message-#{message.id}"}>
            <span class="username"><%= message.user.username %></span>
            <span class="content"><%= message.content %></span>
          </div>
        <% end %>
      </div>

      <form phx-submit="send_message" phx-target={@myself}>
        <input
          type="text"
          name="content"
          value={@message_input}
          placeholder="Type a message..."
          phx-debounce="300"
        />
        <button type="submit">Send</button>
      </form>
    </div>
    """
  end
end
```

---

## Critical Infrastructure Checklist

### Database Isolation ✅
- [x] Separate schemas (`elixir_risk.*` vs `public.*`)
- [ ] Migration scripts ready
- [ ] Rollback plan documented

### Background Jobs ⏰
- [ ] Oban installed and configured
- [ ] Turn timer workers
- [ ] Game cleanup workers
- [ ] Disconnect timeout workers

### Presence Tracking 👥
- [ ] Phoenix.Presence configured
- [ ] Online/offline detection
- [ ] Spectator presence
- [ ] Reconnection detection

### Multiplayer Features 🎮
- [ ] Lobby system with real-time updates
- [ ] Spectator mode
- [ ] Reconnection handling
- [ ] Chat system

### Shared Infrastructure 🔗
- [ ] JWT authentication (shared secret)
- [ ] Asset CDN (R2 configuration)
- [ ] Database connection pooling
- [ ] Redis for sessions (if needed)

---

## Next Steps

1. **Add Oban** - `mix deps.get` after adding to mix.exs
2. **Add Presence** - Already in Phoenix, just needs configuration
3. **Create Migration Scripts** - Start with dry-run
4. **Implement Chat** - Schema + Context + LiveView component
5. **Test Reconnection** - Kill browser tab, rejoin game
6. **Configure R2** - Asset storage for both apps

## R2 Configuration for Elixir

**Installation**:
```elixir
# mix.exs
{:ex_aws, "~> 2.0"},
{:ex_aws_s3, "~> 2.0"},
{:hackney, "~> 1.9"},
{:sweet_xml, "~> 0.6"}
```

**Config** (`config/config.exs`):
```elixir
config :ex_aws,
  access_key_id: System.get_env("ASSET_ACCESS_KEY_ID"),
  secret_access_key: System.get_env("ASSET_SECRET_ACCESS_KEY"),
  region: "auto",
  s3: [
    scheme: "https://",
    host: "84ad0307fb40b859de005c18c9c76f2a.r2.cloudflarestorage.com",
    region: "auto"
  ]

config :risk_game,
  asset_bucket: "conquestk",
  asset_base_url: System.get_env("PUBLIC_ASSET_BASE_URL") || "https://assets.conquestk.com"
```

**Usage**:
```elixir
defmodule RiskGame.Assets do
  def upload_map_image(path, file_binary) do
    ExAws.S3.put_object("conquestk", path, file_binary)
    |> ExAws.request()
  end

  def resolve_asset_url(path) do
    base = Application.get_env(:risk_game, :asset_base_url)
    "#{base}/#{path}"
  end
end
```

Done! This document covers all the "oh shit" moments and infrastructure concerns.
