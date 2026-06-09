/**
 * Colyseus Client Service
 *
 * Manages connection to the Colyseus game server for real-time state sync.
 * Replaces Socket.io for game room functionality.
 */

import { Client, type Room } from 'colyseus.js'
import { toast } from 'react-hot-toast'
import { logger } from '@/utils/logger'
import { store } from '../store'
import { fetchGameState, setError, setGameState } from '../store/gameSlice'
import { addPlayerToRoom, removePlayerFromRoom, type LifecycleUpdatePayload } from '../store/roomSlice'
import { addPing, setConnectionStatus } from '../store/uiRoomSlice'
import type { BattleResult, Card, GamePlayer, GameState, Territory } from '../types/game'
import audioService from './audioService'

// Event types for game room events
export interface GameLogEntry {
  id: string
  roomId: string
  turn: number
  phase: string
  timestamp: number
  text: string
  isHidden?: boolean
}

export interface GameRoomEvents {
  'player-joined': { oderId: string; username: string; color?: string }
  'player-left': { oderId: string; username: string }
  'player-disconnected': { oderId: string }
  'player-reconnected': { oderId: string }
  'lifecycle:update': LifecycleUpdatePayload
  ratingUpdate: { oderId: string; oldRating: number; newRating: number; ratingChange: number }
  'game-log:append': GameLogEntry
  'game-log:batch': { entries: GameLogEntry[] }
  'game-log:reveal': Record<string, never>
  'ping:territory': { playerId: string; territoryId: string; timestamp: number }
}

type EventCallback<T> = (data: T) => void
type EventMap = Map<string, Set<EventCallback<unknown>>>

// Connection settings
const RECONNECT_DELAY_MS = 1000
const RECONNECT_MAX_DELAY_MS = 3000
// Capped backoff sums to ~33s (1+2+3 + 3×9), comfortably covering the server's default
// reconnection grace window (RECONNECT_WINDOW_SECONDS = 30s) so the client keeps trying a
// true reconnect for as long as the held seat is recoverable. Keep these in rough sync if
// the server window changes.
const MAX_RECONNECT_ATTEMPTS = 12

// Canonical engine action shape, sent verbatim over the 'action' message to the
// authoritative GameRoom (which forwards it to gameService.processGameAction). This is
// the SAME shape the REST path POSTs, so there is no lossy client-side translation
// layer — the room normalizes roomId/playerId server-side regardless of what's sent.
export type GameAction = {
  type: string
  roomId: string
  playerId: string
  payload?: unknown
}

// Schema types from server (simplified client-side versions)
interface SchemaTerritory {
  id: string
  name: string
  sector: string
  ownerId: string
  armies: number
  hasCapital: boolean
  armyPositionX: number
  armyPositionY: number
}

interface SchemaCard {
  id: string
  territoryId: string
  cardType: string
}

interface SchemaPlayer {
  oderId: string
  username: string
  color: string
  teamId: number
  playerOrder: number
  isAi: boolean
  aiDifficulty: string
  isEliminated: boolean
  eliminationReason: string
  isReady: boolean
  isConnected: boolean
  reinforcementArmies: number
  cards: SchemaCard[]
  timeBankSeconds: number
}

interface SchemaBattleResult {
  attackerId: string
  defenderId: string
  fromTerritoryId: string
  toTerritoryId: string
  attackerDice: number[]
  defenderDice: number[]
  attackerLosses: number
  defenderLosses: number
  conquered: boolean
}

interface SchemaGameState {
  roomId: string
  mapId: string
  phase: string
  currentPlayerId: string
  turn: number
  version: number
  players: Map<string, SchemaPlayer>
  territories: Map<string, SchemaTerritory>
  lastBattle: SchemaBattleResult | null
  gameMode: string
  fogOfWar: boolean
  turnTimerSeconds: number
  teamMode: boolean
  winnerId: string
  turnStartedAt: number
  turnExpiresAt: number
}

// Frame event from server
interface FrameCommittedEvent {
  seq: number
  playerId: string
  action: { kind: string; payload: unknown }
  checksum: number
  version: number
}

class ColyseusService {
  private client: Client | null = null
  private gameRoom: Room<SchemaGameState> | null = null
  private reconnectAttempts = 0
  private currentRoomId: string | null = null
  // Captured after each successful (re)connect; lets a dropped client resume its seat
  // via client.reconnect() instead of a fresh join. Survives onLeave (which nulls
  // gameRoom/currentRoomId) so it's available during the reconnect attempt.
  private reconnectionToken: string | null = null
  // Handle for the pending reconnect attempt, so an intentional teardown (leaveRoom/
  // disconnect) can cancel it before it resurrects the connection.
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private eventListeners: EventMap = new Map()

