import { getClient, query } from '../config/database'
import { acquireLock, releaseLock } from '../config/redis'
import type { GameConfiguration, GameState } from '../types/game'
import type { GameLifecycleStatus, GameRoom } from '../types/gameRoom'
import { logger } from '../utils/logger'
import capitalGameService from './capitalGameService'
import { GameRoomService } from './gameRoomService'
import { GameService } from './gameService'
import { queueService } from './queueService'
import { tryGetSocketServer } from './socketRegistry'

interface ReadyPlayerRow {
  id: string
  user_id: string | null
  ai_player_id: string | null
  is_ready: boolean
  ready_at: Date | string | null
  joined_at: Date | string | null
  team_id: number | null
  is_ai: boolean | null
  ai_difficulty: string | null
  ai_personality_seed: number | null
  selected_color: string | null
}

export interface LifecycleSnapshot {
  room: GameRoom | null
  readyStates: Array<{
    userId: string
    isReady: boolean
    readyAt: string | null
  }>
  triggeredStart: boolean
}

export class GameLifecycleService {
  private gameRoomService = new GameRoomService()
  private gameService = new GameService()

  async setReadyState(roomId: string, userId: string, ready: boolean): Promise<LifecycleSnapshot> {
    // Acquire distributed lock to prevent race conditions
    const lockKey = `lock:game:ready:${roomId}`
    const lockToken = await acquireLock(lockKey, 5000)

    if (!lockToken) {
      throw new Error('Failed to acquire lock, another operation in progress')
    }

    const client = await getClient()

    let shouldStart = false
    let players: ReadyPlayerRow[] = []
    let turnTimer = 60
    let lifecycleStatus: GameLifecycleStatus = 'lobby'

    try {
      await client.query('BEGIN')

      const roomResult = await client.query<{
        status: string
        turn_timer: number | null
        max_players: number | null
        host_id: string
      }>(
        'SELECT status, turn_timer, max_players, host_id FROM game_rooms WHERE id = $1 FOR UPDATE',
        [roomId],
      )

      if (roomResult.rowCount === 0) {
        throw new Error('Room not found')
      }

      const rawStatus = roomResult.rows[0].status
      lifecycleStatus = this.normalizeStatus(rawStatus)
      turnTimer = roomResult.rows[0].turn_timer ?? 60
      const hostId = roomResult.rows[0].host_id
      const maxPlayers = roomResult.rows[0].max_players ?? 2

      if (lifecycleStatus === 'active' || lifecycleStatus === 'completed') {
        throw new Error('Game already started')
      }

      const membershipResult = await client.query<{ is_ready: boolean }>(
        'SELECT is_ready FROM room_players WHERE room_id = $1 AND user_id = $2 FOR UPDATE',
        [roomId, userId],
      )

      if (membershipResult.rowCount === 0) {
        throw new Error('Player is not part of the room')
      }

      await client.query(
        `
        UPDATE room_players
        SET is_ready = $3,
            ready_at = CASE WHEN $3 THEN NOW() ELSE NULL END
        WHERE room_id = $1 AND user_id = $2
      `,
        [roomId, userId, ready],
      )

      const playersResult = await client.query<ReadyPlayerRow>(
        `
        SELECT
          id,
          user_id,
          ai_player_id,
          is_ready,
          ready_at,
          joined_at,
          team_id,
          is_ai,
          ai_difficulty,
          ai_personality_seed,
          selected_color
        FROM room_players
        WHERE room_id = $1
        ORDER BY joined_at ASC
      `,
        [roomId],
      )
      players = playersResult.rows

      const playerCount = players.length
      const minPlayers = 2
      const isHost = userId === hostId
      const lobbyIsFull = playerCount >= maxPlayers

      // Allow manual start when: (1) host explicitly marks ready AND (2) at least min players present
      // OR auto-start when lobby is full (any player joining triggers this)
      const canStart =
        (isHost && ready === true && playerCount >= minPlayers) || (lobbyIsFull && ready === true)

      if (canStart && lifecycleStatus === 'lobby') {
        shouldStart = true
        lifecycleStatus = 'initializing'
        await client.query(
          `
          UPDATE game_rooms
          SET status = 'initializing',
              ready_check_started_at = NOW(),
              turn_number = 0,
              turn_expires_at = NULL
          WHERE id = $1
        `,
          [roomId],
        )
      }

      if (!canStart && lifecycleStatus === 'initializing') {
        lifecycleStatus = 'lobby'
        await client.query(
          `
          UPDATE game_rooms
          SET status = 'lobby',
              ready_check_started_at = NULL,
              turn_number = 0,
              turn_expires_at = NULL
          WHERE id = $1
        `,
          [roomId],
        )
      }

      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
      // Always release lock in finally block
      await releaseLock(lockKey, lockToken)
    }

    if (shouldStart) {
      try {
        await this.startGame(roomId, players, turnTimer)
      } catch (error) {
        logger.error('Failed to start game after ready-check', {
          roomId,
          error: error instanceof Error ? error.message : error,
        })

        await query(
          `
          UPDATE game_rooms
          SET status = 'lobby',
              ready_check_started_at = NULL,
              turn_number = 0,
              current_turn_user_id = NULL,
              turn_expires_at = NULL
          WHERE id = $1
        `,
          [roomId],
        )

        throw error
      }
    }

    const snapshot = await this.getLifecycleSnapshot(roomId)
    snapshot.triggeredStart = shouldStart
    await this.broadcastLifecycle(snapshot)

    return snapshot
  }

