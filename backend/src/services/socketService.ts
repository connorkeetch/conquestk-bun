import type * as jwt from 'jsonwebtoken'
import type { QueryResultRow } from 'pg'
import type { Server, Socket } from 'socket.io'
import { query } from '../config/database.js'
import { setupChatHandlers } from '../socket/chatHandlers.js'
import type {
  AttackAction,
  DeployAction,
  FortifyAction,
  GamePlayer,
  GameState,
  SerializedGameState,
  Territory,
} from '../types/game.js'
import type { ClientToServerEvents, ServerToClientEvents } from '../types/shared.js'
import { getJwtSecrets, verifyJwtWithAnySecret } from '../utils/jwtHelpers.js'
import { logger } from '../utils/logger.js'
import type { GameEvent } from './CommandProcessor.js'
import { gameStateCache } from './cacheService.js'
import { clanService } from './clanService.js'
import { eventLog } from './EventLog.js'
import { eloService, type PlayerRating } from './eloService.js'
import { GameActionProcessor } from './gameActionProcessor.js'
import { GameLifecycleService } from './gameLifecycleService.js'
import { GameRoomService } from './gameRoomService.js'
import { GameService } from './gameService.js'
import {
  matchPresenceMove,
  matchPresenceOffline,
  matchPresenceOnline,
} from './matchSvcIntegration.js'
import { socketPayloadMetrics } from './metricsService.js'
import { registerSocketServer } from './socketRegistry.js'

interface AuthenticatedSocket extends Socket<ClientToServerEvents, ServerToClientEvents> {
  userId?: string
  username?: string
  joinedGameRooms?: Set<string>
  joinedClanRoom?: string
  lastPingTime?: number
  latency?: number
}

// Socket latency tracking
const socketLatencies: Map<string, number[]> = new Map()

// Calculate p95 latency from samples
function calculateP95(samples: number[]): number {
  if (samples.length === 0) return 0
  const sorted = [...samples].sort((a, b) => a - b)
  const index = Math.ceil(sorted.length * 0.95) - 1
  return sorted[index] || 0
}

