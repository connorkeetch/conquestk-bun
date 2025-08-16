export interface GameRoom {
  id: string
  name: string
  hostId: string
  maxPlayers: number
  isPrivate: boolean
  status: 'waiting' | 'in_progress' | 'finished'
  createdAt: string
  players?: Player[]
}

export interface Player {
  userId: string
  username: string
  joinedAt: string
}