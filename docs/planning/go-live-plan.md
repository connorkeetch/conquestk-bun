# Go-Live Consolidated Backlog & Implementation Plan
_Last updated: September 21, 2025_
Go Live is tentatively set for Oct 1, 2025

## Purpose & Conventions
- **Doc purpose:** Merge every go-live finding into a single plan that unblocks launch, aligns public promises with reality, and lowers risk.
- **Priority legend:** `P0` launch blocker, `P1` same milestone once P0 lands, `P2` polish/cleanup, `P3` nice-to-have.
- **Workstream tags:** `[fe]` frontend, `[be]` backend, `[ws]` websockets/sockets, `[sec]` security, `[wrk]` workers/queues, `[ops]` infra & observability, `[doc]` docs/legal, `[ux]` UX/design.

## Executive Summary
- ✅ Core gameplay persistence, lifecycle transitions, and socket alignment are production-ready; remaining blockers concentrate on workflows and player-facing truthfulness.
- Map tooling still lacks authorization (continents, territories, adjacency, approvals), enabling any authenticated user to mutate published content.
- The Play hub advertises Quick Match/Ranked/AI routes that do not exist yet, and header/profile stats still surface placeholder data despite backend telemetry being available.
- Chat and notification systems remain inconsistent: identity comes from `localStorage`, edits/deletes only echo locally, and map approval/DM fan-out is still TODO.
- Bull/cleanup workers cannot be enabled safely until modifier cleanup, dead-letter handling, and queue health monitoring land.
- Docs/marketing should be refreshed once the above items are complete to ensure feature parity messaging.

> **Execution order:** Finish every `P0` before shipping (persistence, authorization, lifecycle + sockets, minimum notifications, truthful navigation), then tackle `P1` (stats wiring, chat consistency, map workflow polish, worker safety), followed by `P2`/`P3` items.

## Epic A — Core Game Lifecycle, Persistence & Rankings
### A1. Persist battle outcomes & game results (authoritative state)
- **Priority:** P0 • **Tags:** [be][wrk][ws][ops]
- **Status:** ✅ Completed (September 2025)
- **Problem:** `battleWorker` emits deltas but skips `applyBattleResult`; `GameService` leaves TODOs for archival/history/ELO, so restarts roll back ownership and end-of-game data never exists.
- **Acceptance criteria:**
  - `applyBattleResult(...)` updates ownership/armies in cache and database atomically.
  - Game completion archives the match, computes ELO, writes player/game history rows, and updates leaderboards via Postgres-safe `UPSERT`.
  - Worker handlers are idempotent; integration tests simulate worker restart without state loss.
  - Metrics exist (`battle_applied_total`, in-memory vs DB divergence gauge, alert on failed apply > _N_/min).
- **Dependencies:** A3 lifecycle state machine, D2 observability/stats.
- **Notes:** Replace SQLite-style `INSERT OR REPLACE` with `INSERT ... ON CONFLICT ... DO UPDATE`.
- _Progress (Sep 2025): Worker apply now persists territory updates atomically, archives to new `game_results` + `player_game_results`, updates ELO/leaderboard via `ON CONFLICT`, and emits battle apply/failure metrics with alerting._

### A2. Replace fixtures with live server state
- **Priority:** P0 • **Tags:** [fe][ws]
- **Status:** ✅ Completed (September 2025)
- **Problem:** The play route renders from hard-coded `gameData`; the board pulls ownership from bundled JSON; room handler is a TODO.
- **Acceptance criteria:**
  - Client subscribes to `game:<roomId>` (per A4) and renders authoritative state; no fixtures ship in production.
  - Territory clicks dispatch phase-aware actions that reach the server and mutate state.
  - End-to-end flow passes: create room → ready-check → play → battle outcome → end game → post-game summary.

