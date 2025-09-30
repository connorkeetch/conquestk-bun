import type { Request, Response } from 'express'
import { GameLifecycleService } from '../services/gameLifecycleService'
import { type CreateRoomData, GameRoomService } from '../services/gameRoomService'
import { GameService } from '../services/gameService'
import type { AuthenticatedRequest } from '../types/express'
import type { TreasureConfig } from '../types/game'
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
        movementType,
        fogOfWar,
        turnTimerSeconds,
        timeBankSeconds,
        teamMode,
        numberOfTeams,
        allowTeamPlay,
        isRanked,
        aiOpponents,
        treasureConfig,
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

      const normalizedIsRanked = Boolean(isRanked)

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

      const requestedAiOpponents = Array.isArray(aiOpponents) ? aiOpponents : []
      const normalizedAiOpponents: Array<{
        difficulty: 'recruit' | 'commander' | 'grandmaster'
        personalitySeed?: number | null
      }> = []

      if (requestedAiOpponents.length > 0 && !normalizedIsRanked) {
        const allowedDifficulties = new Set(['recruit', 'commander', 'grandmaster'])
        for (const opponent of requestedAiOpponents) {
          if (!opponent || typeof opponent !== 'object') continue
          const rawDifficulty =
            typeof opponent.difficulty === 'string' ? opponent.difficulty.toLowerCase() : null
          if (!rawDifficulty || !allowedDifficulties.has(rawDifficulty)) continue

          let personalitySeed: number | null | undefined
          if (
            typeof opponent.personalitySeed === 'number' &&
            Number.isFinite(opponent.personalitySeed)
          ) {
            personalitySeed = Math.trunc(opponent.personalitySeed)
          }

          normalizedAiOpponents.push({
            difficulty: rawDifficulty as 'recruit' | 'commander' | 'grandmaster',
            personalitySeed: personalitySeed ?? undefined,
          })
        }
      }

      const maxAiSlots = Math.max(0, (maxPlayers || 6) - 1)
      if (normalizedAiOpponents.length > maxAiSlots) {
        normalizedAiOpponents.splice(maxAiSlots)
      }

      const roomData: CreateRoomData = {
        name,
        hostId,
        maxPlayers: maxPlayers || 6,
        isPrivate: isPrivate || false,
        mapId: mapId ?? undefined,
        gameMode: gameMode || 'classic',
        movementType:
          movementType === 'classic_adjacent' ||
          movementType === 'adjacent_multi' ||
          movementType === 'path_single' ||
          movementType === 'path_multi'
            ? movementType
            : undefined,
        fogOfWar:
          fogOfWar === 'off' || fogOfWar === 'adjacent' || fogOfWar === 'persistent'
            ? fogOfWar
            : undefined,
        turnTimerSeconds:
          typeof turnTimerSeconds === 'number' && Number.isFinite(turnTimerSeconds)
            ? Math.max(10, Math.min(86400, Math.trunc(turnTimerSeconds)))
            : undefined,
        timeBankSeconds:
          typeof timeBankSeconds === 'number' && Number.isFinite(timeBankSeconds)
            ? Math.max(0, Math.min(86400, Math.trunc(timeBankSeconds)))
            : undefined,
        allowTeamPlay:
          allowTeamPlay === undefined ? normalizedTeamMode !== 'none' : Boolean(allowTeamPlay),
        teamMode: normalizedTeamMode,
        numberOfTeams:
          typeof parsedNumberOfTeams === 'number' && !Number.isNaN(parsedNumberOfTeams)
            ? parsedNumberOfTeams
            : undefined,
        isRanked: normalizedIsRanked,
        aiOpponents: normalizedAiOpponents,
        treasureConfig,
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

      const hydratedRoom = await this.gameRoomService.getRoomById(room.id)

      return res.status(201).json({ room: hydratedRoom ?? room })
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
      const { roomId: rawRoom } = req.params
      const roomId = await this.gameRoomService.resolveRoomId(rawRoom)
      const hostId = req.userId
      const { playerId, playerSlotId, teamId } = req.body as {
        playerId?: string
        playerSlotId?: string
        teamId?: number | string | null
      }

      if (!hostId) {
        return res.status(401).json({ message: 'Authentication required' })
      }

      const targetIdentifier = playerSlotId ?? playerId

      if (!targetIdentifier) {
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
        targetIdentifier,
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
      const { roomId: rawRoom } = req.params
      const roomId = await this.gameRoomService.resolveRoomId(rawRoom)
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

      if (
        error instanceof Error &&
        (error.message.includes('Selected map failed validation') ||
          error.message.includes('playability validation failed'))
      ) {
        return res.status(400).json({ code: 'MAP_INVALID', message: error.message })
      }

      return res.status(500).json({ message: 'Internal server error' })
    }
  }

  joinRoom = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { roomId: rawRoom } = req.params
      const roomId = await this.gameRoomService.resolveRoomId(rawRoom)
      const userId = req.userId
      const selectedColor =
        typeof (req.body as { selectedColor?: unknown })?.selectedColor === 'string'
          ? ((req.body as { selectedColor?: string }).selectedColor ?? null)
          : null

      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' })
      }

      const result = await this.gameRoomService.joinRoom(roomId, userId, { selectedColor })
      const room = await this.gameRoomService.getRoomById(roomId)
      // Auto-mark ready and trigger start if lobby is full
      try {
        await this.lifecycleService.setReadyState(roomId, userId, true)
      } catch (_err) {
        // Ignore errors such as 'Game already started'
      }
      await this.lifecycleService.refreshLifecycle(roomId)
      return res.json({ ...result, room })
    } catch (error) {
      logger.error('Join room error:', error)
      if (error instanceof Error) {
        if (error.message.includes('Color already taken')) {
          return res.status(409).json({ message: error.message })
        }
        if (error.message.includes('Room is full') || error.message.includes('not accepting')) {
          return res.status(403).json({ message: error.message })
        }
        if (error.message.includes('Room not found')) {
          return res.status(404).json({ message: error.message })
        }
      }
      return res.status(500).json({ message: 'Internal server error' })
    }
  }

  leaveRoom = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { roomId: rawRoom } = req.params
      const roomId = await this.gameRoomService.resolveRoomId(rawRoom)
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

  updateAiOpponents = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { roomId: rawRoom } = req.params
      const roomId = await this.gameRoomService.resolveRoomId(rawRoom)
      const hostId = req.userId

      if (!hostId) {
        return res.status(401).json({ message: 'Authentication required' })
      }

      const { aiOpponents } = req.body as {
        aiOpponents?: Array<{ difficulty?: string; personalitySeed?: number | null }>
      }

      if (!Array.isArray(aiOpponents)) {
        return res.status(400).json({ message: 'aiOpponents must be an array' })
      }

      type NormalizedDifficulty = 'recruit' | 'commander' | 'grandmaster'
      const allowedDifficulties = new Set<NormalizedDifficulty>([
        'recruit',
        'commander',
        'grandmaster',
      ])

      const sanitizedRequest: Array<{
        difficulty: NormalizedDifficulty
        personalitySeed?: number | null
      }> = []

      for (const entry of aiOpponents) {
        if (!entry || typeof entry !== 'object') {
          continue
        }
        const rawDifficulty =
          typeof entry.difficulty === 'string' ? entry.difficulty.toLowerCase() : undefined
        if (!rawDifficulty || !allowedDifficulties.has(rawDifficulty as NormalizedDifficulty)) {
          continue
        }

        let personalitySeed: number | null | undefined
        if (typeof entry.personalitySeed === 'number' && Number.isFinite(entry.personalitySeed)) {
          personalitySeed = Math.trunc(entry.personalitySeed)
        }

        sanitizedRequest.push({
          difficulty: rawDifficulty as NormalizedDifficulty,
          personalitySeed: personalitySeed ?? undefined,
        })
      }

      const room = await this.gameRoomService.updateAiOpponents(roomId, hostId, sanitizedRequest)
      // If lobby is now full, trigger ready-check to auto-start
      try {
        const playerCount = room.players?.length ?? 0
        const required = room.maxPlayers
        if (room.status === 'lobby' && required > 0 && playerCount >= required) {
          await this.lifecycleService.setReadyState(roomId, hostId, true)
        }
      } catch (_err) {
        // Non-fatal; continue to broadcast lifecycle
      }
      await this.lifecycleService.refreshLifecycle(roomId)

      return res.json({ room })
    } catch (error) {
      logger.error('Update AI opponents error:', error)

      if (error instanceof Error) {
        if (error.message === 'Room not found') {
          return res.status(404).json({ message: error.message })
        }
        if (error.message.includes('Only the host')) {
          return res.status(403).json({ message: error.message })
        }
        if (error.message.includes('lobby') || error.message.includes('Ranked games')) {
          return res.status(409).json({ message: error.message })
        }
        if (error.message.includes('Not enough open seats')) {
          return res.status(400).json({ message: error.message })
        }
      }

      return res.status(500).json({ message: 'Internal server error' })
    }
  }

  getRoomDetails = async (req: Request, res: Response) => {
    try {
      const { roomId: rawRoom } = req.params
      const roomId = await this.gameRoomService.resolveRoomId(rawRoom)
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
      const { roomId: rawRoom } = req.params
      const roomId = await this.gameRoomService.resolveRoomId(rawRoom)
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

      let gameState = await this.gameService.getGameState(roomId)
      if (!gameState) {
        // Log helpful context for debugging missing state
        logger.info('Room state request before initialization', {
          roomId,
          userId,
          isParticipant,
          lifecyclePhase: room.lifecyclePhase ?? room.status,
        })
        return res.status(404).json({ message: 'Game state not initialized yet' })
      }

      // Apply Fog of War filtering/masking
      try {
        if (!isAdminSpectator && room.fogOfWar && room.fogOfWar !== 'off') {
          if (!isParticipant) {
            // Non-participants with FoW enabled must not see any ownership or armies
            gameState = {
              ...gameState,
              board: gameState.board.map((t) => ({ ...t, ownerId: null, armies: 0 })),
            }
            logger.info('Applied non-participant FoW masking', { roomId, userId })
          } else {
            // Participants see adjacent visibility around their owned territories
            const owned = new Set<string>(
              gameState.board.filter((t) => t.ownerId === userId).map((t) => t.id),
            )
            const visible = new Set<string>(owned)
            for (const t of gameState.board) {
              if (!owned.has(t.id)) continue
              for (const adj of t.adjacentTerritories) visible.add(adj)
            }
            gameState = {
              ...gameState,
              board: gameState.board.map((t) =>
                visible.has(t.id) ? t : { ...t, ownerId: null, armies: 0 },
              ),
            }
          }
        }
      } catch (maskError) {
        logger.warn('Fog-of-war masking failed; returning unmasked state fallback', {
          roomId,
          userId,
          error: maskError instanceof Error ? maskError.message : String(maskError),
        })
        // Fallback on any error
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
        roomCode: game.roomCode,
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

  getRoomLog = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { roomId: rawRoom } = req.params
      const roomId = await this.gameRoomService.resolveRoomId(rawRoom)
      const userId = req.userId

      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' })
      }

      const room = await this.gameRoomService.getRoomById(roomId)
      if (!room) {
        return res.status(404).json({ message: 'Room not found' })
      }

      // Only allow backfill after game is completed or abandoned
      if (room.status !== 'completed' && room.status !== 'abandoned') {
        return res.status(403).json({ message: 'Game log available after game ends' })
      }

      const [log, stats] = await Promise.all([
        this.gameService.getBattleLog(roomId),
        (async () => {
          try {
            const result = await query<{ turn_stats: unknown[] | null }>(
              'SELECT turn_stats FROM game_states WHERE room_id = $1',
              [roomId],
            )
            const list = result.rows[0]?.turn_stats
            return Array.isArray(list) ? list : []
          } catch {
            return []
          }
        })(),
      ])
      return res.json({ log, stats })
    } catch (error) {
      logger.error('Get room log error:', error)
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
  movementType?: 'classic_adjacent' | 'adjacent_multi' | 'path_single' | 'path_multi'
  fogOfWar?: 'off' | 'adjacent' | 'persistent'
  turnTimerSeconds?: number
  timeBankSeconds?: number
  teamMode?: 'none' | 'teams' | 'auto_balance' | boolean
  numberOfTeams?: number | string
  allowTeamPlay?: boolean
  isRanked?: boolean
  aiOpponents?: Array<{
    difficulty?: string
    personalitySeed?: number
  }>
  treasureConfig?: Partial<TreasureConfig>
}
