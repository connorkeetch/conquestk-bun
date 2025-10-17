import type { BattleResultDelta, GameDelta } from '@conquestk/shared'
import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit'
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
    ...(result.capitalElimination ? { capitalElimination: result.capitalElimination } : {}),
    ...(typeof result.gameEnded === 'boolean' ? { gameEnded: result.gameEnded } : {}),
    ...(result.gameState ? { gameState: result.gameState as GameState } : {}),
    ...(typeof result.attackerId === 'string' ? { attackerId: result.attackerId } : {}),
  }
}

export interface GameResultState {
  winnerIds: string[]
  eliminatedPlayerIds: string[]
  endedAt: string | null
}

type GameResultSource = {
  winnerId?: string | null
  eliminatedIds?: string[] | null
  endedAt?: string | Date | null
}

const toIsoString = (value: string | Date | null | undefined): string | null => {
  if (!value) return null
  if (typeof value === 'string') return value
  try {
    return value.toISOString()
  } catch (error) {
    logger.warn('Failed to normalise end timestamp to ISO string', { value, error })
    return null
  }
}

const canonicalizePlayerIdentifier = (rawId: string, players?: GameState['players']): string => {
  const trimmed = rawId?.trim?.() ?? ''
  if (!trimmed || !Array.isArray(players)) {
    return trimmed
  }
  const match = players.find(
    (player) =>
      player.id === trimmed || (typeof player.userId === 'string' && player.userId === trimmed),
  )
  return match ? match.id : trimmed
}

const buildIdentifierSet = (
  values: string[] | null | undefined,
  players?: GameState['players'],
): Set<string> => {
  const set = new Set<string>()
  if (!Array.isArray(values)) return set
  for (const value of values) {
    if (typeof value !== 'string') continue
    const canonical = canonicalizePlayerIdentifier(value, players)
    if (canonical) set.add(canonical)
  }
  return set
}

const computeWinnerIdsFromPlayers = (
  players: GameState['players'] | undefined,
  eliminated: Set<string>,
): string[] => {
  if (!Array.isArray(players) || players.length === 0) {
    return []
  }
  return players.filter((player) => !eliminated.has(player.id)).map((player) => player.id)
}

const isGameComplete = (game: GameState | null): boolean => {
  if (!game) return false
  if (game.phase === 'finished') return true
  const status = (game as GameState & { status?: string }).status
  return status === 'completed'
}

