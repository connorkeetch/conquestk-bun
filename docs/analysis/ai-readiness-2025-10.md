# AI Opponent Readiness – Oct 2025 Audit

## What works today
- **Lobby + lifecycle plumbing is complete.** Hosts can add AI seats (Recruit/Commander/Grandmaster) and those seats flow through lobby state, sockets, and readiness snapshots thanks to the work tracked in the original AI rollout plan.【F:docs/planning/ai-players-plan.md†L26-L38】
- **Decision scaffolding exists.** `GameService.executeAiTurn` wraps `aiDecisionService`, applies the chosen actions, logs telemetry, and falls back safely if the plan is empty or invalid.【F:backend/src/services/gameService.ts†L430-L520】
- **Recruit heuristics are partially implemented.** The decision service deterministically deploys, attempts a single high-odds attack, and fortifies before ending the turn.【F:backend/src/services/aiDecisionService.ts†L91-L160】
- **AI turn runner is live with streaming.** When an AI becomes the active player we queue and execute its turn with per-action pacing, emitting fog-filtered deltas (deploy/fortify/attack/phase) between 250–400 ms where budget allows. Trade-ins emit concise PlayerUpdate + PhaseChange without full snapshots.【F:backend/src/workers/gameActionWorker.ts†L220-L304】【F:backend/src/services/gameLifecycleService.ts†L992-L1060】

## Status (Oct 2025)
- Build the turn runner: DONE (queued orchestration, per-action streaming, fog-filtered deltas).
- Budget + safety controls: PARTIAL (per-tier budgets enforced; pacing clamped by budget; fallback truncation wired; higher-tier odds/EV still to plug into models).
- Commander/Grandmaster models: TODO (stubs; Recruit improved with capital-aware heuristics and one “spice” attack path).
- Variant awareness: PARTIAL
  - Capitals: basic prioritization for Recruit (attack/fortify bias toward capitals).
  - Hidden Treasures: cash-in deltas optimized; strategy tradeoffs not implemented.
  - Fog of War: emissions are fog-filtered; planner still sees full state and needs visibility filtering.
  - Teams: teammate filtering in Recruit; no offensive coordination yet.
- Integration tests: PARTIAL (AI job unit test and worker coverage; end-to-end multi-turn completion test still to add).
- Observability: PARTIAL (aiTurnMetrics emitted; kill switches and dashboards to configure).

## Why AI currently stalls
- **No turn orchestrator ever calls `executeAiTurn`.** When an AI becomes the active player the queues only schedule AFK timers; nothing triggers the AI planner, so the game waits indefinitely.【F:backend/src/workers/gameActionWorker.ts†L471-L507】【F:backend/src/services/gameService.ts†L430-L520】
- **Commander and Grandmaster tiers are stubs.** Difficulties other than Recruit return an empty plan, which forces the fallback “double end_turn” script once orchestration exists.【F:backend/src/services/aiDecisionService.ts†L91-L159】
- **Mode-agnostic heuristics.** The current Recruit logic ignores Capitals, King of the Hill, Hidden Treasures, territory modifiers, fog, and custom timers, so even once the turn runner exists the AI will make nonsensical moves in those variants.【F:docs/guides/game-options.md†L60-L81】

## Work remaining before AI matches are reliable
1. **Build the turn runner.** DONE — AI turns are detected and scheduled on start and after `end_turn`, time-boxed by tier, with per-action streaming and fog-filtered deltas.【F:backend/src/workers/gameActionWorker.ts†L220-L304】【F:backend/src/services/gameLifecycleService.ts†L992-L1060】
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

## Confirmed decisions (Oct 2025)

These decisions set production caps and UX behaviour; the tighter average targets in the AI Players Plan remain our performance goals (max vs. target distinction).

