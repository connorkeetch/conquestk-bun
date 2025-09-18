import type { Request, Response } from 'express'
import { type CreateRoomData, GameRoomService } from '../services/gameRoomService'
import { logger } from '../utils/logger'
import type { AuthenticatedRequest } from '../types/express'

export class GameController {
  private gameRoomService = new GameRoomService()

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
      } = req.body
      const hostId = req.userId

      if (!hostId) {
        return res.status(401).json({ message: 'Authentication required' })
      }

      const roomData: CreateRoomData = {
        name,
        hostId,
        maxPlayers: maxPlayers || 6,
        isPrivate: isPrivate || false,
        mapId: mapId || null,
        gameMode: gameMode || 'classic',
        teamMode: teamMode || false,
        numberOfTeams: numberOfTeams || undefined,
      }

      const room = await this.gameRoomService.createRoom(roomData)

      return res.status(201).json({ room })
    } catch (error: any) {
      logger.error('Create room error:', error)

      // Return validation errors with appropriate status code
      if (
        error instanceof Error &&
        (error.message.includes('teams is not valid') ||
          error.message.includes('Invalid number of teams') ||
          error.message.includes('Ranked games'))
      ) {
        return res.status(400).json({ message: error.message })
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
      return res.json(result)
    } catch (error: any) {
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
      return res.json({ message: 'Left room successfully' })
    } catch (error: any) {
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
    } catch (error: any) {
      logger.error('Get room details error:', error)
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
        status: game.status || (game.gameStarted ? 'active' : 'waiting'),
        playerCount: game.playerCount || game.players?.length || 0,
        maxPlayers: game.maxPlayers,
        isYourTurn: game.currentTurnUserId === userId,
        winner: game.winner || null,
        createdAt: game.createdAt,
      }))

      return res.json({ games: formattedGames })
    } catch (error: any) {
      logger.error('Get my games error:', error)
      return res.status(500).json({ message: 'Internal server error' })
    }
  }
}
