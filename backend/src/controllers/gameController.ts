import type { Request, Response } from 'express'
import { GameLifecycleService } from '../services/gameLifecycleService'
import { type CreateRoomData, GameRoomService } from '../services/gameRoomService'
import { GameService } from '../services/gameService'
import type { AuthenticatedRequest } from '../types/express'
import { logger } from '../utils/logger'

export class GameController {
  private gameRoomService = new GameRoomService()
  private lifecycleService = new GameLifecycleService()
  private gameService = new GameService()

  getRooms = async (_req: Request, res: Response) => {
    try {
      const rooms = await this.gameRoomService.getActiveRooms()
      return res.json({ rooms })
    } catch (error) {
      logger.error('Get rooms error:', error)
      return res.status(500).json({ message: 'Internal server error' })
    }
  }

  createRoom = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        name,
        maxPlayers,
        isPrivate,
        mapId,
        gameMode,
        teamMode,
        numberOfTeams,
        allowTeamPlay,
      } = req.body as CreateRoomRequestBody
      const hostId = req.userId

      if (!hostId) {
        return res.status(401).json({ message: 'Authentication required' })
      }

      const parsedNumberOfTeams =
        typeof numberOfTeams === 'number'
          ? numberOfTeams
          : typeof numberOfTeams === 'string'
            ? Number.parseInt(numberOfTeams, 10)
            : undefined

      let normalizedTeamMode: 'none' | 'teams' | 'auto_balance'
      if (teamMode === 'teams' || teamMode === 'auto_balance' || teamMode === 'none') {
        normalizedTeamMode = teamMode
      } else if (teamMode === true) {
        normalizedTeamMode = 'teams'
      } else if (teamMode === false) {
        normalizedTeamMode = 'none'
      } else if (
        allowTeamPlay ||
        (typeof parsedNumberOfTeams === 'number' && parsedNumberOfTeams > 0)
      ) {
        normalizedTeamMode = 'teams'
      } else {
        normalizedTeamMode = 'none'
      }

      const roomData: CreateRoomData = {
        name,
        hostId,
        maxPlayers: maxPlayers || 6,
        isPrivate: isPrivate || false,
        mapId: mapId ?? undefined,
        gameMode: gameMode || 'classic',
        allowTeamPlay:
          allowTeamPlay === undefined ? normalizedTeamMode !== 'none' : Boolean(allowTeamPlay),
        teamMode: normalizedTeamMode,
        numberOfTeams:
          typeof parsedNumberOfTeams === 'number' && !Number.isNaN(parsedNumberOfTeams)
            ? parsedNumberOfTeams
            : undefined,
      }

      const room = await this.gameRoomService.createRoom(roomData)

      // Ensure host is part of the room immediately after creation
      try {
        await this.gameRoomService.joinRoom(room.id, hostId)
      } catch (joinError) {
        logger.warn('Host auto-join failed after room creation', {
          roomId: room.id,
          hostId,
          error: joinError instanceof Error ? joinError.message : joinError,
        })
      }

      await this.lifecycleService.refreshLifecycle(room.id)

      return res.status(201).json({ room })
    } catch (error) {
      logger.error('Create room error:', error)

      // Return validation errors with appropriate status code
      if (
        error instanceof Error &&
        (error.message.includes('teams is not valid') ||
          error.message.includes('Invalid number of teams') ||
          error.message.includes('Ranked games') ||
          error.message.includes('Team play'))
      ) {
        return res.status(400).json({ message: error.message })
      }

      return res.status(500).json({ message: 'Internal server error' })
    }
  }

  updateTeamAssignment = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { roomId } = req.params
      const hostId = req.userId
      const { playerId, teamId } = req.body as {
        playerId?: string
        teamId?: number | string | null
      }

      if (!hostId) {
        return res.status(401).json({ message: 'Authentication required' })
      }

      if (!playerId) {
        return res.status(400).json({ message: 'playerId is required' })
      }

      const parsedTeamId =
        teamId === null || teamId === undefined
          ? null
          : typeof teamId === 'number'
            ? teamId
            : Number.parseInt(teamId, 10)

      if (parsedTeamId !== null && Number.isNaN(parsedTeamId)) {
        return res.status(400).json({ message: 'teamId must be a number or null' })
      }

      const room = await this.gameRoomService.assignPlayerToTeam(
        roomId,
        hostId,
        playerId,
        parsedTeamId,
      )

      await this.lifecycleService.refreshLifecycle(roomId)

      return res.json({ room })
    } catch (error) {
      logger.error('Update team assignment error:', error)

      if (error instanceof Error) {
        if (error.message === 'Room not found' || error.message.includes('not part')) {
          return res.status(404).json({ message: error.message })
        }

        if (
          error.message.includes('Only the host') ||
          error.message.includes('Team play') ||
          error.message.includes('Team must be') ||
          error.message.includes('Team identifier')
        ) {
          return res.status(400).json({ message: error.message })
        }
      }

      return res.status(500).json({ message: 'Internal server error' })
    }
  }

  setReadyState = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { roomId } = req.params
      const userId = req.userId
      const { ready } = req.body as { ready?: boolean }

      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' })
      }

      if (typeof ready !== 'boolean') {
        return res.status(400).json({ message: 'Ready flag must be provided' })
      }

      const lifecycle = await this.lifecycleService.setReadyState(roomId, userId, ready)

      return res.json({ lifecycle })
    } catch (error) {
      logger.error('Set ready state error:', error)

      if (error instanceof Error && error.message === 'Game already started') {
        return res.status(409).json({ message: error.message })
      }

      if (error instanceof Error && error.message === 'Player is not part of the room') {
        return res.status(403).json({ message: error.message })
      }

      if (error instanceof Error && error.message === 'Room not found') {
        return res.status(404).json({ message: error.message })
      }

      return res.status(500).json({ message: 'Internal server error' })
    }
  }

  joinRoom = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { roomId } = req.params
      const userId = req.userId

      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' })
      }

      const result = await this.gameRoomService.joinRoom(roomId, userId)
      const room = await this.gameRoomService.getRoomById(roomId)
      await this.lifecycleService.refreshLifecycle(roomId)
      return res.json({ ...result, room })
    } catch (error) {
      logger.error('Join room error:', error)
      return res.status(500).json({ message: 'Internal server error' })
    }
  }

  leaveRoom = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { roomId } = req.params
      const userId = req.userId

      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' })
      }

      await this.gameRoomService.leaveRoom(roomId, userId)
      await this.lifecycleService.refreshLifecycle(roomId)
      return res.json({ message: 'Left room successfully' })
    } catch (error) {
      logger.error('Leave room error:', error)
      return res.status(500).json({ message: 'Internal server error' })
    }
  }

  getRoomDetails = async (req: Request, res: Response) => {
    try {
      const { roomId } = req.params
      const room = await this.gameRoomService.getRoomById(roomId)

      if (!room) {
        return res.status(404).json({ message: 'Room not found' })
      }

      return res.json({ room })
    } catch (error) {
      logger.error('Get room details error:', error)
      return res.status(500).json({ message: 'Internal server error' })
    }
  }

  getRoomState = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { roomId } = req.params
      const userId = req.userId

      if (!roomId) {
        return res.status(400).json({ message: 'Room ID is required' })
      }

      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' })
      }

      const room = await this.gameRoomService.getRoomById(roomId)
      if (!room) {
        return res.status(404).json({ message: 'Room not found' })
      }

      const spectateParam = req.query?.spectate
      const wantsSpectate = Array.isArray(spectateParam)
        ? spectateParam.includes('true')
        : spectateParam === 'true'
      const isAdminSpectator = Boolean(req.user?.isAdmin && wantsSpectate)

      const isParticipant =
        room.hostId === userId || (await this.gameRoomService.isPlayerInRoom(roomId, userId))
      if (!isParticipant && !isAdminSpectator) {
        return res.status(403).json({ message: 'You are not part of this room' })
      }

      const gameState = await this.gameService.getGameState(roomId)
      if (!gameState) {
        return res.status(404).json({ message: 'Game state not initialized yet' })
      }

      return res.json({ game: gameState })
    } catch (error) {
      logger.error('Get room state error:', error)
      return res.status(500).json({ message: 'Internal server error' })
    }
  }

  getMyGames = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId

      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' })
      }

      // Get user's games from the service
      const games = await this.gameRoomService.getUserGames(userId)

      // Format games for the frontend
      const formattedGames = games.map((game) => ({
        id: game.id,
        name: game.name,
        status: game.status || (game.gameStarted ? 'active' : 'lobby'),
        playerCount: game.playerCount || game.players?.length || 0,
        maxPlayers: game.maxPlayers,
        isYourTurn: game.currentTurnUserId === userId,
        winner: game.winner || null,
        createdAt: game.createdAt,
        updatedAt: game.updatedAt ?? game.createdAt,
      }))

      return res.json({ games: formattedGames })
    } catch (error) {
      logger.error('Get my games error:', error)
      return res.status(500).json({ message: 'Internal server error' })
    }
  }
}
type CreateRoomRequestBody = {
  name: string
  maxPlayers?: number
  isPrivate?: boolean
  mapId?: string | null
  gameMode?: string
  teamMode?: 'none' | 'teams' | 'auto_balance' | boolean
  numberOfTeams?: number | string
  allowTeamPlay?: boolean
}
