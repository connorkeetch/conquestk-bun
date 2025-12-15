import type { Request, Response } from 'express'
import { query } from '../config/database.js'
import {
  PREMIUM_COLOR_MESSAGE,
  PREMIUM_GAME_LIMIT_MESSAGE,
  PREMIUM_UPSELL_ERROR_CODE,
} from '../constants/premium.js'
import { ensureGameConversation } from '../services/conversationService.js'
import { GameLifecycleService } from '../services/gameLifecycleService.js'
import { type CreateRoomData, GameRoomService } from '../services/gameRoomService.js'
import { GameService } from '../services/gameService.js'
// Socket.io and BullMQ queues removed - using Colyseus in server.ts
import type { AuthenticatedRequest } from '../types/express.js'
import type { GameAction, TreasureConfig } from '../types/game.js'
import { logger } from '../utils/logger.js'

/**
 * Handles game-related requests, including creating and managing game rooms and game state.
 */
export class GameController {
  private gameRoomService = new GameRoomService()
  private lifecycleService = new GameLifecycleService()
  private gameService = new GameService()

  /**
   * Gets a list of active game rooms.
   * @param {Request} _req - The Express request object.
   * @param {Response} res - The Express response object.
   */
  getRooms = async (_req: Request, res: Response) => {
    try {
      const rooms = await this.gameRoomService.getActiveRooms()
      return res.json({ rooms })
    } catch (error) {
      logger.error('Get rooms error:', error)
      return res.status(500).json({ message: 'Internal server error' })
    }
  }