  /**
   * Subscribe to game room events
   */
  on<K extends keyof GameRoomEvents>(event: K, callback: EventCallback<GameRoomEvents[K]>): void {
    let listeners = this.eventListeners.get(event)
    if (!listeners) {
      listeners = new Set()
      this.eventListeners.set(event, listeners)
    }
    listeners.add(callback as EventCallback<unknown>)
  }

  /**
   * Unsubscribe from game room events
   */
  off<K extends keyof GameRoomEvents>(event: K, callback: EventCallback<GameRoomEvents[K]>): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      listeners.delete(callback as EventCallback<unknown>)
    }
  }

  /**
   * Emit event to all subscribers (internal use)
   */
  protected emitEvent<K extends keyof GameRoomEvents>(event: K, data: GameRoomEvents[K]): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      for (const callback of listeners) {
        callback(data)
      }
    }
  }

  /**
   * Initialize the Colyseus client
   */
  connect(): void {
    if (this.client) return

    const wsUrl =
      import.meta.env.VITE_COLYSEUS_URL ||
      (import.meta.env.MODE === 'production'
        ? `wss://${window.location.host}`
        : 'ws://localhost:5001')

    logger.info('[Colyseus] Initializing client', { wsUrl })

    this.client = new Client(wsUrl)
    // Note: Don't set connectionStatus here - the actual connection happens in joinRoom()
  }

  /**
   * Disconnect from all rooms and cleanup
   */
  disconnect(): void {
    this.cancelReconnect()
    if (this.gameRoom) {
      this.gameRoom.leave()
      this.gameRoom = null
    }
    this.client = null
    this.currentRoomId = null
    store.dispatch(setConnectionStatus('disconnected'))
    logger.info('[Colyseus] Disconnected')
  }

  /**
   * Cancel any pending reconnect attempt and clear reconnect state. Called on intentional
   * teardown so a queued doReconnect can't resurrect a connection the user is leaving —
   * onLeave (unexpected drop) nulls gameRoom and schedules a reconnect timer, which a
   * gameRoom-guarded teardown would otherwise miss.
   */
  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.reconnectionToken = null
    this.reconnectAttempts = 0
  }

  /**
   * Join a game room by ID
   */
  async joinRoom(roomId: string): Promise<boolean> {
    console.log('[Colyseus DEBUG] joinRoom called', { roomId, hasClient: !!this.client, currentRoomId: this.currentRoomId })

    if (!this.client) {
      console.log('[Colyseus DEBUG] No client, calling connect()')
      this.connect()
    }

    if (!this.client) {
      logger.error('[Colyseus] Client not initialized')
      return false
    }

    // Already connected to this room (only skip if the socket is genuinely open;
    // after an unexpected drop the room ref is cleared in onLeave, so this won't
    // short-circuit a legitimate reconnect).
    if (this.gameRoom && this.currentRoomId === roomId && this.gameRoom.connection?.isOpen) {
      logger.info('[Colyseus] Already in room', { roomId })
      return true
    }

    // Leave current room if different
    if (this.gameRoom) {
      console.log('[Colyseus DEBUG] Leaving previous room')
      await this.leaveRoom()
    }

    try {
      const token = localStorage.getItem('token')
      const user = store.getState().auth.user
      const currentRoom = store.getState().room.currentRoom
      const currentPlayer = currentRoom?.players?.find(
        (player) => (player.userId ?? player.id) === user?.id,
      )

      if (!token || !user) {
        logger.error('[Colyseus] Not authenticated')
        toast.error('Please log in to join the game')
        return false
      }

      console.log('[Colyseus DEBUG] Setting status to connecting')
      logger.info('[Colyseus] Joining room', { roomId })
      store.dispatch(setConnectionStatus('connecting'))

      console.log('[Colyseus DEBUG] Calling client.join()')
      // Join existing room by gameId filter
      this.gameRoom = await this.client.join<SchemaGameState>('game', {
        gameId: roomId,
        roomId,
        token,
        oderId: user.id,
        username: user.username,
        ...(currentPlayer?.selectedColor ? { color: currentPlayer.selectedColor } : {}),
        ...(typeof currentPlayer?.teamId === 'number' ? { teamId: currentPlayer.teamId } : {}),
      })

      console.log('[Colyseus DEBUG] Join succeeded, setting up listeners')
      this.afterConnected(roomId)
      console.log('[Colyseus DEBUG] Status set to connected')

      logger.info('[Colyseus] Joined room successfully', { roomId })
      return true
    } catch (error) {
      console.error('[Colyseus DEBUG] Join failed', { error })
      logger.error('[Colyseus] Failed to join room', { roomId, error })
      store.dispatch(setConnectionStatus('disconnected'))
      store.dispatch(setError(error instanceof Error ? error.message : 'Failed to join room'))

      // Attempt reconnect
      this.attemptReconnect(roomId)
      return false
    }
  }

  /**
   * Leave the current room
   */
  async leaveRoom(): Promise<void> {
    // Cancel any pending reconnect FIRST, outside the gameRoom guard: after an unexpected
    // drop, onLeave has already nulled gameRoom and queued a reconnect timer, so a
    // gameRoom-guarded teardown would miss it and a stale doReconnect could rejoin the
    // room the user is intentionally leaving.
    this.cancelReconnect()
    if (this.gameRoom) {
      logger.info('[Colyseus] Leaving room', { roomId: this.currentRoomId })
      await this.gameRoom.leave()
      this.gameRoom = null
      this.currentRoomId = null
    }
  }

  /**
   * Send a game action to the server
   */
  sendGameAction(action: GameAction): void {
    if (!this.gameRoom) {
      logger.error('[Colyseus] Cannot send action - not in a room')
      toast.error('Not connected to game')
      return
    }

    logger.debug('[Colyseus] Sending action', { type: action.type })
    this.gameRoom.send('action', action)
  }

  /**
   * Send a chat message
   */
  sendChat(text: string): void {
    if (!this.gameRoom) return
    this.gameRoom.send('chat', { text })
  }

  /**
   * Set player ready status
   */
  setReady(ready: boolean): void {
    if (!this.gameRoom) return
    this.gameRoom.send('ready', { ready })
  }

  /**
   * Send host replacement action (set disconnected player to neutral or AI)
   */
  sendHostReplacement(targetUserId: string, choice: 'neutral' | 'ai', aiDifficulty?: string): void {
    if (!this.gameRoom) {
      logger.error('[Colyseus] Cannot send host:replacement - not in a room')
      toast.error('Not connected to game')
      return
    }

    logger.debug('[Colyseus] Sending host:replacement', { targetUserId, choice, aiDifficulty })
    this.gameRoom.send('host:replacement', { targetUserId, choice, aiDifficulty })
  }

  /**
   * Begin turn (acknowledge turn notification)
   */
  beginTurn(): void {
    if (!this.gameRoom) return
    this.gameRoom.send('begin-turn', {})
  }

  /**
   * Send a territory ping to highlight for teammates
   */
  pingTerritory(territoryId: string): void {
    if (!this.gameRoom) return
    this.gameRoom.send('ping:territory', { territoryId })
  }

  /**
   * Get current connection status
   */
  isConnected(): boolean {
    return this.gameRoom?.connection?.isOpen ?? false
  }

  /**
   * Get current room ID
   */
  getRoomId(): string | null {
    return this.currentRoomId
  }

  // Private methods

  private setupRoomListeners(): void {
    if (!this.gameRoom) return

    // State change listeners - Colyseus auto-syncs state (no-op until the room
    // becomes authoritative; guarded in syncStateToRedux).
    this.gameRoom.onStateChange((state) => {
      logger.debug('[Colyseus] State changed', { version: state.version })
      this.syncStateToRedux()
    })

    // Live-update bridge: the server broadcasts 'state:changed' whenever the
    // authoritative (REST/cache) game state advances. Refetch it so moves appear
    // for everyone in real time without a manual refresh.
    this.gameRoom.onMessage('state:changed', (data: { version?: number }) => {
      logger.debug('[Colyseus] state:changed nudge', { version: data?.version })
      if (this.currentRoomId) {
        // Preserve the spectate intent of the initial load — otherwise an admin
        // spectator's nudge-driven refetch silently drops ?spectate=true and flips them
        // into the fog-masked view for the rest of the game.
        const allowSpectate =
          typeof window !== 'undefined' &&
          new URLSearchParams(window.location.search).get('spectate') === 'true'
        store.dispatch(fetchGameState({ roomId: this.currentRoomId, allowSpectate }))
      }
    })

    // Message handlers
    this.gameRoom.onMessage('error', (message: { message: string }) => {
      logger.error('[Colyseus] Server error', { message: message.message })
      toast.error(message.message)
    })

    this.gameRoom.onMessage(
      'action-ack',
      (ack: { seq: number; success: boolean; version: number }) => {
        logger.debug('[Colyseus] Action acknowledged', { seq: ack.seq, version: ack.version })
      },
    )

    this.gameRoom.onMessage('frame-committed', (frame: FrameCommittedEvent) => {
      logger.debug('[Colyseus] Frame committed', {
        seq: frame.seq,
        action: frame.action.kind,
        checksum: frame.checksum,
      })
    })

    this.gameRoom.onMessage(
      'chat',
      (msg: { oderId: string; username: string; text: string; timestamp: number }) => {
        // Handle chat messages - dispatch to chat slice
        logger.debug('[Colyseus] Chat message', { from: msg.username })
      },
    )

    this.gameRoom.onMessage(
      'player-joined',
      (data: { oderId: string; username: string; color?: string }) => {
        logger.info('[Colyseus] Player joined', { username: data.username })
        toast.success(`${data.username} joined the game`)
        if (this.currentRoomId) {
          store.dispatch(
            addPlayerToRoom({
              roomId: this.currentRoomId,
              player: {
                id: data.oderId,
                userId: data.oderId,
                username: data.username,
                joinedAt: new Date().toISOString(),
                selectedColor: data.color ?? null,
              },
            }),
          )
        }
        this.emitEvent('player-joined', data)
      },
    )

    this.gameRoom.onMessage('player-left', (data: { oderId: string; username: string }) => {
      logger.info('[Colyseus] Player left', { username: data.username })
      toast(`${data.username} left the game`)
      if (this.currentRoomId) {
        store.dispatch(
          removePlayerFromRoom({
            roomId: this.currentRoomId,
            playerSlotId: data.oderId,
            userId: data.oderId,
          }),
        )
      }
      this.emitEvent('player-left', data)
    })

    this.gameRoom.onMessage('player-eliminated', (data: { oderId: string; reason: string }) => {
      logger.info('[Colyseus] Player eliminated', { oderId: data.oderId, reason: data.reason })
      audioService.playEffect('eliminated')
    })

    this.gameRoom.onMessage('player-disconnected', (data: { oderId: string }) => {
      logger.info('[Colyseus] Player disconnected', { oderId: data.oderId })
      this.emitEvent('player-disconnected', data)
    })

    this.gameRoom.onMessage('player-reconnected', (data: { oderId: string }) => {
      logger.info('[Colyseus] Player reconnected', { oderId: data.oderId })
      this.emitEvent('player-reconnected', data)
    })

    this.gameRoom.onMessage('game-started', () => {
      logger.info('[Colyseus] Game started')
      toast.success('Game started!')
      audioService.playEffect('gamestart')
    })

    this.gameRoom.onMessage(
      'game-finished',
      (data: { winnerId: string; winnerUsername: string }) => {
        logger.info('[Colyseus] Game finished', { winner: data.winnerUsername })
        toast.success(`${data.winnerUsername} won the game!`)
        audioService.playVictoryFanfare()
      },
    )

    this.gameRoom.onMessage('spectator-blocked', (data: { message: string }) => {
      logger.info('[Colyseus] Spectating blocked (fog of war)')
      toast(data.message)
    })

    this.gameRoom.onMessage('your-turn', () => {
      logger.info('[Colyseus] Your turn')
      toast("It's your turn!", { duration: 2500 })
      audioService.playEffect('turn')
    })

    // Game log events
    this.gameRoom.onMessage('game-log:append', (entry: GameLogEntry) => {
      logger.debug('[Colyseus] Game log append', { id: entry.id, text: entry.text })
      this.emitEvent('game-log:append', entry)
    })

    this.gameRoom.onMessage('game-log:batch', (data: { entries: GameLogEntry[] }) => {
      logger.debug('[Colyseus] Game log batch', { count: data.entries.length })
      this.emitEvent('game-log:batch', data)
    })

    this.gameRoom.onMessage('game-log:reveal', () => {
      logger.debug('[Colyseus] Game log reveal')
      this.emitEvent('game-log:reveal', {})
    })

    // Lifecycle and rating events
    this.gameRoom.onMessage('lifecycle:update', (data: LifecycleUpdatePayload) => {
      logger.debug('[Colyseus] Lifecycle update', { status: data.status })
      this.emitEvent('lifecycle:update', data)
    })

    this.gameRoom.onMessage(
      'ratingUpdate',
      (data: { oderId: string; oldRating: number; newRating: number; ratingChange: number }) => {
        logger.debug('[Colyseus] Rating update', { oderId: data.oderId, change: data.ratingChange })
        this.emitEvent('ratingUpdate', data)
      },
    )

    // Ping events (territory pings from other players)
    this.gameRoom.onMessage(
      'ping:territory',
      (data: { playerId: string; territoryId: string; timestamp: number }) => {
        logger.debug('[Colyseus] Territory ping', {
          playerId: data.playerId,
          territoryId: data.territoryId,
        })
        store.dispatch(
          addPing({
            id: `ping-${data.playerId}-${data.timestamp}`,
            territoryId: data.territoryId,
            userId: data.playerId,
          }),
        )
        this.emitEvent('ping:territory', data)
      },
    )

    // Connection events
    this.gameRoom.onLeave((code) => {
      logger.info('[Colyseus] Left room', { code })
      // Drop the stale room reference so a reconnect actually re-joins.
      // Previously gameRoom/currentRoomId were left set, so joinRoom's
      // "already in this room" guard short-circuited every reconnect attempt and
      // the connection status was stuck on 'disconnected' until a full page reload.
      const previousRoomId = this.currentRoomId
      this.gameRoom = null
      this.currentRoomId = null
      store.dispatch(setConnectionStatus('disconnected'))

      // Attempt reconnect on unexpected disconnect (code 1000 = normal closure)
      if (code !== 1000 && previousRoomId) {
        this.attemptReconnect(previousRoomId)
      }
    })

    this.gameRoom.onError((code, message) => {
      logger.error('[Colyseus] Room error', { code, message })
      store.dispatch(setError(message || 'Connection error'))
    })
  }

  private syncStateToRedux(): void {
    if (!this.gameRoom?.state) {
      return
    }

    const state = this.gameRoom.state

    // The Colyseus room is only authoritative once its engine has been
    // initialized/rehydrated with the live game (see GameRoom). Until then an
    // active game's room schema has no territories, and syncing that empty state
    // would clobber the board loaded via REST (fetchGameState), blanking the map.
    // Skip until the room actually carries board data. (After the room becomes
    // authoritative this condition is never true for a started game.)
    if (!state.territories || state.territories.size === 0) {
      logger.debug('[Colyseus] Skipping state sync — room has no board yet')
      return
    }

    logger.debug('[Colyseus] Syncing state to Redux', {
      version: state.version,
      phase: state.phase,
      turn: state.turn,
    })

    // Convert Colyseus Schema state to Redux-compatible GameState
    const gameState: GameState = {
      roomId: state.roomId,
      phase: state.phase as GameState['phase'],
      currentPlayer: state.currentPlayerId,
      turn: state.turn,
      version: state.version,
      players: this.convertPlayers(state.players),
      board: this.convertTerritories(state.territories),
      cards: [],
      gameConfig: {
        movementType: 'classic_adjacent' as const,
        maxPlayers: 6,
        gameMode: state.gameMode,
        fogOfWar: state.fogOfWar ? 'adjacent' : 'off',
        turnTimer: state.turnTimerSeconds,
        teamMode: state.teamMode ? 'teams' : 'none',
      },
      lastBattleResult: state.lastBattle ? this.convertBattleResult(state.lastBattle) : undefined,
    }

    store.dispatch(setGameState(gameState))
  }

  private convertPlayers(schemaPlayers: Map<string, SchemaPlayer>): GamePlayer[] {
    const players: GamePlayer[] = []
    schemaPlayers.forEach((player) => {
      players.push({
        id: player.oderId,
        userId: player.oderId,
        username: player.username,
        color: player.color as GamePlayer['color'],
        teamId: player.teamId || undefined,
        isAi: player.isAi,
        aiDifficulty: player.aiDifficulty as GamePlayer['aiDifficulty'],
        isEliminated: player.isEliminated,
        armies: player.reinforcementArmies,
        cards: this.convertCards(player.cards),
        territories: [], // Computed from board state
      })
    })
    return players
  }

  private convertTerritories(schemaTerritories: Map<string, SchemaTerritory>): Territory[] {
    const territories: Territory[] = []
    schemaTerritories.forEach((territory) => {
      territories.push({
        id: territory.id,
        name: territory.name,
        sector: territory.sector,
        ownerId: territory.ownerId || null,
        armies: territory.armies,
        isCapital: territory.hasCapital,
        coordinates: {
          x: territory.armyPositionX,
          y: territory.armyPositionY,
        },
        adjacentTerritories: [], // Adjacencies come from map data, not state
      })
    })
    return territories
  }

  private convertCards(schemaCards: SchemaCard[]): Card[] {
    return schemaCards.map((card) => ({
      id: card.id,
      type: card.cardType as Card['type'],
      territoryId: card.territoryId,
    }))
  }

  private convertBattleResult(schemaBattle: SchemaBattleResult): BattleResult {
    return {
      attackerId: schemaBattle.attackerId,
      defenderId: schemaBattle.defenderId,
      fromTerritory: schemaBattle.fromTerritoryId,
      toTerritory: schemaBattle.toTerritoryId,
      attackerDice: Array.from(schemaBattle.attackerDice),
      defenderDice: Array.from(schemaBattle.defenderDice),
      attackerLosses: schemaBattle.attackerLosses,
      defenderLosses: schemaBattle.defenderLosses,
      conquered: schemaBattle.conquered,
    }
  }

  private attemptReconnect(roomId: string): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      logger.error('[Colyseus] Max reconnect attempts reached')
      this.reconnectionToken = null
      if (this.shouldSurfaceConnectionIssues()) {
        toast.error('Lost connection to game server')
      }
      return
    }

    this.reconnectAttempts++
    // Capped backoff so the cumulative budget covers the server's reconnection grace
    // window (see MAX_RECONNECT_ATTEMPTS); we keep retrying a true reconnect until then.
    const delay = Math.min(RECONNECT_DELAY_MS * this.reconnectAttempts, RECONNECT_MAX_DELAY_MS)

    logger.info('[Colyseus] Attempting reconnect', {
      attempt: this.reconnectAttempts,
      delay,
    })

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.doReconnect(roomId)
    }, delay)
  }

  /**
   * Wire up a freshly (re)connected room: capture the reconnection token, reset
   * reconnect bookkeeping, mark connected, and attach listeners + initial state sync.
   * Shared by joinRoom and doReconnect.
   */
  private afterConnected(roomId: string): void {
    if (!this.gameRoom) return
    this.currentRoomId = roomId
    this.reconnectAttempts = 0
    this.reconnectionToken = this.gameRoom.reconnectionToken
    store.dispatch(setConnectionStatus('connected'))
    this.setupRoomListeners()
    this.syncStateToRedux()
  }

  /**
   * Reconnect after an unexpected drop. Prefer a true Colyseus reconnection —
   * client.reconnect(reconnectionToken) resumes the reserved seat within the server's
   * allowReconnection grace window, preserving turn/timer state and skipping a fresh
   * onAuth/onJoin (which could race or re-seat). Fall back to a fresh join if the token
   * is gone or the grace window has already elapsed.
   */
  private async doReconnect(roomId: string): Promise<void> {
    if (this.client && this.reconnectionToken) {
      try {
        store.dispatch(setConnectionStatus('connecting'))
        this.gameRoom = await this.client.reconnect<SchemaGameState>(this.reconnectionToken)
        this.afterConnected(roomId)
        logger.info('[Colyseus] Reconnected to room', { roomId })
        return
      } catch (error) {
        logger.warn('[Colyseus] reconnect() attempt failed', {
          attempt: this.reconnectAttempts,
          error: error instanceof Error ? error.message : error,
        })
        // Keep the token and retry on the next scheduled attempt. A single transient
        // matchmake error must NOT orphan a still-held seat with a fresh join (which
        // creates a NEW seat and leaves the server's allowReconnection pending until it
        // times out). Only after exhausting the budget — by which point the seat is
        // surely released — do we fall back to a fresh join.
        if (this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          this.attemptReconnect(roomId)
          return
        }
        this.reconnectionToken = null
      }
    }
    // Last resort: no token, or the grace window is spent → a fresh join.
    await this.joinRoom(roomId)
  }

  private shouldSurfaceConnectionIssues(): boolean {
    const state = store.getState()
    const roomStatus = state.room.currentRoom?.status
    if (roomStatus === 'initializing' || roomStatus === 'active' || roomStatus === 'paused') {
      return true
    }
    // currentGame.phase is the in-game phase type (no 'lobby' — lobby is tracked by
    // room.status above), so only 'finished' needs excluding here.
    const phase = state.game.currentGame?.phase
    return Boolean(phase && phase !== 'finished')
  }
}

// Export singleton instance
export const colyseusService = new ColyseusService()
export default colyseusService
