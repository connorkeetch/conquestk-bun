import { mapService } from '../services/mapService.js'
import type { ContinentBonus, Territory } from '../types/game.js'

/**
 * Loads a map from the database and adapts it to the GameEngine types.
 * Returns territories (with adjacency lists and coordinates) and sector bonuses.
 */
export async function loadMapForEngine(mapId: string): Promise<{
  territories: Territory[]
  continentBonuses: ContinentBonus[]
}> {
  const full = await mapService.getMapWithFullData(mapId)
  if (!full) {
    throw new Error(`Map not found: ${mapId}`)
  }

  const { territories: dbTerritories, adjacencies, sectors } = full

  // Build adjacency lookup
  const adjacencyMap = new Map<string, Set<string>>()
  for (const t of dbTerritories) {
    adjacencyMap.set(t.id, new Set<string>())
  }

  for (const adj of adjacencies) {
    if (!adjacencyMap.has(adj.fromTerritoryId)) {
      adjacencyMap.set(adj.fromTerritoryId, new Set<string>())
    }
    const fromSet = adjacencyMap.get(adj.fromTerritoryId)
    fromSet?.add(adj.toTerritoryId)

    if (adj.isBidirectional) {
      if (!adjacencyMap.has(adj.toTerritoryId)) {
        adjacencyMap.set(adj.toTerritoryId, new Set<string>())
      }
      const toSet = adjacencyMap.get(adj.toTerritoryId)
      toSet?.add(adj.fromTerritoryId)
    }
  }

  // Adapt territories to engine type
  const territories: Territory[] = dbTerritories.map((t) => ({
    id: t.id,
    name: t.name,
    sector: t.sectorId ?? 'unknown',
    ownerId: null,
    armies: 0,
    adjacentTerritories: Array.from(adjacencyMap.get(t.id) ?? new Set<string>()),
    ...(t.armyPosition ? { coordinates: { x: t.armyPosition.x, y: t.armyPosition.y } } : {}),
    isCapital: false,
  }))

  // Compute sector bonuses from loaded data
  const continentBonuses: ContinentBonus[] = sectors.map((c) => ({
    id: c.id,
    name: c.name,
    bonusArmies: c.bonusArmies,
    territories: dbTerritories.filter((t) => (t.sectorId ?? '') === c.id).map((t) => t.id),
  }))

  return { territories, continentBonuses }
}
