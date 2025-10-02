# Architecture & Technical Details

_Last updated: September 30, 2025_

## Stack Overview
- **Frontend:** React 19 + Vite 7 + Redux Toolkit + Tailwind CSS v4, written in TypeScript (`frontend/`).
- **Backend:** Node.js 22.12 on Express 5 with Socket.io, Bull, and PostgreSQL, also TypeScript-first (`backend/`).
- **Shared package:** Common types and helpers published from `shared/` and consumed by both runtime targets.
- **Data stores:** PostgreSQL (authoritative persistence), Redis (caching, socket fan-out, Bull queues), and S3-compatible object storage for map art.
- **Tooling:** npm workspaces, Biome for lint/format, Vitest (frontend) + Jest (backend) + Playwright harness for smoke tests.

## Runtime Architecture
### Backend (Express + Socket.io)
- Routes live under `backend/src/routes`. Each route composes request validation, middleware (`backend/src/middleware`), and concrete services.
- Core game orchestration resides in `backend/src/services/gameService.ts` and `backend/src/game/gameEngine.ts`, which persist lifecycle transitions, enforce phase rules, and emit Socket.io deltas.
  - Hidden Treasures is implemented in `backend/src/game/hiddenTreasures.ts`. The engine handles conquest draws, forced cash-in gating, elimination transfers, and trade redemption. Configuration is applied at game start via room-level cache; see `docs/guides/hidden-treasures.md`.
- Completed matches flow through `gameService.finalizeCompletedGame`, which archives results, adjusts ELO, and calls the clan progression service (`clanProgressionService.awardContribution`). Clans are generally available (no feature flag). XP grants follow the live formula: 400 base + placement bonus (150/100/50 for 1st/2nd/3rd) + 5 × territories held (capped at +150) + a 250 win bonus, then clamped to at least 400 before emitting activity logs for analytics.
- Map workflows span `mapService.ts`, `mapWorkflowService.ts`, and `mapApprovalService.ts`, with permission checks centralized in `mapPermissionService.ts` so creator, collaborator, and admin roles stay consistent.
- Authentication combines session cookies and JWT validation in `backend/src/middleware/auth.ts`; request-scoped user context is required for any mutating route.
- Socket.io authentication and event wiring live in `backend/src/services/socketService.ts`. `setupSocketHandlers` registers auth guards, delegates chat events via `setupChatHandlers`, and queues gameplay actions through `queueService`.
- Realtime rooms follow the `game:{roomId}` convention by way of helpers in `socketService.ts` (`getGameChannel`) and the shared registry in `backend/src/services/socketRegistry.ts`, so workers, lifecycle services, and reconnect logic target the same channel identifiers.

### Workers & Queues
- Bull queues (`queueService.ts`) drive asynchronous work. Key workers live in `backend/src/workers/`:
  - `battleWorker.ts` applies battle resolution deltas and persists authoritative territory ownership.
  - `gameActionWorker.ts` processes turn-based commands and emits consolidated deltas.
  - `cleanupWorker.ts` retires completed games, cache entries, and stale modifiers.
  - `mapAssetWorker.ts` runs periodic purges of soft-deleted map art via `mapStagingService` to keep CDN storage tidy.
- `workerManager.ts` bootstraps the queue service, initializes all workers, and surfaces queue health stats for diagnostics.
- Job idempotency helpers (`jobIdempotencyService.ts`) and metrics instrumentation (`metricsService.ts`) keep retries safe and observable.
- Queue enablement is staged; gameplay jobs run end-to-end, modifier cleanup is live, and DM/map review push notifications continue to be validated before fan-out is enabled (see Launch Caveats).

### Real‑Time Game Deltas
- Contract is defined once in the shared package at `shared/types/delta.ts` and re‑exported via `@shared/types` as `GameDelta`. All runtimes (backend + frontend) use this single contract.
- Emission on the backend is centralized through the `DeltaBuilder` factory in `backend/src/types/deltaUpdates.ts`. It returns shared types (no local interfaces) and normalizes fields:
  - `armies`, `turn`, `reinforcementArmies` are clamped to non‑negative integers
  - `ownerId` is only included when a non‑empty string is provided
- Where deltas are produced:
  - Turn actions in `backend/src/workers/gameActionWorker.ts` (deploy/end turn/phase transitions, plus queued fortify updates)
  - Battle resolution in `backend/src/workers/battleWorker.ts`
  - Fog filtering and socket fan-out in `backend/src/services/fogService.ts`, which calls `io.to(...).emit('game-delta', delta)` per visible viewer
- Fortify operations stream paired `TERRITORY_UPDATE` deltas and a summarized `FORTIFY_RESULT` payload (`gameActionWorker.processFortify`) so UI logs and history stay consistent.
- Full-state syncs still emit `game-update` events from `socketService.ts` for reconnects, AFK kicks, and legacy flows.
- Frontend consumption:
  - Socket listeners in `frontend/src/services/socketService.ts` forward `game-delta` and `game-update` payloads to Redux slices
  - `gameSlice.applyDelta` in `frontend/src/store/gameSlice.ts` applies `TERRITORY_UPDATE`, `PLAYER_UPDATE`, `PHASE_CHANGE`, `BATTLE_RESULT`, `FORTIFY_RESULT`, and `GAME_END`
