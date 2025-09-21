import * as jwt from 'jsonwebtoken'
import type { QueryResultRow } from 'pg'
import type { Server, Socket } from 'socket.io'
import { query } from '../config/database'
import { setupChatHandlers } from '../socket/chatHandlers'
import { DeltaBuilder } from '../types/deltaUpdates'
import type { GamePlayer, GameState, SerializedGameState, Territory } from '../types/game'
import type { ClientToServerEvents, ServerToClientEvents } from '../types/shared'
import { logger } from '../utils/logger'
import { eloService, type PlayerRating } from './eloService'
import { GameService } from './gameService'
import { GameRoomService } from './gameRoomService'
import { gameStateCache } from './cacheService'
import { queueService } from './queueService'
import { registerSocketServer } from './socketRegistry'

interface AuthenticatedSocket extends Socket<ClientToServerEvents, ServerToClientEvents> {
  userId?: string
  username?: string
  joinedGameRooms?: Set<string>
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

  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token

    if (!token) {
      return next(new Error('Authentication error'))
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret') as {
        userId: string
        username: string
      }
      socket.userId = decoded.userId
      socket.username = decoded.username
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
    }

    // Setup chat handlers
    setupChatHandlers(io, socket)

    socket.on(
      'join-room',
      withErrorHandler(socket, 'join-room', async (roomId: string) => {
        if (!roomId || typeof roomId !== 'string') {
          throw new Error('Invalid room ID')
        }

        const userId = requireUserId(socket)
        const hasAccess = await gameRoomService.isPlayerInRoom(roomId, userId)
        if (!hasAccess) {
          throw new Error('You are not a member of this game')
        }

        const channel = getGameChannel(roomId)
        await socket.join(channel)

        if (!socket.joinedGameRooms) {
          socket.joinedGameRooms = new Set()
        }
        socket.joinedGameRooms.add(roomId)

        const player = await gameRoomService.getPlayer(roomId, userId)
        const normalizedPlayer = {
          userId: player?.userId ?? userId,
          username: player?.username ?? socket.username ?? 'Unknown player',
          joinedAt: (player?.joinedAt ?? new Date()).toISOString(),
          isReady: Boolean(player?.isReady),
          readyAt: player?.readyAt instanceof Date ? player?.readyAt.toISOString() : null,
        }

        socket.to(channel).emit('player-joined', {
          roomId,
          player: normalizedPlayer,
        })

        const cachedState = await gameStateCache.getGameState<SerializedGameState>(roomId)
        let serializedState = serializeGameStateForClient(cachedState)

        if (!serializedState) {
          const freshState = await gameService.getGameState(roomId)
          serializedState = serializeGameStateForClient(freshState)
        }

        if (serializedState) {
          socket.emit('game-update', serializedState)
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

        const userId = requireUserId(socket)
        const channel = getGameChannel(roomId)

        await socket.leave(channel)
        socket.joinedGameRooms?.delete(roomId)

        socket.to(channel).emit('player-left', {
          roomId,
          playerId: userId,
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
        // Queue the game action for processing
        const job = await queueService.addGameAction({
          gameId: data.roomId,
          playerId: userId,
          action: data.action,
          socketId: socket.id,
        })

        if (job) {
          logger.info(`Queued game action: ${data.action.type} for game ${data.roomId}`, {
            jobId: job.id,
            playerId: userId,
          })
        } else {
          logger.info(
            `Processed game action directly (no queue): ${data.action.type} for game ${data.roomId}`,
            {
              playerId: userId,
            },
          )
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
        // Queue the place armies action
        const job = await queueService.addGameAction({
          gameId: data.roomId,
          playerId: userId,
          action: {
            type: 'deploy',
            roomId: data.roomId,
            playerId: userId,
            payload: {
              territoryId: data.territoryId,
              armies: data.armies,
            },
          },
          socketId: socket.id,
        })

        if (job) {
          logger.info(`Queued army deployment for game ${data.roomId}`, {
            jobId: job.id,
            territoryId: data.territoryId,
            armies: data.armies,
          })
        } else {
          logger.info(`Processed army deployment directly (no queue) for game ${data.roomId}`, {
            territoryId: data.territoryId,
            armies: data.armies,
          })
        }
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
        const armies = typeof data.armies === 'number' ? data.armies : 1
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
          logger.info(`Queued attack for game ${data.roomId}`, {
            jobId: job.id,
            from: data.fromTerritoryId,
            to: data.toTerritoryId,
          })
        } else {
          logger.info(`Processed attack directly (no queue) for game ${data.roomId}`, {
            from: data.fromTerritoryId,
            to: data.toTerritoryId,
          })
        }
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

        // Keep legacy event for backward compatibility
        io.to(channel).emit('phaseChanged', {
          phase: result.gameState.phase,
          currentPlayer: result.gameState.currentPlayer,
          turn: result.gameState.turn,
          reinforcementArmies: result.reinforcementArmies,
        })
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

    socket.on('disconnect', () => {
      try {
        const userId = socket.userId
        if (!userId) {
          return
        }

        logger.info(`User ${userId} disconnected`)
        const gameRooms = socket.joinedGameRooms ?? new Set<string>()

        gameRooms.forEach((roomId) => {
          const channel = getGameChannel(roomId)
          socket.to(channel).emit('player-disconnected', {
            roomId,
            playerId: userId,
            socketId: socket.id,
          })
        })

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

        // Update room status to finished
        await query(
          `
          UPDATE game_rooms 
          SET status = 'finished' 
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
