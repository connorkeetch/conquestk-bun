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
  TerritoryDelta,
} from '@conquestk/shared'
import { toast } from 'react-hot-toast'
import { io, type Socket } from 'socket.io-client'
import { getConquestRank } from '@/components/RankInsignia'
import { store } from '../store'
import {
  applyDelta,
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
  addPing,
  clearPlacementHistory,
  recordBattleResult,
  setConnectionStatus,
  setDesyncDetected,
  setPlacementServerSpent,
} from '../store/uiRoomSlice'
import type { GameState } from '../types/game'
import type { GameRoom, Player as RoomPlayer } from '../types/gameRoom'
import type { NotificationType } from '../types/notification'
import audioService from './audioService'
import { notificationService } from './notificationService'

type RoomLifecyclePayload = LifecycleUpdatePayload

class SocketService {
  private socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null
  private lastReadEmitAt: Record<string, number> = {}
  private pendingRoomStateFetches = new Set<string>()
  private pendingConfirmTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()
  private pendingAttackAcks: Map<string, ReturnType<typeof setTimeout>> = new Map()
  private lastAttackEmitAt: Map<string, number> = new Map()

  connect() {
    // Reset any pending fetch tracking on a fresh connection attempt
    this.pendingRoomStateFetches.clear()
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
    // Prefer WebSocket, but allow polling fallback to avoid reconnect loops behind certain proxies
    this.socket = io(socketUrl, {
      auth: { token },
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    }) as unknown as Socket<ServerToClientEvents, ClientToServerEvents>

    this.setupEventListeners()
    // Immediately reflect connecting state
    store.dispatch(setConnectionStatus('connecting'))
  }

  disconnect() {
    if (this.socket) {
      this.removeEventListeners()
      this.socket.disconnect()
      this.socket = null
    }
    this.pendingRoomStateFetches.clear()
  }

  joinRoom(roomId: string) {
    this.socket?.emit('join-room', roomId)
  }

  leaveRoom(roomId: string) {
    this.socket?.emit('leave-room', roomId)
  }

  sendGameAction(data: Parameters<ClientToServerEvents['game-action']>[0]) {
    this.socket?.emit('game-action', data)
  }

  // Generic emit for legacy/untyped events
  // biome-ignore lint/suspicious/noExplicitAny: passthrough for custom events
  emit(event: string, data: any) {
    // Forward as-is for events not represented in our typed interface
    // biome-ignore lint/suspicious/noExplicitAny: event passthrough to socket
    this.socket?.emit(event as any, data as any)
  }

  private scheduleDeployConfirmFetch(roomId: string) {
    // Clear any existing timer for this room
    const existing = this.pendingConfirmTimers.get(roomId)
    if (existing) {
      clearTimeout(existing)
      this.pendingConfirmTimers.delete(roomId)
    }
    const timer = setTimeout(() => {
      try {
        const state = store.getState()
        const loaded = state.game.currentGame
        if (!loaded || loaded.roomId !== roomId) {
          this.pendingConfirmTimers.delete(roomId)
          return
        }
        // Fetch full state as a convergence fallback
        store.dispatch(fetchGameState({ roomId }))
      } catch {
        /* ignore fetch errors */
      } finally {
        this.pendingConfirmTimers.delete(roomId)
      }
    }, 1200)
    this.pendingConfirmTimers.set(roomId, timer)
  }

  private clearConfirmTimer(roomId: string) {
    const t = this.pendingConfirmTimers.get(roomId)
    if (t) {
      clearTimeout(t)
      this.pendingConfirmTimers.delete(roomId)
    }
  }

  deployArmies(roomId: string, territoryId: string, armies: number) {
    // Schedule a one-shot convergence fetch if no delta arrives in time
    this.scheduleDeployConfirmFetch(roomId)
    this.socket?.emit(
      'deployArmies',
      { roomId, territoryId, armies },
      (ack?: { ok: boolean; queued?: boolean; version?: number }) => {
        // If we received an applied version in the ack (inline path), clear timer early
        if (ack && typeof ack.version === 'number') {
          this.clearConfirmTimer(roomId)
        }
      },
    )
  }

