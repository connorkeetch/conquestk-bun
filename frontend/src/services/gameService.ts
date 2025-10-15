import type { TreasureConfig } from '@conquestk/shared'
import axios, { type AxiosRequestConfig } from 'axios'
import type { AIDifficulty, GameState } from '../types/game'
import type { GameRoom } from '../types/gameRoom'

// Use relative URL in production, absolute URL in development
const API_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.MODE === 'production' ? '/api' : 'http://localhost:5001/api')

const api = axios.create({
  baseURL: API_URL,
})

// legacy RawGameLogResponse removed (deprecated /log route)

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Align 401 handling with global client: clear bad token and redirect to login
let redirectingOn401 = false
api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error?.response?.status
    if (status === 401) {
      const token = localStorage.getItem('token')
      if (token) localStorage.removeItem('token')
      const path = typeof window !== 'undefined' ? window.location.pathname : ''
      const isAuthRoute =
        path.startsWith('/login') ||
        path.startsWith('/register') ||
        path.startsWith('/forgot-password') ||
        path.startsWith('/reset-password')
      if (token && !isAuthRoute && !redirectingOn401) {
        redirectingOn401 = true
        window.location.assign('/login')
      }
    }
    return Promise.reject(error)
  },
)

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
  gameMode?: 'classic' | 'capitals' | 'king_of_the_hill'
  capitalsEnabled?: boolean
  useTerritoryModifiers?: boolean
  modifierDistribution?: 'none' | 'sparse' | 'balanced' | 'abundant'
  aiOpponents?: Array<{
    difficulty: AIDifficulty
    personalitySeed?: number | null
  }>
  // Optional Hidden Treasures configuration for the game
  treasureConfig?: Partial<TreasureConfig>
  // Optional King of the Hill configuration
  kingOfTheHillConfig?: {
    targetPoints: number
    neutralArmies: number
    previewTurns: number
    rotationInterval: number | null
    eligibleTerritoryIds: string[]
    rotationOrder: string[]
  }
  // Additional room options persisted to DB
  fogOfWar?: 'off' | 'adjacent' | 'persistent'
  turnTimerSeconds?: number
  timeBankSeconds?: number
  // Host-selected color to use when auto-joining the newly created room
  selectedColor?: string
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

  async closeRoom(roomId: string) {
    const response = await api.post(`/game/rooms/${roomId}/close`)
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
  // Legacy getGameLog (/log) removed; use getGameTextLog instead.

  async getGameTextLog(
    roomId: string,
    options?: { signal?: AbortSignal; limit?: number; before?: string },
  ): Promise<{ log: Array<{ id: string; t: string; kind: string; text: string }> }> {
    const params: Record<string, string> = {}
    if (options?.limit && Number.isFinite(options.limit)) params.limit = String(options.limit)
    if (options?.before) params.before = options.before
    const cfg: AxiosRequestConfig | undefined = {
      ...(options?.signal ? { signal: options.signal } : {}),
      ...(Object.keys(params).length > 0 ? { params } : {}),
    }
    const response = await api.get(`/game/rooms/${roomId}/log-text`, cfg)
    const raw = (response.data ?? {}) as { log?: unknown[] }
    const log = Array.isArray(raw.log)
      ? (raw.log as Array<{ id: string; t: string; kind: string; text: string }>)
      : []
    return { log }
  },

  // Replay endpoints for post-game insights
  async getReplaySummary(gameId: string): Promise<{
    rounds: number
    turns: number
    players: Array<{ id: string; username: string; color?: string }>
    hasFog: boolean
    mode: string
    options: Record<string, unknown>
    createdAt: string | null
    completedAt: string | null
  }> {
    const response = await api.get(`/games/${gameId}/replay/summary`)
    return response.data
  },

  async getReplayChunk(
    gameId: string,
    fromTurn: number,
    toTurn: number,
  ): Promise<{ items: Array<Record<string, unknown>> }> {
    const params = { fromTurn: String(fromTurn), toTurn: String(toTurn) }
    const response = await api.get(`/games/${gameId}/replay/chunk`, { params })
    return response.data as { items: Array<Record<string, unknown>> }
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
