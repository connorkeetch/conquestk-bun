import { io, Socket } from 'socket.io-client'
import { store } from '../store'
import { 
  setGameState, 
  updateGameState, 
  updateTerritory, 
  selectTerritory,
  selectTargetTerritory,
  setPendingAction,
  setBattleResult,
  setReinforcementArmies,
  setError 
} from '../store/gameSlice'
import { addPlayerToRoom, removePlayerFromRoom, updateRoom } from '../store/roomSlice'

class SocketService {
  private socket: Socket | null = null

  connect() {
    const token = localStorage.getItem('token')
    if (!token) return

    this.socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000', {
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

  sendChatMessage(roomId: string, message: string) {
    this.socket?.emit('chat-message', { roomId, message })
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

  fortify(roomId: string, fromTerritoryId: string, toTerritoryId: string, armies: number) {
    this.socket?.emit('fortify', { roomId, fromTerritoryId, toTerritoryId, armies })
  }

  endTurn(roomId: string) {
    this.socket?.emit('endTurn', { roomId })
  }

  private setupEventListeners() {
    if (!this.socket) return

    this.socket.on('connect', () => {
      console.log('Connected to server')
    })

    this.socket.on('disconnect', () => {
      console.log('Disconnected from server')
    })

    this.socket.on('player-joined', (data) => {
      store.dispatch(addPlayerToRoom({
        roomId: data.roomId,
        player: data.player,
      }))
    })

    this.socket.on('player-left', (data) => {
      store.dispatch(removePlayerFromRoom({
        roomId: data.roomId,
        playerId: data.userId,
      }))
    })

    this.socket.on('game-update', (gameState) => {
      store.dispatch(setGameState(gameState))
    })

    this.socket.on('room-update', (roomData) => {
      store.dispatch(updateRoom(roomData))
    })

    // Game-specific event listeners
    this.socket.on('territoryUpdated', (data) => {
      store.dispatch(updateTerritory({
        territoryId: data.territoryId,
        armies: data.armies,
        ownerId: data.ownerId
      }))
    })

    this.socket.on('gamePhaseChanged', (data) => {
      store.dispatch(updateGameState({
        phase: data.phase,
        currentPlayer: data.currentPlayer
      }))
      
      // Clear selections when phase changes
      store.dispatch(selectTerritory(null))
      store.dispatch(selectTargetTerritory(null))
      store.dispatch(setPendingAction(null))
    })

    this.socket.on('playerTurnChanged', (data) => {
      store.dispatch(updateGameState({
        currentPlayer: data.currentPlayer,
        turn: data.turn
      }))
      
      // Clear selections when turn changes
      store.dispatch(selectTerritory(null))
      store.dispatch(selectTargetTerritory(null))
      store.dispatch(setPendingAction(null))
    })

    this.socket.on('armiesDeployed', (data) => {
      store.dispatch(updateTerritory({
        territoryId: data.territoryId,
        armies: data.armies
      }))
    })

    this.socket.on('attackResult', (data) => {
      // Update both attacking and defending territories
      store.dispatch(updateTerritory({
        territoryId: data.fromTerritory.id,
        armies: data.fromTerritory.armies
      }))
      
      store.dispatch(updateTerritory({
        territoryId: data.toTerritory.id,
        armies: data.toTerritory.armies,
        ownerId: data.toTerritory.ownerId // In case territory was conquered
      }))

      // Show battle results
      store.dispatch(setBattleResult(data))

      // Clear target selection after attack
      store.dispatch(selectTargetTerritory(null))
    })

    this.socket.on('phaseChanged', (data) => {
      store.dispatch(updateGameState({
        phase: data.phase,
        currentPlayer: data.currentPlayer
      }))
      
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
      store.dispatch(updateTerritory({
        territoryId: data.fromTerritoryId,
        armies: data.fromArmies
      }))
      
      store.dispatch(updateTerritory({
        territoryId: data.toTerritoryId,
        armies: data.toArmies
      }))
    })

    this.socket.on('gameError', (error) => {
      store.dispatch(setError(error.message))
      console.error('Game error:', error)
    })

    this.socket.on('chat-message', (data) => {
      // Handle chat messages
      console.log('Chat message:', data)
    })

    this.socket.on('error', (error) => {
      console.error('Socket error:', error)
      store.dispatch(setError('Connection error'))
    })
  }
}

export const socketService = new SocketService()