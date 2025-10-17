# Deterministic Lockstep & Replay Evaluation

## TL;DR
- Persistent desyncs and the absence of an end-to-end shippable match mean we are paying the maintenance cost of the snapshot+delta stack without enjoying stability; now is the cheapest moment to rebuild around strict determinism.
- Moving to deterministic lockstep forces us to centralize randomness, unify action sequencing, and treat inputs as the source of truth, which directly addresses the current drift bugs and yields trustworthy replays and audits.
- Recommend **Adopt fully**: replace the delta transport with an input-driven lockstep loop, add seeded RNG + checksums, and wire replay/resync flows around ordered frames while we still have freedom to break compatibility.

## Current transport, storage, and replay pipeline
- The lifecycle service emits complete `game:snapshot` payloads to every player whenever a match starts or resyncs, alongside per-turn metadata. 【F:backend/src/services/gameLifecycleService.ts†L720-L776】
- After each action the `DeltaEmitter` produces fog-aware batched deltas (phase, player, territory updates) instead of resending the whole state. 【F:backend/src/services/deltaEmitter.ts†L62-L148】
- `GameService` persists an authoritative JSON snapshot for the current turn, updates the `game_rooms` turn metadata, and appends immutable turn/phase snapshots for replay queries. 【F:backend/src/services/gameService.ts†L325-L406】
- The replay feature already reconstructs finished matches from `game_logs` plus `game_state_snapshots`, chunked by turn, with no live sockets involved. 【F:docs/guides/game-replay.md†L3-L15】

## Determinism gaps today
- Core game setup still uses `Math.random()` to shuffle player order, distribute territories, and assign rotating objectives, bypassing the seeded combat RNG helper. 【F:backend/src/game/gameEngine.ts†L525-L612】
- Treasures, AI dice rolls, and lobby AI seeding rely on ad-hoc `Math.random()` calls, so identical inputs already diverge between runs. 【F:backend/src/game/hiddenTreasures.ts†L104-L127】【F:backend/src/services/aiDecisionService.ts†L600-L640】【F:backend/src/services/gameRoomService.ts†L708-L740】
- Game actions can execute either inline or through background workers, adding nondeterministic ordering around queue availability. 【F:backend/src/services/gameActionProcessor.ts†L35-L168】

## Comparison: Current snapshot+delta vs. deterministic lockstep
| Factor | Snapshot + delta (current) | Deterministic lockstep (proposed) |
| --- | --- | --- |
| Bandwidth | Full state snapshots on join/resync plus fog-filtered deltas per action; payload metrics already tracked. 【F:backend/src/services/gameLifecycleService.ts†L744-L768】【F:backend/src/services/deltaEmitter.ts†L62-L148】 | Inputs only (commands + seq). Shrinks payloads and makes late-join resyncs cheap because clients can fast-forward from persisted frames. |
| Replay fidelity | Rebuilds from stored turn snapshots and textual logs; resilient to mid-game state drift but cannot prove bit-identical outcomes. 【F:backend/src/services/gameService.ts†L325-L406】【F:docs/guides/game-replay.md†L3-L15】 | Replays become deterministic re-sims from inputs + seed; CRCs surface divergence instantly and enable automated regression tests. |
| Code complexity | Mature services for snapshots, deltas, fog filtering, queues, and database persistence already exist, but the system tolerates nondeterminism and is hard to reason about when matches drift. 【F:backend/src/services/gameActionProcessor.ts†L35-L168】 | Requires central RNG, strict sequencing, and new frame persistence, but once in place the sim surface is smaller and easier to debug. |
| QA effort | Existing golden replays assert on snapshots/logs; debugging desyncs involves comparing JSON states or DB snapshots. 【F:backend/src/services/gameLifecycleService.ts†L720-L776】 | Adds checksum monitoring and deterministic test rigs; higher initial lift but enables automated chaos/desync detection and headless tournaments. |

## Why adopt now
- **We are still pre-alpha**: no end-to-end finished game exists yet, so we can make a sweeping protocol change without migrating live data or supporting legacy clients.
- **Desyncs block usability**: drift already prevents us from validating core gameplay; continuing to patch the delta system treats symptoms rather than the cause.
- **Cleaner long-term architecture**: a deterministic input stream simplifies AI simulations, future async tournaments, and regression testing, all of which are core to ConquestK's roadmap.
- **Development-only policy**: we can tolerate destructive migrations and protocol resets, which removes the largest risk normally associated with switching transports midstream.

## Recommendation — Adopt deterministic lockstep
Commit to input-driven lockstep as the authoritative transport and storage model:
1. **Authoritative sequencing**: Game rooms assign a monotonically increasing sequence for every validated command frame, persist it, and broadcast it to clients.
2. **Deterministic simulation core**: Extract a pure game simulation that runs exclusively on seeded RNG primitives, with all randomness (combat, treasures, AI) funneled through the shared generator.
3. **Checksum + replay harness**: Compute a stable CRC every N frames, persist ordered frames, and build CLI + automated tests that re-sim inputs to assert parity across Node/browser.
4. **Snapshot fallback for resync**: Provide binary snapshots on demand to allow late-join players to fast-forward, while keeping replay/restoration rooted in committed frames.

