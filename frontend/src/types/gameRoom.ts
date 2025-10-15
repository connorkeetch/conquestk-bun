import type { TreasureConfig } from '@conquestk/shared'
import type { AIDifficulty, GamePhase } from './game'

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
  roomCode?: number
  name: string
  hostId: string
  hostUsername?: string
  maxPlayers: number
  isPrivate: boolean
  isRanked?: boolean
  status: GameLifecycleStatus
  createdAt: string
  expiresAt?: string
  updatedAt?: string
  // Optional lifecycle/status message from server (e.g., start errors)
  statusMessage?: string | null
  statusMessageLevel?: 'error' | 'info' | 'warn' | null
  mapId?: string | null
  gameMode?: string | null
  movementType?: 'classic_adjacent' | 'adjacent_multi' | 'path_single' | 'path_multi'
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
  // Configured time bank capacity for turns (seconds)
  timeBankSeconds?: number
  timeBankSecondsRemaining?: number | null
  usingTimeBank?: boolean
  replacementPendingUserId?: string | null
  allowTeamPlay?: boolean
  teamMode?: 'none' | 'teams' | 'auto_balance' | null
  numberOfTeams?: number | null
  turnTimerSeconds?: number
  fogOfWar?: 'off' | 'adjacent' | 'persistent'
  cardTradeMode?: string | null
  bonusType?: string | null
  treasureConfig?: TreasureConfig | null
  players?: Player[]
}

export interface Player {
  id: string
  userId?: string | null
  aiPlayerId?: string | null
  username: string
  joinedAt: string
  isReady?: boolean
  readyAt?: string | null
  skill_rating?: number
  current_tier?: string | null
  preferred_color?: string | null
  selected_color?: string | null
  // Normalized camelCase used by UI going forward
  selectedColor?: string | null
  teamId?: number | null
  isAi?: boolean
  aiDifficulty?: AIDifficulty | null
  aiPersonalitySeed?: number | null
  missedTurns?: number
  lastMissedTurnAt?: string | null
}
