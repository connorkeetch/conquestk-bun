import type { TreasureConfig, TreasureState } from '@shared/types'

const CLASSIC_SEQUENCE = [4, 6, 8, 10, 12, 15, 20, 25, 30, 35]

function computeTriangularPayout(index: number): number {
  const safeIdx = Math.max(0, Math.floor(index))
  if (safeIdx <= 0) return 4
  let payout = 4
  let delta = 2
  for (let i = 1; i <= safeIdx; i++) {
    payout += delta
    delta += 1
  }
  return payout
}

export function computeNextTreasurePayout(
  state: TreasureState | undefined,
  config: TreasureConfig | undefined,
): { base: number; diamondBonus: number; mode: string } {
  const nextIndex = Math.max(
    0,
    Number((state as { nextPayoutIndex?: number } | undefined)?.nextPayoutIndex) || 0,
  )
  const cfg = config as
    | (TreasureConfig & {
        payoutMode?: TreasureConfig['payoutMode']
        fixedValue?: number
        diamondSetBonus?: number
      })
    | undefined

  const mode = String(cfg?.payoutMode || 'classic').toLowerCase()
  const diamondBonus = Math.max(0, Number(cfg?.diamondSetBonus ?? 0))

  if (mode === 'fixed') {
    const fixed = Math.max(1, Math.min(50, Number(cfg?.fixedValue ?? 8)))
    return { base: fixed, diamondBonus, mode }
  }

  if (mode === 'none') {
    return { base: 0, diamondBonus, mode }
  }

  if (mode === 'classic') {
    const base =
      nextIndex < CLASSIC_SEQUENCE.length
        ? CLASSIC_SEQUENCE[nextIndex]
        : CLASSIC_SEQUENCE[CLASSIC_SEQUENCE.length - 1] +
          (nextIndex - CLASSIC_SEQUENCE.length + 1) * 5
    return { base, diamondBonus, mode }
  }

  // triangular (default)
  return { base: computeTriangularPayout(nextIndex), diamondBonus, mode: 'triangular' }
}