## Implementation roadmap
- **Phase 0 — Determinism groundwork**
  - Replace all ad-hoc `Math.random()` calls (setup, treasures, AI) with a centralized seeded RNG service shared between server and client.
  - Audit worker/queue code paths so game actions always execute in submission order, even when offloaded to background processors.
- **Phase 1 — Lockstep transport**
  - Define `SubmitInput`, `InputFrameCommitted`, `TickChecksum`, `AuthoritativeSnapshot`, and `ResyncRequest` Socket.IO events, versioned under the unified `game-action` namespace.
  - Persist frames in `match_frames` with sequence, player, payload, and checksum metadata; deprecate the delta emitter once new clients are active.
  - Emit CRC checksums every K frames and log mismatches server-side to catch drift immediately.
- **Phase 2 — Client integration**
  - Introduce a pure `Sim` module in the frontend that applies committed frames and exposes derived UI state.
  - Implement a lockstep client that queues local commands, waits for authoritative commits, and requests resync on checksum mismatch.
  - Gate the new protocol behind a dev-only feature flag for initial testing, then flip the default once stable.
- **Phase 3 — Replay & tooling**
  - Build a CLI (`npm run replay:match <id>`) that re-sims recorded frames and asserts final checksum/winner.
  - Extend the existing replay UI to scrub by frame sequence.
  - Instrument telemetry for checksum mismatch counts, replay duration, and frame size to track health over time.

## Risk & mitigation
- **Refactor scope**: Migrating random helpers and action sequencing touches core gameplay; mitigate by landing RNG consolidation first with golden tests.
- **Client churn**: The frontend must coordinate with backend changes. Ship both sides together behind feature flags, then remove legacy delta sockets once confidence is high.
- **Snapshot parity**: We still need fallback snapshots for fog-aware viewers. Reuse the existing serializer to avoid rewriting fog logic while the deterministic pipeline matures.

## Test plan
- Unit tests for the RNG helper to ensure browser/node parity and stable sequences.
- Golden replay test: pick a completed match fixture, run the headless replay twice and assert identical checksum/serialized state.
- Integration test that runs a short match locally, captures emitted checksums, and verifies they match the database snapshot checksum for the same turn.

## Phase 0 status (2025-03-18)
- Shared `DeterministicRng` utility added to `@conquestk/shared/utils` with seed hashing, integer helpers, and shuffle support.
- `GameEngine`, AI planners, treasure draws, capital selection, and lobby AI seeding now use the deterministic RNG seeded per match.
- `GameState` persists `rngSeed`/`rngState`; legacy `combatRng*` fields hydrate into the new structure automatically.
- Game action processor defaults to inline execution (`GAME_ACTION_QUEUE=enabled` re-enables workers) to keep command sequencing deterministic.
- Socket `join-room` handler restores membership validation so transport behaviour matches existing tests while we prep lockstep.

## Phase 1 progress (2025-03-18)
- Added `match_frames` and `match_checksums` tables to persist authoritative input frames and periodic CRC snapshots (with optional binary state payloads for resync).
- Socket layer now emits `game-action:frame-committed` and `game-action:checksum` when `LOCKSTEP_DEV=true`, using canonical JSON + CRC32 to detect drift.
- Lockstep recorder seeds per-match sequences, stores commands, and reuses snapped `SerializedGameState` so deterministic replays stay aligned with the RNG log.
- Queueing is automatically disabled in lockstep mode, keeping inline processing deterministic while legacy delta events continue to flow alongside the new frames.
- Frontend validator (behind `VITE_LOCKSTEP_DEV`) replays the confirmed frames through Redux state, computes local CRCs via the shared stable serializer, and triggers auto-resync when checksums diverge.
- Shared `lockstep` simulator currently supports deterministic replays for reinforcement/fortify actions; combat resolution and treasure flows still fall back to snapshot resync (TBD to port full `GameEngine` logic).

## Phase 2 progress (2025-04-04)
- Shared simulator now mirrors backend combat, treasure trades, territory modifiers, `transfer_conquest`, and `end_turn`/`go_back_to_reinforcement` flows, including assassination wins and King-of-the-Hill rotations.
- Lockstep resync instrumentation records the triggering reason (frame gaps, checksum mismatches, unsupported commands) and surfaces it via the client log + banner so reviewers know why a snapshot fired.
- Added backend parity tests (`lockstepSimulator.test.ts`) that feed treasure trades, KOTH end-turn scoring, and assassination victories through both `GameEngine` and the shared simulator, guarding against regressions.

### Remaining Phase 2 work
- Add richer telemetry hooks (metrics + trace IDs) once we start streaming resync reasons to the service dashboard.
- Continue expanding fixture coverage for edge modes (treasure eliminations, card-trade forced reinforcements) as we unlock those flows.

## Rollout plan
1. Land RNG consolidation + deterministic sim harness behind a `LOCKSTEP_DEV` flag and verify via local matches (`npm run dev:backend` + `npm run dev:frontend`).
2. Enable lockstep transport in development, keep delta emitter as a temporary compatibility shim for one sprint while we validate tooling, then remove the shim entirely.
3. Promote the lockstep protocol to staging, run seeded matches end-to-end, and only then clean up snapshot/delta persistence tables that are no longer necessary.