### A3. Implement game start & lifecycle state machine
- **Priority:** P0 • **Tags:** [be][ws]
- **Status:** ✅ Completed (September 2025)
- **Problem:** `GameRoomService.createRoom` only inserts a lobby row; initialization, ready-check, lobby→active hand-off, and `currentGame` creation never occur.
- **Acceptance criteria:**
  - Persisted lifecycle: `lobby → initializing → active → completed` with phase, turn, and timers.
  - Ready-check and start conditions enforced server-side; transitions broadcast to the room.
  - Game completion automatically triggers A1 archival.

### A4. Fix Socket.IO channel naming & membership
- **Priority:** P0 • **Tags:** [ws]
- **Status:** ✅ Completed (September 2025)
- **Problem:** Clients join `roomId` while workers emit to `game:<roomId>`, so players miss every update.
- **Acceptance criteria:**
  - A single canonical channel (`game:<roomId>` or equivalent) shared by server, workers, and clients.
  - On join, server validates membership, subscribes the client, and backfills the latest authoritative state.
  - Load test (> _N_ concurrent clients) shows no dropped deltas; reconnect replays missed state.

### A5. Core rules parity (continent bonuses, teams, capitals)
- **Priority:** P0 • **Tags:** [be][fe]
- **Status:** ✅ Completed (September 2025)
- **Problem:** Bonuses and team play remain TODOs; capital checks are stubbed; client helpers hard-code classic continents.
- **Acceptance criteria:**
  - Backend calculates reinforcements with map metadata (no hard-coded constants).
- Team rules (reinforcement sharing, win conditions) exist or the UI disables team mode pre-launch.
- Capital mode implements `isCapitalTerritory`; eliminations trigger correctly.
- Tests cover classic plus one custom map; frontend renders bonuses from server data only.
- _Progress (September 2025): Lobby creation now supports explicit team counts, hosts can assign players per team,
  and the engine enforces alliances for movement/combat with team-based victory checks. Reinforcement math
  now pulls continent bonuses from map metadata for both backend workers and the client UI, and the capital
  warning path (`isCapitalTerritory`) reflects cached game state._
- _Progress (September 2025): Reinforcement placements can now target any teammate-owned territory. Backend validation
  and tests cover the new path, the board blocks enemy selections, and the reinforcement panel highlights
  team gifts. The pooling follow-up is closed out in favor of this direct placement flow._

## Epic B — Security & Map Authoring Workflow
### B1. Enforce map ownership & permissions (incl. approval/versioning)
- **Priority:** P0 • **Tags:** [be][sec]
- **Status:** ✅ Completed (September 2025)
- **Problem:** Continent/territory/adjacency/version routes allow any authenticated user to mutate any map; approval controller lacks authorization.
- **Acceptance criteria:**
  - Permission model documented and enforced for creator, collaborator, admin.
  - Every mutate route returns 403 to non-owners; Supertest covers IDOR attempts.
  - Approval/rejection requires appropriate role and writes audit logs (actor, timestamp, before/after).
- _Implementation notes (September 2025): Map collaborator roles (`editor`, `viewer`) now back the permission checks; creator/admin retain implicit edit rights and approvals capture before/after deltas in `admin_activity_logs`._
- _Progress (September 2025): Map workflow + approval routes require `map_approval` admin permission, enforce `mapPermissionService` for submissions and history reads, log before/after snapshots to `admin_activity_logs`, and ship Supertests for owner vs intruder flows across REST surfaces._

### B2. Creator & reviewer notifications (real fan-out)
- **Priority:** P1 (upgrade pieces that block workflow sooner) • **Tags:** [be][ws][fe][ops]
- **Status:** 🟡 In progress (durable subscriptions + service worker shipped; approval/DM fan-out pending).
- **Problem:** Approval/rejection only logs; admin fan-out TODO; service worker missing; push subscriptions live in memory.
- **Acceptance criteria:**
  - In-app notifications delivered via WebSocket fan-out for creators and moderators.
  - Service worker registered; VAPID keys configured; durable subscription storage (database-backed).
  - Notification preferences exposed in profile. DM push stays deferred to C3.
