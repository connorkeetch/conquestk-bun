# Go-Live Consolidated Backlog & Implementation Plan
_Last updated: September 20, 2025_

## Purpose & Conventions
- **Doc purpose:** Merge every go-live finding into a single plan that unblocks launch, aligns public promises with reality, and lowers risk.
- **Priority legend:** `P0` launch blocker, `P1` same milestone once P0 lands, `P2` polish/cleanup, `P3` nice-to-have.
- **Workstream tags:** `[fe]` frontend, `[be]` backend, `[ws]` websockets/sockets, `[sec]` security, `[wrk]` workers/queues, `[ops]` infra & observability, `[doc]` docs/legal, `[ux]` UX/design.

## Executive Summary
- Core gameplay state and rankings never persist; finished matches broadcast deltas only, so leaderboards, history, and post-game stats are impossible.
- Map tooling lacks authorization (continents, territories, adjacency, versions, approvals) which lets any authenticated user mutate critical data.
- Socket channels and the client loop are misaligned (channel naming mismatch, fixtures powering the board, no phase awareness), breaking real-time play.
- Promised notifications are missing (no service worker, subscriptions live in memory, admin/creator fan-out stubbed, chat edits/deletes stay local).
- Navigation and UX oversell features (dead routes, placeholder stats, hard-coded header metrics, "Tournaments" stub).
- Workers will fail if enabled because modifier hooks are stubs and asset cleanup never runs.
- Docs/marketing drift (ELO, spectator, PWA/offline, continent bonuses) needs either feature parity now or copy updates.

> **Execution order:** Finish every `P0` before shipping (persistence, authorization, lifecycle + sockets, minimum notifications, truthful navigation), then tackle `P1` (stats wiring, chat consistency, map workflow polish, worker safety), followed by `P2`/`P3` items.

## Epic A — Core Game Lifecycle, Persistence & Rankings
### A1. Persist battle outcomes & game results (authoritative state)
- **Priority:** P0 • **Tags:** [be][wrk][ws][ops]
- **Problem:** `battleWorker` emits deltas but skips `applyBattleResult`; `GameService` leaves TODOs for archival/history/ELO, so restarts roll back ownership and end-of-game data never exists.
- **Acceptance criteria:**
  - `applyBattleResult(...)` updates ownership/armies in cache and database atomically.
  - Game completion archives the match, computes ELO, writes player/game history rows, and updates leaderboards via Postgres-safe `UPSERT`.
  - Worker handlers are idempotent; integration tests simulate worker restart without state loss.
  - Metrics exist (`battle_applied_total`, in-memory vs DB divergence gauge, alert on failed apply > _N_/min).
- **Dependencies:** A3 lifecycle state machine, D2 observability/stats.
- **Notes:** Replace SQLite-style `INSERT OR REPLACE` with `INSERT ... ON CONFLICT ... DO UPDATE`.

### A2. Replace fixtures with live server state
- **Priority:** P0 • **Tags:** [fe][ws]
- **Problem:** The play route renders from hard-coded `gameData`; the board pulls ownership from bundled JSON; room handler is a TODO.
- **Acceptance criteria:**
  - Client subscribes to `game:<roomId>` (per A4) and renders authoritative state; no fixtures ship in production.
  - Territory clicks dispatch phase-aware actions that reach the server and mutate state.
  - End-to-end flow passes: create room → ready-check → play → battle outcome → end game → post-game summary.

### A3. Implement game start & lifecycle state machine
- **Priority:** P0 • **Tags:** [be][ws]
- **Problem:** `GameRoomService.createRoom` only inserts a lobby row; initialization, ready-check, lobby→active hand-off, and `currentGame` creation never occur.
- **Acceptance criteria:**
  - Persisted lifecycle: `lobby → initializing → active → completed` with phase, turn, and timers.
  - Ready-check and start conditions enforced server-side; transitions broadcast to the room.
  - Game completion automatically triggers A1 archival.

### A4. Fix Socket.IO channel naming & membership
- **Priority:** P0 • **Tags:** [ws]
- **Problem:** Clients join `roomId` while workers emit to `game:<roomId>`, so players miss every update.
- **Acceptance criteria:**
  - A single canonical channel (`game:<roomId>` or equivalent) shared by server, workers, and clients.
  - On join, server validates membership, subscribes the client, and backfills the latest authoritative state.
  - Load test (> _N_ concurrent clients) shows no dropped deltas; reconnect replays missed state.

### A5. Core rules parity (continent bonuses, teams, capitals)
- **Priority:** P0 • **Tags:** [be][fe]
- **Problem:** Bonuses and team play remain TODOs; capital checks are stubbed; client helpers hard-code classic continents.
- **Acceptance criteria:**
  - Backend calculates reinforcements with map metadata (no hard-coded constants).
  - Team rules (reinforcement sharing, win conditions) exist or the UI disables team mode pre-launch.
  - Capital mode implements `isCapitalTerritory`; eliminations trigger correctly.
  - Tests cover classic plus one custom map; frontend renders bonuses from server data only.

## Epic B — Security & Map Authoring Workflow
### B1. Enforce map ownership & permissions (incl. approval/versioning)
- **Priority:** P0 • **Tags:** [be][sec]
- **Problem:** Continent/territory/adjacency/version routes allow any authenticated user to mutate any map; approval controller lacks authorization.
- **Acceptance criteria:**
  - Permission model documented and enforced for creator, collaborator, admin.
  - Every mutate route returns 403 to non-owners; Supertest covers IDOR attempts.
  - Approval/rejection requires appropriate role and writes audit logs (actor, timestamp, before/after).

