import { getClient, query } from '../config/database'
import type { GameConfiguration, GamePhase, GameState } from '../types/game'
import type { GameLifecycleStatus, GameRoom } from '../types/gameRoom'
import { logger } from '../utils/logger'
import capitalGameService from './capitalGameService'
import { GameRoomService } from './gameRoomService'
import { GameService } from './gameService'
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
      }>('SELECT status, turn_timer, max_players FROM game_rooms WHERE id = $1 FOR UPDATE', [
        roomId,
      ])

      if (roomResult.rowCount === 0) {
        throw new Error('Room not found')
      }

      const rawStatus = roomResult.rows[0].status
      lifecycleStatus = this.normalizeStatus(rawStatus)
      turnTimer = roomResult.rows[0].turn_timer ?? 60

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
        SELECT id, user_id, ai_player_id, is_ready, ready_at, joined_at, team_id, is_ai, ai_difficulty, ai_personality_seed
        FROM room_players
        WHERE room_id = $1
        ORDER BY joined_at ASC
      `,
        [roomId],
      )
      players = playersResult.rows

      const playerCount = players.length
      const requiredCount = Math.max(2, roomResult.rows[0].max_players ?? 2)
      // Simplified: joining implies ready. Start when lobby is full.
      const allReady = playerCount === requiredCount

      if (allReady && lifecycleStatus === 'lobby') {
        shouldStart = true
        lifecycleStatus = 'initializing'
        await client.query(
          `
          UPDATE game_rooms
          SET status = 'initializing',
              lifecycle_phase = 'initializing',
              ready_check_started_at = NOW(),
              turn_number = 0,
              turn_expires_at = NULL
          WHERE id = $1
        `,
          [roomId],
        )
      }

      if (!allReady && lifecycleStatus === 'initializing') {
        lifecycleStatus = 'lobby'
        await client.query(
          `
          UPDATE game_rooms
          SET status = 'lobby',
              lifecycle_phase = 'lobby',
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
              lifecycle_phase = 'lobby',
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

      return {
        userId: configUserId,
        username: matchingRoomPlayer?.username,
        teamId: normalizedTeamId,
        isAi: player.is_ai === true || matchingRoomPlayer?.isAi === true,
        aiDifficulty: normalizedDifficulty,
        aiPersonalitySeed: personalitySeed,
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

    const gameState = await this.gameService.initializeGame(roomId, playerConfigs, configOverrides)

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

    await this.persistGameState(roomId, gameState)

    // Append lifecycle logs: CREATED (using room.createdAt if present) and STARTED (now)
    try {
      const createdAtIso = (room?.createdAt && new Date(room.createdAt).toISOString()) ||
        new Date().toISOString()
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
          lifecycle_phase = $2,
          turn_number = $3,
          current_turn_user_id = $4,
          turn_expires_at = CASE WHEN $5 > 0 THEN NOW() + ($5 * INTERVAL '1 second') ELSE NULL END,
          ready_check_started_at = NULL,
          started_at = COALESCE(started_at, NOW())
      WHERE id = $1
    `,
      [roomId, gameState.phase, gameState.turn, gameState.currentPlayer, turnTimer],
    )

    await query('UPDATE room_players SET is_ready = FALSE, ready_at = NULL WHERE room_id = $1', [
      roomId,
    ])

    const snapshot = await this.getLifecycleSnapshot(roomId)
    await this.broadcastLifecycle(snapshot)

    const io = tryGetSocketServer()
    if (io) {
      const serialized = this.toSerializableGameState(gameState)
      io.to(roomId).emit('game-update', serialized)
    }

    // Schedule auto end-turn if a timer is configured
    try {
      if (turnTimer && turnTimer > 0) {
        const { queueService } = await import('./queueService')
        const idKey = `auto-end:${roomId}:turn:${gameState.turn}`
        await queueService.addDelayedGameAction(
          {
            gameId: roomId,
            playerId: gameState.currentPlayer,
            action: { type: 'end_turn', playerId: gameState.currentPlayer, roomId },
            idempotencyKey: idKey,
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

  private async broadcastLifecycle(snapshot: LifecycleSnapshot) {
    const io = tryGetSocketServer()
    if (!io || !snapshot.room) {
      return
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
      lifecyclePhase: snapshot.room.lifecyclePhase ?? 'lobby',
      turnNumber: snapshot.room.turnNumber ?? 0,
      currentTurnUserId: snapshot.room.currentTurnUserId ?? null,
      turnExpiresAt: snapshot.room.turnExpiresAt ? snapshot.room.turnExpiresAt.toISOString() : null,
      readyCheckStartedAt: snapshot.room.readyCheckStartedAt
        ? snapshot.room.readyCheckStartedAt.toISOString()
        : null,
      readyStates: snapshot.readyStates,
      players,
    }

    io.to(snapshot.room.id).emit('lifecycle:update', payload)
    io.to(snapshot.room.id).emit('room-update', {
      id: snapshot.room.id,
      status: snapshot.room.status,
      lifecyclePhase: snapshot.room.lifecyclePhase,
      turnNumber: snapshot.room.turnNumber,
      currentTurnUserId: snapshot.room.currentTurnUserId,
      turnExpiresAt: snapshot.room.turnExpiresAt ? snapshot.room.turnExpiresAt.toISOString() : null,
      readyCheckStartedAt: snapshot.room.readyCheckStartedAt
        ? snapshot.room.readyCheckStartedAt.toISOString()
        : null,
      players,
    })
  }

  private async persistGameState(roomId: string, gameState: GameState) {
    const serializable = this.toSerializableGameState(gameState)

    await query(
      `
      INSERT INTO game_states (room_id, game_data, turn_number, current_player_id, phase)
      VALUES ($1, $2::jsonb, $3, $4, $5)
      ON CONFLICT (room_id) DO UPDATE
      SET game_data = EXCLUDED.game_data,
          turn_number = EXCLUDED.turn_number,
          current_player_id = EXCLUDED.current_player_id,
          phase = EXCLUDED.phase,
          updated_at = NOW()
    `,
      [
        roomId,
        JSON.stringify(serializable),
        gameState.turn,
        gameState.currentPlayer,
        gameState.phase,
      ],
    )
  }

  private toSerializableGameState(gameState: GameState) {
    let lifecyclePhase: GamePhase = gameState.phase
    if (lifecyclePhase === 'setup') {
      lifecyclePhase = 'reinforcement'
    }

    return {
      ...gameState,
      phase: lifecyclePhase,
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
}
