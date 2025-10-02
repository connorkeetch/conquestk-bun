export interface User {
  id: string
  username: string
  email: string
  emailVerified?: boolean
  isAdmin?: boolean
  adminLevel?: number
}