- _Progress (September 2025): Web push now persists in `web_push_subscriptions`, the service worker serves production-ready assets, and gameplay events (start/turn/end) trigger push notifications. Map approval/DM fan-out still pending._
- _Progress (September 2025): DM sends and map review decisions now fan-out over WebSocket with matching push payloads; admin review queue emits live alerts to moderators._

### B3. Map staging asset lifecycle
- **Priority:** P1 • **Tags:** [be][ops]
- **Status:** 🟡 In progress (purge worker + metrics live; still monitoring failure telemetry to tune thresholds).
- **Problem:** Deleting map images marks rows deleted but never removes files.
- **Acceptance criteria:**
  - Soft-delete policy with background purge (bucket/API delete) and metrics.
  - Admin reclaim tool exists; deletion failures retry and alert.
- _Progress (September 2025): Staging images now purge automatically after retention, recording runs in `map_asset_purge_runs`; admins can reclaim before purge, trigger manual runs, and receive alerts when deletions repeatedly fail._

## Epic C — Chat & Social Consistency
### C1. Identity & state source of truth
- **Priority:** P1 • **Tags:** [fe][be][ws]
- **Status:** ✅ Completed (September 2025)
- **Problem:** `chatSlice` reads `userId` from `localStorage`; auth never writes it; DM addressing breaks.
- **Acceptance criteria:**
  - Chat derives identity from Redux auth state; `localStorage` reserved for auth session plumbing.
  - DM conversation IDs deterministic and auth-backed.
- _Progress (September 2025): Redux-authenticated user IDs now drive chat identity, replacing the `localStorage` lookup and stabilizing DM conversation keys so both ends resolve to the same deterministic conversation ID._

### C2. Broadcast chat edits/deletes
- **Priority:** P1 • **Tags:** [be][ws][fe]
- **Status:** ✅ Completed (September 2025)
- **Problem:** Edit/delete acknowledgements stream only to the issuing client.
- **Acceptance criteria:**
  - Server emits edit/delete to all participants; frontend updates in-place and reconciles on reconnect.
- _Progress (Jan 2026): Socket handlers now fan out edit/delete events to every participant (game, team, or DM rooms), and the chat container reconciles those broadcasts so messages mutate or mark deleted immediately across clients._

### C3. DM push notifications (deferred)
- **Priority:** P3 • **Tags:** [be][ops][fe]
- **Status:** ✅ Completed (September 2025)
- **Problem:** Rows store DM notifications but push is unimplemented.
- **Acceptance criteria:**
  - When enabled, DM creates a queued push delivered via service worker with deep-link; honours user preferences.
- _Progress (Jan 2026): DM notifications now respect per-user browser/email toggles in `user_preferences`, expose a toggle in Settings → Notifications, and only enqueue push payloads when the recipient has opted in; payloads deep-link to `/messages/{senderId}` via the existing service worker._

## Epic D — Navigation, Stats & UX Truthfulness
### D1. Repair Play hub routing
- **Priority:** P0 • **Tags:** [fe]
- **Status:** ✅ Completed (September 2025)
- **Problem:** Hub advertises Quick Match/Ranked/vs AI but only `/play` exists.
- **Acceptance criteria:**
  - Either ship working routes or hide cards behind feature flags; hub produces zero 404s.
- _Progress (September 2025): `/play` now links to working Casual and Ranked matchmaking pages, Create/Browse cards target existing lobby flows, and the AI tile leads to a Coming Soon screen so nothing throws 404s._

### D2. Player stats & header data
- **Priority:** P1 (depends on A1/A3) • **Tags:** [fe][be]
- **Status:** ✅ Completed (September 2025)
- **Problem:** Stats page is stubbed; header uses hard-coded level/win rate; advanced metrics show zeros.
- **Acceptance criteria:**
  - Profile and Stats pages read real API data; header reflects actual values.
  - Advanced metrics (e.g., `best_territories`, `streaks`) compute once history exists.
  - If backend not ready, gate the page via feature flag instead of displaying placeholders.
