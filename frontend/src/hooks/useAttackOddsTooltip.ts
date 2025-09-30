import { useMemo } from 'react'
import { getCachedOdds } from '../utils/oddsCache'
import { useAppSelector } from './redux'

interface Territory {
  id: string
  x: number
  y: number
  armies?: number
}

interface UseAttackOddsTooltipParams {
  pendingAction: string | null
  selectedId: string | null
  hoveredId: string | null
  validTargets: string[]
  territories: Territory[]
  mapWidth: number
  mapHeight: number
}

interface OddsTooltip {
  att: 1 | 2 | 3
  def: 1 | 2
  odds: ReturnType<typeof getCachedOdds>
  winChance: number
  left: number
  top: number
}

/**
 * Computes and positions attack odds tooltip for hovered valid targets
 *
 * @param params - Configuration including territories, selection state, and map dimensions
 * @returns Tooltip data with odds calculations and positioning, or null if not applicable
 *
 * @example
 * const oddsTooltip = useAttackOddsTooltip({
 *   pendingAction: 'attack',
 *   selectedId: 'alaska',
 *   hoveredId: 'kamchatka',
 *   validTargets: ['kamchatka', 'alberta'],
 *   territories: mapData.territories,
 *   mapWidth: 1000,
 *   mapHeight: 600,
 * })
 */
export function useAttackOddsTooltip({
  pendingAction,
  selectedId,
  hoveredId,
  validTargets,
  territories,
  mapWidth,
  mapHeight,
}: UseAttackOddsTooltipParams): OddsTooltip | null {
  const attackDice = useAppSelector((s) => s.uiRoom.dice)

  return useMemo(() => {
    // Only show tooltip when attacking
    if (pendingAction !== 'attack') return null
    if (!selectedId || !hoveredId) return null
    if (!validTargets.includes(hoveredId)) return null

    // Find source and destination territories
    const src = territories.find((t) => t.id === selectedId)
    const dst = territories.find((t) => t.id === hoveredId)
    if (!src || !dst) return null

    const srcArmies = src.armies ?? 0
    const dstArmies = dst.armies ?? 0

    // Need at least 2 armies to attack (1 stays behind)
    if (srcArmies <= 1) return null

    // Calculate attacker dice (1-3, limited by armies available)
    const att = Math.max(1, Math.min(3, Math.min(attackDice, srcArmies - 1))) as 1 | 2 | 3

    // Calculate defender dice (1-2, based on armies)
    const def = Math.min(2, Math.max(1, dstArmies)) as 1 | 2

    // Compute odds using cached utility (pre-computed for performance)
    const odds = getCachedOdds(att, def)

    // Calculate win chance as percentage
    const winChance =
      (odds.probabilities.defenderLoses1 + (odds.probabilities.defenderLoses2 ?? 0)) * 100

    // Position tooltip as percentage of map dimensions
    const left = (dst.x / mapWidth) * 100
    const top = (dst.y / mapHeight) * 100

    return { att, def, odds, winChance, left, top }
  }, [
    attackDice,
    hoveredId,
    selectedId,
    territories,
    validTargets,
    mapWidth,
    mapHeight,
    pendingAction,
  ])
}
