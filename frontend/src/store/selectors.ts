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

// Memoized valid targets calculation
// This was previously recalculated on every territory selection
export const selectValidTargets = createSelector(
  [selectGameState, selectSelectedTerritoryId, selectCurrentPlayerId],
  (gameState, selectedTerritoryId, currentPlayerId): string[] => {
    if (!gameState || !selectedTerritoryId || !currentPlayerId) {
      return []
    }

    const selectedTerritory = gameState.board.find((t) => t.id === selectedTerritoryId)
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
          const adjTerritory = gameState.board.find((t) => t.id === adjId)
          return adjTerritory && adjTerritory.ownerId !== currentPlayerId
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
              const adjTerritory = gameState.board.find((t) => t.id === adjId)
              return adjTerritory && adjTerritory.ownerId === currentPlayerId
            })

          case 'path_single':
          case 'path_multi':
            // Any connected territory through owned territories
            return gameState.board
              .filter((t) => t.ownerId === currentPlayerId && t.id !== selectedTerritoryId)
              .filter((t) =>
                isConnectedThroughOwnedTerritories(
                  selectedTerritoryId,
                  t.id,
                  gameState,
                  currentPlayerId,
                ),
              )
              .map((t) => t.id)

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
function isConnectedThroughOwnedTerritories(
  fromId: string,
  toId: string,
  gameState: GameState,
  playerId: string,
): boolean {
  if (fromId === toId) return true

  const ownedTerritories = gameState.board.filter((t) => t.ownerId === playerId)
  const visited = new Set<string>()
  const queue = [fromId]

  while (queue.length > 0) {
    const currentId = queue.shift()
    if (!currentId) continue

    if (currentId === toId) return true
    if (visited.has(currentId)) continue

    visited.add(currentId)

    const currentTerritory = ownedTerritories.find((t) => t.id === currentId)
    if (!currentTerritory) continue

    // Add adjacent owned territories to queue
    for (const adjacentId of currentTerritory.adjacentTerritories) {
      if (!visited.has(adjacentId)) {
        const adjacentTerritory = ownedTerritories.find((t) => t.id === adjacentId)
        if (adjacentTerritory) {
          queue.push(adjacentId)
        }
      }
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

  // Resolve continent definitions from config (supports sectorBonuses or continentBonuses)
  const continentDefs = ((): Array<{
    id: string
    name: string
    territories: string[]
    bonusArmies: number
    color?: string
  }> => {
    const cfg = gameState.gameConfig as unknown as {
      sectorBonuses?: Array<{ id: string; name: string; territories: string[]; bonusArmies: number; color?: string }>
      continentBonuses?: Array<{ id: string; name: string; territories: string[]; bonusArmies: number; color?: string }>
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
  [selectGameState, selectCurrentPlayerId],
  (gameState, currentPlayerId) => {
    if (!gameState || !currentPlayerId || gameState.currentPlayer !== currentPlayerId) {
      return {
        canReinforce: false,
        canAttack: false,
        canFortify: false,
        canEndPhase: false,
      }
    }

    const myTerritories = gameState.board.filter((t) => t.ownerId === currentPlayerId)
    const hasArmiesPlaced = gameState.reinforcementsRemaining === 0
    const hasAttackCapability = myTerritories.some((t) => t.armies > 1)
    const hasFortifyCapability = myTerritories.some((t) => t.armies > 1)

    return {
      canReinforce: gameState.phase === 'reinforcement' && gameState.reinforcementsRemaining > 0,
      canAttack: gameState.phase === 'attack' && hasAttackCapability,
      canFortify: gameState.phase === 'fortify' && hasFortifyCapability,
      canEndPhase:
        (gameState.phase === 'reinforcement' && hasArmiesPlaced) ||
        gameState.phase === 'attack' ||
        gameState.phase === 'fortify',
    }
  },
)