- _Progress (September 2025): Hooked `/profile` + `/profile/stats` responses into the profile Stats tab, dedicated /profile/stats page, and header menu so games played, wins, win rate, streaks, map/mode breakdown, and rank all read from live data. New queries mine `player_game_results`, `game_results`, `game_moves`, and `player_stats` for territory highs, 90-day timelines, and card trade counts (no separate card tables exist today). Manual smoke checklist added for validating stats after a match._

### D3. Audio cue mismatches
- **Priority:** P1 • **Tags:** [fe]
- **Status:** ✅ Completed (September 2025)
- **Problem:** `playEffect('turn')` vs `yourturn` mismatch.
- **Acceptance criteria:**
  - Unified key map or aliasing, with a unit test preventing regressions.
- _Progress (September 2025): Locked the AudioService effect map behind typed keys so legacy calls like `playEffect('turn')` always resolve to `yourturn`, and the regression test continues to assert the alias path._

### D4. Hide "Tournaments" and other "coming soon" surfaces
- **Priority:** P2 • **Tags:** [fe]
- **Status:** ✅ Completed (September 2025)
- **Acceptance criteria:**
  - Feature-flag or remove until real data exists.
- _Progress (September 2025): Tournament, AI, profile previews, and other "coming soon" panels now hide behind admin-controlled feature flags, with the flags surfaced in Admin Settings and defaulted off for production._

## Epic E — Workers, Queues & Cleanup
### E1. Enable Bull queues safely
- **Priority:** P1 • **Tags:** [wrk][ops][be]
- **Status:** ✅ Completed (September 2025)
- **Problem:** Cleanup worker now wires through territory modifier cleanup, queue telemetry surfaces stalled/latency warnings, and failed jobs flow into a managed dead-letter queue with alerts.
- **Acceptance criteria:**
  - Referenced services exist or hooks removed before enabling queues.
  - Health checks for stall/latency, dead-letter handling, and idempotent jobs.
- _Progress (September 2025): Activated Bull queues behind idempotency guards so duplicate jobs short-circuit, promoted cleanup worker territory modifier purge, introduced per-queue latency/stall diagnostics in the health endpoint, and routed terminal failures into a dedicated DLQ with automatic retention cleanup._

### E2. Cleanup worker modifier service
- **Priority:** P1 • **Tags:** [be][wrk]
- **Status:** ✅ Completed (September 2025)
- **Acceptance criteria:**
  - Implement modifier service or drop the hook; add tests covering cleanup outcomes and idempotency.
- _Progress (September 2025): Cleanup worker now invokes the modifier purge path with idempotency guards, and Jest coverage asserts finished-game cleanup touches territory modifiers, cache cleanup, and skips duplicate jobs._

## Epic F — Documentation, Legal & Product Copy
### F1. Align README, marketing, and architecture docs with reality
- **Priority:** P2 (legal copy may escalate) • **Tags:** [doc]
- **Status:** ⏳ Not started (queue behind gameplay & workflow fixes).
- **Problem:** Docs/marketing claim ELO, spectator, PWA/offline, and continent bonuses are live; architecture still references polygon drawing.
- **Acceptance criteria:**
  - Update or feature-flag claims; architecture documents the current map editor model.
  - Terms of Service avoid "beta resets" unless true; privacy policy dates verified.

### F2. Security checklist re-run
- **Priority:** P2 • **Tags:** [doc][sec]
- **Status:** ⏳ Not started (schedule once map auth + chat parity land).
- **Acceptance criteria:**
  - Post-change review covering rate limits, sanitation, authZ; document configuration and test evidence.

## Epic G — DevEx, CI/CD, Testing & Repo Hygiene
### G1. CI gating & coverage
- **Priority:** P2 • **Tags:** [ops]
- **Status:** ⏳ Not started (needs plan after worker + auth changes ship).
- **Acceptance criteria:**
  - CI runs typecheck, lint, unit, integration, and smoke e2e jobs.
  - Known lint debt quarantined via baseline; pipeline fails on new issues.
  - Add targeted tests for game actions, map editor, socket join/broadcast, and A1 persistence.

