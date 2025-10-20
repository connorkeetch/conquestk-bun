# Architecture & Technical Details

_Last updated: March 9, 2026_

## Stack Overview
- **Frontend:** React 19 + Vite 7 + Redux Toolkit + Tailwind CSS v4, written in TypeScript (`frontend/`).
- **Backend:** Node.js 24 on Express 5 with Socket.io, BullMQ, and PostgreSQL, also TypeScript-first (`backend/`).
- **Shared package:** Common types and helpers are built from `shared/` and consumed by both runtime targets.
- **Data stores:** PostgreSQL (authoritative persistence), Redis (session cache, socket fan-out, BullMQ queues), and Cloudflare R2/S3-compatible object storage for map and media assets.
- **Tooling:** npm workspaces, Biome for lint/format, Vitest (frontend) + Jest (backend) + Playwright smoke tests.

## Runtime Architecture
### Backend (Express + Socket.io)
- Routes live under `backend/src/routes`. HTTP handlers call controllers in `backend/src/controllers` (e.g. `gameController.ts`) that wrap validation, middleware (`backend/src/middleware`), and domain services.
- Core game orchestration resides in `backend/src/services/gameService.ts` together with the deterministic engine in `backend/src/game/gameEngine.ts`. They persist lifecycle transitions, enforce phase rules, and emit Socket.io deltas.
  - Hidden Treasures rules live in `backend/src/game/hiddenTreasures.ts`. Configuration attaches at room creation and is pulled from cache before each action.
- Completed matches flow through `GameService.finalizeCompletedGame`, which archives results, updates ratings, and awards clan XP via `clanProgressionService.awardContribution`. XP uses the constants defined near the top of `gameService.ts` (base 400 + placement bonuses 150/100/50 + up to 150 from territories + 250 win bonus) and never drops below the base grant.
- Map workflows span `mapService.ts`, `mapWorkflowService.ts`, and `mapApprovalService.ts`, with permission checks centralized in `mapPermissionService.ts` so creator, collaborator, and admin roles stay aligned.
- Authentication combines session cookies and JWT validation in `backend/src/middleware/auth.ts`; request-scoped user context is required for any mutating route.
- Socket.io authentication and event wiring live in `backend/src/services/socketService.ts`. Authenticated sockets join `user:{id}` and `clan:{clanId}` rooms, register chat handlers via `backend/src/socket/chatHandlers.ts`, and enqueue gameplay actions through the shared `queueService` with inline fallbacks handled by `GameActionProcessor`.
- The backend proxies the Go `matchsvc` via `backend/src/routes/matchsvc.ts`, which folds health, Redis, subscriber state, and Prometheus metrics into a single `/api/matchsvc/status` payload for the admin dashboard. Presence, queue events, and match found notifications stream into Node through `backend/src/services/matchSvcIntegration.ts` once Redis is healthy.
- Realtime rooms follow the `game:{roomId}` convention via helpers in `socketService.ts` (`getGameChannel`) and `backend/src/services/socketRegistry.ts`, so workers, lifecycle services, and reconnect logic target the same identifiers.

### Workers & Queues
- BullMQ queues (`queueService.ts`) drive asynchronous work. Key workers live in `backend/src/workers/`:
- `gameActionWorker.ts` processes turn-based actions and streams lockstep frames while emitting fog-aware log updates via `realtimeEmitter`.
  - `battleWorker.ts` resolves combat jobs.
  - `cleanupWorker.ts` retires completed games, prunes stale lobbies, and clears cache/modifier state.
  - `mapAssetWorker.ts` runs periodic purges of soft-deleted map art through `mapStagingService`.
  - `maintenanceWorker.ts` removes expired notifications and password reset tokens via `maintenanceService` and runs a nightly refresh of the skill leaderboard cache so `/api/skills/leaderboards/skill` stays hot with up‑to‑date wins/losses.
- `workerManager.ts` bootstraps the queue service, initializes every worker in parallel, and exposes health/stats APIs consumed by `/api/queues` routes and the `/api/health` probe.
- Periodic tasks (maintenance and map asset purges) use BullMQ Job Schedulers on dedicated queues (`maintenance`, `map-assets`) with Workers handling `maintenance:prune` and `map-assets:purge` jobs. Map asset purge runs once per week by default and can be overridden via `MAP_ASSET_PURGE_INTERVAL_MS`. This replaces ad-hoc setInterval timers and is resilient across scaled instances.
- `queueService` gracefully degrades when Redis is unavailable and can fall back to inline execution through `GameActionProcessor`, so gameplay remains responsive even without background workers. `matchSvcIntegration.startSubscriber` is launched alongside workers and reports readiness to `/api/matchsvc/status` so operators know when Redis pub/sub is delivering presence and match events.
- Job idempotency helpers (`jobIdempotencyService.ts`) and metrics instrumentation (`metricsService.ts`) keep retries observable and safe.