  async maybeAutoStart(roomId: string): Promise<boolean> {
    const lockKey = `lock:game:ready:${roomId}`
    const lockToken = await acquireLock(lockKey, 5000)

    if (!lockToken) {
      logger.warn('Failed to acquire lifecycle lock for auto-start', { roomId })
      return false
    }

    const client = await getClient()

    let shouldStart = false
    let players: ReadyPlayerRow[] = []
    let turnTimer = 60

    try {
      await client.query('BEGIN')

      const roomResult = await client.query<{
        status: string
        turn_timer: number | null
        max_players: number | null
      }>('SELECT status, turn_timer, max_players FROM game_rooms WHERE id = $1 FOR UPDATE', [
        roomId,
      ])

      if (roomResult.rowCount === 0) {
        throw new Error('Room not found')
      }

      const lifecycleStatus = this.normalizeStatus(roomResult.rows[0].status)
      turnTimer = roomResult.rows[0].turn_timer ?? 60
      const maxPlayers = roomResult.rows[0].max_players ?? 0

      if (lifecycleStatus === 'lobby') {
        const playersResult = await client.query<ReadyPlayerRow>(
          `
          SELECT
            id,
            user_id,
            ai_player_id,
            is_ready,
            ready_at,
            joined_at,
            team_id,
            is_ai,
            ai_difficulty,
            ai_personality_seed,
            selected_color
          FROM room_players
          WHERE room_id = $1
          ORDER BY joined_at ASC
        `,
          [roomId],
        )

        players = playersResult.rows
        const playerCount = players.length
        const targetCount = maxPlayers > 0 ? maxPlayers : playerCount
        const minPlayers = Math.max(2, Math.min(targetCount, playerCount))

        if (playerCount >= targetCount && playerCount >= minPlayers) {
          shouldStart = true
          await client.query(
            `
            UPDATE game_rooms
            SET status = 'initializing',
                ready_check_started_at = NOW(),
                turn_number = 0,
                turn_expires_at = NULL
            WHERE id = $1
          `,
            [roomId],
          )
        }
      }

      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      logger.error('Auto-start lifecycle transaction failed', {
        roomId,
        error: error instanceof Error ? error.message : error,
      })
      shouldStart = false
    } finally {
      client.release()
      await releaseLock(lockKey, lockToken)
    }

    if (!shouldStart) {
      return false
    }

    try {
      await this.startGame(roomId, players, turnTimer)
    } catch (error) {
      logger.error('Failed to auto-start game', {
        roomId,
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
        playerCount: players.length,
      })

      // Cleanup: revert room to lobby and clean up any partial game state
      await query(
        `
        UPDATE game_rooms
        SET status = 'lobby',
            ready_check_started_at = NULL,
            turn_number = 0,
            current_turn_user_id = NULL,
            turn_expires_at = NULL
        WHERE id = $1
      `,
        [roomId],
      )

      // Also delete any partial game state that was created
      try {
        await query('DELETE FROM game_states WHERE room_id = $1', [roomId])
        const { gameStateCache } = await import('./cacheService')
        await gameStateCache.deleteGameState(roomId)
      } catch (cleanupError) {
        logger.warn('Failed to cleanup partial game state after start failure', {
          roomId,
          error: cleanupError instanceof Error ? cleanupError.message : cleanupError,
        })
      }

      return false
    }

    const snapshot = await this.getLifecycleSnapshot(roomId)
    snapshot.triggeredStart = true
    await this.broadcastLifecycle(snapshot)

    return true
  }

  async getLifecycleSnapshot(roomId: string): Promise<LifecycleSnapshot> {
    const room = await this.gameRoomService.getRoomById(roomId)

    return {
      room,
      readyStates:
        room?.players?.map((player) => ({
          userId: player.userId ?? player.id,
          isReady: Boolean(player.isReady),
          readyAt: player.readyAt ? player.readyAt.toISOString() : null,
        })) ?? [],
      triggeredStart: false,
    }
  }

