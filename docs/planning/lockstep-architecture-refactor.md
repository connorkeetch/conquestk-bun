# Lockstep Architecture Refactor Plan

Status: Planning Phase
Priority: High (Post-Stability)
Created: 2025-10-21
Owner: Architecture Review

Executive Summary
- ConquestK currently runs a hybrid lockstep + snapshot architecture where both systems broadcast state, causing race conditions and wasting bandwidth.
- Goal: converge on pure lockstep for real-time updates and use snapshots only for initialization, resync, and fog-of-war baseline reveals.
- Benefits: eliminates phase desyncs, cuts bandwidth significantly, and simplifies the codebase while preserving fog-of-war behavior.

Table of Contents
- Current Architecture (Hybrid)
- Problems With Current Approach
- Ideal Architecture (Pure Lockstep)
- Migration Strategy (Phases)
- Implementation Details (Config, conditional emission, metrics)
- Testing Plan (unit, integration, load)
- Rollback Plan
- Success Metrics
- Appendix: Snapshot Emission Locations

Current Architecture (Hybrid)

How it works now
Server (after action):
- Processes action and updates state
- Emits lockstep frame (authoritative)
- Also emits game:snapshot (redundant)

Client receives both:
- Frame first → updates UI correctly (e.g., to fortify)
- Snapshot later → overwrites with stale phase (e.g., back to attack)
- Result: visible desync or blocked actions

Key components
- Server
  - backend/src/workers/gameActionWorker.ts – emits snapshots in several fallbacks and after actions
  - backend/src/services/socketService.ts – helper emitters; initial join baseline; resync payload; turn/lifecycle snapshots
  - backend/src/services/fogService.ts – viewer-specific fog-filtered snapshots
  - backend/src/services/gameLifecycleService.ts – lifecycle-driven snapshots
  - backend/src/services/lockstepService.ts – frame storage and emission
- Client
  - frontend/src/services/socketService.ts – consumes both game:snapshot and game-action:frame-committed
  - frontend lockstep simulator – applies frames to local state

Problems With Current Approach
1) Race conditions
- Symptom: phase desyncs (e.g., UI shows attack while server expects fortify)
- Cause: late snapshot overwrites authoritative frame-applied state

2) Bandwidth waste
- Every action sends both a frame (~hundreds of bytes) and a full snapshot (often tens of KB)
- Redundant traffic increases costs and latency variability

3) Complexity and maintenance burden
- Two parallel state-sync systems to keep in parity
- Harder to reason about the source of truth and to debug issues

Ideal Architecture (Pure Lockstep)
- Lockstep frames are authoritative for real-time progression.
- Snapshots are used only for:
  - Initial join baseline (fog-filtered per viewer)
  - Explicit resync requests (client-initiated) with catch-up frames
  - Fog-of-war reveal baselines (when visibility meaningfully changes)
- No routine snapshot emission after each action.

Snapshot usage matrix
- Join game: Snapshot ✅ (baseline), then frames ✅
- Action processed: Snapshot ❌, frames ✅
- Client resync: Snapshot ✅ (baseline+catch-up), frames ✅
- Fog reveal: Snapshot ✅ (baseline), frames ✅
- Turn change: Snapshot ❌, frames ✅
- Game end: Snapshot ❌, frames ✅

Migration Strategy

Phase 0 – Current state (done)
- Client now ignores game:snapshot when lockstep baseline is ready to avoid overwrites (band-aid).

Phase 1 – Add lockstep-only mode (low risk)
- Add env flag LOCKSTEP_ONLY to gate snapshot emission.
- Config lives in backend/src/config/lockstep.ts.
- Default false to preserve current behavior; enable in staging to compare metrics.

Phase 2 – Conditional snapshot emission (medium risk)
- Wrap snapshot emissions with reason-aware helper; skip action-triggered snapshots when LOCKSTEP_ONLY is true.
- Keep snapshots strictly for: init (join), resync, fog-reveal.
- Update all call sites to pass a reason.

Phase 3 – Cleanup and simplification (low risk)
- Remove now-dead code paths that emitted routine snapshots.
- Add warnings if a snapshot is emitted without an allowed reason.
- Update client docs to make snapshot semantics explicit (init/resync only).

Implementation Details

Phase 1 – Configuration setup
- File: backend/src/config/lockstep.ts
  - Expose LOCKSTEP_ONLY, MAX_FRAMES, ENABLE_CHECKSUMS.
  - Provide simple in-memory metrics for skipped snapshots and emitted frames.

