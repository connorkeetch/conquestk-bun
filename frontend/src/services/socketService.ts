import type {
  BattleResultDelta,
  ClientToServerEvents,
  ConversationCreateAck,
  ConversationCreatePayload,
  ConversationMembersUpdateAck,
  ConversationMembersUpdatePayload,
  GameDelta,
  MessageSendAck,
  MessageSendPayload,
  PlayerDelta,
  ReceiptReadAck,
  ServerToClientEvents,
  GameState as SharedGameState,
  TerritoryDelta,
} from '@conquestk/shared'
import type { InputFrame, TickChecksum } from '@conquestk/shared/types/lockstep'
import { toast } from 'react-hot-toast'
import { io, type Socket } from 'socket.io-client'
import { v4 as uuidv4 } from 'uuid'
import { getConquestRank } from '@/components/RankInsignia'
import { logger } from '@/utils/logger'
import {
  registerOptimisticAction,
  resolveOptimisticAction,
  rollbackAllOptimisticActions,
  rollbackOptimisticAction,
} from '@/utils/optimisticActions'
import { socketDebugger } from '@/utils/socketDebugger'
import { store } from '../store'
import {
  fetchGameState,
  setError,
  setGameState,
  setReinforcementArmies,
  updateGameState,
} from '../store/gameSlice'
import {
  loadInbox,
  loadUnreadSummary,
  messagesActions,
  refreshConversation,
} from '../store/messagesSlice'
import type { LifecycleUpdatePayload } from '../store/roomSlice'
import {
  addPlayerToRoom,
  applyLifecycleUpdate,
  removePlayerFromRoom,
  updateRoom,
} from '../store/roomSlice'
import {
  addClientLog,
  addOptimisticMarkers,
  addPing,
  clearOptimisticMarkers,
  clearPlacementHistory,
  recordBattleResult,
  removeOptimisticMarkers,
  setConnectionStatus,
  setDesyncDetected,
  setLockstepResyncInfo,
  setPlacementServerSpent,
  setResyncing,
} from '../store/uiRoomSlice'
import type { GameState } from '../types/game'
import type { GameRoom, Player as RoomPlayer } from '../types/gameRoom'
import type { NotificationType } from '../types/notification'
import audioService from './audioService'
import { LockstepSimulationManager } from './lockstepSimulationManager'
import { notificationService } from './notificationService'
import { reliabilityMetrics } from './reliabilityMetricsService'

type RoomLifecyclePayload = LifecycleUpdatePayload
type ReinforcementBaselineState = {
  reinforcementBaseline?: Record<string, number>
}

type LockstepResyncMeta = {
  reason:
    | 'frame_gap'
    | 'unsupported_commands'
    | 'missing_state'
    | 'checksum_mismatch'
    | 'snapshot_error'
    | 'manual'
  seq?: number
  expectedSeq?: number
  unsupported?: string[]
  checksum?: { server: number; local?: number }
  details?: Record<string, unknown>
}

const HEARTBEAT_INTERVAL_MS = 5000
const HEARTBEAT_TIMEOUT_MS = 3000
const ZOMBIE_CONNECTION_THRESHOLD_MS = 10_000
const LATENCY_WARNING_MS = 500
const ACTION_TIMEOUT_MS = 5000
const ACTION_RETRY_ATTEMPTS = 2
const RETRY_BACKOFF_BASE_MS = 500
const RETRY_BACKOFF_MAX_MS = 5000
const JOIN_BACKOFF_BASE_MS = 300
const JOIN_BACKOFF_MAX_MS = 1500
const AUTH_TOAST_THROTTLE_MS = 30_000
const CONNECTION_RESTORE_TOAST_DURATION_MS = 2000
const TURN_TOAST_DURATION_MS = 2500
const TURN_SUPPRESS_WINDOW_MS = 2000
const RESYNC_DELAY_MS = 100
const PING_TTL_MS = 3000
const ATTACK_THROTTLE_MS = 120

class SocketService {
  private socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null
  private lastReadEmitAt: Record<string, number> = {}
  private pendingRoomStateFetches = new Set<string>()
  private lastAuthToastAt: number | null = null
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null
  private lastPongTime: number = Date.now()
  private connectionLatency: number = 0
  private deltaSequenceTracking: Map<string, number> = new Map() // roomId -> last received sequence
  private pendingDeltaRequests: Set<string> = new Set() // Track in-flight delta requests
  private pendingActions: Map<string, Promise<{ ok: boolean; queued?: boolean; error?: string }>> =
    new Map() // Track in-flight actions by idempotency key
  private inFlightActionKeys: Map<string, string> = new Map() // action fingerprint -> idempotency key
  private lastActionEmitAt: Map<string, number> = new Map() // For throttling actions
  private joiningRooms: Map<string, number> = new Map() // roomId -> attempt count
  private processDeltaHandler?: (payload: GameDelta) => Promise<void>
  private lastTurnStartByRoom: Map<string, number> = new Map()
  private readonly lockstepEnabled = true
  private lockstepSeqByRoom: Map<string, number> = new Map()
  private lockstepPendingResync: Set<string> = new Set()
  private lockstepLastChecksum: Map<string, number> = new Map()
  private lockstepSim = new LockstepSimulationManager()
  // Placeholder for future convergence timers (no-op currently)
  private clearConfirmTimer(_roomId: string) {
    // intentionally empty; used as a hook for future state-convergence timers
  }