  private async startGame(roomId: string, players: ReadyPlayerRow[], turnTimer: number) {
    const room = await this.gameRoomService.getRoomById(roomId)

    // Validate prerequisites before attempting to start
    if (!room) {
      throw new Error('Room not found')
    }

    if (!room.mapId) {
      throw new Error('No map selected for this game')
    }

    if (players.length < 2) {
      throw new Error(`Insufficient players to start game (${players.length}/2 minimum)`)
    }

    const teamAssignments: Record<number, string[]> = {}
    const playerConfigs = players.map((player) => {
      const slotIdentifier = player.user_id ?? player.ai_player_id
      const configUserId = slotIdentifier ?? player.id
      const matchingRoomPlayer = room?.players?.find(
        (p) => p.id === player.id || (slotIdentifier && p.userId === slotIdentifier),
      )
      const normalizedTeamId =
        typeof player.team_id === 'number' && !Number.isNaN(player.team_id) ? player.team_id : null

      if (normalizedTeamId) {
        if (!teamAssignments[normalizedTeamId]) {
          teamAssignments[normalizedTeamId] = []
        }
        teamAssignments[normalizedTeamId].push(configUserId)
      }

      const normalizedDifficulty = (() => {
        if (matchingRoomPlayer && matchingRoomPlayer.aiDifficulty !== undefined) {
          return matchingRoomPlayer.aiDifficulty
        }

        if (player.ai_difficulty === null) {
          return null
        }

        if (typeof player.ai_difficulty === 'string') {
          const lowered = player.ai_difficulty.toLowerCase()
          if (lowered === 'recruit' || lowered === 'commander' || lowered === 'grandmaster') {
            return lowered as 'recruit' | 'commander' | 'grandmaster'
          }
        }

        return undefined
      })()

      const personalitySeed = (() => {
        if (matchingRoomPlayer && matchingRoomPlayer.aiPersonalitySeed !== undefined) {
          return matchingRoomPlayer.aiPersonalitySeed
        }

        if (
          typeof player.ai_personality_seed === 'number' &&
          Number.isFinite(player.ai_personality_seed)
        ) {
          return Math.trunc(player.ai_personality_seed)
        }

        if (player.ai_personality_seed === null) {
          return null
        }

        return undefined
      })()

      const selectedColor = (() => {
        const fromRoom = matchingRoomPlayer?.selected_color
        if (typeof fromRoom === 'string' && fromRoom.trim().length > 0) {
          return fromRoom.trim()
        }

        const fromRow = player.selected_color
        if (typeof fromRow === 'string' && fromRow.trim().length > 0) {
          return fromRow.trim()
        }

        return null
      })()

      return {
        userId: configUserId,
        username: matchingRoomPlayer?.username,
        teamId: normalizedTeamId,
        isAi: player.is_ai === true || matchingRoomPlayer?.isAi === true,
        aiDifficulty: normalizedDifficulty,
        aiPersonalitySeed: personalitySeed,
        color: selectedColor ?? undefined,
      }
    })

    const configOverrides: Partial<GameConfiguration> = {}

    // Ensure selected map from the room flows into game initialization
    if (room?.mapId) {
      configOverrides.mapId = room.mapId
    }

    if (room?.teamMode === 'teams' && room.numberOfTeams && room.numberOfTeams > 1) {
      configOverrides.allowTeamPlay = true
      configOverrides.teamMode = 'teams'
      configOverrides.numberOfTeams = room.numberOfTeams
      if (Object.keys(teamAssignments).length > 0) {
        configOverrides.teamAssignments = teamAssignments
      }
    }

    // Propagate selected game mode (e.g. 'capitals') into config
    if (room?.gameMode) {
      configOverrides.gameMode = room.gameMode
    }

    // Movement type (fortification rules)
    if (room?.movementType) {
      configOverrides.movementType = room.movementType
    }

    // Fog of War: treat any non-off value as adjacent (non-persistent)
    if (room?.fogOfWar && room.fogOfWar !== 'off') {
      configOverrides.fogOfWar = 'adjacent'
    } else {
      configOverrides.fogOfWar = 'off'
    }

    // Inject Hidden Treasures configuration if provided at room creation (DB-backed)
    try {
      const { normalizeTreasureConfig } = await import('../game/hiddenTreasures')
      // Prefer DB value
      // biome-ignore lint/suspicious/noExplicitAny: room is a DTO
      const roomTreasure: any = (room as any)?.treasureConfig
      if (roomTreasure && typeof roomTreasure === 'object') {
        configOverrides.treasureConfig = normalizeTreasureConfig(roomTreasure)
      } else {
        // Backward compatibility: fallback to cache if set before migration
        const { cacheService } = await import('./cacheService')
        const cached = await cacheService.get<Partial<GameConfiguration['treasureConfig']>>(
          `room:treasure-config:${roomId}`,
        )
        if (cached && typeof cached === 'object') {
          configOverrides.treasureConfig = normalizeTreasureConfig(cached)
          await cacheService.delete(`room:treasure-config:${roomId}`)
        }
      }
    } catch (_error) {
      // Non-fatal: continue with defaults
    }

    // Inject King of the Hill configuration if game mode is KOTH
    if (room?.gameMode === 'king_of_the_hill') {
      try {
        // biome-ignore lint/suspicious/noExplicitAny: room is a DTO
        const roomKoth: any = (room as any)?.kingOfTheHillConfig
        if (roomKoth && typeof roomKoth === 'object') {
          configOverrides.kingOfTheHill = roomKoth
        }
      } catch (_error) {
        // Non-fatal: continue with defaults
      }
    }

    // Initialize the game - this is the critical step that can fail
    let gameState: GameState
    try {
      gameState = await this.gameService.initializeGame(roomId, playerConfigs, configOverrides)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      logger.error('Failed to initialize game state', {
        roomId,
        mapId: room?.mapId,
        playerCount: players.length,
        error: errorMsg,
      })
      throw new Error(`Game initialization failed: ${errorMsg}`)
    }

    // Initialize time bank remaining for each player to room capacity (if configured)
    try {
      const initQuery = `
        UPDATE room_players rp
        SET time_bank_seconds_remaining = GREATEST(0, COALESCE(gr.time_bank_seconds, 0))
        FROM game_rooms gr
        WHERE rp.room_id = gr.id AND rp.room_id = $1
      `
      await query(initQuery, [roomId])
    } catch (error) {
      logger.warn('Failed to initialize time bank for room', {
        roomId,
        error: error instanceof Error ? error.message : error,
      })
    }

    // Initialize capitals if requested and possible
    if ((room?.gameMode === 'capitals' || configOverrides.gameMode === 'capitals') && room?.mapId) {
      try {
        await capitalGameService.initializeCapitals(roomId, players.length, room.mapId)
      } catch (error) {
        logger.warn('Failed to initialize capitals; continuing without capitals', {
          roomId,
          mapId: room?.mapId,
          error: error instanceof Error ? error.message : error,
        })
      }
    }

    // Validate game state before persisting
    if (!gameState || !gameState.players || gameState.players.length === 0) {
      throw new Error('Invalid game state: missing players or game data')
    }

    if (!gameState.board || gameState.board.length === 0) {
      throw new Error('Invalid game state: no territories on board')
    }

    // Persist the latest snapshot from cache (capitals and other post-init changes included)
    try {
      const { gameStateCache } = await import('./cacheService')
      const latest =
        await gameStateCache.getGameState<import('../types/game').SerializedGameState>(roomId)
      if (latest) {
        await this.gameService.saveSnapshot(roomId, latest)
      } else {
        await this.persistGameState(roomId, gameState)
      }
    } catch (error) {
      // This is a critical error - we must persist the game state
      logger.error('Failed to persist game state to database', {
        roomId,
        error: error instanceof Error ? error.message : error,
      })
      throw new Error(
        `Failed to save game state: ${error instanceof Error ? error.message : error}`,
      )
    }

    // Append lifecycle logs: CREATED (using room.createdAt if present) and STARTED (now)
    try {
      const createdAtIso =
        (room?.createdAt && new Date(room.createdAt).toISOString()) || new Date().toISOString()
      const nowIso = new Date().toISOString()
      await this.gameService.appendLog(roomId, [
        { type: 'LIFECYCLE', timestamp: createdAtIso, event: 'CREATED' },
        { type: 'LIFECYCLE', timestamp: nowIso, event: 'STARTED' },
      ])
    } catch (err) {
      logger.warn('Failed to append lifecycle logs', {
        roomId,
        error: err instanceof Error ? err.message : err,
      })
    }

    await query(
      `
      UPDATE game_rooms
      SET status = 'active',
          turn_number = $2,
          current_turn_user_id = $3,
          turn_expires_at = CASE WHEN $4 > 0 THEN NOW() + ($4 * INTERVAL '1 second') ELSE NULL END,
          ready_check_started_at = NULL,
          started_at = COALESCE(started_at, NOW())
      WHERE id = $1
    `,
      [roomId, gameState.turn, gameState.currentPlayer, turnTimer],
    )

    await query('UPDATE room_players SET is_ready = FALSE, ready_at = NULL WHERE room_id = $1', [
      roomId,
    ])

    const snapshot = await this.getLifecycleSnapshot(roomId)
    await this.broadcastLifecycle(snapshot)

    // Append initial per-turn stats snapshot for turn 1
    try {
      const stats = this.gameService.buildTurnStatsSnapshot(gameState)
      await this.gameService.appendTurnStats(roomId, stats)
    } catch (e) {
      logger.warn('Failed to append initial turn stats snapshot', {
        roomId,
        error: e instanceof Error ? e.message : e,
      })
    }

    const io = tryGetSocketServer()
    if (io) {
      const serialized = this.toSerializableGameState(gameState)
      io.to(roomId).emit('game-update', serialized)
    }

    // Schedule AFK grace start when the turn timer expires (instead of ending immediately)
    try {
      if (turnTimer && turnTimer > 0) {
        const { queueService } = await import('./queueService')
        const idKey = `afk:${roomId}:turn:${gameState.turn}:start`
        await queueService.addDelayedGameAction(
          {
            gameId: roomId,
            playerId: gameState.currentPlayer,
            action: { type: 'end_turn', playerId: gameState.currentPlayer, roomId },
            idempotencyKey: idKey,
            afkStage: 'start',
          },
          turnTimer * 1000,
          { idempotencyKey: idKey, priority: 10 },
        )
      }
    } catch (error) {
      logger.warn('Failed to schedule auto end-turn', {
        roomId,
        error: error instanceof Error ? error.message : error,
      })
    }
  }

