/**
 * Hidden Treasures – gameplay helpers
 *
 * Overview
 * - Players can draw treasures (bronze, silver, gold, diamond) on conquest.
 * - Trading a valid set (three of a kind, one of each, or any set containing a diamond)
 *   grants reinforcement troops based on a payout mode. Sets containing a diamond also
 *   receive an additional diamondSetBonus.
 * - Hands are capped by `handCap`; reaching the cap forces a cash-in.
 *
 * Configuration (TreasureConfig)
 * - enabled: toggle treasures on/off.
 * - diamondsPercent: probability (0..1) that a draw is a diamond; other metals split evenly.
 * - payoutMode: 'triangular' | 'classic' | 'fixed' | 'none'
 *   - triangular: 4, 6, 9, 13, 18, ... (increasing gaps)
 *   - classic: 4, 6, 8, 10, 12, 15, 20, 25, 30, 35, then +5 per set
 *   - fixed: constant payout defined by fixedValue (clamped: 1..50)
 *   - none: 0 payout when cashing sets
 * - fixedValue: troops when payoutMode='fixed'
 * - handCap: max cards in hand before forced cash-in (>=1)
 * - diamondSetBonus: extra troops if redeemed set includes a diamond (>=0)
 *
 * Primary APIs
 * - normalizeTreasureConfig: merges defaults and clamps values
 * - drawTreasure: RNG-based draw per config
 * - findRedeemableSets: enumerate valid sets in a hand
 * - redeemSet: apply payout + diamond bonus, remove cards, and advance state
 *
 * Engine integration
 * - GameEngine.initializeGame attaches treasureState when enabled.
 * - Conquest draws occur after successful territory capture.
 * - `trade_cards` with `treasureSet` indexes is validated then redeemed.
 */
import type { Metal, TreasureConfig, TreasureState } from '../types/game.js'

export type TreasureSetPattern = 'three_of_a_kind' | 'one_of_each' | 'diamond_combo'

export interface TreasureSetMatch {
  indices: [number, number, number]
  metals: [Metal, Metal, Metal]
  pattern: TreasureSetPattern
  hasDiamond: boolean
}

export interface RedeemResult {
  troops: number
  updatedHand: Metal[]
  updatedState: TreasureState
  hasDiamond: boolean
  pattern: TreasureSetPattern
}

const CLASSIC_SEQUENCE = [4, 6, 8, 10, 12, 15, 20, 25, 30, 35]

const DEFAULT_CONFIG: Required<TreasureConfig> = {
  enabled: true,
  diamondsPercent: 0.08,
  payoutMode: 'classic',
  fixedValue: 8,
  handCap: 5,
  diamondSetBonus: 3,
}

/**
 * Returns a copy of the default treasure configuration.
 * @returns {TreasureConfig} The default treasure configuration.
 */
export const getDefaultTreasureConfig = (): TreasureConfig => ({ ...DEFAULT_CONFIG })

export const clampDiamondsPercent = (value: number): number => {
  if (!Number.isFinite(value)) return DEFAULT_CONFIG.diamondsPercent
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
}

/**
 * Merge a partial config with defaults and clamp values to safe ranges.
 */
export function normalizeTreasureConfig(config?: Partial<TreasureConfig>): TreasureConfig {
  const merged: TreasureConfig = {
    ...DEFAULT_CONFIG,
    ...(config ?? {}),
  }

  merged.diamondsPercent = clampDiamondsPercent(
    typeof merged.diamondsPercent === 'number'
      ? merged.diamondsPercent
      : DEFAULT_CONFIG.diamondsPercent,
  )

  if (merged.payoutMode === 'fixed') {
    if (typeof merged.fixedValue !== 'number' || Number.isNaN(merged.fixedValue)) {
      merged.fixedValue = DEFAULT_CONFIG.fixedValue
    } else {
      merged.fixedValue = Math.max(1, Math.min(50, Math.trunc(merged.fixedValue)))
    }
  } else if (typeof merged.fixedValue === 'number') {
    merged.fixedValue = Math.max(1, Math.min(50, Math.trunc(merged.fixedValue)))
  }

  merged.handCap = Math.max(1, Math.trunc(merged.handCap))
  merged.diamondSetBonus = Math.max(0, Math.trunc(merged.diamondSetBonus))

  return merged
}

/**
 * Draw a treasure according to configured probabilities.
 * Diamonds consume `diamondsPercent`; remaining probability mass is split evenly.
 *
 * Pass a deterministic RNG to make the draw reproducible (required if treasure
 * draws are ever re-simulated for lockstep/replay). When omitted it falls back
 * to Math.random() — the current server-authoritative behaviour.
 */
