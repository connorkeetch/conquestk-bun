# AI Opponent Readiness – February 2025 Audit

## What works today
- **Lobby + lifecycle plumbing is complete.** Hosts can add AI seats (Recruit/Commander/Grandmaster) and those seats flow through lobby state, sockets, and readiness snapshots thanks to the work tracked in the original AI rollout plan.【F:docs/planning/ai-players-plan.md†L26-L38】
- **Decision scaffolding exists.** `GameService.executeAiTurn` wraps `aiDecisionService`, applies the chosen actions, logs telemetry, and falls back safely if the plan is empty or invalid.【F:backend/src/services/gameService.ts†L430-L520】
- **Recruit heuristics are partially implemented.** The decision service deterministically deploys, attempts a single high-odds attack, and fortifies before ending the turn.【F:backend/src/services/aiDecisionService.ts†L91-L160】

## Why AI currently stalls
- **No turn orchestrator ever calls `executeAiTurn`.** When an AI becomes the active player the queues only schedule AFK timers; nothing triggers the AI planner, so the game waits indefinitely.【F:backend/src/workers/gameActionWorker.ts†L471-L507】【F:backend/src/services/gameService.ts†L430-L520】
- **Commander and Grandmaster tiers are stubs.** Difficulties other than Recruit return an empty plan, which forces the fallback “double end_turn” script once orchestration exists.【F:backend/src/services/aiDecisionService.ts†L91-L159】
- **Mode-agnostic heuristics.** The current Recruit logic ignores Capitals, King of the Hill, Hidden Treasures, territory modifiers, fog, and custom timers, so even once the turn runner exists the AI will make nonsensical moves in those variants.【F:docs/guides/game-options.md†L60-L81】

## Work remaining before AI matches are reliable
1. **Build the turn runner.** Detect AI turns (both on game start and after each `end_turn`) and queue `executeAiTurn` with a small human-visible delay. Wire this through Bull so we can throttle, cancel, or retry without blocking the socket thread.【F:backend/src/workers/gameActionWorker.ts†L471-L507】【F:backend/src/services/gameService.ts†L430-L520】
2. **Budget + safety controls.** Confirm per-difficulty think-time ceilings, maximum chained actions, and what to do when the wall-clock budget is exceeded (skip remainder of the turn vs. perform a minimal action) so we can populate the `DecisionBudget` contract.【F:backend/src/services/aiDecisionService.ts†L5-L83】【F:docs/planning/ai-players-plan.md†L45-L55】
3. **Commander / Grandmaster decision models.** Flesh out heuristics for the higher tiers (threat scoring, card timing, multi-attack plans, etc.) per the roadmap so they produce meaningful turns instead of falling back immediately.【F:docs/planning/ai-players-plan.md†L45-L55】
4. **Variant awareness.** Extend the planner to respect:
   - **Capitals:** defend owned capitals, prioritize capturing opponents’ capitals, and fortify toward them.【F:docs/planning/ai-players-plan.md†L39-L44】
   - **Hidden Treasures:** decide when to divert armies to claim treasures or cash cards early.【F:docs/guides/game-options.md†L79-L81】
   - **Team play:** avoid attacking allies and coordinate fortifies across teammates (basic support exists in Recruit via teammate filtering, but no offensive coordination yet).【F:backend/src/services/aiDecisionService.ts†L195-L219】
   - **Fog of war:** ensure decisions rely only on visible information once fog filtering is turned on.【F:docs/planning/ai-players-plan.md†L56-L66】
5. **Integration tests.** Add Jest flows that start a room with mixed human/AI players, advance through multiple turns, and verify the game reaches completion without manual input.【F:docs/planning/ai-players-plan.md†L67-L78】
6. **Observability hooks.** Dashboards/alerts exist on the metrics service; once AI runs live we should configure thresholds (timeouts, fallback counts) and decide on feature-flag kill switches per difficulty.【F:docs/planning/ai-players-plan.md†L62-L83】

## Decisions needed from you
To implement the above confidently we need clarity on:
- **Action pacing:** How long of a readable delay (if any) should the AI leave between actions so human players can follow along?
- **Difficulty differentiation:** What concrete behaviours should Commander and Grandmaster add on top of Recruit (multi-front attacks, continent prioritization, smarter fortifies, card timing, etc.)?
- **Variant priorities:** Which combinations of maps + options must be supported for closed beta (e.g., Capitals + Treasures, Fog of War, Time Bank)? Any variants we can explicitly defer?
- **Failure handling:** When Recruit has no safe attack, should it skip straight to fortify/end turn (current behaviour) or perform riskier moves to keep games dynamic?
- **Testing expectations:** What automated coverage (unit vs. integration vs. load) do you want before enabling AI seats broadly?

Answering those will let us finish the turn runner, flesh out the decision models, and validate AI across every map/mode combo without surprises.