  /**
   * Try to extend the current player's turn by consuming time bank.
   * Returns true if extension was applied and end-turn should be skipped.
   */
  async tryConsumeTimeBank(roomId: string, chunkSeconds = 15): Promise<boolean> {
    const client = await getClient()
    try {
      await client.query('BEGIN')
      const res = await client.query<{
        current_turn_user_id: string | null
        turn_expires_at: Date | null
        turn_timer: number | null
        remaining: number | null
      }>(
        `
        SELECT gr.current_turn_user_id, gr.turn_expires_at, gr.turn_timer,
               rp.time_bank_seconds_remaining as remaining
        FROM game_rooms gr
        LEFT JOIN room_players rp ON rp.room_id = gr.id AND rp.user_id = gr.current_turn_user_id
        WHERE gr.id = $1
        FOR UPDATE
        `,
        [roomId],
      )
      const row = res.rows[0]
      if (!row || !row.current_turn_user_id || !row.remaining || row.remaining <= 0) {
        await client.query('ROLLBACK')
        return false
      }

      const extendBy = Math.max(1, Math.min(chunkSeconds, Math.trunc(row.remaining)))
      await client.query(
        `UPDATE room_players SET time_bank_seconds_remaining = time_bank_seconds_remaining - $2
         WHERE room_id = $1 AND user_id = $3`,
        [roomId, extendBy, row.current_turn_user_id],
      )

      // Update expiry to now + extendBy (or add to existing if in future)
      await client.query(
        `UPDATE game_rooms
           SET turn_expires_at = CASE
             WHEN turn_expires_at IS NULL OR turn_expires_at < NOW()
               THEN NOW() + ($2 * INTERVAL '1 second')
             ELSE turn_expires_at + ($2 * INTERVAL '1 second')
           END
         WHERE id = $1`,
        [roomId, extendBy],
      )

      await client.query('COMMIT')

      // Broadcast updated lifecycle
      const snapshot = await this.getLifecycleSnapshot(roomId)
      await this.broadcastLifecycle(snapshot)

      // Reschedule auto end-turn for chunk
      try {
        const idKey = `auto-end:${roomId}:bank:${Date.now()}`
        await queueService.addDelayedGameAction(
          {
            gameId: roomId,
            playerId: snapshot.room?.currentTurnUserId ?? '',
            action: {
              type: 'end_turn',
              playerId: snapshot.room?.currentTurnUserId ?? '',
              roomId,
            },
            idempotencyKey: idKey,
          },
          extendBy * 1000,
          { idempotencyKey: idKey, priority: 10 },
        )
      } catch (e) {
        logger.warn('Failed to reschedule end-turn after time bank extension', {
          roomId,
          error: e instanceof Error ? e.message : e,
        })
      }

      return true
    } catch (error) {
      await client.query('ROLLBACK')
      logger.error('Error trying to consume time bank', error)
      return false
    } finally {
      client.release()
    }
  }

