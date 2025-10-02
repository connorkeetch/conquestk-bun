import { jest } from '@jest/globals'
import {
  clampDiamondsPercent,
  drawTreasure,
  ensureTreasureState,
  findRedeemableSets,
  getDefaultTreasureConfig,
  getPayout,
  normalizeTreasureConfig,
  redeemSet,
} from '../game/hiddenTreasures'

describe('Hidden Treasures utilities', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('normalizes configuration with defaults', () => {
    const config = normalizeTreasureConfig({ enabled: false, fixedValue: 99, handCap: 12 })
    expect(config.enabled).toBe(false)
    expect(config.fixedValue).toBe(50)
    expect(config.handCap).toBe(12)
    expect(config.diamondSetBonus).toBe(3)
  })

  it('clamps diamond percent between 0 and 1', () => {
    expect(clampDiamondsPercent(-0.5)).toBe(0)
    expect(clampDiamondsPercent(2)).toBe(1)
    expect(clampDiamondsPercent(0.25)).toBe(0.25)
  })

  it('draws treasure based on configured probabilities', () => {
    const config = normalizeTreasureConfig({ diamondsPercent: 0.1 })

    jest.spyOn(Math, 'random').mockReturnValue(0.05)
    expect(drawTreasure(config)).toBe('diamond')

    jest.spyOn(Math, 'random').mockReturnValue(0.2)
    expect(drawTreasure(config)).toBe('bronze')

    jest.spyOn(Math, 'random').mockReturnValue(0.5)
    expect(drawTreasure(config)).toBe('silver')

    jest.spyOn(Math, 'random').mockReturnValue(0.95)
    expect(drawTreasure(config)).toBe('gold')
  })

  it('finds redeemable sets by pattern', () => {
    const metals = ['bronze', 'bronze', 'bronze', 'diamond', 'gold', 'silver'] as const
    const matches = findRedeemableSets(metals)
    const patterns = matches.map((match) => match.pattern)
    expect(patterns).toContain('three_of_a_kind')
    expect(patterns).toContain('diamond_combo')
    expect(patterns).toContain('one_of_each')
  })

  it('redeems a valid set and applies diamond bonus', () => {
    const config = normalizeTreasureConfig({ payoutMode: 'classic', diamondSetBonus: 5 })
    const state = ensureTreasureState(undefined)
    const hand = ['diamond', 'gold', 'silver', 'bronze'] as const
    const { troops, updatedHand, updatedState, hasDiamond } = redeemSet(
      hand.slice(),
      [0, 1, 2],
      config,
      state,
    )

    expect(troops).toBe(4 + 5)
    expect(updatedHand).toEqual(['bronze'])
    expect(updatedState.totalSetsCashed).toBe(1)
    expect(hasDiamond).toBe(true)
  })

  it('throws when attempting to redeem an invalid set', () => {
    const config = getDefaultTreasureConfig()
    const state = ensureTreasureState(undefined)
    expect(() => redeemSet(['bronze', 'silver', 'silver'], [0, 1, 2], config, state)).toThrow(
      'Invalid treasure set',
    )
  })

  it('computes payout sequences correctly', () => {
    const config = normalizeTreasureConfig({ payoutMode: 'triangular' })
    let state = ensureTreasureState(undefined)
    const payouts: number[] = []

    for (let i = 0; i < 5; i++) {
      const result = getPayout(state, config)
      payouts.push(result.amount)
      state = result.state
    }

    expect(payouts).toEqual([4, 6, 9, 13, 18])
  })

  it('returns zero payout when mode is disabled', () => {
    const config = normalizeTreasureConfig({ payoutMode: 'none' })
    const state = ensureTreasureState(undefined)
    const result = getPayout(state, config)
    expect(result.amount).toBe(0)
  })
})
