export interface User {
  id: string
  username: string
  email: string
  emailVerified?: boolean
  isAdmin?: boolean
  adminLevel?: number
  isPremium?: boolean
  isVip?: boolean
  premiumTier?: 'free' | 'premium' | 'pro' | 'enterprise'
}
