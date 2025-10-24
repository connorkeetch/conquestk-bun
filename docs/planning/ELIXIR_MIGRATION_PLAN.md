# Risk Game - Elixir/Phoenix/LiveView Migration Plan

> **IMPORTANT**: This is an experimental branch for learning Elixir/Phoenix/LiveView patterns by rebuilding our Risk game. This is NOT intended to replace the production Node.js implementation - it's purely educational.

**Status**: Planning Phase
**Created**: October 24, 2025
**Branch**: `elixir-phoenix-experiment`

---

## Executive Summary

This document outlines the plan to create a parallel implementation of ConquestK (our Risk-inspired strategy game) using Elixir, Phoenix, and LiveView. The goal is to replicate the core gameplay functionality from our existing React/Node.js/Socket.IO implementation while learning functional programming patterns and OTP (Open Telecom Platform) architecture.

**Key Constraints:**
- Must deploy to Railway (PostgreSQL + container deployment)
- Must work with our existing database schema (or minimal modifications)
- Developer is NOT a professional programmer - documentation must be explicit
- This is a LEARNING EXERCISE, not a production replacement

---

## 1. Current Architecture Analysis

### 1.1 Technology Stack (Current)

**Backend (Node.js/TypeScript):**
- Express 5 server on Node.js 24
- Socket.IO for real-time multiplayer
- PostgreSQL for persistence
- Redis for caching, sessions, and BullMQ job queues
- Deterministic game engine with lockstep frame synchronization
- BullMQ workers for async game actions, battles, cleanup

**Frontend (React 19):**
- React 19 + Vite 7 build system
- Redux Toolkit for state management
- Tailwind CSS v4 for styling
- WebSocket client (Socket.IO client)
- Canvas-based game board rendering

**Shared Package:**
- TypeScript types shared between frontend/backend
- Game state interfaces, action types, territory definitions

### 1.2 Core Game Features

Based on analysis of the codebase, here are the implemented features:

**Pre-Game:**
- User authentication (JWT + session cookies)
- Game room creation with configurable options
- Player lobby with ready-up system
- Map selection from database
- AI player support (multiple difficulty levels)
- Team-based gameplay option
- Hidden Treasures (card collection) system configuration

**Core Gameplay:**
1. **Reinforcement Phase**: Deploy armies to owned territories
2. **Attack Phase**: Attack adjacent territories with dice rolls
3. **Fortification Phase**: Move armies between connected territories
4. **Card Trading**: Collect and redeem treasure sets for bonus armies
5. **Capital Capture Variant**: Special elimination rules for capitals
6. **King of the Hill**: Territory control objectives

**Real-Time Features:**
- Lockstep frame synchronization for deterministic state
- Fog of war (players see limited enemy information)
- Live chat with clan/team channels
- Turn timers with time banks
- AFK detection and auto-skip
- Spectator mode
- Reconnection handling with state recovery

**Post-Game:**
- ELO-based skill rating system
- Clan XP and progression
- Match history and replay system
- Statistics tracking

### 1.3 Game State Structure

The current game state is a complex TypeScript object with the following key components:

```typescript
interface GameState {
  roomId: string
  phase: 'lobby' | 'reinforcement' | 'attack' | 'fortify' | 'game_over'
  turnNumber: number
  currentPlayerId: string

  // Territory state
  territories: {
    [territoryId: string]: {
      id: string
      ownerId: string
      armies: number
      name: string
      // ... continent/sector info, modifiers
    }
  }

  // Player state
  players: {
    [playerId: string]: {
      id: string
      username: string
      color: PlayerColor
      isAlive: boolean
      reinforcementArmies: number
      treasures: Metal[]  // card collection
      teamId?: string
      // ... stats, ratings, AI config
    }
  }

  // Game configuration
  config: {
    mapId: string
    turnTimer?: number
    timeBank?: number
    hiddenTreasuresEnabled: boolean
    capitalCaptureEnabled: boolean
    kingOfTheHillConfig?: KingOfTheHillConfig
    // ... fog settings, AI count, etc.
  }

  // RNG state (for deterministic replay)
  rngSeed: string
  rngState: DeterministicRngState

  // Lockstep frame tracking
  currentFrame: number
  lastChecksum?: string
}
```

**Key Data Structures:**
- **Territories**: Map of territory IDs to territory objects (ownership, army count, modifiers)
- **Players**: Map of player IDs to player state (color, cards, stats, alive status)
- **Adjacency Graph**: Map territories know their neighbors for attack/fortify validation
- **Sectors/Continents**: Groupings of territories that grant bonus armies
- **Battle Results**: Deterministic dice roll outcomes stored per frame
- **Game Log**: Filtered event history per player (fog-aware)

### 1.4 Socket.IO Events

The current system uses these key Socket.IO events:

**Client → Server:**
- `game-action` - Unified action handler (deploy, attack, fortify, trade cards, resign)
- `joinRoom` - Join a game room
- `leaveRoom` - Leave a game room
- `chat:message` - Send chat message
- `ready` - Toggle ready state in lobby
- `startGame` - Host initiates game start
- `ping` - Latency measurement

**Server → Client:**
- `game-action:frame-committed` - Lockstep frame update
- `game-action:checksum` - State checksum for validation
- `game:snapshot` - Full state sync (reconnect/recovery)
- `phaseChange` - Game phase transition
- `game-log:append` - Fog-filtered game log entry
- `game-log:reveal` - Post-game full log reveal
- `capitalAttackCheck` - Prompt for capital capture decision
- `chat:message` - Broadcast chat message
- `playerJoined` / `playerLeft` - Lobby updates
- `error` - Error messages

**LiveView Equivalents:**
- LiveView events use `phx-click`, `phx-change`, etc. on client
- Server pushes updates via `push_event/3` or assigns
- PubSub replaces Socket.IO rooms for broadcasting

### 1.5 Database Schema (Simplified)

Key tables we need to support:

```sql
-- Core tables
users (id, username, email, password_hash, skill_rating, ...)
game_rooms (id, status, phase, host_id, map_id, config, ...)
room_players (room_id, user_id, color, is_ready, placement, ...)
game_states (room_id, state_data, current_player_id, ...)
game_moves (id, room_id, player_id, action_type, action_data, ...)
match_frames (room_id, frame_number, action, state_checksum, ...)

-- Map data
maps (id, name, territories, sectors, adjacencies, ...)
map_territories (map_id, territory_id, name, x, y, ...)
territory_adjacencies (map_id, territory_id, adjacent_id, ...)

-- Supporting tables
player_stats (user_id, wins, losses, total_games, ...)
game_results (room_id, winner_id, duration, ...)
```

**Database Strategy for Elixir:**
- Can share the same PostgreSQL database
- Use Ecto schemas to map to existing tables
- May need minor schema adjustments (add columns, not breaking changes)
- Consider a separate schema prefix (e.g., `elixir_*` tables) to avoid conflicts

---

## 2. Elixir Architecture Design

### 2.1 Why Elixir/Phoenix/LiveView?

**Advantages for This Use Case:**
- **Built-in concurrency**: Each game room can be an isolated GenServer process
- **Fault tolerance**: OTP supervision trees handle crashes gracefully
- **Real-time by default**: Phoenix Channels and LiveView are built for this
- **Stateful server**: No need to sync state across clients - server is source of truth
- **Pattern matching**: Game rule logic becomes more declarative
- **Hot code reloading**: Update game logic without stopping servers

**Challenges:**
- **Different paradigm**: Functional programming vs. object-oriented
- **Steeper learning curve**: OTP, processes, supervision trees
- **Smaller ecosystem**: Fewer libraries than Node.js
- **No shared types**: Can't use TypeScript types from `shared/` package

### 2.2 Core Modules Structure