  attack(roomId: string, fromTerritoryId: string, toTerritoryId: string, armies?: number) {
    const key = `${roomId}:${fromTerritoryId}->${toTerritoryId}`
    const now = Date.now()
    const lastAt = this.lastAttackEmitAt.get(key) ?? 0
    const MIN_INTERVAL_MS = 120
    if (now - lastAt < MIN_INTERVAL_MS) {
      return
    }
    this.lastAttackEmitAt.set(key, now)

    // Prevent spamming the same pair until ack arrives or timeout
    if (this.pendingAttackAcks.has(key)) {
      return
    }

    const clear = () => {
      const t = this.pendingAttackAcks.get(key)
      if (t) clearTimeout(t)
      this.pendingAttackAcks.delete(key)
    }

    const fallback = setTimeout(() => {
      // Clear inflight after 1s even if ack lost (convergence occurs via deltas)
      this.pendingAttackAcks.delete(key)
    }, 1000)
    this.pendingAttackAcks.set(key, fallback)

    const attackPayload =
      typeof armies === 'number'
        ? { roomId, fromTerritoryId, toTerritoryId, armies }
        : { roomId, fromTerritoryId, toTerritoryId }
    this.socket?.emit(
      'attack',
      attackPayload as Parameters<ClientToServerEvents['attack']>[0],
      () => {
        clear()
      },
    )
  }

  checkCapitalAttack(roomId: string, targetTerritoryId: string) {
    this.socket?.emit('checkCapitalAttack', { roomId, targetTerritoryId })
  }

  fortify(roomId: string, fromTerritoryId: string, toTerritoryId: string, armies: number) {
    this.socket?.emit('fortify', { roomId, fromTerritoryId, toTerritoryId, armies })
  }