**Action Pacing**
- Real‑time per‑turn wall‑clock maxima by tier: Recruit ≤ 5 s; Commander ≤ 10 s; Grandmaster ≤ 15 s.
- Target averages (unchanged; for performance telemetry): Recruit ≤ 1 s; Commander ≤ 2.5 s; Grandmaster ≤ 3 s.
- Readability delays: 250–400 ms between visible actions (deploy/attack/fortify/end), clamped so total time never exceeds the tier max. In async games, condense delays to ≤ 150 ms.
- Over‑budget handling: if the budget expires mid‑plan, truncate to a safe state (see Failure Handling) rather than running long.

**Difficulty Differentiation**
- Recruit — Playable, fast, forgiving
  - Deterministic reinforcement (hold continents, shore up weak borders).
  - Attack: one front at a time; favour ≥ 70% win odds; if none exist, allow at most one “spice” attack at 55–65% to keep play dynamic.
  - Fortify: single simple move toward strongest border/capital; no multi‑hop pathing.
  - Caps: max 3 attack sequences per turn.
- Commander — Threat‑aware, balanced
  - Greedy scoring + shallow search (1–2 ply) over a few best fronts.
  - Continent pressure and card timing (avoid forced cash‑ins; snipe eliminations).
  - Avoid low‑odds attacks; generally require ≥ 65–70% unless endgame payoff is clear.
  - Fortify to hold continents and capitals; permit multi‑hop where rules allow.
  - Caps: max 6 attack sequences per turn (still within budget).
- Grandmaster — Competitive for experts
  - Monte Carlo over candidate plans (time‑boxed); light opponent modelling and adaptive aggression.
  - EV‑driven attack thresholds; take calculated risks for capitals/eliminations.
  - Smarter fortify/reposition to set up multi‑turn pressure.
  - Caps: no hard cap; implicitly limited by time budget and EV guardrails.

**Variant Priorities**
- Support all variants; optimize in this order for heuristics and tests: Classic → Capitals → Hidden Treasures → Fog of War → Teams → Territory Modifiers. Time Bank is orthogonal (scheduling) and needs no strategy changes.
- Acceptance for each step:
  - Classic: completes games with ≥ 95% reliability; no illegal moves; meets pacing targets.
  - Capitals: defends own capital, opportunistically captures enemy capitals, fortifies toward capitals.
  - Hidden Treasures: considers treasure value and set timing in reinforcement/attack decisions.
  - Fog of War: planner uses only visible information; no leakage from hidden state.
  - Teams: never attacks allies; basic fortify coordination (no offensive coordination required for first pass).

**Failure Handling**
- When no safe attack exists:
  - Recruit: may take exactly one moderate‑risk attack (55–65% odds) to keep flow; otherwise fortify then end turn.
  - Commander: skip risky attacks; prefer reposition/fortify; only attack when ≥ 65–70% or EV is clearly positive (e.g., elimination, capital capture).
  - Grandmaster: respect EV thresholds from simulations; take low odds only for decisive objectives (capital, elimination, blocking set cash‑in), else fortify/end.
- If time budget is exceeded mid‑turn:
  - Recruit: immediately perform simple fortify (if available) then `end_turn`.
  - Commander: execute the current best single action if EV ≥ threshold; else fall back to fortify + `end_turn`.
  - Grandmaster: drop to a greedy fast path; if none available within 300 ms, fortify + `end_turn`.
- Additional guards: per‑turn action caps (above), max 1 cash‑in decision per turn segment, and clamp dice rerolls to avoid thrash.

Implementation notes:
- Expose `DecisionBudget` fields to the strategy: `budgetMs`, `readableDelayMs`, `maxAttackChains`, `minAttackOddsByTier`, and `allowOneSpiceAttack` (Recruit only).
- Log per‑tier metrics: planning time, actions tried/applied, odds distribution, and fallback reason (no‑safe‑attack, timeout, EV‑negative).

What to verify locally:
- Create Classic games with AI seats for each tier and confirm turns finish within caps and feel readable (small delays present, but not sluggish).
- Spot‑check Capitals and Hidden Treasures with Recruit enabled: no illegal moves, basic capital defence, sensible treasure cash‑ins.
- Enable Fog Adjacent and ensure no decisions rely on hidden info (watch logs for EV inputs).