### G2. Large file safeguards & legacy cleanup
- **Priority:** P2 • **Tags:** [ops]
- **Status:** ⚠️ In progress (duplicate audio directories + backup artefacts tracked in cleanup plan).
- **Acceptance criteria:**
  - Git LFS or hooks for audio/large assets; legacy audio directory retired; scripts audited; archived migrations decision recorded.

### G3. Minimal analytics & telemetry
- **Priority:** P2 • **Tags:** [ops][fe][be]
- **Status:** ⏳ Not started (dependent on live stats + worker instrumentation).
- **Acceptance criteria:**
  - Emit funnel events (lobby→match start, battle resolved, match completed, approval decision).
  - Error logging carries correlation IDs across frontend↔backend↔workers; dashboards exist for play completion and approval throughput.

## Cross-Epic Dependencies
- A1, A3, and A4 form the gameplay foundation; D2 hinges on A1 data.
- Ship B1 before B2 to avoid notifying on an insecure workflow.
- Land E1/E2 after A1 to avoid processing invalid state.
- D1 should accompany A3 so navigation matches the lifecycle.

## Suggested Sequencing
1. **P0 phase:** A1, A3, A4, A5, B1, D1.
2. **Same milestone (immediately after P0):** B2, C1, C2, D2, D3, E1, E2, B3.
3. **Polish/cleanup:** D4, F1, F2, G1, G2, G3, C3.

## Ticket Backlog (copy directly into your tracker)
### P0 — Must fix before opening to players
- **P0-A1. Persist battle outcomes & archival** `[be][wrk][ws]`
  - DoD: atomic DB + cache writes; end-game history/ELO/leaderboard (UPSERT); worker restart integration test; metrics/alerts wired.
- **P0-A3. Lifecycle state machine** `[be][ws]`
  - DoD: persisted states, enforced ready-check, transition events, archival trigger, green happy-path e2e.
- **P0-A4. Socket channel unification** `[ws]`
  - DoD: all joins/emits use `game:<roomId>`; reconnect backfills state; load test passes.
- **P0-A2. Remove fixtures; live board** `[fe][ws]`
  - DoD: no bundled ownership JSON; board renders server state; clicks are phase-aware; smoke test passes.
- **P0-A5. Bonuses/teams/capitals parity** `[be][fe]`
  - DoD: server computes bonuses via metadata; capital rule works; team mode implemented or hidden; classic/custom map tests.
- **P0-B1. Map route authorization** `[be][sec]`
  - DoD: ownership/role checks on every mutate route; IDOR Supertest suite; approval audit log.
- **P0-D1. Play hub routing truth** `[fe]`
  - DoD: no dead links; cards hidden or implemented; 404 scan clean.

### P1 — Same milestone follow-ups
- **P1-D2. Real stats & header data** `[fe][be]`
- **P1-C1. Chat identity from auth store** `[fe]`
- **P1-C2. Chat edit/delete fan-out** `[be][ws][fe]`
- **P1-B2. Creator/admin notifications** `[be][ws][fe][ops]`
- **P1-B3. Asset lifecycle purge** `[be][ops]`
- **P1-E1. Enable Bull queues** `[wrk][ops]`
- **P1-E2. Cleanup worker modifiers** `[be][wrk]`
- **P1-D3. Audio cue key alignment** `[fe]`
  - Each entry keeps the DoD from the epic sections above.

### P2 — Medium / polish
- **P2-F1. Docs & marketing alignment** `[doc]`
- **P2-F2. Security checklist re-run** `[doc][sec]`
- **P2-G1. CI baseline & tests** `[ops]`
- **P2-G2. LFS & repo cleanup** `[ops]`
- **P2-D4. Hide “Tournaments”** `[fe]`
- **P2-G3. Minimal analytics** `[ops][fe][be]`

### P3 — Nice-to-have
- **P3-C3. DM push notifications** `[be][ops][fe]`

