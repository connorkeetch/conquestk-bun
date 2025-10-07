import { setPrecomputedOutcomes } from '@shared/utils/battleOdds'
import { logger } from '@/utils/logger'

export async function preloadBattleOdds(): Promise<void> {
  try {
    const res = await fetch('/data/combatOutcomes.json', { cache: 'force-cache' })
    if (!res.ok) throw new Error(`status ${res.status}`)
    const json = (await res.json()) as number[][]
    if (Array.isArray(json)) {
      setPrecomputedOutcomes(json)
      logger.info('[BOOT] Loaded precomputed battle odds table')
    }
  } catch (err) {
    logger.warn('[BOOT] Precomputed battle odds not available; falling back to on-the-fly compute', err)
  }
}

