import * as jwt from 'jsonwebtoken'
import type { QueryResultRow } from 'pg'
import type { Server, Socket } from 'socket.io'
import { query } from '../config/database'
import { setupChatHandlers } from '../socket/chatHandlers'
import { DeltaBuilder } from '../types/deltaUpdates'
import type { GamePlayer, GameState, SerializedGameState, Territory } from '../types/game'
import type { ClientToServerEvents, ServerToClientEvents } from '../types/shared'
import { logger } from '../utils/logger'
import { gameStateCache } from './cacheService'
import { clanService } from './clanService'
import { eloService, type PlayerRating } from './eloService'
import { GameActionProcessor } from './gameActionProcessor'
import { GameRoomService } from './gameRoomService'
import { GameService } from './gameService'
import { queueService } from './queueService'
import { registerSocketServer } from './socketRegistry'

interface AuthenticatedSocket extends Socket<ClientToServerEvents, ServerToClientEvents> {
  userId?: string
  username?: string
  joinedGameRooms?: Set<string>
  joinedClanRoom?: string
}

function requireUserId(socket: AuthenticatedSocket): string {
  if (!socket.userId) {
    throw new Error('User not authenticated')
  }
  return socket.userId
}

function getGameChannel(roomId: string): string {
  return `game:${roomId}`
}

function filterGameStateForPlayer(
  state: GameState | SerializedGameState | null | undefined,
  viewerId: string,
): GameState {
  // Gracefully handle missing state during lobby/initialization
  if (!state) return state as unknown as GameState

  const typedState = state as GameState
  const fogMode = typedState.gameConfig?.fogOfWar ?? 'off'
  const fogEnabled = fogMode !== 'off'

  let filteredState: GameState

  if (!fogEnabled) {
    filteredState = { ...typedState }
  } else {
    const owned = new Set<string>()
    for (const territory of state.board) {
      if (territory.ownerId === viewerId) {
        owned.add(territory.id)
      }
    }

    const visible = new Set<string>(owned)
    for (const territory of state.board) {
      if (!owned.has(territory.id)) {
        continue
      }
      for (const adjacentId of territory.adjacentTerritories) {
        visible.add(adjacentId)
      }
    }

    const filteredBoard = state.board.map((territory) => {
      if (visible.has(territory.id)) {
        return territory
      }
      return {
        ...territory,
        ownerId: null,
        armies: 0,
      }
    })

    filteredState = { ...typedState, board: filteredBoard }
  }

  if (typedState.gameConfig?.gameMode === 'assassination' && typedState.assassinationTargets) {
    const viewerTarget = typedState.assassinationTargets[viewerId]
    filteredState.assassinationTargets = viewerTarget ? { [viewerId]: viewerTarget } : {}
  }

  return filteredState
}

function serializeGameStateForClient(
  state: GameState | SerializedGameState | null | undefined,
): SerializedGameState | null {
  if (!state) {
    return null
  }

  const baseState: SerializedGameState = { ...state } as SerializedGameState
  const territoryModifiers = (state as GameState).territoryModifiers

  if (territoryModifiers instanceof Map) {
    baseState.territoryModifiers = Object.fromEntries(territoryModifiers.entries())
  } else if (territoryModifiers) {
    baseState.territoryModifiers = territoryModifiers as SerializedGameState['territoryModifiers']
  }

  return baseState
}

interface UserRatingRow extends QueryResultRow {
  id: string
  skill_rating: number | null
  total_ranked_games: number | null
}

// Error handler wrapper for socket events
function handleSocketError(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  eventName: string,
  error: unknown,
) {
  // Check if error is an actual Error instance (with Node.js 24+ Error.isError fallback)
  const isActualError = error instanceof Error
  const errorMessage = isActualError ? error.message : String(error)
  const errorStack = isActualError ? error.stack : undefined

  logger.error(`Socket error in ${eventName}:`, {
    error: errorMessage,
    stack: errorStack,
    isError: isActualError,
    userId: (socket as AuthenticatedSocket).userId,
    socketId: socket.id,
  })

  // Send appropriate error message to client
  const clientErrorMessage =
    process.env.NODE_ENV === 'production'
      ? 'An error occurred processing your request'
      : errorMessage

  socket.emit('error', {
    event: eventName,
    message: clientErrorMessage,
    timestamp: new Date().toISOString(),
  })
}

// Wrapper to add error handling to socket event handlers
function withErrorHandler<T extends unknown[]>(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  eventName: string,
  handler: (...args: T) => Promise<void>,
) {
  return async (...args: T) => {
    try {
      await handler(...args)
    } catch (error) {
      handleSocketError(socket, eventName, error)
    }
  }
}

