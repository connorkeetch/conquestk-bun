import { computeRollOdds } from './odds'

/**
 * Pre-computed cache for all possible Risk dice combinations
 * Stores results of computeRollOdds for 1-3 attacker dice vs 1-2 defender dice
 */
const ODDS_CACHE = new Map<string, ReturnType<typeof computeRollOdds>>()

/**
 * Gets cached odds for a given attacker/defender dice combination
 * Pre-computes on first access and caches for subsequent calls
 *
 * @param attDice - Number of attacker dice (1-3)
 * @param defDice - Number of defender dice (1-2)
 * @returns Cached odds calculation result
 *
 * @example
 * const odds = getCachedOdds(3, 2)
 * console.log(odds.expected.advantage) // Expected army advantage per roll
 */
export function getCachedOdds(
  attDice: 1 | 2 | 3,
  defDice: 1 | 2,
): ReturnType<typeof computeRollOdds> {
  const key = `${attDice}-${defDice}`

  if (!ODDS_CACHE.has(key)) {
    ODDS_CACHE.set(key, computeRollOdds(attDice, defDice))
  }

  const result = ODDS_CACHE.get(key)
  if (!result) {
    throw new Error(`Odds cache miss for ${key} - this should never happen`)
  }
  return result
}
// Pre-warm cache with all possible combinations (6 total)
;[1, 2, 3].forEach((att) => {
  ;[1, 2].forEach((def) => {
    getCachedOdds(att as 1 | 2 | 3, def as 1 | 2)
  })
})