```
lib/
├── risk_game/
│   ├── application.ex              # OTP application entry point
│   ├── repo.ex                     # Ecto repository
│   │
│   ├── accounts/                   # User authentication & management
│   │   ├── user.ex                # User schema
│   │   └── auth.ex                # Authentication logic
│   │
│   ├── games/                      # Game domain logic
│   │   ├── game.ex                # Game schema (room)
│   │   ├── player.ex              # Player schema
│   │   ├── game_state.ex          # Game state schema
│   │   ├── game_server.ex         # GenServer for game room state
│   │   ├── game_supervisor.ex     # Dynamic supervisor for games
│   │   ├── game_registry.ex       # Process registry for games
│   │   └── rules/                 # Game rule modules
│   │       ├── reinforcement.ex
│   │       ├── attack.ex
│   │       ├── fortify.ex
│   │       ├── combat.ex          # Dice roll logic
│   │       └── treasures.ex       # Card collection system
│   │
│   ├── maps/                       # Map data & loading
│   │   ├── map.ex                 # Map schema
│   │   ├── territory.ex           # Territory schema
│   │   └── loader.ex              # Map loading from DB
│   │
│   └── presence.ex                 # Phoenix Presence for player tracking
│
├── risk_game_web/
│   ├── endpoint.ex                 # Phoenix endpoint
│   ├── router.ex                   # HTTP routes
│   ├── telemetry.ex                # Metrics
│   │
│   ├── controllers/                # REST API endpoints
│   │   ├── auth_controller.ex
│   │   ├── game_controller.ex
│   │   └── map_controller.ex
│   │
│   ├── live/                       # LiveView components
│   │   ├── lobby_live.ex          # Game lobby
│   │   ├── game_live.ex           # Main game view
│   │   └── components/            # Reusable LiveView components
│   │       ├── game_board.ex
│   │       ├── player_list.ex
│   │       └── chat.ex
│   │
│   └── channels/                   # Phoenix Channels (if needed)
│       └── game_channel.ex
│
└── risk_game.ex                    # Main application module
```

### 2.3 State Management Strategy

**Game State Lives in GenServer:**

```elixir
defmodule RiskGame.Games.GameServer do
  use GenServer

  # Client API
  def start_link(room_id) do
    GenServer.start_link(__MODULE__, room_id, name: via_tuple(room_id))
  end

  def deploy_armies(room_id, player_id, territory_id, count) do
    GenServer.call(via_tuple(room_id), {:deploy, player_id, territory_id, count})
  end

  # Server Callbacks
  def init(room_id) do
    # Load game state from database
    game_state = load_game_state(room_id)
    {:ok, game_state}
  end

  def handle_call({:deploy, player_id, territory_id, count}, _from, state) do
    case RiskGame.Games.Rules.Reinforcement.deploy(state, player_id, territory_id, count) do
      {:ok, new_state} ->
        # Persist to database
        save_game_state(new_state)
        # Broadcast to LiveView clients via PubSub
        broadcast_state_update(new_state)
        {:reply, {:ok, new_state}, new_state}

      {:error, reason} ->
        {:reply, {:error, reason}, state}
    end
  end
end
```

**Key Design Decisions:**

1. **One GenServer per active game room**
   - Isolated state, crash doesn't affect other games
   - Dynamic supervisor spawns/stops game servers
   - Registry allows lookup by room ID

2. **Pure functional game rules**
   - Rules modules take state, return `{:ok, new_state}` or `{:error, reason}`
   - GenServer handles side effects (DB writes, PubSub broadcasts)
   - Easier to test in isolation

3. **Database as backup, not source of truth**
   - GameServer holds authoritative state in memory
   - Persist to DB after each action (async writes?)
   - On crash, supervisor restarts and reloads from DB

4. **PubSub for LiveView updates**
   - GameServer broadcasts changes to `"game:#{room_id}"` topic
   - All LiveView clients subscribe to that topic
   - LiveView assigns update automatically

### 2.4 LiveView Event Flow

```elixir
defmodule RiskGameWeb.GameLive do
  use RiskGameWeb, :live_view

  def mount(%{"room_id" => room_id}, _session, socket) do
    if connected?(socket) do
      # Subscribe to game updates
      Phoenix.PubSub.subscribe(RiskGame.PubSub, "game:#{room_id}")
      # Track presence
      RiskGameWeb.Presence.track(self(), "game:#{room_id}", socket.assigns.current_user.id, %{})
    end

    # Load initial state
    game_state = RiskGame.Games.GameServer.get_state(room_id)

    {:ok, assign(socket, game: game_state, room_id: room_id)}
  end

  def handle_event("deploy_armies", %{"territory_id" => territory_id, "count" => count}, socket) do
    room_id = socket.assigns.room_id
    player_id = socket.assigns.current_user.id

    case RiskGame.Games.GameServer.deploy_armies(room_id, player_id, territory_id, count) do
      {:ok, _new_state} ->
        # No need to update assigns here - PubSub will trigger handle_info
        {:noreply, socket}

      {:error, reason} ->
        {:noreply, put_flash(socket, :error, reason)}
    end
  end

  def handle_info({:game_updated, new_state}, socket) do
    # Broadcasted from GameServer via PubSub
    {:noreply, assign(socket, game: new_state)}
  end
end
```

### 2.5 Database Schema with Ecto

```elixir
defmodule RiskGame.Games.Game do
  use Ecto.Schema
  import Ecto.Changeset

  schema "game_rooms" do
    field :status, :string
    field :phase, :string
    field :host_id, :integer
    field :map_id, :integer
    field :config, :map  # JSONB column

    has_many :players, RiskGame.Games.Player, foreign_key: :room_id
    has_one :game_state, RiskGame.Games.GameState, foreign_key: :room_id

    timestamps()
  end

  def changeset(game, attrs) do
    game
    |> cast(attrs, [:status, :phase, :host_id, :map_id, :config])
    |> validate_required([:status, :host_id, :map_id])
    |> validate_inclusion(:status, ["lobby", "playing", "completed"])
  end
end

defmodule RiskGame.Games.GameState do
  use Ecto.Schema

  schema "game_states" do
    belongs_to :room, RiskGame.Games.Game, foreign_key: :room_id
    field :state_data, :map  # JSONB - full game state
    field :current_player_id, :integer
    field :turn_number, :integer

    timestamps()
  end
end
```

**JSONB for Flexible State:**
- Store full game state as JSONB in `state_data` column
- Allows rapid iteration without schema migrations
- Can extract hot fields (current_player_id) to indexed columns later

### 2.6 Real-Time Communication

**Phoenix PubSub vs. Socket.IO:**

| Feature | Socket.IO | Phoenix PubSub + LiveView |
|---------|-----------|---------------------------|
| Room-based broadcasting | `io.to("room").emit(...)` | `PubSub.broadcast("game:#{id}", ...)` |
| Client subscriptions | `socket.join("room")` | `PubSub.subscribe("game:#{id}")` |
| Event emission | `socket.emit("event", data)` | `push_event(socket, "event", data)` |
| State sync | Manual via events | Automatic via LiveView assigns |
| Reconnection | Custom logic | Built-in LiveView reconnect |

**Advantages:**
- No need for manual state reconciliation
- LiveView diffs the DOM, only sends changes
- Presence built-in for tracking online players
- No WebSocket libraries needed

**Trade-offs:**
- LiveView is server-rendered - can't do complex client-side animations easily
- Canvas rendering requires JavaScript hooks
- May need Phoenix Channels for some real-time features (chat?)

---

## 3. Migration Strategy

### 3.1 What Can Be Ported Directly

**Game Rules Logic:**
- Territory adjacency validation
- Army deployment rules
- Attack combat calculations (dice rolls)
- Fortification path finding
- Card collection and redemption logic
- Victory condition checks

**Data:**
- Territory definitions (coordinates, names, adjacencies)
- Map metadata (continents, bonuses)
- User accounts (if using same DB)

**Algorithms:**
- Deterministic RNG (can port to Elixir)
- ELO rating calculations
- Pathfinding for fortification

### 3.2 What Needs Complete Reimplementation

**State Management:**
- Redux → GenServer + LiveView assigns
- Client-side optimistic updates → Server authoritative
- Socket.IO event handlers → LiveView event handlers + PubSub

**Networking:**
- Socket.IO rooms → Phoenix Channels + PubSub topics
- Manual state sync → Automatic LiveView updates
- Reconnection logic → Built-in LiveView reconnect

**UI Rendering:**
- React components → LiveView templates (HEEx)
- Canvas board rendering → LiveView + JavaScript hooks
- CSS-in-JS → Tailwind (can reuse existing classes)