export function setupSocketHandlers(io: Server<ClientToServerEvents, ServerToClientEvents>) {
  registerSocketServer(io)
  const gameService = new GameService()
  const gameRoomService = new GameRoomService()
  const gameActionProcessor = new GameActionProcessor(io)
  const { GameLifecycleService } =
    require('./gameLifecycleService') as typeof import('./gameLifecycleService')
  const lifecycleService = new GameLifecycleService()

  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token

    if (!token) {
      return next(new Error('Authentication error'))
    }

    const jwtSecret = process.env.JWT_SECRET
    if (!jwtSecret) {
      logger.error('FATAL: JWT_SECRET environment variable is not set')
      return next(new Error('Server configuration error'))
    }

    try {
      const decoded = jwt.verify(token, jwtSecret) as {
        userId: string
        username: string
      }
      socket.userId = decoded.userId
      socket.username = decoded.username
      // Mirror userId/username into socket.data for fetchSockets()
      // so RemoteSocket instances can access them via .data
      // Mirror into socket.data in a type-safe way for fetchSockets()
      const sockWithData = socket as unknown as { data?: Record<string, unknown> }
      sockWithData.data = {
        ...(sockWithData.data ?? {}),
        userId: decoded.userId,
        username: decoded.username,
      }
      next()
    } catch (_error) {
      next(new Error('Authentication error'))
    }
  })

  io.on('connection', (socket: AuthenticatedSocket) => {
    logger.info(`User ${socket.userId} connected`)

    // Join user's personal room for DMs
    if (socket.userId) {
      socket.join(`user:${socket.userId}`)

      void (async () => {
        try {
          const membership = await clanService.getActiveMembership(socket.userId as string)
          if (membership?.clanId) {
            const clanRoom = `clan:${membership.clanId}`
            await socket.join(clanRoom)
            socket.joinedClanRoom = clanRoom
          }
        } catch (error) {
          logger.warn('Failed to join clan room for user', {
            userId: socket.userId,
            error: error instanceof Error ? error.message : error,
          })
        }
      })()
    }

    // Setup chat handlers
    setupChatHandlers(io, socket)

    socket.on(
      'join-room',
      withErrorHandler(socket, 'join-room', async (roomId: string) => {
        if (!roomId || typeof roomId !== 'string') {
          throw new Error('Invalid room ID')
        }

        // Allow numeric room code as input
        const normalizedRoomId = /^\d+$/.test(roomId)
          ? await gameRoomService
              .getRoomByCode(Number.parseInt(roomId, 10))
              .then((r) => r?.id ?? '')
          : roomId
        if (!normalizedRoomId) {
          throw new Error('Room not found')
        }

        const userId = requireUserId(socket)
        const hasAccess = await gameRoomService.isPlayerInRoom(normalizedRoomId, userId)
        if (!hasAccess) {
          throw new Error('You are not a member of this game')
        }

        const channel = getGameChannel(normalizedRoomId)
        // Join both the game channel (for game updates) and the room channel (for lifecycle/room updates)
        await socket.join(channel)
        await socket.join(normalizedRoomId)

        if (!socket.joinedGameRooms) {
          socket.joinedGameRooms = new Set()
        }
        socket.joinedGameRooms.add(normalizedRoomId)

        const player = await gameRoomService.getPlayer(normalizedRoomId, userId)
        const isAi = player?.isAi === true
        const normalizedPlayer = {
          id: player?.id ?? player?.userId ?? userId,
          userId: player?.userId ?? userId,
          aiPlayerId: player?.aiPlayerId ?? null,
          username: player?.username ?? socket.username ?? 'Unknown player',
          joinedAt: (player?.joinedAt ?? new Date()).toISOString(),
          isReady: player?.isReady === undefined ? isAi : Boolean(player.isReady),
          readyAt: player?.readyAt instanceof Date ? player.readyAt.toISOString() : null,
          teamId:
            typeof player?.teamId === 'number'
              ? player.teamId
              : player?.teamId === null
                ? null
                : undefined,
          isAi,
          aiDifficulty: player?.aiDifficulty ?? null,
          aiPersonalitySeed:
            typeof player?.aiPersonalitySeed === 'number'
              ? player.aiPersonalitySeed
              : (player?.aiPersonalitySeed ?? null),
          selectedColor:
            typeof player?.selected_color === 'string' && player.selected_color.length > 0
              ? player.selected_color
              : null,
        }

        socket.to(channel).emit('player-joined', {
          roomId: normalizedRoomId,
          player: normalizedPlayer,
        })

        const cachedState = await gameStateCache.getGameState<SerializedGameState>(normalizedRoomId)
        let serializedState = serializeGameStateForClient(cachedState)

        if (!serializedState) {
          const freshState = await gameService.getGameState(normalizedRoomId)
          if (freshState) {
            const filtered = filterGameStateForPlayer(freshState, userId)
            serializedState = serializeGameStateForClient(filtered)
          } else {
            serializedState = null
          }
        }

        if (serializedState) {
          // Apply fog-of-war filtering for the viewer
          const filtered = filterGameStateForPlayer(
            (serializedState as unknown as GameState) ?? null,
            userId,
          )
          const finalState = serializeGameStateForClient(filtered)
          if (finalState) {
            socket.emit('game-update', finalState)
          }
        }

        logger.info(`User ${userId} subscribed to game channel ${channel}`)
      }),
    )

    socket.on(
      'leave-room',
      withErrorHandler(socket, 'leave-room', async (roomId: string) => {
        if (!roomId || typeof roomId !== 'string') {
          throw new Error('Invalid room ID')
        }
        const normalizedRoomId = /^\d+$/.test(roomId)
          ? await gameRoomService
              .getRoomByCode(Number.parseInt(roomId, 10))
              .then((r) => r?.id ?? '')
          : roomId
        if (!normalizedRoomId) {
          throw new Error('Room not found')
        }

        const userId = requireUserId(socket)
        const channel = getGameChannel(normalizedRoomId)

        const player = await gameRoomService.getPlayer(normalizedRoomId, userId).catch(() => null)

        await socket.leave(channel)
        await socket.leave(normalizedRoomId)
        socket.joinedGameRooms?.delete(normalizedRoomId)

        socket.to(channel).emit('player-left', {
          roomId: normalizedRoomId,
          playerSlotId: player?.id ?? userId,
          userId,
          aiPlayerId: player?.aiPlayerId ?? null,
          isAi: player?.isAi === true,
        })
        logger.info(`User ${userId} left game channel ${channel}`)
      }),
    )

    socket.on(
      'game-action',
      withErrorHandler(socket, 'game-action', async (data) => {
        if (!data || !data.roomId || !data.action) {
          throw new Error('Invalid game action data')
        }

        const userId = requireUserId(socket)
        const channel = getGameChannel(data.roomId)
        const normalizedAction = { ...data.action, roomId: data.roomId, playerId: userId }

        // Queue the game action for processing
        const job = await queueService.addGameAction({
          gameId: data.roomId,
          playerId: userId,
          action: normalizedAction,
          socketId: socket.id,
        })

        if (job) {
          logger.info(`Queued game action: ${data.action.type} for game ${data.roomId}`, {
            jobId: job.id,
            playerId: userId,
          })
        } else {
          logger.info(
            `Processed game action directly (no queue): ${normalizedAction.type} for game ${data.roomId}`,
            {
              playerId: userId,
            },
          )

          try {
            const updatedState = await gameService.processGameAction(normalizedAction, userId)
            const serialized = serializeGameStateForClient(updatedState)
            if (serialized) {
              io.to(channel).emit('game-update', serialized)
            }

            if (normalizedAction.type === 'go_back_to_reinforcement') {
              try {
                const currentPlayer = updatedState.players.find((p) => p.id === userId)
                const reinforcementArmies = Math.max(0, currentPlayer?.armies ?? 0)
                const phaseDelta = DeltaBuilder.phaseChange(
                  data.roomId,
                  updatedState.phase,
                  updatedState.currentPlayer,
                  updatedState.turn,
                  reinforcementArmies,
                )
                const { emitFogFilteredDelta } = await import('./fogService')
                await emitFogFilteredDelta(
                  io as unknown as Server,
                  data.roomId,
                  phaseDelta,
                  updatedState,
                )
              } catch (emitError) {
                logger.warn('Failed to emit go-back delta inline', {
                  roomId: data.roomId,
                  error: emitError instanceof Error ? emitError.message : emitError,
                })
              }
            }
          } catch (inlineError) {
            handleSocketError(socket, 'game-action:inline', inlineError)
          }
        }
      }),
    )

    // Deployment phase - migrated to use queue system
    socket.on(
      'deployArmies',
      withErrorHandler(socket, 'deployArmies', async (data) => {
        if (!data || !data.roomId || !data.territoryId || typeof data.armies !== 'number') {
          throw new Error('Invalid deployment data')
        }

        const userId = requireUserId(socket)

        // Authorization check: verify player is in the room
        const hasAccess = await gameRoomService.isPlayerInRoom(data.roomId, userId)
        if (!hasAccess) {
          throw new Error('Unauthorized: You are not a member of this game')
        }

        // Process via unified processor (handles queue vs inline internally)
        await gameActionProcessor.processDeployment(
          data.roomId,
          userId,
          data.territoryId,
          data.armies,
          socket.id,
        )
      }),
    )

    // Attack phase - migrated to use queue system
    socket.on(
      'attack',
      withErrorHandler(socket, 'attack', async (data) => {
        if (!data || !data.roomId || !data.fromTerritoryId || !data.toTerritoryId) {
          throw new Error('Invalid attack data')
        }

        const userId = requireUserId(socket)

        // Authorization check: verify player is in the room
        const hasAccess = await gameRoomService.isPlayerInRoom(data.roomId, userId)
        if (!hasAccess) {
          throw new Error('Unauthorized: You are not a member of this game')
        }

        const armies = typeof data.armies === 'number' ? data.armies : 1

        const processInline = async () => {
          try {
            const state = await gameService.getGameState(data.roomId)
            if (!state) throw new Error('Game state not found')

            if (state.currentPlayer !== userId) throw new Error('Not your turn')
            const from = state.board.find((t) => t.id === data.fromTerritoryId)
            const to = state.board.find((t) => t.id === data.toTerritoryId)
            if (!from || !to) throw new Error('Territory not found')
            if (from.ownerId !== userId) throw new Error('You do not own the attacking territory')
            if (!from.adjacentTerritories.includes(to.id))
              throw new Error('Territories not adjacent')
            if (from.armies <= 1) throw new Error('Not enough armies to attack')

            // Dice count should be based on available armies in the territory (1 must remain)
            const defendingArmies = to.armies ?? 1
            const attackerDiceCount = Math.max(1, Math.min(3, Math.max(0, (from.armies ?? 0) - 1)))
            const defenderDiceCount = Math.min(defendingArmies, 2)
            const roll = (n: number) =>
              Array.from({ length: n }, () => Math.floor(Math.random() * 6) + 1)
            const attackerRolls = roll(attackerDiceCount).sort((a, b) => b - a)
            const defenderRolls = roll(defenderDiceCount).sort((a, b) => b - a)
            let attackerLosses = 0
            let defenderLosses = 0
            for (let i = 0; i < Math.min(attackerRolls.length, defenderRolls.length); i += 1) {
              if (attackerRolls[i] > defenderRolls[i]) defenderLosses += 1
              else attackerLosses += 1
            }

            const newAttackingArmies = Math.max(0, (from.armies ?? 0) - attackerLosses)
            const newDefendingArmies = Math.max(0, (to.armies ?? 0) - defenderLosses)
            const territoryConquered = newDefendingArmies === 0

            const preMoveArmies = Math.max(newAttackingArmies, 0)
            // Default move-on-conquest is 1 (later adjustable via transferConquestArmies)
            const movingArmies = territoryConquered
              ? Math.max(0, Math.min(1, preMoveArmies - 1))
              : 0
            const finalAttackerArmies = territoryConquered
              ? Math.max(preMoveArmies - movingArmies, 1)
              : Math.max(preMoveArmies, 1)
            const finalDefenderArmies = territoryConquered
              ? movingArmies
              : Math.max(newDefendingArmies, 0)

            const attackerOwnerId = from.ownerId ?? userId
            const defenderOwnerId = to.ownerId ?? null

            const deltas = [] as Array<
              | ReturnType<typeof DeltaBuilder.territoryUpdate>
              | ReturnType<typeof DeltaBuilder.playerUpdate>
              | import('@risk-game/shared/types').GameEndDelta
            >

            if (territoryConquered) {
              deltas.push(
                DeltaBuilder.territoryUpdate(data.roomId, data.fromTerritoryId, {
                  armies: finalAttackerArmies,
                }),
              )
              deltas.push(
                DeltaBuilder.territoryUpdate(data.roomId, data.toTerritoryId, {
                  armies: finalDefenderArmies,
                  ownerId: attackerOwnerId,
                }),
              )

              const remainingDefender = state.board.filter(
                (t) => t.ownerId === defenderOwnerId && t.id !== data.toTerritoryId,
              )
              if (defenderOwnerId && remainingDefender.length === 0) {
                deltas.push(
                  DeltaBuilder.playerUpdate(data.roomId, defenderOwnerId, {
                    isEliminated: true,
                    territories: [],
                  }),
                )
              }

              const remainingPlayers = state.players.filter((p) =>
                state.board.some((t) => (t.ownerId ?? null) === p.id),
              )
              if (remainingPlayers.length === 1) {
                deltas.push({
                  type: 'GAME_END',
                  roomId: data.roomId,
                  winner: userId,
                  eliminatedPlayers: state.players
                    .filter((p) => !state.board.some((t) => (t.ownerId ?? null) === p.id))
                    .map((p) => p.id),
                  timestamp: Date.now(),
                } as import('@risk-game/shared/types').GameEndDelta)
              }
            } else {
              deltas.push(
                DeltaBuilder.territoryUpdate(data.roomId, data.fromTerritoryId, {
                  armies: finalAttackerArmies,
                }),
              )
              deltas.push(
                DeltaBuilder.territoryUpdate(data.roomId, data.toTerritoryId, {
                  armies: finalDefenderArmies,
                }),
              )
            }

            const battleDelta: import('@risk-game/shared/types').BattleResultDelta & {
              changes: Array<import('@risk-game/shared/types').GameDelta>
            } = {
              type: 'BATTLE_RESULT',
              roomId: data.roomId,
              timestamp: Date.now(),
              battleResult: {
                attackerId: attackerOwnerId,
                defenderId: defenderOwnerId ?? null,
                attackerLosses,
                defenderLosses,
                attackerDice: attackerRolls,
                defenderDice: defenderRolls,
                fromTerritory: { id: data.fromTerritoryId, armies: finalAttackerArmies },
                toTerritory: {
                  id: data.toTerritoryId,
                  armies: finalDefenderArmies,
                  ownerId: territoryConquered
                    ? attackerOwnerId
                    : (defenderOwnerId ?? attackerOwnerId),
                },
                conquered: territoryConquered,
                pendingConquestFor: territoryConquered ? attackerOwnerId ?? null : null,
              },
              changes: deltas as unknown as Array<import('@risk-game/shared/types').GameDelta>,
            }

            const { emitFogFilteredDelta, emitRevealSnapshot } = await import('./fogService')
            await emitFogFilteredDelta(io, data.roomId, battleDelta)

            await gameService.applyBattleResult(data.roomId, {
              jobId: `inline:${Date.now()}`,
              attackerLosses,
              defenderLosses,
              territoryConquered,
              attackingArmiesRemaining: Math.max(from.armies - attackerLosses, 0),
              defendingArmiesRemaining: Math.max(to.armies - defenderLosses, 0),
              dice: { attacker: attackerRolls, defender: defenderRolls },
              attackingTerritoryId: data.fromTerritoryId,
              defendingTerritoryId: data.toTerritoryId,
              attackingPlayerId: attackerOwnerId,
              defendingPlayerId: defenderOwnerId,
              // Default commit 1 army on conquest; player can adjust afterwards
              attackingArmiesCommitted: 1,
            })

            if (territoryConquered) {
              try {
                const updated = await gameService.getGameState(data.roomId)
                const viewers = new Set<string>()
                if (attackerOwnerId) viewers.add(attackerOwnerId)
                if (defenderOwnerId) viewers.add(defenderOwnerId)
                if (updated?.gameConfig?.allowTeamPlay) {
                  const attackerTeam = updated.players.find((p) => p.id === attackerOwnerId)?.teamId
                  const defenderTeam = updated.players.find((p) => p.id === defenderOwnerId)?.teamId
                  if (attackerTeam && attackerTeam > 0) {
                    updated.players
                      .filter((p) => p.teamId === attackerTeam)
                      .forEach((p) => {
                        viewers.add(p.id)
                      })
                  }
                  if (defenderTeam && defenderTeam > 0) {
                    updated.players
                      .filter((p) => p.teamId === defenderTeam)
                      .forEach((p) => {
                        viewers.add(p.id)
                      })
                  }
                }
                for (const vid of viewers) {
                  await emitRevealSnapshot(io, data.roomId, vid, updated ?? undefined)
                }
              } catch (e) {
                logger.warn('Failed to emit reveal snapshot in inline attack mode', {
                  roomId: data.roomId,
                  error: e instanceof Error ? e.message : e,
                })
              }
            }

            logger.info(`Processed attack inline (no queue) for game ${data.roomId}`, {
              from: data.fromTerritoryId,
              to: data.toTerritoryId,
            })
          } catch (err) {
            handleSocketError(socket, 'attack:inline', err)
          }
        }

        // Queue the attack action - battle simulation will be handled in background
        const job = await queueService.addGameAction({
          gameId: data.roomId,
          playerId: userId,
          action: {
            type: 'attack',
            roomId: data.roomId,
            playerId: userId,
            payload: {
              fromTerritoryId: data.fromTerritoryId,
              toTerritoryId: data.toTerritoryId,
              armies,
            },
          },
          socketId: socket.id,
        })

        if (job) {
          const hasActionWorkers = await queueService.hasActiveWorkers('gameActions')
          const hasBattleWorkers = await queueService.hasActiveWorkers('battleSimulations')
          if (hasActionWorkers && hasBattleWorkers) {
            logger.info(`Queued attack for game ${data.roomId}`, {
              jobId: job.id,
              from: data.fromTerritoryId,
              to: data.toTerritoryId,
            })
            return
          }

          try {
            await job.remove()
          } catch (err) {
            logger.warn('Failed to remove queued attack job for inline fallback', {
              roomId: data.roomId,
              jobId: job.id,
              error: err instanceof Error ? err.message : err,
            })
          }
          logger.warn('Falling back to inline attack processing due to missing workers', {
            roomId: data.roomId,
            actionWorkers: hasActionWorkers,
            battleWorkers: hasBattleWorkers,
          })
        }

        await processInline()
      }),
    )

    // Capital warning check
    socket.on(
      'checkCapitalAttack',
      withErrorHandler(socket, 'checkCapitalAttack', async (data) => {
        const { roomId, targetTerritoryId } = data

        if (!roomId || !targetTerritoryId) {
          throw new Error('Invalid capital check data')
        }

        // Check if target territory is a capital
        // This would need to be implemented in gameService
        const isCapital = await gameService.isCapitalTerritory(roomId, targetTerritoryId)
        socket.emit('capitalAttackCheck', {
          territoryId: targetTerritoryId,
          isCapital,
        })
      }),
    )

    // Transfer armies after conquest (during attack phase)
    socket.on(
      'transferConquestArmies',
      withErrorHandler(socket, 'transferConquestArmies', async (data) => {
        if (
          !data ||
          !data.roomId ||
          !data.fromTerritoryId ||
          !data.toTerritoryId ||
          typeof data.armies !== 'number'
        ) {
          throw new Error('Invalid conquest transfer data')
        }

        const userId = requireUserId(socket)

        // Authorization check: verify player is in the room
        const hasAccess = await gameRoomService.isPlayerInRoom(data.roomId, userId)
        if (!hasAccess) {
          throw new Error('Unauthorized: You are not a member of this game')
        }

        const transferResult = await gameService.transferConquestArmies(
          data.roomId,
          userId,
          data.fromTerritoryId,
          data.toTerritoryId,
          data.armies,
        )

        const serialized = serializeGameStateForClient(transferResult.gameState)
        if (!serialized) {
          throw new Error('Failed to serialize game state')
        }

        // Broadcast updated game state
        const channel = getGameChannel(data.roomId)
        io.to(channel).emit('game-update', serialized)

        // Also send territory deltas for efficient updates
        io.to(channel).emit('game-delta', {
          type: 'TERRITORY_UPDATE',
          roomId: data.roomId,
          territoryId: data.fromTerritoryId,
          changes: { armies: transferResult.fromArmies },
          timestamp: Date.now(),
        })
        io.to(channel).emit('game-delta', {
          type: 'TERRITORY_UPDATE',
          roomId: data.roomId,
          territoryId: data.toTerritoryId,
          changes: { armies: transferResult.toArmies },
          timestamp: Date.now(),
        })
      }),
    )

    // Fortification phase
    socket.on(
      'fortify',
      withErrorHandler(socket, 'fortify', async (data) => {
        if (
          !data ||
          !data.roomId ||
          !data.fromTerritoryId ||
          !data.toTerritoryId ||
          typeof data.armies !== 'number'
        ) {
          throw new Error('Invalid fortification data')
        }

        const userId = requireUserId(socket)

        // Authorization check: verify player is in the room
        const hasAccess = await gameRoomService.isPlayerInRoom(data.roomId, userId)
        if (!hasAccess) {
          throw new Error('Unauthorized: You are not a member of this game')
        }

        const result = await gameService.fortify(
          data.roomId,
          userId,
          data.fromTerritoryId,
          data.toTerritoryId,
          data.armies,
        )
        const channel = getGameChannel(data.roomId)
        io.to(channel).emit('territoriesFortified', result)
        io.to(channel).emit('game-update', result.gameState)
      }),
    )

    // Undo fortify action
    socket.on(
      'undoFortify',
      withErrorHandler(socket, 'undoFortify', async (data) => {
        if (!data || !data.roomId) {
          throw new Error('Invalid undo fortify data')
        }

        const userId = requireUserId(socket)

        // Authorization check: verify player is in the room
        const hasAccess = await gameRoomService.isPlayerInRoom(data.roomId, userId)
        if (!hasAccess) {
          throw new Error('Unauthorized: You are not a member of this game')
        }

        // Queue the undo action
        const job = await queueService.addGameAction({
          gameId: data.roomId,
          playerId: userId,
          action: {
            type: 'undo_fortify',
            roomId: data.roomId,
            playerId: userId,
            payload: undefined,
          },
          socketId: socket.id,
        })

        if (job) {
          logger.info(`Queued undo fortify for game ${data.roomId}`, {
            jobId: job.id,
          })
        } else {
          // Queue disabled/unavailable: execute synchronously
          await gameService.processGameAction(
            {
              type: 'undo_fortify',
              roomId: data.roomId,
              playerId: userId,
              payload: undefined,
            },
            userId,
          )
          const channel = getGameChannel(data.roomId)
          const serialized = await gameStateCache.getGameState<SerializedGameState>(data.roomId)
          if (serialized) {
            io.to(channel).emit('game-update', serialized)
          }
        }
      }),
    )

    // AFK grace: actor can skip or remind
    socket.on(
      'afk:skip',
      withErrorHandler(socket, 'afk:skip', async (data: { roomId: string }) => {
        if (!data || !data.roomId) throw new Error('Invalid AFK skip data')
        const userId = requireUserId(socket)
        // Validate membership
        const hasAccess = await gameRoomService.isPlayerInRoom(data.roomId, userId)
        if (!hasAccess) throw new Error('Not a member of this game')
        await lifecycleService.skipAfkTurn(data.roomId, userId, 'actor')
      }),
    )

    // Player resigns: neutralize their territories and mark eliminated
    socket.on(
      'player:resign',
      withErrorHandler(socket, 'player:resign', async (data: { roomId: string }) => {
        if (!data || !data.roomId) throw new Error('Invalid resign data')
        const userId = requireUserId(socket)
        // Validate membership
        const hasAccess = await gameRoomService.isPlayerInRoom(data.roomId, userId)
        if (!hasAccess) throw new Error('Not a member of this game')

        // Neutralize territories and eliminate player
        await lifecycleService.kickAndNeutralize(data.roomId, userId)

        // Broadcast updated game state
        const channel = getGameChannel(data.roomId)
        const cached = await gameStateCache.getGameState<SerializedGameState>(data.roomId)
        const serialized = serializeGameStateForClient(cached)
        if (serialized) {
          io.to(channel).emit('game-update', serialized)
        }
        // System log message for Game Log panel
        try {
          io.to(channel).emit('game-delta', {
            type: 'SYSTEM_MESSAGE',
            roomId: data.roomId,
            timestamp: Date.now(),
            text: `${socket.username ?? 'A player'} resigned; territories set neutral.`,
            playerId: socket.userId,
          })
        } catch {
          // best-effort: logging may fail or socket registry unavailable
        }
        // Refresh lifecycle snapshot so timers/UI reflect changes
        await lifecycleService.refreshLifecycle(data.roomId)
        logger.info(`User ${userId} resigned from room ${data.roomId}`)
      }),
    )

    // Host replacement decision after a kick (3 strikes)
    socket.on(
      'host:replacement',
      withErrorHandler(
        socket,
        'host:replacement',
        async (data: {
          roomId: string
          targetUserId: string
          choice: 'neutral' | 'ai'
          aiDifficulty?: 'recruit' | 'commander' | 'grandmaster'
        }) => {
          const userId = requireUserId(socket)
          const { roomId, targetUserId, choice, aiDifficulty } = data || {}
          if (!roomId || !targetUserId || !choice) throw new Error('Invalid replacement data')
          const room = await gameRoomService.getRoomById(roomId)
          if (!room) throw new Error('Room not found')
          if (room.hostId !== userId) throw new Error('Only the host can decide replacement')

          const pending = (room as unknown as { replacementPendingUserId?: string | null })
            .replacementPendingUserId
          if (!pending || pending !== targetUserId)
            throw new Error('No pending replacement for user')

          // Clear pending flag first to avoid duplicate decisions
          await query(`UPDATE game_rooms SET replacement_pending_user_id = NULL WHERE id = $1`, [
            roomId,
          ])

          if (choice === 'neutral') {
            await lifecycleService.kickAndNeutralize(roomId, targetUserId)
          } else {
            // Replace with AI at chosen difficulty
            const stateRaw = await (await import('./cacheService')).gameStateCache.getGameState<
              import('../types/game').SerializedGameState
            >(roomId)
            if (!stateRaw) throw new Error('Game state not found')
            const state = { ...stateRaw }
            const idx = state.players.findIndex((p) => p.id === targetUserId)
            if (idx < 0) throw new Error('Player not found in game state')
            state.players[idx] = {
              ...state.players[idx],
              isAi: true,
              aiDifficulty: aiDifficulty ?? 'recruit',
            }
            // Persist to DB + cache for durability
            await gameService.saveSnapshot(
              roomId,
              state as unknown as import('../types/game').SerializedGameState,
            )
            // Persist on room_players for visibility in room state
            await query(
              `UPDATE room_players SET is_ai = TRUE, ai_difficulty = COALESCE($3, 'recruit') WHERE room_id = $1 AND user_id = $2`,
              [roomId, targetUserId, aiDifficulty ?? null],
            )
          }

          // Broadcast lifecycle + game state snapshot for clarity
          await lifecycleService.refreshLifecycle(roomId)
          const freshState = await gameService.getGameState(roomId)
          if (freshState) {
            const filtered = filterGameStateForPlayer(freshState, userId)
            const finalState = serializeGameStateForClient(filtered)
            if (finalState) {
              io.to(getGameChannel(roomId)).emit('game-update', finalState)
            }
          }
        },
      ),
    )
    socket.on(
      'afk:remind',
      withErrorHandler(socket, 'afk:remind', async (data: { roomId: string }) => {
        if (!data || !data.roomId) throw new Error('Invalid AFK remind data')
        const userId = requireUserId(socket)
        // Validate membership
        const hasAccess = await gameRoomService.isPlayerInRoom(data.roomId, userId)
        if (!hasAccess) throw new Error('Not a member of this game')

        // Determine current turn user
        const room = await gameRoomService.getRoomById(data.roomId)
        const targetUserId = room?.currentTurnUserId
        if (!targetUserId) return

        try {
          const { default: notificationService } = await import('./notificationService')
          notificationService
            .notifyTurnStart(data.roomId, targetUserId, 'Your turn — please respond')
            .catch(() => {
              /* noop: notification is best-effort */
            })
        } catch {
          /* ignore optional notification service errors */
        }

        // Also emit an in-app real-time notification
        const ioRef = require('./socketRegistry').tryGetSocketServer() as
          | import('socket.io').Server<
              import('../types/shared').ClientToServerEvents,
              import('../types/shared').ServerToClientEvents
            >
          | null
        if (ioRef) {
          ioRef.to(`user:${targetUserId}`).emit('notification:new', {
            id: `afk-reminder:${Date.now()}`,
            type: 'turn_reminder',
            title: "It's your turn",
            message: 'Another player requested you to act or your turn may be skipped.',
            createdAt: new Date().toISOString(),
            actionUrl: `/room/${data.roomId}`,
            actionLabel: 'Return to game',
            metadata: { roomId: data.roomId },
          })
        }
      }),
    )

    // End turn
    socket.on(
      'endTurn',
      withErrorHandler(socket, 'endTurn', async (data) => {
        if (!data || !data.roomId) {
          throw new Error('Invalid end turn data')
        }

        const userId = requireUserId(socket)
        const result = await gameService.endTurn(data.roomId, userId)

        // Send phase change as delta update
        const phaseDelta = DeltaBuilder.phaseChange(
          data.roomId,
          result.gameState.phase,
          result.gameState.currentPlayer,
          result.gameState.turn,
          result.reinforcementArmies,
        )
        const channel = getGameChannel(data.roomId)
        io.to(channel).emit('game-delta', phaseDelta)

        // If a treasure card was awarded to the previous player, emit explicit delta
        if (result.treasureAwarded) {
          io.to(channel).emit('game-delta', {
            type: 'TREASURE_AWARDED',
            roomId: data.roomId,
            timestamp: Date.now(),
            userId,
            metal: result.treasureAwarded,
          })
        }

        // Keep legacy event for backward compatibility
        io.to(channel).emit('phaseChanged', {
          phase: result.gameState.phase,
          currentPlayer: result.gameState.currentPlayer,
          turn: result.gameState.turn,
          reinforcementArmies: result.reinforcementArmies,
        })

        // Schedule AFK grace start for the next player's timer
        try {
          const { GameRoomService } = await import('./gameRoomService')
          const roomService = new GameRoomService()
          const room = await roomService.getRoomById(data.roomId)
          const seconds = room?.turnTimerSeconds ?? 0
          if (seconds && seconds > 0) {
            // Persist new expiry for UI
            await query(
              `UPDATE game_rooms SET turn_expires_at = NOW() + ($2 * INTERVAL '1 second') WHERE id = $1`,
              [data.roomId, seconds],
            )
            const idKey = `afk:${data.roomId}:turn:${result.gameState.turn}:start:${Date.now()}`
            await queueService.addDelayedGameAction(
              {
                gameId: data.roomId,
                playerId: result.gameState.currentPlayer,
                action: {
                  type: 'end_turn',
                  playerId: result.gameState.currentPlayer,
                  roomId: data.roomId,
                },
                idempotencyKey: idKey,
                afkStage: 'start',
              },
              seconds * 1000,
              { idempotencyKey: idKey, priority: 10 },
            )
          }
        } catch (e) {
          logger.warn('Failed to schedule AFK grace after manual endTurn', {
            roomId: data.roomId,
            error: e instanceof Error ? e.message : e,
          })
        }
      }),
    )

    socket.on(
      'goBackToReinforcement',
      withErrorHandler(socket, 'goBackToReinforcement', async (data) => {
        if (!data || !data.roomId) {
          throw new Error('Invalid go-back data')
        }

        const userId = requireUserId(socket)
        await gameActionProcessor.processGoBack(data.roomId, userId, socket.id)
      }),
    )

    socket.on(
      'chat-message',
      withErrorHandler(socket, 'chat-message', async (data) => {
        if (!data || !data.roomId || !data.message) {
          throw new Error('Invalid chat message data')
        }

        const userId = requireUserId(socket)
        // Sanitize message to prevent XSS
        const sanitizedMessage = data.message.substring(0, 500).replace(/<[^>]*>/g, '')

        const channel = getGameChannel(data.roomId)
        socket.to(channel).emit('chat-message', {
          roomId: data.roomId,
          userId,
          message: sanitizedMessage,
          timestamp: new Date().toISOString(),
        })
      }),
    )

    // Map ping: broadcast a transient ping marker
    socket.on(
      'ping:territory',
      withErrorHandler(
        socket,
        'ping:territory',
        async (data: { roomId: string; territoryId: string }) => {
          if (!data || !data.roomId || !data.territoryId) throw new Error('Invalid ping data')
          const userId = requireUserId(socket)
          const hasAccess = await gameRoomService.isPlayerInRoom(data.roomId, userId)
          if (!hasAccess) throw new Error('Not a member of this game')
          const channel = getGameChannel(data.roomId)
          io.to(channel).emit('ping:territory', {
            roomId: data.roomId,
            territoryId: data.territoryId,
            userId,
            username: socket.username ?? null,
            createdAt: new Date().toISOString(),
          })
        },
      ),
    )

    socket.on('disconnect', async () => {
      try {
        const userId = socket.userId
        if (!userId) {
          return
        }

        logger.info(`User ${userId} disconnected`)
        const gameRooms = socket.joinedGameRooms ?? new Set<string>()

        // Use for...of instead of forEach to properly handle async operations
        for (const roomId of gameRooms) {
          const channel = getGameChannel(roomId)
          socket.to(channel).emit('player-disconnected', {
            roomId,
            playerId: userId,
            socketId: socket.id,
          })
        }

        socket.joinedGameRooms?.clear()
      } catch (error) {
        logger.error('Disconnect handler error:', error)
      }
    })
  })

  /**
   * Handle ELO rating updates when a ranked game ends
   */
  async function _handleRankedGameEnd(
    io: Server<ClientToServerEvents, ServerToClientEvents>,
    roomId: string,
    gameState: SerializedGameState,
  ) {
    try {
      // Check if this is a ranked game
      const roomResult = await query<{ is_ranked: boolean }>(
        `SELECT is_ranked FROM game_rooms WHERE id = $1`,
        [roomId],
      )

      if (!roomResult.rows[0]?.is_ranked) {
        return // Not a ranked game, no rating updates needed
      }

      // Get all players with their final positions
      const players: GamePlayer[] = gameState.players
      const playerRatings: PlayerRating[] = []

      // Sort players by elimination order and territory count to determine positions
      const sortedPlayers = [...players].sort((a, b) => {
        // Winner (not eliminated) comes first
        if (!a.isEliminated && b.isEliminated) return -1
        if (a.isEliminated && !b.isEliminated) return 1

        // Among eliminated players, more territories = better position
        const board: Territory[] = gameState.board
        const aTerritories = board.filter((territory) => territory.ownerId === a.id).length
        const bTerritories = board.filter((territory) => territory.ownerId === b.id).length
        return bTerritories - aTerritories
      })

      // Fetch current ratings in bulk (optimized)
      const humanPlayers = sortedPlayers.filter((p) => !p.id.startsWith('ai-'))
      if (humanPlayers.length > 0) {
        const playerIds = humanPlayers.map((p) => p.id)
        const placeholders = playerIds.map((_, index) => `$${index + 1}`).join(', ')

        const bulkUserQuery = `
          SELECT id, skill_rating, total_ranked_games 
          FROM users 
          WHERE id IN (${placeholders})
        `
        const userResults = await query<UserRatingRow>(bulkUserQuery, playerIds)

        // Create a map for quick lookup
        const userDataMap = new Map<string, UserRatingRow>()
        userResults.rows.forEach((row) => {
          userDataMap.set(row.id, row)
        })

        // Build player ratings array
        humanPlayers.forEach((player, _index) => {
          const userData = userDataMap.get(player.id)
          if (userData) {
            const position = sortedPlayers.findIndex((p) => p.id === player.id) + 1
            playerRatings.push({
              userId: player.id,
              currentRating: userData.skill_rating ?? 1000,
              gamesPlayed: userData.total_ranked_games ?? 0,
              position: position, // Position based on original sorted array
            })
          }
        })
      }

      // Calculate rating changes
      if (playerRatings.length >= 3) {
        const ratingChanges = eloService.calculateRatingChanges(playerRatings)

        // Apply rating changes to database
        await eloService.applyRatingChanges(roomId, ratingChanges)

        // Emit rating updates to all players in the room
        const channel = getGameChannel(roomId)
        io.to(channel).emit('ratingUpdate', {
          changes: ratingChanges.map((change) => ({
            userId: change.userId,
            username: sortedPlayers.find((p) => p.id === change.userId)?.username,
            oldRating: change.oldRating,
            newRating: change.newRating,
            change: change.change,
            tier: eloService.getSkillTier(change.newRating).name,
          })),
        })

        // Update room status to completed
        await query(
          `
          UPDATE game_rooms 
          SET status = 'completed' 
          WHERE id = $1
        `,
          [roomId],
        )

        logger.info(`Ranked game ${roomId} completed, ELO ratings updated`)
      }
    } catch (error) {
      logger.error('Error handling ranked game end:', error)
    }
  }
}
