import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { query } from '../config/database'
import type { RequestUser } from '../types/express'
import { getErrorMessage, toKnownError } from '../utils/errorHelpers'
import { logger } from '../utils/logger'

type AuthTokenPayload = jwt.JwtPayload & {
  userId: string
}

// Extend Request interface
declare module 'express-serve-static-core' {
  interface Request {
    userId: string
    user?: RequestUser
  }
}

export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const authHeader = req.headers.authorization
  const token = authHeader?.split(' ')[1]

  if (!token) {
    res.status(401).json({ message: 'Access token required' })
    return
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret')
    if (
      !decoded ||
      typeof decoded !== 'object' ||
      typeof (decoded as AuthTokenPayload).userId !== 'string'
    ) {
      logger.warn('Token verification succeeded but payload was invalid')
      res.status(403).json({ message: 'Invalid token payload' })
      return
    }

    const payload = decoded as AuthTokenPayload
    req.userId = payload.userId

    // Optionally fetch user details for req.user
    try {
      const result = await query(
        `SELECT id, username, email, is_admin, is_vip, premium_tier, is_beta_user
         FROM users WHERE id = $1`,
        [payload.userId],
      )

      if (result.rows[0]) {
        const userRow = result.rows[0] as {
          id: string
          username?: string | null
          email?: string | null
          is_admin?: boolean | null
          is_vip?: boolean | null
          premium_tier?: string | null
          is_beta_user?: boolean | null
        }

        const adminResult = await query(
          'SELECT COUNT(*) as count FROM user_admin_roles WHERE user_id = $1',
          [payload.userId],
        )
        const hasAdminRole = Number(adminResult.rows[0]?.count || 0) > 0

        const premiumTier = userRow.premium_tier || 'free'
        const requestUser: RequestUser = {
          id: userRow.id,
          username: userRow.username ?? undefined,
          email: userRow.email ?? undefined,
          isAdmin: hasAdminRole || Boolean(userRow.is_admin),
          isVip: Boolean(userRow.is_vip),
          isBetaUser: Boolean(userRow.is_beta_user),
          premiumTier,
          hasPremium: premiumTier !== 'free',
        }

        req.user = requestUser
      }
    } catch (dbError) {
      // Log but don't fail auth if database lookup fails
      logger.warn('Failed to fetch user details:', getErrorMessage(dbError))
    }

    next()
  } catch (error) {
    logger.error('Token verification failed:', toKnownError(error))
    res.status(403).json({ message: 'Invalid token' })
    return
  }
}
