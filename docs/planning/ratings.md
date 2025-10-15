ConquestK Ranked Ratings (Pairwise Elo)

Overview
- Deterministic, zero-sum Elo updates for Ranked games using Pairwise Elo Aggregation.
- Supports FFA and teams (future Ranked mode). For current Ranked constraints (public, >=3 humans, no AI/teams), only FFA applies.

Algorithm
- Constants: D=400; K_base=24; K_provisional=40 (first 20 ranked games); R_floor=800.
- Scale K by player count: K_n = K_used * sqrt(n-1).
- For each player i:
  - Expected: E_i = avg_j≠i [ 1 / (1 + 10^((R_j - R_i)/D)) ]
  - Score: S_i = avg_j≠i [ 1 if i placed above j, 0.5 if tied, 0 if below ]
  - Delta: ΔR_i = round( K_n * (S_i - E_i) )
  - Zero-sum fixup: adjust the largest-magnitude delta by -sum(ΔR) to enforce exact zero-sum after rounding.
  - Clamp: newRating = max(800, R + ΔR_i)
- Teams: compute team ratings as averages, compute pairwise S/E by team placement, then distribute the resulting team delta evenly across members.

Storage
- Current dev integration uses existing tables: rating_history (audit) and users.skill_rating (current rating). No new tables are required.
- Idempotency: finalization is idempotent via game_results(room_id) insertion; Elo applies once per completed game.
- Mode strings: tracked implicitly via game mode; future per-mode splits can be layered on later.

Integration
Integration
- Existing service updated: backend/src/services/eloService.ts now computes Pairwise Elo deltas.
- Called from game finalization (GameService.finalizeCompletedGame) after persisting game_results; writes to rating_history and updates users.skill_rating in one transaction.
- Structured logs continue via finalize path (calculated change breakdown + optional room log entries).

Constraints (Ranked-only)
- We plan to enforce Ranked-only guards (public, >=3 humans, no teams/AI) when live; in dev, we compute changes as part of finalize as today. This can be toggled at finalize once Ranked modes are enforced.

Testing
- Jest tests updated at backend/src/services/eloService.test.ts covering 1v1, 3P equal ratings, upset, zero-sum, scaling, and floor clamp.
