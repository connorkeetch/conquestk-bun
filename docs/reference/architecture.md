# Architecture & Technical Details

_Last updated: January 2026_

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
- Completed matches now flow through `gameService.finalizeCompletedGame`, which archives results, adjusts ELO, and calls the clan progression service (`clanProgressionService.awardContribution`). Clans are generally available (no feature flag). XP grants use the v1 formula (400 base + per-placement bonus + 5 × territories held, capped at +150) and log activity events for analytics.
- Map workflows span `mapService.ts`, `mapWorkflowService.ts`, and `mapApprovalService.ts`, with permission checks centralized in `mapPermissionService.ts` so creator, collaborator, and admin roles stay consistent.
- Authentication combines session cookies and JWT validation in `backend/src/middleware/auth.ts`; request-scoped user context is required for any mutating route.
- Socket.io rooms follow the `game:{gameId}` convention, coordinated through `backend/src/socket/gameHandlers.ts` and the shared `socketRegistry` helper so workers, gameplay routes, and reconnect logic use the same channel identifiers.

### Workers & Queues
- Bull queues (`queueService.ts`) drive asynchronous work. Key workers live in `backend/src/workers/`:
  - `battleWorker.ts` applies battle resolution deltas and persists authoritative territory ownership.
  - `gameActionWorker.ts` processes turn-based commands and emits consolidated deltas.
  - `cleanupWorker.ts` retires completed games, cache entries, and stale modifiers.
- Job idempotency helpers (`jobIdempotencyService.ts`) and metrics instrumentation (`metricsService.ts`) keep retries safe and observable.
- Queue enablement is staged; modifier cleanup is live, while enabling DM/map review push notifications still requires additional fan-out validation (see Launch Caveats).

### Real‑Time Game Deltas
- Contract is defined once in the shared package at `shared/types/delta.ts` and re‑exported via `@shared/types` as `GameDelta`. All runtimes (backend + frontend) use this single contract.
- Emission on the backend is centralized through the `DeltaBuilder` factory in `backend/src/types/deltaUpdates.ts:1`. It returns shared types (no local interfaces) and normalizes fields:
  - `armies`, `turn`, `reinforcementArmies` are clamped to non‑negative integers
  - `ownerId` is only included when a non‑empty string is provided
- Where deltas are produced:
  - Turn actions in `backend/src/workers/gameActionWorker.ts:1` (e.g., deploy/fortify/end_turn)
  - Battle resolution in `backend/src/workers/battleWorker.ts:1`
  - The Socket.io layer emits `game-delta` to `game:{gameId}` rooms
- Fortify emits two `TERRITORY_UPDATE` deltas (source and destination territories) instead of a compound delta; consumers should handle sequential updates.
- Frontend consumption:
  - Socket listener in `frontend/src/services/socketService.ts:1` forwards payloads to Redux
  - `gameSlice.applyDelta` in `frontend/src/store/gameSlice.ts:1` applies `TERRITORY_UPDATE`, `PLAYER_UPDATE`, `PHASE_CHANGE`, `BATTLE_RESULT`, and `GAME_END`
- Testing & guardrails:
  - A compatibility test (`backend/src/test/deltaTypesCompatibility.test.ts:1`) ensures `DeltaBuilder` outputs satisfy the shared `GameDelta` contract.
  - Lint/typecheck enforce shared import usage; local delta interfaces on the backend have been removed to prevent drift.

### Frontend (React + Redux Toolkit)
- Entry point `frontend/src/main.tsx` mounts the app shell defined in `App.tsx`. Routing is handled by React Router with pages under `frontend/src/pages`.
- Global state lives in `frontend/src/store`, with slices for auth, gameplay, chat, map editing, and notifications.
- API access is centralized in `frontend/src/services/api.ts` and specialized wrappers (e.g., `mapWorkflowService.ts`) that respect the shared types and handle optimistic updates.
- Real-time updates arrive through `socket.io-client` (`frontend/src/services/socket.ts`) and reconcile through slice-specific reducers that apply backend deltas.
- The map editor is token-based (`MapEditorTokens.tsx`), supporting territory tokens, continents, adjacency management, and capital assignment backed by autosave and approval submission flows.
- A progressive web app shell registers `public/sw.js` for gameplay turn notifications; map approval + DM push payload fan-out is tracked as an outstanding task.

### Shared Types & Utilities
- The `shared/` workspace contains TypeScript contracts (`gameState.ts`, `map.ts`, etc.), validation helpers, and enums consumed by both the frontend and backend.
- Shared constants help keep gameplay logic (turn phases, territory metadata, map schema) aligned across runtimes.

## Data & Persistence
- PostgreSQL migrations live in `backend/migrations` following the `NNN_description.sql` convention. `npm run migrate` applies them through the in-repo migration runner (`backend/src/utils/migrationRunner.ts`).
- Primary tables include `maps`, `map_territories`, `territory_adjacencies`, `games`, `game_players`, `game_results`, `player_game_results`, `player_stats`, `notifications`, and `web_push_subscriptions`.
- Redis powers `gameStateCache`, territory modifier caching, socket presence, session storage, and Bull job queues.
- Map assets store in object storage via `mapStagingService.ts`; soft-deleted assets are reclaimed by the staging purge workflow once retention windows expire.

## Notifications & Messaging
- Chat and notifications share identity derived from the authenticated Redux store; Socket.io channels broadcast edits, deletes, and system events through `notificationService.ts` and `realtimeNotificationService.ts`.
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

Refer to `docs/planning/go-live-plan.md` for daily status, sequencing, and acceptance criteria across these remaining tasks.
