export interface User {
  id: string
  username: string
  email: string
  password: string
  email_verified?: boolean
  verification_token?: string | null
  verification_sent_at?: Date | null
  is_admin?: boolean
  admin_level?: number
  admin_since?: Date
  skill_rating?: number
  skill_confidence?: number
  total_ranked_games?: number
  ranked_wins?: number
  ranked_losses?: number
  highest_skill_rating?: number
  current_tier?: 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Master' | 'Grandmaster'
  last_ranked_game_at?: Date | null
  createdAt: Date
  updatedAt: Date
}
