import type { GamePhase, KingOfTheHillConfig, MovementType, TreasureConfig } from './game.js'

export type GameLifecycleStatus =
  | 'lobby'
  | 'initializing'
  | 'active'
  | 'completed'
  | 'paused'
  | 'abandoned'

export interface GameRoom {
  id: string
  roomCode?: number
  name: string
  hostId: string
  maxPlayers: number
  isPrivate: boolean
  status: GameLifecycleStatus
  expiresAt?: Date
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
  // Canonical time bank remaining (seconds) for current turn user
  timeBankSecondsRemaining?: number | null
  // Configured time bank capacity for a turn (seconds)
  timeBankSeconds?: number
  // Whether the current player is in their time bank window
  usingTimeBank?: boolean
  // Replacement decision by host after kick
  replacementPendingUserId?: string | null
  winner?: string | null
  playerCount?: number
  turnTimerSeconds?: number
  fogOfWar?: 'off' | 'adjacent' | 'persistent'
  cardTradeMode?: string | null
  bonusType?: string | null
  treasureConfig?: TreasureConfig | null
  kingOfTheHillConfig?: KingOfTheHillConfig | null
  movementType?: MovementType
  players?: Player[]
}

export interface Player {
  id: string
  userId?: string | null
  aiPlayerId?: string | null
  username: string
  skill_rating?: number
  current_tier?: 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Master' | 'Grandmaster'
  preferred_color?: string
  selected_color?: string
  // Normalized camelCase added for clients
  selectedColor?: string
  joinedAt: Date
  isReady?: boolean
  readyAt?: Date | null
  teamId?: number | null
  isAi?: boolean
  aiDifficulty?: 'recruit' | 'commander' | 'grandmaster' | null
  aiPersonalitySeed?: number | null
  missedTurns?: number
  lastMissedTurnAt?: Date | null
}
