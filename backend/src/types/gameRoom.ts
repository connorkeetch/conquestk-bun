export interface GameRoom {
  id: string
  name: string
  hostId: string
  maxPlayers: number
  isPrivate: boolean
  status: 'waiting' | 'in_progress' | 'finished' | 'active'
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
  teamMode?: boolean | string | null
  numberOfTeams?: number | null
  currentPlayers?: number
  hostUsername?: string
  hostSkillRating?: number
  hostTier?: string | null
  mapName?: string
  gameStarted?: boolean
  currentTurnUserId?: string | null
  winner?: string | null
  playerCount?: number
  players?: Player[]
}

export interface Player {
  userId: string
  username: string
  skill_rating?: number
  current_tier?: 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Master' | 'Grandmaster'
  joinedAt: Date
}
