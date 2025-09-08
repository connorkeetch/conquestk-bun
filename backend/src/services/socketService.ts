import * as jwt from 'jsonwebtoken'
import type { Server, Socket } from 'socket.io'
import { query } from '../config/database'
import { logger } from '../utils/logger'
import { eloService, type PlayerRating } from './eloService'
import { GameService } from './gameService'
import type { ServerToClientEvents, ClientToServerEvents } from '../types/shared'
import { setupChatHandlers } from '../socket/chatHandlers'
import { DeltaBuilder } from '../types/deltaUpdates'
import { queueService } from './queueService'

interface AuthenticatedSocket extends Socket<ClientToServerEvents, ServerToClientEvents> {
  userId?: string
  username?: string
}

// Error handler wrapper for socket events
function handleSocketError(socket: Socket<ClientToServerEvents, ServerToClientEvents>, eventName: string, error: unknown) {
  // Check if error is an actual Error instance (with Node.js 24+ Error.isError fallback)
  const isActualError = error instanceof Error
  const errorMessage = isActualError ? (error as Error).message : String(error)
  const errorStack = isActualError ? (error as Error).stack : undefined
  
  logger.error(`Socket error in ${eventName}:`, {
    error: errorMessage,
    stack: errorStack,
    isError: isActualError,
    userId: (socket as AuthenticatedSocket).userId,
    socketId: socket.id,
  })

  // Send appropriate error message to client
  const clientErrorMessage = process.env.NODE_ENV === 'production' 
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
  handler: (...args: T) => Promise<void>
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
  const gameService = new GameService()

  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token

    if (!token) {
      return next(new Error('Authentication error'))
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret') as { userId: string; username: string }
      socket.userId = decoded.userId
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

    socket.on('join-room', withErrorHandler(socket, 'join-room', async (roomId: string) => {
      if (!roomId || typeof roomId !== 'string') {
        throw new Error('Invalid room ID')
      }
      
      await socket.join(roomId)
      socket.to(roomId).emit('player-joined', {
        userId: socket.userId!,
        socketId: socket.id,
      })
      logger.info(`User ${socket.userId} joined room ${roomId}`)
    }))

    socket.on('leave-room', withErrorHandler(socket, 'leave-room', async (roomId: string) => {
      if (!roomId || typeof roomId !== 'string') {
        throw new Error('Invalid room ID')
      }
      
      await socket.leave(roomId)
      socket.to(roomId).emit('player-left', {
        userId: socket.userId!,
        socketId: socket.id,
      })
      logger.info(`User ${socket.userId} left room ${roomId}`)
    }))

    socket.on('game-action', withErrorHandler(socket, 'game-action', async (data) => {
      if (!data || !data.roomId || !data.action) {
        throw new Error('Invalid game action data')
      }
      
      // Queue the game action for processing
      const job = await queueService.addGameAction({
        gameId: data.roomId,
        playerId: socket.userId!,
        action: data.action,
        socketId: socket.id,
      })
      
      if (job) {
        logger.info(`Queued game action: ${data.action.type} for game ${data.roomId}`, {
          jobId: job.id,
          playerId: socket.userId!,
        })
      } else {
        logger.info(`Processed game action directly (no queue): ${data.action.type} for game ${data.roomId}`, {
          playerId: socket.userId!,
        })
      }
    }))

    // Deployment phase - migrated to use queue system
    socket.on('deployArmies', withErrorHandler(socket, 'deployArmies', async (data) => {
      if (!data || !data.roomId || !data.territoryId || typeof data.armies !== 'number') {
        throw new Error('Invalid deployment data')
      }
      
      // Queue the place armies action
      const job = await queueService.addGameAction({
        gameId: data.roomId,
        playerId: socket.userId!,
        action: {
          type: 'deploy',
          roomId: data.roomId,
          playerId: socket.userId!,
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
    }))

    // Attack phase - migrated to use queue system
    socket.on('attack', withErrorHandler(socket, 'attack', async (data) => {
      if (!data || !data.roomId || !data.fromTerritoryId || !data.toTerritoryId) {
        throw new Error('Invalid attack data')
      }
      
      // Queue the attack action - battle simulation will be handled in background
      const job = await queueService.addGameAction({
        gameId: data.roomId,
        playerId: socket.userId!,
        action: {
          type: 'attack',
          roomId: data.roomId,
          playerId: socket.userId!,
          payload: {
            fromTerritory: data.fromTerritoryId,
            toTerritory: data.toTerritoryId,
            armies: (data as any).armies || 1,
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
    }))

    // Capital warning check
    socket.on('checkCapitalAttack', withErrorHandler(socket, 'checkCapitalAttack', async (data) => {
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
    }))

    // Fortification phase
    socket.on('fortify', withErrorHandler(socket, 'fortify', async (data) => {
      if (!data || !data.roomId || !data.fromTerritoryId || !data.toTerritoryId || typeof data.armies !== 'number') {
        throw new Error('Invalid fortification data')
      }
      
      const result = await gameService.fortify(
        data.roomId,
        socket.userId!,
        data.fromTerritoryId,
        data.toTerritoryId,
        data.armies,
      )
      io.to(data.roomId).emit('territoriesFortified', result)
      io.to(data.roomId).emit('game-update', result.gameState)
    }))

    // End turn
    socket.on('endTurn', withErrorHandler(socket, 'endTurn', async (data) => {
      if (!data || !data.roomId) {
        throw new Error('Invalid end turn data')
      }
      
      const result = await gameService.endTurn(data.roomId, socket.userId!)
      
      // Send phase change as delta update
      const phaseDelta = DeltaBuilder.phaseChange(
        data.roomId,
        result.gameState.phase,
        result.gameState.currentPlayer,
        result.gameState.turn,
        result.reinforcementArmies
      )
      io.to(data.roomId).emit('game-delta', phaseDelta)
      
      // Keep legacy event for backward compatibility
      io.to(data.roomId).emit('phaseChanged', {
        phase: result.gameState.phase,
        currentPlayer: result.gameState.currentPlayer,
        turn: result.gameState.turn,
        reinforcementArmies: result.reinforcementArmies,
      })
    }))

    socket.on('chat-message', withErrorHandler(socket, 'chat-message', async (data) => {
      if (!data || !data.roomId || !data.message) {
        throw new Error('Invalid chat message data')
      }
      
      // Sanitize message to prevent XSS
      const sanitizedMessage = data.message.substring(0, 500).replace(/<[^>]*>/g, '')
      
      socket.to(data.roomId).emit('chat-message', {
        userId: socket.userId!,
        message: sanitizedMessage,
        timestamp: new Date().toISOString(),
      })
    }))

    socket.on('disconnect', () => {
      try {
        logger.info(`User ${socket.userId} disconnected`)
        // Notify all rooms this user was in
        socket.rooms.forEach(roomId => {
          if (roomId !== socket.id) {
            socket.to(roomId).emit('player-disconnected', {
              userId: socket.userId!,
              socketId: socket.id,
            })
          }
        })
      } catch (error) {
        logger.error('Disconnect handler error:', error)
      }
    })
  })

  /**
   * Handle ELO rating updates when a ranked game ends
   */
  async function handleRankedGameEnd(io: Server<ClientToServerEvents, ServerToClientEvents>, roomId: string, gameState: any) {
    try {
      // Check if this is a ranked game
      const roomQuery = `SELECT is_ranked FROM game_rooms WHERE id = ?`
      const roomResult = await query(roomQuery, [roomId])

      if (!roomResult.rows[0]?.is_ranked) {
        return // Not a ranked game, no rating updates needed
      }

      // Get all players with their final positions
      const players = gameState.players
      const playerRatings: PlayerRating[] = []

      // Sort players by elimination order and territory count to determine positions
      const sortedPlayers = [...players].sort((a, b) => {
        // Winner (not eliminated) comes first
        if (!a.isEliminated && b.isEliminated) return -1
        if (a.isEliminated && !b.isEliminated) return 1

        // Among eliminated players, more territories = better position
        const aTerritories = gameState.board.filter((t: any) => t.ownerId === a.id).length
        const bTerritories = gameState.board.filter((t: any) => t.ownerId === b.id).length
        return bTerritories - aTerritories
      })

      // Fetch current ratings in bulk (optimized)
      const humanPlayers = sortedPlayers.filter(p => !p.id.startsWith('ai-'))
      if (humanPlayers.length > 0) {
        const playerIds = humanPlayers.map(p => p.id)
        const placeholders = playerIds.map((_, index) => `$${index + 1}`).join(', ')
        
        const bulkUserQuery = `
          SELECT id, skill_rating, total_ranked_games 
          FROM users 
          WHERE id IN (${placeholders})
        `
        const userResults = await query(bulkUserQuery, playerIds)
        
        // Create a map for quick lookup
        const userDataMap = new Map()
        userResults.rows.forEach((row: any) => {
          userDataMap.set(row.id, row)
        })

        // Build player ratings array
        humanPlayers.forEach((player, index) => {
          const userData = userDataMap.get(player.id)
          if (userData) {
            const position = sortedPlayers.findIndex(p => p.id === player.id) + 1
            playerRatings.push({
              userId: player.id,
              currentRating: userData.skill_rating || 1000,
              gamesPlayed: userData.total_ranked_games || 0,
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
        io.to(roomId).emit('ratingUpdate', {
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
        const updateRoomQuery = `
          UPDATE game_rooms 
          SET status = 'finished' 
          WHERE id = ?
        `
        await query(updateRoomQuery, [roomId])

        logger.info(`Ranked game ${roomId} completed, ELO ratings updated`)
      }
    } catch (error) {
      logger.error('Error handling ranked game end:', error)
    }
  }
}
