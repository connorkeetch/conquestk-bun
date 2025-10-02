# AI Opponents Discovery Notes

_Updated: 2025-03-12_

## Turn pipeline entry points

1. **HTTP & socket layer** – player actions enter the backend through `GameController` and the lifecycle services. HTTP routes under `backend/src/routes/game.ts` authenticate requests and delegate to `GameController`, which orchestrates room management and turn control via `GameRoomService`, `GameLifecycleService`, and `GameService`.
2. **Action validation** – `GameService.processGameAction` loads the cached state, enforces that the acting user matches `currentPlayer`, and passes validated actions to `GameEngine.processAction`. All phases (reinforcement → attack → fortify → next turn) are advanced inside `GameEngine` so AI decisions must still flow through these methods.
3. **State persistence + fan-out** – `GameService` serializes the updated `GameState` back through `gameStateCache` while `GameLifecycleService` and `socketService` broadcast lifecycle deltas. Any AI module should therefore submit actions through the same service to ensure caches, triggers, and sockets stay consistent.

This path keeps AI decisions aligned with human input—inject the AI after `GameService.initializeGame` assigns turns but before `processGameAction` persists the result, likely via a new `executeAiTurn` helper (added in this change) that wraps `processAction` with validation.

## Telemetry and safeguards

Initial instrumentation should live close to `GameService.executeAiTurn` so every AI turn reports:

- **Think time** (milliseconds spent inside the decision service)
- **Fallback reason** (timeout, invalid plan, cancellation)
- **Action count** (number of validated game actions applied)
- **Phase transitions** (which phases the AI skipped versus played out)

Emit counters/latency histograms via the existing `metricsService` once the budget stabilizes. For early scaffolding, structured logs are enough; promote to metrics before Recruit rollout.

## Decision interface contract

The stubbed `aiDecisionService` introduces a canonical request/response shape:

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