**Authentication:**
- JWT + session cookies → Phoenix auth (Guardian? Pow? Built-in?)
- Passport.js equivalent → Elixir authentication library

### 3.3 Data Structure Conversions

**TypeScript → Elixir Types:**

```typescript
// TypeScript
interface Territory {
  id: string
  ownerId: string
  armies: number
  name: string
}
```

```elixir
# Elixir (struct)
defmodule Territory do
  @enforce_keys [:id, :name]
  defstruct [:id, :owner_id, :armies, :name]

  @type t :: %__MODULE__{
    id: String.t(),
    owner_id: String.t() | nil,
    armies: non_neg_integer(),
    name: String.t()
  }
end
```

**Game State Map:**
- TypeScript: `{ [territoryId: string]: Territory }`
- Elixir: `%{territory_id => Territory.t()}`

**Pattern Matching Instead of Conditionals:**

```typescript
// TypeScript
if (phase === 'reinforcement') {
  // deploy logic
} else if (phase === 'attack') {
  // attack logic
}
```

```elixir
# Elixir
case game_state.phase do
  :reinforcement -> deploy_armies(...)
  :attack -> process_attack(...)
  :fortify -> fortify_territory(...)
end
```

### 3.4 Missing Features in Current Implementation

Based on code analysis, these features are mentioned but may not be fully implemented:

- **Replay system**: Database structure exists but frontend may be incomplete
- **King of the Hill**: Config exists but rules may not be fully tested
- **Spectator mode**: Query param exists but fog logic unclear
- **Clan wars**: Schema exists but workflow unclear

**Migration Approach:**
- Skip incomplete features initially
- Focus on core gameplay loop (reinforcement → attack → fortify)
- Add advanced features after basic game works

---

## 4. File Structure

```
elixir_risk/                        # Subdirectory to avoid overwriting Node.js app
├── config/
│   ├── config.exs                  # Base config
│   ├── dev.exs                     # Development overrides
│   ├── prod.exs                    # Production overrides
│   ├── runtime.exs                 # Runtime config (DATABASE_URL, etc.)
│   └── test.exs                    # Test environment
│
├── lib/
│   ├── risk_game/
│   │   ├── application.ex          # OTP application
│   │   ├── repo.ex                 # Ecto repo
│   │   │
│   │   ├── accounts/               # User management
│   │   │   ├── user.ex
│   │   │   └── auth.ex
│   │   │
│   │   ├── games/                  # Core game logic
│   │   │   ├── game.ex             # Game room schema
│   │   │   ├── player.ex           # Player schema
│   │   │   ├── game_state.ex       # State schema
│   │   │   ├── territory.ex        # Territory struct
│   │   │   │
│   │   │   ├── game_server.ex      # GenServer for game room
│   │   │   ├── game_supervisor.ex  # DynamicSupervisor
│   │   │   ├── game_registry.ex    # Process registry
│   │   │   │
│   │   │   └── rules/              # Pure functional rules
│   │   │       ├── reinforcement.ex
│   │   │       ├── attack.ex
│   │   │       ├── fortify.ex
│   │   │       ├── combat.ex
│   │   │       ├── treasures.ex
│   │   │       └── validation.ex
│   │   │
│   │   ├── maps/                   # Map domain
│   │   │   ├── map.ex
│   │   │   ├── territory.ex
│   │   │   ├── adjacency.ex
│   │   │   └── loader.ex
│   │   │
│   │   └── presence.ex             # Phoenix Presence
│   │
│   ├── risk_game_web/
│   │   ├── endpoint.ex             # Phoenix endpoint
│   │   ├── router.ex               # Routes
│   │   ├── telemetry.ex
│   │   │
│   │   ├── controllers/
│   │   │   ├── auth_controller.ex
│   │   │   ├── game_controller.ex
│   │   │   └── map_controller.ex
│   │   │
│   │   ├── live/                   # LiveView pages
│   │   │   ├── lobby_live.ex       # Game lobby
│   │   │   ├── lobby_live.html.heex
│   │   │   ├── game_live.ex        # Game room
│   │   │   ├── game_live.html.heex
│   │   │   │
│   │   │   └── components/         # Reusable components
│   │   │       ├── game_board.ex
│   │   │       ├── player_list.ex
│   │   │       ├── territory_info.ex
│   │   │       └── chat.ex
│   │   │
│   │   ├── channels/               # Phoenix Channels (if needed)
│   │   │   └── game_channel.ex
│   │   │
│   │   └── views/                  # View helpers
│   │       └── error_view.ex
│   │
│   └── risk_game.ex                # Main module
│
├── priv/
│   ├── repo/
│   │   ├── migrations/             # Ecto migrations
│   │   └── seeds.exs               # Seed data
│   │
│   └── static/                     # Static assets
│       ├── css/
│       ├── js/
│       └── images/
│
├── test/
│   ├── risk_game/
│   │   ├── games/
│   │   │   └── rules/              # Test game rules
│   │   │       ├── attack_test.exs
│   │   │       ├── combat_test.exs
│   │   │       └── fortify_test.exs
│   │   │
│   │   └── game_server_test.exs    # GenServer tests
│   │
│   ├── risk_game_web/
│   │   ├── controllers/
│   │   └── live/
│   │
│   ├── support/                    # Test helpers
│   │   ├── conn_case.ex
│   │   ├── channel_case.ex
│   │   └── data_case.ex
│   │
│   └── test_helper.exs
│
├── mix.exs                         # Elixir project file
├── mix.lock                        # Dependency lock
├── .formatter.exs                  # Code formatter config
└── README.md                       # Elixir-specific README
```

---

## 5. Social Features Architecture

**Note:** This section details how to implement social features (chat, rankings, clans, analytics, mobile) using Elixir's built-in tools and Phoenix ecosystem. These features leverage Elixir 1.17.3 and Phoenix 1.8.1 capabilities.

### 5.1 Chat System

**Architecture:**
- Phoenix Channels for real-time messaging
- PostgreSQL for message history
- Presence for "user is typing" indicators
- No external chat service needed

**Implementation:**

```elixir
# lib/risk_game_web/channels/chat_channel.ex
defmodule RiskGameWeb.ChatChannel do
  use RiskGameWeb, :channel
  alias RiskGame.Chat
  alias RiskGameWeb.Presence

  def join("chat:" <> room_id, _params, socket) do
    send(self(), :after_join)
    {:ok, assign(socket, :room_id, room_id)}
  end

  def handle_info(:after_join, socket) do
    {:ok, _} = Presence.track(socket, socket.assigns.user_id, %{
      online_at: inspect(System.system_time(:second)),
      typing: false
    })

    push(socket, "presence_state", Presence.list(socket))
    {:noreply, socket}
  end

  def handle_in("new_msg", %{"body" => body}, socket) do
    message = Chat.create_message(%{
      user_id: socket.assigns.user_id,
      room_id: socket.assigns.room_id,
      body: body,
      timestamp: DateTime.utc_now()
    })

    broadcast!(socket, "new_msg", %{
      user: socket.assigns.username,
      body: body,
      timestamp: message.timestamp
    })

    {:noreply, socket}
  end

  def handle_in("typing", %{"typing" => typing}, socket) do
    {:ok, _} = Presence.update(socket, socket.assigns.user_id, %{
      typing: typing,
      updated_at: System.system_time(:second)
    })

    {:noreply, socket}
  end
end
```

**Database Schema:**

```elixir
defmodule RiskGame.Chat.Message do
  use Ecto.Schema
  import Ecto.Changeset

  schema "chat_messages" do
    field :body, :string
    field :room_id, :string
    field :channel_type, :string  # "global", "team", "clan"

    belongs_to :user, RiskGame.Accounts.User

    timestamps()
  end

  def changeset(message, attrs) do
    message
    |> cast(attrs, [:body, :room_id, :channel_type, :user_id])
    |> validate_required([:body, :room_id, :user_id])
    |> validate_length(:body, max: 500)
  end
end
```

**LiveView Integration:**

