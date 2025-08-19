import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api'

const api = axios.create({
  baseURL: API_URL,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export interface GameRoom {
  id: string
  name: string
  hostId: string
  hostUsername?: string
  maxPlayers: number
  currentPlayers: number
  isPrivate: boolean
  status: 'waiting' | 'active' | 'completed'
  mapId?: string
  mapName?: string
  createdAt: string
  updatedAt: string
}

export interface CreateGameData {
  name: string
  maxPlayers: number
  isPrivate?: boolean
  mapId?: string
  movementType?: string
  allowTeamPlay?: boolean
  gameType?: string
}

export interface JoinGameResponse {
  success: boolean
  room: GameRoom
  message?: string
}

export const gameService = {
  async getRooms() {
    const response = await api.get('/game/rooms')
    return response.data
  },

  async createRoom(roomData: CreateGameData) {
    const response = await api.post('/game/rooms', roomData)
    return response.data
  },

  async joinRoom(roomId: string): Promise<JoinGameResponse> {
    const response = await api.post(`/game/rooms/${roomId}/join`)
    return response.data
  },

  async leaveRoom(roomId: string) {
    const response = await api.delete(`/game/rooms/${roomId}/leave`)
    return response.data
  },

  async getRoomDetails(roomId: string) {
    const response = await api.get(`/game/rooms/${roomId}`)
    return response.data
  },

  // Get user's active games (for GameListPage)
  async getUserGames() {
    const response = await api.get('/game/rooms')
    return response.data
  },

  // Get public games for lobby browsing
  async getPublicGames() {
    const response = await api.get('/game/rooms')
    // Filter for public games on frontend until backend supports filtering
    const rooms = response.data.rooms || []
    return {
      ...response.data,
      rooms: rooms.filter((room: GameRoom) => !room.isPrivate)
    }
  }
}