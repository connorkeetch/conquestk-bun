import { getClient, query } from '../config/database'
import type { GameConfiguration, GamePhase, GameState } from '../types/game'
import type { GameLifecycleStatus, GameRoom } from '../types/gameRoom'
import { logger } from '../utils/logger'
import { GameRoomService } from './gameRoomService'
import { GameService } from './gameService'
import { tryGetSocketServer } from './socketRegistry'

interface ReadyPlayerRow {
  user_id: string
  is_ready: boolean
  ready_at: Date | string | null
  joined_at: Date | string | null
  team_id: number | null
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
      }>('SELECT status, turn_timer FROM game_rooms WHERE id = $1 FOR UPDATE', [roomId])

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
        SELECT user_id, is_ready, ready_at, joined_at, team_id
        FROM room_players
        WHERE room_id = $1
        ORDER BY joined_at ASC
      `,
        [roomId],
      )
      players = playersResult.rows

      const playerCount = players.length
      const readyCount = players.filter((player) => player.is_ready).length
      const allReady = playerCount >= 2 && readyCount === playerCount

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
          userId: player.userId,
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
      const matchingRoomPlayer = room?.players?.find((p) => p.userId === player.user_id)
      const normalizedTeamId =
        typeof player.team_id === 'number' && !Number.isNaN(player.team_id) ? player.team_id : null

      if (normalizedTeamId) {
        if (!teamAssignments[normalizedTeamId]) {
          teamAssignments[normalizedTeamId] = []
        }
        teamAssignments[normalizedTeamId].push(player.user_id)
      }

      return {
        userId: player.user_id,
        username: matchingRoomPlayer?.username,
        teamId: normalizedTeamId,
      }
    })

    const configOverrides: Partial<GameConfiguration> = {}

    if (room?.teamMode === 'teams' && room.numberOfTeams && room.numberOfTeams > 1) {
      configOverrides.allowTeamPlay = true
      configOverrides.teamMode = 'teams'
      configOverrides.numberOfTeams = room.numberOfTeams
      if (Object.keys(teamAssignments).length > 0) {
        configOverrides.teamAssignments = teamAssignments
      }
    }

    const gameState = await this.gameService.initializeGame(roomId, playerConfigs, configOverrides)

    await this.persistGameState(roomId, gameState)

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
  }

  private async broadcastLifecycle(snapshot: LifecycleSnapshot) {
    const io = tryGetSocketServer()
    if (!io || !snapshot.room) {
      return
    }

    const players = snapshot.room.players?.map((player) => ({
      userId: player.userId,
      username: player.username,
      joinedAt: player.joinedAt instanceof Date ? player.joinedAt.toISOString() : player.joinedAt,
      isReady: Boolean(player.isReady),
      readyAt:
        player.readyAt instanceof Date ? player.readyAt.toISOString() : (player.readyAt ?? null),
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