```elixir
# lib/risk_game_web/live/game_live.ex (chat component)
defmodule RiskGameWeb.GameLive.ChatComponent do
  use RiskGameWeb, :live_component

  def mount(socket) do
    if connected?(socket) do
      RiskGameWeb.Endpoint.subscribe("chat:#{socket.assigns.room_id}")
    end

    {:ok, assign(socket, messages: [], typing_users: [])}
  end

  def handle_event("send_message", %{"message" => message}, socket) do
    RiskGameWeb.Endpoint.broadcast(
      "chat:#{socket.assigns.room_id}",
      "new_message",
      %{user: socket.assigns.current_user, message: message}
    )

    {:noreply, socket}
  end

  def handle_info(%{event: "new_message", payload: payload}, socket) do
    {:noreply, update(socket, :messages, &[payload | &1])}
  end
end
```

### 5.2 Rankings/Leaderboards

**Architecture:**
- Ecto window functions for efficient queries
- Materialized views for performance
- Oban jobs for periodic ELO recalculation
- LiveView for real-time rank updates

**Implementation:**

```elixir
# lib/risk_game/rankings.ex
defmodule RiskGame.Rankings do
  import Ecto.Query
  alias RiskGame.Repo
  alias RiskGame.Accounts.User

  def global_leaderboard(opts \\ []) do
    limit = Keyword.get(opts, :limit, 100)
    timeframe = Keyword.get(opts, :timeframe, :all_time)

    from(u in User,
      left_join: s in assoc(u, :player_stats),
      select: %{
        user_id: u.id,
        username: u.username,
        skill_rating: u.skill_rating,
        wins: s.wins,
        losses: s.losses,
        total_games: s.total_games,
        win_rate: fragment("ROUND((? * 100.0 / NULLIF(?, 0)), 2)", s.wins, s.total_games),
        rank: over(row_number(), order_by: [desc: u.skill_rating])
      },
      order_by: [desc: u.skill_rating],
      limit: ^limit
    )
    |> apply_timeframe_filter(timeframe)
    |> Repo.all()
  end

  def user_rank(user_id) do
    from(u in User,
      select: %{
        rank: fragment(
          "SELECT COUNT(*) + 1 FROM users WHERE skill_rating > ?",
          u.skill_rating
        ),
        percentile: fragment(
          "SELECT PERCENT_RANK() OVER (ORDER BY skill_rating) * 100 FROM users WHERE id = ?",
          ^user_id
        )
      },
      where: u.id == ^user_id
    )
    |> Repo.one()
  end

  # Materialized view for performance
  def refresh_leaderboard_cache do
    Repo.query!("""
      REFRESH MATERIALIZED VIEW CONCURRENTLY leaderboard_cache
    """)
  end

  defp apply_timeframe_filter(query, :all_time), do: query
  defp apply_timeframe_filter(query, :monthly) do
    from [u, s] in query,
      where: s.updated_at >= ago(30, "day")
  end
end
```

**Oban Job for ELO Updates:**

```elixir
# lib/risk_game/workers/elo_recalculation_worker.ex
defmodule RiskGame.Workers.EloRecalculationWorker do
  use Oban.Worker, queue: :rankings, max_attempts: 3

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"match_id" => match_id}}) do
    match = RiskGame.Games.get_match!(match_id)

    # Calculate ELO changes for all players
    Enum.each(match.players, fn player ->
      new_rating = calculate_elo_change(player, match.result)
      RiskGame.Accounts.update_user_rating(player.user_id, new_rating)
    end)

    # Refresh leaderboard cache
    RiskGame.Rankings.refresh_leaderboard_cache()

    :ok
  end

  defp calculate_elo_change(player, result) do
    # K-factor varies by rating and games played
    k_factor = if player.total_games < 30, do: 40, else: 20

    expected_score = 1 / (1 + :math.pow(10, (opponent_avg_rating - player.rating) / 400))
    actual_score = if result == :won, do: 1, else: 0

    player.rating + k_factor * (actual_score - expected_score)
  end
end
```

**LiveView Real-time Updates:**

```elixir
defmodule RiskGameWeb.LeaderboardLive do
  use RiskGameWeb, :live_view
  alias RiskGame.Rankings

  def mount(_params, _session, socket) do
    if connected?(socket) do
      Phoenix.PubSub.subscribe(RiskGame.PubSub, "leaderboard:updates")
    end

    {:ok, assign(socket,
      leaderboard: Rankings.global_leaderboard(),
      user_rank: Rankings.user_rank(socket.assigns.current_user.id)
    )}
  end

  def handle_info({:rank_updated, user_id}, socket) do
    # Only refresh if it affects visible rankings
    {:noreply, update(socket, :leaderboard, &Rankings.global_leaderboard/0)}
  end
end
```

### 5.3 Clans/Teams

**Architecture:**
- Standard Ecto associations
- JSONB for flexible clan metadata
- Phoenix.PubSub for clan chat channels
- Permissions via simple Elixir modules

**Implementation:**

```elixir
# lib/risk_game/clans/clan.ex
defmodule RiskGame.Clans.Clan do
  use Ecto.Schema
  import Ecto.Changeset

  schema "clans" do
    field :name, :string
    field :tag, :string  # Short identifier (e.g., "[ACE]")
    field :description, :string
    field :metadata, :map  # JSONB for flexible data
    field :total_xp, :integer, default: 0
    field :level, :integer, default: 1

    belongs_to :founder, RiskGame.Accounts.User
    has_many :memberships, RiskGame.Clans.Membership
    has_many :members, through: [:memberships, :user]

    timestamps()
  end

  def changeset(clan, attrs) do
    clan
    |> cast(attrs, [:name, :tag, :description, :metadata, :founder_id])
    |> validate_required([:name, :tag, :founder_id])
    |> validate_length(:tag, min: 2, max: 5)
    |> validate_format(:tag, ~r/^[A-Z0-9]+$/)
    |> unique_constraint(:name)
    |> unique_constraint(:tag)
  end
end

defmodule RiskGame.Clans.Membership do
  use Ecto.Schema

  schema "clan_memberships" do
    field :role, :string  # "member", "officer", "leader"
    field :joined_at, :utc_datetime
    field :contribution_xp, :integer, default: 0

    belongs_to :clan, RiskGame.Clans.Clan
    belongs_to :user, RiskGame.Accounts.User

    timestamps()
  end
end
```

**Permission System:**

```elixir
defmodule RiskGame.Clans.Permissions do
  def can?(user, :manage_clan, clan) do
    membership = get_membership(user.id, clan.id)
    membership && membership.role in ["leader", "officer"]
  end

  def can?(user, :invite_members, clan) do
    can?(user, :manage_clan, clan)
  end

  def can?(user, :kick_member, clan, target_user) do
    membership = get_membership(user.id, clan.id)
    target_membership = get_membership(target_user.id, clan.id)

    membership.role == "leader" ||
    (membership.role == "officer" && target_membership.role == "member")
  end
end
```

**Clan Chat Channel:**

```elixir
defmodule RiskGameWeb.ClanChatChannel do
  use RiskGameWeb, :channel
  alias RiskGame.Clans

  def join("clan:" <> clan_id, _params, socket) do
    clan = Clans.get_clan!(clan_id)

    if Clans.is_member?(socket.assigns.user_id, clan_id) do
      {:ok, assign(socket, :clan, clan)}
    else
      {:error, %{reason: "Not a clan member"}}
    end
  end

  def handle_in("clan_msg", %{"body" => body}, socket) do
    broadcast!(socket, "clan_msg", %{
      user: socket.assigns.username,
      body: body,
      timestamp: DateTime.utc_now()
    })

    {:noreply, socket}
  end
end
```

### 5.4 Analytics Integration

**Architecture:**
- Telemetry for internal metrics
- Phoenix.LiveDashboard for monitoring
- Direct integration with Amplitude/MixPanel via HTTP client
- No need for separate analytics service

**Implementation:**