  private async broadcastLifecycle(snapshot: LifecycleSnapshot) {
    const io = tryGetSocketServer()
    if (!io || !snapshot.room) {
      return
    }

    // Derive lifecyclePhase for payloads from status + current game phase
    let computedLifecyclePhase: NonNullable<GameRoom['lifecyclePhase']> = 'lobby'
    const roomStatus = snapshot.room.status
    if (roomStatus === 'active') {
      try {
        const state = await this.gameService.getGameState(snapshot.room.id)
        computedLifecyclePhase = (state?.phase ?? 'reinforcement') as NonNullable<
          GameRoom['lifecyclePhase']
        >
      } catch {
        computedLifecyclePhase = 'reinforcement'
      }
    } else if (roomStatus === 'lobby' || roomStatus === 'initializing') {
      computedLifecyclePhase = roomStatus as NonNullable<GameRoom['lifecyclePhase']>
    } else if (roomStatus === 'completed') {
      computedLifecyclePhase = 'reinforcement'
    } else {
      // For paused/abandoned or other statuses, default to lobby-like phase
      computedLifecyclePhase = 'lobby'
    }

    const players = snapshot.room.players?.map((player) => ({
      id: player.id,
      userId: player.userId ?? player.id,
      aiPlayerId: player.aiPlayerId ?? null,
      username: player.username,
      joinedAt: player.joinedAt instanceof Date ? player.joinedAt.toISOString() : player.joinedAt,
      isReady: Boolean(player.isReady),
      readyAt:
        player.readyAt instanceof Date ? player.readyAt.toISOString() : (player.readyAt ?? null),
      isAi: player.isAi === true,
      aiDifficulty: player.aiDifficulty ?? null,
      aiPersonalitySeed: player.aiPersonalitySeed ?? null,
    }))

    const payload = {
      roomId: snapshot.room.id,
      status: snapshot.room.status,
      lifecyclePhase: computedLifecyclePhase,
      turnNumber: snapshot.room.turnNumber ?? 0,
      currentTurnUserId: snapshot.room.currentTurnUserId ?? null,
      turnExpiresAt: snapshot.room.turnExpiresAt ? snapshot.room.turnExpiresAt.toISOString() : null,
      readyCheckStartedAt: snapshot.room.readyCheckStartedAt
        ? snapshot.room.readyCheckStartedAt.toISOString()
        : null,
      timeBankSecondsRemaining: snapshot.room.timeBankSecondsRemaining ?? null,
      graceActorUserId: snapshot.room.graceActorUserId ?? null,
      graceExpiresAt: snapshot.room.graceExpiresAt
        ? snapshot.room.graceExpiresAt.toISOString()
        : null,
      replacementPendingUserId: snapshot.room.replacementPendingUserId ?? null,
      readyStates: snapshot.readyStates,
      players,
    }

    io.to(snapshot.room.id).emit('lifecycle:update', payload)
    io.to(snapshot.room.id).emit('room-update', {
      id: snapshot.room.id,
      status: snapshot.room.status,
      lifecyclePhase: computedLifecyclePhase,
      turnNumber: snapshot.room.turnNumber,
      currentTurnUserId: snapshot.room.currentTurnUserId,
      turnExpiresAt: snapshot.room.turnExpiresAt ? snapshot.room.turnExpiresAt.toISOString() : null,
      timeBankSecondsRemaining: snapshot.room.timeBankSecondsRemaining ?? null,
      readyCheckStartedAt: snapshot.room.readyCheckStartedAt
        ? snapshot.room.readyCheckStartedAt.toISOString()
        : null,
      graceActorUserId: snapshot.room.graceActorUserId ?? null,
      graceExpiresAt: snapshot.room.graceExpiresAt
        ? snapshot.room.graceExpiresAt.toISOString()
        : null,
      replacementPendingUserId: snapshot.room.replacementPendingUserId ?? null,
      players,
    })
  }

