import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { GameState } from '../types/game'
import type { GameDelta } from '../types/deltaUpdates'

// Helper function to check if territories are connected through owned territories
const isConnectedThroughOwnedTerritories = (
  fromId: string,
  toId: string,
  gameState: GameState,
  playerId: string,
): boolean => {
  if (fromId === toId) return true

  const ownedTerritories = gameState.board.filter((t) => t.ownerId === playerId)
  const visited = new Set<string>()
  const queue = [fromId]

  while (queue.length > 0) {
    const currentId = queue.shift()!

    if (currentId === toId) {
      return true
    }

    if (visited.has(currentId)) {
      continue
    }

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

// Helper function to calculate valid targets based on game phase
const calculateValidTargets = (
  gameState: GameState,
  selectedTerritoryId: string,
  currentPlayerId: string,
): string[] => {
  const selectedTerritory = gameState.board.find((t) => t.id === selectedTerritoryId)
  if (!selectedTerritory) return []

  switch (gameState.phase) {
    case 'reinforcement':
      // Can only deploy to own territories
      return selectedTerritory.ownerId === currentPlayerId ? [selectedTerritoryId] : []

    case 'attack':
      // Can attack adjacent territories owned by other players
      if (selectedTerritory.ownerId !== currentPlayerId || selectedTerritory.armies <= 1) {
        return []
      }
      return selectedTerritory.adjacentTerritories.filter((adjId) => {
        const adjTerritory = gameState.board.find((t) => t.id === adjId)
        return adjTerritory && adjTerritory.ownerId !== currentPlayerId
      })

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
}

interface GameSliceState {
  currentGame: GameState | null
  isLoading: boolean
  error: string | null
  selectedTerritory: string | null
  selectedTargetTerritory: string | null
  validTargets: string[]
  pendingAction: 'deploy' | 'attack' | 'fortify' | null
  territoryActionHistory: Array<{
    territoryId: string
    action: string
    timestamp: number
  }>
  battleResult: any | null
  reinforcementArmies: number
}

const initialState: GameSliceState = {
  currentGame: null,
  isLoading: false,
  error: null,
  selectedTerritory: null,
  selectedTargetTerritory: null,
  validTargets: [],
  pendingAction: null,
  territoryActionHistory: [],
  battleResult: null,
  reinforcementArmies: 0,
}

const gameSlice = createSlice({
  name: 'game',
  initialState,
  reducers: {
    setGameState: (state, action: PayloadAction<GameState>) => {
      state.currentGame = action.payload
    },
    updateGameState: (state, action: PayloadAction<Partial<GameState>>) => {
      if (state.currentGame) {
        state.currentGame = { ...state.currentGame, ...action.payload }
      }
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload
    },
    clearGame: (state) => {
      state.currentGame = null
      state.error = null
      state.selectedTerritory = null
      state.selectedTargetTerritory = null
      state.validTargets = []
      state.pendingAction = null
      state.territoryActionHistory = []
    },
    selectTerritory: (state, action: PayloadAction<string | null>) => {
      state.selectedTerritory = action.payload
      state.selectedTargetTerritory = null

      // Calculate valid targets based on current game phase and selected territory
      if (action.payload && state.currentGame) {
        const territory = state.currentGame.board.find((t) => t.id === action.payload)
        const currentPlayer = state.currentGame.players.find(
          (p) => p.id === state.currentGame?.currentPlayer,
        )

        if (territory && currentPlayer) {
          state.validTargets = calculateValidTargets(
            state.currentGame,
            action.payload,
            currentPlayer.id,
          )
        }
      } else {
        state.validTargets = []
      }
    },
    selectTargetTerritory: (state, action: PayloadAction<string | null>) => {
      state.selectedTargetTerritory = action.payload
    },
    setPendingAction: (state, action: PayloadAction<'deploy' | 'attack' | 'fortify' | null>) => {
      state.pendingAction = action.payload
      if (!action.payload) {
        state.selectedTerritory = null
        state.selectedTargetTerritory = null
        state.validTargets = []
      }
    },
    updateTerritory: (
      state,
      action: PayloadAction<{ territoryId: string; armies?: number; ownerId?: string }>,
    ) => {
      if (state.currentGame) {
        const territory = state.currentGame.board.find((t) => t.id === action.payload.territoryId)
        if (territory) {
          if (action.payload.armies !== undefined) {
            territory.armies = action.payload.armies
          }
          if (action.payload.ownerId !== undefined) {
            territory.ownerId = action.payload.ownerId
          }
        }
      }
    },
    addTerritoryAction: (state, action: PayloadAction<{ territoryId: string; action: string }>) => {
      state.territoryActionHistory.push({
        territoryId: action.payload.territoryId,
        action: action.payload.action,
        timestamp: Date.now(),
      })
      // Keep only last 10 actions
      if (state.territoryActionHistory.length > 10) {
        state.territoryActionHistory = state.territoryActionHistory.slice(-10)
      }
    },
    setValidTargets: (state, action: PayloadAction<string[]>) => {
      state.validTargets = action.payload
    },
    setBattleResult: (state, action: PayloadAction<any | null>) => {
      state.battleResult = action.payload
    },
    setReinforcementArmies: (state, action: PayloadAction<number>) => {
      state.reinforcementArmies = action.payload
    },
    
    // Delta update handlers for efficient real-time updates
    applyDelta: (state, action: PayloadAction<GameDelta>) => {
      const delta = action.payload
      
      if (!state.currentGame) return
      
      switch (delta.type) {
        case 'TERRITORY_UPDATE': {
          const territory = state.currentGame.board.find(t => t.id === delta.territoryId)
          if (territory) {
            if (delta.changes.armies !== undefined) {
              territory.armies = delta.changes.armies
            }
            if (delta.changes.ownerId !== undefined) {
              territory.ownerId = delta.changes.ownerId
            }
          }
          break
        }
        
        case 'PLAYER_UPDATE': {
          const player = state.currentGame.players.find(p => p.id === delta.playerId)
          if (player) {
            if (delta.changes.armies !== undefined) {
              player.armies = delta.changes.armies
            }
            if (delta.changes.territories !== undefined) {
              player.territories = delta.changes.territories
            }
            if (delta.changes.isEliminated !== undefined) {
              player.isEliminated = delta.changes.isEliminated
            }
          }
          break
        }
        
        case 'PHASE_CHANGE': {
          state.currentGame.phase = delta.phase
          state.currentGame.currentPlayer = delta.currentPlayer
          if (delta.turn !== undefined) {
            state.currentGame.turn = delta.turn
          }
          if (delta.reinforcementArmies !== undefined) {
            state.reinforcementArmies = delta.reinforcementArmies
          }
          break
        }
        
        case 'BATTLE_RESULT': {
          state.battleResult = delta.battleResult
          // Territory updates are handled by separate TERRITORY_UPDATE deltas
          break
        }
        
        case 'GAME_END': {
          state.currentGame.phase = 'finished'
          // Winner and elimination details handled separately
          break
        }
      }
      
      // Recalculate valid targets if territory selection is active
      if (state.selectedTerritory && state.currentGame) {
        const territory = state.currentGame.board.find(t => t.id === state.selectedTerritory)
        const currentPlayer = state.currentGame.players.find(p => p.id === state.currentGame?.currentPlayer)
        
        if (territory && currentPlayer) {
          state.validTargets = calculateValidTargets(
            state.currentGame,
            state.selectedTerritory,
            currentPlayer.id
          )
        }
      }
    },
  },
})

export const {
  setGameState,
  updateGameState,
  setLoading,
  setError,
  clearGame,
  selectTerritory,
  selectTargetTerritory,
  setPendingAction,
  updateTerritory,
  addTerritoryAction,
  setValidTargets,
  setBattleResult,
  setReinforcementArmies,
  applyDelta,
} = gameSlice.actions

export default gameSlice.reducer
