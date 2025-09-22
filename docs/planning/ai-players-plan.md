# 🤖 AI Player Implementation Plan

_Last updated: February 22, 2026_

## Why this initiative matters
- Deliver solo-play and co-op experiences so the lobby stays active even when friends are offline.
- Stress-test the rules engine by exercising the full action surface automatically.
- Unlock future PvE events (campaigns, challenges) that depend on deterministic AI behaviour.

## Goals & success metrics
| Goal | Success metric |
| --- | --- |
| Ship an MVP AI opponent that completes games without runtime errors | 95%+ of closed beta games with AI finish without manual intervention |
| Offer three difficulty settings (Recruit, Commander, Grandmaster) | Difficulty toggle visible in lobby, telemetry shows usage of each tier |
| Maintain turn cadence parity with human players | AI turns average < 3 seconds processing time |
| Preserve fairness and ratings integrity | Ranked queues stay human-only; casual matches track separate AI win/loss stats |

## Scope
- AI-controlled players in synchronous and asynchronous games.
- Difficulty tiers that expose increasingly sophisticated decision-making.
- Backend-driven decision service with optional Rust/Go plug-in for heavy computation.
- Frontend UX updates for AI configuration, indicators in game UI, and replay logs.

### Out of scope (for now)
- Campaign narratives or scripted scenarios.
- Hybrid human+AI teams with shared decision making.
- Machine-learning-based strategies (initial rollout is heuristic-driven with simulation support).

## Architecture overview
1. **Decision layer integration**
   - Extend the existing `GameEngine` orchestration in `backend/src/game/gameEngine.ts` so AI turns enqueue "decision requests" rather than requiring synchronous user actions.
   - Introduce an `aiDecisionService` responsible for evaluating the game state, selecting an action, and returning it to the socket/game loop.
   - Persist AI personality + difficulty metadata in the game configuration payload so every server node can reconstruct behaviour.
2. **Execution flow**
   - When an AI player's turn starts, the server builds a read-only snapshot of the `GameState` and passes it to the decision layer.
   - The decision layer returns a sequence of valid `GameAction`s (deploy, attack, fortify, end turn). The existing validation still runs to guarantee legality.
   - Actions stream through the same socket events that human turns use, preserving delta broadcasting and replay logging.
3. **Language/runtime strategy**
   - **Phase 1–2:** Implement heuristics in TypeScript to minimise integration friction and reuse domain models.
   - **Phase 3+:** Evaluate a dedicated worker written in Rust or Go for advanced search (Monte Carlo Tree Search, minimax) if profiling shows TypeScript cannot hit sub-3-second turn budgets. Communication would happen via a lightweight gRPC or message queue bridge, reusing the Bull worker infrastructure already staged in the repo.

## Difficulty model
| Difficulty | Behaviour profile | Techniques |
| --- | --- | --- |
| **Recruit** | "Playable" AI that follows basic Risk heuristics without deep lookahead. | Deterministic reinforcement calculation, single-front attacks when odds > 60%, simple fortify to closest border. |
| **Commander** | Threat-aware AI prioritising continent bonuses and army efficiency. | Greedy scoring + limited breadth-first search for attacks, reinforcement balancing, opportunistic card cash-ins. |
| **Grandmaster** | Competitive AI tuned for experienced players. | Monte Carlo simulations over candidate plans, opponent modelling (threat scores), bluff-like troop positioning, adaptive aggression based on map control. |

## Workstream breakdown

### Phase 0 – Discovery & foundation (1 sprint)
- Audit current `GameEngine` actions, validation, and socket handlers (`backend/src/socket/gameHandlers.ts`) to map all required AI decisions.
- Document state serialization requirements and identify sensitive data (fog of war, hidden cards) to avoid leaking to clients.
- Define telemetry events for AI turns (decision time, action counts, outcomes).

### Phase 1 – Infrastructure scaffolding (1 sprint)
- Implement `aiPlayer` schema additions (`GamePlayer` flag, difficulty enum, personality seed).
- Add lobby UI controls in `frontend/src/pages` game creation flow for selecting AI slots + difficulty.
- Create `aiDecisionService` with stub strategies returning "pass" actions, plus Bull queue for asynchronous execution (even if workers run inline initially).
- Update socket lifecycle so AI turns auto-trigger without waiting for client messages.
- Ship unit tests covering AI-triggered turn progression and serialization sanity checks.

