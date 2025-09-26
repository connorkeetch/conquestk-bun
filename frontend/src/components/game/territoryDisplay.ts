import type { TerritoryModifier as RawTerritoryModifier, Territory } from '@/types/game'
import type { TerritoryModifier as IconTerritoryModifier } from '../TerritoryModifierIcon'

export interface TerritoryDisplay {
  id: string
  name: string
  continent: string
  adjacentTerritories: string[]
  armyPosition: { x: number; y: number }
  owner?: string
  ownerId?: string
  armies?: number
  [key: string]: unknown
}

export type TerritoryDisplayMap = Record<string, TerritoryDisplay>

const defaultArmyPosition = { x: 0, y: 0 }

export const createTerritoryDisplayMap = (territories: Territory[]): TerritoryDisplayMap => {
  const displayMap: TerritoryDisplayMap = {}

  territories.forEach((territory) => {
    const coordinates = territory.coordinates
    const armyPosition = coordinates ? { x: coordinates.x, y: coordinates.y } : defaultArmyPosition

    displayMap[territory.id] = {
      id: territory.id,
      name: territory.name,
      continent: territory.continent ?? territory.continentId ?? 'unknown',
      adjacentTerritories: territory.adjacentTerritories,
      armyPosition,
      owner: territory.ownerId ?? undefined,
      ownerId: territory.ownerId ?? undefined,
      armies: territory.armies,
    }
  })

  return displayMap
}

const normalizeModifier = (modifier: RawTerritoryModifier): IconTerritoryModifier => ({
  name: modifier.name ?? modifier.type ?? 'Modifier',
  icon: modifier.icon ?? '✨',
  color: modifier.color ?? '#a855f7',
  defense_bonus: modifier.defense_bonus ?? 0,
  attack_bonus: modifier.attack_bonus ?? 0,
  troop_generation_bonus: modifier.troop_generation_bonus ?? 0,
  movement_restriction: modifier.movement_restriction ?? false,
  supply_line_bonus: modifier.supply_line_bonus ?? false,
})

export const normaliseModifierMap = (
  modifiers: Map<string, RawTerritoryModifier> | Record<string, RawTerritoryModifier>,
): Map<string, IconTerritoryModifier> => {
  const entries =
    modifiers instanceof Map ? Array.from(modifiers.entries()) : Object.entries(modifiers)

  return new Map(
    entries.map(([territoryId, modifier]) => [territoryId, normalizeModifier(modifier)]),
  )
}