const mergeGameResult = (
  game: GameState | null,
  previous: GameResultState | null,
  source?: GameResultSource,
): GameResultState | null => {
  const players = game?.players
  const winnerSet = buildIdentifierSet(previous?.winnerIds, players)
  const eliminatedSet = buildIdentifierSet(previous?.eliminatedPlayerIds, players)

  const candidateWinnerIds: Array<string | undefined> = []
  const candidateEliminatedIds: string[] = []
  const candidateEndedAt: Array<string | null> = []

  if (game) {
    const gameWinner =
      typeof (game as GameState & { winner?: unknown }).winner === 'string'
        ? ((game as GameState & { winner?: string }).winner ?? '')
        : ''
    if (gameWinner) {
      candidateWinnerIds.push(gameWinner)
    }
    candidateEndedAt.push(
      toIsoString(
        (game as GameState & { endedAt?: unknown }).endedAt as string | Date | null | undefined,
      ),
    )
    if (isGameComplete(game)) {
      candidateEliminatedIds.push(
        ...game.players
          .filter((player) => player.isEliminated)
          .map((player) => player.id)
          .filter((value) => typeof value === 'string'),
      )
    }
  }

  if (source?.winnerId) {
    candidateWinnerIds.push(source.winnerId)
  }
  if (Array.isArray(source?.eliminatedIds)) {
    candidateEliminatedIds.push(...source.eliminatedIds)
  }

  candidateEndedAt.push(toIsoString(source?.endedAt))
  candidateEndedAt.push(previous?.endedAt ?? null)

  for (const winnerId of candidateWinnerIds) {
    if (typeof winnerId !== 'string') continue
    const canonical = canonicalizePlayerIdentifier(winnerId, players)
    if (canonical) {
      winnerSet.add(canonical)
    }
  }
  for (const eliminatedId of candidateEliminatedIds) {
    if (typeof eliminatedId !== 'string') continue
    const canonical = canonicalizePlayerIdentifier(eliminatedId, players)
    if (canonical) {
      eliminatedSet.add(canonical)
    }
  }

  if (game && isGameComplete(game)) {
    const derivedWinners = computeWinnerIdsFromPlayers(game.players, eliminatedSet)
    for (const value of derivedWinners) {
      if (value) {
        winnerSet.add(value)
      }
    }
  }

  const nextWinnerIds = Array.from(winnerSet)
  const nextEliminatedIds = Array.from(eliminatedSet)
  const resolvedEndedAt =
    candidateEndedAt.find((value) => typeof value === 'string' && value.length > 0) ?? null

  if (nextWinnerIds.length === 0 && nextEliminatedIds.length === 0 && !resolvedEndedAt) {
    return previous
  }

  const arraysEqual = (a: string[], b: string[]) =>
    a.length === b.length && a.every((value, index) => value === b[index])

  if (
    previous &&
    arraysEqual(previous.winnerIds, nextWinnerIds) &&
    arraysEqual(previous.eliminatedPlayerIds, nextEliminatedIds) &&
    previous.endedAt === resolvedEndedAt
  ) {
    return previous
  }

  return {
    winnerIds: nextWinnerIds,
    eliminatedPlayerIds: nextEliminatedIds,
    endedAt: resolvedEndedAt,
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
  gameResult: GameResultState | null
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
  gameResult: null,
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
    const opts =
      typeof allowSpectate === 'boolean' ? ({ allowSpectate } as { allowSpectate?: boolean }) : {}
    const game = await gameService.getGameState(roomId, opts)
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
      state.gameResult = mergeGameResult(state.currentGame, null)
    },
    updateGameState: (state, action: PayloadAction<Partial<GameState>>) => {
      if (state.currentGame) {
        state.currentGame = { ...state.currentGame, ...action.payload }
        state.reinforcementArmies = computeReinforcementArmies(state.currentGame)
        state.gameResult = mergeGameResult(state.currentGame, state.gameResult)
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
      state.gameResult = null
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

      const incomingVersion = delta.version
      const currentVersion =
        typeof state.currentGame.version === 'number' ? state.currentGame.version : undefined

      if (incomingVersion !== undefined && currentVersion !== undefined) {
        if (incomingVersion < currentVersion) {
          logger.debug('Ignoring stale delta version', {
            currentVersion,
            incomingVersion,
            deltaType: delta.type,
          })
          return
        }

        if (incomingVersion === currentVersion) {
          logger.debug('Processing repeated delta version', {
            version: incomingVersion,
            deltaType: delta.type,
          })
        }

        if (incomingVersion > currentVersion + 1) {
          logger.warn('[Desync detected] Version gap - triggering resync:', {
            clientVersion: currentVersion,
            serverVersion: incomingVersion,
            deltaType: delta.type,
          })
          state.needsResync = true
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

          case 'FORTIFY_RESULT': {
            // Mark the source territory as having moved this fortify phase so the UI can reflect count/limits
            if (state.currentGame) {
              if (!state.currentGame.movementTracking) state.currentGame.movementTracking = {}
              const fromId = (incoming as unknown as { fromTerritoryId?: string }).fromTerritoryId
              if (typeof fromId === 'string' && fromId.length > 0) {
                state.currentGame.movementTracking[fromId] = true
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
              // Reset per-fortify movement tracking at the start of fortify (and when leaving prior turn)
              if (incoming.phase === 'fortify' || incoming.phase === 'reinforcement') {
                state.currentGame.movementTracking = {}
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

            const eliminatedFromBattle = Array.isArray(incoming.battleResult.eliminatedPlayers)
              ? incoming.battleResult.eliminatedPlayers
              : undefined

            if (
              incoming.battleResult.gameEnded ||
              typeof incoming.battleResult.winner === 'string' ||
              (eliminatedFromBattle && eliminatedFromBattle.length > 0)
            ) {
              state.gameResult = mergeGameResult(state.currentGame, state.gameResult, {
                winnerId:
                  typeof incoming.battleResult.winner === 'string'
                    ? incoming.battleResult.winner
                    : undefined,
                eliminatedIds: eliminatedFromBattle,
              })

              if (state.currentGame && incoming.battleResult.gameEnded) {
                state.currentGame.phase = 'finished'
                const canonicalWinner =
                  typeof incoming.battleResult.winner === 'string'
                    ? canonicalizePlayerIdentifier(
                        incoming.battleResult.winner,
                        state.currentGame.players,
                      )
                    : null
                if (canonicalWinner) {
                  ;(state.currentGame as GameState & { winner?: string }).winner = canonicalWinner
                  state.currentGame.currentPlayer = canonicalWinner
                }
                ;(state.currentGame as GameState & { status?: string }).status = 'completed'
              }
            }

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
              const canonicalWinner = canonicalizePlayerIdentifier(
                incoming.winner,
                state.currentGame.players,
              )
              ;(state.currentGame as GameState & { winner?: string }).winner = canonicalWinner
              ;(state.currentGame as GameState & { status?: string }).status = 'completed'
              if (canonicalWinner) {
                state.currentGame.currentPlayer = canonicalWinner
              }
            }
            state.gameResult = mergeGameResult(state.currentGame, state.gameResult, {
              winnerId: incoming.winner,
              eliminatedIds: incoming.eliminatedPlayers,
            })
            break
          }

          default:
            break
        }
      }

      applyDeltaToState(delta)

      // Update client version after applying delta
      if (delta.version !== undefined && state.currentGame) {
        const recordedVersion =
          typeof state.currentGame.version === 'number' ? state.currentGame.version : undefined
        if (recordedVersion === undefined || delta.version > recordedVersion) {
          state.currentGame.version = delta.version
        }
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
        state.gameResult = mergeGameResult(state.currentGame, null)
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