  private async persistGameState(roomId: string, gameState: GameState) {
    const serializable = this.toSerializableGameState(gameState)

    try {
      // Save to database (align with canonical columns)
      await query(
        `
        INSERT INTO game_states (room_id, game_data, turn_number, current_player_id, game_phase, last_activity)
        VALUES ($1, $2::jsonb, $3, $4, $5, NOW())
        ON CONFLICT (room_id) DO UPDATE
        SET game_data = EXCLUDED.game_data,
            turn_number = EXCLUDED.turn_number,
            current_player_id = EXCLUDED.current_player_id,
            game_phase = EXCLUDED.game_phase,
            last_activity = NOW()
      `,
        [
          roomId,
          JSON.stringify(serializable),
          Math.max(1, Number(gameState.turn ?? 1)),
          gameState.currentPlayer,
          gameState.phase ?? 'deployment',
        ],
      )
    } catch (error) {
      logger.error('Failed to persist initial game state to database', {
        roomId,
        phase: gameState.phase,
        turn: gameState.turn,
        error: error instanceof Error ? error.message : error,
      })
      throw error
    }

    // Also populate Redis cache for fast access
    try {
      const { gameStateCache } = await import('./cacheService')
      await gameStateCache.setGameState(roomId, serializable)
    } catch (error) {
      logger.warn('Failed to cache initial game state', {
        roomId,
        error: error instanceof Error ? error.message : error,
      })
    }
  }

  private toSerializableGameState(gameState: GameState) {
    return {
      ...gameState,
      territoryModifiers:
        gameState.territoryModifiers instanceof Map
          ? Object.fromEntries(gameState.territoryModifiers.entries())
          : (gameState.territoryModifiers ?? {}),
    }
  }