## API & Data Model Notes
- Minimal history/ELO schema:
  - `matches(id, created_at, completed_at, map_id, mode, winner_player_id, state_hash)`
  - `match_players(match_id, player_id, placement, armies_lost, territories_captured, is_team, team_id)`
  - `player_ratings(player_id, mu, sigma, elo, last_updated)`
  - `player_stats(player_id, games_played, wins, best_territories, longest_streak, last_updated)`
  - `notifications(id, recipient_id, kind, payload_json, read_at, created_at)`
- Use `UPSERT` (`ON CONFLICT`) for leaderboards and rating snapshots.
- Permissions: map ownership gates every mutation; approval routes require `role = admin | moderator`. Add `map_collaborators(map_id, user_id, role)` if delegated access is needed.
- Sockets: canonical room name `game:<roomId>`; on join, emit `state:full` snapshot followed by incremental `state:delta` events.

## Test Plan (QA will verify)
- **Persistence:** restart a worker mid-match → territory ownership remains correct; finishing game writes history & ratings.
- **AuthZ:** non-owner map edits → HTTP 403 with audit log entry.
- **Realtime:** two clients remain in sync across battle sequences; reconnection repaints board.
- **Gameplay rules:** continent bonus totals match metadata for classic + one custom map.
- **Notifications:** creator receives in-app approval notice; admin receives submission broadcast.
- **Navigation/UX:** no 404s from Play hub; no placeholder stats when feature gated.
- **Chat:** edit/delete sync across clients; DMs use authenticated identity.

## Risk Register & Mitigations
- **History/ratings migrations:** ship additive, backward-compatible migrations with feature flags; shadow-write before cutover.
- **Queue enablement race conditions:** add idempotency keys/job dedupe, dead-letter queues, canary rollout.
- **Over-promised features:** land feature flags and copy changes together to avoid mismatched marketing.

## Traceability Crosswalk
- A1–A5 cover persistence/ELO/history, worker `applyBattleResult`, socket mismatch, lifecycle, board fixtures, continent bonuses, team/capital rules.
- B1–B2 cover map authorization gaps, approval checks, and notifications fan-out.
- B3/E2 handle staging asset deletion and worker dependencies.
- C1–C2 cover chat identity and edit/delete broadcasts.
- D2, D4 cover stats placeholders, header metrics, and Play hub/Tournaments.
- D3 addresses audio cue mismatch.
- B2 (now) & C3 (later) manage service worker and push groundwork.
- F1–F2 align docs/legal; G1–G3 cover repo hygiene, CI, analytics.
- Leaderboard `UPSERT` reminder ties back to A1.

## Working Agreement
1. Create one issue per ticket from this plan.
2. Link each PR to its ticket and check off DoD bullets.
3. Keep this document as the single source of truth for go-live readiness and move completed items to release notes once delivered.

## Status Snapshot (reviewed September 2025)

### Done (✅)
- A1. Persist battle outcomes & game results (authoritative state)
- A2. Replace fixtures with live server state
- A3. Implement game start & lifecycle state machine
- A4. Fix Socket.IO channel naming & membership
- A5. Core rules parity (continent bonuses, teams, capitals)
- C1. Identity & state source of truth
- C2. Broadcast chat edits/deletes
- C3. DM push notifications (deferred)
- D1. Repair Play hub routing
- D2. Player stats & header data
- D3. Audio cue mismatches
- D4. Hide "Tournaments" and other "coming soon" surfaces
- E1. Enable Bull queues safely
- E2. Cleanup worker modifier service

### In progress (⚠️ / 🟡)
- B1. Enforce map ownership & permissions (incl. approval/versioning)
- B2. Creator & reviewer notifications (real fan-out)
- B3. Map staging asset lifecycle
- G2. Large file safeguards & legacy cleanup

### Not started (⏳)
- F1. Align README, marketing, and architecture docs with reality
- F2. Security checklist re-run
- G1. CI gating & coverage
- G3. Minimal analytics & telemetry
