import type { GamePhase } from './game'

export type GameLifecycleStatus =
  | 'lobby'
  | 'initializing'
  | 'active'
  | 'completed'
  | 'paused'
  | 'abandoned'

export interface GameRoom {
  id: string
  name: string
  hostId: string
  maxPlayers: number
  isPrivate: boolean
  status: GameLifecycleStatus
  is_ranked?: boolean
  avg_skill_rating?: number
  skill_variance?: number
  min_skill_rating?: number
  max_skill_rating?: number
  skill_tier?: 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Master' | 'Grandmaster' | 'Mixed'
  createdAt: Date
  updatedAt?: Date
  mapId?: string | null
  gameMode?: string | null
  allowTeamPlay?: boolean
  teamMode?: 'none' | 'teams' | 'auto_balance' | null
  numberOfTeams?: number | null
  currentPlayers?: number
  hostUsername?: string
  hostSkillRating?: number
  hostTier?: string | null
  mapName?: string
  gameStarted?: boolean
  currentTurnUserId?: string | null
  lifecyclePhase?: GamePhase | 'lobby' | 'initializing'
  turnNumber?: number
  turnExpiresAt?: Date | null
  readyCheckStartedAt?: Date | null
  winner?: string | null
  playerCount?: number
  turnTimerSeconds?: number
  fogOfWar?: 'off' | 'adjacent' | 'persistent'
  cardTradeMode?: string | null
  bonusType?: string | null
  players?: Player[]
}

export interface Player {
  userId: string
  username: string
  skill_rating?: number
  current_tier?: 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Master' | 'Grandmaster'
  joinedAt: Date
  isReady?: boolean
  readyAt?: Date | null
  teamId?: number | null
  isAi?: boolean
  aiDifficulty?: 'recruit' | 'commander' | 'grandmaster' | null
  aiPersonalitySeed?: number | null
}