  private static stableReplacer(_key: string, value: unknown): unknown {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
        a.localeCompare(b),
      )
      return entries.reduce<Record<string, unknown>>((acc, [k, v]) => {
        acc[k] = v
        return acc
      }, {})
    }
    return value
  }

  private static stableStringify(value: unknown): string {
    return JSON.stringify(value, SocketService.stableReplacer)
  }

  private generateLockstepTraceId(roomId: string): string {
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `${roomId}:${crypto.randomUUID()}`
      }
    } catch {
      /* ignore */
    }
    return `${roomId}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`
  }

  private requestLockstepResync(roomId: string, meta?: LockstepResyncMeta) {
    if (!this.lockstepEnabled || !this.socket) return
    if (this.lockstepPendingResync.has(roomId)) return
    this.lockstepPendingResync.add(roomId)
    store.dispatch(setResyncing(true))
    store.dispatch(setDesyncDetected(true))

    const observedAt = Date.now()
    const traceId = this.generateLockstepTraceId(roomId)
    const info = {
      reason: meta?.reason ?? 'manual',
      roomId,
      traceId,
      seq: meta?.seq,
      expectedSeq: meta?.expectedSeq,
      unsupported: meta?.unsupported,
      checksum: meta?.checksum,
      details: meta?.details,
      observedAt,
    }
    store.dispatch(setLockstepResyncInfo(info))
    if (meta) {
      store.dispatch(
        addClientLog({
          text: this.formatLockstepResyncMessage(info),
          roomId,
          ts: observedAt,
        }),
      )
    }

    reliabilityMetrics.recordLockstepResync({
      traceId,
      roomId,
      reason: info.reason,
      seq: info.seq,
      expectedSeq: info.expectedSeq,
      checksum: info.checksum,
      unsupported: info.unsupported,
    })

    const fromSeq = this.lockstepSeqByRoom.get(roomId) ?? 0
    this.socket.emit(
      'game-action:resync-request',
      { roomId, fromSeq } as Parameters<ClientToServerEvents['game-action:resync-request']>[0],
      (response?: { ok: boolean; error?: string }) => {
        if (response && !response.ok) {
          logger.warn('Lockstep resync request rejected', {
            roomId,
            error: response.error,
          })
          this.lockstepPendingResync.delete(roomId)
          store.dispatch(setResyncing(false))
          store.dispatch(setLockstepResyncInfo(null))
          reliabilityMetrics.resolveLockstepResync(traceId, {
            success: false,
            roomId,
            reason: info.reason,
            meta: { error: response.error ?? 'unknown_error' },
          })
          store.dispatch(
            addClientLog({
              text: `Lockstep resync rejected: ${response.error ?? 'unknown error'}`,
              roomId,
              ts: Date.now(),
            }),
          )
        } else {
          logger.info('Lockstep resync requested', { roomId, fromSeq })
        }
      },
    )
  }

  private formatLockstepResyncMessage(info: {
    reason: LockstepResyncMeta['reason']
    seq?: number
    expectedSeq?: number
    unsupported?: string[]
    checksum?: { server: number; local?: number }
    details?: Record<string, unknown>
  }): string {
    switch (info.reason) {
      case 'frame_gap':
        return `Lockstep resync: frame gap (expected ${info.expectedSeq ?? 'n/a'}, received ${
          info.seq ?? 'n/a'
        })`
      case 'unsupported_commands':
        return `Lockstep resync: unsupported commands [${(info.unsupported ?? []).join(
          ', ',
        )}] at seq ${info.seq ?? 'n/a'}`
      case 'missing_state':
        return 'Lockstep resync: checksum arrived without baseline state'
      case 'checksum_mismatch':
        return `Lockstep resync: checksum mismatch at seq ${info.seq ?? 'n/a'} (server ${
          info.checksum?.server ?? 'n/a'
        }, local ${info.checksum?.local ?? 'n/a'})`
      case 'snapshot_error': {
        const detail = info.details?.reason ?? 'snapshot replay failed'
        const unsupported = info.unsupported ?? []
        const suffix = unsupported.length > 0 ? ` (unsupported: ${unsupported.join(', ')})` : ''
        return `Lockstep resync: ${detail}${suffix}`
      }
      default:
        return 'Lockstep resync: manual request'
    }
  }

  private handleLockstepFrame = (frame: InputFrame) => {
    if (!this.lockstepEnabled || !frame || typeof frame.matchId !== 'string') return
    const lastSeq = this.lockstepSeqByRoom.get(frame.matchId) ?? 0
    if (
      lastSeq > 0 &&
      frame.seq !== lastSeq + 1 &&
      !this.lockstepPendingResync.has(frame.matchId)
    ) {
      logger.warn('Lockstep frame gap detected; requesting resync', {
        matchId: frame.matchId,
        expected: lastSeq + 1,
        received: frame.seq,
      })
      this.requestLockstepResync(frame.matchId, {
        reason: 'frame_gap',
        expectedSeq: lastSeq + 1,
        seq: frame.seq,
      })
      return
    }

    const simResult = this.lockstepSim.applyFrame(frame.matchId, frame)
    if (!simResult.ok) {
      logger.warn('Lockstep simulation unable to apply frame', {
        matchId: frame.matchId,
        reason: simResult.reason,
        unsupported: simResult.unsupported,
        seq: frame.seq,
      })
      const resyncReason: LockstepResyncMeta['reason'] =
        simResult.reason === 'missing_state' ? 'missing_state' : 'unsupported_commands'
      this.requestLockstepResync(frame.matchId, {
        reason: resyncReason,
        seq: frame.seq,
        unsupported: simResult.unsupported,
        details: { reason: simResult.reason },
      })
      return
    }

    this.lockstepSeqByRoom.set(frame.matchId, frame.seq)

    const workingState = this.lockstepSim.getState(frame.matchId)
    if (workingState) {
      store.dispatch(setGameState(workingState as unknown as GameState))
    }
  }

  private handleLockstepChecksum = (payload: TickChecksum) => {
    if (!this.lockstepEnabled || !payload || typeof payload.matchId !== 'string') return
    this.lockstepLastChecksum.set(payload.matchId, payload.crc32)
    const lastSeq = this.lockstepSeqByRoom.get(payload.matchId) ?? 0
    if (payload.seq > lastSeq) {
      this.lockstepSeqByRoom.set(payload.matchId, payload.seq)
    }
    if (this.lockstepPendingResync.has(payload.matchId)) {
      return
    }
    try {
      const localChecksum = this.lockstepSim.checksum(payload.matchId)
      if (localChecksum === null) {
        logger.warn('Lockstep checksum received without baseline state', {
          matchId: payload.matchId,
        })
        this.requestLockstepResync(payload.matchId, { reason: 'missing_state' })
        return
      }
      if (localChecksum !== payload.crc32) {
        logger.warn('Lockstep checksum mismatch detected', {
          matchId: payload.matchId,
          serverSeq: payload.seq,
          serverChecksum: payload.crc32,
          localChecksum,
        })
        store.dispatch(setDesyncDetected(true))
        this.requestLockstepResync(payload.matchId, {
          reason: 'checksum_mismatch',
          seq: payload.seq,
          checksum: { server: payload.crc32, local: localChecksum },
        })
      }
    } catch (error) {
      logger.warn('Failed to compute local lockstep checksum', { error })
      this.requestLockstepResync(payload.matchId, {
        reason: 'snapshot_error',
        details: { reason: 'checksum_calculation_failed' },
      })
    }
  }

  private handleLockstepSnapshot = (payload: {
    matchId: string
    seq: number
    state: Record<string, unknown>
    frames: InputFrame[]
  }) => {
    if (!this.lockstepEnabled || !payload || typeof payload.matchId !== 'string') return
    this.lockstepPendingResync.delete(payload.matchId)
    this.lockstepLastChecksum.delete(payload.matchId)
    try {
      const baseline = payload.state as unknown as SharedGameState
      this.lockstepSim.setBaseline(payload.matchId, baseline)
      if (Array.isArray(payload.frames) && payload.frames.length > 0) {
        const frameResult = this.lockstepSim.applyFrames(payload.matchId, payload.frames)
        if (!frameResult.ok) {
          logger.warn('Lockstep snapshot frames contain unsupported commands', {
            matchId: payload.matchId,
            reason: frameResult.reason,
            unsupported: frameResult.unsupported,
          })
          this.requestLockstepResync(payload.matchId, {
            reason: frameResult.reason === 'missing_state' ? 'missing_state' : 'snapshot_error',
            unsupported: frameResult.unsupported,
            details: { reason: frameResult.reason },
          })
          return
        }
      }
      const workingState = this.lockstepSim.getState(payload.matchId)
      if (workingState) {
        store.dispatch(setGameState(workingState as unknown as GameState))
      } else {
        store.dispatch(setGameState(baseline as unknown as GameState))
      }
      store.dispatch(setDesyncDetected(false))
      const currentResync = store.getState().uiRoom.lockstepResync
      if (currentResync && currentResync.roomId === payload.matchId) {
        reliabilityMetrics.resolveLockstepResync(currentResync.traceId, {
          success: true,
          roomId: payload.matchId,
          reason: currentResync.reason,
          meta: { seq: payload.seq },
        })
      }
      store.dispatch(setLockstepResyncInfo(null))
    } catch (error) {
      logger.warn('Failed to apply lockstep snapshot (falling back to fetch)', { error })
      store.dispatch(setResyncing(false))
      store.dispatch(setDesyncDetected(true))
      const existingResync = store.getState().uiRoom.lockstepResync
      if (existingResync && existingResync.roomId === payload.matchId) {
        reliabilityMetrics.resolveLockstepResync(existingResync.traceId, {
          success: false,
          roomId: payload.matchId,
          reason: existingResync.reason,
          meta: { error: 'snapshot_apply_failed' },
        })
      }
      const observedAt = Date.now()
      const traceId = this.generateLockstepTraceId(payload.matchId)
      store.dispatch(
        setLockstepResyncInfo({
          reason: 'snapshot_error',
          roomId: payload.matchId,
          traceId,
          observedAt,
          details: { reason: 'snapshot_apply_failed' },
        }),
      )
      reliabilityMetrics.recordLockstepResync({
        traceId,
        roomId: payload.matchId,
        reason: 'snapshot_error',
        meta: { context: 'snapshot_apply_failed' },
      })
      store.dispatch(
        addClientLog({
          text: 'Lockstep snapshot apply failed; falling back to fetch',
          roomId: payload.matchId,
          ts: observedAt,
        }),
      )
    }

    if (!this.lockstepPendingResync.has(payload.matchId)) {
      store.dispatch(setResyncing(false))
    }

    this.lockstepSeqByRoom.set(payload.matchId, payload.seq)

    if (Array.isArray(payload.frames) && payload.frames.length > 0) {
      const lastFrame = payload.frames[payload.frames.length - 1]
      if (lastFrame && typeof lastFrame.seq === 'number') {
        this.lockstepSeqByRoom.set(payload.matchId, lastFrame.seq)
      }
    }

    void (store.dispatch(fetchGameState({ roomId: payload.matchId })) as Promise<unknown>)
  }

  private getActionFingerprint(
    roomId: string,
    action: { type: string; playerId?: string; payload?: unknown },
  ): string | null {
    const base = `${roomId}:${action.type}:${action.playerId ?? ''}`
    if (action.payload === undefined) {
      return base
    }
    try {
      return `${base}:${SocketService.stableStringify(action.payload)}`
    } catch (error) {
      logger.warn('Failed to build action fingerprint (falling back to unique key)', {
        roomId,
        actionType: action.type,
        error,
      })
      return null
    }
  }

  /**
   * Consolidated handler for room lifecycle changes.
   * Applies lifecycle updates, plays start audio, notifies, prefetches game state,
   * and prunes archived conversations on completion/abandonment.
   */
  private handleRoomLifecycleChange(lifecycle: RoomLifecyclePayload) {
    const { roomId, status } = lifecycle
    if (!roomId || !status) return

    // Play start audio on lobby -> active transition for current room
    try {
      const previousRoom = store.getState().room.currentRoom
      if (
        previousRoom &&
        previousRoom.id === roomId &&
        previousRoom.status === 'lobby' &&
        status === 'active'
      ) {
        audioService.playEffect('gamestart')
        audioService.playMusic()
      }
    } catch (error) {
      logger.warn('Failed to play start audio (best-effort)', { error })
    }

    // Apply lifecycle changes to Redux
    store.dispatch(applyLifecycleUpdate(lifecycle))

    // Lightweight notification when game starts (avoid duplicating on current room screen)
    try {
      if (status === 'active' && roomId) {
        const key = `ui.gamestart.notified:${roomId}`
        const alreadyNotified = (() => {
          try {
            return sessionStorage.getItem(key) === '1'
          } catch (error) {
            logger.warn('Failed to read game start notification flag', { error })
            return false
          }
        })()
        const onThisRoomScreen = (() => {
          try {
            const path = window.location?.pathname || ''
            return path.includes(`/room/${roomId}`)
          } catch (error) {
            logger.warn('Failed to inspect location for room notification', { error })
            return false
          }
        })()
        if (!alreadyNotified && !onThisRoomScreen) {
          notificationService.addNotification({
            type: 'game_started',
            title: 'Game started',
            message: 'Your game is live — jump in!',
            actionUrl: `/room/${roomId}`,
            actionLabel: 'Open game',
            metadata: { gameId: roomId },
          })
          try {
            sessionStorage.setItem(key, '1')
          } catch (error) {
            logger.warn('Failed to persist game start notification flag', { error })
          }
        }
      }
    } catch (error) {
      logger.warn('Game start notification flow failed (best-effort)', { error })
    }

    // Proactively fetch game state when activating/initializing
    try {
      const state = store.getState()
      const loadedRoomId = state.game.currentGame?.roomId ?? null
      if ((status === 'active' || status === 'initializing') && roomId && roomId !== loadedRoomId) {
        store.dispatch(fetchGameState({ roomId }))
      }
    } catch (error) {
      logger.warn('Prefetch after lifecycle change failed (best-effort)', { error })
    }

    // When games end or are abandoned, prune any archived game/team conversations
    if (status === 'completed' || status === 'abandoned') {
      const kinds: Array<import('../types/messages').ConversationSummary['kind']> = ['game', 'team']
      store.dispatch(messagesActions.pruneArchivedConversations({ kinds }))
    }
  }

  /**
   * HEALTH MONITORING: Start heartbeat to detect zombie connections
   * Pings server every 5 seconds and measures latency
   */
  private startHeartbeat() {
    // Clear any existing heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
    }

    this.heartbeatInterval = setInterval(() => {
      if (!this.socket?.connected) {
        return
      }

      const start = Date.now()
      const timeout = setTimeout(() => {
        // No pong received within timeout - connection is zombie
        logger.warn('Heartbeat timeout - connection appears dead, forcing reconnect')
        this.socket?.disconnect()
        this.connect()
      }, HEARTBEAT_TIMEOUT_MS)

      // Socket.io has built-in ping/pong, but we add our own for latency tracking
      this.socket.volatile.emit('ping', () => {
        clearTimeout(timeout)
        const latency = Date.now() - start
        this.connectionLatency = latency
        this.lastPongTime = Date.now()
        reliabilityMetrics.recordLatencySample(latency)

        // Update connection quality indicator
        if (latency > LATENCY_WARNING_MS) {
          logger.warn(`High connection latency: ${latency}ms`)
        }
      })
    }, HEARTBEAT_INTERVAL_MS)
  }

  /**
   * HEALTH MONITORING: Stop heartbeat on disconnect
   */
  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }

  /**
   * Get current connection health metrics
   */
  getConnectionHealth(): { latency: number; lastPong: number; isHealthy: boolean } {
    const timeSinceLastPong = Date.now() - this.lastPongTime
    const isHealthy =
      Boolean(this.socket?.connected) && timeSinceLastPong < ZOMBIE_CONNECTION_THRESHOLD_MS

    return {
      latency: this.connectionLatency,
      lastPong: this.lastPongTime,
      isHealthy,
    }
  }

  /**
   * RELIABILITY: Check if a delta sequence has gaps and request missing deltas
   */
  private async checkDeltaSequence(
    roomId: string,
    delta: { version?: number; type?: string },
  ): Promise<boolean> {
    // Skip if delta doesn't have a sequence number
    if (!delta.version) {
      return true // Allow it through
    }

    const lastSeq = this.deltaSequenceTracking.get(roomId) ?? 0
    const currentSeq = delta.version

    // First delta for this room
    if (lastSeq === 0) {
      this.deltaSequenceTracking.set(roomId, currentSeq)
      return true
    }

    if (currentSeq === lastSeq) {
      logger.debug('Received repeated delta version; processing without advancing sequence', {
        roomId,
        version: currentSeq,
      })
      return true
    }

    if (currentSeq < lastSeq) {
      logger.warn('Received stale delta - dropping', {
        roomId,
        lastSeq,
        received: currentSeq,
      })
      return false
    }

    // Expected next sequence number
    if (currentSeq === lastSeq + 1) {
      this.deltaSequenceTracking.set(roomId, currentSeq)
      return true
    }

    // GAP DETECTED: Missing deltas between lastSeq and currentSeq
    logger.warn('Delta sequence gap detected', {
      roomId,
      lastSeq,
      currentSeq,
      missing: currentSeq - lastSeq - 1,
    })
    // Request missing deltas (if not already requesting)
    const requestKey = `${roomId}:${lastSeq}-${currentSeq}`
    if (!this.pendingDeltaRequests.has(requestKey)) {
      this.pendingDeltaRequests.add(requestKey)

      try {
        await this.requestMissingDeltas(roomId, lastSeq + 1, currentSeq - 1)
      } finally {
        this.pendingDeltaRequests.delete(requestKey)
      }
    }

    // Accept the current delta even though there's a gap
    // The full state refetch will fix any inconsistencies
    this.deltaSequenceTracking.set(roomId, currentSeq)
    return true
  }

  /**
   * RELIABILITY: Request missing deltas from server
   */
  private async requestMissingDeltas(
    roomId: string,
    fromSeq: number,
    toSeq: number,
  ): Promise<void> {
    if (!this.socket) {
      return
    }

    logger.info('Requesting missing deltas', { roomId, fromSeq, toSeq })
    // ResyncBanner shows sync status, no toast needed for delta requests

    return new Promise((resolve) => {
      this.socket?.emit(
        'request-missing-deltas',
        { roomId, fromSeq, toSeq },
        (response?: { ok: boolean; deltas?: unknown[]; error?: string }) => {
          if (response?.ok) {
            if (response.deltas && response.deltas.length > 0) {
              logger.info('Received missing deltas', { count: response.deltas.length })
              const handler = this.processDeltaHandler
              const deltasArray = Array.isArray(response.deltas)
                ? (response.deltas as unknown[])
                : []
              if (handler) {
                void (async () => {
                  for (const raw of deltasArray) {
                    const delta = raw as GameDelta
                    const rId = (delta as { roomId?: string }).roomId
                    if (rId) {
                      const shouldProcess = await this.checkDeltaSequence(rId, delta)
                      if (!shouldProcess) {
                        continue
                      }
                    }
                    await handler(delta)
                  }
                })().finally(resolve)
                return
              }
              logger.warn('processDeltaHandler not initialized; falling back to full refetch')
              store.dispatch(fetchGameState({ roomId }))
            } else {
              // Server doesn't have deltas - trigger full state refetch
              logger.info('Server has no cached deltas - refetching full state')
              store.dispatch(fetchGameState({ roomId }))
            }
            resolve()
          } else {
            logger.error('Failed to request missing deltas', { error: response?.error })
            // Status shown in ResyncBanner, no need for toast
            resolve()
          }
        },
      )
    })
  }

  /**
   * RELIABILITY FIX: Send game action with mandatory acknowledgment and timeout
   * Supports optimistic updates, rollback, throttling, and idempotency
   */
  private async sendActionWithAck(
    roomId: string,
    action: { type: string; playerId?: string; payload?: unknown },
    options?: {
      idempotencyKey?: string
      timeoutMs?: number
      optimisticUpdate?: () => void
      rollback?: () => void
      optimisticMetadata?: { territoryIds?: string[]; label?: string }
      throttleKey?: string
      throttleMs?: number
      autoRetryOnTimeout?: boolean
      maxRetries?: number
    },
  ): Promise<{ ok: boolean; queued?: boolean; error?: string }> {
    const fingerprint = this.getActionFingerprint(roomId, action)
    const fromOptions = options?.idempotencyKey
    const fromFingerprint =
      fromOptions === undefined && fingerprint
        ? this.inFlightActionKeys.get(fingerprint)
        : undefined
    const idempotencyKey = fromOptions ?? fromFingerprint ?? `${roomId}:${action.type}:${uuidv4()}`
    const timeoutMs = options?.timeoutMs ?? ACTION_TIMEOUT_MS
    const autoRetry = options?.autoRetryOnTimeout ?? true
    const maxRetries = Math.max(1, options?.maxRetries ?? ACTION_RETRY_ATTEMPTS)

    // THROTTLING: Check if we should throttle this action
    if (options?.throttleKey && options?.throttleMs) {
      const lastAt = this.lastActionEmitAt.get(options.throttleKey) ?? 0
      if (Date.now() - lastAt < options.throttleMs) {
        return { ok: false, error: 'Throttled' }
      }
      this.lastActionEmitAt.set(options.throttleKey, Date.now())
    }

    // Check if already in-flight
    const pending = this.pendingActions.get(idempotencyKey)
    if (pending) {
      logger.info('Action already in-flight, reusing pending request', {
        idempotencyKey,
        fingerprint,
      })
      return pending
    }

    if (fingerprint) {
      this.inFlightActionKeys.set(fingerprint, idempotencyKey)
    }

    const optimisticKeys =
      options?.optimisticMetadata?.territoryIds?.filter((key): key is string => Boolean(key)) ?? []
    const optimisticLabel =
      options?.optimisticMetadata?.label ??
      action.type.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase())

    registerOptimisticAction(idempotencyKey, {
      apply: options?.optimisticUpdate,
      rollback: options?.rollback,
    })

    if (optimisticKeys.length > 0) {
      store.dispatch(
        addOptimisticMarkers({
          keys: optimisticKeys,
          actionId: idempotencyKey,
          label: optimisticLabel,
        }),
      )
    }

    reliabilityMetrics.recordActionAttempt()

    // Send action with ACK
    const actionPromise = this._sendActionInternal(roomId, action, idempotencyKey, timeoutMs)
    this.pendingActions.set(idempotencyKey, actionPromise)

    actionPromise.finally(() => {
      this.pendingActions.delete(idempotencyKey)
      if (fingerprint && this.inFlightActionKeys.get(fingerprint) === idempotencyKey) {
        this.inFlightActionKeys.delete(fingerprint)
      }
    })

    const result = await actionPromise
    let finalAck = result

    if (!result.ok) {
      const isTimeoutError =
        typeof result.error === 'string' && result.error.toLowerCase().includes('timeout')

      if (autoRetry && isTimeoutError) {
        let ack = result
        for (let attempt = 1; attempt <= maxRetries && !ack.ok; attempt += 1) {
          const backoff = Math.min(RETRY_BACKOFF_BASE_MS * 2 ** (attempt - 1), RETRY_BACKOFF_MAX_MS)
          logger.warn('Retrying game action after timeout', {
            roomId,
            actionType: action.type,
            attempt,
            maxAttempts: maxRetries,
            backoffMs: backoff,
          })
          await new Promise((resolve) => setTimeout(resolve, backoff))
          reliabilityMetrics.recordActionRetry()
          ack = await this._sendActionInternal(roomId, action, idempotencyKey, timeoutMs)
        }
        finalAck = ack
      }
    }

    if (finalAck.ok) {
      resolveOptimisticAction(idempotencyKey)
      reliabilityMetrics.recordActionSuccess()
    } else {
      rollbackOptimisticAction(idempotencyKey)
      reliabilityMetrics.recordActionFailure()
    }

    if (optimisticKeys.length > 0) {
      store.dispatch(removeOptimisticMarkers({ keys: optimisticKeys, actionId: idempotencyKey }))
    }

    return finalAck
  }

  /**
   * Internal helper to emit action and wait for ack
   */
  private async _sendActionInternal(
    roomId: string,
    action: { type: string; playerId?: string; payload?: unknown },
    idempotencyKey: string,
    timeoutMs: number,
  ): Promise<{ ok: boolean; queued?: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve({ ok: false, error: 'Not connected' })
        return
      }

      const timeoutHandle = setTimeout(() => {
        resolve({ ok: false, error: 'Timeout - server did not acknowledge action' })
      }, timeoutMs)

      try {
        this.socket.emit(
          'game-action',
          { roomId, action, idempotencyKey } as Parameters<ClientToServerEvents['game-action']>[0],
          (ack?: { ok: boolean; queued?: boolean; acceptedAt?: number }) => {
            clearTimeout(timeoutHandle)
            resolve(ack ?? { ok: true })
          },
        )
      } catch (error) {
        clearTimeout(timeoutHandle)
        resolve({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' })
      }
    })
  }

  connect() {
    // Reset any pending fetch tracking on a fresh connection attempt
    this.pendingRoomStateFetches.clear()
    this.lastTurnStartByRoom.clear()
    reliabilityMetrics.start()
    if (this.lockstepEnabled) {
      this.lockstepSeqByRoom.clear()
      this.lockstepPendingResync.clear()
      this.lockstepLastChecksum.clear()
      this.lockstepSim.reset()
      store.dispatch(setLockstepResyncInfo(null))
    }
    // Early return if already connected to the same socket
    if (this.socket?.connected) {
      return
    }

    // Clean up existing socket before creating a new one
    if (this.socket) {
      this.removeEventListeners()
      this.socket.disconnect()
      this.socket = null
    }

    const token = localStorage.getItem('token')
    if (!token) return

    // Use relative URL in production, absolute URL in development
    const socketUrl =
      import.meta.env.VITE_SOCKET_URL ||
      (import.meta.env.MODE === 'production' ? '' : 'http://localhost:5001')

    // Cast to typed Socket to enable strong event typing without generics on io()
    // PERFORMANCE FIX: Try WebSocket first for lower latency, fallback to polling if needed
    this.socket = io(socketUrl, {
      auth: { token },
      path: '/socket.io',
      // Try WebSocket first - provides lowest latency for real-time updates
      transports: ['websocket', 'polling'],
      upgrade: false, // Don't upgrade - stick with initial transport for consistency
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: RETRY_BACKOFF_BASE_MS,
      reconnectionDelayMax: RETRY_BACKOFF_MAX_MS,
      // Add timeout for connection attempts
      timeout: ACTION_TIMEOUT_MS * 2,
    }) as unknown as Socket<ServerToClientEvents, ClientToServerEvents>

    // Instrument socket for debugging if enabled
    if (socketDebugger.isEnabled()) {
      socketDebugger.instrumentSocket(this.socket)
    }

    this.setupEventListeners()
    // Immediately reflect connecting state
    store.dispatch(setConnectionStatus('connecting'))
  }

  disconnect() {
    if (this.socket) {
      this.removeEventListeners()
      this.stopHeartbeat()
      this.socket.disconnect()
      this.socket = null
    }
    this.pendingRoomStateFetches.clear()
    rollbackAllOptimisticActions()
    store.dispatch(clearOptimisticMarkers())
    if (this.lockstepEnabled) {
      this.lockstepSeqByRoom.clear()
      this.lockstepPendingResync.clear()
      this.lockstepLastChecksum.clear()
      this.lockstepSim.reset()
      store.dispatch(setLockstepResyncInfo(null))
    }
  }

  joinRoom(roomId: string) {
    if (!this.socket) return
    const attempts = this.joiningRooms.get(roomId) ?? 0
    if (attempts > 0) return // already attempting

    const maxAttempts = 5
    const tryJoin = (attempt: number) => {
      if (!this.socket) return
      this.joiningRooms.set(roomId, attempt)
      const backoff = Math.min(JOIN_BACKOFF_BASE_MS * 2 ** (attempt - 1), JOIN_BACKOFF_MAX_MS)
      this.socket.emit(
        'join-room',
        roomId,
        (ack?: {
          ok?: boolean
          roomId?: string
          joinedAt?: number
          error?: string
          code?: string
        }) => {
          if (ack?.ok) {
            this.joiningRooms.delete(roomId)
            return
          }
          if (attempt < maxAttempts) {
            setTimeout(() => tryJoin(attempt + 1), backoff)
          } else {
            this.joiningRooms.delete(roomId)
            // ConnectionBanner shows status, trigger resync without toast
            try {
              store.dispatch(fetchGameState({ roomId }))
            } catch (error) {
              logger.warn('Failed to display degraded realtime toast flow', { error })
            }
          }
        },
      )
    }
    tryJoin(1)
  }

  // REMOVED: spectateRoom() - simplified to single subscription path
  // Everyone uses joinRoom() now regardless of membership status

  leaveRoom(roomId: string) {
    if (!roomId) return
    // Allow immediate rejoin attempts (React StrictMode double-invokes effects)
    this.joiningRooms.delete(roomId)
    // Reset delta sequence tracking so rejoin starts fresh
    this.deltaSequenceTracking.delete(roomId)
    this.socket?.emit('leave-room', roomId)
  }

  /**
   * Unified gameplay action entrypoint.
   *
   * Do NOT call per-action helpers directly (deployArmies/attack/fortify/etc.).
   * Those methods are private to preserve client-side optimizations like
   * throttling, optimistic UI, and confirmation fallbacks. Always route
   * gameplay through this method (or the Redux thunks that call it).
   */
  // Accept a loose action envelope to support extended client-only action helpers
  sendGameAction(data: {
    roomId: string
    action: { type: string; playerId?: string; payload?: unknown }
  }) {
    const { roomId, action } = data
    if (this.lockstepEnabled) {
      void this.sendActionWithAck(roomId, action)
      return
    }
    // Route to specialized handlers to preserve throttling and optimistic UI where applicable
    try {
      switch (String(action?.type)) {
        case 'deploy': {
          const p = (action as { payload?: unknown }).payload
          if (p && typeof p === 'object') {
            const { territoryId, armies } = p as { territoryId?: unknown; armies?: unknown }
            if (typeof territoryId === 'string' && typeof armies === 'number') {
              this.deployArmies(roomId, territoryId, armies)
              return
            }
          }
          break
        }
        case 'attack': {
          const p = (action as { payload?: unknown }).payload
          if (p && typeof p === 'object') {
            const { fromTerritoryId, toTerritoryId, armies } = p as {
              fromTerritoryId?: unknown
              toTerritoryId?: unknown
              armies?: unknown
            }
            if (typeof fromTerritoryId === 'string' && typeof toTerritoryId === 'string') {
              this.attack(
                roomId,
                fromTerritoryId as string,
                toTerritoryId as string,
                typeof armies === 'number' ? (armies as number) : undefined,
              )
              return
            }
          }
          break
        }
        case 'fortify': {
          const p = (action as { payload?: unknown }).payload
          if (p && typeof p === 'object') {
            const { fromTerritoryId, toTerritoryId, armies } = p as {
              fromTerritoryId?: unknown
              toTerritoryId?: unknown
              armies?: unknown
            }
            if (
              typeof fromTerritoryId === 'string' &&
              typeof toTerritoryId === 'string' &&
              typeof armies === 'number'
            ) {
              this.fortify(
                roomId,
                fromTerritoryId as string,
                toTerritoryId as string,
                armies as number,
              )
              return
            }
          }
          break
        }
        case 'transfer_conquest': {
          const p = (action as { payload?: unknown }).payload
          if (p && typeof p === 'object') {
            const { fromTerritoryId, toTerritoryId, armies } = p as {
              fromTerritoryId?: unknown
              toTerritoryId?: unknown
              armies?: unknown
            }
            if (
              typeof fromTerritoryId === 'string' &&
              typeof toTerritoryId === 'string' &&
              typeof armies === 'number'
            ) {
              this.transferConquestArmies(
                roomId,
                fromTerritoryId as string,
                toTerritoryId as string,
                armies as number,
              )
              return
            }
          }
          break
        }
        case 'undo_fortify': {
          this.undoFortify(roomId)
          return
        }
        case 'end_turn': {
          this.endTurn(roomId)
          return
        }
        default:
          break
      }
    } catch {
      // If routing fails for any reason, fall through to generic emit
    }

    // Generic emit as a fallback
    this.socket?.emit(
      'game-action',
      data as unknown as Parameters<ClientToServerEvents['game-action']>[0],
    )
  }

  private async deployArmies(roomId: string, territoryId: string, armies: number) {
    // Store original state for rollback
    const state = store.getState()
    const territory = state.game.currentGame?.board.find((t) => t.id === territoryId)
    const originalArmies = territory?.armies ?? 0
    const originalPool = state.game.reinforcementArmies ?? 0

    const result = await this.sendActionWithAck(
      roomId,
      { type: 'deploy', payload: { territoryId, armies } },
      {
        optimisticUpdate: () => {
          // Apply optimistic update immediately
          const state = store.getState()
          const current = state.game.currentGame
          const userId = state.auth.user?.id
          if (!current || current.roomId !== roomId || !userId) return
          if (current.phase !== 'reinforcement' || current.currentPlayer !== userId) return

          const idx = current.board.findIndex((t) => t.id === territoryId)
          if (idx === -1) return

          const next = { ...current, board: [...current.board] }
          const target = { ...next.board[idx] }
          target.armies = originalArmies + armies
          next.board[idx] = target as (typeof next.board)[number]

          const newPool = Math.max(0, originalPool - armies)
          store.dispatch(updateGameState(next as unknown as GameState))
          store.dispatch(setReinforcementArmies(newPool))
        },
        rollback: () => {
          // Revert on failure
          const state = store.getState()
          const current = state.game.currentGame
          if (!current || current.roomId !== roomId) return

          const idx = current.board.findIndex((t) => t.id === territoryId)
          if (idx === -1) return

          const next = { ...current, board: [...current.board] }
          const target = { ...next.board[idx] }
          target.armies = originalArmies
          next.board[idx] = target as (typeof next.board)[number]

          store.dispatch(updateGameState(next as unknown as GameState))
          store.dispatch(setReinforcementArmies(originalPool))
          toast.error('Deploy failed')
        },
        optimisticMetadata: { territoryIds: [territoryId], label: 'Deploying' },
      },
    )

    if (!result.ok) {
      logger.warn('Deploy action failed', { territoryId, armies, error: result.error })
    }
  }

  private async attack(
    roomId: string,
    fromTerritoryId: string,
    toTerritoryId: string,
    armies?: number,
  ) {
    const key = `${roomId}:${fromTerritoryId}->${toTerritoryId}`

    const attackPayload =
      typeof armies === 'number'
        ? { fromTerritoryId, toTerritoryId, armies }
        : { fromTerritoryId, toTerritoryId }

    await this.sendActionWithAck(
      roomId,
      {
        type: 'attack',
        payload: attackPayload,
      },
      {
        throttleKey: key,
        throttleMs: ATTACK_THROTTLE_MS,
        optimisticUpdate: () => {
          // Play dice sound immediately for instant feedback
          try {
            audioService.playEffect('dice')
          } catch (error) {
            logger.warn('Failed to play dice sound (best-effort)', { error })
          }
        },
      },
    )
  }

  private async fortify(
    roomId: string,
    fromTerritoryId: string,
    toTerritoryId: string,
    armies: number,
  ) {
    const state = store.getState()
    const fromTerritory = state.game.currentGame?.board.find((t) => t.id === fromTerritoryId)
    const toTerritory = state.game.currentGame?.board.find((t) => t.id === toTerritoryId)
    const originalFrom = fromTerritory?.armies ?? 0
    const originalTo = toTerritory?.armies ?? 0

    await this.sendActionWithAck(
      roomId,
      { type: 'fortify', payload: { fromTerritoryId, toTerritoryId, armies } },
      {
        optimisticUpdate: () => {
          // Move armies visually
          const state = store.getState()
          const current = state.game.currentGame
          const userId = state.auth.user?.id
          if (!current || current.roomId !== roomId || !userId) return
          if (current.phase !== 'fortify' || current.currentPlayer !== userId) return

          const fromIdx = current.board.findIndex((t) => t.id === fromTerritoryId)
          const toIdx = current.board.findIndex((t) => t.id === toTerritoryId)
          if (fromIdx === -1 || toIdx === -1) return

          const next = { ...current, board: [...current.board] }
          const from = { ...next.board[fromIdx] }
          const to = { ...next.board[toIdx] }
          from.armies = Math.max(0, originalFrom - armies)
          to.armies = originalTo + armies
          next.board[fromIdx] = from as (typeof next.board)[number]
          next.board[toIdx] = to as (typeof next.board)[number]

          store.dispatch(updateGameState(next as unknown as GameState))
        },
        rollback: () => {
          // Revert on failure
          const state = store.getState()
          const current = state.game.currentGame
          if (!current || current.roomId !== roomId) return

          const fromIdx = current.board.findIndex((t) => t.id === fromTerritoryId)
          const toIdx = current.board.findIndex((t) => t.id === toTerritoryId)
          if (fromIdx === -1 || toIdx === -1) return

          const next = { ...current, board: [...current.board] }
          const from = { ...next.board[fromIdx] }
          const to = { ...next.board[toIdx] }
          from.armies = originalFrom
          to.armies = originalTo
          next.board[fromIdx] = from as (typeof next.board)[number]
          next.board[toIdx] = to as (typeof next.board)[number]

          store.dispatch(updateGameState(next as unknown as GameState))
          toast.error('Fortify failed')
        },
        optimisticMetadata: { territoryIds: [fromTerritoryId, toTerritoryId], label: 'Fortifying' },
      },
    )
  }

  private transferConquestArmies(
    roomId: string,
    fromTerritoryId: string,
    toTerritoryId: string,
    armies: number,
  ) {
    // Migrate to unified game-action: transfer_conquest
    this.sendGameAction({
      roomId,
      action: {
        type: 'transfer_conquest',
        roomId,
        playerId: (store.getState().auth.user?.id as string | undefined) ?? '',
        payload: { fromTerritoryId, toTerritoryId, armies },
      } as unknown as Parameters<ClientToServerEvents['game-action']>[0]['action'],
    })
  }

  private async undoFortify(roomId: string) {
    await this.sendActionWithAck(roomId, { type: 'undo_fortify' })
  }

  private async endTurn(roomId: string) {
    await this.sendActionWithAck(roomId, { type: 'end_turn' })
  }

  beginTurn(roomId: string) {
    this.socket?.emit('turn:begin', { roomId })
  }

  sendConversationMessage(payload: MessageSendPayload, callback?: (ack: MessageSendAck) => void) {
    this.socket?.emit('message.send', payload, callback)
  }

  markConversationReadViaSocket(conversationId: string, callback?: (ack: ReceiptReadAck) => void) {
    const now = Date.now()
    const last = this.lastReadEmitAt[conversationId] ?? 0
    if (now - last < 1000) {
      return
    }
    this.lastReadEmitAt[conversationId] = now
    this.socket?.emit('receipt.read', { conversationId }, callback)
  }

  startConversationTyping(conversationId: string) {
    this.socket?.emit('typing.start', { conversationId })
  }

  stopConversationTyping(conversationId: string) {
    this.socket?.emit('typing.stop', { conversationId })
  }

  createConversation(
    payload: ConversationCreatePayload,
    callback?: (ack: ConversationCreateAck) => void,
  ) {
    this.socket?.emit('conversation.create', payload, callback)
  }

  updateConversationMembers(
    payload: ConversationMembersUpdatePayload,
    callback?: (ack: ConversationMembersUpdateAck) => void,
  ) {
    this.socket?.emit('conversation.members.update', payload, callback)
  }

  // Convenience: leave a conversation by removing the current user membership
  leaveConversation(
    conversationId: string,
    callback?: (ack: ConversationMembersUpdateAck) => void,
  ) {
    const userId = store.getState().auth.user?.id
    if (!userId) {
      callback?.({ ok: false, error: 'Not authenticated', code: 'auth_required' })
      return
    }
    this.updateConversationMembers({ conversationId, remove: [userId] }, callback)
  }

  // Convenience: archive a conversation (requires appropriate permissions server-side)
  archiveConversation(
    conversationId: string,
    callback?: (ack: ConversationMembersUpdateAck) => void,
  ) {
    this.updateConversationMembers({ conversationId, archive: true }, callback)
  }

  // Generic emit/on/off wrappers for convenience in feature areas
  emit<T extends keyof ClientToServerEvents>(
    event: T,
    ...args: Parameters<ClientToServerEvents[T]>
  ) {
    this.socket?.emit(event, ...args)
  }

  on<T extends keyof ServerToClientEvents>(event: T, handler: ServerToClientEvents[T]) {
    const socket = this.socket
    if (!socket) return
    socket.on(event, handler as never)
  }

  off<T extends keyof ServerToClientEvents>(event: T, handler: ServerToClientEvents[T]) {
    const socket = this.socket
    if (!socket) return
    socket.off(event, handler as never)
  }

  getSocket() {
    return this.socket
  }

  private setupEventListeners() {
    if (!this.socket) return

    this.socket.on('connect', () => {
      store.dispatch(setConnectionStatus('connected'))
      store.dispatch(loadUnreadSummary())
      store.dispatch(loadInbox())
      reliabilityMetrics.recordConnectionUp()

      // Start health monitoring
      this.startHeartbeat()

      // CONNECTION STATE RECOVERY: Check if Socket.io recovered the connection
      // If recovered, the server replayed missed events automatically
      const socket = this.socket
      const recovered = (socket as unknown as { recovered?: boolean })?.recovered ?? false

      if (recovered) {
        logger.info('✅ Connection recovered - server replayed missed events')
        toast('Connection restored', {
          icon: '✅',
          duration: CONNECTION_RESTORE_TOAST_DURATION_MS,
        })
      } else {
        logger.info('New connection established - fetching fresh state')
      }

      // CRITICAL FIX: Rejoin active room on reconnect to restore subscriptions
      // This ensures the client re-subscribes to game channels after any disconnect
      try {
        const state = store.getState()
        const roomId = state.room.currentRoom?.id ?? state.game.currentGame?.roomId ?? null
        const userId = state.auth.user?.id
        if (roomId && userId) {
          // Re-join the game channel (everyone uses joinRoom now)
          this.joinRoom(roomId)

          // CRITICAL: Force a full state refetch after reconnection
          // This ensures we catch up on any missed events during disconnect
          // Skip refetch if connection was recovered (events already replayed)
          if (!recovered) {
            setTimeout(() => {
              try {
                // ResyncBanner shows sync status, no need for toast
                store.dispatch(fetchGameState({ roomId }))
              } catch (error) {
                // Best-effort recovery
                logger.warn('Failed to refetch game state after reconnect', error)
              }
            }, RESYNC_DELAY_MS) // Small delay to allow room subscription to complete
          }
        }
      } catch (error) {
        // best-effort; if state not accessible, skip rejoin
        logger.warn('Failed to rejoin room on reconnect', { error })
      }
    })

    this.socket.on('disconnect', () => {
      rollbackAllOptimisticActions()
      store.dispatch(clearOptimisticMarkers())
      store.dispatch(setConnectionStatus('disconnected'))
      // Stop heartbeat monitoring
      this.stopHeartbeat()
      reliabilityMetrics.recordConnectionDown()
    })

    this.socket.on('connect_error', (err) => {
      // Reflect disconnect state immediately
      store.dispatch(setConnectionStatus('disconnected'))
      rollbackAllOptimisticActions()
      store.dispatch(clearOptimisticMarkers())
      const raw = (err && (err as Error).message) || 'Connection error'
      const msg = String(raw)
      const lower = msg.toLowerCase()
      // Throttle auth toasts to once every 30s
      const now = Date.now()
      const canToast = !this.lastAuthToastAt || now - this.lastAuthToastAt > AUTH_TOAST_THROTTLE_MS
      const toastOpts = { id: 'socket-auth', position: 'bottom-center' as const, duration: 6000 }

      // Only surface message for real auth/config failures
      if (canToast) {
        if (lower.includes('token expired')) {
          toast.error(
            'Session expired. Please sign in again to restore realtime updates.',
            toastOpts,
          )
          this.lastAuthToastAt = now
        } else if (
          lower.includes('invalid signature') ||
          lower.includes('malformed token') ||
          lower.includes('invalid token')
        ) {
          toast.error('Authentication failed. Please sign out and sign in again.', toastOpts)
          this.lastAuthToastAt = now
        } else if (lower.includes('server configuration error')) {
          toast.error(
            'Realtime temporarily unavailable (server config). Please try again shortly.',
            toastOpts,
          )
          this.lastAuthToastAt = now
        } else if (lower.includes('authentication error') || /unauthoriz/.test(lower)) {
          toast.error(
            'Authentication error. Please sign in again to restore realtime updates.',
            toastOpts,
          )
          this.lastAuthToastAt = now
        }
      }
    })

    this.socket.on('player-joined', (data) => {
      const payload = data as Parameters<ServerToClientEvents['player-joined']>[0]

      if (!payload?.roomId || !payload?.player) {
        return
      }

      const normalizedPlayer: RoomPlayer = {
        id: payload.player.id,
        ...(payload.player.userId !== undefined ? { userId: payload.player.userId ?? null } : {}),
        ...(payload.player.aiPlayerId !== undefined
          ? { aiPlayerId: payload.player.aiPlayerId ?? null }
          : {}),
        username: payload.player.username,
        joinedAt: payload.player.joinedAt,
        isReady: payload.player.isReady,
        readyAt: payload.player.readyAt,
        ...(payload.player.teamId !== undefined ? { teamId: payload.player.teamId } : {}),
        isAi: payload.player.isAi,
        ...(payload.player.aiDifficulty !== undefined
          ? { aiDifficulty: payload.player.aiDifficulty }
          : {}),
        ...(payload.player.aiPersonalitySeed !== undefined
          ? { aiPersonalitySeed: payload.player.aiPersonalitySeed }
          : {}),
        ...(typeof (payload.player as { selectedColor?: string | null }).selectedColor !==
        'undefined'
          ? {
              selectedColor:
                (payload.player as { selectedColor?: string | null }).selectedColor ?? null,
            }
          : {}),
      }

      store.dispatch(
        addPlayerToRoom({
          roomId: payload.roomId,
          player: normalizedPlayer,
        }),
      )
    })

    this.socket.on('turn:start', (incoming) => {
      const payload = incoming as Parameters<ServerToClientEvents['turn:start']>[0]
      const { roomId, playerId, username, phase, reinforcementArmies, turn } = payload
      if (!roomId || !playerId) {
        return
      }

      const now = Date.now()
      this.lastTurnStartByRoom.set(roomId, now)

      const state = store.getState()
      const currentUserId = state.auth.user?.id ?? null
      const isMyTurn = currentUserId === playerId
      const displayName = username ?? 'A player'

      try {
        store.dispatch(
          addClientLog({
            roomId,
            text: `${displayName} began turn ${turn}`,
          }),
        )
      } catch {
        /* ignore client log failures */
      }

      if (isMyTurn && phase === 'reinforcement' && typeof reinforcementArmies === 'number') {
        const armies = Math.max(0, reinforcementArmies)
        store.dispatch(setReinforcementArmies(armies))
        store.dispatch(setPlacementServerSpent(0))
        store.dispatch(clearPlacementHistory())
      }

      if (isMyTurn) {
        try {
          notificationService.addNotification({
            type: 'turn_reminder',
            title: "It's your turn!",
            message:
              phase === 'reinforcement'
                ? 'Reinforcement phase has begun.'
                : `Current phase: ${phase}`,
            read: false,
            actionUrl: `/room/${roomId}`,
            actionLabel: 'Go to game',
            metadata: { gameId: roomId },
          })
        } catch {
          /* ignore notification failures */
        }

        try {
          audioService.playEffect('turn')
        } catch {
          /* ignore audio issues */
        }

        try {
          toast.success(
            phase === 'reinforcement' ? 'Your reinforcement phase has started.' : "It's your turn!",
            { duration: TURN_TOAST_DURATION_MS },
          )
        } catch {
          /* ignore toast errors */
        }
      }
    })

    this.socket.on('player-left', (data) => {
      const payload = data as Parameters<ServerToClientEvents['player-left']>[0]

      if (!payload?.roomId || !payload?.playerSlotId) {
        return
      }

      store.dispatch(
        removePlayerFromRoom({
          roomId: payload.roomId,
          playerSlotId: payload.playerSlotId,
          ...(payload.userId !== undefined ? { userId: payload.userId ?? null } : {}),
          ...(payload.aiPlayerId !== undefined ? { aiPlayerId: payload.aiPlayerId ?? null } : {}),
        }),
      )
    })

    // Delta update handler - efficient real-time updates
    const processDelta = async (payload: GameDelta) => {
      const state = store.getState()
      const viewerId = state.auth.user?.id ?? null
      const currentGame = state.game.currentGame

      // Any delta for this room confirms activity — clear pending convergence timer
      if (payload?.roomId) {
        this.clearConfirmTimer(payload.roomId)
      }

      const roomId = payload.roomId
      const recentTurnEventTs =
        typeof roomId === 'string' ? this.lastTurnStartByRoom.get(roomId) : undefined
      const skipTurnStartFromEvent =
        typeof roomId === 'string' &&
        typeof recentTurnEventTs === 'number' &&
        Date.now() - recentTurnEventTs < TURN_SUPPRESS_WINDOW_MS
      if (skipTurnStartFromEvent && typeof roomId === 'string') {
        this.lastTurnStartByRoom.delete(roomId)
      }

      if (!currentGame || currentGame.roomId !== payload.roomId) {
        if (!this.pendingRoomStateFetches.has(payload.roomId)) {
          this.pendingRoomStateFetches.add(payload.roomId)
          void (store.dispatch(fetchGameState({ roomId: payload.roomId })) as Promise<unknown>)
            .catch(() => {
              /* swallow fetch errors - fallback is manual refresh */
            })
            .finally(() => {
              this.pendingRoomStateFetches.delete(payload.roomId)
            })
        }
        return
      }

      // DESYNC DETECTION: Check if we need to resync due to version mismatch or state corruption
      if (state.game.needsResync) {
        logger.warn('Desync detected - triggering full state refetch', {
          roomId: payload.roomId,
          deltaType: payload.type,
        })
        reliabilityMetrics.recordDesyncDetection()

        if (!this.pendingRoomStateFetches.has(payload.roomId)) {
          this.pendingRoomStateFetches.add(payload.roomId)

          // ResyncBanner shows user-facing sync status
          void (store.dispatch(fetchGameState({ roomId: payload.roomId })) as Promise<unknown>)
            .then(() => {
              logger.info('Desync recovery successful')
              // ResyncBanner will hide automatically when desync flag clears
              reliabilityMetrics.recordDesyncRecovery()
            })
            .catch((error) => {
              logger.error('Desync recovery failed', error)
              // ResyncBanner stays visible with error, no toast needed
            })
            .finally(() => {
              this.pendingRoomStateFetches.delete(payload.roomId)
            })
        }
        return
      }

      const currentUserId = viewerId

      // Handle a single turn-start notification (avoid per-phase spam)
      // Only notify when the turn first switches to the current user.
      if (payload.type === 'PHASE_CHANGE' && payload.currentPlayer === currentUserId) {
        const wasMyTurn = currentGame?.currentPlayer === currentUserId
        if (!wasMyTurn && !skipTurnStartFromEvent) {
          notificationService.addNotification({
            type: 'turn_reminder',
            title: "It's your turn!",
            message: `It's your turn - ${payload.phase} phase`,
            read: false,
            ...(payload.roomId ? { actionUrl: `/room/${payload.roomId}` } : {}),
            actionLabel: 'Go to game',
            metadata: {
              gameId: payload.roomId,
            },
          })
          audioService.playEffect('turn')
        }
      }

      // Reset local placement tracking at the start of reinforcement
      if (payload.type === 'PHASE_CHANGE') {
        if (payload.phase === 'reinforcement') {
          store.dispatch(clearPlacementHistory())
          // Server may include reinforcementArmies; server-spent resets to 0 at phase start
          store.dispatch(setPlacementServerSpent(0))
        }
      }

      // Handle battle result audio and record dice recap
      if (payload.type === 'BATTLE_RESULT') {
        const br = (payload as BattleResultDelta).battleResult
        if (br.conquered) {
          audioService.playEffect('victory')
        } else {
          audioService.playEffect('defeat')
        }
        try {
          store.dispatch(
            recordBattleResult({
              fromId: br.fromTerritory.id,
              toId: br.toTerritory.id,
              ...(br.attackerId !== undefined ? { attackerId: br.attackerId ?? null } : {}),
              ...(br.defenderId !== undefined ? { defenderId: br.defenderId ?? null } : {}),
              attackerDice: Array.isArray(br.attackerDice) ? br.attackerDice : [],
              defenderDice: Array.isArray(br.defenderDice) ? br.defenderDice : [],
              attackerLosses: br.attackerLosses ?? 0,
              defenderLosses: br.defenderLosses ?? 0,
              conquered: Boolean(br.conquered),
            }),
          )
        } catch (error) {
          logger.warn('Failed to append battle result to UI (best-effort)', { error })
        }
      }

      // Basic desync checks before applying - read fresh state right before validation
      try {
        if (payload.type === 'TERRITORY_UPDATE') {
          const td = payload as TerritoryDelta
          if (!currentGame.board.some((t) => t.id === td.territoryId)) {
            store.dispatch(setDesyncDetected(true))
            return
          }
        } else if (payload.type === 'PLAYER_UPDATE') {
          const pd = payload as PlayerDelta
          if (!currentGame.players.some((p) => p.id === pd.playerId)) {
            store.dispatch(setDesyncDetected(true))
            return
          }
        } else if (payload.type === 'BATTLE_RESULT') {
          const br = (payload as BattleResultDelta).battleResult
          if (
            !currentGame.board.some((t) => t.id === br.fromTerritory.id) ||
            !currentGame.board.some((t) => t.id === br.toTerritory.id)
          ) {
            store.dispatch(setDesyncDetected(true))
            return
          }
        }
      } catch {
        store.dispatch(setDesyncDetected(true))
        return
      }

      // Apply delta to Redux store
      // Legacy delta path removed.

      // Align room lifecycle status with end-of-game signals immediately
      try {
        if (payload.type === 'GAME_END') {
          store.dispatch(updateRoom({ id: payload.roomId, status: 'completed' }))
        } else if (payload.type === 'PHASE_CHANGE') {
          const p = payload as import('@shared/types').PhaseChangeDelta
          if (p.phase === 'finished') {
            store.dispatch(updateRoom({ id: payload.roomId, status: 'completed' }))
          }
        }
      } catch (error) {
        logger.warn('Failed to align room status with end-of-game signals', { error })
      }
    }

    this.processDeltaHandler = processDelta

    // Legacy `game-delta` listeners removed; lockstep frames now handle reconciliation.
    if (this.lockstepEnabled) {
      this.socket.on('game-action:frame-committed', this.handleLockstepFrame)
      this.socket.on('game-action:checksum', this.handleLockstepChecksum)
      this.socket.on('game-action:snapshot', this.handleLockstepSnapshot)
    }

    // Rating updates (rank changes -> notifications)
    this.socket.on('ratingUpdate', (data) => {
      try {
        const currentUserId = store.getState().auth.user?.id
        if (!currentUserId) return
        const changes = Array.isArray(data?.changes) ? data.changes : []
        const mine = changes.find((c) => c.userId === currentUserId)
        if (!mine) return
        const oldRank = getConquestRank(mine.oldRating)
        const newRank = getConquestRank(mine.newRating)
        if (oldRank.name !== newRank.name) {
          const promoted = mine.newRating > mine.oldRating
          notificationService.addNotification({
            type: 'rank_update',
            title: promoted ? 'Rank Up!' : 'Rank Updated',
            message: promoted
              ? `Promoted to ${newRank.name} (${mine.newRating} CP)`
              : `New rank: ${newRank.name} (${mine.newRating} CP)`,
            read: false,
            icon: newRank.name === 'Worldbreaker' ? '☄️' : '🏅',
            metadata: {
              oldRating: mine.oldRating,
              newRating: mine.newRating,
              change: mine.change,
              oldRank: oldRank.name,
              newRank: newRank.name,
            },
          })
        }
      } catch (error) {
        logger.warn('Failed to handle rating update (best-effort)', { error })
      }
    })

    // Snapshot handler - used primarily for join/resync fallbacks
    this.socket.on('game:snapshot', (gameState) => {
      const typedGameState = gameState as GameState
      const { game, auth } = store.getState()
      const previousState = game.currentGame
      const currentUserId = auth.user?.id
      const needsResync = game.needsResync === true

      // Delta-first: ignore snapshots when we already have state and no resync requested,
      // unless the snapshot clearly advances beyond our version (gap detected)
      if (previousState && !needsResync) {
        const prevVer = previousState.version
        const nextVer = (typedGameState as unknown as { version?: number }).version
        if (
          typeof prevVer === 'number' &&
          typeof nextVer === 'number' &&
          // Only accept if server version leaps ahead (we missed deltas)
          !(nextVer > prevVer + 1)
        ) {
          return
        }
        if (typeof prevVer !== 'number' || typeof nextVer !== 'number') {
          // When versions are not comparable, keep delta-first and drop snapshot
          return
        }
      }

      // Check if it's now the current user's turn
      if (
        currentUserId &&
        previousState?.currentPlayer !== currentUserId &&
        typedGameState.currentPlayer === currentUserId &&
        typedGameState.phase !== 'finished'
      ) {
        // Add a turn reminder notification
        notificationService.addNotification({
          type: 'turn_reminder',
          title: "It's your turn!",
          message: `It's your turn in ${typedGameState.roomId || 'the game'}`,
          read: false,
          actionUrl: `/room/${typedGameState.roomId}`,
          actionLabel: 'Go to game',
          metadata: {
            gameId: typedGameState.roomId,
          },
        })

        // Play turn notification sound
        audioService.playEffect('turn')
      }

      if (currentUserId && typedGameState.gameConfig?.gameMode === 'assassination') {
        const prevTarget = previousState?.assassinationTargets?.[currentUserId]
        const nextTarget = typedGameState.assassinationTargets?.[currentUserId]

        if (!prevTarget && nextTarget) {
          const targetPlayer = typedGameState.players.find((p) => p.id === nextTarget)
          toast.success(
            targetPlayer
              ? `Contract assigned: eliminate ${targetPlayer.username}.`
              : 'Contract assigned: eliminate your target.',
          )
        } else if (prevTarget && nextTarget && prevTarget !== nextTarget) {
          const reassignedPlayer = typedGameState.players.find((p) => p.id === nextTarget)
          toast(
            reassignedPlayer
              ? `Contract updated: new target is ${reassignedPlayer.username}.`
              : 'Contract updated: pursue your new target.',
            { icon: '🎯' },
          )
        }

        if (prevTarget) {
          const prevPlayerBefore = previousState?.players.find((p) => p.id === prevTarget)
          const prevPlayerAfter = typedGameState.players.find((p) => p.id === prevTarget)
          const wasEliminated = prevPlayerBefore?.isEliminated ?? false
          const isEliminated = prevPlayerAfter?.isEliminated ?? false
          const targetRemoved = !nextTarget

          if (!wasEliminated && (isEliminated || targetRemoved)) {
            toast.success(
              prevPlayerAfter
                ? `${prevPlayerAfter.username} has been eliminated. Contract complete!`
                : 'Your target has been eliminated. Contract complete!',
            )
          }
        }
      }

      if (typedGameState.kingOfTheHillState) {
        const prevHill = previousState?.kingOfTheHillState
        const nextHill = typedGameState.kingOfTheHillState
        const hillName = typedGameState.board.find(
          (territory) => territory.id === nextHill.currentHillTerritoryId,
        )?.name

        if (!prevHill) {
          toast(
            hillName
              ? `King of the Hill activated. Capture and hold ${hillName}.`
              : 'King of the Hill activated. Capture and hold the marked territory.',
            { icon: '⛰️' },
          )
        } else {
          if (prevHill.currentHillTerritoryId !== nextHill.currentHillTerritoryId) {
            toast(
              hillName
                ? `Hill has rotated to ${hillName}.`
                : 'Hill has rotated to a new territory.',
              { icon: '⛰️' },
            )
          }

          if (currentUserId) {
            const prevPoints = prevHill.points?.[currentUserId] ?? 0
            const nextPoints = nextHill.points?.[currentUserId] ?? 0
            if (nextPoints > prevPoints) {
              toast.success('You gained a hill point! Keep holding the objective.')
            }
          }
        }
      }

      store.dispatch(setGameState(typedGameState))

      if (typedGameState.phase === 'reinforcement') {
        const currentPlayer = typedGameState.players.find(
          (p) => p.id === typedGameState.currentPlayer,
        )
        const armies = Math.max(0, currentPlayer?.armies ?? 0)
        store.dispatch(setReinforcementArmies(armies))
      } else {
        store.dispatch(setReinforcementArmies(0))
      }

      // Reconcile placement counter from server baseline if available
      try {
        const baseline = (typedGameState as GameState & ReinforcementBaselineState)
          .reinforcementBaseline
        if (baseline && typedGameState.phase === 'reinforcement' && currentUserId) {
          // Sum deltas above baseline for owned territories
          let spent = 0
          for (const t of typedGameState.board) {
            if (t.ownerId === currentUserId) {
              const b = baseline[t.id]
              if (typeof b === 'number') {
                const delta = Math.max(0, (t.armies ?? 0) - b)
                spent += delta
              }
            }
          }
          store.dispatch(setPlacementServerSpent(spent))
        } else {
          store.dispatch(setPlacementServerSpent(0))
        }
      } catch (error) {
        logger.warn('Failed to reconcile placement spent from server baseline (best-effort)', {
          error,
        })
      }
    })

    this.socket.on('lifecycle:update', (incoming) => {
      const payload = incoming as Parameters<ServerToClientEvents['lifecycle:update']>[0]

      if (!payload?.roomId || !payload?.status) {
        return
      }

      const lifecyclePayload: RoomLifecyclePayload = {
        roomId: payload.roomId,
        status: payload.status,
        ...(payload.lifecyclePhase !== undefined ? { lifecyclePhase: payload.lifecyclePhase } : {}),
        ...(typeof payload.turnNumber === 'number' ? { turnNumber: payload.turnNumber } : {}),
        ...(payload.currentTurnUserId !== undefined
          ? { currentTurnUserId: payload.currentTurnUserId ?? null }
          : {}),
        ...(payload.turnExpiresAt !== undefined
          ? { turnExpiresAt: payload.turnExpiresAt ?? null }
          : {}),
        ...(typeof (payload as Parameters<ServerToClientEvents['lifecycle:update']>[0])
          .timeBankSecondsRemaining !== 'undefined'
          ? {
              timeBankSecondsRemaining:
                (payload as Parameters<ServerToClientEvents['lifecycle:update']>[0])
                  .timeBankSecondsRemaining ?? null,
            }
          : {}),
        ...(payload.readyCheckStartedAt !== undefined
          ? { readyCheckStartedAt: payload.readyCheckStartedAt ?? null }
          : {}),
        ...(((payload as Record<string, unknown>).statusMessage as unknown) &&
        typeof (payload as Record<string, unknown>).statusMessage === 'string'
          ? { statusMessage: (payload as Record<string, unknown>).statusMessage as string }
          : {}),
        ...(((payload as Record<string, unknown>).statusMessageLevel as unknown) &&
        ((payload as Record<string, unknown>).statusMessageLevel === 'error' ||
          (payload as Record<string, unknown>).statusMessageLevel === 'warn' ||
          (payload as Record<string, unknown>).statusMessageLevel === 'info')
          ? {
              statusMessageLevel: (payload as Record<string, unknown>).statusMessageLevel as
                | 'error'
                | 'info'
                | 'warn',
            }
          : {}),
        ...(typeof (payload as Record<string, unknown>).usingTimeBank === 'boolean'
          ? { usingTimeBank: (payload as Record<string, unknown>).usingTimeBank as boolean }
          : {}),
        replacementPendingUserId:
          typeof (payload as Record<string, unknown>).replacementPendingUserId === 'string'
            ? ((payload as Record<string, unknown>).replacementPendingUserId as string)
            : null,
        readyStates: payload.readyStates,
      }

      this.handleRoomLifecycleChange(lifecyclePayload)
    })

    this.socket.on('room-update', (roomData) => {
      const payload = roomData as Record<string, unknown>

      if (!payload) {
        return
      }

      const previousRoom = store.getState().room.currentRoom

      const status = (payload.status ?? previousRoom?.status ?? 'lobby') as
        | 'lobby'
        | 'initializing'
        | 'active'
        | 'completed'
        | 'paused'
        | 'abandoned'

      const roomId =
        (typeof payload.id === 'string' ? payload.id : undefined) ??
        (typeof payload.roomId === 'string' ? payload.roomId : undefined)

      if (!roomId) {
        return
      }

      // drop local archiveConversation calls; we only prune archived later

      const lifecyclePayload: RoomLifecyclePayload = {
        roomId,
        status,
        ...(payload.lifecyclePhase !== undefined
          ? { lifecyclePhase: payload.lifecyclePhase as GameRoom['lifecyclePhase'] }
          : {}),
        ...(typeof payload.turnNumber === 'number' ? { turnNumber: payload.turnNumber } : {}),
        ...(payload.currentTurnUserId !== undefined
          ? { currentTurnUserId: (payload.currentTurnUserId as string | null) ?? null }
          : {}),
        ...(payload.turnExpiresAt !== undefined
          ? { turnExpiresAt: (payload.turnExpiresAt as string | null) ?? null }
          : {}),
        ...(typeof (payload as Parameters<ServerToClientEvents['room-update']>[0])
          .timeBankSecondsRemaining !== 'undefined'
          ? {
              timeBankSecondsRemaining:
                (payload as Parameters<ServerToClientEvents['room-update']>[0])
                  .timeBankSecondsRemaining ?? null,
            }
          : {}),
        ...(payload.readyCheckStartedAt !== undefined
          ? { readyCheckStartedAt: (payload.readyCheckStartedAt as string | null) ?? null }
          : {}),
        ...(((payload as Record<string, unknown>).statusMessage as unknown) &&
        typeof (payload as Record<string, unknown>).statusMessage === 'string'
          ? { statusMessage: (payload as Record<string, unknown>).statusMessage as string }
          : {}),
        ...(((payload as Record<string, unknown>).statusMessageLevel as unknown) &&
        ((payload as Record<string, unknown>).statusMessageLevel === 'error' ||
          (payload as Record<string, unknown>).statusMessageLevel === 'warn' ||
          (payload as Record<string, unknown>).statusMessageLevel === 'info')
          ? {
              statusMessageLevel: (payload as Record<string, unknown>).statusMessageLevel as
                | 'error'
                | 'info'
                | 'warn',
            }
          : {}),
        ...(typeof (payload as Record<string, unknown>).usingTimeBank === 'boolean'
          ? { usingTimeBank: (payload as Record<string, unknown>).usingTimeBank as boolean }
          : {}),
        replacementPendingUserId:
          typeof (payload as Record<string, unknown>).replacementPendingUserId === 'string'
            ? ((payload as Record<string, unknown>).replacementPendingUserId as string)
            : null,
        // 'players' omitted: room-update payload may not match RoomPlayer shape
      }

      this.handleRoomLifecycleChange(lifecyclePayload)
      // Notification, audio, prefetch, and pruning handled by handleRoomLifecycleChange
    })

    // Map ping: show transient ping marker
    this.socket.on('ping:territory', (data) => {
      const payload = data as Parameters<ServerToClientEvents['ping:territory']>[0]
      const id = `${payload.userId}:${payload.territoryId}:${payload.createdAt}`
      store.dispatch(
        addPing({
          id,
          territoryId: payload.territoryId,
          userId: payload.userId,
          username: payload.username ?? null,
          ttlMs: PING_TTL_MS,
        }),
      )
    })

    // Legacy delta events fully retired; rely on lockstep frame channels only

    // Capital-specific events
    this.socket.on('capitalAttackCheck', (data: unknown) => {
      const payload = data as Parameters<ServerToClientEvents['capitalAttackCheck']>[0]
      // Store this result for when player clicks attack
      store.dispatch(
        updateGameState({
          pendingCapitalAttack: payload.isCapital ? payload.territoryId : null,
        }),
      )
    })

    this.socket.on('capitalElimination', (data: unknown) => {
      const payload = data as Parameters<ServerToClientEvents['capitalElimination']>[0]
      // Play dramatic fanfare for capital elimination
      audioService.playEffect('fanfare')
      audioService.playEffect('victory')

      // Show capital elimination notification
      store.dispatch(
        updateGameState({
          capitalElimination: {
            conqueror: payload.conqueror,
            eliminated: payload.eliminated,
            capitalTerritory: payload.capitalTerritory,
            territoriesGained: payload.territoriesGained,
            troopsGained: payload.troopsGained,
          },
        }),
      )
    })

    this.socket.on('gameError', (error: unknown) => {
      const payload = error as Parameters<ServerToClientEvents['gameError']>[0]
      // Play error sound
      audioService.playEffect('error')
      store.dispatch(setError(payload.message))
      try {
        toast.error(payload.message || 'Game error')
        const rid = store.getState().game.currentGame?.roomId
        store.dispatch(
          addClientLog({
            text: `Error: ${payload.message}`,
            ...(typeof rid === 'string' ? { roomId: rid } : {}),
          }),
        )
      } catch (error) {
        logger.warn('Failed to show toast/log for gameError (best-effort)', { error })
      }
    })

    this.socket.on('notification:new', (payload: unknown) => {
      const data = payload as Parameters<ServerToClientEvents['notification:new']>[0]
      const currentUserId = store.getState().auth.user?.id
      // Suppress self-authored chat notifications defensively (server normally avoids this)
      const senderId = (data.metadata as Record<string, unknown> | undefined)?.senderId
      if (data.type === 'chat_message' && currentUserId && senderId === currentUserId) {
        return
      }
      notificationService.addNotification({
        id: data.id,
        type: data.type as NotificationType,
        title: data.title,
        message: data.message,
        read: data.read ?? false,
        ...(typeof data.actionUrl === 'string' ? { actionUrl: data.actionUrl } : {}),
        ...(typeof data.actionLabel === 'string' ? { actionLabel: data.actionLabel } : {}),
        ...(typeof data.icon === 'string' ? { icon: data.icon } : {}),
        ...(data.metadata ? { metadata: data.metadata as Record<string, unknown> } : {}),
        timestamp: new Date(data.createdAt),
      })

      if (!(data.read ?? false)) {
        const effect = data.type === 'chat_message' ? 'message' : 'swoosh'
        audioService.playEffect(effect)
      }
    })

    this.socket.on('message.new', (payload) => {
      const data = payload as Parameters<ServerToClientEvents['message.new']>[0]
      const state = store.getState()
      const currentUserId = state.auth.user?.id

      store.dispatch(
        messagesActions.messageReceived({
          message: data,
          ...(typeof currentUserId === 'string' ? { currentUserId } : {}),
        }),
      )

      if (!state.messages.conversations[data.conversationId]) {
        store.dispatch(refreshConversation(data.conversationId))
      }
    })

    this.socket.on('conversation.created', (payload) => {
      const data = payload as Parameters<ServerToClientEvents['conversation.created']>[0]
      const state = store.getState()
      const currentUserId = state.auth.user?.id
      if (!currentUserId) {
        return
      }

      const membershipRole =
        data.members.find((member) => member.userId === currentUserId)?.role ?? 'member'

      store.dispatch(
        messagesActions.conversationCreated({
          payload: data,
          membership: {
            role: membershipRole,
            joinedAt: new Date().toISOString(),
            isMuted: false,
            isPinned: false,
            shadowMuted: false,
            lastReadMessageId: null,
            lastReadAt: null,
            accessLevel: 'member',
          },
        }),
      )

      store.dispatch(refreshConversation(data.conversation.id))
    })

    this.socket.on('conversation.members.added', (payload) => {
      const data = payload as Parameters<ServerToClientEvents['conversation.members.added']>[0]
      store.dispatch(messagesActions.conversationMembersAdded(data))
    })

    this.socket.on('conversation.members.removed', (payload) => {
      const data = payload as Parameters<ServerToClientEvents['conversation.members.removed']>[0]
      store.dispatch(messagesActions.conversationMembersRemoved(data))
    })

    this.socket.on('conversation.members.changed', (payload) => {
      const data = payload as Parameters<ServerToClientEvents['conversation.members.changed']>[0]
      store.dispatch(messagesActions.conversationMembersChanged(data))
    })

    this.socket.on('conversation.updated', (payload) => {
      const data = payload as Parameters<ServerToClientEvents['conversation.updated']>[0]
      store.dispatch(messagesActions.conversationUpdated(data))

      // If this specific conversation just became archived and it's a game/team thread, prune it
      const c = data.conversation
      if (c.isArchived && (c.kind === 'game' || c.kind === 'team')) {
        const kinds: Array<import('../types/messages').ConversationSummary['kind']> = [
          'game',
          'team',
        ]
        store.dispatch(messagesActions.pruneArchivedConversations({ kinds }))
      }
    })

    this.socket.on('receipt.read', (payload) => {
      const data = payload as Parameters<ServerToClientEvents['receipt.read']>[0]
      const currentUserId = store.getState().auth.user?.id
      store.dispatch(
        messagesActions.receiptReadReceived({
          payload: data,
          ...(typeof currentUserId === 'string' ? { currentUserId } : {}),
        }),
      )
    })

    this.socket.on('typing.start', (payload) => {
      const data = payload as Parameters<ServerToClientEvents['typing.start']>[0]
      store.dispatch(messagesActions.typingStarted(data))
    })

    this.socket.on('typing.stop', (payload) => {
      const data = payload as Parameters<ServerToClientEvents['typing.stop']>[0]
      store.dispatch(messagesActions.typingStopped(data))
    })

    this.socket.on('error', (_error) => {
      // Play error sound for connection errors
      audioService.playEffect('error')
      store.dispatch(setError('Connection error'))
    })
  }

  /**
   * Removes all event listeners from the socket
   * Called before disconnecting or reconnecting to prevent memory leaks
   */
  private removeEventListeners() {
    if (!this.socket) return

    // Remove all event listeners to prevent memory leaks
    this.socket.off('connect')
    this.socket.off('disconnect')
    this.socket.off('player-joined')
    this.socket.off('player-left')
    this.socket.off('turn:start')
    this.socket.off('game:snapshot')
    this.socket.off('lifecycle:update')
    this.socket.off('room-update')
    if (this.lockstepEnabled) {
      this.socket.off('game-action:frame-committed', this.handleLockstepFrame)
      this.socket.off('game-action:checksum', this.handleLockstepChecksum)
      this.socket.off('game-action:snapshot', this.handleLockstepSnapshot)
    }
    // Legacy events fully retired
    this.socket.off('capitalAttackCheck')
    this.socket.off('capitalElimination')
    this.socket.off('gameError')
    this.socket.off('notification:new')
    this.socket.off('message.new')
    this.socket.off('conversation.created')
    this.socket.off('conversation.members.added')
    this.socket.off('conversation.members.removed')
    this.socket.off('conversation.members.changed')
    this.socket.off('conversation.updated')
    this.socket.off('receipt.read')
    this.socket.off('typing.start')
    this.socket.off('typing.stop')
    this.socket.off('error')

    this.processDeltaHandler = undefined
  }
}

export const socketService = new SocketService()