  private normalizeStatus(status: string | null): GameLifecycleStatus {
    if (!status) {
      return 'lobby'
    }

    switch (status) {
      case 'waiting':
        return 'lobby'
      case 'starting':
        return 'initializing'
      case 'in_progress':
        return 'active'
      case 'finished':
        return 'completed'
      default: {
        const allowed: GameLifecycleStatus[] = [
          'lobby',
          'initializing',
          'active',
          'completed',
          'paused',
          'abandoned',
        ]
        const normalized = status as GameLifecycleStatus
        return allowed.includes(normalized) ? normalized : 'lobby'
      }
    }
  }

  async refreshLifecycle(roomId: string): Promise<LifecycleSnapshot> {
    const snapshot = await this.getLifecycleSnapshot(roomId)
    await this.broadcastLifecycle(snapshot)
    return snapshot
  }

  /**
   * Begin AFK grace window when current player's time expires.
   * Assign next player as grace actor and schedule auto-skip.
   */
  async beginAfkGrace(roomId: string): Promise<void> {
    const client = await getClient()
    try {
      await client.query('BEGIN')
      const roomRes = await client.query<{
        id: string
        current_turn_user_id: string | null
        turn_number: number | null
        grace_window_seconds: number | null
        grace_actor_user_id: string | null
        grace_expires_at: Date | null
      }>(
        `SELECT id, current_turn_user_id, turn_number, grace_window_seconds, grace_actor_user_id, grace_expires_at
         FROM game_rooms
         WHERE id = $1
         FOR UPDATE`,
        [roomId],
      )
      const room = roomRes.rows[0]
      if (!room || !room.current_turn_user_id) {
        await client.query('ROLLBACK')
        return
      }
      // If already in grace and not expired, do nothing
      if (room.grace_actor_user_id && room.grace_expires_at && room.grace_expires_at > new Date()) {
        await client.query('ROLLBACK')
        return
      }

      // Load current game state to compute next actor
      const { gameStateCache } = await import('./cacheService')
      const raw =
        await gameStateCache.getGameState<import('../types/game').SerializedGameState>(roomId)
      if (!raw) {
        await client.query('ROLLBACK')
        return
      }
      const players = raw.players
      const currentId = raw.currentPlayer
      const currentIdx = players.findIndex((p) => p.id === currentId)
      if (currentIdx < 0) {
        await client.query('ROLLBACK')
        return
      }
      let nextIdx = (currentIdx + 1) % players.length
      while (players[nextIdx].isEliminated) {
        nextIdx = (nextIdx + 1) % players.length
        if (nextIdx === currentIdx) break
      }
      const graceActorId = players[nextIdx]?.id
      if (!graceActorId || graceActorId === currentId) {
        await client.query('ROLLBACK')
        return
      }

      const windowSeconds = Math.max(5, Math.trunc(room.grace_window_seconds ?? 20))
      await client.query(
        `UPDATE game_rooms
           SET grace_actor_user_id = $2,
               grace_expires_at = NOW() + ($3 * INTERVAL '1 second')
         WHERE id = $1`,
        [roomId, graceActorId, windowSeconds],
      )

      await client.query('COMMIT')

      // Broadcast lifecycle with grace fields
      await this.refreshLifecycle(roomId)

      // Schedule auto-skip when grace expires
      try {
        const idKey = `afk:${roomId}:turn:${room.turn_number ?? 0}:skip`
        await queueService.addDelayedGameAction(
          {
            gameId: roomId,
            playerId: graceActorId,
            action: { type: 'end_turn', playerId: room.current_turn_user_id, roomId },
            idempotencyKey: idKey,
            afkStage: 'skip',
          },
          windowSeconds * 1000,
          { idempotencyKey: idKey, priority: 10 },
        )
      } catch (e) {
        logger.warn('Failed to schedule AFK auto-skip', {
          roomId,
          error: e instanceof Error ? e.message : e,
        })
      }
    } catch (error) {
      await client.query('ROLLBACK')
      logger.error('Error beginning AFK grace', error)
    } finally {
      client.release()
    }
  }