  transferConquestArmies(
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

  undoFortify(roomId: string) {
    this.socket?.emit('undoFortify', { roomId })
  }

  endTurn(roomId: string) {
    this.socket?.emit('endTurn', { roomId })
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

  // Generic on/off wrappers for convenience in feature areas (typed via casts)
  on<T extends keyof ServerToClientEvents>(event: T, handler: ServerToClientEvents[T]) {
    // biome-ignore lint/suspicious/noExplicitAny: event bridge surface for pages/modules
    this.socket?.on(event as any, handler as any)
  }
  off<T extends keyof ServerToClientEvents>(event: T, handler: ServerToClientEvents[T]) {
    // biome-ignore lint/suspicious/noExplicitAny: event bridge surface for pages/modules
    this.socket?.off(event as any, handler as any)
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

      // Rejoin active game room on reconnect to restore subscriptions
      try {
        const state = store.getState()
        const roomId = state.room.currentRoom?.id ?? state.game.currentGame?.roomId ?? null
        // Always attempt to rejoin when a room is active; server validates membership
        if (roomId) this.joinRoom(roomId)
      } catch {
        // best-effort; if state not accessible, skip rejoin
      }
    })

    this.socket.on('disconnect', () => {
      store.dispatch(setConnectionStatus('disconnected'))
    })

    this.socket.on('connect_error', (err) => {
      // Reflect disconnect state immediately
      store.dispatch(setConnectionStatus('disconnected'))
      const msg = (err && (err as Error).message) || 'Connection error'
      // Common auth failure patterns -> prompt user
      if (/auth/i.test(msg) || /jwt/i.test(msg)) {
        try {
          // Surface a clear message; keep user on page to avoid data loss
          toast.error('Session expired. Please sign in again to restore realtime updates.')
        } catch {
          // no-op
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
              selected_color:
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
    const processDelta = (payload: GameDelta) => {
      const state = store.getState()
      const viewerId = state.auth.user?.id ?? null
      const currentGame = state.game.currentGame

      // Any delta for this room confirms activity — clear pending convergence timer
      if (payload?.roomId) {
        this.clearConfirmTimer(payload.roomId)
      }

      if (!currentGame || currentGame.roomId !== payload.roomId) {
        if (!this.pendingRoomStateFetches.has(payload.roomId)) {
          this.pendingRoomStateFetches.add(payload.roomId)
          const allowSpectateFetch = Boolean(
            !viewerId ||
              !state.room.currentRoom?.players?.some((player) => player.userId === viewerId),
          )
          void (
            store.dispatch(
              fetchGameState({ roomId: payload.roomId, allowSpectate: allowSpectateFetch }),
            ) as Promise<unknown>
          )
            .catch(() => {
              /* swallow fetch errors - fallback is manual refresh */
            })
            .finally(() => {
              this.pendingRoomStateFetches.delete(payload.roomId)
            })
        }
        return
      }

      // Check if we need to resync due to desync detection
      if (state.game.needsResync) {
        if (!this.pendingRoomStateFetches.has(payload.roomId)) {
          this.pendingRoomStateFetches.add(payload.roomId)
          const allowSpectateFetch = Boolean(
            !viewerId ||
              !state.room.currentRoom?.players?.some((player) => player.userId === viewerId),
          )
          void (
            store.dispatch(
              fetchGameState({ roomId: payload.roomId, allowSpectate: allowSpectateFetch }),
            ) as Promise<unknown>
          )
            .catch(() => {
              /* swallow fetch errors - fallback is manual refresh */
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
        if (!wasMyTurn) {
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
        } catch {
          // best-effort only
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
      store.dispatch(applyDelta(payload))

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
      } catch {
        /* best-effort */
      }
    }

    this.socket.on('game-delta', (delta) => {
      processDelta(delta as unknown as GameDelta)
    })

    // Coalesced delta batches (optional optimization)
    this.socket.on('game-delta-batch', (deltas: unknown) => {
      const array = Array.isArray(deltas) ? (deltas as unknown[]) : []
      if (array.length === 0) return
      const last = array[array.length - 1] as unknown as GameDelta
      for (const d of array) {
        processDelta(d as unknown as GameDelta)
      }
      // Minimal UX side-effects for the last delta: notify on PHASE_CHANGE and clear placement if needed
      try {
        const payload = last
        const { game, auth } = store.getState()
        const previousState = game.currentGame
        const currentUserId = auth.user?.id
        if (payload.type === 'PHASE_CHANGE' && currentUserId) {
          const wasMyTurn = previousState?.currentPlayer === currentUserId
          if (payload.currentPlayer === currentUserId && !wasMyTurn) {
            notificationService.addNotification({
              type: 'turn_reminder',
              title: "It's your turn!",
              message: `It's your turn - ${payload.phase} phase`,
              read: false,
              actionUrl: `/room/${payload.roomId}`,
              actionLabel: 'Go to game',
              metadata: { gameId: payload.roomId },
            })
            audioService.playEffect('turn')
          }
          if (payload.phase === 'reinforcement') {
            store.dispatch(clearPlacementHistory())
            store.dispatch(setPlacementServerSpent(0))
          }
        }
      } catch {
        // best-effort notification/audio
      }
    })

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
      } catch {
        // best-effort only
      }
    })

    // Legacy game-update handler - used primarily for join/resync
    this.socket.on('game-update', (gameState) => {
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
        // biome-ignore lint/suspicious/noExplicitAny: tolerate extended state shape
        const baseline = (typedGameState as any).reinforcementBaseline as
          | Record<string, number>
          | undefined
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
      } catch {
        // ignore placement spent reconciliation errors
      }
    })

    this.socket.on('lifecycle:update', (incoming) => {
      const payload = incoming as Parameters<ServerToClientEvents['lifecycle:update']>[0]

      if (!payload?.roomId || !payload?.status) {
        return
      }

      // drop local archiveConversation calls; we only prune archived later

      const previousRoom = store.getState().room.currentRoom
      if (
        previousRoom &&
        previousRoom.id === payload.roomId &&
        previousRoom.status === 'lobby' &&
        payload.status === 'active'
      ) {
        audioService.playEffect('gamestart')
        audioService.playMusic()
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
      store.dispatch(applyLifecycleUpdate(lifecyclePayload))

      // Lightweight notification for users not on the Game Room screen
      try {
        if (payload.status === 'active' && payload.roomId) {
          const key = `ui.gamestart.notified:${payload.roomId}`
          const alreadyNotified = (() => {
            try {
              return sessionStorage.getItem(key) === '1'
            } catch {
              return false
            }
          })()
          // Only notify if not currently viewing this room
          const onThisRoomScreen = (() => {
            try {
              const path = window.location?.pathname || ''
              return path.includes(`/room/${payload.roomId}`)
            } catch {
              return false
            }
          })()
          if (!alreadyNotified && !onThisRoomScreen) {
            notificationService.addNotification({
              type: 'game_started',
              title: 'Game started',
              message: 'Your game is live — jump in!',
              actionUrl: `/room/${payload.roomId}`,
              actionLabel: 'Open game',
              metadata: { gameId: payload.roomId },
            })
            try {
              sessionStorage.setItem(key, '1')
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        // best-effort only
      }

      // Proactively fetch game state when lifecycle transitions to active/initializing
      try {
        const state = store.getState()
        const loadedRoomId = state.game.currentGame?.roomId ?? null
        if (
          (payload.status === 'active' || payload.status === 'initializing') &&
          payload.roomId &&
          payload.roomId !== loadedRoomId
        ) {
          store.dispatch(fetchGameState({ roomId: payload.roomId }))
        }
      } catch {
        // best-effort prefetch; ignore errors in proactive flow
      }

      // When games end or are abandoned, prune any archived game/team conversations
      if (payload.status === 'completed' || payload.status === 'abandoned') {
        // Narrow kinds to keep DM/group threads intact
        const kinds: Array<import('../types/messages').ConversationSummary['kind']> = [
          'game',
          'team',
        ]
        store.dispatch(messagesActions.pruneArchivedConversations({ kinds }))
      }
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

      if (
        previousRoom &&
        previousRoom.id === (payload.id as string | undefined) &&
        previousRoom.status === 'lobby' &&
        status === 'active'
      ) {
        audioService.playEffect('gamestart')
        audioService.playMusic()
      }

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

      store.dispatch(applyLifecycleUpdate(lifecyclePayload))

      // Proactively fetch game state when we detect room status activation via room-update
      try {
        const state = store.getState()
        const loadedRoomId = state.game.currentGame?.roomId ?? null
        if (
          (status === 'active' || status === 'initializing') &&
          roomId &&
          roomId !== loadedRoomId
        ) {
          store.dispatch(fetchGameState({ roomId }))
        }
      } catch {
        /* ignore */
      }
      const roomUpdateBase: Partial<GameRoom> = {
        id: roomId,
        status,
        ...(lifecyclePayload.lifecyclePhase !== undefined
          ? { lifecyclePhase: lifecyclePayload.lifecyclePhase }
          : {}),
        ...(lifecyclePayload.turnNumber !== undefined
          ? { turnNumber: lifecyclePayload.turnNumber }
          : {}),
        ...(lifecyclePayload.currentTurnUserId !== undefined
          ? { currentTurnUserId: lifecyclePayload.currentTurnUserId ?? null }
          : {}),
        ...(lifecyclePayload.turnExpiresAt !== undefined
          ? { turnExpiresAt: lifecyclePayload.turnExpiresAt }
          : {}),
        ...(lifecyclePayload.readyCheckStartedAt !== undefined
          ? { readyCheckStartedAt: lifecyclePayload.readyCheckStartedAt }
          : {}),
        ...(lifecyclePayload.statusMessage !== undefined
          ? {
              statusMessage: lifecyclePayload.statusMessage ?? null,
              statusMessageLevel: lifecyclePayload.statusMessageLevel ?? 'info',
            }
          : {}),
        ...(lifecyclePayload.usingTimeBank !== undefined
          ? { usingTimeBank: lifecyclePayload.usingTimeBank }
          : {}),
        ...(lifecyclePayload.replacementPendingUserId !== undefined
          ? { replacementPendingUserId: lifecyclePayload.replacementPendingUserId }
          : {}),
      }

      // Important: do NOT overwrite players from 'room-update' unless the server explicitly
      // supplies a normalized players array. The lifecycle:update event already carries a
      // canonical players list and is handled above via applyLifecycleUpdate. Passing
      // players: undefined here would clear currentRoom.players, falsely dropping membership.
      const maybePlayers = (payload as { players?: unknown }).players
      const roomUpdate: Partial<GameRoom> = { ...roomUpdateBase }
      if (Array.isArray(maybePlayers)) {
        ;(roomUpdate as GameRoom).players = maybePlayers as NonNullable<GameRoom['players']>
      }

      store.dispatch(updateRoom(roomUpdate))

      // Lightweight notification for users not on the Game Room screen
      try {
        if (status === 'active' && roomId) {
          const key = `ui.gamestart.notified:${roomId}`
          const alreadyNotified = (() => {
            try {
              return sessionStorage.getItem(key) === '1'
            } catch {
              return false
            }
          })()
          const onThisRoomScreen = (() => {
            try {
              const path = window.location?.pathname || ''
              return path.includes(`/room/${roomId}`)
            } catch {
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
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        // best-effort only
      }
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
          ttlMs: 3000,
        }),
      )
    })

    // Legacy events fully retired; rely on game-delta and game-delta-batch only

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
      } catch {
        // ignore toast/log issues
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
    this.socket.off('game-delta')
    this.socket.off('game-update')
    this.socket.off('lifecycle:update')
    this.socket.off('room-update')
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
  }
}

export const socketService = new SocketService()
