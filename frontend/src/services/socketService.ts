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
  removePlayerFromRoom,
  updateRoom,
  applyLifecycleUpdate,
} from '../store/roomSlice'
import audioService from './audioService'
import { notificationService } from './notificationService'
import type { NotificationType } from '../types/notification'

class SocketService {
  private socket: Socket | null = null

  connect() {
    if (this.socket && this.socket.connected) {
      return
    }

    const token = localStorage.getItem('token')
    if (!token) return

    // Use relative URL in production, absolute URL in development
    const socketUrl =
      import.meta.env.VITE_SOCKET_URL ||
      (import.meta.env.MODE === 'production' ? '' : 'http://localhost:5001')

    this.socket = io(socketUrl, {
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

  sendGameAction(action: any) {
    this.socket?.emit('game-action', action)
  }

  // Game-specific emit methods
  emit(event: string, data: any) {
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
  sendChatMessage(data: any) {
    this.socket?.emit('chat:send', data)
  }

  loadChatHistory(data: any) {
    this.socket?.emit('chat:load-history', data)
  }

  markChatAsRead(data: any) {
    this.socket?.emit('chat:mark-read', data)
  }

  getChatUnreadCounts() {
    this.socket?.emit('chat:get-unread')
  }

  sendTypingIndicator(data: any) {
    this.socket?.emit('chat:typing', data)
  }

  // Generic on/off for chat events
  on(event: string, handler: any) {
    this.socket?.on(event, handler)
  }

  off(event: string, handler: any) {
    this.socket?.off(event, handler)
  }

  getSocket() {
    return this.socket
  }

  private setupEventListeners() {
    if (!this.socket) return

    this.socket.on('connect', () => {})

    this.socket.on('disconnect', () => {})

    this.socket.on('player-joined', (data) => {
      if (!data?.roomId || !data?.player) {
        return
      }

      store.dispatch(
        addPlayerToRoom({
          roomId: data.roomId,
          player: data.player,
        }),
      )
    })

    this.socket.on('player-left', (data) => {
      if (!data?.roomId || !data?.playerId) {
        return
      }

      store.dispatch(
        removePlayerFromRoom({
          roomId: data.roomId,
          playerId: data.playerId,
        }),
      )
    })

    // Delta update handler - efficient real-time updates
    this.socket.on('game-delta', (delta) => {
      const currentUserId = store.getState().auth.user?.id

      // Handle turn notifications for phase changes
      if (delta.type === 'PHASE_CHANGE' && delta.currentPlayer === currentUserId) {
        notificationService.addNotification({
          type: 'turn_reminder',
          title: "It's your turn!",
          message: `It's your turn - ${delta.phase} phase`,
          read: false,
          actionUrl: `/game/${delta.roomId}`,
          actionLabel: 'Go to game',
          metadata: {
            gameId: delta.roomId,
          },
        })
        audioService.playEffect('turn')
      }

      // Handle battle result audio
      if (delta.type === 'BATTLE_RESULT') {
        if (delta.battleResult.conquered) {
          audioService.playEffect('victory')
        } else {
          audioService.playEffect('defeat')
        }
      }

      // Apply delta to Redux store
      store.dispatch(applyDelta(delta))
    })

    // Legacy game-update handler - kept for backward compatibility during transition
    this.socket.on('game-update', (gameState) => {
      const previousState = store.getState().game.currentGame
      const currentUserId = store.getState().auth.user?.id

      // Check if it's now the current user's turn
      if (
        currentUserId &&
        previousState?.currentPlayer !== currentUserId &&
        gameState.currentPlayer === currentUserId &&
        gameState.phase !== 'ended'
      ) {
        // Add a turn reminder notification
        notificationService.addNotification({
          type: 'turn_reminder',
          title: "It's your turn!",
          message: `It's your turn in ${gameState.roomId || 'the game'}`,
          read: false,
          actionUrl: `/game/${gameState.roomId}`,
          actionLabel: 'Go to game',
          metadata: {
            gameId: gameState.roomId,
          },
        })

        // Play turn notification sound
        audioService.playEffect('turn')
      }

      store.dispatch(setGameState(gameState))
    })

    this.socket.on('lifecycle:update', (lifecycle) => {
      if (!lifecycle?.roomId || !lifecycle?.status) {
        return
      }

      const previousRoom = store.getState().room.currentRoom
      if (previousRoom?.id === lifecycle.roomId) {
        if (previousRoom.status === 'lobby' && lifecycle.status === 'active') {
          audioService.playEffect('gamestart')
          audioService.playMusic()
        }
      }

      store.dispatch(applyLifecycleUpdate(lifecycle))
    })

    this.socket.on('room-update', (roomData) => {
      if (!roomData) {
        return
      }

      const previousRoom = store.getState().room.currentRoom

      const status = (roomData.status ?? previousRoom?.status ?? 'lobby') as
        | 'lobby'
        | 'initializing'
        | 'active'
        | 'completed'
        | 'paused'
        | 'abandoned'

      if (previousRoom?.id === roomData.id) {
        if (previousRoom.status === 'lobby' && status === 'active') {
          audioService.playEffect('gamestart')
          audioService.playMusic()
        }
      }

      const lifecyclePayload = {
        roomId: roomData.id ?? roomData.roomId,
        status: status,
        lifecyclePhase: roomData.lifecyclePhase,
        turnNumber: roomData.turnNumber,
        currentTurnUserId: roomData.currentTurnUserId ?? null,
        turnExpiresAt: roomData.turnExpiresAt ?? null,
        readyCheckStartedAt: roomData.readyCheckStartedAt ?? null,
        players: roomData.players,
      }

      store.dispatch(applyLifecycleUpdate(lifecyclePayload))
      store.dispatch(
        updateRoom({
          id: lifecyclePayload.roomId,
          status: lifecyclePayload.status,
          lifecyclePhase: lifecyclePayload.lifecyclePhase,
          turnNumber: lifecyclePayload.turnNumber,
          currentTurnUserId: lifecyclePayload.currentTurnUserId,
          turnExpiresAt: lifecyclePayload.turnExpiresAt,
          readyCheckStartedAt: lifecyclePayload.readyCheckStartedAt,
          players: lifecyclePayload.players,
        }),
      )
    })

    // Game-specific event listeners
    this.socket.on('territoryUpdated', (data) => {
      store.dispatch(
        updateTerritory({
          territoryId: data.territoryId,
          armies: data.armies,
          ownerId: data.ownerId,
        }),
      )
    })

    this.socket.on('gamePhaseChanged', (data) => {
      const previousState = store.getState().game.currentGame
      const currentUserId = store.getState().auth.user?.id

      // Play phase transition sound
      audioService.playEffect('swoosh')

      // Check if it's now the current user's turn (player changed)
      if (
        currentUserId &&
        data.currentPlayer &&
        previousState?.currentPlayer !== currentUserId &&
        data.currentPlayer === currentUserId &&
        data.phase !== 'ended'
      ) {
        // Add a turn reminder notification
        const roomId = store.getState().room.currentRoom?.id
        notificationService.addNotification({
          type: 'turn_reminder',
          title: "It's your turn!",
          message: `It's your turn in the game - ${data.phase} phase`,
          read: false,
          actionUrl: roomId ? `/game/${roomId}` : '/play',
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
          phase: data.phase,
          currentPlayer: data.currentPlayer,
        }),
      )

      // Clear selections when phase changes
      store.dispatch(selectTerritory(null))
      store.dispatch(selectTargetTerritory(null))
      store.dispatch(setPendingAction(null))
    })

    this.socket.on('playerTurnChanged', (data) => {
      const currentUserId = store.getState().auth.user?.id

      // Play sound if it's now the current user's turn
      if (data.currentPlayer === currentUserId) {
        audioService.playEffect('turn')
      }

      store.dispatch(
        updateGameState({
          currentPlayer: data.currentPlayer,
          turn: data.turn,
        }),
      )

      // Clear selections when turn changes
      store.dispatch(selectTerritory(null))
      store.dispatch(selectTargetTerritory(null))
      store.dispatch(setPendingAction(null))
    })

    this.socket.on('armiesDeployed', (data) => {
      // Play troop placement sound
      audioService.playEffect('placetroop')

      store.dispatch(
        updateTerritory({
          territoryId: data.territoryId,
          armies: data.armies,
        }),
      )
    })

    this.socket.on('attackResult', (data) => {
      // Play dice sound for battle
      audioService.playEffect('dice')

      // Update both attacking and defending territories
      store.dispatch(
        updateTerritory({
          territoryId: data.fromTerritory.id,
          armies: data.fromTerritory.armies,
        }),
      )

      store.dispatch(
        updateTerritory({
          territoryId: data.toTerritory.id,
          armies: data.toTerritory.armies,
          ownerId: data.toTerritory.ownerId, // In case territory was conquered
        }),
      )

      // Play victory/defeat sound based on outcome
      const currentUserId = store.getState().auth.user?.id
      const attackerId = data.attackerId
      const conquered = data.conquered

      if (currentUserId === attackerId) {
        // Current user is attacking
        if (conquered) {
          audioService.playEffect('capture')
        } else if (data.attackerLosses < data.defenderLosses) {
          audioService.playEffect('victory')
        } else {
          audioService.playEffect('defeat')
        }
      } else if (currentUserId === data.defenderId) {
        // Current user is defending
        if (conquered) {
          audioService.playEffect('defeat')
        } else if (data.defenderLosses < data.attackerLosses) {
          audioService.playEffect('victory')
        } else {
          audioService.playEffect('defeat')
        }
      }

      // Show battle results
      store.dispatch(setBattleResult(data))

      // Clear target selection after attack
      store.dispatch(selectTargetTerritory(null))
    })

    this.socket.on('phaseChanged', (data) => {
      store.dispatch(
        updateGameState({
          phase: data.phase,
          currentPlayer: data.currentPlayer,
        }),
      )

      // Set reinforcement armies when entering reinforcement phase
      if (data.phase === 'reinforcement' && data.reinforcementArmies) {
        store.dispatch(setReinforcementArmies(data.reinforcementArmies))
      }

      // Clear selections when phase changes
      store.dispatch(selectTerritory(null))
      store.dispatch(selectTargetTerritory(null))
      store.dispatch(setPendingAction(null))
    })

    this.socket.on('territoriesFortified', (data) => {
      store.dispatch(
        updateTerritory({
          territoryId: data.fromTerritoryId,
          armies: data.fromArmies,
        }),
      )

      store.dispatch(
        updateTerritory({
          territoryId: data.toTerritoryId,
          armies: data.toArmies,
        }),
      )
    })

    // Capital-specific events
    this.socket.on('capitalAttackCheck', (data) => {
      // Store this result for when player clicks attack
      store.dispatch(
        updateGameState({
          pendingCapitalAttack: data.isCapital ? data.territoryId : null,
        }),
      )
    })

    this.socket.on('capitalElimination', (data) => {
      // Play dramatic fanfare for capital elimination
      audioService.playEffect('fanfare')
      audioService.playEffect('victory')

      // Show capital elimination notification
      store.dispatch(
        updateGameState({
          capitalElimination: {
            conqueror: data.conqueror,
            eliminated: data.eliminated,
            capitalTerritory: data.capitalTerritory,
            territoriesGained: data.territoriesGained,
            troopsGained: data.troopsGained,
          },
        }),
      )
    })

    this.socket.on('gameError', (error) => {
      // Play error sound
      audioService.playEffect('error')
      store.dispatch(setError(error.message))
    })

    this.socket.on('notification:new', (payload) => {
      notificationService.addNotification({
        id: payload.id,
        type: payload.type as NotificationType,
        title: payload.title,
        message: payload.message,
        read: payload.read ?? false,
        actionUrl: payload.actionUrl,
        actionLabel: payload.actionLabel,
        icon: payload.icon,
        metadata: payload.metadata as Record<string, unknown>,
        timestamp: new Date(payload.createdAt),
      })

      if (!(payload.read ?? false)) {
        const effect = payload.type === 'chat_message' ? 'message' : 'swoosh'
        audioService.playEffect(effect)
      }
    })

    this.socket.on('chat-message', (_data) => {})

    this.socket.on('error', (_error) => {
      // Play error sound for connection errors
      audioService.playEffect('error')
      store.dispatch(setError('Connection error'))
    })
  }
}

export const socketService = new SocketService()
