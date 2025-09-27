import type {
  ClientToServerEvents,
  ConversationCreateAck,
  ConversationCreatePayload,
  ConversationMembersUpdateAck,
  ConversationMembersUpdatePayload,
  GameDelta,
  MessageSendAck,
  MessageSendPayload,
  ReceiptReadAck,
  ServerToClientEvents,
} from '@shared/types'
import { io, type Socket } from 'socket.io-client'
import { store } from '../store'
import {
  applyDelta,
  selectTargetTerritory,
  selectTerritory,
  setBattleResult,
  setError,
  setGameState,
  setPendingAction,
  setReinforcementArmies,
  updateGameState,
  updateTerritory,
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
import type { BattleResult, GameState } from '../types/game'
import type { GameRoom, Player as RoomPlayer } from '../types/gameRoom'
import type { NotificationType } from '../types/notification'
import audioService from './audioService'
import { notificationService } from './notificationService'

type RoomLifecyclePayload = LifecycleUpdatePayload

class SocketService {
  private socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null

  connect() {
    if (this.socket?.connected) {
      return
    }

    const token = localStorage.getItem('token')
    if (!token) return

    // Use relative URL in production, absolute URL in development
    const socketUrl =
      import.meta.env.VITE_SOCKET_URL ||
      (import.meta.env.MODE === 'production' ? '' : 'http://localhost:5001')

    // Cast to typed Socket to enable strong event typing without generics on io()
    this.socket = io(socketUrl, {
      auth: {
        token,
      },
    }) as unknown as Socket<ServerToClientEvents, ClientToServerEvents>

    this.setupEventListeners()
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }
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

  deployArmies(roomId: string, territoryId: string, armies: number) {
    this.socket?.emit('deployArmies', { roomId, territoryId, armies })
  }

  attack(roomId: string, fromTerritoryId: string, toTerritoryId: string) {
    this.socket?.emit('attack', { roomId, fromTerritoryId, toTerritoryId })
  }

  checkCapitalAttack(roomId: string, targetTerritoryId: string) {
    this.socket?.emit('checkCapitalAttack', { roomId, targetTerritoryId })
  }

  fortify(roomId: string, fromTerritoryId: string, toTerritoryId: string, armies: number) {
    this.socket?.emit('fortify', { roomId, fromTerritoryId, toTerritoryId, armies })
  }

  endTurn(roomId: string) {
    this.socket?.emit('endTurn', { roomId })
  }

  sendConversationMessage(payload: MessageSendPayload, callback?: (ack: MessageSendAck) => void) {
    this.socket?.emit('message.send', payload, callback)
  }

  markConversationReadViaSocket(conversationId: string, callback?: (ack: ReceiptReadAck) => void) {
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
  leaveConversation(conversationId: string, callback?: (ack: ConversationMembersUpdateAck) => void) {
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
      store.dispatch(loadUnreadSummary())
      store.dispatch(loadInbox())
    })

    this.socket.on('disconnect', () => {
      // connection closed
    })

    this.socket.on('player-joined', (data) => {
      const payload = data as Parameters<ServerToClientEvents['player-joined']>[0]

      if (!payload?.roomId || !payload?.player) {
        return
      }

      const normalizedPlayer: RoomPlayer = {
        id: payload.player.id,
        userId: payload.player.userId ?? undefined,
        aiPlayerId: payload.player.aiPlayerId ?? undefined,
        username: payload.player.username,
        joinedAt: payload.player.joinedAt,
        isReady: payload.player.isReady,
        readyAt: payload.player.readyAt,
        teamId:
          payload.player.teamId === null
            ? null
            : payload.player.teamId === undefined
              ? undefined
              : payload.player.teamId,
        isAi: payload.player.isAi,
        aiDifficulty: payload.player.aiDifficulty ?? undefined,
        aiPersonalitySeed:
          payload.player.aiPersonalitySeed === null ||
          payload.player.aiPersonalitySeed === undefined
            ? (payload.player.aiPersonalitySeed ?? undefined)
            : payload.player.aiPersonalitySeed,
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
          userId: payload.userId ?? undefined,
          aiPlayerId: payload.aiPlayerId ?? undefined,
        }),
      )
    })

    // Delta update handler - efficient real-time updates
    this.socket.on('game-delta', (delta) => {
      const payload = delta as unknown as GameDelta
      const currentUserId = store.getState().auth.user?.id

      // Handle turn notifications for phase changes
      if (payload.type === 'PHASE_CHANGE' && payload.currentPlayer === currentUserId) {
        notificationService.addNotification({
          type: 'turn_reminder',
          title: "It's your turn!",
          message: `It's your turn - ${payload.phase} phase`,
          read: false,
          actionUrl: `/game/${payload.roomId}`,
          actionLabel: 'Go to game',
          metadata: {
            gameId: payload.roomId,
          },
        })
        audioService.playEffect('turn')
      }

      // Handle battle result audio
      if (payload.type === 'BATTLE_RESULT') {
        if (payload.battleResult.conquered) {
          audioService.playEffect('victory')
        } else {
          audioService.playEffect('defeat')
        }
      }

      // Apply delta to Redux store
      store.dispatch(applyDelta(payload))
    })

    // Legacy game-update handler - kept for backward compatibility during transition
    this.socket.on('game-update', (gameState) => {
      const typedGameState = gameState as GameState
      const previousState = store.getState().game.currentGame
      const currentUserId = store.getState().auth.user?.id

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
          actionUrl: `/game/${typedGameState.roomId}`,
          actionLabel: 'Go to game',
          metadata: {
            gameId: typedGameState.roomId,
          },
        })

        // Play turn notification sound
        audioService.playEffect('turn')
      }

      store.dispatch(setGameState(typedGameState))
    })

    this.socket.on('lifecycle:update', (incoming) => {
      const payload = incoming as Parameters<ServerToClientEvents['lifecycle:update']>[0]

      if (!payload?.roomId || !payload?.status) {
        return
      }

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
        lifecyclePhase: payload.lifecyclePhase,
        turnNumber: payload.turnNumber,
        currentTurnUserId: payload.currentTurnUserId,
        turnExpiresAt: payload.turnExpiresAt,
        readyCheckStartedAt: payload.readyCheckStartedAt,
        readyStates: payload.readyStates,
      }
      store.dispatch(applyLifecycleUpdate(lifecyclePayload))

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

      const lifecyclePayload: RoomLifecyclePayload = {
        roomId,
        status,
        lifecyclePhase: payload.lifecyclePhase as GameRoom['lifecyclePhase'] | undefined,
        turnNumber: typeof payload.turnNumber === 'number' ? payload.turnNumber : undefined,
        currentTurnUserId:
          typeof payload.currentTurnUserId === 'string'
            ? payload.currentTurnUserId
            : payload.currentTurnUserId === null
              ? null
              : undefined,
        turnExpiresAt: typeof payload.turnExpiresAt === 'string' ? payload.turnExpiresAt : null,
        readyCheckStartedAt:
          typeof payload.readyCheckStartedAt === 'string' ? payload.readyCheckStartedAt : null,
        // 'players' omitted: room-update payload may not match RoomPlayer shape
      }

      store.dispatch(applyLifecycleUpdate(lifecyclePayload))
      const roomUpdate: Partial<GameRoom> = {
        id: roomId,
        status,
        lifecyclePhase: lifecyclePayload.lifecyclePhase,
        turnNumber: lifecyclePayload.turnNumber,
        currentTurnUserId: lifecyclePayload.currentTurnUserId ?? undefined,
        turnExpiresAt: lifecyclePayload.turnExpiresAt ?? undefined,
        readyCheckStartedAt: lifecyclePayload.readyCheckStartedAt ?? undefined,
        players: lifecyclePayload.players,
      }

      store.dispatch(updateRoom(roomUpdate))
    })

    // Game-specific legacy events removed in favor of game-delta and phaseChanged

    this.socket.on('armiesDeployed', (data: unknown) => {
      const payload = data as { territoryId?: string; armies?: number }
      // Play troop placement sound
      audioService.playEffect('placetroop')

      if (payload.territoryId) {
        store.dispatch(
          updateTerritory({
            territoryId: payload.territoryId,
            armies: payload.armies,
          }),
        )
      }
    })

    this.socket.on('attackResult', (data: unknown) => {
      const payload = data as Record<string, unknown>
      const fromTerritory = payload.fromTerritory as { id: string; armies: number }
      const toTerritory = payload.toTerritory as { id: string; armies: number; ownerId?: string }
      const attackerLosses = Number(payload.attackerLosses ?? 0)
      const defenderLosses = Number(payload.defenderLosses ?? 0)
      const attackerDice = (payload.attackerDice as number[]) ?? []
      const defenderDice = (payload.defenderDice as number[]) ?? []
      const conquered = Boolean(payload.conquered)

      // Play dice sound for battle
      audioService.playEffect('dice')

      // Update both attacking and defending territories
      store.dispatch(
        updateTerritory({
          territoryId: fromTerritory.id,
          armies: fromTerritory.armies,
        }),
      )

      store.dispatch(
        updateTerritory({
          territoryId: toTerritory.id,
          armies: toTerritory.armies,
          ownerId: toTerritory.ownerId,
        }),
      )

      // Play victory/defeat sound based on outcome
      const currentUserId = store.getState().auth.user?.id
      const attackerId = payload.attackerId as string | undefined
      const defenderId = payload.defenderId as string | undefined

      if (currentUserId === attackerId) {
        // Current user is attacking
        if (conquered) {
          audioService.playEffect('capture')
        } else if (attackerLosses < defenderLosses) {
          audioService.playEffect('victory')
        } else {
          audioService.playEffect('defeat')
        }
      } else if (currentUserId === defenderId) {
        // Current user is defending
        if (conquered) {
          audioService.playEffect('defeat')
        } else if (defenderLosses < attackerLosses) {
          audioService.playEffect('victory')
        } else {
          audioService.playEffect('defeat')
        }
      }

      const battleResult: BattleResult = {
        attackerDice,
        defenderDice,
        attackerLosses,
        defenderLosses,
        conquered,
        fromTerritory: fromTerritory.id,
        toTerritory: toTerritory.id,
        capitalElimination: payload.capitalElimination as BattleResult['capitalElimination'],
        gameEnded: payload.gameEnded as boolean | undefined,
        gameState: payload.gameState as GameState | undefined,
      }

      // Show battle results
      store.dispatch(setBattleResult(battleResult))

      // Clear target selection after attack
      store.dispatch(selectTargetTerritory(null))
    })

    this.socket.on('phaseChanged', (data: unknown) => {
      const payload = data as Parameters<ServerToClientEvents['phaseChanged']>[0]
      store.dispatch(
        updateGameState({
          phase: payload.phase,
          currentPlayer: payload.currentPlayer,
        }),
      )

      // Set reinforcement armies when entering reinforcement phase
      if (payload.phase === 'reinforcement' && payload.reinforcementArmies) {
        store.dispatch(setReinforcementArmies(payload.reinforcementArmies))
      }

      // Clear selections when phase changes
      store.dispatch(selectTerritory(null))
      store.dispatch(selectTargetTerritory(null))
      store.dispatch(setPendingAction(null))
    })

    this.socket.on('territoriesFortified', (data: unknown) => {
      const payload = data as Parameters<ServerToClientEvents['territoriesFortified']>[0]
      const from = (payload as { fromTerritoryId?: string; fromArmies?: number }) ?? {}
      const to = (payload as { toTerritoryId?: string; toArmies?: number }) ?? {}

      if (from.fromTerritoryId) {
        store.dispatch(
          updateTerritory({ territoryId: from.fromTerritoryId, armies: from.fromArmies }),
        )
      }

      if (to.toTerritoryId) {
        store.dispatch(updateTerritory({ territoryId: to.toTerritoryId, armies: to.toArmies }))
      }
    })

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
    })

    this.socket.on('notification:new', (payload: unknown) => {
      const data = payload as Parameters<ServerToClientEvents['notification:new']>[0]
      notificationService.addNotification({
        id: data.id,
        type: data.type as NotificationType,
        title: data.title,
        message: data.message,
        read: data.read ?? false,
        actionUrl: data.actionUrl,
        actionLabel: data.actionLabel,
        icon: data.icon,
        metadata: data.metadata as Record<string, unknown>,
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

      store.dispatch(messagesActions.messageReceived({ message: data, currentUserId }))

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
      store.dispatch(messagesActions.receiptReadReceived({ payload: data, currentUserId }))
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
}

export const socketService = new SocketService()
