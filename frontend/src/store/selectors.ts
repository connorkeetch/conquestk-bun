/**
 * Memoized Redux selectors for performance optimization
 * These selectors cache expensive computations and only recompute when dependencies change
 */
import { createSelector } from '@reduxjs/toolkit'
import type { GameState } from '../types/game'
import type { RootState } from './index'

// Base selectors
const selectGameState = (state: RootState) => state.game.currentGame
const selectSelectedTerritoryId = (state: RootState) => state.game.selectedTerritory
const selectCurrentPlayerId = (state: RootState) => state.auth.user?.id
const selectReinforcementArmies = (state: RootState) => state.game.reinforcementArmies

// Memoized valid targets calculation
// This was previously recalculated on every territory selection
// Fast territory index for O(1) lookups by id
export const selectTerritoryIndex = createSelector([selectGameState], (gameState) => {
  const index = new Map<string, GameState['board'][number]>()
  if (!gameState) return index
  for (const t of gameState.board) index.set(t.id, t)
  return index
})

export const selectValidTargets = createSelector(
  [selectGameState, selectTerritoryIndex, selectSelectedTerritoryId, selectCurrentPlayerId],
  (gameState, territoryIndex, selectedTerritoryId, currentPlayerId): string[] => {
    if (!gameState || !selectedTerritoryId || !currentPlayerId) {
      return []
    }

    const selectedTerritory = territoryIndex.get(selectedTerritoryId)
    if (!selectedTerritory) {
      return []
    }

    switch (gameState.phase) {
      case 'reinforcement':
        // Can only reinforce own territories
        return selectedTerritory.ownerId === currentPlayerId ? [selectedTerritoryId] : []

      case 'attack': {
        // Can attack adjacent territories owned by other players
        if (selectedTerritory.ownerId !== currentPlayerId || selectedTerritory.armies <= 1) {
          return []
        }
        return selectedTerritory.adjacentTerritories.filter((adjId) => {
          const adj = territoryIndex.get(adjId)
          return adj && adj.ownerId !== currentPlayerId
        })
      }

      case 'fortify': {
        // Calculate valid targets based on movement type
        if (selectedTerritory.ownerId !== currentPlayerId || selectedTerritory.armies <= 1) {
          return []
        }

        const movementType = gameState.gameConfig?.movementType || 'classic_adjacent'

        switch (movementType) {
          case 'classic_adjacent':
          case 'adjacent_multi':
            // Adjacent territories only
            return selectedTerritory.adjacentTerritories.filter((adjId) => {
              const adj = territoryIndex.get(adjId)
              return adj && adj.ownerId === currentPlayerId
            })

          case 'path_single':
          case 'path_multi': {
            // Any connected territory through owned territories
            // Build a Set of owned territory ids once for BFS checks
            const ownedIds = new Set(
              gameState.board.filter((t) => t.ownerId === currentPlayerId).map((t) => t.id),
            )
            return gameState.board
              .filter((t) => ownedIds.has(t.id) && t.id !== selectedTerritoryId)
              .filter((t) =>
                isConnectedThroughOwnedTerritoriesIndex(
                  selectedTerritoryId,
                  t.id,
                  territoryIndex,
                  ownedIds,
                ),
              )
              .map((t) => t.id)
          }

          default:
            return []
        }
      }

      default:
        return []
    }
  },
)

// Helper function to check if territories are connected through owned territories
// (Removed) legacy BFS helper replaced by index-based version

// Optimized BFS using a prebuilt territoryIndex and ownedIds set
function isConnectedThroughOwnedTerritoriesIndex(
  fromId: string,
  toId: string,
  territoryIndex: Map<string, GameState['board'][number]>,
  ownedIds: Set<string>,
): boolean {
  if (fromId === toId) return true

  const visited = new Set<string>([fromId])
  const queue: string[] = [fromId]

  for (let index = 0; index < queue.length; index += 1) {
    const currentId = queue[index]
    if (currentId === toId) return true

    const currentTerritory = territoryIndex.get(currentId)
    if (!currentTerritory) continue

    for (const adjacentId of currentTerritory.adjacentTerritories) {
      if (!ownedIds.has(adjacentId) || visited.has(adjacentId)) continue
      if (adjacentId === toId) return true
      visited.add(adjacentId)
      queue.push(adjacentId)
    }
  }

  return false
}

