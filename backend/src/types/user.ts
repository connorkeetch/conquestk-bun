export interface User {
  id: string
  username: string
  email: string
  password_hash: string
  email_verified?: boolean
  verification_token?: string | null
  // verification_sent_at?: Date | null // Column doesn't exist in current schema
  is_admin?: boolean
  // admin_since?: Date // Column doesn't exist in current schema
  skill_rating?: number
  skill_confidence?: number
  total_ranked_games?: number
  ranked_wins?: number
  ranked_losses?: number
  highest_skill_rating?: number
  // current_tier?: 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Master' | 'Grandmaster' // Column doesn't exist in current schema
  last_ranked_game_at?: Date | null
  createdAt: Date
  updatedAt: Date
}