```elixir
# lib/risk_game/telemetry.ex
defmodule RiskGame.Telemetry do
  use Supervisor
  import Telemetry.Metrics

  def start_link(arg) do
    Supervisor.start_link(__MODULE__, arg, name: __MODULE__)
  end

  def init(_arg) do
    children = [
      {:telemetry_poller, measurements: periodic_measurements(), period: 10_000}
    ]

    Supervisor.init(children, strategy: :one_for_one)
  end

  def metrics do
    [
      # Game metrics
      counter("risk_game.game.created"),
      counter("risk_game.game.started"),
      counter("risk_game.game.completed"),
      distribution("risk_game.game.duration", unit: {:native, :minute}),

      # Player metrics
      counter("risk_game.player.joined"),
      counter("risk_game.player.left"),
      distribution("risk_game.player.actions_per_turn"),

      # Performance metrics
      summary("risk_game.game_server.handle_call.duration"),
      summary("phoenix.router_dispatch.duration", unit: {:native, :millisecond}),

      # Database metrics
      summary("risk_game.repo.query.total_time", unit: {:native, :millisecond}),
      counter("risk_game.repo.query.count")
    ]
  end

  defp periodic_measurements do
    [
      {RiskGame.Metrics, :measure_active_games, []}
    ]
  end
end
```

**Analytics Service Integration:**

```elixir
# lib/risk_game/analytics/amplitude.ex
defmodule RiskGame.Analytics.Amplitude do
  @api_key Application.compile_env(:risk_game, :amplitude_api_key)
  @endpoint "https://api2.amplitude.com/2/httpapi"

  def track_event(user_id, event_name, properties \\ %{}) do
    payload = %{
      api_key: @api_key,
      events: [
        %{
          user_id: user_id,
          event_type: event_name,
          event_properties: properties,
          time: System.system_time(:millisecond)
        }
      ]
    }

    Task.start(fn ->
      Req.post(@endpoint, json: payload)
    end)
  end

  def track_game_completed(game_id, players, duration) do
    Enum.each(players, fn player ->
      track_event(player.user_id, "Game Completed", %{
        game_id: game_id,
        player_count: length(players),
        duration_minutes: duration,
        placement: player.placement,
        armies_deployed: player.stats.armies_deployed,
        territories_conquered: player.stats.territories_conquered
      })
    end)
  end
end
```

**LiveDashboard Setup:**

```elixir
# lib/risk_game_web/router.ex
defmodule RiskGameWeb.Router do
  use RiskGameWeb, :router
  import Phoenix.LiveDashboard.Router

  scope "/" do
    pipe_through [:browser, :require_admin]

    live_dashboard "/dashboard",
      metrics: RiskGame.Telemetry,
      additional_pages: [
        game_stats: RiskGameWeb.GameStatsLive
      ]
  end
end
```

### 5.5 Mobile Support (Future/Bonus)

**Architecture:**
- LiveView Native for iOS/Android apps
- Same codebase as web
- No React Native knowledge required
- Push notifications via APNS/FCM libraries

**Conceptual Implementation:**

```elixir
# This is a preview of LiveView Native (experimental)
defmodule RiskGameWeb.GameLive.Native do
  use RiskGameNative, [:render_component, format: :swiftui]

  def render(assigns, %{format: :swiftui}) do
    ~SWIFTUI"""
    <VStack>
      <Text>Game Room: <%= @room.name %></Text>

      <List>
        <%= for player <- @players do %>
          <HStack>
            <Circle fillColor={player.color} />
            <Text><%= player.username %></Text>
            <Text><%= player.armies %> armies</Text>
          </HStack>
        <% end %>
      </List>

      <Button phx-click="start-game">Start Game</Button>
    </VStack>
    """
  end
end
```

**Push Notifications:**

```elixir
# lib/risk_game/notifications/push.ex
defmodule RiskGame.Notifications.Push do
  alias Pigeon.APNS
  alias Pigeon.FCM

  def notify_turn(user_id, game_name) do
    user = RiskGame.Accounts.get_user!(user_id)

    # iOS
    if user.ios_device_token do
      notification = APNS.Notification.new(
        "It's your turn in #{game_name}!",
        user.ios_device_token,
        "risk_game"
      )

      Pigeon.APNS.push(notification)
    end

    # Android
    if user.android_device_token do
      notification = FCM.Notification.new(
        user.android_device_token,
        %{"title" => "Your Turn", "body" => "It's your turn in #{game_name}!"}
      )

      Pigeon.FCM.push(notification)
    end
  end
end
```

**Benefits:**
- Single Elixir codebase for web + mobile
- Shared game logic and state management
- Real-time updates work natively
- No need to learn Swift/Kotlin
- Phoenix Channels work on mobile clients

**Note:** LiveView Native is still experimental (as of 2025). For production mobile apps, consider:
1. Standard Phoenix API + React Native
2. Wait for LiveView Native 1.0 stable
3. Progressive Web App (PWA) for mobile web

---

## 6. Implementation Phases

### Phase 1: Project Setup & Basic LiveView (Week 1)

**Goals:**
- Set up Phoenix project structure
- Configure database connection to existing PostgreSQL
- Create basic LiveView pages
- Implement simple authentication

**Tasks:**
1. Install Elixir 1.17+ and Phoenix 1.7+
2. Create new Phoenix project with LiveView:
   ```bash
   mix phx.new elixir_risk --live --database postgres --no-mailer
   ```
3. Configure `config/dev.exs` to use existing database (or new schema)
4. Create basic Ecto schemas for `users` and `game_rooms`
5. Implement simple login/registration (use existing `users` table)
6. Create landing page with "Create Game" button
7. Create empty game lobby LiveView page
8. Deploy to Railway to validate Docker setup

**Success Criteria:**
- Can create a user account
- Can create a game room
- LiveView page loads without errors
- Railway deployment works

### Phase 2: Game State Management in GenServer (Week 2)

**Goals:**
- Implement GameServer GenServer for room state
- Load map data from database
- Handle basic lobby operations

**Tasks:**
1. Create `RiskGame.Games.GameServer` module
2. Implement GenServer callbacks (init, handle_call, handle_cast)
3. Create `RiskGame.Games.GameSupervisor` for dynamic supervision
4. Implement process registry for looking up game servers by room ID
5. Load map data from `maps` and `map_territories` tables
6. Implement lobby actions:
   - Player join/leave
   - Ready/unready
   - Start game (transition to reinforcement phase)
7. Write tests for GameServer state transitions

**Success Criteria:**
- Multiple players can join a lobby
- Game state persists in GenServer
- Starting game initializes territories and players
- Tests pass for lobby operations

### Phase 3: Territory Interaction & Game Rules (Week 3-4)

**Goals:**
- Implement core game loop (reinforcement → attack → fortify)
- Handle territory clicks and actions
- Implement combat logic with dice rolls

**Tasks:**
1. Create `RiskGame.Games.Rules.*` modules for game phases
2. Implement reinforcement phase:
   - Calculate bonus armies (territories + continents)
   - Deploy armies to owned territories
   - Validate deployment rules
3. Implement attack phase:
   - Validate adjacency and ownership
   - Roll dice (deterministic RNG)
   - Apply combat results
   - Handle territory conquest
4. Implement fortification phase:
   - Find connected territories (pathfinding)
   - Move armies between owned territories
5. Implement turn progression:
   - Advance phases
   - Switch current player
   - Check victory conditions
6. Add LiveView UI for:
   - Territory selection
   - Action buttons (deploy, attack, fortify, end turn)
   - Dice roll animations (JavaScript hooks)
7. Write comprehensive tests for game rules

**Success Criteria:**
- Can play a full game turn (all three phases)
- Combat works correctly with deterministic outcomes
- Victory detection works
- UI updates in real-time for all players

### Phase 4: Multiplayer with Presence & PubSub (Week 5)

**Goals:**
- Implement real-time synchronization for multiple players
- Add chat functionality
- Handle disconnections and reconnections

**Tasks:**
1. Set up Phoenix PubSub for game room broadcasts
2. Implement `RiskGameWeb.Presence` for tracking online players
3. Broadcast state updates after each action:
   ```elixir
   Phoenix.PubSub.broadcast(
     RiskGame.PubSub,
     "game:#{room_id}",
     {:game_updated, new_state}
   )
   ```
4. Subscribe LiveView clients to game topic in `mount/3`
5. Handle presence changes (player online/offline)
6. Implement chat via LiveView events or Phoenix Channel
7. Add reconnection handling:
   - Rejoin game room on LiveView reconnect
   - Restore state from GameServer
