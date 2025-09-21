import type { GamePhase } from './game'

export type GameLifecycleStatus =
  | 'lobby'
  | 'initializing'
  | 'active'
  | 'completed'
  | 'paused'
  | 'abandoned'

export type GameLifecyclePhase = GamePhase | 'lobby' | 'initializing'

export interface GameRoom {
  id: string
  name: string
  hostId: string
  hostUsername?: string
  maxPlayers: number
  isPrivate: boolean
  isRanked?: boolean
  status: GameLifecycleStatus
  createdAt: string
  updatedAt?: string
  mapId?: string | null
  gameMode?: string | null
  mapName?: string
  hostSkillRating?: number
  hostTier?: string | null
  currentPlayers?: number
  playerCount?: number
  gameStarted?: boolean
  lifecyclePhase?: GameLifecyclePhase
  turnNumber?: number
  currentTurnUserId?: string | null
  turnExpiresAt?: string | null
  readyCheckStartedAt?: string | null
  allowTeamPlay?: boolean
  teamMode?: 'none' | 'teams' | 'auto_balance' | null
  numberOfTeams?: number | null
  players?: Player[]
}

export interface Player {
  userId: string
  username: string
  joinedAt: string
  isReady?: boolean
  readyAt?: string | null
  skill_rating?: number
  current_tier?: string | null
  teamId?: number | null
}