  /**
   * Creates a new game room.
   * @param {AuthenticatedRequest} req - The Express request object.
   * @param {Response} res - The Express response object.
   */
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
        selectedColor,
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
            ...(personalitySeed !== undefined ? { personalitySeed } : {}),
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
        gameMode: gameMode || 'classic',
        allowTeamPlay:
          allowTeamPlay === undefined ? normalizedTeamMode !== 'none' : Boolean(allowTeamPlay),
        teamMode: normalizedTeamMode,
        isRanked: normalizedIsRanked,
        aiOpponents: normalizedAiOpponents,
        ...(typeof mapId === 'string' ? { mapId } : {}),
        ...(movementType === 'classic_adjacent' ||
        movementType === 'adjacent_multi' ||
        movementType === 'path_single' ||
        movementType === 'path_multi'
          ? { movementType }
          : {}),
        ...(fogOfWar === 'off' || fogOfWar === 'adjacent' || fogOfWar === 'persistent'
          ? { fogOfWar }
          : {}),
        ...(typeof turnTimerSeconds === 'number' && Number.isFinite(turnTimerSeconds)
          ? { turnTimerSeconds: Math.max(10, Math.min(86400, Math.trunc(turnTimerSeconds))) }
          : {}),
        ...(typeof timeBankSeconds === 'number' && Number.isFinite(timeBankSeconds)
          ? { timeBankSeconds: Math.max(0, Math.min(86400, Math.trunc(timeBankSeconds))) }
          : {}),
        ...(typeof parsedNumberOfTeams === 'number' && !Number.isNaN(parsedNumberOfTeams)
          ? { numberOfTeams: parsedNumberOfTeams }
          : {}),
        ...(treasureConfig !== undefined ? { treasureConfig } : {}),
      }

      const room = await this.gameRoomService.createRoom(roomData)

      // Ensure host is part of the room immediately after creation
      try {
        const joinOptions = typeof selectedColor === 'string' ? { selectedColor } : undefined
        await this.gameRoomService.joinRoom(room.id, hostId, joinOptions)
      } catch (joinError) {
        logger.warn('Host auto-join failed after room creation', {
          roomId: room.id,
          hostId,
          error: joinError instanceof Error ? joinError.message : joinError,
        })
      }

      await this.lifecycleService.refreshLifecycle(room.id)

      try {
        await ensureGameConversation(room.id)
      } catch (chatError) {
        logger.warn('Failed to initialize game chat after room creation', {
          roomId: room.id,
          hostId,
          error: chatError instanceof Error ? chatError.message : chatError,
        })
      }

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

      if (error instanceof Error && error.message === PREMIUM_GAME_LIMIT_MESSAGE) {
        return res.status(403).json({ code: PREMIUM_UPSELL_ERROR_CODE, message: error.message })
      }

      return res.status(500).json({ message: 'Internal server error' })
    }
  }

  /**
   * Submits a game action.
   * This is an HTTP fallback for submitting a game action when WebSocket is unavailable.
   * It is designed to be used with Background Sync from the PWA service worker.
   * @param {AuthenticatedRequest} req - The Express request object.
   * @param {Response} res - The Express response object.
   */
  submitAction = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { roomId: rawRoom } = req.params
      const roomId = await this.gameRoomService.resolveRoomId(rawRoom)
      const userId = req.userId
      if (!userId) return res.status(401).json({ message: 'Authentication required' })

      const isMember = await this.gameRoomService.isPlayerInRoom(roomId, userId)
      if (!isMember) return res.status(403).json({ message: 'You are not in this game' })

      // Accept { action: {...} } or a flat action body
      const body = (req.body ?? {}) as Record<string, unknown>
      const rawCandidate = (body.action ?? body) as unknown
      const raw = (
        rawCandidate && typeof rawCandidate === 'object'
          ? (rawCandidate as Partial<GameAction>)
          : undefined
      ) as Partial<GameAction> | undefined
      if (!raw || typeof raw !== 'object' || typeof raw.type !== 'string') {
        return res.status(400).json({ message: 'Invalid action payload' })
      }

      // Normalize action (server sets roomId/playerId)
      const action: GameAction = { ...(raw as object), roomId, playerId: userId } as GameAction

      // Process action inline (Colyseus handles real-time, this is HTTP fallback)
      try {
        await this.gameService.processGameAction(action, userId)
        return res.status(200).json({ ok: true })
      } catch (inlineError) {
        logger.warn('Inline action processing failed', {
          roomId,
          userId,
          error: inlineError instanceof Error ? inlineError.message : inlineError,
        })
        return res.status(500).json({ ok: false, message: 'Failed to process action' })
      }
    } catch (error) {
      logger.error('submitAction error:', error)
      return res.status(500).json({ message: 'Internal server error' })
    }
  }

  /**
   * Transfers armies after a successful conquest.
   * This is an HTTP fallback for transferring conquest armies after a capture.
   * Accepts JSON body: { fromTerritoryId, toTerritoryId, armies }
   * @param {AuthenticatedRequest} req - The Express request object.
   * @param {Response} res - The Express response object.
   */
  transferConquest = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { roomId: rawRoom } = req.params
      const roomId = await this.gameRoomService.resolveRoomId(rawRoom)
      const userId = req.userId
      if (!userId) return res.status(401).json({ message: 'Authentication required' })

      const isMember = await this.gameRoomService.isPlayerInRoom(roomId, userId)
      if (!isMember) return res.status(403).json({ message: 'You are not in this game' })

      const { fromTerritoryId, toTerritoryId, armies } = (req.body ?? {}) as {
        fromTerritoryId?: string
        toTerritoryId?: string
        armies?: number
      }

      if (!fromTerritoryId || !toTerritoryId || typeof armies !== 'number') {
        return res.status(400).json({ message: 'Invalid conquest transfer payload' })
      }

      const _result = await this.gameService.transferConquestArmies(
        roomId,
        userId,
        fromTerritoryId,
        toTerritoryId,
        armies,
      )

      // Socket.io broadcast removed - using Colyseus for real-time updates
      return res.status(200).json({ ok: true })
    } catch (error) {
      logger.error('transferConquest error:', error)
      return res.status(500).json({ message: 'Internal server error' })
    }
  }

  /**
   * Updates a player's team assignment.
   * @param {AuthenticatedRequest} req - The Express request object.
   * @param {Response} res - The Express response object.
   */
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

  /**
   * Sets a player's ready state.
   * @param {AuthenticatedRequest} req - The Express request object.
   * @param {Response} res - The Express response object.
   */
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

  /**
   * Joins a game room.
   * @param {AuthenticatedRequest} req - The Express request object.
   * @param {Response} res - The Express response object.
   */
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
        if (
          error.message === PREMIUM_GAME_LIMIT_MESSAGE ||
          error.message === PREMIUM_COLOR_MESSAGE
        ) {
          return res.status(403).json({ code: PREMIUM_UPSELL_ERROR_CODE, message: error.message })
        }
      }
      return res.status(500).json({ message: 'Internal server error' })
    }
  }

  /**
   * Leaves a game room.
   * @param {AuthenticatedRequest} req - The Express request object.
   * @param {Response} res - The Express response object.
   */
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

  /**
   * Closes a game room. This can only be done by the host and only if the game has not started.
   * @param {AuthenticatedRequest} req - The Express request object.
   * @param {Response} res - The Express response object.
   */
  closeRoom = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { roomId: rawRoom } = req.params
      const roomId = await this.gameRoomService.resolveRoomId(rawRoom)
      const userId = req.userId

      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' })
      }

      await this.gameRoomService.closeRoom(roomId, userId)
      await this.lifecycleService.refreshLifecycle(roomId)
      return res.json({ message: 'Room closed' })
    } catch (error) {
      logger.error('Close room error:', error)
      if (error instanceof Error) {
        if (error.message === 'Room not found') {
          return res.status(404).json({ message: error.message })
        }
        if (error.message.includes('Only the host')) {
          return res.status(403).json({ message: error.message })
        }
        if (error.message.includes('Game already started')) {
          return res.status(409).json({ message: error.message })
        }
      }
      return res.status(500).json({ message: 'Internal server error' })
    }
  }

  /**
   * Updates the AI opponents in a game room.
   * @param {AuthenticatedRequest} req - The Express request object.
   * @param {Response} res - The Express response object.
   */
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
          ...(personalitySeed !== undefined ? { personalitySeed } : {}),
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

  /**
   * Gets the details of a game room.
   * @param {Request} req - The Express request object.
   * @param {Response} res - The Express response object.
   */
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

  /**
   * Gets the current state of a game.
   * @param {AuthenticatedRequest} req - The Express request object.
   * @param {Response} res - The Express response object.
   */
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

  /**
   * Gets a list of games that the current user is a part of.
   * @param {AuthenticatedRequest} req - The Express request object.
   * @param {Response} res - The Express response object.
   */
  getMyGames = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId

      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' })
      }

      // Get user's games from the service
      const games = await this.gameRoomService.getUserGames(userId)

      // Resolve winner usernames for completed games
      const winnerIds = Array.from(
        new Set(
          games
            .map((g) => (typeof g.winner === 'string' ? g.winner : null))
            .filter((v): v is string => Boolean(v)),
        ),
      )

      let winnerNameMap = new Map<string, string>()
      if (winnerIds.length > 0) {
        try {
          const result = await query<{ id: string; username: string }>(
            'SELECT id, username FROM users WHERE id = ANY($1)',
            [winnerIds],
          )
          winnerNameMap = new Map(result.rows.map((r) => [r.id, r.username]))
        } catch (err) {
          logger.warn('Failed to resolve winner usernames for my-games payload', {
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }

      // Format games for the frontend
      const formattedGames = games.map((game) => ({
        id: game.id,
        name: game.name,
        status: game.status || (game.gameStarted ? 'active' : 'lobby'),
        playerCount: game.playerCount || game.players?.length || 0,
        maxPlayers: game.maxPlayers,
        roomCode: game.roomCode,
        isYourTurn: game.currentTurnUserId === userId,
        // Winner username for completed games
        winner:
          game.status === 'completed' && typeof game.winner === 'string'
            ? (winnerNameMap.get(game.winner) ?? null)
            : null,
        createdAt: game.createdAt,
        updatedAt: game.updatedAt ?? game.createdAt,
        // Extra fields to support My Games columns
        isPrivate: game.isPrivate,
        hostUsername: game.hostUsername,
        isRanked: game.is_ranked === true,
        gameMode: game.gameMode ?? null,
      }))

      return res.json({ games: formattedGames })
    } catch (error) {
      logger.error('Get my games error:', error)
      return res.status(500).json({ message: 'Internal server error' })
    }
  }

  /**
   * Gets metadata for all of the current user's games.
   * This includes information about the current turn, timers, and queue position.
   * @param {AuthenticatedRequest} req - The Express request object.
   * @param {Response} res - The Express response object.
   */
  getMyGamesMeta = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId

      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' })
      }

      const games = await this.gameRoomService.getUserGames(userId)

      const metaEntries = await Promise.all(
        games.map(async (game) => {
          try {
            // Only compute rich turn metadata for active games
            if (game.status !== 'active') {
              return [
                game.id,
                {
                  isYourTurn: false,
                  currentTurnUserId: null,
                  currentTurnUsername: null,
                  turnExpiresAt: null,
                  timeBankSecondsRemaining: null,
                  queueAhead: null,
                  phase: null,
                },
              ] as const
            }

            const room = await this.gameRoomService.getRoomById(game.id)
            const currentTurnUserId = room?.currentTurnUserId ?? null
            const turnExpiresAt = room?.turnExpiresAt ? room.turnExpiresAt.toISOString() : null
            const timeBankSecondsRemaining =
              typeof room?.timeBankSecondsRemaining === 'number'
                ? Math.max(0, Math.trunc(room.timeBankSecondsRemaining))
                : null

            let queueAhead: number | null = null
            let phase:
              | import('../types/game.js').GamePhase
              | 'lobby'
              | 'initializing'
              | 'finished'
              | null = null
            let currentTurnUsername: string | null = null
            try {
              const gameState = await this.gameService.getGameState(game.id)
              if (gameState && Array.isArray(gameState.players)) {
                const players = gameState.players.filter((p) => !p.isEliminated)
                const curIdx = players.findIndex((p) => p.id === gameState.currentPlayer)
                const youIdx = players.findIndex((p) => p.id === userId)
                const cur = players[curIdx]
                if (cur && typeof cur.username === 'string') {
                  currentTurnUsername = cur.username
                }
                if (curIdx !== -1 && youIdx !== -1) {
                  const n = players.length
                  const dist = (((youIdx - curIdx) % n) + n) % n
                  queueAhead = dist
                }
                // Capture current phase for active games
                phase = gameState.phase
              }
            } catch (_err) {
              // Non-fatal; leave queueAhead/username as null
            }

            return [
              game.id,
              {
                isYourTurn: currentTurnUserId === userId,
                currentTurnUserId,
                currentTurnUsername,
                turnExpiresAt,
                timeBankSecondsRemaining,
                queueAhead,
                phase,
              },
            ] as const
          } catch (_err) {
            return [
              game.id,
              {
                isYourTurn: false,
                currentTurnUserId: null,
                currentTurnUsername: null,
                turnExpiresAt: null,
                timeBankSecondsRemaining: null,
                queueAhead: null,
                phase: null,
              },
            ] as const
          }
        }),
      )

      const meta: Record<
        string,
        {
          isYourTurn: boolean
          currentTurnUserId: string | null
          currentTurnUsername: string | null
          turnExpiresAt: string | null
          timeBankSecondsRemaining: number | null
          queueAhead: number | null
          phase: string | null
        }
      > = {}

      for (const [id, m] of metaEntries) meta[id] = m

      return res.json({ meta })
    } catch (error) {
      logger.error('Get my games meta error:', error)
      return res.status(500).json({ message: 'Internal server error' })
    }
  }

  /**
   * Gets the game log for a room, with fog-of-war applied.
   * @param {AuthenticatedRequest} req - The Express request object.
   * @param {Response} res - The Express response object.
   */
  getRoomLogText = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { roomId: rawRoom } = req.params
      const roomId = await this.gameRoomService.resolveRoomId(rawRoom)
      const userId = req.userId

      if (!userId) return res.status(401).json({ message: 'Authentication required' })

      const room = await this.gameRoomService.getRoomById(roomId)
      if (!room) return res.status(404).json({ message: 'Room not found' })

      // Pagination
      const limitParam = (req.query?.limit as string | undefined) ?? undefined
      const beforeParam = (req.query?.before as string | undefined) ?? undefined
      const limit = (() => {
        const n = Number(limitParam)
        return Number.isFinite(n) && n > 0 ? Math.min(500, Math.trunc(n)) : 150
      })()
      const beforeTs = (() => {
        try {
          return beforeParam ? new Date(beforeParam) : null
        } catch {
          return null
        }
      })()

      // Windowed read from game_logs
      const params: unknown[] = [roomId]
      let idx = 2
      let sql = `SELECT id, game_id, ts, turn_number, phase, move_type, actor_id, from_territory_id, to_territory_id, payload
                 FROM game_logs WHERE game_id = $1`
      if (beforeTs) {
        sql += ` AND ts < $${idx++}`
        params.push(beforeTs)
      }
      sql += ` ORDER BY ts DESC LIMIT $${idx}`
      params.push(limit)
      const result = await query<{
        id: string
        game_id: string
        ts: Date
        turn_number: number
        phase: string
        move_type: string
        actor_id: string | null
        from_territory_id: string | null
        to_territory_id: string | null
        payload: unknown
      }>(sql, params)

      // Fog-aware rendering per requesting viewer
      const { filterFullStateForViewer } = await import('../services/fogService.js')
      const { collectPlayerRefs, renderLogText } = await import('../services/logEmitter.js')
      const fullState = await this.gameService.getGameState(roomId)
      const _state = fullState ? filterFullStateForViewer(fullState, userId) : null

      // Helper: compute fog booleans for each move
      const { computeVisibilityMask } = await import('../services/fogService.js')
      const fogEnabled = Boolean(
        fullState &&
          (fullState.gameConfig?.fogOfWar as string | undefined) &&
          fullState.gameConfig?.fogOfWar !== 'off' &&
          fullState.phase !== 'finished',
      )
      const mask = fullState ? computeVisibilityMask(fullState, userId) : new Set<string>()

      type Move = {
        id: string
        game_id: string
        turn_number: number
        phase: string
        move_type: string
        actor_id: string
        created_at: string | Date
        payload: Record<string, unknown>
      }
      const toFog = (m: Move) => {
        if (!fogEnabled)
          return { canSeeFrom: true, canSeeTo: true, showCounts: true, fogActive: false }
        const p = m.payload || {}
        const fromId =
          (p.fromId as string | undefined) ||
          (m as unknown as { from_territory_id?: string }).from_territory_id
        const toId =
          (p.toId as string | undefined) ||
          (m as unknown as { to_territory_id?: string }).to_territory_id
        const canSeeFrom = fromId ? mask.has(fromId) : false
        const canSeeTo = toId ? mask.has(toId) : false
        return { canSeeFrom, canSeeTo, showCounts: canSeeFrom && canSeeTo, fogActive: true }
      }

      const moves: Move[] = result.rows.map((r) => ({
        id: r.id,
        game_id: r.game_id,
        turn_number: r.turn_number,
        phase: r.phase,
        move_type: r.move_type,
        actor_id: (r.actor_id as string | null) || '',
        created_at: r.ts,
        payload: (r.payload ?? {}) as Record<string, unknown>,
      }))

      // Sort ascending then return newest-first list of text lines
      moves.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      const formatted = moves.map((m) => ({
        id: String(m.id),
        t: new Date(m.created_at).toISOString(),
        kind: m.move_type,
        text: renderLogText(m as unknown as import('../services/logEmitter.js').DbMove, toFog(m)),
        actor: {
          id: (m.actor_id as string | null) || '',
          name: String(((m.payload as Record<string, unknown>)?.actorName as string) || ''),
        },
        players: collectPlayerRefs(m as unknown as import('../services/logEmitter.js').DbMove),
      }))
      formatted.sort((a, b) => new Date(b.t).getTime() - new Date(a.t).getTime())
      return res.json({ log: formatted })
    } catch (error) {
      logger.error('Get room log-text error:', error)
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
  // Optional host-selected color; if provided, the host will be joined with this exact color
  selectedColor?: string
}