8. Test with 2+ simultaneous players in different browsers

**Success Criteria:**
- Multiple players see updates instantly
- Chat messages broadcast to all players
- Disconnecting and reconnecting works
- Presence shows who's online

### Phase 5: Polish & Railway Deployment (Week 6)

**Goals:**
- Add UI polish and animations
- Optimize performance
- Deploy to Railway successfully
- Document deployment process

**Tasks:**
1. Add Tailwind CSS styling (port classes from React app)
2. Implement game board canvas rendering with JavaScript hooks
3. Add animations for:
   - Dice rolls
   - Army movements
   - Territory conquests
4. Optimize database queries (eager loading, indexes)
5. Add error handling and user feedback
6. Create Dockerfile for Railway:
   ```dockerfile
   FROM elixir:1.17-alpine AS builder
   # ... build steps
   FROM alpine:latest
   # ... runtime setup
   ```
7. Configure Railway environment variables:
   - `DATABASE_URL`
   - `SECRET_KEY_BASE`
   - `PHX_HOST`
8. Set up Railway `railway.toml` config
9. Deploy and test on Railway
10. Write deployment documentation

**Success Criteria:**
- Game looks good and feels responsive
- No major performance issues
- Deploys to Railway without errors
- Documentation allows others to deploy

---

## 6. Known Challenges & Solutions

### Challenge 1: State Synchronization Differences

**Problem:** React uses optimistic updates and client-side state. LiveView is server-authoritative.

**Solution:**
- Embrace server authority - clients always show truth
- Use LiveView's built-in latency compensation (feels instant on LAN)
- Add loading states for actions that take >100ms

### Challenge 2: Canvas Rendering in LiveView

**Problem:** LiveView is server-rendered HTML. Game board needs Canvas or SVG.

**React Approach:**
```jsx
<canvas ref={canvasRef} onMouseClick={handleClick} />
```

**LiveView Approach:**
```elixir
# Use JavaScript hooks
<canvas id="game-board" phx-hook="GameBoard" data-territories={@territories}></canvas>
```

```javascript
// assets/js/hooks/game_board.js
Hooks.GameBoard = {
  mounted() {
    this.canvas = this.el
    this.renderBoard(JSON.parse(this.el.dataset.territories))
  },

  updated() {
    this.renderBoard(JSON.parse(this.el.dataset.territories))
  },

  renderBoard(territories) {
    // Canvas drawing logic (can port from React)
  }
}
```

**Solution:** Use LiveView hooks for Canvas, server pushes data via assigns.

### Challenge 3: Deterministic RNG

**Problem:** JavaScript `Math.random()` is not available in Elixir.

**React/Node Approach:**
```typescript
class DeterministicRng {
  constructor(seed: string) {
    this.state = hashSeed(seed)
  }

  next(): number {
    this.state = lcg(this.state)
    return this.state / MAX_INT
  }
}
```

**Elixir Approach:**
```elixir
defmodule DeterministicRng do
  defstruct [:seed, :state]

  def new(seed) do
    %__MODULE__{seed: seed, state: hash_seed(seed)}
  end

  def next(%__MODULE__{state: state} = rng) do
    new_state = lcg(state)
    value = new_state / @max_int
    {value, %{rng | state: new_state}}
  end
end
```

**Solution:** Port RNG algorithm directly. Elixir's immutability makes this cleaner.

### Challenge 4: Database Schema Sharing

**Problem:** Existing PostgreSQL schema designed for Node.js app.

**Options:**
1. **Share same tables**: Risk data conflicts
2. **Separate schema**: `CREATE SCHEMA elixir_risk;`
3. **New database**: Clean slate but duplicate data

**Recommended Solution:**
- Use separate schema prefix initially: `elixir_risk.game_rooms`
- Share `users` table for authentication
- Migrate data if experiment succeeds

### Challenge 5: No TypeScript Types

**Problem:** Can't import shared types from `shared/` package.

**Solution:**
- Manually translate TypeScript interfaces to Elixir typespecs
- Use `@type` and `@spec` annotations
- Consider generating types from JSON schema (future)

### Challenge 6: Real-Time Performance

**Problem:** Concerned about LiveView performance for fast-paced game actions.

**Benchmarks:**
- LiveView can handle 10,000+ concurrent connections per server
- Single game room: 2-8 players = minimal load
- PubSub broadcasting is very efficient

**Solution:**
- Start with LiveView for everything
- If specific actions are too slow, use Phoenix Channels
- Profile with `:observer` and `:telemetry`

### Challenge 7: Testing Multiplayer Scenarios

**Problem:** Testing real-time interactions between multiple clients is hard.

**Solution:**
- Unit test game rules in isolation (pure functions)
- Use `Phoenix.ChannelTest` for integration tests
- Simulate multiple connections in tests:
  ```elixir
  test "multiple players see updates" do
    {:ok, _view1, html1} = live(conn1, "/game/#{room_id}")
    {:ok, _view2, html2} = live(conn2, "/game/#{room_id}")

    # Trigger action from player 1
    # Assert player 2 sees update
  end
  ```

---

## 7. Data Migration Strategy

### 7.1 Database Options

**Option A: Shared Database with Separate Schema**
```sql
CREATE SCHEMA elixir_risk;

-- Create tables in new schema
CREATE TABLE elixir_risk.game_rooms (...);
CREATE TABLE elixir_risk.room_players (...);

-- Share users table
GRANT SELECT ON public.users TO elixir_risk_user;
```

**Pros:**
- Isolated data, no conflicts
- Can share user accounts
- Easy to drop schema if experiment fails

**Cons:**
- Can't reuse existing game data
- Duplicate table definitions

**Option B: Completely Separate Database**
```
DATABASE_URL=postgresql://user:pass@host/conquestk_elixir
```

**Pros:**
- Total isolation
- Freedom to change schema

**Cons:**
- Can't share users
- Need data export/import scripts

**Option C: Share Existing Tables (NOT RECOMMENDED)**

**Cons:**
- Risk breaking Node.js app
- Data format conflicts
- Race conditions

**RECOMMENDATION:** Start with **Option A** (separate schema, shared users).

### 7.2 Ecto Migrations

```elixir
# priv/repo/migrations/20251024_create_game_rooms.exs
defmodule RiskGame.Repo.Migrations.CreateGameRooms do
  use Ecto.Migration

  def change do
    create table(:game_rooms) do
      add :status, :string, null: false
      add :phase, :string, null: false
      add :host_id, references(:users, on_delete: :nothing)
      add :map_id, :integer
      add :config, :map  # JSONB

      timestamps()
    end

    create index(:game_rooms, [:status])
    create index(:game_rooms, [:host_id])
  end
end
```

### 7.3 Porting Existing Maps

**Node.js Map Structure:**
```json
{
  "id": 1,
  "name": "Classic Risk",
  "territories": [...],
  "sectors": [...],
  "adjacencies": [...]
}
```

**Migration Script:**
```elixir
# priv/repo/seeds.exs
alias RiskGame.{Repo, Maps.Map}

# Fetch from public.maps (Node.js schema)
{:ok, result} = Repo.query("SELECT * FROM public.maps WHERE name = 'Classic Risk'")
node_map = Enum.at(result.rows, 0)

# Insert into elixir_risk.maps
%Map{}
|> Map.changeset(%{
  name: node_map.name,
  territories: node_map.territories,
  # ... map other fields
})
|> Repo.insert!()
```

**Recommendation:** Write one-time migration script to copy maps to Elixir schema.

---

## 8. Testing Strategy

### 8.1 Unit Tests (Game Rules)

**Test pure functional rules in isolation:**

```elixir
defmodule RiskGame.Games.Rules.AttackTest do
  use ExUnit.Case, async: true
  alias RiskGame.Games.Rules.Attack

  describe "validate_attack/3" do
    test "allows attack from owned territory to adjacent enemy territory" do
      state = %GameState{
        current_player_id: "player1",
        territories: %{
          "alaska" => %{owner_id: "player1", armies: 5},
          "kamchatka" => %{owner_id: "player2", armies: 3}
        }
      }

      assert {:ok, _state} = Attack.validate_attack(state, "alaska", "kamchatka")
    end

    test "rejects attack from non-owned territory" do
      state = %GameState{
        current_player_id: "player1",
        territories: %{
          "alaska" => %{owner_id: "player2", armies: 5},
          "kamchatka" => %{owner_id: "player1", armies: 3}
        }
      }

      assert {:error, "You don't own that territory"} =
        Attack.validate_attack(state, "alaska", "kamchatka")
    end
  end
end
```