export function drawTreasure(
  config: TreasureConfig,
  rng?: { nextRange(minInclusive: number, maxExclusive: number): number },
): Metal {
  const roll = rng ? rng.nextRange(0, 1) : Math.random()
  if (roll < config.diamondsPercent) {
    return 'diamond'
  }

  const remaining = 1 - config.diamondsPercent
  const slice = remaining / 3
  const thresholds = [config.diamondsPercent + slice, config.diamondsPercent + slice * 2]

  if (roll < thresholds[0]) {
    return 'bronze'
  }

  if (roll < thresholds[1]) {
    return 'silver'
  }

  return 'gold'
}

/**
 * Compute the troop payout for the next redeemed set and return the updated state.
 */
export function getPayout(
  state: TreasureState,
  config: TreasureConfig,
): { amount: number; state: TreasureState } {
  const nextIndex = state.nextPayoutIndex
  let amount = 0

  switch (config.payoutMode) {
    case 'classic': {
      if (nextIndex < CLASSIC_SEQUENCE.length) {
        amount = CLASSIC_SEQUENCE[nextIndex]
      } else {
        const overflowIndex = nextIndex - CLASSIC_SEQUENCE.length + 1
        amount = CLASSIC_SEQUENCE[CLASSIC_SEQUENCE.length - 1] + overflowIndex * 5
      }
      break
    }
    case 'fixed': {
      amount = config.fixedValue ?? DEFAULT_CONFIG.fixedValue
      break
    }
    case 'none':
      amount = 0
      break
    // 'triangular' falls through to default
    default: {
      amount = computeTriangularPayout(nextIndex)
      break
    }
  }

  const nextState: TreasureState = {
    totalSetsCashed: state.totalSetsCashed + 1,
    nextPayoutIndex: nextIndex + 1,
  }

  return { amount, state: nextState }
}

/**
 * Triangular-like increasing payout sequence starting at 4.
 */
function computeTriangularPayout(index: number): number {
  if (index <= 0) {
    return 4
  }

  let payout = 4
  let delta = 2
  for (let i = 1; i <= index; i++) {
    payout += delta
    delta += 1
  }
  return payout
}

/**
 * Identify redeem pattern for three metals: 'three_of_a_kind', 'one_of_each', or 'diamond_combo'.
 */
function classifySet(metals: [Metal, Metal, Metal]): TreasureSetPattern | null {
  const [a] = metals
  const set = new Set(metals)
  const diamondCount = metals.filter((m) => m === 'diamond').length

  if (diamondCount > 0) {
    return 'diamond_combo'
  }

  if (set.size === 1 && (a === 'bronze' || a === 'silver' || a === 'gold')) {
    return 'three_of_a_kind'
  }

  const metalsSorted = [...set].sort()
  if (
    metalsSorted.length === 3 &&
    metalsSorted[0] === 'bronze' &&
    metalsSorted[1] === 'gold' &&
    metalsSorted[2] === 'silver'
  ) {
    return 'one_of_each'
  }

  return null
}

/**
 * Return all redeemable 3-card sets in a hand with their indices and pattern.
 */
export function findRedeemableSets(hand: Metal[]): TreasureSetMatch[] {
  const matches: TreasureSetMatch[] = []

  for (let i = 0; i < hand.length - 2; i++) {
    for (let j = i + 1; j < hand.length - 1; j++) {
      for (let k = j + 1; k < hand.length; k++) {
        const metals: [Metal, Metal, Metal] = [hand[i], hand[j], hand[k]]
        const pattern = classifySet(metals)
        if (!pattern) continue

        matches.push({
          indices: [i, j, k],
          metals,
          pattern,
          hasDiamond: metals.includes('diamond'),
        })
      }
    }
  }

  return matches
}

/**
 * Redeem a valid set by indices from the given hand.
 * Throws on invalid indices or non-redeemable combinations.
 */
export function redeemSet(
  hand: Metal[],
  indices: [number, number, number],
  config: TreasureConfig,
  state: TreasureState,
): RedeemResult {
  const sorted = [...indices].sort((a, b) => a - b) as [number, number, number]
  if (new Set(sorted).size !== 3) {
    throw new Error('Treasure indices must be unique')
  }
  if (sorted.some((index) => index < 0 || index >= hand.length)) {
    throw new Error('Treasure index out of bounds')
  }

  const metals: [Metal, Metal, Metal] = [hand[sorted[0]], hand[sorted[1]], hand[sorted[2]]]
  const pattern = classifySet(metals)
  if (!pattern) {
    throw new Error('Invalid treasure set')
  }

  const { amount, state: updatedState } = getPayout(state, config)
  const hasDiamond = metals.includes('diamond')
  const bonus = hasDiamond ? config.diamondSetBonus : 0

  const updatedHand = hand.filter((_, idx) => !sorted.includes(idx))

  return {
    troops: amount + bonus,
    updatedHand,
    updatedState,
    hasDiamond,
    pattern,
  }
}

/**
 * Initialize or return an existing TreasureState.
 */
export function ensureTreasureState(state?: TreasureState): TreasureState {
  if (!state) {
    return {
      totalSetsCashed: 0,
      nextPayoutIndex: 0,
    }
  }

  return state
}
