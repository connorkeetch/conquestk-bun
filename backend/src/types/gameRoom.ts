export interface GameRoom {
  id: string
  name: string
  hostId: string
  maxPlayers: number
  isPrivate: boolean
  status: 'waiting' | 'in_progress' | 'finished'
  is_ranked?: boolean
  avg_skill_rating?: number
  skill_variance?: number
  min_skill_rating?: number
  max_skill_rating?: number
  skill_tier?: 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Master' | 'Grandmaster' | 'Mixed'
  createdAt: Date
  players?: Player[]
}

export interface Player {
  userId: string
  username: string
  skill_rating?: number
  current_tier?: 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Master' | 'Grandmaster'
  joinedAt: Date
}