  /**
   * Perform AFK skip of the current player's turn.
   */
  async skipAfkTurn(roomId: string, actorUserId: string | null, reason: 'auto' | 'actor' = 'auto') {
    const client = await getClient()
    try {
      await client.query('BEGIN')
      const roomRes = await client.query<{
        id: string
        current_turn_user_id: string | null
        turn_timer: number | null
        grace_actor_user_id: string | null
        grace_expires_at: Date | null
      }>(
        `SELECT id, current_turn_user_id, turn_timer, grace_actor_user_id, grace_expires_at FROM game_rooms WHERE id = $1 FOR UPDATE`,
        [roomId],
      )
      const room = roomRes.rows[0]
      if (!room || !room.current_turn_user_id) {
        await client.query('ROLLBACK')
        return
      }
      // Validate actor for manual skip
      if (reason === 'actor') {
        if (!actorUserId || room.grace_actor_user_id !== actorUserId) {
          await client.query('ROLLBACK')
          return
        }
        if (!room.grace_expires_at || room.grace_expires_at < new Date()) {
          await client.query('ROLLBACK')
          return
        }
      }

      const targetUserId = room.current_turn_user_id

      // Increment missed_turns
      await client.query(
        `UPDATE room_players
           SET missed_turns = missed_turns + 1
         WHERE room_id = $1 AND user_id = $2`,
        [roomId, targetUserId],
      )
      const missedRes = await client.query<{ missed_turns: number }>(
        `SELECT missed_turns FROM room_players WHERE room_id = $1 AND user_id = $2`,
        [roomId, targetUserId],
      )
      const strikes = missedRes.rows[0]?.missed_turns ?? 0

      // Clear grace fields immediately
      await client.query(
        `UPDATE game_rooms SET grace_actor_user_id = NULL, grace_expires_at = NULL WHERE id = $1`,
        [roomId],
      )

      await client.query('COMMIT')

      // Apply skip on game state and schedule next turn's timer
      const { GameService } = await import('./gameService')
      const gameService = new GameService()
      try {
        const result = await gameService.endTurn(roomId, targetUserId)
        // Broadcast phase change delta like socketService does
        try {
          const io = tryGetSocketServer()
          if (io) {
            const { DeltaBuilder } = await import('../types/deltaUpdates')
            const phaseDelta = DeltaBuilder.phaseChange(
              roomId,
              result.gameState.phase,
              result.gameState.currentPlayer,
              result.gameState.turn,
              result.reinforcementArmies,
            )
            const channel = `game:${roomId}`
            io.to(channel).emit('game-delta', phaseDelta)
          }
        } catch (ee) {
          logger.warn('Failed to emit phase change delta after AFK skip', {
            roomId,
            error: ee instanceof Error ? ee.message : ee,
          })
        }
      } catch (e) {
        logger.warn('AFK skip: endTurn failed', {
          roomId,
          targetUserId,
          error: e instanceof Error ? e.message : e,
        })
      }

      // If strikes >= 3, mark kicked and set host replacement pending
      if (strikes >= 3) {
        try {
          await query(
            `UPDATE room_players SET is_kicked = TRUE WHERE room_id = $1 AND user_id = $2`,
            [roomId, targetUserId],
          )
          await query(`UPDATE game_rooms SET replacement_pending_user_id = $2 WHERE id = $1`, [
            roomId,
            targetUserId,
          ])
        } catch (e) {
          logger.warn('Failed to mark player kicked / replacement pending', {
            roomId,
            targetUserId,
            error: e instanceof Error ? e.message : e,
          })
        }
      }

      // Schedule next AFK start for the new current player
      await this.scheduleTurnAutoAfk(roomId)

      // Broadcast updated lifecycle (includes replacement pending if applicable)
      await this.refreshLifecycle(roomId)
    } catch (error) {
      await client.query('ROLLBACK')
      logger.error('Error performing AFK skip', error)
    } finally {
      client.release()
    }
  }

  private async scheduleTurnAutoAfk(roomId: string) {
    try {
      const room = await this.gameRoomService.getRoomById(roomId)
      const seconds = room?.turnTimerSeconds ?? 0
      const currentTurnUserId = room?.currentTurnUserId ?? null
      if (!seconds || seconds <= 0 || !currentTurnUserId) return
      // Persist new turn_expires_at for UI
      try {
        await query(
          `UPDATE game_rooms
             SET turn_expires_at = NOW() + ($2 * INTERVAL '1 second')
           WHERE id = $1`,
          [roomId, seconds],
        )
      } catch (e) {
        logger.warn('Failed to persist turn_expires_at', {
          roomId,
          error: e instanceof Error ? e.message : e,
        })
      }
      const idKey = `afk:${roomId}:turn:${room?.turnNumber ?? 0}:start:${Date.now()}`
      await queueService.addDelayedGameAction(
        {
          gameId: roomId,
          playerId: currentTurnUserId,
          action: { type: 'end_turn', playerId: currentTurnUserId, roomId },
          idempotencyKey: idKey,
          afkStage: 'start',
        },
        seconds * 1000,
        { idempotencyKey: idKey, priority: 10 },
      )
      // Broadcast updated lifecycle so clients see the new timer
      await this.refreshLifecycle(roomId)
    } catch (error) {
      logger.warn('Failed to schedule AFK start for next player', {
        roomId,
        error: error instanceof Error ? error.message : error,
      })
    }
  }

  async kickAndNeutralize(roomId: string, userId: string) {
    await this.gameService.neutralizePlayerAndResolve(roomId, userId)
    // Persist DB flags
    await query(`UPDATE room_players SET is_kicked = TRUE WHERE room_id = $1 AND user_id = $2`, [
      roomId,
      userId,
    ])
  }
}
