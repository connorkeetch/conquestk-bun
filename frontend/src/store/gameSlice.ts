import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { BattleResultDelta, GameDelta } from '@shared/types'
import { gameService } from '../services/gameService'
import type { BattleResult, GameState } from '../types/game'
import { logger } from '../utils/logger'
import { isFriendlyTerritoryOwner } from '../utils/teamHelpers'

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
    const currentId = queue.shift()
    if (!currentId) {
      continue
    }

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
      return isFriendlyTerritoryOwner(gameState, selectedTerritory.ownerId, currentPlayerId)
        ? [selectedTerritoryId]
        : []

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

const adaptBattleResult = (
  result: BattleResultDelta['battleResult'],
  gameState: GameState,
): BattleResult => {
  const fromDetails = gameState.board.find((territory) => territory.id === result.fromTerritory.id)
  const toDetails = gameState.board.find((territory) => territory.id === result.toTerritory.id)

  return {
    attackerId: result.attackerId,
    defenderId: result.defenderId ?? null,
    attackerDice: result.attackerDice,
    defenderDice: result.defenderDice,
    attackerLosses: result.attackerLosses,
    defenderLosses: result.defenderLosses,
    conquered: result.conquered,
    pendingConquestFor:
      typeof result.pendingConquestFor === 'string' ? result.pendingConquestFor : null,
    fromTerritory: {
      id: result.fromTerritory.id,
      name: fromDetails?.name ?? result.fromTerritory.id,
      armies: result.fromTerritory.armies,
      ownerId: fromDetails?.ownerId ?? null,
    },
    toTerritory: {
      id: result.toTerritory.id,
      name: toDetails?.name ?? result.toTerritory.id,
      armies: result.toTerritory.armies,
      ownerId: toDetails?.ownerId ?? result.toTerritory.ownerId ?? null,
    },
    capitalElimination: result.capitalElimination,
    gameEnded: result.gameEnded,
    gameState: result.gameState as GameState | undefined,
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
  battleResult: BattleResult | null
  reinforcementArmies: number
  conquestTransfer: {
    fromTerritoryId: string
    toTerritoryId: string
    availableArmies: number
  } | null
  needsResync: boolean
}

const initialState: GameSliceState = {
  currentGame: null,
  isLoading: false,
  error: null,
  selectedTerritory: null,
  selectedTargetTerritory: null,
  needsResync: false,
  validTargets: [],
  pendingAction: null,
  territoryActionHistory: [],
  battleResult: null,
  reinforcementArmies: 0,
  conquestTransfer: null,
}

const computeReinforcementArmies = (game: GameState | null): number => {
  if (!game || game.phase !== 'reinforcement') {
    return 0
  }

  const currentPlayer = game.players.find((player) => player.id === game.currentPlayer)
  if (!currentPlayer) {
    return 0
  }

  // Trust server-provided armies - no fallback calculation
  return Math.max(0, Math.trunc(currentPlayer.armies ?? 0))
}

export const fetchGameState = createAsyncThunk<
  GameState,
  { roomId: string; allowSpectate?: boolean },
  { rejectValue: string }
>('game/fetchGameState', async ({ roomId, allowSpectate }, { rejectWithValue }) => {
  try {
    const game = await gameService.getGameState(roomId, { allowSpectate })
    return game
  } catch (error) {
    if (typeof error === 'object' && error && 'response' in error) {
      const axiosError = error as {
        response?: { data?: { message?: string }; status?: number }
        message?: string
      }

      if (axiosError.response?.status === 404) {
        return rejectWithValue('NOT_READY')
      }

      const message = axiosError.response?.data?.message || axiosError.message
      return rejectWithValue(message || 'Failed to load game state')
    }

    if (error instanceof Error) {
      return rejectWithValue(error.message)
    }

    return rejectWithValue('Failed to load game state')
  }
})

const gameSlice = createSlice({
  name: 'game',
  initialState,
  reducers: {
    setGameState: (state, action: PayloadAction<GameState>) => {
      state.currentGame = action.payload
      state.reinforcementArmies = computeReinforcementArmies(state.currentGame)
    },
    updateGameState: (state, action: PayloadAction<Partial<GameState>>) => {
      if (state.currentGame) {
        state.currentGame = { ...state.currentGame, ...action.payload }
        state.reinforcementArmies = computeReinforcementArmies(state.currentGame)
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
    setBattleResult: (state, action: PayloadAction<BattleResult | null>) => {
      state.battleResult = action.payload
    },
    setReinforcementArmies: (state, action: PayloadAction<number>) => {
      state.reinforcementArmies = action.payload
    },
    setConquestTransfer: (
      state,
      action: PayloadAction<{
        fromTerritoryId: string
        toTerritoryId: string
        availableArmies: number
      } | null>,
    ) => {
      state.conquestTransfer = action.payload
    },

    // Delta update handlers for efficient real-time updates
    applyDelta: (state, action: PayloadAction<GameDelta>) => {
      const delta = action.payload

      if (!state.currentGame) return

      // Version check for automatic desync detection
      if (delta.version !== undefined && state.currentGame.version !== undefined) {
        // Server version should be exactly currentGame.version + 1
        // If not, we have a desync
        if (delta.version !== state.currentGame.version + 1) {
          logger.warn('[Desync detected] Version mismatch - triggering resync:', {
            clientVersion: state.currentGame.version,
            serverVersion: delta.version,
            deltaType: delta.type,
          })
          // Mark that we need a resync
          state.needsResync = true
          // Don't apply this delta - wait for full resync
          return
        }
      }

      const applyDeltaToState = (incoming: GameDelta): void => {
        switch (incoming.type) {
          case 'TERRITORY_UPDATE': {
            const territory = state.currentGame?.board.find((t) => t.id === incoming.territoryId)
            if (territory) {
              if (incoming.changes.armies !== undefined) {
                territory.armies = incoming.changes.armies
              }
              if (incoming.changes.ownerId !== undefined) {
                territory.ownerId = incoming.changes.ownerId
              }
            }
            break
          }

          case 'PLAYER_UPDATE': {
            const player = state.currentGame?.players.find((p) => p.id === incoming.playerId)
            if (player) {
              if (incoming.changes.armies !== undefined) {
                player.armies = incoming.changes.armies
                if (
                  incoming.playerId === state.currentGame?.currentPlayer &&
                  state.currentGame?.phase === 'reinforcement'
                ) {
                  state.reinforcementArmies = incoming.changes.armies
                }
              }
              if (incoming.changes.territories !== undefined) {
                player.territories = incoming.changes.territories
              }
              if (incoming.changes.isEliminated !== undefined) {
                player.isEliminated = incoming.changes.isEliminated
              }
              if (incoming.changes.mustCashInTreasures !== undefined) {
                // Update per-player cash-in requirement flag (drives Treasure HUD and modal UX)
                ;(player as unknown as { mustCashInTreasures?: boolean }).mustCashInTreasures =
                  incoming.changes.mustCashInTreasures
              }
            }
            break
          }

          case 'PHASE_CHANGE': {
            if (state.currentGame) {
              state.currentGame.phase = incoming.phase
              state.currentGame.currentPlayer = incoming.currentPlayer
              if (incoming.turn !== undefined) {
                state.currentGame.turn = incoming.turn
              }
            }
            if (incoming.reinforcementArmies !== undefined) {
              state.reinforcementArmies = incoming.reinforcementArmies
            } else if (incoming.phase !== 'reinforcement') {
              state.reinforcementArmies = 0
            }
            break
          }

          case 'BATTLE_RESULT': {
            if (state.currentGame) {
              state.battleResult = adaptBattleResult(incoming.battleResult, state.currentGame)
            }
            const nested = (incoming as BattleResultDelta & { changes?: GameDelta[] }).changes
            if (Array.isArray(nested)) {
              for (const change of nested) {
                applyDeltaToState(change as GameDelta)
              }
            }
            break
          }

          case 'GAME_END': {
            if (state.currentGame) {
              state.currentGame.phase = 'finished'
            }
            break
          }

          default:
            break
        }
      }

      applyDeltaToState(delta)

      // Update client version after applying delta
      if (delta.version !== undefined && state.currentGame) {
        state.currentGame.version = delta.version
      }

      // Recalculate valid targets if territory selection is active
      if (state.selectedTerritory && state.currentGame) {
        const territory = state.currentGame.board.find((t) => t.id === state.selectedTerritory)
        const currentPlayer = state.currentGame.players.find(
          (p) => p.id === state.currentGame?.currentPlayer,
        )

        if (territory && currentPlayer) {
          state.validTargets = calculateValidTargets(
            state.currentGame,
            state.selectedTerritory,
            currentPlayer.id,
          )
        }
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchGameState.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchGameState.fulfilled, (state, action) => {
        state.isLoading = false
        const payload = action.payload
        state.currentGame = {
          ...payload,
          roomId: payload.roomId ?? action.meta.arg.roomId,
        }
        if (payload.phase === 'reinforcement') {
          const current = payload.players.find((p) => p.id === payload.currentPlayer)
          state.reinforcementArmies = Math.max(0, current?.armies ?? 0)
        } else {
          state.reinforcementArmies = 0
        }
        // Clear resync flag after successful fetch
        state.needsResync = false
      })
      .addCase(fetchGameState.rejected, (state, action) => {
        state.isLoading = false
        if (action.payload === 'NOT_READY') {
          state.error = null
        } else {
          state.error = action.payload || 'Failed to load game state'
        }
      })
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
  setConquestTransfer,
  applyDelta,
} = gameSlice.actions

export default gameSlice.reducer