// Get latency metrics for monitoring
export function getSocketLatencyMetrics(): {
  avgLatency: number
  p95Latency: number
  maxLatency: number
  activeConnections: number
} {
  const allSamples: number[] = []
  for (const samples of socketLatencies.values()) {
    allSamples.push(...samples)
  }

  if (allSamples.length === 0) {
    return {
      avgLatency: 0,
      p95Latency: 0,
      maxLatency: 0,
      activeConnections: socketLatencies.size,
    }
  }

  const sum = allSamples.reduce((acc, val) => acc + val, 0)
  const avg = sum / allSamples.length
  const p95 = calculateP95(allSamples)
  const max = Math.max(...allSamples)

  return {
    avgLatency: Math.round(avg),
    p95Latency: Math.round(p95),
    maxLatency: Math.round(max),
    activeConnections: socketLatencies.size,
  }
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

// Compute JSON payload size in bytes (UTF-8)
function computePayloadBytes(data: unknown): number {
  try {
    const json = JSON.stringify(data)
    return Buffer.byteLength(json, 'utf8')
  } catch (error) {
    logger.warn('Failed to stringify payload for metrics (best-effort)', {
      error: error instanceof Error ? error.message : String(error),
    })
    return -1
  }
}

/**
 * Emit game:snapshot event to a room channel.
 * Used for initial state and resync only - events are used for real-time updates.
 */
function emitGameSnapshotToRoom(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  channel: string,
  payload: SerializedGameState,
) {
  const bytes = computePayloadBytes(payload)
  socketPayloadMetrics.record('game:snapshot', bytes)
  if (socketPayloadMetrics.shouldLog('game:snapshot')) {
    const stats = socketPayloadMetrics.snapshot('game:snapshot')
    if (stats) {
      logger.info('Socket payload stats', {
        event: 'game:snapshot',
        windowCount: stats.count,
        p50Bytes: stats.p50,
        p95Bytes: stats.p95,
        maxBytes: stats.max,
      })
    }
  }
  io.to(channel).emit('game:snapshot', payload)
}

/**
 * Emit game:snapshot event to a specific socket.
 * Used for initial state and resync only - events are used for real-time updates.
 */
function emitGameSnapshotToSocket(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  payload: SerializedGameState,
) {
  const bytes = computePayloadBytes(payload)
  socketPayloadMetrics.record('game:snapshot', bytes)
  if (socketPayloadMetrics.shouldLog('game:snapshot')) {
    const stats = socketPayloadMetrics.snapshot('game:snapshot')
    if (stats) {
      logger.info('Socket payload stats', {
        event: 'game:snapshot',
        windowCount: stats.count,
        p50Bytes: stats.p50,
        p95Bytes: stats.p95,
        maxBytes: stats.max,
      })
    }
  }
  socket.emit('game:snapshot', payload)
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

  // Build a lean client payload: only include fields used by the active UI.
  const s = state as GameState
  const players = s.players.map((p) => ({
    id: p.id,
    username: p.username,
    color: p.color,
    armies: p.armies,
    isEliminated: p.isEliminated,
    // Include competitive rating for consistent CP display in clients
    skillRating: (p as { skillRating?: number }).skillRating,
    ...(p.teamId === null
      ? { teamId: null }
      : typeof p.teamId === 'number'
        ? { teamId: p.teamId }
        : {}),
    treasures: p.treasures,
    territories: p.territories,
    cards: p.cards,
    mustCashInTreasures: p.mustCashInTreasures ?? false,
  })) as GamePlayer[]
  const board = s.board.map((t) => ({
    id: t.id,
    name: t.name,
    ownerId: t.ownerId,
    armies: t.armies,
    adjacentTerritories: t.adjacentTerritories,
    sector: t.sector,
    isCapital: t.isCapital,
    capitalOwnerId: t.capitalOwnerId,
    ...(t.coordinates ? { coordinates: t.coordinates } : {}),
  })) as Territory[]

  const cfg = s.gameConfig
  const gameConfig: import('../types/game.js').GameConfiguration = cfg
    ? {
        movementType: cfg.movementType,
        allowTeamPlay: cfg.allowTeamPlay,
        teamMode: cfg.teamMode,
        numberOfTeams: cfg.numberOfTeams ?? null,
        maxPlayers: cfg.maxPlayers,
        mapId: cfg.mapId,
        gameMode: cfg.gameMode,
        sectorBonuses: cfg.sectorBonuses,
        useTerritoryModifiers: cfg.useTerritoryModifiers,
        modifierDistribution: cfg.modifierDistribution,
        fogOfWar: cfg.fogOfWar,
        treasureConfig: cfg.treasureConfig,
        kingOfTheHill: cfg.kingOfTheHill,
      }
    : {
        movementType: 'classic_adjacent',
        allowTeamPlay: false,
        teamMode: 'none',
        numberOfTeams: null,
        maxPlayers: Array.isArray(s.players) ? s.players.length : 0,
        mapId: 'unknown',
        gameMode: 'classic',
        sectorBonuses: [],
        useTerritoryModifiers: false,
        modifierDistribution: 'none',
        fogOfWar: 'off',
        treasureConfig: undefined as unknown as import('../types/game.js').TreasureConfig,
        kingOfTheHill: undefined as unknown as import('../types/game.js').KingOfTheHillConfig,
      }

  const base: SerializedGameState = {
    roomId: s.roomId,
    phase: s.phase,
    currentPlayer: s.currentPlayer,
    turn: s.turn,
    // Provide authoritative roundNumber alongside turn for UI parity with DB
    // Round = ceil(turn / activePlayers) where active excludes eliminated players
    roundNumber: (() => {
      try {
        const active = Math.max(
          1,
          s.players.filter((p) => !p.isEliminated).length || s.players.length || 1,
        )
        return Math.max(1, Math.ceil(Math.max(1, s.turn) / active))
      } catch (error) {
        logger.warn('Failed to compute roundNumber (best-effort fallback)', {
          error: error instanceof Error ? error.message : String(error),
        })
        return Math.max(1, s.turn || 1)
      }
    })(),
    players,
    board,
    gameConfig,
    ...(typeof s.hasAttackedThisTurn === 'boolean'
      ? { hasAttackedThisTurn: s.hasAttackedThisTurn }
      : {}),
    ...(typeof s.mustCashInTreasures === 'boolean'
      ? { mustCashInTreasures: s.mustCashInTreasures }
      : {}),
    ...(s.resumePhaseAfterReinforcement !== undefined
      ? { resumePhaseAfterReinforcement: s.resumePhaseAfterReinforcement ?? null }
      : {}),
    ...(typeof s.resumeHasAttackedAfterReinforcement === 'boolean'
      ? { resumeHasAttackedAfterReinforcement: s.resumeHasAttackedAfterReinforcement }
      : {}),
    ...(typeof s.conqueredDuringTurn === 'boolean'
      ? { conqueredDuringTurn: s.conqueredDuringTurn }
      : {}),
    ...(s.kingOfTheHillState ? { kingOfTheHillState: s.kingOfTheHillState } : {}),
    ...(s.assassinationTargets ? { assassinationTargets: s.assassinationTargets } : {}),
    cards: Array.isArray(s.cards) ? s.cards : [],
    ...(s.treasureState ? { treasureState: s.treasureState } : {}),
    ...(s.movementTracking ? { movementTracking: s.movementTracking } : {}),
  }

  const extras: Partial<SerializedGameState> = {
    ...(s.lastBattleResult ? { lastBattleResult: s.lastBattleResult } : {}),
    ...(Array.isArray(s.reinforcementHistory) && s.reinforcementHistory.length > 0
      ? {
          reinforcementHistory: s.reinforcementHistory.map((entry) => ({
            playerId: entry.playerId,
            territoryId: entry.territoryId,
            armies: entry.armies,
            ts: entry.ts,
          })),
        }
      : {}),
    ...(s.reinforcementBaseline ? { reinforcementBaseline: { ...s.reinforcementBaseline } } : {}),
    ...(Array.isArray(s.fortifyHistory) && s.fortifyHistory.length > 0
      ? {
          fortifyHistory: s.fortifyHistory.map((entry) => ({
            playerId: entry.playerId,
            fromTerritoryId: entry.fromTerritoryId,
            toTerritoryId: entry.toTerritoryId,
            armies: entry.armies,
            ts: entry.ts,
          })),
        }
      : {}),
    ...(typeof s.rngSeed === 'string' ? { rngSeed: s.rngSeed } : {}),
    ...(s.rngState
      ? {
          rngState: {
            a: s.rngState.a,
            b: s.rngState.b,
            c: s.rngState.c,
            d: s.rngState.d,
          },
        }
      : {}),
    ...(s.capitalElimination ? { capitalElimination: s.capitalElimination } : {}),
    ...(s.capitalAssignments ? { capitalAssignments: { ...s.capitalAssignments } } : {}),
  }

  const baseWithExtras: SerializedGameState = {
    ...base,
    ...extras,
  }

  // Include territory modifiers when present (convert Map to plain object)
  const hasModifiers = (obj: unknown): obj is { territoryModifiers: unknown } =>
    Boolean(obj && typeof obj === 'object' && 'territoryModifiers' in obj)

  if (hasModifiers(state) && state.territoryModifiers instanceof Map) {
    const obj = Object.fromEntries(
      state.territoryModifiers.entries(),
    ) as SerializedGameState['territoryModifiers']
    return { ...baseWithExtras, territoryModifiers: obj }
  }
  if (
    hasModifiers(state) &&
    state.territoryModifiers &&
    !(state.territoryModifiers instanceof Map)
  ) {
    return {
      ...baseWithExtras,
      territoryModifiers: state.territoryModifiers as SerializedGameState['territoryModifiers'],
    }
  }
  return baseWithExtras
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
  const lifecycleService = new GameLifecycleService()

  /**
   * Emit a game event to all clients in a room
   */
  const _emitGameEvent = async (
    roomId: string,
    channel: string,
    event: GameEvent,
  ): Promise<void> => {
    try {
      // Persist event to event log
      await eventLog.appendEvent(event)

      // Emit event to all clients in room
      io.to(channel).emit('game:event', event)

      const bytes = computePayloadBytes(event)
      socketPayloadMetrics.record('game:event', bytes)

      logger.debug('Game event emitted', {
        gameId: roomId,
        eventType: event.type,
        version: event.version,
      })
    } catch (error) {
      logger.warn('Failed to emit game event (best-effort)', {
        roomId,
        eventType: event.type,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token
    if (!token) {
      return next(new Error('Authentication error'))
    }

    const secrets = getJwtSecrets()
    if (!secrets.length) {
      logger.error('FATAL: JWT secrets are not set')
      return next(new Error('Server configuration error'))
    }

    try {
      const { payload } = verifyJwtWithAnySecret<
        jwt.JwtPayload & { userId: string; sessionId?: string }
      >(token, secrets)
      if (!payload || typeof payload.userId !== 'string') {
        return next(new Error('Authentication error'))
      }

      socket.userId = payload.userId
      // username is optional in our tokens
      const maybeUsername = (payload as { username?: string }).username
      if (maybeUsername && typeof maybeUsername === 'string') {
        socket.username = maybeUsername
      }

      // Mirror minimal identity into socket.data for fetchSockets()
      const sockWithData = socket as unknown as { data?: Record<string, unknown> }
      sockWithData.data = {
        ...(sockWithData.data ?? {}),
        userId: payload.userId,
        ...(maybeUsername ? { username: maybeUsername } : {}),
      }
      next()
    } catch (e) {
      const err = e as Error & { name?: string; message?: string }
      let reason = 'Authentication error'
      const name = (err.name || '').toString()
      const msg = (err.message || '').toString()
      if (name === 'TokenExpiredError' || /expired/i.test(msg)) {
        reason = 'Authentication error: token expired'
      } else if (name === 'JsonWebTokenError') {
        if (/invalid signature/i.test(msg)) reason = 'Authentication error: invalid signature'
        else if (/jwt malformed/i.test(msg)) reason = 'Authentication error: malformed token'
        else reason = 'Authentication error: invalid token'
      } else if (name === 'NotBeforeError') {
        reason = 'Authentication error: token not active yet'
      }
      logger.warn('Socket auth failed', { name, message: msg })
      next(new Error(reason))
    }
  })

  io.on('connection', (socket: AuthenticatedSocket) => {
    logger.info(`User ${socket.userId} connected`)

    // Best-effort presence to matchsvc
    if (socket.userId) {
      void matchPresenceOnline(socket.userId, socket.id)
    }

    // Initialize latency tracking for this socket
    // Socket.io automatically tracks latency via ping/pong, we can access it later if needed
    if (socket.userId) {
      socketLatencies.set(socket.userId, [])

      // Measure latency periodically using game action round-trip time
      // This is done passively by tracking time between actions and responses
      // Real implementation would track emit->ack timing on critical game events
      socket.lastPingTime = Date.now()
    }

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
      withErrorHandler(
        socket,
        'join-room',
        async (
          roomId: string,
          ack?: (r: {
            ok: boolean
            roomId?: string
            joinedAt?: number
            error?: string
            code?: string
          }) => void,
        ) => {
          if (!roomId || typeof roomId !== 'string') {
            ack?.({ ok: false, error: 'Invalid room ID', code: 'invalid_room_id' })
            return
          }

          // Allow numeric room code as input
          const normalizedRoomId = /^\d+$/.test(roomId)
            ? await gameRoomService
                .getRoomByCode(Number.parseInt(roomId, 10))
                .then((r) => r?.id ?? '')
            : roomId
          if (!normalizedRoomId) {
            ack?.({ ok: false, error: 'Room not found', code: 'room_not_found' })
            return
          }

          const userId = requireUserId(socket)
          const isMember = await gameRoomService.isPlayerInRoom(normalizedRoomId, userId)
          if (!isMember) {
            ack?.({
              ok: false,
              code: 'not_a_member',
              error: 'You must be a member before subscribing to updates.',
            })
            return
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
          const basePlayer = {
            id: player?.id ?? player?.userId ?? userId,
            userId: player?.userId ?? userId,
            aiPlayerId: player?.aiPlayerId ?? null,
            username: player?.username ?? socket.username ?? 'Unknown player',
            joinedAt: (player?.joinedAt ?? new Date()).toISOString(),
            isReady: player?.isReady === undefined ? isAi : Boolean(player.isReady),
            readyAt: player?.readyAt instanceof Date ? player.readyAt.toISOString() : null,
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
          const normalizedPlayer = {
            ...basePlayer,
            ...(typeof player?.teamId === 'number'
              ? { teamId: player.teamId }
              : player?.teamId === null
                ? { teamId: null }
                : {}),
          }

          socket.to(channel).emit('player-joined', {
            roomId: normalizedRoomId,
            player: normalizedPlayer,
          })

          // Best-effort presence move to room
          void matchPresenceMove(userId, undefined, normalizedRoomId)

          const cachedState =
            await gameStateCache.getGameState<SerializedGameState>(normalizedRoomId)
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
              emitGameSnapshotToSocket(socket, finalState)
            }
          }

          // Ack successful join
          try {
            ack?.({ ok: true, roomId: normalizedRoomId, joinedAt: Date.now() })
          } catch (error) {
            logger.warn('Failed to ack join-room (best-effort)', {
              error: error instanceof Error ? error.message : String(error),
            })
          }

          logger.info(`User ${userId} subscribed to game channel ${channel}`)
        },
      ),
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
        // Best-effort presence move from room
        void matchPresenceMove(userId, normalizedRoomId, undefined)
        logger.info(`User ${userId} left game channel ${channel}`)
      }),
    )

    socket.on(
      'game-action',
      withErrorHandler(
        socket,
        'game-action',
        async (
          data: { roomId: string; action: unknown; idempotencyKey?: string },
          ack?: (r: { ok: boolean; queued?: boolean; acceptedAt?: number }) => void,
        ) => {
          if (!data || !data.roomId || !data.action) {
            throw new Error('Invalid game action data')
          }

          const userId = requireUserId(socket)
          const channel = getGameChannel(data.roomId)
          const normalizedAction = {
            ...(data.action as Record<string, unknown>),
            roomId: data.roomId,
            playerId: userId,
          } as unknown as import('../types/game.js').GameAction

          const t0 = Date.now()
          logger.info(
            `Processing game action inline: ${normalizedAction.type} for game ${data.roomId}`,
            {
              playerId: userId,
            },
          )

          try {
            const { realtimeMetrics } = await import('./metricsService.js')
            realtimeMetrics.recordAck(normalizedAction.type, Date.now() - t0)
          } catch (error) {
            logger.warn('Failed to record ack metric for inline game-action (best-effort)', {
              error: error instanceof Error ? error.message : String(error),
            })
          }

          if (typeof ack === 'function') {
            try {
              ack({ ok: true, queued: false, acceptedAt: Date.now() })
            } catch (error) {
              logger.warn('Failed to ack inline game-action (best-effort)', {
                error: error instanceof Error ? error.message : String(error),
              })
            }
          }

          try {
            switch (normalizedAction.type) {
              case 'deploy': {
                await gameActionProcessor.processDeployment(
                  data.roomId,
                  userId,
                  (normalizedAction as DeployAction).payload.territoryId,
                  (normalizedAction as DeployAction).payload.armies,
                )
                break
              }
              case 'attack': {
                await gameActionProcessor.processAttack(
                  data.roomId,
                  userId,
                  (normalizedAction as AttackAction).payload.fromTerritoryId,
                  (normalizedAction as AttackAction).payload.toTerritoryId,
                  (normalizedAction as AttackAction).payload?.armies,
                )
                break
              }
              case 'fortify': {
                await gameActionProcessor.processFortify(
                  data.roomId,
                  userId,
                  (normalizedAction as FortifyAction).payload.fromTerritoryId,
                  (normalizedAction as FortifyAction).payload.toTerritoryId,
                  (normalizedAction as FortifyAction).payload.armies,
                )
                break
              }
              case 'end_turn': {
                await gameActionProcessor.processEndTurn(data.roomId, userId)
                break
              }
              case 'go_back_to_reinforcement': {
                await gameActionProcessor.processGoBackToReinforcement(data.roomId, userId)
                break
              }
              case 'go_back_to_attack': {
                await gameActionProcessor.processGoBackToAttack(data.roomId, userId)
                break
              }
              case 'transfer_conquest': {
                await gameActionProcessor.processTransferConquest(
                  data.roomId,
                  userId,
                  (normalizedAction as import('../types/game.js').TransferConquestAction).payload
                    .fromTerritoryId,
                  (normalizedAction as import('../types/game.js').TransferConquestAction).payload
                    .toTerritoryId,
                  (normalizedAction as import('../types/game.js').TransferConquestAction).payload
                    .armies,
                )
                break
              }
              default: {
                const updatedState = await gameService.processGameAction(normalizedAction, userId)
                const serialized = serializeGameStateForClient(updatedState)
                if (serialized) {
                  emitGameSnapshotToRoom(io, channel, serialized)
                }
                break
              }
            }
            // Note: Event emission is handled by gameActionProcessor
          } catch (inlineError) {
            handleSocketError(socket, 'game-action:inline', inlineError)
          }
        },
      ),
    )

    // Simplified resync handler - just send current state
    socket.on(
      'request-state',
      withErrorHandler(
        socket,
        'request-state',
        async (data: { roomId?: string }, ack?: (r: { ok: boolean; error?: string }) => void) => {
          if (!data || typeof data.roomId !== 'string') {
            ack?.({ ok: false, error: 'Invalid state request' })
            return
          }

          const roomId = data.roomId
          const userId = requireUserId(socket)
          const isMember = await gameRoomService.isPlayerInRoom(roomId, userId)
          if (!isMember) {
            ack?.({ ok: false, error: 'Not a member of this game' })
            return
          }

          logger.info('State resync requested', {
            roomId,
            socketId: socket.id,
            userId,
          })

          try {
            const currentState = await gameService.getGameState(roomId)
            if (!currentState) {
              ack?.({ ok: false, error: 'Unable to load game state' })
              return
            }

            const filtered = filterGameStateForPlayer(currentState, userId)
            const serialized = serializeGameStateForClient(filtered)
            if (!serialized) {
              ack?.({ ok: false, error: 'Unable to serialize game state' })
              return
            }

            emitGameSnapshotToSocket(socket, serialized)
            ack?.({ ok: true })
          } catch (error) {
            logger.error('Resync failed', {
              roomId,
              error: error instanceof Error ? error.message : String(error),
            })
            throw error
          }
        },
      ),
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

    // (dev) No legacy endTurn event; use unified 'game-action' with type 'end_turn'

    // Deprecated 'transferConquestArmies' removed; clients should use 'game-action' with type 'transfer_conquest'

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

          const pending = room.replacementPendingUserId ?? null
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
            const stateRaw = await (await import('./cacheService.js')).gameStateCache.getGameState<
              import('../types/game.js').SerializedGameState
            >(roomId)
            if (!stateRaw) throw new Error('Game state not found')
            const state: import('../types/game.js').SerializedGameState = { ...stateRaw }
            const idx = state.players.findIndex((p) => p.id === targetUserId)
            if (idx < 0) throw new Error('Player not found in game state')
            state.players[idx] = {
              ...state.players[idx],
              isAi: true,
              aiDifficulty: aiDifficulty ?? 'recruit',
            }
            // Persist to DB + cache for durability
            await gameService.saveSnapshot(roomId, state)
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
              emitGameSnapshotToRoom(io, getGameChannel(roomId), finalState)
            }
          }
        },
      ),
    )

    socket.on(
      'turn:begin',
      withErrorHandler(socket, 'turn:begin', async (data) => {
        if (!data || !data.roomId) {
          throw new Error('Invalid turn acknowledgement data')
        }

        const userId = requireUserId(socket)
        await gameService.acknowledgeTurnStart(data.roomId, userId)
      }),
    )

    // (dev) Remove legacy 'goBackToReinforcement' event; use unified 'game-action'

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
          io.to(channel).volatile.emit('ping:territory', {
            roomId: data.roomId,
            territoryId: data.territoryId,
            userId,
            username: socket.username ?? null,
            createdAt: new Date().toISOString(),
          })
        },
      ),
    )

    // Heartbeat ping handler for connection health monitoring
    socket.on('ping', (callback?: () => void) => {
      // Immediately respond to ping to measure latency
      if (typeof callback === 'function') {
        callback()
      }
    })

    socket.on('disconnect', async () => {
      try {
        const userId = socket.userId
        if (!userId) {
          return
        }

        logger.info(`User ${userId} disconnected`)

        // Clean up latency tracking
        socketLatencies.delete(userId)
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
        // Best-effort presence offline
        void matchPresenceOffline(userId, socket.id)
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
              currentRating: userData.skill_rating ?? 800,
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
