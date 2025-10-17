import type { Metal, Territory } from '../types/index.js'

const normalizeTerritoryId = (value: string | number): string =>
  typeof value === 'number' ? value.toString() : value

type CapitalCompatiblePlayer = {
  id: string
  territories: string[]
  isEliminated?: boolean
  capitalTerritory?: string | null
  armies: number
  treasures?: Metal[]
  mustCashInTreasures?: boolean
}

type CapitalCompatibleState = {
  board: Territory[]
  players: CapitalCompatiblePlayer[]
  capitalAssignments?: Record<string, string>
}

const clonePlayers = (players: CapitalCompatiblePlayer[]): CapitalCompatiblePlayer[] =>
  players.map((player) => ({ ...player }))

const normalizeAssignments = (
  assignments: CapitalCompatibleState['capitalAssignments'],
): Record<string, string> => {
  if (!assignments) return {}
  return { ...assignments }
}

export const isCapitalTerritory = (
  state: CapitalCompatibleState,
  playerId: string | null | undefined,
  territoryId: string | number,
): boolean => {
  if (!playerId) return false
  const normalizedId = normalizeTerritoryId(territoryId)
  if (state.capitalAssignments?.[playerId]) {
    return state.capitalAssignments[playerId] === normalizedId
  }
  const territory = state.board.find((entry) => entry.id === normalizedId)
  return territory?.isCapital === true && territory?.capitalOwnerId === playerId
}

export const applyCapitalCapture = (
  state: CapitalCompatibleState,
  attackerId: string,
  defenderId: string,
  capitalTerritoryId: string | number,
): { transferred: string[] } => {
  const normalizedCapitalId = normalizeTerritoryId(capitalTerritoryId)
  const players = state.players
  const attacker = players.find((player) => player.id === attackerId)
  const defender = players.find((player) => player.id === defenderId)

  if (!attacker || !defender) {
    return { transferred: [] }
  }

  const transferred = new Set<string>()
  const updatedBoard: Territory[] = state.board.map((territory) => {
    const copy: Territory = { ...territory }

    if (copy.ownerId === defenderId) {
      copy.ownerId = attackerId
      transferred.add(copy.id)
    }

    if (copy.capitalOwnerId === defenderId && copy.id !== normalizedCapitalId) {
      copy.capitalOwnerId = null
      copy.isCapital = false
    }

    if (copy.capitalOwnerId === attackerId && copy.id !== normalizedCapitalId) {
      copy.capitalOwnerId = null
      copy.isCapital = false
    }

    if (copy.id === normalizedCapitalId) {
      copy.ownerId = attackerId
      copy.isCapital = true
      copy.capitalOwnerId = attackerId
      transferred.add(copy.id)
    }

    return copy
  })

  state.board = updatedBoard

  defender.territories = []
  defender.isEliminated = true
  delete defender.capitalTerritory
  defender.armies = 0
  defender.treasures = []
  defender.mustCashInTreasures = false

  const merged = new Set<string>(attacker.territories)
  for (const id of transferred) {
    merged.add(id)
  }
  attacker.territories = Array.from(merged)
  attacker.capitalTerritory = normalizedCapitalId

  state.players = clonePlayers(players)

  const assignments = normalizeAssignments(state.capitalAssignments)
  delete assignments[defenderId]
  assignments[attackerId] = normalizedCapitalId
  state.capitalAssignments = assignments

  return { transferred: Array.from(transferred) }
}