### Real‑Time Game Deltas
- Contract is defined once in the shared package at `shared/types/delta.ts` and re-exported via `@conquestk/shared/types`. All runtimes (backend + frontend) use this single contract.
- Fog-aware logging on the backend runs through `backend/src/services/realtimeEmitter.ts` in tandem with frame commits; textual events remain filtered per viewer.
  - `armies`, `turn`, `reinforcementArmies` are clamped to non-negative integers
  - `ownerId` is only included when a non-empty string is provided
- Lockstep transport:
  - Game actions run in `backend/src/workers/gameActionWorker.ts`, which records deterministic frames and emits `game-action:frame-committed` and `game-action:checksum` events.
  - Fog filtering in `backend/src/services/fogService.ts` now only handles targeted reveal snapshots for convergence; incremental deltas are no longer broadcast.
- Full-state syncs still emit `game:snapshot` events from `socketService.ts` for reconnects, AFK kicks, and legacy flows.
- Frontend consumption:
  - `frontend/src/services/socketService.ts` ingests `game-action:frame-committed` and `game-action:checksum` events and feeds the lockstep simulator; legacy `game-delta` handlers have been removed.
  - Full snapshots remain as the recovery path and route through the same service.
- Testing & guardrails:
  - Golden-frame fixtures in `backend/src/test/lockstepGoldenFrames.test.ts` and simulator coverage in `backend/src/test/lockstepSimulator.test.ts` guard against lockstep regressions.
  - Shared types in `shared/types/lockstep.ts` define frame payload structure consumed by both client and server.

### Frontend (React + Redux Toolkit)
- Entry point `frontend/src/main.tsx` mounts the app shell defined in `App.tsx`. Routing is handled by React Router with pages under `frontend/src/pages`.
- Global state lives in `frontend/src/store`, with slices for auth, gameplay, chat, map editing, notifications, and room UX overlays.
- API access is centralized in `frontend/src/services/api.ts` and specialized helpers such as `mapWorkflowService.ts` that align with the shared types and optimistic update helpers.
- Real-time updates arrive through the typed socket wrapper in `frontend/src/services/socketService.ts`, which dispatches to Redux slices for gameplay (`gameSlice`), rooms, chat, notifications, and lifecycle timers.
- The map editor token workflow (`MapEditorTokens.tsx`) powers autosave, approval submission, and sector/capital editing. Polygon tooling still proxies through the same workflow endpoints.
- The canonical in-game view is `GameRoom` at `/room/:roomId`. Spectating is supported by appending `?spectate=true`; admins bypass fog via the same query flag for diagnostics.
- The progressive web app shell registers `public/sw.js` to power turn reminders. Map approval and DM push payloads reuse the same notification dispatcher.

### Shared Types & Utilities
- The `shared/` workspace contains TypeScript contracts (`gameState.ts`, `map.ts`, etc.), validation helpers, and enums consumed by both the frontend and backend.
- Shared constants keep gameplay logic (turn phases, territory metadata, map schema) aligned across runtimes.

## Data & Persistence
- PostgreSQL migrations live in `backend/migrations` following the `NNN_description.sql` convention. `npm run migrate` applies them through the runner in `backend/src/scripts/runMigration.ts` / `backend/src/utils/migrationRunner.ts`.
- Primary tables include `game_rooms`, `room_players`, `game_states`, `game_results`, `player_game_results`, `player_stats`, `game_moves`, archival tables like `game_move_archive`, map catalog tables (`maps`, `map_versions`, `map_territories`, `map_sectors`, `territory_adjacencies`), messaging tables (`conversations`, `conversation_messages`, `message_read_receipts`), and notification delivery (`notifications`, `web_push_subscriptions`).
- Redis powers `gameStateCache`, modifier caching, socket presence, session storage, and BullMQ job queues.
- Map assets store in R2/S3 via `mapStagingService.ts`; soft-deleted assets are reclaimed by the staging purge workflow (tracked in `map_asset_purge_runs`) once retention windows expire.