### 8.2 Integration Tests (GenServer)

**Test GameServer state management:**

```elixir
defmodule RiskGame.Games.GameServerTest do
  use RiskGame.DataCase, async: false
  alias RiskGame.Games.GameServer

  setup do
    room_id = "test-room-#{System.unique_integer([:positive])}"
    {:ok, _pid} = GameServer.start_link(room_id)

    %{room_id: room_id}
  end

  test "deploy armies reduces reinforcement pool", %{room_id: room_id} do
    player_id = "player1"

    # Setup game state with reinforcements
    initial_state = %GameState{
      current_player_id: player_id,
      phase: :reinforcement,
      players: %{player_id => %{reinforcement_armies: 5}},
      territories: %{"alaska" => %{owner_id: player_id, armies: 3}}
    }

    GameServer.set_state(room_id, initial_state)

    # Deploy armies
    {:ok, new_state} = GameServer.deploy_armies(room_id, player_id, "alaska", 3)

    assert new_state.players[player_id].reinforcement_armies == 2
    assert new_state.territories["alaska"].armies == 6
  end
end
```

### 8.3 LiveView Tests

**Test LiveView interactions:**

```elixir
defmodule RiskGameWeb.GameLiveTest do
  use RiskGameWeb.ConnCase
  import Phoenix.LiveViewTest

  test "clicking territory sends deploy event", %{conn: conn} do
    # Create game room
    room = insert(:game_room)

    # Mount LiveView
    {:ok, view, _html} = live(conn, "/game/#{room.id}")

    # Click territory
    view
    |> element("#territory-alaska")
    |> render_click()

    # Assert state updated
    assert has_element?(view, "#territory-alaska[data-armies='4']")
  end
end
```

### 8.4 Performance Tests

**Load test with concurrent players:**

```elixir
defmodule RiskGame.LoadTest do
  use ExUnit.Case

  test "handles 100 concurrent games" do
    # Spawn 100 game rooms
    rooms = for i <- 1..100 do
      room_id = "load-test-#{i}"
      {:ok, _pid} = GameServer.start_link(room_id)
      room_id
    end

    # Simulate actions from 400 players (4 per room)
    Enum.each(rooms, fn room_id ->
      for player <- 1..4 do
        Task.async(fn ->
          GameServer.deploy_armies(room_id, "player#{player}", "territory1", 1)
        end)
      end
    end)
    |> Enum.map(&Task.await/1)

    # Assert no crashes
    assert Process.alive?(Process.whereis(GameSupervisor))
  end
end
```

---

## 9. Deployment Configuration

### 9.1 Dockerfile for Railway

```dockerfile
# Build stage
FROM elixir:1.17-alpine AS builder

# Install build dependencies
RUN apk add --no-cache build-base git nodejs npm

WORKDIR /app

# Install Hex and Rebar
RUN mix local.hex --force && \
    mix local.rebar --force

# Copy mix files
COPY mix.exs mix.lock ./
RUN mix deps.get --only prod
RUN mix deps.compile

# Copy application code
COPY . .

# Compile assets
RUN mix assets.deploy

# Compile release
ENV MIX_ENV=prod
RUN mix compile
RUN mix release

# Runtime stage
FROM alpine:latest

# Install runtime dependencies
RUN apk add --no-cache openssl ncurses-libs libstdc++

WORKDIR /app

# Copy release from builder
COPY --from=builder /app/_build/prod/rel/risk_game ./

# Set environment
ENV HOME=/app
ENV MIX_ENV=prod

# Expose Phoenix port
EXPOSE 4000

# Start application
CMD ["./bin/risk_game", "start"]
```

### 9.2 Railway Configuration

**railway.toml:**
```toml
[build]
builder = "dockerfile"
dockerfilePath = "./elixir_risk/Dockerfile"

[deploy]
startCommand = "./bin/risk_game start"
healthcheckPath = "/health"
healthcheckTimeout = 100
restartPolicyType = "on-failure"
restartPolicyMaxRetries = 10
```

**Environment Variables (Railway Dashboard):**
```bash
DATABASE_URL=postgresql://user:pass@host:5432/dbname
SECRET_KEY_BASE=<generate with: mix phx.gen.secret>
PHX_HOST=elixir-risk.up.railway.app
PORT=4000
POOL_SIZE=10
```

### 9.3 Production Config

```elixir
# config/runtime.exs
import Config

if config_env() == :prod do
  database_url =
    System.get_env("DATABASE_URL") ||
    raise """
    environment variable DATABASE_URL is missing.
    """

  config :risk_game, RiskGame.Repo,
    url: database_url,
    pool_size: String.to_integer(System.get_env("POOL_SIZE") || "10"),
    ssl: true,
    ssl_opts: [verify: :verify_none]  # Railway SSL workaround

  secret_key_base =
    System.get_env("SECRET_KEY_BASE") ||
    raise """
    environment variable SECRET_KEY_BASE is missing.
    """

  host = System.get_env("PHX_HOST") || "elixir-risk.up.railway.app"
  port = String.to_integer(System.get_env("PORT") || "4000")

  config :risk_game, RiskGameWeb.Endpoint,
    url: [host: host, port: 443, scheme: "https"],
    http: [
      ip: {0, 0, 0, 0},
      port: port
    ],
    secret_key_base: secret_key_base,
    server: true
end
```

---

## 10. Comparison: React vs. LiveView Patterns

### Pattern 1: Component State

**React:**
```jsx
function TerritoryCard({ territory }) {
  const [selected, setSelected] = useState(false)

  return (
    <div
      className={selected ? 'selected' : ''}
      onClick={() => setSelected(!selected)}
    >
      {territory.name}
    </div>
  )
}
```

**LiveView:**
```elixir
# No client state - server holds truth
def handle_event("select_territory", %{"id" => id}, socket) do
  {:noreply, assign(socket, :selected_territory, id)}
end
```

```heex
<div
  class={if @selected_territory == @territory.id, do: "selected"}
  phx-click="select_territory"
  phx-value-id={@territory.id}
>
  <%= @territory.name %>
</div>
```

### Pattern 2: Real-Time Updates

**React + Socket.IO:**
```typescript
// Client receives update
socket.on('game-delta', (delta) => {
  dispatch(applyDelta(delta))  // Redux action
})

// Optimistic update
dispatch(deployArmies(territory, count))
socket.emit('deploy', { territory, count })
```

**LiveView + PubSub:**
```elixir
# Server broadcasts update
Phoenix.PubSub.broadcast(
  RiskGame.PubSub,
  "game:#{room_id}",
  {:game_updated, new_state}
)

# Client receives via LiveView (automatic)
def handle_info({:game_updated, state}, socket) do
  {:noreply, assign(socket, game: state)}
end
```

**Key Difference:** LiveView doesn't need optimistic updates - server response is fast enough.

### Pattern 3: Form Handling

**React:**
```jsx
function DeployForm() {
  const [count, setCount] = useState(0)

  const handleSubmit = (e) => {
    e.preventDefault()
    dispatch(deployArmies(selectedTerritory, count))
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="number"
        value={count}
        onChange={(e) => setCount(e.target.value)}
      />
      <button type="submit">Deploy</button>
    </form>
  )
}
```

**LiveView:**
```heex
<.form for={@changeset} phx-submit="deploy_armies">
  <.input field={@changeset[:count]} type="number" label="Armies" />
  <.button type="submit">Deploy</.button>
</.form>
```

```elixir
def handle_event("deploy_armies", %{"count" => count}, socket) do
  # Validate and process
  case GameServer.deploy_armies(socket.assigns.room_id, socket.assigns.user_id, count) do
    {:ok, _} -> {:noreply, socket}
    {:error, reason} -> {:noreply, put_flash(socket, :error, reason)}
  end
end
```

