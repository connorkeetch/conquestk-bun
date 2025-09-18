import type { Request } from 'express'
import type { ParamsDictionary } from 'express-serve-static-core'
import type { ParsedQs } from 'qs'

export interface RequestUser {
  id: string
  username?: string
  email?: string
  isAdmin?: boolean
  isVip?: boolean
  hasPremium?: boolean
  role?: string
  isBetaUser?: boolean
}

export type AuthenticatedRequest<
  P extends ParamsDictionary = ParamsDictionary,
  ResBody = any,
  ReqBody = any,
  ReqQuery extends ParsedQs = ParsedQs,
  Locals extends Record<string, any> = Record<string, any>,
> = Request<P, ResBody, ReqBody, ReqQuery, Locals> & {
  userId?: string
  user?: RequestUser
}
