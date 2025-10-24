# Phase 2.5 Implementation TODO

This checklist tracks the infrastructure additions from PHASE_2_5_INFRASTRUCTURE.md. Complete these as needed during development.

## Oban - Background Jobs

- [ ] Add to mix.exs: `{:oban, "~> 2.18"}`
- [ ] Run `mix deps.get`
- [ ] Generate migration: `mix ecto.gen.migration add_oban_jobs_table`
- [ ] Add Oban.Migrations.up(version: 12) to migration
- [ ] Configure in config/config.exs (queues, plugins)
- [ ] Create workers:
  - [ ] `lib/risk_game/workers/turn_timer_worker.ex`
  - [ ] `lib/risk_game/workers/game_cleanup_worker.ex`
  - [ ] `lib/risk_game/workers/disconnect_timeout_worker.ex`

## Phoenix.Presence - Player Tracking

- [ ] Create `lib/risk_game_web/presence.ex`
- [ ] Add to application.ex supervision tree
- [ ] Implement presence tracking in GameLobbyLive
- [ ] Implement presence tracking in GameRoomLive
- [ ] Add reconnection detection
- [ ] Add spectator presence tracking

## Chat System

- [ ] Generate migration: `mix ecto.gen.migration create_chat_messages`
- [ ] Create schema: `lib/risk_game/chat/message.ex`
- [ ] Create context: `lib/risk_game/chat.ex`
- [ ] Create LiveView component: `lib/risk_game_web/live/chat_component.ex`
- [ ] Subscribe to "game:#{game_id}:chat" PubSub topic
- [ ] Add chat UI to game room page

## Data Migration Scripts

- [ ] Create `lib/mix/tasks/migrate_from_node.ex`
- [ ] Implement dry_run/0
- [ ] Implement migrate_users/0
- [ ] Implement migrate_games/0
- [ ] Implement migrate_all/0
- [ ] Test with --dry-run flag

## R2 Asset Storage

- [ ] Add to mix.exs:
  - [ ] `{:ex_aws, "~> 2.0"}`
  - [ ] `{:ex_aws_s3, "~> 2.0"}`
  - [ ] `{:hackney, "~> 1.9"}`
  - [ ] `{:sweet_xml, "~> 0.6"}`
- [ ] Run `mix deps.get`
- [ ] Configure ExAws in config/config.exs
- [ ] Create `lib/risk_game/assets.ex` module
- [ ] Add environment variables to .env:
  - [ ] ASSET_ACCESS_KEY_ID
  - [ ] ASSET_SECRET_ACCESS_KEY
  - [ ] PUBLIC_ASSET_BASE_URL

## Spectator Mode

- [ ] Add spectator functions to GameServer
- [ ] Track spectators in Presence
- [ ] Add "Spectate" button to game lobby
- [ ] Make game view read-only for spectators
- [ ] Show spectator list in game room

## Reconnection Handling

- [ ] Track connection state in LiveView
- [ ] Implement terminate/2 callback with timeout
- [ ] Create DisconnectTimeoutWorker
- [ ] Add reconnection UI feedback
- [ ] Test: disconnect browser, reconnect within 5 minutes

## Database Isolation Verification

- [x] Elixir uses `elixir_risk.*` schema
- [x] Node.js uses `public.*` schema
- [ ] Test: Create game in Elixir, verify doesn't affect Node.js
- [ ] Test: Create game in Node.js, verify doesn't affect Elixir

## Shared JWT Authentication

- [ ] Install Joken: `{:joken, "~> 2.6"}`
- [ ] Configure shared JWT_SECRET in config/config.exs
- [ ] Create auth plug: `lib/risk_game_web/plugs/auth.ex`
- [ ] Add plug to router pipeline
- [ ] Test: Node.js token works in Elixir
- [ ] Test: Elixir token works in Node.js (if needed)

---

## Priority Order (When Ready)

### High Priority (Blocks Core Features)
1. Phoenix.Presence - Need for online tracking
2. Oban - Need for turn timers
3. Chat - Players expect this

### Medium Priority (Nice to Have)
4. Spectator mode
5. Reconnection handling improvements
6. R2 asset storage (can use local files for now)

### Low Priority (Pre-Launch)
7. Data migration scripts (only needed at go-live)
8. Shared JWT auth (only if running both apps simultaneously)

---

See PHASE_2_5_INFRASTRUCTURE.md for detailed implementation code and examples.
