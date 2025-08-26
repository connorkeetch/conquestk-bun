export interface User {
  id: string
  username: string
  email: string
  password: string
  email_verified?: boolean
  verification_token?: string | null
  verification_sent_at?: Date | null
  is_admin?: boolean
  createdAt: Date
  updatedAt: Date
}