- Testing & guardrails:
  - A compatibility test (`backend/src/test/deltaTypesCompatibility.test.ts`) ensures `DeltaBuilder` outputs satisfy the shared `GameDelta` contract.
  - Lint/typecheck enforce shared import usage; local delta interfaces on the backend have been removed to prevent drift.

### Frontend (React + Redux Toolkit)
- Entry point `frontend/src/main.tsx` mounts the app shell defined in `App.tsx`. Routing is handled by React Router with pages under `frontend/src/pages`.
- Global state lives in `frontend/src/store`, with slices for auth, gameplay, chat, map editing, and notifications.
- API access is centralized in `frontend/src/services/api.ts` and specialized wrappers (e.g., `mapWorkflowService.ts`) that respect the shared types and handle optimistic updates.
- Real-time updates arrive through the typed socket wrapper in `frontend/src/services/socketService.ts`, which dispatches to Redux slices for gameplay (`gameSlice`), rooms, chat, notifications, and lifecycle timers.
- The map editor is token-based (`MapEditorTokens.tsx`), supporting territory tokens, sectors, adjacency management, and capital assignment backed by autosave and approval submission flows.
- The canonical in-game view is `GameRoom` at `/room/:roomId`. Spectating is supported by appending `?spectate=true` to the room URL. Admins using `?spectate=true` can bypass fog-of-war for diagnostics. The legacy `/game/:gameId` route has been removed.
- A progressive web app shell registers `public/sw.js` for gameplay turn notifications; map approval + DM push payload fan-out is tracked as an outstanding task.

### Shared Types & Utilities
- The `shared/` workspace contains TypeScript contracts (`gameState.ts`, `map.ts`, etc.), validation helpers, and enums consumed by both the frontend and backend.
- Shared constants help keep gameplay logic (turn phases, territory metadata, map schema) aligned across runtimes.

## Data & Persistence
- PostgreSQL migrations live in `backend/migrations` following the `NNN_description.sql` convention. `npm run migrate` applies them through the in-repo migration runner (`backend/src/utils/migrationRunner.ts`).
- Primary tables include `game_rooms`, `room_players`, `game_states`, `game_results`, `player_game_results`, `player_stats`, `game_moves`, map catalog tables (`maps`, `map_versions`, `map_territories`, `territory_adjacencies`), messaging tables (`conversations`, `conversation_messages`, `message_read_receipts`), and notification delivery (`notifications`, `web_push_subscriptions`).
- Redis powers `gameStateCache`, territory modifier caching, socket presence, session storage, and Bull job queues.
- Map assets store in object storage via `mapStagingService.ts`; soft-deleted assets are reclaimed by the staging purge workflow (tracked in `map_asset_purge_runs`) once retention windows expire.

## Notifications & Messaging
- Chat and notifications share identity derived from the authenticated Redux store; Socket.io channels broadcast edits, deletes, and system events through `notificationService.ts`, `realtimeNotificationService.ts`, and the chat hooks installed by `setupChatHandlers` in `socketService.ts`.
- Push subscriptions persist via `web_push_subscriptions`; the service worker relays gameplay turn reminders today.
- Clan progression updates broadcast over the shared Socket.io layer as `clan:progress` events, fanning out to `clan:{clanId}` rooms. Payloads include XP deltas, placement metadata, and objective progress so web and upcoming mobile clients can refresh contribution/goal UI without refetching the entire clan profile.
- Remaining work: complete creator/moderator map approval push fan-out and DM push roll-out (tracked as Go-Live item B2).

## Deployment & Operations
- Production (https://conquestk.com) and staging (Railway dev branch) deploy from the monorepo via npm scripts. `npm run build` produces frontend + backend bundles; `npm start` runs migrations then boots Express.
- Logging centralizes through `backend/src/utils/logger.ts`, emitting structured JSON with request IDs. Health probes cover `/healthz` and `/readyz` endpoints.
- Observability currently includes metrics for battle application, queue health, and cleanup runs (`metricsService.ts`). Frontend errors ship to the log pipeline via REST until telemetry dashboards arrive.
  - Hidden Treasures emits counters for draw, cash, and selected payout mode.

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

Data migration notes
- Legacy `status = 'finished'` is migrated to `status = 'completed'`, and the DB constraint now disallows `finished`.
- Unused columns dropped from `game_rooms`: `spectators_allowed`, `replay_available`.
- The historical `games` shim table (compat for older migrations) is no longer created and is removed by migration in current environments.

Refer to `docs/planning/go-live-plan.md` for daily status, sequencing, and acceptance criteria across these remaining tasks.