### Phase 2 – Recruit AI MVP (1–2 sprints)
- Build deterministic heuristics: reinforcement placement (largest frontline deficit), attack evaluation (expected armies gained), fortify (shortest-path regroup).
- Support asynchronous games by persisting queued AI actions so they replay after server restarts.
- Extend battle worker integration so dice rolling remains authoritative while AI chooses whether to continue attacks.
- Add feature flags to limit rollout to internal/staging lobbies.
- Update documentation and tutorials explaining AI limitations.

### Phase 3 – Commander difficulty (2 sprints)
- Introduce territory threat scoring (weighting enemy proximity, continent value, card pressure).
- Add shallow search (2-ply) with pruning to evaluate attack chains; maintain performance budget with profiling.
- Implement card cash-in timing heuristics and improved fortify logic (network flow style evaluation).
- Start evaluating compute hotspots; prototype Rust/Go worker if CPU time exceeds Node budget, using JSON-over-Redis for IPC.

### Phase 4 – Grandmaster difficulty (3+ sprints)
- Implement Monte Carlo simulations or iterative deepening search with stochastic battle outcomes.
- Add opponent modelling (predict likely reinforcements/attacks) to inform defensive placements.
- If native worker is justified, build a standalone service (Rust recommended for performance, Go acceptable) that consumes serialized game states, runs simulations, and returns ranked action plans. Reuse existing worker queue for isolation and horizontal scaling.
- Create configurable personality weights (aggressive, defensive, opportunistic) layered on top of the core decision engine.

### Phase 5 – Polish & rollout (ongoing)
- Frontend: display AI avatars, difficulty badges, and tooltips. Provide spectator-friendly logs of AI reasoning snippets for transparency.
- Backend: add rate limiting/timeout safeguards so runaway AI actions fail gracefully and concede turns if necessary.
- Analytics: dashboard to monitor AI win rates, turn durations, and rage-quit impact on human players.
- Launch plan: start with Recruit difficulty in casual games, gather telemetry, then enable Commander and Grandmaster sequentially.

## Data & state considerations
- **Serialization:** Use stable JSON schema for `GameState` snapshots; include versioning field for backward compatibility with future AI upgrades.
- **Security:** Prevent AI workers from mutating live game state directly; all changes must flow through validated actions.
- **Fog of war:** Ensure AI adheres to the same visibility rules as human players. Decision inputs should respect `gameState.fogVisibility` when active.
- **Randomness:** Centralize RNG seeds so simulations remain reproducible for debugging. Persist seeds in `game_config`.

## Testing strategy
- Unit tests for each strategy module verifying expected action selection on known board states.
- Integration tests that simulate full turns (deploy→attack→fortify) against mock opponents.
- Load tests targeting concurrent AI games to validate queue throughput and Redis performance.
- Regression suite covering socket events to ensure deltas stay consistent when AI drives the turn loop.

## Telemetry & observability
- Log per-turn decision time, action breakdown, win/loss outcomes, and errors.
- Add metrics to the existing `performanceMonitorService` dashboards for AI-specific latency and error rates.
- Capture anonymized replays of interesting AI games for offline analysis (stored with TTL).

## Risks & mitigations
| Risk | Mitigation |
| --- | --- |
| AI turns stall due to unbounded simulations | Enforce wall-clock timeouts, fall back to safe default action (fortify + end turn). |
| Cross-language worker adds deployment complexity | Keep Phase 1–3 in TypeScript; only introduce Rust/Go when profiling proves the need, and ship containerized worker with CI validation. |
| Difficulty feels unfair | Provide telemetry-driven tuning knobs (weight configs) and expose them via feature flags for rapid iteration. |
| AI leaks hidden information in fog games | Strictly filter decision state to match what the AI "knows". Add automated tests verifying no hidden cards/territories are present. |

## Open questions
- Do we need AI personalities (aggressive/defensive) at launch, or can they wait until after core difficulties ship?
- Should casual games with AI impact player XP/ELO, or should we track a separate PvE progression system?
- How will AI handle disconnects or mid-game slot swaps (e.g., human taking over an AI seat)?

## Dependencies
- Battle worker reactivation (currently staged but disabled).
- Reliable Bull queue infrastructure and Redis monitoring.
- Updated UX copy and localization for AI-related strings.

## Next steps
1. Share this plan with Connor for validation and prioritization against the go-live backlog.
2. Schedule a spike to profile decision-making complexity on large maps (12 players, modifiers on).
3. Create detailed technical specs for `aiDecisionService` interfaces and message contracts before writing code.