// Memoized player stats calculation
export const selectPlayerStats = createSelector([selectGameState], (gameState) => {
  if (!gameState) return []

  return gameState.players.map((player) => {
    const ownedTerritories = gameState.board.filter((t) => t.ownerId === player.id)
    const territoryCount = ownedTerritories.length
    const totalArmies = ownedTerritories.reduce((sum, t) => sum + (t.armies || 0), 0)

    return {
      ...player,
      territoryCount,
      totalArmies,
      reinforcements: Math.max(3, Math.floor(territoryCount / 3)),
    }
  })
})

// Memoized continent control calculation
export const selectContinentControl = createSelector([selectGameState], (gameState) => {
  if (!gameState) return []

  // Resolve sector/continent definitions from config (supports sectorBonuses or continentBonuses)
  const continentDefs = ((): Array<{
    id: string
    name: string
    territories: string[]
    bonusArmies: number
    color?: string
  }> => {
    const cfg = gameState.gameConfig as unknown as {
      sectorBonuses?: Array<{
        id: string
        name: string
        territories: string[]
        bonusArmies: number
        color?: string
      }>
      continentBonuses?: Array<{
        id: string
        name: string
        territories: string[]
        bonusArmies: number
        color?: string
      }>
    } | null
    return cfg?.sectorBonuses ?? cfg?.continentBonuses ?? []
  })()

  if (!continentDefs.length) return []

  const board = gameState.board

  return continentDefs.map((continent) => {
    const continentTerritories = board.filter((t) => continent.territories.includes(t.id))
    const owners = new Set(continentTerritories.map((t) => t.ownerId).filter(Boolean) as string[])

    return {
      ...continent,
      totalTerritories: continentTerritories.length,
      controlledBy: owners.size === 1 ? Array.from(owners)[0] : null,
      partialControl: Array.from(owners).map((ownerId) => ({
        ownerId,
        count: continentTerritories.filter((t) => t.ownerId === ownerId).length,
      })),
    }
  })
})

// Memoized current player's available actions
export const selectAvailableActions = createSelector(
  [selectGameState, selectCurrentPlayerId, selectReinforcementArmies],
  (gameState, currentPlayerId, reinforcementArmies) => {
    if (!gameState || !currentPlayerId || gameState.currentPlayer !== currentPlayerId) {
      return {
        canReinforce: false,
        canAttack: false,
        canFortify: false,
        canEndPhase: false,
      }
    }

    const myTerritories = gameState.board.filter((t) => t.ownerId === currentPlayerId)
    const hasArmiesPlaced = reinforcementArmies === 0
    const hasAttackCapability = myTerritories.some((t) => t.armies > 1)
    const hasFortifyCapability = myTerritories.some((t) => t.armies > 1)

    return {
      canReinforce: gameState.phase === 'reinforcement' && reinforcementArmies > 0,
      canAttack: gameState.phase === 'attack' && hasAttackCapability,
      canFortify: gameState.phase === 'fortify' && hasFortifyCapability,
      canEndPhase:
        (gameState.phase === 'reinforcement' && hasArmiesPlaced) ||
        gameState.phase === 'attack' ||
        gameState.phase === 'fortify',
    }
  },
)

// UI highlight selector for overlays (selected, target, eligible)
export const selectHighlights = createSelector(
  (s: RootState) => s.ui,
  (ui) => ({
    selected: ui.selectedId,
    target: ui.targetId,
    eligible: new Set(ui.eligibleIds),
  }),
)