## Notifications & Messaging
- Chat and notifications share identity derived from the authenticated Redux store; Socket.io channels broadcast edits, deletes, and system events through `notificationService.ts`, `realtimeNotificationService.ts`, and the chat hooks installed by `setupChatHandlers`.
- Push subscriptions persist via `web_push_subscriptions`; the service worker relays gameplay turn reminders today. Map workflow and DM payloads run through `NotificationDispatcher` so channel enablement is controlled via environment variables.
- Clan progression updates broadcast over the shared Socket.io layer as `clan:progress` events, fanning out to `clan:{clanId}` rooms. Payloads include XP deltas, placement metadata, and objective progress so web (and future mobile) clients can refresh contribution UI without refetching the entire profile.
- Remaining work: finish validating creator/moderator map approval push fan-out and DM push roll-out (tracked in the go-live plan).

## Turn Timers & AFK Flow
- Room configuration includes `turn_timer` (seconds) and optional `time_bank_seconds` per player.
- When a turn starts, `GameLifecycleService.scheduleTurnTimeout` persists `turn_expires_at` and enqueues a delayed BullMQ job to expire the turn.
- On expiry, `GameLifecycleService.handleTurnTimeout`:
  - Uses remaining time bank for the current player, if any, and reschedules the expiry; otherwise
  - Increments `room_players.missed_turns` and sets `last_missed_turn_at = NOW()`
  - Skips the rest of the player’s turn (advances phases up to the next player’s reinforcement)
  - Emits a `phaseChange` delta for the next player and reschedules the next timeout
  - Kicks and neutralizes the player on the 3rd miss in the same game (sets `is_kicked = TRUE`, `elimination_reason = 'timeout'`)
- Development fallback: if Redis/BullMQ is unavailable, a local `setTimeout` triggers the same `handleTurnTimeout` logic. This fallback is disabled in production/staging.

## Deployment & Operations
- Production (https://conquestk.com) and staging (Railway dev branch) deploy from the monorepo via npm scripts. `npm run build` produces frontend + backend bundles; `npm start` runs migrations then boots Express.
- Logging centralizes through `backend/src/utils/logger.ts`, emitting structured JSON with request IDs. `/health` surfaces database, Redis, and queue status plus configuration hints for Sentry/connection strings.
- Observability includes battle application metrics, queue health, cleanup summaries, Hidden Treasures counters, and Match Service data. `/api/matchsvc/status` exposes service health, HMAC auth checks, subscriber state, queue depths, match totals, and live presence counts pulled from the Go Prometheus endpoint so the admin dashboard can visualize it without operators hitting the service directly. Frontend errors post to the backend log pipeline until dashboards land.

## Launch Readiness Caveats
- **B2 – Creator & reviewer notifications:** Web push storage and gameplay turn pushes are live; map approval + DM push fan-out is under active development and must be validated end-to-end.
- **B3 – Map staging asset lifecycle:** Automated purge runs and admin reclaim tooling exist; failure alert thresholds are still being tuned using new metrics.
- **F2 – Security checklist re-run:** A fresh audit is required post-authorization changes to document rate limits, sanitization, and authZ coverage.
- **G1 – CI gating & coverage:** CI needs stricter guards (typecheck, lint, unit, integration) and targeted gameplay/map editor tests before launch.
- **G2 – Large file safeguards:** Duplicate audio assets and backup artefacts remain; Git LFS or commit hooks must be finalized to prevent regressions.
- **G3 – Minimal analytics & telemetry:** Funnel events (lobby → start → end, approval decisions) and correlated error logging still need to be instrumented with dashboards.

### Game Lifecycle (status vs lifecyclePhase)
- Canonical lifecycle is stored in `game_rooms.status` with values: `lobby`, `initializing`, `active`, `completed`, `paused`, `abandoned`.
- The deprecated DB column `lifecycle_phase` was removed. Code no longer reads or writes it.
- Socket payloads include `lifecyclePhase` for UI convenience:
  - When `status` is `active`, the server derives `lifecyclePhase` from the current game state phase (`reinforcement`, `attack`, `fortify`, `finished`).
  - When `status` is `lobby` or `initializing`, `lifecyclePhase` mirrors the `status`.
  - When `status` is `completed`, `lifecyclePhase` is reported as `finished`.
- The DB view of the current turn is kept in sync on every turn end:
  - `game_rooms.current_turn_user_id` and `game_rooms.turn_number` are updated in `GameService.endTurn`.
  - `game_rooms.turn_expires_at` is updated when turn timers are scheduled (lifecycle/socket flows), not during every action.

### Data migration notes
- Legacy `status = 'finished'` is migrated to `status = 'completed'`, and the DB constraint now disallows `finished`.
- Unused columns dropped from `game_rooms`: `spectators_allowed`, `replay_available`.
- The historical `games` shim table (compat for older migrations) is no longer created and is removed by migration in current environments.

Refer to `docs/planning/go-live-plan.md` for daily status, sequencing, and acceptance criteria across these remaining tasks.
