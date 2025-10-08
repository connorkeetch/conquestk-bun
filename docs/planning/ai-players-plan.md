# AI-Controlled Players (Opponents) Implementation Plan
_Last updated: September 24, 2025_

## Why this matters
- Keep lobbies alive with solo and co‑op when friends are offline.
- Stress‑test the rules engine across the full action surface.
- Unlock future PvE events that depend on deterministic AI.

## Goals and success metrics
| Goal | Metric |
| --- | --- |
| MVP AI completes games without manual intervention | ≥ 95% of closed‑beta AI games finish cleanly |
| Turn cadence parity with humans (real‑time) | Average AI think time < 3 s |
| Three difficulty tiers | Recruit, Commander, Grandmaster selectable in lobby; all show usage in telemetry |
| Preserve fairness and ratings integrity | Ranked queues human‑only; casual logs AI W/L separately |
| Operational stability | No increase in engine or socket error rate beyond +5% baseline; per‑tier kill switches available |

## Scope
- AI seats in synchronous and asynchronous games.
- Three difficulty tiers with increasing sophistication.
- Backend-driven decision service; optional native worker for heavy search if profiling proves need.
- Frontend UX for AI configuration, in-game indicators, replays, and post-game stats.

**Out of scope for launch**: campaigns, hybrid human+AI co-piloting, machine-learned policies.

## Current status
- Lobby creation accepts AI opponent payloads behind feature flags and returns enriched player metadata to clients.
- Game room UI displays AI badges, hides DM tabs for non-human seats, and team assignment supports AI slots.
- Socket `player-joined` / `player-left` events now include AI identifiers, difficulty, and readiness while `ensureAiReadyStates` keeps AI opponents auto-ready after lobby roster changes.
- Hosts can adjust AI rosters from the lobby (add/remove or change difficulty) via the new `/ai-opponents` endpoint, keeping sockets in sync.
- Added regression coverage for socket payloads, AI readiness hydration, and Redux room state to lock in the lobby behaviour.

## User‑facing experience
1. **Creation**: hosts can add AI per seat and set difficulty; async and real‑time supported.
2. **In‑game**: visible “AI is taking turn…” state; configurable short delays between AI actions for readability.
3. **Post‑game**: AI appears in match history and PvE stats; excluded from ELO.
4. **Availability**: casual and invite‑only first; expand after telemetry review.

## Architecture
1. **Turn orchestration**: when current player is AI, build a read‑only `GameState` snapshot and call **aiDecisionService**. Stream returned `GameAction`s through the same validation and socket pipeline as humans.
2. **Decision interface**: `chooseAction(gameState, budget): ActionPlan` with wall‑clock timeout and cancellation. Plans may stream actions deploy → attack → fortify → end turn. The `budget` contract exposes pacing and guardrails:
   
   ```ts
   type DecisionBudget = {
     maxThinkTimeMs: number
     maxPlannedActions?: number
     readableDelayMs?: number // UI pacing between actions (clamped by caps)
     maxAttackChains?: number // soft limiter for attack sequences
     minAttackOddsByTier?: {
       recruit?: number
       commander?: number
       grandmaster?: number
     }
     allowOneSpiceAttack?: boolean // Recruit only
     signal?: AbortSignal
   }
   ```
3. **Runtime strategy**: TypeScript heuristics for Recruit/Commander. Evaluate Rust/Go worker for Grandmaster only if Node cannot meet budgets. Use gRPC or JSON over queue with strict SLAs.
4. **Safety**: per‑turn action caps, timeouts with safe fallback (fortify + end turn), fog‑of‑war filtered inputs, stable JSON schema with versioning, centralized RNG seeds.

## Difficulty model
| Tier | Profile | Techniques |
| --- | --- | --- |
| Recruit | Playable, fast, forgiving | Deterministic reinforcement, high‑odds single‑front attacks, simple fortify |
| Commander | Threat‑aware, balanced | Greedy scoring + shallow search, continent pressure, card timing |
| Grandmaster | Competitive for experts | Monte Carlo over candidate plans, opponent modelling, adaptive aggression |

**Performance budgets**  
Targets (average think time): Recruit ≤ 1 s, Commander ≤ 2.5 s, Grandmaster ≤ 3 s.  
Caps (max per‑turn wall‑clock): Recruit ≤ 5 s, Commander ≤ 10 s, Grandmaster ≤ 15 s.  
Readability delays: 250–400 ms between visible actions (deploy/attack/fortify/end) in real‑time, clamped so total never exceeds caps; ≤ 150 ms in async games.  
Async: may exceed target averages with queue persistence but still bounded by caps.

## Data and state
- Schema fields: `isAi`, `aiDifficulty`, `aiPersonalitySeed`.
- PvE aggregation tables to avoid contaminating ELO.
- Redis TTL for transient planning artifacts; never mutate live state outside validated actions.
- Fog‑of‑war respected; inputs filtered to visible info. Persist RNG seeds in `game_config`.

## Observability and safeguards
- Metrics: decision latency, depth, action breakdown, timeout fallbacks, win expectancy deltas by difficulty.
- Per‑tier feature flags with instant disable. Neutral placeholder behavior on degradation.
- Replay capture for AI turns with seed, difficulty, and build version. Admin runbook for “force end AI turn.”

## Implementation phases
- **Phase 0 – Discovery**: audit engine and sockets; define telemetry; spec decision interface.
- **Phase 1 – Foundations**: schema migrations, lobby and API surface, aiDecisionService stub, flags, tests for AI‑triggered turn progression.
- **Phase 2 – Recruit MVP**: deterministic heuristics (baseline reinforcement/attack/fortify pipeline now in TypeScript service); async persistence of queued actions; authoritative battle worker; staged rollout.
- **Phase 3 – Commander**: threat scoring, 2‑ply pruning, card timing, improved fortify; profiling and budgets.
- **Phase 4 – Grandmaster**: simulations + opponent modelling; optional Rust/Go worker via queue; personality weights.
- **Phase 5 – Polish & rollout**: avatars/badges, spectator‑friendly logs, rate‑limiters, dashboards; enable tiers sequentially.

## Testing
- Unit tests per strategy with fixed seeds.
- Integration tests for full turns and mixed AI/human matches.
- Load tests for AI‑heavy rooms and queue throughput.
- Structured user playtests for perceived fairness.

## Rollout and risk
- Gradual enablement Recruit → Commander → Grandmaster, each behind a flag.
- Kill switches and fallbacks for service degradation.
- Known risks: runaway simulations, unfair difficulty spikes, fog leakage. Mitigations: wall‑clock timeouts, tunable weights with feature flags, automated visibility tests.

## Open questions
- Mid‑game seat transfers and AFK replacements policy text.
- Admin exposure of seed and AI build version.
- Async turn SLA targets and notification rules.

## Dependencies
- Battle worker reactivation, Bull queue reliability, Redis monitoring, AI strings and localization.

## Next steps
1. Expose AI opponent controls in the Create Game and lobby management UI (difficulty picker, slot counts) gated by the existing feature flags.
2. Profile decision complexity on max-player maps to validate Recruit/Commander TypeScript strategies meet turn budgets.
3. Finalize message contracts for `aiDecisionService` and any cross-language bridge ahead of Commander tier work.
