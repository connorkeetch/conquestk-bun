# Deterministic Lockstep & Replay Evaluation

## TL;DR
- ConquestK already keeps the server authoritative, persists full turn snapshots, and drives replays from database state, so we would be replacing a working snapshot+delta pipeline rather than filling a gap.
- Deterministic lockstep would cut bandwidth for long matches and make desyncs easier to detect, but enforcing determinism across combat resolution, treasure draws, AI, matchmaking helpers, and worker queues is a sizable refactor.
- Recommend **Hybridize**: keep the current snapshot/delta transport, but adopt the determinism guardrails (seeded RNG service, checksums, replay harness) incrementally so we gain replay guarantees without rewriting the transport stack yet.

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
| Bandwidth | Full state snapshots on join/resync plus fog-filtered deltas per action; payload metrics already tracked. 【F:backend/src/services/gameLifecycleService.ts†L744-L768】【F:backend/src/services/deltaEmitter.ts†L62-L148】 | Inputs only (commands + seq). Would drop per-action delta size but requires serialization of every command and strict ordering. |
| Replay fidelity | Rebuilds from stored turn snapshots and textual logs; resilient to mid-game state drift but cannot prove bit-identical outcomes. 【F:backend/src/services/gameService.ts†L325-L406】【F:docs/guides/game-replay.md†L3-L15】 | Replays become deterministic re-sims from inputs and a seed; CRCs surface divergence instantly but only if every subsystem is deterministic. |
| Code complexity | Mature services for snapshots, deltas, fog filtering, queues, and database persistence already exist; determinism inconsistencies are tolerated. 【F:backend/src/services/gameActionProcessor.ts†L35-L168】 | Requires refactoring every random helper to a central RNG, enforcing serialization order, snapshotting for resync, and likely reworking worker queues to keep strict sequencing. |
| QA effort | Existing golden replays assert on snapshots/logs; debugging desyncs involves comparing JSON states or DB snapshots. 【F:backend/src/services/gameLifecycleService.ts†L720-L776】 | Adds checksum monitoring, replay harnesses, and deterministic test rigs; up-front investment but stronger guarantees once complete. |

## Recommendation — Hybridize
Keep the current socket contract but introduce deterministic guardrails incrementally:
1. Centralize randomness (mulberry32/xoroshiro) and replace scattered `Math.random()` usage so identical seeds reproduce state evolution.
2. Layer per-N-turn checksums on top of the existing snapshot pipeline to detect drift without forcing immediate transport changes.
3. Build a headless replay CLI that replays logged actions against the deterministic sim and compares the resulting checksum to the stored snapshot.

This path limits risk (no client protocol rewrite yet) while paving the way to full lockstep later if the bandwidth/testing wins prove worthwhile.

## Phase B prototype scope
- **Backend:**
  - Introduce `shared/rng` utilities and refactor combat setup, treasure draws, AI dice rolls, and lobby seeding to pull from a seeded generator initialized per match.
  - Extend `GameService` with `computeChecksum(state): number` using a stable serializer that reuses the existing snapshot format, emit checksums alongside the turn snapshots.
  - Add a `/tools/replay/:id/check` CLI (or script under `scripts/`) that replays a finished match using stored actions and compares final checksum/state.
- **Shared types:**
  - Add checksum fields to the existing socket payloads without changing their core structure so clients can ignore them until ready.

## Test plan
- Unit tests for the RNG helper to ensure browser/node parity and stable sequences.
- Golden replay test: pick a completed match fixture, run the headless replay twice and assert identical checksum/serialized state.
- Integration test that runs a short match locally, captures emitted checksums, and verifies they match the database snapshot checksum for the same turn.

## Rollout plan
1. Ship deterministic RNG + checksum emission behind a dev-only flag; verify via local matches and replay CLI.
2. Enable checksum comparison logs in staging to measure drift frequency without blocking matches.
3. Once stable, surface checksum mismatches in the client UI and consider migrating transport to true lockstep if the maintenance cost stays low.
