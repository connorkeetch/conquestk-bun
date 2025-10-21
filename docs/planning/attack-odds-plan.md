> **Note:** This document outlines the original plan for the attack odds overhaul, which has since been implemented. The combat outcomes are now pre-calculated and stored in `shared/data/combatOutcomes.json`. This plan is preserved as a historical reference.
>
> ---
> last_reviewed: 2025-10-21
---

# Attack Odds Overhaul Plan

## Objective
Display the chance that an attacking territory can fully conquer the defending territory's stack, rather than only the odds for the next dice roll. The computation must assume:

- The attacker always rolls the maximum number of dice allowed (up to three) while keeping at least one unit behind.
- The defender always rolls the maximum number of dice allowed (up to two).
- Defender wins ties when comparing the highest dice.

The goal is to surface the aggregate win probability (and optional expected losses) for the entire engagement before the first roll.

## High-level approach
1. **Reuse existing single-roll odds** – `@shared/utils/combatOdds.ts` already enumerates every dice outcome for a given `(attackerDice, defenderDice)` pair. We'll leverage these distributions as transition probabilities between combat states.
2. **Model combat as a Markov process** – Each state is defined by the number of attacking and defending units remaining `(a, d)` before a roll. After each roll the state moves to `(a - attackerLosses, d - defenderLosses)` according to the single-roll probability distribution.
3. **Solve with dynamic programming** – Use recursion with memoization (or bottom-up DP) to compute the probability that the attacker eventually wins from each state. Base cases: `d === 0` ⇒ win probability `1`; `a < 2` ⇒ attacker cannot continue ⇒ win probability `0`.
4. **Precompute a lookup table** – Build a table for a reasonable army range (e.g., attackers 1–100, defenders 0–100). Serialize the results to JSON under `shared/data/combatOutcomes.json`. The frontend and backend can load this table to answer odds queries instantly.
5. **Expose helper utilities** –
   - `computeBattleOutcome(attArmies, defArmies)` → `{ winProbability, expectedAttackerLosses, expectedDefenderLosses }`
   - Optionally, `simulateBattle(attArmies, defArmies)` for Monte Carlo validation in tests (not production).
6. **Update UI logic** – Replace the single-roll odds shown in `AttackOddsPopup` with the full battle probability derived from the lookup table.

## Detailed computation steps
1. **Enumerate dice outcomes**
   ```ts
   const odds = computeRollOdds(attDice, defDice)
   ```
   - Use `odds.probabilities` to obtain the chance of each casualty combination.
2. **Determine dice counts per state**
   ```ts
   const attDice = Math.min(3, a - 1)
   const defDice = Math.min(2, d)
   if (attDice <= 0) return 0
   ```
3. **Recursive probability calculation**
   ```ts
   function winProbability(a, d): number {
     if (d === 0) return 1
     if (a < 2) return 0
     const attDice = ...
     const defDice = ...
     const odds = computeRollOdds(attDice, defDice)
     return sum(outcomeProb * winProbability(a - aLoss, d - dLoss))
   }
   ```
   - Memoize results in a 2D array or `Map` keyed by `"a-d"` to avoid recomputation.
4. **Expected losses**
   - Track expected attacker and defender losses using the same recursion by accumulating `(outcomeProb * (aLoss + expectedLossNextState))`.
   - Alternatively, derive from the win probability table with a second DP pass if needed.
5. **Table generation script**
   - Create a Node script (e.g., `scripts/generateCombatOutcomes.ts`) that iterates attacker/defender counts within configured limits, fills the DP tables, and saves JSON.
   - Run this script during builds or check in the generated JSON to avoid runtime cost.
6. **Testing strategy**
   - Unit tests for the DP helper to confirm base cases and sample probabilities match known Risk benchmarks (e.g., 3v2 with 10 vs 8 armies ≈ 65%).
   - Snapshot test to ensure the generated JSON is deterministic.
   - Optional Monte Carlo simulation (5e5 trials per matchup) to validate a subset of table entries.

## Why not pure simulation?
Monte Carlo simulation is great for validation but not ideal for production because:
- High iteration counts are required for accuracy, especially for large army counts.
- Runtime cost is high if executed on demand.
- Simulation introduces random noise unless seeded and averaged carefully.

Instead, the DP/Markov approach provides exact probabilities derived from enumerated dice outcomes, executes quickly (microseconds per state), and produces deterministic lookup tables.

## Next steps
1. Implement the DP helper and table generation script.
2. Generate and commit the lookup data.
3. Update the frontend to read from the lookup table and display full battle odds in the Attack popup.
4. Add regression tests to prevent accidental drift between single-roll and aggregate odds computations.
