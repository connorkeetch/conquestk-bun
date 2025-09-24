import type { ClientToServerEvents, ServerToClientEvents } from '@shared/types'
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

type RoomLifecyclePayload = Parameters<typeof applyLifecycleUpdate>[0]

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

    this.socket = io<ServerToClientEvents, ClientToServerEvents>(socketUrl, {
      auth: {
        token,
      },
    })

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

  // Game-specific emit methods
  emit(event: string, data: unknown) {
    this.socket?.emit(event, data)
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

  // Chat methods
  sendChatMessage(data: Parameters<ClientToServerEvents['chat:send']>[0]) {
    this.socket?.emit('chat:send', data)
  }

  loadChatHistory(data: Parameters<ClientToServerEvents['chat:load-history']>[0]) {
    this.socket?.emit('chat:load-history', data)
  }

  markChatAsRead(data: Parameters<ClientToServerEvents['chat:mark-read']>[0]) {
    this.socket?.emit('chat:mark-read', data)
  }

  getChatUnreadCounts() {
    this.socket?.emit('chat:get-unread')
  }

  sendTypingIndicator(data: Parameters<ClientToServerEvents['chat:typing']>[0]) {
    this.socket?.emit('chat:typing', data)
  }

  // Generic on/off for chat events
  on<T extends keyof ServerToClientEvents>(event: T, handler: ServerToClientEvents[T]) {
    this.socket?.on(event, handler)
  }

  off<T extends keyof ServerToClientEvents>(event: T, handler: ServerToClientEvents[T]) {
    this.socket?.off(event, handler)
  }

  getSocket() {
    return this.socket
  }

  private setupEventListeners() {
    if (!this.socket) return

    this.socket.on('connect', () => {
      // connection established
    })

    this.socket.on('disconnect', () => {
      // connection closed
    })

    this.socket.on('player-joined', (data) => {
      const payload = data as Parameters<ServerToClientEvents['player-joined']>[0]

      if (!payload?.roomId || !payload?.player) {
        return
      }

      store.dispatch(
        addPlayerToRoom({
          roomId: payload.roomId,
          player: payload.player,
        }),
      )
    })

    this.socket.on('player-left', (data) => {
      const payload = data as Parameters<ServerToClientEvents['player-left']>[0]

      if (!payload?.roomId || !payload?.playerId) {
        return
      }

      store.dispatch(
        removePlayerFromRoom({
          roomId: payload.roomId,
          playerId: payload.playerId,
        }),
      )
    })

    // Delta update handler - efficient real-time updates
    this.socket.on('game-delta', (delta) => {
      const payload = delta as GameDelta
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

    this.socket.on('lifecycle:update', (lifecycle) => {
      const payload = lifecycle as Parameters<ServerToClientEvents['lifecycle:update']>[0]

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

      store.dispatch(applyLifecycleUpdate(payload))
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
        players: Array.isArray(payload.players) ? (payload.players as RoomPlayer[]) : undefined,
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

    // Game-specific event listeners
    this.socket.on('territoryUpdated', (data: unknown) => {
      const payload = data as { territoryId?: string; armies?: number; ownerId?: string }
      if (!payload?.territoryId) {
        return
      }

      store.dispatch(
        updateTerritory({
          territoryId: payload.territoryId,
          armies: payload.armies,
          ownerId: payload.ownerId,
        }),
      )
    })

    this.socket.on('gamePhaseChanged', (data: unknown) => {
      const payload = data as {
        roomId?: string
        phase?: GameState['phase']
        currentPlayer?: string
        reinforcementArmies?: number
      }

      const previousState = store.getState().game.currentGame
      const currentUserId = store.getState().auth.user?.id

      // Play phase transition sound
      audioService.playEffect('swoosh')

      // Check if it's now the current user's turn (player changed)
      if (
        currentUserId &&
        payload.currentPlayer &&
        previousState?.currentPlayer !== currentUserId &&
        payload.currentPlayer === currentUserId &&
        payload.phase !== 'finished'
      ) {
        // Add a turn reminder notification
        const roomId = store.getState().room.currentRoom?.id
        notificationService.addNotification({
          type: 'turn_reminder',
          title: "It's your turn!",
          message: `It's your turn in the game - ${payload.phase} phase`,
          read: false,
          actionUrl: roomId ? `/game/${roomId}` : '/lobby',
          actionLabel: 'Go to game',
          metadata: {
            gameId: roomId,
          },
        })

        // Play turn notification sound
        audioService.playEffect('turn')
      }

      store.dispatch(
        updateGameState({
          phase: payload.phase ?? previousState?.phase ?? 'reinforcement',
          currentPlayer: payload.currentPlayer ?? previousState?.currentPlayer ?? '',
        }),
      )

      // Clear selections when phase changes
      store.dispatch(selectTerritory(null))
      store.dispatch(selectTargetTerritory(null))
      store.dispatch(setPendingAction(null))
    })

    this.socket.on('playerTurnChanged', (data: unknown) => {
      const payload = data as { currentPlayer?: string; turn?: number }
      const currentUserId = store.getState().auth.user?.id

      // Play sound if it's now the current user's turn
      if (payload.currentPlayer && payload.currentPlayer === currentUserId) {
        audioService.playEffect('turn')
      }

      store.dispatch(
        updateGameState({
          currentPlayer:
            payload.currentPlayer ?? store.getState().game.currentGame?.currentPlayer ?? '',
          turn: payload.turn ?? store.getState().game.currentGame?.turn ?? 0,
        }),
      )

      // Clear selections when turn changes
      store.dispatch(selectTerritory(null))
      store.dispatch(selectTargetTerritory(null))
      store.dispatch(setPendingAction(null))
    })

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

    this.socket.on('chat-message', (_data) => {
      // chat message handled elsewhere via dedicated listeners
    })

    this.socket.on('error', (_error) => {
      // Play error sound for connection errors
      audioService.playEffect('error')
      store.dispatch(setError('Connection error'))
    })
  }
}

export const socketService = new SocketService()
