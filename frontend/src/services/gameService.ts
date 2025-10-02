import type { TreasureConfig } from '@shared/types'
import axios from 'axios'
import type { AIDifficulty, GameState } from '../types/game'
import type { GameRoom } from '../types/gameRoom'

// Use relative URL in production, absolute URL in development
const API_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.MODE === 'production' ? '/api' : 'http://localhost:5001/api')

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

export interface CreateGameData {
  name: string
  maxPlayers: number
  isPrivate?: boolean
  isRanked?: boolean
  mapId?: string
  movementType?: string
  allowTeamPlay?: boolean
  teamMode?: 'none' | 'teams' | 'auto_balance'
  numberOfTeams?: number
  gameType?: string
  capitalsEnabled?: boolean
  useTerritoryModifiers?: boolean
  modifierDistribution?: 'none' | 'sparse' | 'balanced' | 'abundant'
  aiOpponents?: Array<{
    difficulty: AIDifficulty
    personalitySeed?: number | null
  }>
  // Optional Hidden Treasures configuration for the game
  treasureConfig?: Partial<TreasureConfig>
  // Additional room options persisted to DB
  fogOfWar?: 'off' | 'adjacent' | 'persistent'
  turnTimerSeconds?: number
  timeBankSeconds?: number
}

export interface JoinGameResponse {
  success: boolean
  room?: GameRoom
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

  async joinRoom(roomId: string, selectedColor?: string): Promise<JoinGameResponse> {
    const response = await api.post(
      `/game/rooms/${roomId}/join`,
      selectedColor ? { selectedColor } : undefined,
    )
    return response.data
  },

  async leaveRoom(roomId: string) {
    const response = await api.delete(`/game/rooms/${roomId}/leave`)
    return response.data
  },

  async assignPlayerTeam(roomId: string, playerSlotId: string, teamId: number | null) {
    const response = await api.post(`/game/rooms/${roomId}/team-assignments`, {
      playerSlotId,
      teamId,
    })
    return response.data
  },

  async updateAiOpponents(
    roomId: string,
    aiOpponents: Array<{ difficulty: AIDifficulty; personalitySeed?: number | null }>,
  ) {
    const response = await api.put(`/game/rooms/${roomId}/ai-opponents`, {
      aiOpponents,
    })
    return response.data
  },

  async getRoomDetails(roomId: string): Promise<{ room: GameRoom }> {
    const response = await api.get<{ room: GameRoom }>(`/game/rooms/${roomId}`)
    return response.data
  },

  async getGameState(roomId: string, options?: { allowSpectate?: boolean }): Promise<GameState> {
    const params = options?.allowSpectate ? { spectate: 'true' } : undefined
    const response = await api.get<{ game: GameState }>(`/game/rooms/${roomId}/state`, { params })
    return response.data.game
  },
  async getGameLog(
    roomId: string,
  ): Promise<{ log: Array<Record<string, unknown>>; stats?: Array<Record<string, unknown>> }> {
    const response = await api.get<{
      log: Array<Record<string, unknown>>
      stats?: Array<Record<string, unknown>>
    }>(`/game/rooms/${roomId}/log`)
    return {
      log: Array.isArray(response.data?.log) ? response.data.log : [],
      stats: Array.isArray(response.data?.stats) ? response.data.stats : undefined,
    }
  },

  // Get user's active games (for GameListPage)
  async getUserGames() {
    const response = await api.get('/game/my-games')
    return response.data
  },

  // Get public games for lobby browsing
  async getPublicGames() {
    const response = await api.get('/game/rooms')
    // Filter for public games on frontend until backend supports filtering
    const rooms = response.data.rooms || []
    return {
      ...response.data,
      rooms: rooms.filter((room: GameRoom) => !room.isPrivate),
    }
  },

  async setReadyState(roomId: string, ready: boolean) {
    const response = await api.post(`/game/rooms/${roomId}/ready-state`, { ready })
    return response.data
  },
}
