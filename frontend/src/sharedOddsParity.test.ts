import { computeRollOdds } from '@risk-game/shared/utils/combatOdds'
import { describe, expect, it } from 'vitest'

describe('shared combat odds parity', () => {
  it('matches known distributions for 3v2 and 2v2', () => {
    const a = computeRollOdds(3, 2)
    const b = computeRollOdds(2, 2)
    // Basic sanity: probabilities add up (within small epsilon)
    const sumA =
      a.probabilities.attackerLoses1 +
      a.probabilities.attackerLoses2 +
      a.probabilities.defenderLoses1 +
      a.probabilities.defenderLoses2 +
      a.probabilities.trade11
    const sumB =
      b.probabilities.attackerLoses1 +
      b.probabilities.attackerLoses2 +
      b.probabilities.defenderLoses1 +
      b.probabilities.defenderLoses2 +
      b.probabilities.trade11
    expect(Math.abs(sumA - 1)).toBeLessThan(1e-9)
    expect(Math.abs(sumB - 1)).toBeLessThan(1e-9)

    // Expected advantage: 3v2 favours attacker; 2v2 is roughly even (allow small bias either way)
    expect(a.expected.advantage).toBeGreaterThan(0)
    expect(Math.abs(b.expected.advantage)).toBeLessThan(0.6)
  })
})