### B2. Creator & reviewer notifications (real fan-out)
- **Priority:** P1 (upgrade pieces that block workflow sooner) • **Tags:** [be][ws][fe][ops]
- **Problem:** Approval/rejection only logs; admin fan-out TODO; service worker missing; push subscriptions live in memory.
- **Acceptance criteria:**
  - In-app notifications delivered via WebSocket fan-out for creators and moderators.
  - Service worker registered; VAPID keys configured; durable subscription storage (database-backed).
  - Notification preferences exposed in profile. DM push stays deferred to C3.

### B3. Map staging asset lifecycle
- **Priority:** P1 • **Tags:** [be][ops]
- **Problem:** Deleting map images marks rows deleted but never removes files.
- **Acceptance criteria:**
  - Soft-delete policy with background purge (bucket/API delete) and metrics.
  - Admin reclaim tool exists; deletion failures retry and alert.

## Epic C — Chat & Social Consistency
### C1. Identity & state source of truth
- **Priority:** P1 • **Tags:** [fe][be][ws]
- **Problem:** `chatSlice` reads `userId` from `localStorage`; auth never writes it; DM addressing breaks.
- **Acceptance criteria:**
  - Chat derives identity from Redux auth state; `localStorage` reserved for auth session plumbing.
  - DM conversation IDs deterministic and auth-backed.

### C2. Broadcast chat edits/deletes
- **Priority:** P1 • **Tags:** [be][ws][fe]
- **Problem:** Edit/delete acknowledgements stream only to the issuing client.
- **Acceptance criteria:**
  - Server emits edit/delete to all participants; frontend updates in-place and reconciles on reconnect.

### C3. DM push notifications (deferred)
- **Priority:** P3 • **Tags:** [be][ops][fe]
- **Problem:** Rows store DM notifications but push is unimplemented.
- **Acceptance criteria:**
  - When enabled, DM creates a queued push delivered via service worker with deep-link; honours user preferences.

## Epic D — Navigation, Stats & UX Truthfulness
### D1. Repair Play hub routing
- **Priority:** P0 • **Tags:** [fe]
- **Problem:** Hub advertises Quick Match/Ranked/vs AI but only `/play` exists.
- **Acceptance criteria:**
  - Either ship working routes or hide cards behind feature flags; hub produces zero 404s.

### D2. Player stats & header data
- **Priority:** P1 (depends on A1/A3) • **Tags:** [fe][be]
- **Problem:** Stats page is stubbed; header uses hard-coded level/win rate; advanced metrics show zeros.
- **Acceptance criteria:**
  - Profile and Stats pages read real API data; header reflects actual values.
  - Advanced metrics (e.g., `best_territories`, `streaks`) compute once history exists.
  - If backend not ready, gate the page via feature flag instead of displaying placeholders.

### D3. Audio cue mismatches
- **Priority:** P1 • **Tags:** [fe]
- **Problem:** `playEffect('turn')` vs `yourturn` mismatch.
- **Acceptance criteria:**
  - Unified key map or aliasing, with a unit test preventing regressions.

### D4. Hide "Tournaments" and other "coming soon" surfaces
- **Priority:** P2 • **Tags:** [fe]
- **Acceptance criteria:**
  - Feature-flag or remove until real data exists.

## Epic E — Workers, Queues & Cleanup
### E1. Enable Bull queues safely
- **Priority:** P1 • **Tags:** [wrk][ops][be]
- **Problem:** Cleanup worker references unimplemented territory modifier service; queues will crash at runtime.
- **Acceptance criteria:**
  - Referenced services exist or hooks removed before enabling queues.
  - Health checks for stall/latency, dead-letter handling, and idempotent jobs.

### E2. Cleanup worker modifier service
- **Priority:** P1 • **Tags:** [be][wrk]
- **Acceptance criteria:**
  - Implement modifier service or drop the hook; add tests covering cleanup outcomes and idempotency.

## Epic F — Documentation, Legal & Product Copy
### F1. Align README, marketing, and architecture docs with reality
- **Priority:** P2 (legal copy may escalate) • **Tags:** [doc]
- **Problem:** Docs/marketing claim ELO, spectator, PWA/offline, and continent bonuses are live; architecture still references polygon drawing.
- **Acceptance criteria:**
  - Update or feature-flag claims; architecture documents the current map editor model.
  - Terms of Service avoid "beta resets" unless true; privacy policy dates verified.

### F2. Security checklist re-run
- **Priority:** P2 • **Tags:** [doc][sec]
- **Acceptance criteria:**
  - Post-change review covering rate limits, sanitation, authZ; document configuration and test evidence.

## Epic G — DevEx, CI/CD, Testing & Repo Hygiene
### G1. CI gating & coverage
- **Priority:** P2 • **Tags:** [ops]
- **Acceptance criteria:**
  - CI runs typecheck, lint, unit, integration, and smoke e2e jobs.
  - Known lint debt quarantined via baseline; pipeline fails on new issues.
  - Add targeted tests for game actions, map editor, socket join/broadcast, and A1 persistence.

### G2. Large file safeguards & legacy cleanup
- **Priority:** P2 • **Tags:** [ops]
- **Acceptance criteria:**
  - Git LFS or hooks for audio/large assets; legacy audio directory retired; scripts audited; archived migrations decision recorded.

### G3. Minimal analytics & telemetry
- **Priority:** P2 • **Tags:** [ops][fe][be]
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