Environment template updates
- File: backend/.env.example
  - Add:
    - LOCKSTEP_ONLY=false
    - LOCKSTEP_MAX_FRAMES=2000
    - LOCKSTEP_CHECKSUMS=true

Phase 2 – Conditional emission (high-level)
- backend/src/workers/gameActionWorker.ts
  - Change private emitGameSnapshot(channel, payload) → emitGameSnapshot(channel, payload, reason: 'action'|'init'|'resync'|'fog' = 'action').
  - If LOCKSTEP_ONLY and reason==='action', increment metrics and skip.
  - Update call sites to pass a reason:
    - Most post-action emissions → 'action' (skipped in lockstep-only)
    - Join baseline → 'init' (always)
    - Fog reveals → 'fog' (always)
    - Resync is handled via game-action:snapshot payload (see socketService) and not via game:snapshot.

- backend/src/services/socketService.ts
  - Wrap emitGameSnapshotToRoom/emitGameSnapshotToSocket with the same reason guard.
  - Join handler: emitGameSnapshotToSocket(..., 'init').
  - Resync request handler (game-action:resync-request): reply with game-action:snapshot (baseline + frames) for recovery; no change needed besides documenting the contract.

- backend/src/services/gameLifecycleService.ts
  - Wrap lifecycle-driven snapshots; pass 'action' or 'fog' as appropriate.

Phase 3 – Metrics endpoint (optional)
- backend/src/routes/admin.ts – add /api/admin/lockstep-metrics to expose config + metrics for quick checks in staging.

Testing Plan

Unit tests
- Config defaults and env parsing for LOCKSTEP_ONLY.
- Emission helpers skip action snapshots when LOCKSTEP_ONLY is true and still emit for init/fog.

Integration tests (staging)
- Join game (LOCKSTEP_ONLY=true):
  - Expect initial game:snapshot (fog-filtered) and subsequent game-action:frame-committed events only.
- Action processing: ensure no game:snapshot after actions; state advances via frames.
- Resync flow: client emits game-action:resync-request; server responds with game-action:snapshot containing baseline + frames; client converges.
- Fog-of-war reveal: expect a fog-filtered game:snapshot baseline at reveal moments.

Load testing/metrics
- Compare bandwidth with LOCKSTEP_ONLY=false vs true:
  - Avg message size
  - Messages per action
  - Total bandwidth per 100 actions
- Track desync indicators (client resync rate; unsupported command errors) – target <1% resyncs under lockstep-only.

Rollback Plan

Immediate rollback
- If issues surface (e.g., frequent resyncs or missing baselines), set LOCKSTEP_ONLY=false in environment and redeploy.

Selective rollback (if needed)
- Apply a conditional to keep snapshots enabled in specific modes (e.g., certain fog variants) while iterating.

Success Metrics
- Stability: desync rate < 1%; zero phase desync bug reports.
- Performance: >40% bandwidth reduction; average message size < 1 KB for actions.
- Code quality: meaningful deletion of redundant snapshot code; one clear source of truth for real-time state.

Appendix: Snapshot Emission Locations (as of Oct 21, 2025)
- backend/src/workers/gameActionWorker.ts – multiple emits after actions and in fallbacks
- backend/src/controllers/gameController.ts – emits in HTTP response for certain operations
- backend/src/services/socketService.ts – emit helpers; join baseline; lifecycle emissions; resync payload (game-action:snapshot)
- backend/src/services/gameLifecycleService.ts – lifecycle-driven emissions
- backend/src/services/fogService.ts – fog-filtered emissions (viewer-specific)

Action required by location (Phase 2)
- Workers/lifecycle: mark routine post-action snapshots as reason='action' (skipped when LOCKSTEP_ONLY=true).
- Join baseline: reason='init' (always allowed).
- Fog reveals: reason='fog' (always allowed).
- Resync: continue using game-action:resync-request → game-action:snapshot (baseline + frames) path.
- REST: keep existing HTTP behavior for non-socket clients (if still used).

Notes
- During development, keep the client-side guard that ignores snapshots once a lockstep baseline is ready; it prevents regressions until the server-side cleanup fully lands.
- This plan aligns with the project’s development-only policy: favor clean transitions over long shims; destructive changes are acceptable.

Changelog & Links
- Related worker/service files: backend/src/workers/gameActionWorker.ts, backend/src/services/socketService.ts, backend/src/services/gameLifecycleService.ts, backend/src/services/fogService.ts, backend/src/services/lockstepService.ts
- Protocol reference: backend/src/types/shared.ts (for game-action:frame-committed, game-action:snapshot, game:snapshot)