**Key Difference:** LiveView handles form binding automatically, React needs manual state management.

---

## 11. Success Metrics

### Minimum Viable Product (MVP) Criteria

**Must Have:**
- [ ] User can create account and log in
- [ ] User can create a game room
- [ ] 2+ players can join a lobby
- [ ] Game starts and initializes territories
- [ ] Players can deploy armies during reinforcement
- [ ] Players can attack adjacent territories
- [ ] Dice rolls work with deterministic outcomes
- [ ] Territory ownership updates after conquest
- [ ] Players can fortify armies
- [ ] Turn progression works (reinforcement → attack → fortify → next player)
- [ ] Victory condition detected (one player owns all territories)
- [ ] All players see updates in real-time

**Nice to Have:**
- [ ] Continent bonuses calculated
- [ ] Card collection and redemption
- [ ] Chat functionality
- [ ] Spectator mode
- [ ] Reconnection after disconnect
- [ ] Game log/history
- [ ] Sound effects

**Out of Scope (for now):**
- AI players
- Ranked matchmaking
- Replays
- Admin tools
- Mobile responsiveness

### Performance Benchmarks

**Acceptable Thresholds:**
- Page load: < 2 seconds
- Action response: < 200ms (perceived as instant)
- Support: 20+ concurrent games (80+ players)
- Memory: < 100MB per game room process

### Learning Goals

**For the Developer (Connor):**
- Understand Elixir syntax and pattern matching
- Grasp OTP concepts (GenServer, Supervisor)
- Learn LiveView mental model (server-driven UI)
- Practice functional programming (immutability, pure functions)
- Understand Phoenix PubSub and Channels
- Deploy an Elixir app to production

---

## 12. Risk Assessment & Mitigation

### Risk 1: Complexity Overwhelm

**Risk:** Elixir/OTP is complex; may abandon due to steep learning curve.

**Likelihood:** High
**Impact:** High

**Mitigation:**
- Start with simplest possible version (Phase 1)
- Celebrate small wins (lobby working = success)
- Use ChatGPT/Claude for code review and explanations
- Timebox to 6 weeks; if not working, shelve it

### Risk 2: Performance Issues

**Risk:** LiveView too slow for real-time game, requires channels.

**Likelihood:** Low
**Impact:** Medium

**Mitigation:**
- Profile early with `:observer` tool
- Use Phoenix Channels for specific actions if needed
- Optimize PubSub broadcasts (send diffs, not full state)

### Risk 3: Deployment Failures

**Risk:** Railway doesn't support Elixir well, deployment breaks.

**Likelihood:** Medium
**Impact:** High

**Mitigation:**
- Test Railway deployment in Phase 1 (before building game)
- Have fallback: deploy to Fly.io or Gigalixir
- Join Elixir community forums for Railway help

### Risk 4: Database Conflicts

**Risk:** Elixir and Node.js apps corrupt shared database.

**Likelihood:** High (if using same tables)
**Impact:** Critical

**Mitigation:**
- Use separate schema (`elixir_risk.*`) - MANDATORY
- Never write to Node.js tables (except read-only `users`)
- Add database-level constraints to prevent corruption

### Risk 5: Incomplete Features

**Risk:** Spend 6 weeks and still don't have a playable game.

**Likelihood:** Medium
**Impact:** High

**Mitigation:**
- Define MVP strictly (see Section 11)
- Cut features ruthlessly to stay on track
- Phase 1-3 must work before starting Phase 4

---

## 13. Next Steps

### Immediate Actions (Today)

1. **Create branch:**
   ```bash
   git checkout -b elixir-phoenix-experiment
   ```

2. **Install Elixir/Phoenix (if needed):**
   - Follow: https://elixir-lang.org/install.html
   - Install Phoenix: `mix archive.install hex phx_new`

3. **Create Phoenix project:**
   ```bash
   cd elixir_risk  # Create subdirectory
   mix phx.new . --live --database postgres
   ```

4. **Update this plan with findings:**
   - Document installation issues
   - Note version numbers used
   - Update file structure if Phoenix defaults differ

### Phase 1 Kickoff (Next)

Follow Phase 1 tasks from Section 5.

**Deliverables:**
- Working Phoenix app running on `http://localhost:4000`
- Basic LiveView page that loads
- Connection to PostgreSQL database
- Railway deployment (even if it just shows "Hello World")

---

## 14. Resources & References

### Official Documentation
- Elixir: https://elixir-lang.org/docs.html
- Phoenix Framework: https://hexdocs.pm/phoenix/overview.html
- Phoenix LiveView: https://hexdocs.pm/phoenix_live_view/Phoenix.LiveView.html
- Ecto (database): https://hexdocs.pm/ecto/Ecto.html

### Learning Resources
- **Elixir School**: https://elixirschool.com/en/ (free tutorials)
- **Phoenix LiveView Book**: "Programming Phoenix LiveView" by Bruce Tate
- **Elixir Forum**: https://elixirforum.com/ (community help)
- **Phoenix Discord**: https://discord.gg/elixir (real-time chat)

### Deployment Guides
- Railway + Elixir: https://docs.railway.app/guides/elixir
- Fly.io Elixir: https://fly.io/docs/elixir/ (backup option)
- Gigalixir: https://www.gigalixir.com/ (Elixir-specific PaaS)

### Relevant Blog Posts
- "Real-time games with LiveView" (search Elixir blog)
- "GenServer crash course" (YouTube)
- "Phoenix PubSub explained" (search hexdocs)

### Code Examples to Study
- Phoenix LiveView Examples: https://github.com/chrismccord/phoenix_live_view_example
- Real-time Multiplayer Game: https://github.com/kinson/chess (Elixir chess game)

---

## 15. Appendix: Terminology Translation

**For Connor (coming from JavaScript/React):**

| JavaScript/Node.js | Elixir/Phoenix | Explanation |
|-------------------|----------------|-------------|
| `class` | `defmodule` | Define a module (namespace) |
| `function` | `def` / `defp` | Define public/private function |
| `const`, `let` | (immutable by default) | All variables are immutable |
| `{...obj, key: val}` | `%{map \| key: val}` | Update map (creates new copy) |
| `obj.method()` | `Module.function(obj)` | No methods - functions take data |
| `new Class()` | `%Struct{}` or `GenServer.start_link` | Create struct or process |
| `socket.emit()` | `Phoenix.PubSub.broadcast()` | Send message to subscribers |
| `socket.on()` | `handle_info` callback | Receive message |
| `setState()` | `assign(socket, key, val)` | Update LiveView state |
| `useEffect()` | `handle_info` or `mount` | Side effects on events |
| `Promise` / `async/await` | `Task` / `GenServer.call` | Async operations |
| `try/catch` | `case` / `with` / `try/rescue` | Error handling |
| `map.get(key)` | `Map.get(map, key)` or `map[key]` | Access map value |
| `arr.push(val)` | `[val \| list]` | Prepend to list (common pattern) |
| `if (cond)` | `if cond do ... end` | Conditional |
| `switch` | `case` | Pattern matching (much more powerful) |

**Key Mental Shifts:**
1. **Immutability**: Can't change variables, must return new values
2. **Pattern Matching**: Replaces most if/else logic
3. **Processes**: Instead of classes, spawn lightweight processes
4. **No null**: Use `nil` or `{:ok, val}` / `{:error, reason}` tuples
5. **No exceptions for control flow**: Use tagged tuples instead

---

## Conclusion

This migration plan provides a roadmap to rebuild ConquestK in Elixir/Phoenix/LiveView. It's an ambitious learning project that will teach functional programming, OTP patterns, and real-time web development.

**Remember:**
- This is FOR LEARNING, not for production (yet)
- It's okay to abandon if it's not working
- Celebrate small wins along the way
- Ask for help in Elixir community forums
- Document everything for future reference

**Decision Points:**
- After Phase 1: Continue or pivot?
- After Phase 3: Is the core game fun to play?
- After Phase 5: Deploy alongside Node.js app or replace it?

Good luck, and remember: **You're not building a better game, you're building the SAME game with MORE COMPLEXITY for EDUCATIONAL PURPOSES.**

Let's see what happens. 🚀
