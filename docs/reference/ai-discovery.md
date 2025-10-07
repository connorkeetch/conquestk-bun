# AI Opponents Discovery Notes

_Last updated: March 7, 2026_

## Turn pipeline entry points

1. **HTTP & socket layer** – player actions enter the backend through the game routes in `backend/src/routes/game.ts` and the socket handlers in `backend/src/services/socketService.ts`. The HTTP route delegates to `backend/src/controllers/gameController.ts`, which orchestrates room management and turn control via `GameRoomService`, `GameLifecycleService`, and `GameService`.
2. **Action validation** – `GameService.processGameAction` (and its typed helpers) load the cached state, enforce that the acting user matches `currentPlayer`, and pass validated actions to `GameEngine.processAction`. All phases (reinforcement → attack → fortify → next turn) advance inside `GameEngine`, so AI decisions must still flow through these methods.
3. **State persistence + fan-out** – `GameService` serializes the updated `GameState` back through `gameStateCache` while `GameLifecycleService`, `DeltaEmitter`, and `socketService` broadcast lifecycle deltas. Any AI module should therefore submit actions through the same service to ensure caches, triggers, and sockets stay consistent.

This path keeps AI decisions aligned with human input—inject the AI after `GameService.initializeGame` assigns turns but before `processGameAction` persists the result. The existing `executeAiTurn` helper wraps `processAction` with validation and fallback handling.

## Telemetry and safeguards

Instrumentation lives close to `GameService.executeAiTurn` so every AI turn reports:

- **Think time** (milliseconds spent inside the decision service)
- **Fallback reason** (timeout, invalid plan, cancellation)
- **Action count** (number of validated game actions applied)
- **Phase transitions** (which phases the AI skipped versus played out)

Emit counters/latency histograms via the existing `metricsService` once the budget stabilizes. For early scaffolding, structured logs are enough; promote to metrics before Recruit rollout.

## Decision interface contract

The `aiDecisionService` introduces a canonical request/response shape:

```ts
chooseAction({
  gameState,
  player,
  difficulty,
  budget: {
    maxThinkTimeMs,
    maxPlannedActions,
    signal,
  },
}): Promise<AIDecisionPlan>
```

- `gameState` is a read-only snapshot (hydrated from cache and cloned before use).
- `player` carries `isAi`, `aiDifficulty`, and `aiPersonalitySeed` for personality-specific heuristics.
- `budget` enforces wall-clock limits and supports cancellation via `AbortSignal`.
- `AIDecisionPlan` must always return at least one safe action; the default stub produces a deterministic fallback sequence of phase-clearing `end_turn` actions that hands off to the next player without mutating game state directly.

`GameService.executeAiTurn` consumes this plan, re-validates every action with `GameEngine.validateAction`, and persists the resulting state. If the plan is empty, invalid, or the signal aborts, it swaps in the same safe fallback and records the failure reason for telemetry.
